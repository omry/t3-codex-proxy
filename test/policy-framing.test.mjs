import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { REVIEW_GUIDANCE, createPolicy } from '../src/policy.mjs';
import { JsonLines, SseRewrite } from '../src/framing.mjs';
import { rewriteClientMessage } from '../src/wrapper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance.json', import.meta.url)));
const { rewriteDeveloperContext, rewriteToolsList } = createPolicy(fixture.sourceVersion.slice(1));
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

function decodeCompleteEvent(bytes) {
  const text = bytes.toString('utf8');
  const body = text.startsWith('\ufeff') ? text.slice(1) : text;
  const lines = body.split(/\r\n|\r|\n/);
  assert.ok(lines.length >= 3 && lines.at(-1) === '' && lines.at(-2) === '', 'missing complete SSE blank-line boundary');
  const fields = lines.slice(0, -2);
  const id = fields.find(line => line.startsWith('id:'))?.slice(3).trim() ?? null;
  const data = fields.filter(line => line.startsWith('data:') || line === 'data')
    .map(line => line.slice(4).replace(/^: ?/, '')).join('\n');
  return { id, message: JSON.parse(data) };
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
  const policy = createPolicy(fixture.sourceVersion.slice(1), code => events.push(code));
  events.length = 0;
  policy.rewriteDeveloperContext(message);
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

test('SSE bounds each complete event regardless of chunk boundaries', async () => {
  const oversized = Buffer.from('data: ' + JSON.stringify({ text: 'x'.repeat(80) }) + '\n\n');
  for (const chunks of [[oversized], [oversized.subarray(0, 20), oversized.subarray(20)]]) {
    await assert.rejects(collect(new SseRewrite(x => x, 32), chunks), /frame_too_large/);
  }
  const small = Buffer.from('data: {}\n\n');
  const many = Buffer.concat(Array(20).fill(small));
  assert.deepEqual(await collect(new SseRewrite(x => x, 32), [many]), many);
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

test('SSE mixed-boundary rewrites remain complete after semantic decoding', async () => {
  const response = JSON.stringify({ id: 31, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task }] } });
  const splitAt = response.indexOf(',"result"') + 1;
  const first = response.slice(0, splitAt);
  const second = response.slice(splitAt);
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const cases = [
    ['precise interleaved whole', 'middle', Buffer.from(`data:${first}\rid:middle\rdata:${second}\n\n`)],
    ['header-first adjacent', 'header', Buffer.from(`event: message\rcomment: before\nid: header\rdata:${first}\rdata:${second}\n\n`)],
    ['comment and id between data', 'between', Buffer.from(`data:${first}\rcomment: between\rid: between\rdata:${second}\n\n`)],
    ['retry and id between data', 'retry', Buffer.from(`data:${first}\rretry: 1\rid: retry\rdata:${second}\n\n`)],
    ['event after data', 'after', Buffer.from(`data:${first}\rdata:${second}\nid: after\nevent: after\n\n`)],
    ['all interleaved fields', 'all', Buffer.from(`event: message\rid: all\rdata:${first}\rcomment: between\rdata:${second}\nretry: 1\r\n\n`)],
    ['BOM interleaved fragmented', 'bom', Buffer.concat([bom, Buffer.from(`event: message\rid: bom\rcomment: before\rdata:${first}\rretry: 1\rdata:${second}\n\n`)])],
    ['matrix CR-LF-CRLF', 'matrix-cr-lf-crlf', Buffer.from(`id: matrix-cr-lf-crlf\rdata: ${response}\n\r\n`)],
    ['matrix LF-CRLF-CR', 'matrix-lf-crlf-cr', Buffer.from(`id: matrix-lf-crlf-cr\ndata: ${response}\r\n\r`)],
    ['matrix CRLF-CR-CRLF', 'matrix-crlf-cr-crlf', Buffer.from(`id: matrix-crlf-cr-crlf\r\ndata: ${response}\r\r\n`)],
  ];
  for (const [name, id, raw] of cases) {
    const input = decodeCompleteEvent(raw);
    assert.equal(input.id, id, `${name}: valid input id`);
    assert.equal(input.message.result.tools[0].description, fixture.delegate_task, `${name}: valid input JSON`);
    const expected = structuredClone(input.message);
    rewriteToolsList(expected);
    for (const [variant, chunks] of [['whole', [raw]], ['fragmented', [...raw].map(byte => Buffer.from([byte]))]]) {
      const decoded = decodeCompleteEvent(await collect(new SseRewrite(rewriteToolsList), chunks));
      assert.equal(decoded.id, id, `${name}/${variant}: event id`);
      const description = decoded.message.result.tools[0].description;
      assert.ok(description.includes(REVIEW_GUIDANCE), `${name}/${variant}: rewritten guidance`);
      assert.equal(description.includes(fixture.delegate_task), false, `${name}/${variant}: original guidance`);
      assert.deepEqual(decoded.message, expected, `${name}/${variant}: rewritten JSON`);
    }
  }

  const opaque = Buffer.from('event: unknown\rid: opaque\ndata: {"id":32,"result":{"content":[{"type":"text","text":"opaque"}]}}\n\n');
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [opaque]), opaque);

  const beforeEnd = new SseRewrite(rewriteToolsList);
  const emitted = [];
  beforeEnd.on('data', chunk => emitted.push(chunk));
  await new Promise((resolve, reject) => beforeEnd.write(cases[0][2], error => error ? reject(error) : resolve()));
  assert.equal(decodeCompleteEvent(Buffer.concat(emitted)).id, 'middle', 'complete event emitted before EOF');
  await new Promise((resolve, reject) => { beforeEnd.once('error', reject); beforeEnd.once('end', resolve); beforeEnd.end(); });
});

