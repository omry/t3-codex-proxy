import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { SseRewrite } from '../src/framing.mjs';
import { startMcpProxy } from '../src/mcp-proxy.mjs';
import { createPolicy, WORKFLOW_WAITING_NEXT } from '../src/policy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-wait-conflicts.json', import.meta.url)));
const originalNext = fixture.tools[0].outputSchema.properties.next.const;
const task = { taskId: 'task-1', childThreadId: 'child-1', status: 'running', waitTimedOut: true,
  hasPendingChildRuns: true, summary: originalNext, next: originalNext };

async function hasSseReplayCursor(chunks) {
  const rewrite = new SseRewrite(message => message);
  for await (const _chunk of Readable.from(chunks.map(chunk => Buffer.from(chunk))).pipe(rewrite)) {}
  return rewrite.hasReplayCursor;
}

async function setup(t, { version = '0.1.3', overrides, transport = 'json', result, tool = 'task_status' } = {}) {
  const policy = createPolicy(version, () => {}, overrides);
  const value = result ?? { content: [{ type: 'text', text: JSON.stringify(task) }], structuredContent: task };
  const reply = { jsonrpc: '2.0', id: 1, result: value };
  const original = JSON.stringify(reply, null, 2);
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    const currentReply = { ...reply, id: request?.id ?? reply.id };
    if (transport === 'get' && req.method === 'POST') { res.writeHead(202); return res.end(); }
    if (transport === 'sse-no-id') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(': heartbeat\r');
      res.write('\n\r');
      return res.end('\ndata: ' + JSON.stringify(currentReply) + '\r\n\r\n');
    }
    if (transport !== 'json') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(': heartbeat\n\nid: wait-result\ndata: ' + JSON.stringify(currentReply) + '\n\n');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(currentReply, null, 2));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const proxy = await startMcpProxy({ rewriteToolsList: policy.rewriteToolsList,
    shouldRewriteToolResult: policy.shouldRewriteToolResult, rewriteToolResult: policy.rewriteToolResult });
  const url = proxy.register(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const headers = { 'content-type': 'application/json', 'mcp-session-id': 'session-1', authorization: 'Bearer fake' };
  const response = await fetch(url, { method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: { taskId: 'task-1' } } }) });
  let raw;
  if (transport === 'get') {
    assert.equal(response.status, 202); await response.text();
    raw = await (await fetch(url, { headers })).text();
  } else raw = await response.text();
  const decoded = transport === 'json' ? JSON.parse(raw)
    : JSON.parse(raw.split('\n').find(line => line.startsWith('data: ')).slice(6));
  return { decoded, raw, original, reply, url, headers };
}

test('waiting tool metadata removes the observed conflicts without changing input schemas', () => {
  const policy = createPolicy('0.1.3');
  const message = { result: { tools: structuredClone(fixture.tools) } };
  policy.rewriteToolsList(message);
  assert.notEqual(message.result.tools[0].outputSchema.properties.next.const, originalNext);
  assert.ok(!message.result.tools[2].description.includes('with `next` end your turn'));
  for (let i = 0; i < fixture.tools.length; i++) {
    assert.deepEqual(message.result.tools[i].inputSchema, fixture.tools[i].inputSchema);
  }
});

test('current T3 running-task hint is normalized', () => {
  const policy = createPolicy('0.1.12-nightly.20261121.5024');
  const data = {
    taskId: 'task-current', childThreadId: 'child-current', status: 'running', waitTimedOut: false,
    next: 'Completion wakes this thread. Do not wait on it or poll it. Continue other work, and end your turn when none is left.',
  };
  const message = { result: { structuredContent: structuredClone(data), content: [{ type: 'text', text: JSON.stringify(data) }] } };
  policy.rewriteToolResult(message, 'task_status');
  assert.equal(message.result.structuredContent.next, WORKFLOW_WAITING_NEXT);
  assert.equal(JSON.parse(message.result.content[0].text).next, WORKFLOW_WAITING_NEXT);
});

for (const transport of ['json', 'sse', 'get']) {
  test(`known waiting hint is normalized in structured and JSON-text results over ${transport}`, async t => {
    const { decoded, raw } = await setup(t, { transport });
    const data = decoded.result.structuredContent;
    assert.notEqual(data.next, originalNext);
    assert.match(data.next, /workflow/);
    assert.deepEqual({ ...data, next: originalNext }, task);
    assert.deepEqual(JSON.parse(decoded.result.content[0].text), data);
    if (transport !== 'json') assert.ok(raw.startsWith(': heartbeat\n\nid: wait-result\n'));
  });
}

