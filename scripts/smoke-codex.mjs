// Real CLI, isolated temporary home/workspace, fake MCP and fake model only.
// No account login, paid generation, or live T3 requests.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { PR_WAITING_GUIDANCE, REVIEW_GUIDANCE } from '../src/policy.mjs';
import { resolveOverrides } from '../src/config.mjs';

const realCodex = process.argv[2];
if (!realCodex || !path.isAbsolute(realCodex)) throw new Error('Supply an absolute real Codex path.');
const root = await mkdtemp(path.join(tmpdir(), 't3-codex-proxy-smoke-'));
const home = path.join(root, 'codex-home');
const workspace = path.join(root, 'workspace');
await mkdir(home); await mkdir(workspace);
const fixture = JSON.parse(await readFile(process.argv[3] ? path.resolve(process.argv[3]) :
  new URL('../test/fixtures/t3-guidance.json', import.meta.url), 'utf8'));
const t3Version = process.argv[4] ?? fixture.sourceVersion.replace(/^v/, '');
const sections = fixture.sections ?? [fixture.context];
const overrides = resolveOverrides(process.argv[5] ? JSON.parse(process.argv[5]) : undefined);
let child;
let childExit;
const methods = [];
const modelRequests = [];
let requestDiagnostic = false;
let diagnosticCalled = false;
const server = http.createServer(async (request, response) => {
  if (request.url.startsWith('/responses')) {
    const parts = [];
    for await (const chunk of request) parts.push(chunk);
    const modelRequest = JSON.parse(Buffer.concat(parts));
    modelRequests.push(modelRequest);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    let item = { id: 'msg_fake', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: 'Isolated fixture response.', annotations: [] }] };
    if (requestDiagnostic && !diagnosticCalled) {
      item = { id: 'fc_proxy_check', type: 'custom_tool_call', call_id: 'proxy_check_smoke',
        namespace: 'functions', name: 'exec', status: 'completed',
        input: 'const tool = ALL_TOOLS.find(tool => /proxy[-_]check$/.test(tool.name)); if (!tool) throw new Error("missing proxy diagnostic"); text(await tools[tool.name]({}));' };
      diagnosticCalled = true;
    }
    const event = (type, fields) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
    event('response.created', { response: { id: 'resp_fake', object: 'response', status: 'in_progress', output: [] } });
    event('response.output_item.done', { output_index: 0, item });
    event('response.completed', { response: { id: 'resp_fake', object: 'response', status: 'completed', output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } });
    return response.end();
  }
  if (request.headers.authorization !== 'Bearer isolated-fake-token') { response.writeHead(401); return response.end(); }
  if (request.method !== 'POST') { response.writeHead(405); return response.end(); }
  const parts = [];
  for await (const chunk of request) parts.push(chunk);
  const message = JSON.parse(Buffer.concat(parts));
  methods.push(message.method);
  if (!Object.hasOwn(message, 'id')) { response.writeHead(202); return response.end(); }
  const reply = result => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  };
  if (message.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'isolated-fake-t3', version: '1' } });
  if (message.method === 'tools/list') return reply({ tools: [
    { name: 'delegate_task', description: fixture.delegate_task, inputSchema: { type: 'object', properties: {} } },
    { name: 't3_thread_send', description: fixture.t3_thread_send, inputSchema: { type: 'object', properties: {} } },
    { name: 'watch_pull_request', description: fixture.watch_pull_request, inputSchema: { type: 'object', properties: {} } },
  ] });
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not implemented in isolated fixture' } }));
});