test('SSE rewrites complete CR-only EOF events and preserves incomplete lines', async () => {
  const response = JSON.stringify({ id: 11, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task }] } });
  const complete = Buffer.from(`id: cr-only\r\ndata: ${response}\r\r`);
  const fragmented = [...complete].map(byte => Buffer.from([byte]));
  for (const chunks of [[complete], fragmented]) {
    const result = (await collect(new SseRewrite(rewriteToolsList), chunks)).toString();
    assert.ok(result.includes(REVIEW_GUIDANCE));
    assert.equal(result.includes(fixture.delegate_task), false);
    assert.ok(result.includes('id: cr-only'));
  }

  const incomplete = Buffer.from(`data: ${response}\r`);
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [incomplete]), incomplete);

  for (const ending of ['\r', '\n', '\r\n']) {
    for (const field of ['id: tail', ': tail comment', 'event: tail', 'retry: 1']) {
      const raw = Buffer.from(`data: ${response}${ending}${field}\r`);
      for (const chunks of [[raw], [...raw].map(byte => Buffer.from([byte]))]) {
        let calls = 0;
        const result = await collect(new SseRewrite(message => {
          calls++;
          return rewriteToolsList(message);
        }), chunks);
        assert.deepEqual(result, raw);
        assert.equal(calls, 0);
      }
    }
  }

  const prior = Buffer.from(`id: prior\ndata: ${response}\r\r`);
  const trailing = Buffer.from(`data: ${response}\nretry: tail\r`);
  for (const chunks of [[Buffer.concat([prior, trailing])], [...Buffer.concat([prior, trailing])].map(byte => Buffer.from([byte]))]) {
    let calls = 0;
    const result = await collect(new SseRewrite(message => {
      calls++;
      return rewriteToolsList(message);
    }), chunks);
    const priorResult = await collect(new SseRewrite(rewriteToolsList), [prior]);
    assert.ok(result.subarray(0, priorResult.length).toString().includes(REVIEW_GUIDANCE));
    assert.deepEqual(result.subarray(priorResult.length), trailing);
    assert.equal(calls, 1);
  }

  const splitCrlf = Buffer.from(`id: split-crlf\r\ndata: ${response}\r\n\r\n`);
  const delimiter = Buffer.from('\r\n\r\n');
  const split = splitCrlf.lastIndexOf(delimiter);
  const result = (await collect(new SseRewrite(rewriteToolsList), [
    splitCrlf.subarray(0, split + 1),
    splitCrlf.subarray(split + 1, split + 2),
    splitCrlf.subarray(split + 2),
  ])).toString();
  assert.ok(result.includes(REVIEW_GUIDANCE));
  assert.ok(result.includes('id: split-crlf'));
});

test('SSE parses one stream-leading BOM and preserves later BOM bytes', async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const response = JSON.stringify({ id: 12, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task }] } });
  const leadingData = Buffer.concat([bom, Buffer.from(`data: ${response}\n\n`)]);
  const leadingResult = await collect(new SseRewrite(rewriteToolsList), [...leadingData].map(byte => Buffer.from([byte])));
  assert.ok(leadingResult.toString().includes(REVIEW_GUIDANCE));
  assert.equal(leadingResult.toString().includes(fixture.delegate_task), false);
  assert.deepEqual(leadingResult.subarray(0, 3), bom);

  const leadingComment = Buffer.concat([bom, Buffer.from(': comment\n\n')]);
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [leadingComment]), leadingComment);
  const leadingEvent = Buffer.concat([bom, Buffer.from(`event: message\ndata: ${response}\n\n`)]);
  const eventResult = await collect(new SseRewrite(rewriteToolsList), [...leadingEvent].map(byte => Buffer.from([byte])));
  assert.ok(eventResult.toString().includes(REVIEW_GUIDANCE));
  assert.deepEqual(eventResult.subarray(0, 3), bom);

  const doubled = Buffer.concat([bom, bom, Buffer.from(`data: ${response}\n\n`)]);
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [doubled]), doubled);

  const first = Buffer.from(`data: ${response}\n\n`);
  const later = Buffer.concat([bom, Buffer.from(`data: ${response}\n\n`)]);
  const firstResult = await collect(new SseRewrite(rewriteToolsList), [first]);
  const combined = await collect(new SseRewrite(rewriteToolsList), [first, later]);
  assert.ok(combined.subarray(0, firstResult.length).toString().includes(REVIEW_GUIDANCE));
  assert.deepEqual(combined.subarray(firstResult.length), later);

  const opaque = Buffer.concat([bom, Buffer.from(`data: ${JSON.stringify({ id: 13, result: { note: '\ufefflater' } })}\n\n`)]);
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [opaque]), opaque);
  const unknown = Buffer.from('event: unknown\ndata: {"id":14,"result":{"content":[{"type":"text","text":"opaque"}]}}\n\n');
  assert.deepEqual(await collect(new SseRewrite(rewriteToolsList), [unknown]), unknown);
});