for (const config of [{ overrides: { reviewWorkflow: false } }, { version: '0.1.4' }, { version: '0.1.3-nightly.20261025.3655' }]) {
  test(`disabled or unsupported waiting-result policy preserves bytes: ${JSON.stringify(config)}`, async t => {
    const { raw, original } = await setup(t, config);
    assert.equal(raw, original);
  });
}

test('unrelated tools, error results, unknown hints and unrecognized result shapes remain opaque', async t => {
  for (const options of [
    { tool: 'other_tool' },
    { result: { isError: true, content: [{ type: 'text', text: JSON.stringify(task) }], structuredContent: task } },
    { result: { content: [{ type: 'text', text: 'not JSON: ' + originalNext }], structuredContent: { ...task, next: 'unknown private hint' } } },
    { result: { content: [{ type: 'text', text: JSON.stringify({ next: originalNext }) }], structuredContent: { next: originalNext } } },
  ]) {
    const { raw, original } = await setup(t, options);
    assert.equal(raw, original);
  }
});

test('thread-wait timeout preserves identity, status and timeout while replacing only its hint', async t => {
  const data = { threadId: 'child-1', runId: 'run-1', status: 'running', timedOut: true, next: originalNext };
  const { decoded } = await setup(t, { tool: 't3_thread_wait', result: {
    content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data,
  } });
  assert.notEqual(decoded.result.structuredContent.next, originalNext);
  assert.deepEqual({ ...decoded.result.structuredContent, next: originalNext }, data);
});

test('a starting task with a nullable child thread still gets workflow-controlled waiting guidance', async t => {
  const data = { ...task, childThreadId: null, status: 'starting' };
  const { decoded } = await setup(t, { result: { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data } });
  assert.notEqual(decoded.result.structuredContent.next, originalNext);
  assert.deepEqual({ ...decoded.result.structuredContent, next: originalNext }, data);
  assert.deepEqual(JSON.parse(decoded.result.content[0].text), decoded.result.structuredContent);
});

for (const tool of ['delegate_task', 'task_status']) {
  test(`${tool} JSON-text-only replies normalize the earlier next wording`, async t => {
    const data = { ...task, next: 'Completion wakes this thread. End your turn unless you need this result now.' };
    const { decoded } = await setup(t, { tool, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } });
    const actual = JSON.parse(decoded.result.content[0].text);
    assert.notEqual(actual.next, data.next);
    assert.deepEqual({ ...actual, next: data.next }, data);
    assert.equal(decoded.result.structuredContent, undefined);
  });
}

test('GET waiting replies remain isolated by credentials and request-ID reuse', async t => {
  const { url, headers } = await setup(t, { transport: 'get' });
  const foreign = await (await fetch(url, { headers: { ...headers, authorization: 'Bearer another' } })).text();
  assert.equal(JSON.parse(foreign.split('\n').find(line => line.startsWith('data: ')).slice(6)).result.structuredContent.next, originalNext);
  const reused = await fetch(url, { method: 'POST', headers,
    body: JSON.stringify({ id: 1, method: 'tools/call', params: { name: 'other_tool' } }) });
  assert.equal(reused.status, 202); await reused.text();
  const raw = await (await fetch(url, { headers })).text();
  assert.equal(JSON.parse(raw.split('\n').find(line => line.startsWith('data: ')).slice(6)).result.structuredContent.next, originalNext);
});

test('concurrent POSTs sharing an ID use their own waiting-result policy', async t => {
  const { url, headers } = await setup(t);
  const replies = await Promise.all(['task_status', 'other_tool'].map(name => fetch(url, { method: 'POST', headers,
    body: JSON.stringify({ id: 1, method: 'tools/call', params: { name } }) }).then(response => response.json())));
  assert.notEqual(replies[0].result.structuredContent.next, originalNext);
  assert.equal(replies[1].result.structuredContent.next, originalNext);
});

