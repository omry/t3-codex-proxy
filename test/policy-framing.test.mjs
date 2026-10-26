import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { REVIEW_GUIDANCE, rewriteDeveloperContext, rewriteToolsList } from '../src/policy.mjs';
import { JsonLines, SseRewrite } from '../src/framing.mjs';
import { rewriteClientMessage } from '../src/wrapper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance.json', import.meta.url)));
const context = () => ({ method: 'turn/start', id: 1, params: {
  additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: fixture.context },
    t3_code_orchestration_02: { kind: 'untrusted', value: fixture.context },
    unrelated: { kind: 'application', value: fixture.context },
  }, input: [{ type: 'text', text: fixture.context }],
} });

async function collect(transform, chunks) {
  const output = [];
  for await (const chunk of Readable.from(chunks).pipe(transform)) output.push(chunk);
  return Buffer.concat(output);
}

test('golden T3 developer context: replace one review bullet, preserve everything else', () => {
  const message = context();
  const before = structuredClone(message);
  rewriteDeveloperContext(message);
  const oldBullet = fixture.context.split('\n').find(x => x.startsWith('- For independent'));
  assert.equal(message.params.additionalContext.t3_code_orchestration_01.value,
    fixture.context.replace(oldBullet, '- ' + REVIEW_GUIDANCE));
  before.params.additionalContext.t3_code_orchestration_01.value = message.params.additionalContext.t3_code_orchestration_01.value;
  assert.deepEqual(message, before);
  assert.deepEqual(rewriteDeveloperContext(structuredClone(message)), message);
});

test('compaction reinjection: only tagged developer input_text changes', () => {
  const tag = `<t3_code_orchestration_01>${fixture.context}</t3_code_orchestration_01>`;
  const message = { method: 'thread/inject_items', params: { items: [
    { type: 'message', role: 'developer', content: [{ type: 'input_text', text: tag }] },
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: tag }] },
    { type: 'message', role: 'developer', content: [{ type: 'input_text', text: fixture.context }] },
  ] } };
  rewriteDeveloperContext(message);
  assert.ok(message.params.items[0].content[0].text.includes(REVIEW_GUIDANCE));
  assert.equal(message.params.items[1].content[0].text, tag);
  assert.equal(message.params.items[2].content[0].text, fixture.context);
});

test('golden tool descriptions preserve schemas, names and unrelated descriptions', () => {
  const message = { id: 42, result: { nextCursor: 'page2', tools: [
    ...['delegate_task', 't3_thread_send'].map(name => ({ name, description: fixture[name],
      inputSchema: { type: 'object', properties: { task: { type: 'string' } } }, _meta: { x: true } })),
    { name: 'other', description: fixture.delegate_task },
  ] } };
  const before = structuredClone(message);
  rewriteToolsList(message);
  for (let i = 0; i < 2; i++) {
    assert.ok(message.result.tools[i].description.includes(REVIEW_GUIDANCE));
    assert.equal(message.result.tools[i].description.includes('prior findings, responses, and unresolved objections'), false);
    before.result.tools[i].description = message.result.tools[i].description;
  }
  assert.deepEqual(before, message);
});

test('unknown guidance stays unchanged with a content-free warning', () => {
  const message = context();
  message.params.additionalContext.t3_code_orchestration_01.value = 'Changed independent review guidance. private-marker';
  const before = structuredClone(message);
  const events = [];
  rewriteDeveloperContext(message, code => events.push(code));
  assert.deepEqual(message, before);
  assert.deepEqual(events, ['unrecognized_review_guidance']);
  for (const value of [null, {}, { params: {} }, { method: 'turn/start', params: { additionalContext: [] } }]) {
    assert.deepEqual(rewriteDeveloperContext(structuredClone(value)), value);
  }
});

for (const method of ['thread/start', 'thread/resume', 'thread/fork']) {
  test(`${method} redirects only t3-code, preserving headers and all other arguments`, () => {
    const message = { method, id: 7, params: { threadId: 'existing', config: {
      'mcp_servers.t3-code': { url: 'http://localhost:123/mcp', http_headers: { Authorization: 'secret' }, tool_timeout_sec: 3900 },
      'mcp_servers.other': { url: 'http://localhost:456/mcp' },
    } } };
    const before = structuredClone(message);
    rewriteClientMessage(message, { register: () => 'http://local-proxy' });
    before.params.config['mcp_servers.t3-code'].url = 'http://local-proxy';
    assert.deepEqual(message, before);
  });
}

test('nested config is supported; config-less resume does not invent an endpoint', () => {
  const message = { method: 'thread/start', params: { config: { mcp_servers: { 't3-code': { url: 'http://localhost/mcp' } } } } };
  rewriteClientMessage(message, { register: () => 'proxy' });
  assert.equal(message.params.config.mcp_servers['t3-code'].url, 'proxy');
  const resume = { method: 'thread/resume', params: { threadId: 'abc' } };
  assert.deepEqual(rewriteClientMessage(structuredClone(resume), null), resume);
});

test('NDJSON: byte-transparent unknown JSON, malformed data, CRLF and unterminated last line', async () => {
  const raw = Buffer.from(' { "id": 8, "result": "é🐈" }\r\nnot-json\n42');
  const chunks = [...raw].map(x => Buffer.from([x]));
  assert.deepEqual(await collect(new JsonLines(x => x), chunks), raw);
  const input = Buffer.from(JSON.stringify(context()) + '\n');
  const result = await collect(new JsonLines(rewriteDeveloperContext), [...input].map(x => Buffer.from([x])));
  assert.ok(result.toString().includes(REVIEW_GUIDANCE));
});

test('frame limit fails explicitly instead of silently losing data', async () => {
  await assert.rejects(collect(new JsonLines(x => x, 4), [Buffer.from('12345')]), /frame_too_large/);
});

test('SSE: split UTF-8 and delimiters, multiline data, comments, ids and unknown events', async () => {
  const response = { id: 1, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task }] } };
  const json = JSON.stringify(response);
  const raw = Buffer.from(': hé🐈\r\nid: event-1\r\nretry: 2000\r\nevent: message\r\ndata: ' + json.slice(0, 8) + '\r\ndata: ' + json.slice(8) + '\r\n\r\n: heartbeat\n\ndata: not-json\n\n');
  const result = (await collect(new SseRewrite(rewriteToolsList), [...raw].map(x => Buffer.from([x])))).toString();
  assert.ok(result.includes(REVIEW_GUIDANCE));
  assert.ok(result.startsWith(': hé🐈\r\nid: event-1\r\nretry: 2000\r\nevent: message\r\n'));
  assert.ok(result.endsWith(': heartbeat\n\ndata: not-json\n\n'));
  assert.deepEqual(await collect(new SseRewrite(x => x), [raw]), raw);
});

test('SSE supports mixed line endings and does not dispatch a single CRLF line', async () => {
  const response = JSON.stringify({ id: 1, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task }] } });
  for (const ending of ['\n\r\n', '\r\n\n', '\r\r\n', '\r\n\r\n']) {
    const raw = Buffer.from(`data: ${response}${ending}: heartbeat\n\n`);
    const result = (await collect(new SseRewrite(rewriteToolsList), [...raw].map(x => Buffer.from([x])))).toString();
    assert.ok(result.includes(REVIEW_GUIDANCE));
    assert.ok(result.endsWith(ending + ': heartbeat\n\n'));
  }
  const singleLine = Buffer.from(`data: ${response}\r\n`);
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [singleLine]), singleLine);
});
