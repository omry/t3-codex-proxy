import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { startMcpProxy } from '../src/mcp-proxy.mjs';
import { createPolicy } from '../src/policy.mjs';
import { PROXY_CHECK_TOOL, proxyCheckResult } from '../src/diagnostics.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance-0.1.3.json', import.meta.url)));
const environmentFixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance-4580.json', import.meta.url)));
const waitFixture = JSON.parse(readFileSync(new URL('./fixtures/t3-wait-conflicts.json', import.meta.url)));

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
  const environmentContext = environmentFixture.sections.find(section => section.includes('Another machine: `t3_environment_links`'));
  policy.rewriteDeveloperContext({ method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: fixture.context },
    ...(environmentContext ? { t3_code_orchestration_02: { kind: 'application', value: environmentContext } } : {}),
    t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
    t3_code_orchestration_03: { kind: 'application', value: fixture.sections[2] },
    t3_code_tools: { kind: 'application', value: fixture.browserTools },
  } } });
  const proxy = await startMcpProxy({ rewriteToolsList: policy.rewriteToolsList, diagnostics: policy.diagnostics,
    shouldRewriteToolResult: policy.shouldRewriteToolResult, rewriteToolResult: policy.rewriteToolResult });
  const url = proxy.register(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(async () => { await proxy.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const request = (method, message, auth = 'Bearer test-secret') => fetch(url, { method, headers: {
    authorization: auth, 'content-type': 'application/json', 'mcp-session-id': 'session-1',
  }, ...(message ? { body: JSON.stringify(message) } : {}) });
  return { requests, request };
}

for (const reviewWorkflow of [false, true]) for (const prWaiting of [false, true]) for (const browserRouting of [false, true]) for (const environmentRouting of [false, true]) {
  test(`proxy-check reports actual config and model checklist: review=${reviewWorkflow}, PR=${prWaiting}, browser=${browserRouting}, environment=${environmentRouting}`, async t => {
    const { requests, request } = await setup(t, { reviewWorkflow, prWaiting, browserRouting, environmentRouting });
    const list = await (await request('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    assert.deepEqual(list.result.tools.at(-1), PROXY_CHECK_TOOL);
    const check = await (await request('POST', { jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'proxy-check', arguments: {} } })).json();
    const data = check.result.structuredContent;
    assert.equal(check.id, 2);
    assert.equal(data.t3Version, '0.1.3');
    assert.equal(data.compatibility, 'tested');
    assert.deepEqual(data.writableRoots, { paths: [], entries: [], configured: 0, processWritable: 0, status: 'not_configured', agentCheck: 'not_applicable' });
    assert.deepEqual(data.overrides, { reviewWorkflow, prWaiting, browserRouting, environmentRouting, prToolRouting: true, deviceRouting: true });
    assert.equal(data.upstreamMcp, 'tools/list succeeded');
    assert.equal(data.observations.reviewWorkflow.rewrites > 0, reviewWorkflow);
    assert.equal(data.observations.prWaiting.rewrites > 0, prWaiting);
    assert.equal(data.observations.prWaiting.unrecognized, 0);
    assert.equal(data.observations.browserRouting.rewrites > 0, browserRouting);
    assert.equal(data.observations.browserRouting.unrecognized, 0);
    assert.equal(data.observations.environmentRouting.rewrites > 0, environmentRouting);
    assert.equal(data.observations.environmentRouting.unrecognized, 0);
    assert.deepEqual(Object.keys(data.expected).sort(), [
      'browserRouting', 'delegateWaitingRecovery', 'deviceRouting', 'environmentRouting', 'fixerAssignment',
      'prToolRouting', 'prWaiting', 'reviewToolRouting', 'reviewWorkflow',
    ]);
    assert.ok(data.expected.reviewWorkflow.includes(reviewWorkflow ? 'workflow controls' : 'preserves T3'));
    assert.ok(data.expected.prWaiting.includes(prWaiting ? 'workflow controls' : 'preserves T3'));
    assert.ok(data.expected.browserRouting.includes(browserRouting ? 'authenticated API, CLI, or connector' : 'preserves T3'));
    assert.ok(data.expected.environmentRouting.includes(environmentRouting ? 'T3 environment tools' : 'preserves T3'));
    assert.ok(data.expected.reviewToolRouting.includes(reviewWorkflow ? 'available review tools' : 'preserves T3'));
    assert.ok(data.expected.fixerAssignment.includes(reviewWorkflow ? 'assigns who fixes' : 'preserves T3'));
    assert.ok(data.expected.delegateWaitingRecovery.includes(reviewWorkflow ? 'bounded delegate waits' : 'preserves T3'));
    const text = check.result.content[0].text;
    assert.ok(text.startsWith('Proxy check: local facts\nT3 version: 0.1.3\nCompatibility: covered by exact-version automated tests.'));
    assert.ok(text.includes(`Review workflow override: ${reviewWorkflow ? 'enabled' : 'disabled'}`));
    assert.ok(text.includes(`PR-wait override: ${prWaiting ? 'enabled' : 'disabled'}`));
    assert.ok(text.includes(`Browser-routing override: ${browserRouting ? 'enabled' : 'disabled'}`));
    assert.ok(text.includes(`Environment-routing override: ${environmentRouting ? 'enabled' : 'disabled'}`));
    assert.ok(text.includes('Writable roots (per directory):\n- none configured'));
    assert.ok(text.includes('Sandbox write check: not applicable; no writable roots are configured.'));
    assert.ok(text.includes('Start with "✅ Proxy check passed."'));
    assert.ok(text.includes('"❌ Proxy check found a problem."'));
    assert.ok(text.includes('"❓ Proxy check incomplete."'));
    assert.ok(text.includes('✅ for PASS, ❌ for FAIL, or ❓ for UNKNOWN'));
    assert.ok(text.includes('Keep the text labels alongside the icons; a disabled override does not mean FAIL'));
    assert.ok(text.includes('There are exactly nine compatibility checks'));
    assert.ok(text.includes('"Compatibility checks (9):" and exactly nine bullets'));
    for (const label of [
      'Review context and continuity', 'PR waiting', 'Browser routing',
      'Review-tool routing', 'Fixer assignment', 'Delegate waiting and recovery', 'Environment routing',
    ]) assert.ok(text.includes(`"${label}"`), label);
    assert.ok(!text.includes('"not overridden"'));
    assert.ok(text.includes('Checks 1, 4, 5, and 6 use the reviewWorkflow override'));
    assert.ok(text.includes('Restrictive guidance that requires ending the turn'));
    assert.ok(text.includes('Do not claim that this proxy fixes delegation deadlines or guarantees timers'));
    assert.ok(text.includes('only when the installation works and all nine compatibility checks pass'));
    assert.ok(!text.includes('"Override checks (3):"'));
    assert.ok(text.includes('Do not give installation facts PASS labels or mix them into the compatibility list'));
    assert.ok(text.includes('Do not show raw counters'));
    assert.ok(!text.includes('"rewrites":') && !text.includes('"tested":'));
    assert.ok(text.includes('Call orchestrator_capabilities once'));
    assert.ok(text.includes('Do not infer received guidance from config, expected text, or rewrite counts alone'));
    assert.ok(text.includes('PASS requires the received machine-routing context to contain the replacement guidance and omit both original unconditional-linking bullets'));
    assert.ok(text.includes('UNKNOWN means no machine-routing context is visible'));
    assert.ok(!text.includes('test-secret') && !text.includes('/mcp'));
    assert.equal(requests.length, 2);
    assert.ok(requests.every(x => x.message.method === 'tools/list'));
    assert.equal(requests[1].headers.authorization, 'Bearer test-secret');
    assert.equal(requests[1].headers['mcp-session-id'], 'session-1');
    assert.equal(Number(requests[1].headers['content-length']), Buffer.byteLength(JSON.stringify(requests[1].message)));
  });
}

test('proxy-check no longer detects the repaired waiting metadata and still requires context review', async t => {
  const { request } = await setup(t, undefined, (_req, res, message) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: waitFixture.tools } }));
  });
  const response = await (await request('POST', { jsonrpc: '2.0', id: 19, method: 'tools/call',
    params: { name: 'proxy-check', arguments: {} } })).json();
  const evidence = response.result.structuredContent.delegateWaitingEvidence;
  assert.equal(evidence?.status, 'unknown');
  assert.deepEqual(evidence.findings, []);
  assert.deepEqual(evidence.missingTools, []);
  const text = response.result.content[0].text;
  assert.ok(text.includes('Delegate waiting evidence: UNKNOWN'));
  assert.ok(!text.includes('Completion wakes this thread, so end your turn. Do not wait on it or poll it.'));
  assert.ok(!text.includes('On timeout, with `next` end your turn; without, call again.'));
  assert.ok(!text.includes('A next suggestion in an unchanged tool result does not by itself fail the check'));
  const listed = await (await request('POST', { jsonrpc: '2.0', id: 20, method: 'tools/list' })).json();
  assert.notEqual(listed.result.tools[0].outputSchema.properties.next.const, waitFixture.tools[0].outputSchema.properties.next.const);
  assert.notEqual(listed.result.tools[2].description, waitFixture.tools[2].description);
  assert.deepEqual(evidence.tools, listed.result.tools.slice(0, 3).map(tool => ({
    name: tool.name, description: tool.description, outputSchema: tool.outputSchema ?? null,
  })));
  assert.ok(text.includes(JSON.stringify(evidence.tools)));
});

