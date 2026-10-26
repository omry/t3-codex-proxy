import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, copyFile, chmod, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { autoUpdateCodex, resolveNpmUpdate } from '../src/auto-update.mjs';

const fixture = name => fileURLToPath(new URL('./fixtures/' + name, import.meta.url));
async function installation(t, mode = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 't3-proxy-update-'));
  const prefix = path.join(root, 'node with spaces');
  const codex = path.join(prefix, 'lib/node_modules/@openai/codex');
  const npm = path.join(prefix, 'lib/node_modules/npm');
  await mkdir(path.join(codex, 'bin'), { recursive: true });
  await mkdir(path.join(npm, 'bin'), { recursive: true });
  await mkdir(path.join(prefix, 'bin'), { recursive: true });
  await writeFile(path.join(prefix, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(codex, 'package.json'), '{"name":"@openai/codex","type":"module"}');
  await writeFile(path.join(npm, 'package.json'), '{"name":"npm","type":"module"}');
  const entry = path.join(codex, 'bin/codex.js');
  await copyFile(fixture('fake-codex.mjs'), entry); await chmod(entry, 0o755);
  await copyFile(fixture('fake-npm.mjs'), path.join(npm, 'bin/npm-cli.js'));
  const binary = path.join(prefix, 'bin/codex');
  await symlink(entry, binary);
  await writeFile(path.join(prefix, 'mode.json'), JSON.stringify(mode));
  const config = path.join(root, 'config.json');
  const setConfig = value => writeFile(config, JSON.stringify({ realCodex: binary, ...value }));
  await setConfig({ autoUpdate: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const records = async () => (await readFile(path.join(prefix, 'updates.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  return { root, prefix, binary, entry, config, setConfig, records };
}

async function launch(t, install, args) {
  const child = spawn(process.execPath, [fixture('run-configured-wrapper.mjs'), install.config, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', closed = false;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exit = new Promise(resolve => child.once('close', code => { closed = true; resolve({ code, stdout, stderr }); }));
  t.after(async () => { if (!closed) { child.kill('SIGKILL'); await exit; } });
  return { child, exit };
}

test('npm updater resolves the configured symlink and targets its actual prefix', async t => {
  const install = await installation(t);
  const plan = await resolveNpmUpdate(install.binary);
  assert.equal(plan.prefix, install.prefix);
  assert.equal(plan.command, 'flock');
  assert.deepEqual(plan.args.slice(-6), ['install', '-g', '--prefix', install.prefix, '--allow-scripts=@openai/codex', '@openai/codex@latest']);
});

test('unsupported installs and foreign package names never invoke an installer', async t => {
  const events = [];
  assert.equal(await autoUpdateCodex({ realCodex: fixture('fake-codex.mjs'), report: event => events.push(event) }), 'unsupported');
  assert.deepEqual(events, ['auto_update_unsupported_install']);
  const install = await installation(t);
  await writeFile(path.join(path.dirname(path.dirname(install.entry)), 'package.json'), '{"name":"another-package"}');
  assert.equal(await resolveNpmUpdate(install.binary), null);
  assert.equal(await resolveNpmUpdate(install.binary, 'darwin'), null);
  await assert.rejects(install.records(), { code: 'ENOENT' });
});

test('enabled updates complete before the updated app-server starts; npm output stays private', { timeout: 10000 }, async t => {
  const install = await installation(t);
  const peer = await launch(t, install, ['app-server']);
  peer.child.stdin.end(JSON.stringify({ id: 1, method: 'test-ready' }) + '\n');
  const result = await peer.exit;
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).id, 1);
  assert.equal(JSON.parse(result.stdout).result.loadedVersion, 'codex-cli updated');
  assert.match(await readFile(install.entry, 'utf8'), /codex-cli updated/);
  assert.deepEqual((await install.records()).map(x => x.event), ['start', 'end']);
  assert.ok(result.stderr.includes('auto_update_completed'));
  assert.ok(!result.stdout.includes('private-updater-output-marker') && !result.stderr.includes('private-updater-output-marker'));
});

test('missing or false flag and non-server commands never trigger an update', { timeout: 10000 }, async t => {
  const install = await installation(t);
  for (const config of [{}, { autoUpdate: false }]) {
    await install.setConfig(config);
    const peer = await launch(t, install, ['app-server']);
    peer.child.stdin.end('{}\n');
    assert.equal((await peer.exit).code, 0);
  }
  await install.setConfig({ autoUpdate: true });
  for (const args of [['--version'], ['app-server', '--help'], ['app-server', 'generate-json-schema']]) {
    const peer = await launch(t, install, args);
    peer.child.stdin.end();
    const result = await peer.exit;
    assert.equal(result.code, 0);
    assert.ok(!result.stderr.includes('auto_update_'));
  }
  await assert.rejects(install.records(), { code: 'ENOENT' });
});

test('installer failure is reported and the existing app-server can still start', { timeout: 10000 }, async t => {
  const install = await installation(t, { fail: true });
  const peer = await launch(t, install, ['app-server']);
  peer.child.stdin.end(JSON.stringify({ id: 42, method: 'ready' }) + '\n');
  const result = await peer.exit;
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).id, 42);
  assert.ok(result.stderr.includes('auto_update_failed'));
  assert.ok(!result.stderr.includes('private-updater-output-marker'));
});

test('concurrent launches serialize updates to the same npm prefix', { timeout: 10000 }, async t => {
  const install = await installation(t, { delayMs: 100 });
  assert.deepEqual(await Promise.all([autoUpdateCodex({ realCodex: install.binary }), autoUpdateCodex({ realCodex: install.binary })]), ['completed', 'completed']);
  assert.deepEqual((await install.records()).map(x => x.event), ['start', 'end', 'start', 'end']);
});

test('timeout stops the installer and releases its lock', { timeout: 10000 }, async t => {
  const install = await installation(t, { delayMs: 5000 });
  assert.equal(await autoUpdateCodex({ realCodex: install.binary, timeoutMs: 150, killGraceMs: 50 }), 'timed_out');
  await writeFile(path.join(install.prefix, 'mode.json'), '{}');
  assert.equal(await autoUpdateCodex({ realCodex: install.binary, timeoutMs: 2000 }), 'completed');
});

test('cancellation kills a stubborn installer descendant before returning', { timeout: 10000 }, async t => {
  const install = await installation(t, { stubbornChild: true });
  const controller = new AbortController();
  const update = autoUpdateCodex({ realCodex: install.binary, signal: controller.signal, timeoutMs: 5000, killGraceMs: 50 });
  const pidFile = path.join(install.prefix, 'descendant-pid');
  const deadline = Date.now() + 3000;
  while (true) {
    try { await access(pidFile); break; } catch { /* Wait for the fixture child to be ready. */ }
    if (Date.now() > deadline) throw new Error('Installer descendant did not start');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const pid = Number(await readFile(pidFile, 'utf8'));
  controller.abort();
  assert.equal(await update, 'cancelled');
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    assert.equal(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0], 'Z');
  } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
});

test('SIGTERM during a startup update exits without starting Codex', { timeout: 10000 }, async t => {
  const install = await installation(t, { delayMs: 5000 });
  const peer = await launch(t, install, ['app-server']);
  const deadline = Date.now() + 3000;
  while (true) {
    try { await install.records(); break; } catch { /* Wait for the update to begin. */ }
    if (Date.now() > deadline) throw new Error('Startup update did not begin');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  peer.child.stdin.write(JSON.stringify({ id: 1, method: 'must-not-start' }) + '\n');
  peer.child.kill('SIGTERM');
  const result = await peer.exit;
  assert.equal(result.code, 143);
  assert.equal(result.stdout, '');
});