try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  // Use a temporary config so the smoke never reads or changes the live config.
  const wrapperConfig = path.join(root, 'wrapper-config.json');
  await writeFile(wrapperConfig, JSON.stringify({ realCodex, overrides }));
  child = spawn(process.execPath, [fileURLToPath(new URL('../test/fixtures/run-configured-wrapper.mjs', import.meta.url)), wrapperConfig, 'app-server'], {
    cwd: workspace,
    env: { ...process.env, CODEX_HOME: home, T3_CODEX_PROXY_REAL_CODEX: realCodex },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  childExit = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  // Keep real Codex stderr private. Collect only our fixed diagnostic event IDs.
  const wrapperEvents = new Set();
  let stderrTail = '';
  child.stderr.on('data', chunk => {
    stderrTail = (stderrTail + chunk.toString()).slice(-8192);
    for (const match of stderrTail.matchAll(/(?:^|\n)t3-codex-proxy: ([a-z_]+)\r?\n/g)) wrapperEvents.add(match[1]);
  });
  const pending = new Map();
  const completedTurns = [];
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method === 'turn/completed') completedTurns.push(message.params.turn);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(`Codex RPC failed (${message.error.code})`));
    else waiter.resolve(message.result);
  });
  let id = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 20000);
    pending.set(requestId, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id: requestId, method, params }) + '\n');
  });
  const initialized = await call('initialize', { clientInfo: { name: 'T3 Code', version: t3Version }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const config = { 'model_providers.isolated': {
    name: 'Isolated fake model', base_url: `http://127.0.0.1:${server.address().port}`,
    wire_api: 'responses', requires_openai_auth: false,
  }, 'mcp_servers.t3-code': {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    http_headers: { Authorization: 'Bearer isolated-fake-token' }, startup_timeout_sec: 10,
  }, mcp_optional_startup_grace_ms: 10000 };
  const thread = await call('thread/start', { cwd: workspace, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only',
    modelProvider: 'isolated', model: 'gpt-6.1-sol', config });
  assert.ok(thread.thread.id);
  const status = await call('mcpServerStatus/list', { threadId: thread.thread.id });
  const t3 = status.data.find(item => item.name === 't3-code');
  assert.ok(t3, 'Fake t3-code server is visible to real Codex');
  for (const name of ['delegate_task', 't3_thread_send']) {
    const tool = t3.tools[name];
    assert.ok(tool, `${name} loaded by real Codex`);
    if (fixture.toolDescriptionsUnchanged || !overrides.reviewWorkflow) {
      assert.equal(tool.description, fixture[name], `${name}: neutral latest description preserved`);
    } else if (!tool.description.includes(REVIEW_GUIDANCE)) {
      // Only fixture comparisons and fixed event names are safe to disclose.
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.fail(`${name} has unrewritten guidance: ${JSON.stringify({
        wrapperEvents: [...wrapperEvents], methods,
        matchesOriginalFixture: tool.description === fixture[name],
        descriptionLength: tool.description.length,
      })}`);
    }
    assert.deepEqual(tool.inputSchema, { type: 'object', properties: {} });
  }
  assert.ok(t3.tools['proxy-check'], 'Local diagnostic tool loaded by real Codex');
  assert.equal(t3.tools.watch_pull_request.description !== fixture.watch_pull_request, overrides.prWaiting);
  const runTurn = async additionalContext => {
    const result = await call('turn/start', { threadId: thread.thread.id,
      input: [{ type: 'text', text: requestDiagnostic ? 'Call proxy-check and report its diagnostics.' : 'Reply with a short confirmation. Do not use tools.' }],
      ...(additionalContext ? { additionalContext } : {}),
    });
    const deadline = Date.now() + 20000;
    while (!completedTurns.some(turn => turn.id === result.turn.id)) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for isolated fake model turn');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(completedTurns.find(turn => turn.id === result.turn.id).status, 'completed');
  };
  const context = Object.fromEntries(sections.map((value, i) =>
    [`t3_code_orchestration_${String(i + 1).padStart(2, '0')}`, { kind: 'application', value }]));
  context.t3_code_runtime = { kind: 'application', value: fixture.pullRequestInstructions };
  await runTurn(context);
  const oldBullet = fixture.originalReviewText ?? fixture.context.split('\n').find(line => line.startsWith('- For independent'));
  assert.ok(oldBullet, 'Fixture identifies the original conflicting review guidance');
  const developerText = request => JSON.stringify(request.input.filter(item => item.role === 'developer'));
  assert.equal(developerText(modelRequests[0]).includes(REVIEW_GUIDANCE), overrides.reviewWorkflow);
  assert.equal(developerText(modelRequests[0]).includes(oldBullet), !overrides.reviewWorkflow);
  assert.equal(developerText(modelRequests[0]).includes(PR_WAITING_GUIDANCE), overrides.prWaiting);
  await call('thread/inject_items', { threadId: thread.thread.id, items: Object.entries(context).map(([tag, entry], i) => {
    return { type: 'message', role: 'developer', content: [{ type: 'input_text',
      text: `<${tag}>${entry.value}${i === 0 ? '\ncompaction-reinjection-marker' : ''}</${tag}>` }] };
  }) });
  await runTurn();
  assert.equal(modelRequests.length, 2);
  assert.ok(JSON.stringify(modelRequests[1]).includes('compaction-reinjection-marker'));
  assert.equal(developerText(modelRequests[1]).includes(REVIEW_GUIDANCE), overrides.reviewWorkflow);
  assert.equal(developerText(modelRequests[1]).includes(oldBullet), !overrides.reviewWorkflow);
  assert.equal(developerText(modelRequests[1]).includes(PR_WAITING_GUIDANCE), overrides.prWaiting);
  requestDiagnostic = true;
  await runTurn();
  assert.ok(diagnosticCalled);
  const diagnosticOutput = modelRequests.at(-1).input.find(item => item.type === 'custom_tool_call_output' && item.call_id === 'proxy_check_smoke');
  assert.ok(diagnosticOutput, 'Codex sends proxy-check output into the next inference');
  const diagnosticText = JSON.stringify(diagnosticOutput.output);
  assert.ok(diagnosticText.includes('Diagnostic checklist:'), diagnosticText.slice(0, 500));
  assert.ok(diagnosticText.includes('orchestrator_capabilities'));
  assert.ok(diagnosticText.includes('Counts cover the whole wrapper process'));
  assert.ok(diagnosticText.includes('Compatibility: covered by exact-version automated tests.') ||
    diagnosticText.includes('Compatibility: assumed compatible through the latest matching version range.'));
  assert.ok(diagnosticText.includes('Proxy check passed.'));
  assert.ok(diagnosticText.includes('Override checks (2):'));
  assert.ok(methods.includes('initialize') && methods.includes('tools/list'));
  assert.ok(!methods.includes('tools/call'));
  console.log(JSON.stringify({ result: 'passed', t3Version, overrides, codex: initialized.userAgent, checks: [
    'isolated real Codex thread starts through wrapper', 'fake MCP authenticates through local proxy',
    'configured tool-description rewrites match explicit settings',
    'tool input schemas are unchanged',
    'rewritten developer context reaches fake model on turn/start',
    'rewritten developer reinjection reaches fake model on next turn',
    'agent calls local proxy-check and its diagnostic checklist reaches the next inference',
    'all model responses are local fixtures; no live T3 tool called',
  ] }, null, 2));
} finally {
  child?.kill('SIGTERM');
  if (childExit) {
    const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
    await childExit; clearTimeout(kill);
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