test('waiting diagnostic exposes unfamiliar schema instructions for inspection without implying a pass', () => {
  const outputSchema = {
    allOf: [{ properties: { next: { description: 'An unfamiliar waiting instruction.', type: 'string' } } }],
    $defs: { task: { properties: { waitTimedOut: { type: 'boolean' } } } },
  };
  const tool = { name: 'delegate_task', description: 'Follow the workflow when waiting.', outputSchema,
    inputSchema: { privateMarker: 'unrelated input' }, annotations: { privateMarker: 'unrelated annotation' } };
  const metadata = { tools: [tool, { name: 'other', description: 'unrelated tool' }], privateMarker: 'unrelated response' };
  const original = structuredClone(metadata);
  const result = proxyCheckResult(createPolicy('0.1.3').diagnostics(), metadata);
  const evidence = result.structuredContent.delegateWaitingEvidence;
  assert.equal(evidence.status, 'unknown');
  assert.deepEqual(evidence.tools, [{ name: tool.name, description: tool.description, outputSchema }]);
  assert.deepEqual(evidence.missingTools, ['task_status', 't3_thread_wait']);
  assert.deepEqual(metadata, original);
  assert.ok(result.content[0].text.includes(JSON.stringify(evidence.tools)));
  assert.ok(!JSON.stringify(result).includes('privateMarker'));
  assert.ok(!JSON.stringify(result).includes('unrelated tool'));
});

