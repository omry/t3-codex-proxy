import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_OVERRIDES, loadConfig } from '../src/config.mjs';

async function configFile(t, config) {
  const dir = await mkdtemp(path.join(tmpdir(), 't3-proxy-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  if (config !== undefined) await writeFile(file, JSON.stringify(config));
  return file;
}

test('legacy autoUpdate config is ignored while the executable remains configurable', async t => {
  const file = await configFile(t, { realCodex: '/fake/codex', autoUpdate: true, privateMarker: 'ignored' });
  assert.deepEqual(await loadConfig({ configFile: file, env: {} }), { realCodex: '/fake/codex', overrides: DEFAULT_OVERRIDES });
  const missing = await configFile(t);
  assert.deepEqual(await loadConfig({ configFile: missing, env: { T3_CODEX_PROXY_REAL_CODEX: '/override/codex' } }),
    { realCodex: '/override/codex', overrides: DEFAULT_OVERRIDES });
});

test('override booleans merge with enabled defaults independently', async t => {
  for (const overrides of [{}, { reviewWorkflow: false }, { prWaiting: false },
    { reviewWorkflow: false, prWaiting: false }, { reviewWorkflow: true, prWaiting: true }]) {
    const file = await configFile(t, { realCodex: '/fake/codex', overrides });
    assert.deepEqual(await loadConfig({ configFile: file, env: {} }), {
      realCodex: '/fake/codex', overrides: { reviewWorkflow: true, prWaiting: true, ...overrides },
    });
  }
});

test('invalid override shapes, misspellings and non-booleans fail explicitly', async t => {
  for (const overrides of [null, true, [], 'all', { reviewWorkflow: 'false' }, { prWaiting: 0 },
    { prWaiting: null }, { prWaitng: true }]) {
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
