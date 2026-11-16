import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const binary = fileURLToPath(new URL('../bin/t3-codex-proxy.mjs', import.meta.url));

test('explicit configure page is loopback-bound, origin-checked and writes private config', { timeout: 10000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 't3-proxy-configure-'));
  const config = path.join(root, 'config.json');
  const child = spawn(process.execPath, [binary, 'configure'], {
    env: { ...process.env, T3_CODEX_PROXY_CONFIG: config }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let closed = false;
  child.once('close', () => { closed = true; });
  t.after(async () => {
    if (!closed) { child.kill('SIGKILL'); await new Promise(resolve => child.once('close', resolve)); }
    await rm(root, { recursive: true, force: true });
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`configure URL timeout: ${output}`)), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) { clearTimeout(timer); resolve(output.trim().replace(/^t3-codex-proxy: open /, '')); }
    });
    child.once('error', reject);
  });
  const url = await ready;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/setup\/[0-9a-f]{64}$/);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(page.headers.get('content-security-policy'), /script-src 'nonce-[0-9a-f]+/);
  const pageText = await page.text();
  assert.ok(pageText.includes('T3 Codex Proxy setup'));
  assert.ok(pageText.includes('id="environmentRouting"'));
  const forbidden = await fetch(url + '/config', { method: 'POST', headers: {
    origin: 'http://evil.invalid', 'content-type': 'application/json',
  }, body: JSON.stringify({ realCodex: '/bin/sh' }) });
  assert.equal(forbidden.status, 404);
  assert.equal((await fetch(url + '/config')).status, 200);
  const saved = await fetch(url + '/config', { method: 'POST', headers: {
    origin: new URL(url).origin, 'content-type': 'application/json',
  }, body: JSON.stringify({ realCodex: '/bin/sh', additionalWritableRoots: [],
    overrides: { reviewWorkflow: true, prWaiting: true, browserRouting: false } }) });
  assert.equal(saved.status, 200);
  assert.equal((await new Promise(resolve => child.once('close', resolve))), 0);
  assert.equal(JSON.parse(await readFile(config)).realCodex, '/bin/sh');
  assert.equal((await stat(config)).mode & 0o777, 0o600);
});