test('completed JSON waiting calls do not exhaust correlation after 4096 unique IDs', async t => {
  const { url, headers } = await setup(t);
  for (let id = 2; id <= 4098; id++) {
    const response = await fetch(url, { method: 'POST', headers,
      body: JSON.stringify({ id, method: 'tools/call', params: { name: 'task_status' } }) });
    assert.equal(response.status, 200, `completed JSON call ${id} must remain available`);
    const data = await response.json();
    assert.equal(data.id, id);
    assert.notEqual(data.result.structuredContent.next, originalNext);
  }
});

test('completed terminal SSE waiting calls without an event ID release correlation capacity', async t => {
  const { url, headers, decoded } = await setup(t, { transport: 'sse-no-id' });
  const assertReply = async (response, id) => {
    assert.equal(response.status, 200, `completed SSE call ${id} must remain available`);
    const raw = await response.text();
    const message = JSON.parse(raw.split(/\r\n|\r|\n/).find(line => line.startsWith('data: ')).slice(6));
    assert.equal(message.id, id);
    const data = message.result.structuredContent;
    assert.deepEqual({ ...data, next: originalNext }, task);
    assert.deepEqual(JSON.parse(message.result.content[0].text), data);
  };
  assert.equal(decoded.id, 1);
  assert.deepEqual({ ...decoded.result.structuredContent, next: originalNext }, task);

  for (let id = 2; id <= 4096; id++) {
    await assertReply(await fetch(url, { method: 'POST', headers,
      body: JSON.stringify({ id, method: 'tools/call', params: { name: 'task_status' } }) }), id);
  }
  await assertReply(await fetch(url, { method: 'POST', headers,
    body: JSON.stringify({ id: 4097, method: 'tools/call', params: { name: 'task_status' } }) }), 4097);
});

test('SSE replay cursor ignores comments and empty events, inherits IDs, and clears on empty IDs', async () => {
  assert.equal(await hasSseReplayCursor([': heartbeat\r', '\n\r', '\n']), false);
  assert.equal(await hasSseReplayCursor(['id: cursor\r', '\ndata: {}\r\n\r', '\ndata: {}\r\n\r\n']), true);
  assert.equal(await hasSseReplayCursor(['id: cursor\ndata: {}\n\nid:\ndata: {}\n\n']), false);
});

