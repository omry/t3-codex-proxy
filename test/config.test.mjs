import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_ADDITIONAL_WRITABLE_ROOTS, DEFAULT_OVERRIDES, loadConfig, watchConfig } from '../src/config.mjs';

async function configFile(t, config) {
  const dir = await mkdtemp(path.join(tmpdir(), 't3-proxy-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  if (config !== undefined) await writeFile(file, JSON.stringify(config));
  return file;
}

test('legacy autoUpdate config is ignored while the executable remains configurable', async t => {
  const file = await configFile(t, { realCodex: '/fake/codex', autoUpdate: true, privateMarker: 'ignored' });
  assert.deepEqual(await loadConfig({ configFile: file, env: {} }), {
    realCodex: '/fake/codex', overrides: DEFAULT_OVERRIDES, additionalWritableRoots: DEFAULT_ADDITIONAL_WRITABLE_ROOTS,
  });
  const missing = await configFile(t);
  assert.deepEqual(await loadConfig({ configFile: missing, env: { T3_CODEX_PROXY_REAL_CODEX: '/override/codex' } }), {
    realCodex: '/override/codex', overrides: DEFAULT_OVERRIDES, additionalWritableRoots: DEFAULT_ADDITIONAL_WRITABLE_ROOTS,
  });
});

test('override booleans merge with enabled defaults independently', async t => {
  for (const overrides of [{}, { reviewWorkflow: false }, { prWaiting: false }, { browserRouting: false },
    { reviewWorkflow: false, prWaiting: false, browserRouting: false },
    { reviewWorkflow: true, prWaiting: true, browserRouting: true }]) {
    const file = await configFile(t, { realCodex: '/fake/codex', overrides });
    assert.deepEqual(await loadConfig({ configFile: file, env: {} }), {
      realCodex: '/fake/codex', overrides: { reviewWorkflow: true, prWaiting: true, browserRouting: true, ...overrides },
      additionalWritableRoots: [],
    });
  }
});

test('additional writable roots are configured generically, normalized and deduplicated', async t => {
  const file = await configFile(t, { realCodex: '/fake/codex', additionalWritableRoots: ['/tmp/one/../one', '/tmp/two', '/tmp/two'] });
  assert.deepEqual((await loadConfig({ configFile: file, env: {} })).additionalWritableRoots, ['/tmp/one', '/tmp/two']);
  const env = await loadConfig({ configFile: file, env: {
    T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS: '["/var/lib/one", "/var/lib/one"]',
  } });
  assert.deepEqual(env.additionalWritableRoots, ['/var/lib/one']);
});

test('invalid additional writable roots are rejected', async t => {
  for (const roots of [null, true, {}, ['relative'], ['/tmp/ok', 3], ['/tmp/ok', ''], ['/tmp/has\0nul']]) {
    const file = await configFile(t, { realCodex: '/fake/codex', additionalWritableRoots: roots });
    await assert.rejects(loadConfig({ configFile: file, env: {} }), /^Error: invalid_additional_writable_roots$/);
  }
  const file = await configFile(t, { realCodex: '/fake/codex' });
  await assert.rejects(loadConfig({ configFile: file, env: {
    T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS: 'not-json',
  } }), /^Error: invalid_additional_writable_roots$/);
});

test('invalid override shapes, misspellings and non-booleans fail explicitly', async t => {
  for (const overrides of [null, true, [], 'all', { reviewWorkflow: 'false' }, { prWaiting: 0 },
    { prWaiting: null }, { prWaitng: true }, { browserRouting: 'true' }, { browserRounting: true }]) {
    const file = await configFile(t, { realCodex: '/fake/codex', overrides });
    await assert.rejects(loadConfig({ configFile: file, env: {} }), /^Error: invalid_proxy_overrides$/);
  }
});

test('malformed config and relative executable paths are rejected', async t => {
  const file = await configFile(t, { realCodex: './codex', autoUpdate: false });
  await assert.rejects(loadConfig({ configFile: file, env: {} }), /absolute_real_codex_required/);
  await writeFile(file, 'private-marker invalid json');
  await assert.rejects(loadConfig({ configFile: file, env: {} }), /^Error: invalid_proxy_config$/);
});

test('config watcher reloads valid edits and keeps the last valid config after invalid edits', async t => {
  const file = await configFile(t, { realCodex: '/fake/codex', additionalWritableRoots: ['/initial'] });
  const changes = [];
  const events = [];
  const stop = watchConfig(file, { env: {}, onChange: config => changes.push(config), report: event => events.push(event) });
  t.after(stop);
  await writeFile(file, JSON.stringify({ realCodex: '/fake/codex', additionalWritableRoots: ['/updated'] }));
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('config watcher timeout')), 2000);
    const check = () => {
      if (changes.length) { clearTimeout(deadline); resolve(); }
      else setTimeout(check, 10);
    };
    check();
  });
  assert.deepEqual(changes.at(-1).additionalWritableRoots, ['/updated']);
  await writeFile(file, '{invalid');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(changes.at(-1).additionalWritableRoots, ['/updated']);
  assert.ok(events.includes('config_reloaded'));
  assert.ok(events.includes('config_reload_failed'));
});