test('waiting diagnostic distinguishes absent output schemas from unavailable tool metadata', () => {
  const policy = createPolicy('0.1.3');
  const tool = { name: 't3_thread_wait', description: 'Follow the workflow when waiting.' };
  const complete = proxyCheckResult(policy.diagnostics(), { tools: [tool] });
  const evidence = complete.structuredContent.delegateWaitingEvidence;
  assert.deepEqual(evidence.tools, [{ ...tool, outputSchema: null }]);
  assert.ok(!evidence.missingTools.includes(tool.name));
  assert.equal(evidence.listComplete, true);
  const unavailable = proxyCheckResult(policy.diagnostics());
  assert.deepEqual(unavailable.structuredContent.delegateWaitingEvidence.tools, []);
  assert.equal(unavailable.structuredContent.delegateWaitingEvidence.listComplete, false);
  assert.ok(unavailable.structuredContent.delegateWaitingEvidence.missingTools.includes(tool.name));
  const partial = proxyCheckResult(policy.diagnostics(), { tools: [tool], nextCursor: 'more' });
  assert.equal(partial.structuredContent.delegateWaitingEvidence.listComplete, false);
  const missingDescription = proxyCheckResult(policy.diagnostics(), { tools: [{ name: tool.name }] });
  assert.equal(missingDescription.structuredContent.delegateWaitingEvidence.tools[0].description, null);
  assert.ok(missingDescription.structuredContent.delegateWaitingEvidence.missingTools.includes(tool.name));
  for (const result of [complete, unavailable, partial, missingDescription]) {
    assert.equal(result.structuredContent.delegateWaitingEvidence.status, 'unknown');
    const text = result.content[0].text;
    assert.ok(text.includes('outputSchema: null means upstream defines no output schema'));
    assert.ok(text.includes('does not prove the same metadata reached the direct tool definitions'));
  }
});

