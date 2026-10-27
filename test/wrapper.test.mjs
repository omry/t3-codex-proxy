import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { REVIEW_GUIDANCE } from '../src/policy.mjs';

const binary = fileURLToPath(new URL('../bin/t3-codex-proxy.mjs', import.meta.url));
const fake = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance.json', import.meta.url)));

function launch(t, args = ['app-server'], realCodex = fake, t3Version = fixture.sourceVersion.slice(1)) {
  const child = spawn(process.execPath, [binary, ...args], { env: { ...process.env, T3_CODEX_PROXY_REAL_CODEX: realCodex }, stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = [];
  const waiters = new Set();
  let raw = '', stderr = '', pending = '', closed = false;
  const exit = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
  child.stdout.on('data', chunk => {
    raw += chunk; pending += chunk;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index); pending = pending.slice(index + 1);
      try { messages.push(JSON.parse(line)); } catch { /* Keep raw output. */ }
    }
    for (const check of waiters) check();
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  if (args[0] === 'app-server') child.stdin.write(JSON.stringify({ id: 'test-initialize', method: 'initialize',
    params: { clientInfo: { name: 'T3 Code', version: t3Version } } }) + '\n');
  t.after(async () => { if (!closed) { child.kill('SIGKILL'); await exit; } });
  function waitFor(predicate) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { waiters.delete(check); reject(new Error(`fake peer response timeout; ${stderr}`)); }, 5000);
      function check() {
        const message = messages.find(predicate);
        if (message) { clearTimeout(timeout); waiters.delete(check); resolve(message); }
      }
      waiters.add(check); check();
    });
  }
  return { child, exit, waitFor, send: message => child.stdin.write(JSON.stringify(message) + '\n'),
    raw: () => raw, stderr: () => stderr };
}

