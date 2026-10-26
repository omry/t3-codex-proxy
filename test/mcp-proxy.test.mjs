import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { startMcpProxy } from '../src/mcp-proxy.mjs';
import { REVIEW_GUIDANCE } from '../src/policy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance.json', import.meta.url)));
const listed = id => ({ jsonrpc: '2.0', id, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task, inputSchema: { type: 'object' } }] } });

async function setup(t, handler) {
  const received = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    received.push({ method: request.method, url: request.url, headers: request.headers, raw });
    await handler(request, response, raw ? JSON.parse(raw) : null);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const events = [];
  const proxy = await startMcpProxy({ report: x => events.push(x) });
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp?backend=1`;
  const url = proxy.register(endpoint);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { proxy, endpoint, url, received, events };
}
const post = (url, message, extra = {}) => fetch(url, { method: 'POST', headers: {
  'content-type': 'application/json', authorization: 'Bearer test-secret', 'mcp-session-id': 'session-1',
  'mcp-protocol-version': '2025-06-18', ...extra,
}, body: JSON.stringify(message) });

test('HTTP JSON initialize/list/call/error/delete preserve authentication, session and opaque results', async t => {
  const callResult = JSON.stringify({ id: 3, result: { tools: listed(3).result.tools, content: [{ type: 'text', text: 'private-prompt' }] } }, null, 2);
  const { url, received, proxy, endpoint } = await setup(t, (req, res, body) => {
    if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
    res.setHeader('content-type', 'application/json');
    if (body.method === 'initialize') {
      res.setHeader('mcp-session-id', 'upstream-session');
      return res.end(JSON.stringify({ id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } }));
    }
    if (body.method === 'tools/list') return res.end(JSON.stringify(listed(body.id)));
    if (body.method === 'tools/call') return res.end(callResult);
    res.writeHead(401, { 'www-authenticate': 'Bearer realm="t3"' }); res.end('{"error":"expired"}');
  });
  assert.equal(proxy.register(endpoint), url);
  const init = await post(url, { id: 1, method: 'initialize' });
  assert.equal(init.headers.get('mcp-session-id'), 'upstream-session');
  await init.text();
  const list = await post(url, { id: 2, method: 'tools/list', params: { cursor: 'page2' } });
  const tools = (await list.json()).result.tools;
  assert.ok(tools[0].description.includes(REVIEW_GUIDANCE));
  assert.deepEqual(tools[0].inputSchema, { type: 'object' });
  const call = await post(url, { id: 3, method: 'tools/call', params: { name: 'delegate_task', arguments: { task: 'private-prompt' } } });
  assert.equal(await call.text(), callResult);
  const error = await post(url, { id: 4, method: 'invalid' });
  assert.equal(error.status, 401); assert.equal(error.headers.get('www-authenticate'), 'Bearer realm="t3"');
  assert.equal(await error.text(), '{"error":"expired"}');
  const deletion = await fetch(url, { method: 'DELETE', headers: { authorization: 'Bearer test-secret', 'mcp-session-id': 'session-1' } });
  assert.equal(deletion.status, 204);
  assert.equal(received[1].raw, JSON.stringify({ id: 2, method: 'tools/list', params: { cursor: 'page2' } }));
  assert.deepEqual(JSON.parse(received[2].raw).params.arguments, { task: 'private-prompt' });
  assert.equal(received[1].url, '/mcp?backend=1');
  assert.equal(received[1].headers.authorization, 'Bearer test-secret');
  assert.equal(received[1].headers['mcp-session-id'], 'session-1');
  assert.equal(received[1].headers['mcp-protocol-version'], '2025-06-18');
});

test('SSE list rewrites metadata and preserves progress events and event ids', async t => {
  const { url } = await setup(t, (_req, res, body) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': heartbeat\n\nevent: message\ndata: {"method":"notifications/progress","params":{"progress":1}}\n\n');
    const event = Buffer.from(`id: event-2\nevent: message\ndata: ${JSON.stringify(listed(body.id))}\n\n`);
    for (const byte of event) res.write(Buffer.from([byte]));
    res.end();
  });
  const raw = await (await post(url, { id: 2, method: 'tools/list' })).text();
  assert.ok(raw.startsWith(': heartbeat\n\nevent: message\ndata: {"method":"notifications/progress","params":{"progress":1}}\n\n'));
  assert.ok(raw.includes('id: event-2\nevent: message\n'));
  assert.ok(raw.includes(REVIEW_GUIDANCE));
});

test('concurrent lists and calls with equal IDs remain isolated across credentials and sessions', async t => {
  const { url } = await setup(t, async (req, res, body) => {
    await new Promise(resolve => setTimeout(resolve, req.headers.authorization.endsWith('a') ? 20 : 5));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(listed(body.id)));
  });
  const responses = await Promise.all([
    post(url, { id: 1, method: 'tools/list' }, { authorization: 'Bearer a' }),
    post(url, { id: 1, method: 'tools/call' }, { authorization: 'Bearer b' }),
    post(url, { id: 1, method: 'tools/list' }, { 'mcp-session-id': 'session-2' }),
  ]);
  const data = await Promise.all(responses.map(x => x.text()));
  assert.ok(data[0].includes(REVIEW_GUIDANCE));
  assert.ok(data[1].includes('prior findings, responses, and unresolved objections'));
  assert.ok(data[2].includes(REVIEW_GUIDANCE));
});

test('stateless clients can reuse the same ID and credential on concurrent POSTs', async t => {
  const { url } = await setup(t, async (_req, res, body) => {
    await new Promise(resolve => setTimeout(resolve, body.params.delay));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(listed(body.id)));
  });
  const request = delay => fetch(url, { method: 'POST', headers: {
    'content-type': 'application/json', authorization: 'Bearer same-stateless-client',
  }, body: JSON.stringify({ id: 1, method: 'tools/list', params: { delay } }) });
  const responses = await Promise.all([request(5), request(30)]);
  for (const response of responses) {
    assert.ok((await response.json()).result.tools[0].description.includes(REVIEW_GUIDANCE));
  }
});

test('GET SSE carries a pending list response after POST 202', async t => {
  const { url } = await setup(t, (req, res) => {
    if (req.method === 'POST') { res.writeHead(202); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`id: replay\ndata: ${JSON.stringify(listed(9))}\n\n`);
  });
  assert.equal((await post(url, { id: 9, method: 'tools/list' })).status, 202);
  const response = await fetch(url, { headers: { authorization: 'Bearer test-secret', 'mcp-session-id': 'session-1', 'last-event-id': 'resume-id' } });
  assert.ok((await response.text()).includes(REVIEW_GUIDANCE));
});

test('stream tool output passes through before the upstream closes', async t => {
  let finish;
  const { url } = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"method":"notifications/progress","params":{"progress":1}}\n\n');
    finish = () => res.end('data: {"id":1,"result":{"content":[]}}\n\n');
  });
  const response = await post(url, { id: 1, method: 'tools/call' });
  const reader = response.body.getReader();
  assert.ok(new TextDecoder().decode((await reader.read()).value).includes('notifications/progress'));
  finish();
  while (!(await reader.read()).done) { /* Drain. */ }
});

test('unrecognized metadata is forwarded unchanged and warns without exposing content', async t => {
  const { url, events } = await setup(t, (_req, res, body) => {
    res.setHeader('content-type', 'application/json');
    const data = listed(body.id); data.result.tools[0].description = 'Unknown review requirement: private-marker';
    res.end(JSON.stringify(data));
  });
  const data = await (await post(url, { id: 2, method: 'tools/list' })).json();
  assert.equal(data.result.tools[0].description, 'Unknown review requirement: private-marker');
  assert.deepEqual(events, ['mcp_endpoint_redirected', 'unrecognized_review_guidance']);
});

test('unknown routes, web origins and external/stale endpoints are rejected', async t => {
  const { url, proxy, received } = await setup(t, (_req, res) => res.end());
  assert.equal((await fetch(url + '/unknown')).status, 404);
  assert.equal((await fetch(url, { headers: { origin: 'http://attacker.invalid' } })).status, 404);
  for (const endpoint of ['https://example.com/mcp', 'http://127.0.0.1/t3-codex-proxy/old/mcp', 'http://user:secret@localhost/mcp']) {
    assert.throws(() => proxy.register(endpoint));
  }
  assert.equal(received.length, 0);
});

test('upstream connection failure is sanitized', async t => {
  const { proxy } = await setup(t, (_req, res) => res.end());
  const response = await post(proxy.register('http://127.0.0.1:1/mcp?private-marker'), { id: 1, method: 'tools/list' });
  assert.equal(response.status, 502);
  assert.equal(await response.text(), '{"error":"mcp_forward_failed"}');
});

test('modified JSON has no stale length or entity digest', async t => {
  const { url } = await setup(t, (_req, res, body) => {
    const raw = JSON.stringify(listed(body.id));
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw), etag: 'old', digest: 'old' });
    res.end(raw);
  });
  const response = await post(url, { id: 7, method: 'tools/list' });
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('digest'), null);
  assert.ok((await response.text()).includes(REVIEW_GUIDANCE));
});

test('proxy shutdown closes an active upstream stream', async t => {
  let upstreamClosed;
  const closed = new Promise(resolve => { upstreamClosed = resolve; });
  const { url, proxy } = await setup(t, (_req, res) => {
    res.on('close', upstreamClosed);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': connected\n\n');
  });
  const response = await fetch(url, { headers: { authorization: 'Bearer test-secret', 'mcp-session-id': 'session-1' } });
  const reader = response.body.getReader();
  assert.ok(!(await reader.read()).done);
  await proxy.close();
  await closed;
  await assert.rejects(reader.read());
});