test('proxy-check still fails when a conflicting schema is outside the supported rewrite shape', async t => {
  const tools = structuredClone(waitFixture.tools);
  tools[0].outputSchema = { allOf: [tools[0].outputSchema] };
  const { request } = await setup(t, undefined, (_req, res, message) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools } }));
  });
  const response = await (await request('POST', { jsonrpc: '2.0', id: 22, method: 'tools/call',
    params: { name: 'proxy-check', arguments: {} } })).json();
  assert.equal(response.result.structuredContent.delegateWaitingEvidence.status, 'fail');
  assert.deepEqual(response.result.structuredContent.delegateWaitingEvidence.tools[0].outputSchema, tools[0].outputSchema);
  assert.ok(response.result.content[0].text.includes('Delegate waiting and recovery: FAIL'));
});

test('proxy-check detects each unchanged wait surface independently', () => {
  for (const name of ['delegate_task', 'task_status', 't3_thread_wait']) {
    const tool = waitFixture.tools.find(tool => tool.name === name);
    const result = proxyCheckResult(createPolicy('0.1.3').diagnostics(), { tools: [tool] });
    const evidence = result.structuredContent.delegateWaitingEvidence;
    assert.equal(evidence.status, 'fail', name);
    assert.ok(evidence.findings.every(finding => finding.tool === name));
    assert.ok(result.content[0].text.includes('Delegate waiting and recovery: FAIL'));
  }
});

test('disabled waiting override reports preserved conflicts without failing passthrough', async t => {
  const { request } = await setup(t, { reviewWorkflow: false }, (_req, res, message) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: waitFixture.tools } }));
  });
  const response = await (await request('POST', { jsonrpc: '2.0', id: 21, method: 'tools/call',
    params: { name: 'proxy-check', arguments: {} } })).json();
  const evidence = response.result.structuredContent.delegateWaitingEvidence;
  assert.equal(evidence.status, 'disabled');
  assert.equal(evidence.findings.length, 3);
  assert.deepEqual(evidence.tools, waitFixture.tools.map(tool => ({
    name: tool.name, description: tool.description, outputSchema: tool.outputSchema ?? null,
  })));
  assert.ok(!response.result.content[0].text.includes('Delegate waiting and recovery: FAIL'));
});

test('missing, partial and conflict-free waiting metadata never imply a diagnostic pass', () => {
  const policy = createPolicy('0.1.3');
  const tools = waitFixture.tools.map(({ name, inputSchema }) => ({
    name, inputSchema, description: 'Follow the workflow when waiting.',
  }));
  for (const metadata of [undefined, { tools: [] }, { tools: tools.slice(0, 2), nextCursor: 'more' }, { tools }]) {
    const result = proxyCheckResult(policy.diagnostics(), metadata);
    const evidence = result.structuredContent.delegateWaitingEvidence;
    assert.equal(evidence.status, 'unknown');
    assert.deepEqual(evidence.findings, []);
    assert.ok(result.content[0].text.includes('Delegate waiting evidence: UNKNOWN'));
    if (metadata?.nextCursor) assert.equal(evidence.listComplete, false);
    if (!metadata || metadata.tools.length !== 3) assert.ok(evidence.missingTools.length > 0);
  }
});

