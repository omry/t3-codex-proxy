import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import { REVIEW_GUIDANCE } from '../src/policy.mjs';

const binary = fileURLToPath(new URL('../bin/t3-codex-proxy.mjs', import.meta.url));
const fake = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance.json', import.meta.url)));

function launch(t, args = ['app-server'], realCodex = fake) {
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

test('version and non-app-server exit codes pass through', { timeout: 10000 }, async t => {
  const version = launch(t, ['--version']);
  assert.equal((await version.exit).code, 0);
  assert.equal(version.raw(), 'codex-cli fake\n');
  const error = launch(t, ['--fake-exit']);
  assert.equal((await error.exit).code, 23);
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
