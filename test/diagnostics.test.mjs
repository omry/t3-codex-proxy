import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { startMcpProxy } from '../src/mcp-proxy.mjs';
import { createPolicy } from '../src/policy.mjs';
import { PROXY_CHECK_TOOL, proxyCheckResult } from '../src/diagnostics.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance-0.1.3.json', import.meta.url)));

async function setup(t, overrides, handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    requests.push({ method: req.method, headers: req.headers, message });
    if (req.headers.authorization !== 'Bearer test-secret') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end('{"error":"unauthorized"}');
    }
    if (handler) return handler(req, res, message);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: message.method === 'tools/list'
      ? { tools: [{ name: 'watch_pull_request', description: fixture.watch_pull_request, inputSchema: { type: 'object' } }] }
      : { content: [{ type: 'text', text: 'opaque tool result' }] } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const policy = createPolicy('0.1.3', () => {}, overrides);
  policy.rewriteDeveloperContext({ method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: fixture.context },
    t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
  } } });
  const proxy = await startMcpProxy({ rewriteToolsList: policy.rewriteToolsList, diagnostics: policy.diagnostics });
  const url = proxy.register(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const request = (method, message, auth = 'Bearer test-secret') => fetch(url, { method, headers: {
    authorization: auth, 'content-type': 'application/json', 'mcp-session-id': 'session-1',
  }, ...(message ? { body: JSON.stringify(message) } : {}) });
  return { requests, request };
}

for (const reviewWorkflow of [false, true]) for (const prWaiting of [false, true]) {
  test(`proxy-check reports actual config and model checklist: review=${reviewWorkflow}, PR=${prWaiting}`, async t => {
    const { requests, request } = await setup(t, { reviewWorkflow, prWaiting });
    const list = await (await request('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    assert.deepEqual(list.result.tools.at(-1), PROXY_CHECK_TOOL);
    const check = await (await request('POST', { jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'proxy-check', arguments: {} } })).json();
    const data = check.result.structuredContent;
    assert.equal(check.id, 2);
    assert.equal(data.t3Version, '0.1.3');
    assert.equal(data.compatibility, 'tested');
    assert.deepEqual(data.overrides, { reviewWorkflow, prWaiting });
    assert.equal(data.upstreamMcp, 'tools/list succeeded');
    assert.equal(data.observations.reviewWorkflow.rewrites > 0, reviewWorkflow);
    assert.equal(data.observations.prWaiting.rewrites > 0, prWaiting);
    assert.equal(data.observations.prWaiting.unrecognized, 0);
    assert.ok(data.expected.reviewWorkflow.includes(reviewWorkflow ? 'workflow controls' : 'preserves T3'));
    assert.ok(data.expected.prWaiting.includes(prWaiting ? 'workflow controls' : 'preserves T3'));
    const text = check.result.content[0].text;
    assert.ok(text.startsWith('Proxy check: local facts\nT3 version: 0.1.3\nCompatibility: covered by exact-version automated tests.'));
    assert.ok(text.includes(`Review workflow override: ${reviewWorkflow ? 'enabled' : 'disabled'}`));
    assert.ok(text.includes(`PR-wait override: ${prWaiting ? 'enabled' : 'disabled'}`));
    assert.ok(text.includes('Start with "Proxy check passed."'));
    assert.ok(text.includes('"Override checks (2):" and exactly two bullets'));
    assert.ok(text.includes('Do not give installation facts PASS labels or mix them into the override list'));
    assert.ok(text.includes('Do not show raw counters'));
    assert.ok(!text.includes('"rewrites":') && !text.includes('"tested":'));
    assert.ok(text.includes('Call orchestrator_capabilities once'));
    assert.ok(text.includes('Do not infer received guidance from config or rewrite counts alone'));
    assert.ok(!text.includes('test-secret') && !text.includes('/mcp'));
    assert.equal(requests.length, 2);
    assert.ok(requests.every(x => x.message.method === 'tools/list'));
    assert.equal(requests[1].headers.authorization, 'Bearer test-secret');
    assert.equal(requests[1].headers['mcp-session-id'], 'session-1');
    assert.equal(Number(requests[1].headers['content-length']), Buffer.byteLength(JSON.stringify(requests[1].message)));
  });
}

test('new nightlies use open-ended support without an exact-version coverage warning', () => {
  const events = [];
  const policy = createPolicy('0.1.4-nightly.20261027.3783', event => events.push(event));
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: fixture.context },
    t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
  } } };
  policy.rewriteDeveloperContext(message);
  const result = proxyCheckResult(policy.diagnostics());
  assert.equal(result.structuredContent.compatibility, 'assumed');
  assert.equal(result.structuredContent.tested, false);
  assert.ok(result.structuredContent.observations.reviewWorkflow.rewrites > 0);
  assert.ok(result.structuredContent.observations.prWaiting.rewrites > 0);
  assert.deepEqual(events, ['t3_fixset_current', 'guidance_rewritten', 'guidance_rewritten']);
  const text = result.content[0].text;
  assert.ok(text.includes('T3 version: 0.1.4-nightly.20261027.3783'));
  assert.ok(text.includes('Compatibility: assumed compatible through the latest matching version range.'));
  assert.ok(text.includes('New releases use the latest open-ended range'));
  assert.ok(text.includes('must not cause UNKNOWN, FAIL, or an upgrade warning'));
});