test('unrecognized delegate result shapes preserve timeout, cancellation and next fields verbatim', async t => {
  const result = { content: [{ type: 'text', text: 'running delegate result' }], structuredContent: {
    taskId: 'same-task', status: 'running', waitTimedOut: true, workState: 'working',
    next: 'Completion wakes this thread, so end your turn. Do not wait on it or poll it.',
    hasPendingChildRuns: true, pendingApproval: null,
  } };
  const { request } = await setup(t, undefined, (req, res, message) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  const response = await (await request('POST', { jsonrpc: '2.0', id: 20, method: 'tools/call',
    params: { name: 'task_status', arguments: { taskId: 'same-task' } } })).json();
  assert.deepEqual(response.result, result);
});

test('proxy-check supplies an agent-side writable-root test when roots are configured', () => {
  const result = proxyCheckResult({
    ...createPolicy('0.1.3').diagnostics(),
    writableRoots: {
      paths: ['/tmp/root with spaces'], entries: [{ path: '/tmp/root with spaces', processWritable: true }],
      configured: 1, processWritable: 1, status: 'ready',
    },
  });
  assert.equal(result.structuredContent.writableRoots.agentCheck, 'required');
  assert.deepEqual(result.structuredContent.writableRoots.entries, [{
    path: '/tmp/root with spaces', processWritable: true, status: 'pending', agentCheck: 'required',
  }]);
  assert.ok(result.content[0].text.includes('Sandbox write check: pending agent verification for 1 configured root(s).'));
  assert.ok(result.content[0].text.includes('Writable roots (per directory):\n- ❓ [/tmp/root with spaces](</tmp/root with spaces>): proxy writable; Codex turn pending marker test'));
  assert.ok(result.content[0].text.includes("mktemp --tmpdir=\"$root\" \".t3-codex-proxy-check.XXXXXX\""));
  assert.ok(result.content[0].text.includes("'/tmp/root with spaces'"));
  assert.ok(result.content[0].text.includes('exactly one status symbol at the start'));
  assert.ok(result.content[0].text.includes('Do not show separate symbols for the two checks'));
  assert.ok(result.content[0].text.includes('Render each full absolute directory path as a Markdown link'));
  assert.ok(result.content[0].text.includes('explain in plain text which check failed or is missing'));
});

test('proxy-check explains a failed proxy-process root with one non-green symbol', () => {
  const result = proxyCheckResult({
    ...createPolicy('0.1.3').diagnostics(),
    writableRoots: {
      paths: ['/unavailable'], entries: [{ path: '/unavailable', processWritable: false }],
      configured: 1, processWritable: 0, status: 'unavailable',
    },
  });
  assert.deepEqual(result.structuredContent.writableRoots.entries, [{
    path: '/unavailable', processWritable: false, status: 'fail', agentCheck: 'required',
  }]);
  assert.ok(result.content[0].text.includes('- ❌ [/unavailable](</unavailable>): proxy process cannot write; Codex turn marker test still required'));
});

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
  assert.ok(text.includes('matching nightly'));
  assert.ok(text.includes('must not cause UNKNOWN, FAIL, or an upgrade warning'));
});

test('missing, unmatched and unlisted stable versions report unsupported', () => {
  for (const version of [undefined, 'invalid', '0.1.3-nightly.20261025.3660', '0.1.4', '8.0.0']) {
    const result = proxyCheckResult(createPolicy(version).diagnostics());
    assert.equal(result.structuredContent.compatibility, 'unsupported');
    assert.ok(result.content[0].text.includes('Compatibility: unsupported. No explicit stable-version entry or matching prerelease range'));
    assert.ok(result.content[0].text.includes('If no stable entry or range matches, report unsupported and treat it as an installation failure'));
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
