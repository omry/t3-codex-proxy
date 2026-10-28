import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_OVERRIDES = Object.freeze({ reviewWorkflow: true, prWaiting: true, browserRouting: true });

export function resolveOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
      Object.entries(overrides).some(([key, value]) => !Object.hasOwn(DEFAULT_OVERRIDES, key) || typeof value !== 'boolean')) {
    throw new Error('invalid_proxy_overrides');
  }
  return { ...DEFAULT_OVERRIDES, ...overrides };
}

export async function loadConfig({ configFile = new URL('../config.local.json', import.meta.url), env = process.env } = {}) {
  let config = {};
  try {
    config = JSON.parse(await readFile(configFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('invalid_proxy_config');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid_proxy_config');
  const realCodex = env.T3_CODEX_PROXY_REAL_CODEX || config.realCodex;
  if (typeof realCodex !== 'string' || !path.isAbsolute(realCodex)) throw new Error('absolute_real_codex_required');
  return { realCodex, overrides: resolveOverrides(config.overrides) };
}
