import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadConfig({ configFile = new URL('../config.local.json', import.meta.url), env = process.env } = {}) {
  let config = {};
  try {
    config = JSON.parse(await readFile(configFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('invalid_proxy_config');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid_proxy_config');
  const realCodex = env.T3_CODEX_PROXY_REAL_CODEX || config.realCodex;
  const autoUpdate = config.autoUpdate === undefined ? false : config.autoUpdate;
  if (typeof realCodex !== 'string' || !path.isAbsolute(realCodex)) throw new Error('absolute_real_codex_required');
  if (typeof autoUpdate !== 'boolean') throw new Error('boolean_auto_update_required');
  return { realCodex, autoUpdate };
}