async function launchIsolatedPublic(t, realCodex, args = ['app-server'], config = { realCodex, autoUpdate: true }) {
  const root = await mkdtemp(path.join(tmpdir(), 't3-proxy-legacy-public-'));
  await mkdir(path.join(root, 'bin'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  for (const file of ['bin/t3-codex-proxy.mjs', 'src/config.mjs', 'src/framing.mjs',
    'src/mcp-proxy.mjs', 'src/policy.mjs', 'src/compatibility.mjs', 'src/diagnostics.mjs', 'src/wrapper.mjs']) {
    await copyFile(file, path.join(root, file));
  }
  await chmod(path.join(root, 'bin/t3-codex-proxy.mjs'), 0o755);
  await writeFile(path.join(root, 'config.local.json'), JSON.stringify(config));
  const child = spawn(process.execPath, [path.join(root, 'bin/t3-codex-proxy.mjs'), ...args], {
    cwd: root, env: { ...process.env, T3_CODEX_PROXY_REAL_CODEX: '' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '', closed = false;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exit = new Promise(resolve => child.once('close', (code, signal) => {
    closed = true; resolve({ code, signal, stdout, stderr });
  }));
  t.after(async () => {
    if (!closed) child.kill('SIGKILL');
    await exit;
    await rm(root, { recursive: true, force: true });
  });
  return { child, exit };
}

async function fakeGlobalInstallation(t) {
  const root = await mkdtemp(path.join(tmpdir(), 't3-proxy-legacy-install-'));
  const prefix = path.join(root, 'node with spaces');
  const codex = path.join(prefix, 'lib/node_modules/@openai/codex');
  await mkdir(path.join(codex, 'bin'), { recursive: true });
  await mkdir(path.join(prefix, 'bin'), { recursive: true });
  const entry = path.join(codex, 'bin/codex.js');
  await copyFile(fake, entry);
  await chmod(entry, 0o755);
  const binary = path.join(prefix, 'bin/codex');
  await symlink(entry, binary);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, prefix, binary };
}

test('binary launches fake app-server; developer rewrite, compaction and interleaved approval remain correct', { timeout: 10000 }, async t => {
  const peer = launch(t);
  peer.send({ id: 1, method: 'turn/start', params: {
    input: [{ type: 'text', text: 'private-prompt-marker' }],
    additionalContext: { t3_code_orchestration_01: { kind: 'application', value: fixture.context } },
  } });
  const turn = (await peer.waitFor(x => x.id === 1)).result.received;
  assert.ok(turn.params.additionalContext.t3_code_orchestration_01.value.includes(REVIEW_GUIDANCE));
  assert.equal(turn.params.input[0].text, 'private-prompt-marker');
  peer.send({ id: 2, method: 'thread/inject_items', params: { items: [{ type: 'message', role: 'developer', content: [
    { type: 'input_text', text: `<t3_code_orchestration_01>${fixture.context}</t3_code_orchestration_01>` },
  ] }] } });
  assert.ok((await peer.waitFor(x => x.id === 2)).result.received.params.items[0].content[0].text.includes(REVIEW_GUIDANCE));
  peer.send({ id: 3, method: 'server-request-test' });
  await peer.waitFor(x => x.id === 'server-1');
  assert.ok(peer.raw().includes(' { "id": "server-1", "method": "item/commandExecution/requestApproval", "params": {} }\n'));
  peer.send({ id: 'server-1', result: { decision: 'accept' } });
  assert.deepEqual((await peer.waitFor(x => x.id === 'server-1' && x.result)).result.received,
    { id: 'server-1', result: { decision: 'accept' } });
  peer.child.stdin.end();
  assert.equal((await peer.exit).code, 0);
  assert.ok(!peer.stderr().includes('private-prompt-marker'));
});

test('public binary loads independent overrides from its local config', { timeout: 10000 }, async t => {
  for (const reviewWorkflow of [false, true]) for (const prWaiting of [false, true]) {
    const peer = await launchIsolatedPublic(t, fake, ['app-server'], { realCodex: fake, overrides: { reviewWorkflow, prWaiting } });
    peer.child.stdin.end([
      { id: 0, method: 'initialize', params: { clientInfo: { name: 'T3 Code', version: fixture.sourceVersion.slice(1) } } },
      { id: 1, method: 'turn/start', params: { additionalContext: {
        t3_code_orchestration_01: { kind: 'application', value: fixture.context },
        t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
      } } },
      { id: 2, method: 'thread/inject_items', params: { items: [{ type: 'message', role: 'developer', content: [
        { type: 'input_text', text: `<t3_code_runtime>${fixture.pullRequestInstructions}</t3_code_runtime>` },
      ] }] } },
    ].map(message => JSON.stringify(message)).join('\n') + '\n');
    const result = await peer.exit;
    assert.equal(result.code, 0);
    const replies = result.stdout.trim().split('\n').map(JSON.parse);
    const context = replies.find(x => x.id === 1).result.received.params.additionalContext;
    assert.equal(context.t3_code_orchestration_01.value.includes(REVIEW_GUIDANCE), reviewWorkflow);
    assert.equal(context.t3_code_runtime.value !== fixture.pullRequestInstructions, prWaiting);
    assert.equal(replies.find(x => x.id === 2).result.received.params.items[0].content[0].text,
      `<t3_code_runtime>${context.t3_code_runtime.value}</t3_code_runtime>`);
  }
});

test('wrapper-owned MCP proxy is used by child and closes with child', { timeout: 10000 }, async t => {
  const upstream = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer private-token-marker');
    for await (const _ of req) { /* Drain. */ }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 99, result: { tools: [{ name: 'delegate_task', description: fixture.delegate_task }] } }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const peer = launch(t);
  peer.send({ id: 1, method: 'thread/start', params: { config: { 'mcp_servers.t3-code': {
    url: `http://127.0.0.1:${upstream.address().port}/mcp`, http_headers: { Authorization: 'Bearer private-token-marker' },
  } } } });
  const settings = (await peer.waitFor(x => x.id === 1)).result.received.params.config['mcp_servers.t3-code'];
  assert.match(settings.url, /\/t3-codex-proxy\/[0-9a-f]+\/mcp$/);
  peer.send({ id: 2, method: 'http-test', params: { url: settings.url, authorization: settings.http_headers.Authorization } });
  assert.ok((await peer.waitFor(x => x.id === 2)).result.result.tools[0].description.includes(REVIEW_GUIDANCE));
  peer.child.stdin.end(); assert.equal((await peer.exit).code, 0);
  await assert.rejects(fetch(settings.url));
  assert.ok(!peer.stderr().includes('private-token-marker'));
});

test('concurrent old and current wrappers select independent policies and preserve initialization', { timeout: 10000 }, async t => {
  const current = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance-0.1.3.json', import.meta.url)));
  await Promise.all([fixture, current].map(async source => {
    const version = source.sourceVersion.slice(1);
    const peer = launch(t, ['app-server'], fake, version);
    const initialize = (await peer.waitFor(x => x.id === 'test-initialize')).result.received;
    assert.deepEqual(initialize.params.clientInfo, { name: 'T3 Code', version });
    // A second initialize must not switch this process's selected T3 version.
    peer.send({ id: 90, method: 'initialize', params: { clientInfo: { name: 'T3 Code', version: source === fixture ? '0.1.3' : fixture.sourceVersion.slice(1) } } });
    await peer.waitFor(x => x.id === 90);
    peer.send({ id: 91, method: 'turn/start', params: {
      additionalContext: { t3_code_orchestration_01: { kind: 'application', value: source.context } },
    } });
    const turn = (await peer.waitFor(x => x.id === 91)).result.received;
    assert.ok(turn.params.additionalContext.t3_code_orchestration_01.value.includes(REVIEW_GUIDANCE));
    assert.ok(!peer.stderr().includes('unrecognized_review_guidance'));
    peer.child.stdin.end();
    assert.equal((await peer.exit).code, 0);
  }));
});

test('missing or invalid T3 version warns and forwards guidance without a legacy fallback', { timeout: 10000 }, async t => {
  for (const version of [null, 'unknown-private-marker']) {
    const peer = launch(t, ['app-server'], fake, version);
    peer.send({ id: 92, method: 'turn/start', params: {
      additionalContext: { t3_code_orchestration_01: { kind: 'application', value: fixture.context } },
    } });
    const turn = (await peer.waitFor(x => x.id === 92)).result.received;
    assert.equal(turn.params.additionalContext.t3_code_orchestration_01.value, fixture.context);
    peer.child.stdin.end();
    assert.equal((await peer.exit).code, 0);
    assert.ok(peer.stderr().includes('unsupported_t3_version'));
    assert.ok(peer.stderr().includes('unrecognized_review_guidance'));
    assert.ok(!peer.stderr().includes('private-marker'));
  }
});

test('version and non-app-server exit codes pass through', { timeout: 10000 }, async t => {
  const version = launch(t, ['--version']);
  assert.equal((await version.exit).code, 0);
  assert.equal(version.raw(), 'codex-cli fake\n');
  const error = launch(t, ['--fake-exit']);
  assert.equal((await error.exit).code, 23);
});

test('legacy updater settings do not affect an installed public launch or read-only prefix', { timeout: 10000 }, async t => {
  const install = await fakeGlobalInstallation(t);
  await chmod(install.prefix, 0o555);
  const peer = await launchIsolatedPublic(t, install.binary, ['app-server'], { realCodex: install.binary, autoUpdate: true });
  peer.child.stdin.end('{"id":1,"method":"legacy-config"}\n');
  const result = await peer.exit;
  await chmod(install.prefix, 0o755);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).result.loadedVersion, 'codex-cli fake');
  await assert.rejects(readFile(path.join(install.prefix, 'updates.jsonl')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(install.prefix, '.t3-codex-proxy-update.lock')), { code: 'ENOENT' });
});

test('candidate-layout spawn failures stay fixed and private', { timeout: 10000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 't3-proxy-candidate-failures-'));
  const prefix = path.join(root, 'prefix');
  const denied = path.join(prefix, 'bin', 'denied-private-marker');
  const missing = path.join(prefix, 'bin', 'missing-private-marker');
  await mkdir(path.dirname(denied), { recursive: true });
  await writeFile(denied, '#!/usr/bin/env node\n');
  await chmod(denied, 0o644);
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const realCodex of [denied, missing]) {
    const peer = await launchIsolatedPublic(t, realCodex, ['app-server', '--secret=private-marker'], { realCodex, autoUpdate: true });
    peer.child.stdin.end();
    const result = await peer.exit;
    assert.equal(result.code, 1);
    assert.equal(result.stderr, 't3-codex-proxy: startup_or_protocol_failed\n');
    assert.ok(!result.stderr.includes('private-marker'));
    assert.ok(!result.stderr.includes('Error:') && !result.stderr.includes('spawnargs'));
  }
});