test('missing or unmatched versions remain unsupported in the plain-language report', () => {
  for (const version of [undefined, 'invalid', '0.1.3-nightly.20261025.3660']) {
    const result = proxyCheckResult(createPolicy(version).diagnostics());
    assert.equal(result.structuredContent.compatibility, 'unsupported');
    assert.ok(result.content[0].text.includes('Compatibility: unsupported. No matching version range'));
    assert.ok(result.content[0].text.includes('If no range matches, report unsupported and treat it as an installation failure'));
  }
});

test('proxy-check preserves upstream authentication failures and rejects nonempty arguments', async t => {
  const { request, requests } = await setup(t);
  const call = { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'proxy-check', arguments: {} } };
  const rejected = await request('POST', call, 'Bearer invalid-secret');
  assert.equal(rejected.status, 401);
  assert.equal(await rejected.text(), '{"error":"unauthorized"}');
  call.params.arguments = { privateMarker: 'do not echo me' };
  const invalid = await (await request('POST', call)).json();
  assert.equal(invalid.error.code, -32602);
  assert.ok(!JSON.stringify(invalid).includes('privateMarker'));
  assert.equal(requests.length, 1);
});

test('diagnostic SSE replies on a GET stream remain diagnostic; ID reuse restores opaque calls', async t => {
  const { request } = await setup(t, undefined, (req, res, message) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end('id: diagnostic-replay\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 8, result: { tools: [] } }) + '\n\n');
    }
    if (message.method === 'tools/list') { res.writeHead(202); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [], privateMarker: 'keep opaque' } }));
  });
  const ack = await request('POST', { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'proxy-check' } });
  assert.equal(ack.status, 202); await ack.text();
  const replay = await (await request('GET')).text();
  assert.ok(replay.includes('id: diagnostic-replay'));
  const message = JSON.parse(replay.split('\n').find(line => line.startsWith('data: ')).slice(6));
  assert.equal(message.result.structuredContent.upstreamMcp, 'tools/list succeeded');
  const ordinary = await (await request('POST', { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'other' } })).json();
  assert.deepEqual(ordinary.result, { tools: [], privateMarker: 'keep opaque' });
  const afterReuse = await (await request('GET')).text();
  assert.ok(!afterReuse.includes('structuredContent'));
});

test('proxy-check is advertised on the final list page and does not shadow an upstream tool', async t => {
  let collide = false;
  const { request } = await setup(t, undefined, (_req, res, message) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id,
      result: { tools: collide ? [{ name: 'proxy-check' }] : [], ...(message.params?.cursor ? {} : { nextCursor: 'last' }) } }));
  });
  const first = await (await request('POST', { id: 1, method: 'tools/list' })).json();
  assert.deepEqual(first.result.tools, []);
  const last = await (await request('POST', { id: 2, method: 'tools/list', params: { cursor: 'last' } })).json();
  assert.deepEqual(last.result.tools, [PROXY_CHECK_TOOL]);
  collide = true;
  const conflict = await (await request('POST', { id: 3, method: 'tools/call', params: { name: 'proxy-check', arguments: {} } })).json();
  assert.equal(conflict.error.message, 'proxy_check_name_conflict');
});
