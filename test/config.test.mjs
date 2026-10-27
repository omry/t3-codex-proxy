import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';

async function configFile(t, config) {
  const dir = await mkdtemp(path.join(tmpdir(), 't3-proxy-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  if (config !== undefined) await writeFile(file, JSON.stringify(config));
  return file;
}

test('legacy autoUpdate config is ignored while the executable remains configurable', async t => {
  const file = await configFile(t, { realCodex: '/fake/codex', autoUpdate: true, privateMarker: 'ignored' });
  assert.deepEqual(await loadConfig({ configFile: file, env: {} }), { realCodex: '/fake/codex' });
  const missing = await configFile(t);
  assert.deepEqual(await loadConfig({ configFile: missing, env: { T3_CODEX_PROXY_REAL_CODEX: '/override/codex' } }),
    { realCodex: '/override/codex' });
});

test('malformed config and relative executable paths are rejected', async t => {
  const file = await configFile(t, { realCodex: './codex', autoUpdate: false });
  await assert.rejects(loadConfig({ configFile: file, env: {} }), /absolute_real_codex_required/);
  await writeFile(file, 'private-marker invalid json');
  await assert.rejects(loadConfig({ configFile: file, env: {} }), /^Error: invalid_proxy_config$/);
});