test('invalid transport and missing executable exit cleanly without disclosing parameters', { timeout: 10000 }, async t => {
  const transport = launch(t, ['app-server', '--listen', 'ws://private-marker:9999']);
  assert.equal((await transport.exit).code, 1);
  assert.equal(transport.stderr(), 't3-codex-proxy: startup_or_protocol_failed\n');
  const missing = launch(t, ['app-server'], '/tmp/nonexistent-codex-private-marker');
  missing.child.stdin.end();
  assert.equal((await missing.exit).code, 1);
  assert.ok(!missing.stderr().includes('private-marker'));
});

test('SIGTERM and ignored EOF terminate real child and local proxy', { timeout: 10000 }, async t => {
  const signal = launch(t);
  signal.send({ id: 1, method: 'ready' }); await signal.waitFor(x => x.id === 1);
  signal.child.kill('SIGTERM');
  assert.equal((await signal.exit).code, 143);
  const ignored = launch(t, ['app-server', '--fake-ignore-eof']);
  ignored.send({ id: 1, method: 'ready' }); await ignored.waitFor(x => x.id === 1);
  ignored.child.stdin.end();
  assert.equal((await ignored.exit).code, 137);
});

test('app-server shutdown owns npm-style launcher descendants', { timeout: 20000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 't3-proxy-descendants-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const launcher = path.join(root, 'launcher.mjs');
  await writeFile(launcher, `#!/usr/bin/env node
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--input-type=module', '-e',
  "process.on('SIGTERM',()=>{});console.log(JSON.stringify({pid:process.pid,launcher:process.ppid}));setInterval(()=>{},1000)"],
  { stdio: ['inherit', 'inherit', 'inherit'] });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.stdin.on('data', () => process.exit(0));
child.on('exit', () => process.exit());
`, { mode: 0o755 });
  const config = path.join(root, 'config.json');
  await writeFile(config, JSON.stringify({ realCodex: launcher }));
  for (const trigger of ['signal', 'eof', 'launcher-exit']) {
    const peer = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/run-configured-wrapper.mjs', import.meta.url)),
      config, 'app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
    peer.stderr.resume();
    let closed = false, nativePid, launcherPid;
    const exit = new Promise(resolve => peer.once('close', code => { closed = true; resolve(code); }));
    t.after(async () => {
      if (!closed) peer.kill('SIGKILL');
      for (const pid of [nativePid, launcherPid]) {
        if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited. */ } }
      }
      await exit;
    });
    const ready = await new Promise((resolve, reject) => {
      let raw = '';
      const timer = setTimeout(() => reject(new Error('launcher readiness timeout')), 3000);
      peer.stdout.on('data', chunk => {
        raw += chunk;
        if (!raw.includes('\n')) return;
        clearTimeout(timer); resolve(JSON.parse(raw.trim()));
      });
    });
    nativePid = ready.pid; launcherPid = ready.launcher;
    if (trigger === 'signal') peer.kill('SIGTERM');
    else if (trigger === 'eof') peer.stdin.end();
    else peer.stdin.write('{}\n');
    let timer;
    const code = await Promise.race([exit, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${trigger}: descendant prevented shutdown`)), 6500);
    })]).finally(() => clearTimeout(timer));
    assert.equal(code, trigger === 'launcher-exit' ? 0 : 137);
    try {
      const stat = await readFile(`/proc/${nativePid}/stat`, 'utf8');
      assert.equal(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0], 'Z');
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
});