test('SSE notifications and unterminated results retain correlation; later empty IDs do not erase a matched cursor', async t => {
  const reply = id => ({ jsonrpc: '2.0', id, result: {
    structuredContent: structuredClone(task), content: [{ type: 'text', text: JSON.stringify(task) }],
  } });
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end([1, 2, 3].map(id => `id: replay-${id}\r\ndata: ${JSON.stringify(reply(id))}\r\n\r\n`).join(''));
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { id } = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (id === 1) return res.end('data: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n');
    if (id === 2) return res.end('data: ' + JSON.stringify(reply(id)));
    return res.end(`id: matched\r\ndata: ${JSON.stringify(reply(id))}\r\n\r\nid:\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const policy = createPolicy('0.1.3');
  const proxy = await startMcpProxy({ shouldRewriteToolResult: policy.shouldRewriteToolResult, rewriteToolResult: policy.rewriteToolResult });
  const url = proxy.register(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const headers = { 'content-type': 'application/json', 'mcp-session-id': 'incomplete-sse-session' };
  for (const id of [1, 2, 3]) {
    const response = await fetch(url, { method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'task_status' } }) });
    assert.equal(response.status, 200);
    await response.text();
  }
  const raw = await (await fetch(url, { headers })).text();
  const messages = raw.split(/\r\n|\r|\n/).filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  assert.deepEqual(messages.map(message => message.id), [1, 2, 3]);
  for (const message of messages) assert.notEqual(message.result.structuredContent.next, originalNext);
});

for (const transport of ['sse', 'get']) {
  test(`completed ${transport} waiting replies retain correlation for GET replay`, async t => {
    const { url, headers } = await setup(t, { transport });
    const raw = await (await fetch(url, { headers })).text();
    const data = JSON.parse(raw.split('\n').find(line => line.startsWith('data: ')).slice(6));
    assert.notEqual(data.result.structuredContent.next, originalNext);
  });
}

test('finishing an old JSON call preserves a newer same-ID call awaiting GET delivery', async t => {
  let oldStarted, releaseOld;
  const started = new Promise(resolve => { oldStarted = resolve; });
  const released = new Promise(resolve => { releaseOld = resolve; });
  const reply = { id: 9, result: { structuredContent: task, content: [{ type: 'text', text: JSON.stringify(task) }] } };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end('id: race\ndata: ' + JSON.stringify(reply) + '\n\n');
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks));
    if (message.params.arguments.stage === 'old') {
      oldStarted(); await released;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(reply));
    }
    res.writeHead(202); res.end(); releaseOld();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const policy = createPolicy('0.1.3');
  const proxy = await startMcpProxy({ shouldRewriteToolResult: policy.shouldRewriteToolResult, rewriteToolResult: policy.rewriteToolResult });
  const url = proxy.register(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const headers = { 'content-type': 'application/json', 'mcp-session-id': 'race-session' };
  const call = stage => fetch(url, { method: 'POST', headers,
    body: JSON.stringify({ id: 9, method: 'tools/call', params: { name: 'task_status', arguments: { stage } } }) });
  const old = call('old'); await started;
  const pending = await call('new'); assert.equal(pending.status, 202); await pending.text();
  const completed = await (await old).json();
  assert.notEqual(completed.result.structuredContent.next, originalNext);
  const replay = await (await fetch(url, { headers })).text();
  assert.notEqual(JSON.parse(replay.split('\n').find(line => line.startsWith('data: ')).slice(6)).result.structuredContent.next, originalNext);
});

test('finishing an old SSE call without a cursor preserves a newer same-ID call awaiting GET delivery', async t => {
  let oldStarted, releaseOld;
  const started = new Promise(resolve => { oldStarted = resolve; });
  const released = new Promise(resolve => { releaseOld = resolve; });
  const reply = { id: 9, result: { structuredContent: task, content: [{ type: 'text', text: JSON.stringify(task) }] } };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end('id: race\ndata: ' + JSON.stringify(reply) + '\n\n');
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks));
    if (message.params.arguments.stage === 'old') {
      oldStarted(); await released;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end('data: ' + JSON.stringify(reply) + '\r\n\r\n');
    }
    res.writeHead(202); res.end(); releaseOld();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const policy = createPolicy('0.1.3');
  const proxy = await startMcpProxy({ shouldRewriteToolResult: policy.shouldRewriteToolResult, rewriteToolResult: policy.rewriteToolResult });
  const url = proxy.register(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const headers = { 'content-type': 'application/json', 'mcp-session-id': 'race-sse-session' };
  const call = stage => fetch(url, { method: 'POST', headers,
    body: JSON.stringify({ id: 9, method: 'tools/call', params: { name: 'task_status', arguments: { stage } } }) });
  const old = call('old'); await started;
  const pending = await call('new'); assert.equal(pending.status, 202); await pending.text();
  const completed = await old; assert.equal(completed.status, 200); await completed.text();
  const replay = await (await fetch(url, { headers })).text();
  assert.notEqual(JSON.parse(replay.split('\n').find(line => line.startsWith('data: ')).slice(6)).result.structuredContent.next, originalNext);
});

test('schema rewriting changes only known next literals and preserves unknown schemas', () => {
  const policy = createPolicy('0.1.3');
  const known = { properties: { next: { enum: [originalNext, 'unknown'] }, summary: { const: originalNext } }, required: ['next'] };
  const unknown = { properties: { next: { const: 'private unknown hint' } } };
  const message = { result: { tools: [
    { name: 'delegate_task', outputSchema: structuredClone(known) },
    { name: 'task_status', outputSchema: structuredClone(unknown) },
    { name: 'other_tool', outputSchema: structuredClone(known) },
  ] } };
  policy.rewriteToolsList(message);
  assert.notEqual(message.result.tools[0].outputSchema.properties.next.enum[0], originalNext);
  assert.equal(message.result.tools[0].outputSchema.properties.next.enum[1], 'unknown');
  assert.deepEqual(message.result.tools[0].outputSchema.properties.summary, known.properties.summary);
  assert.deepEqual(message.result.tools[0].outputSchema.required, known.required);
  assert.deepEqual(message.result.tools[1].outputSchema, unknown);
  assert.deepEqual(message.result.tools[2].outputSchema, known);
  assert.doesNotThrow(() => policy.rewriteToolsList({ result: { tools: {} } }));
});
