import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_OVERRIDES = Object.freeze({ reviewWorkflow: true, prWaiting: true, browserRouting: true });
export const DEFAULT_ADDITIONAL_WRITABLE_ROOTS = Object.freeze([]);

export function resolveOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
      Object.entries(overrides).some(([key, value]) => !Object.hasOwn(DEFAULT_OVERRIDES, key) || typeof value !== 'boolean')) {
    throw new Error('invalid_proxy_overrides');
  }
  return { ...DEFAULT_OVERRIDES, ...overrides };
}

export function resolveAdditionalWritableRoots(roots = []) {
  if (!Array.isArray(roots) || roots.some(root => typeof root !== 'string' || !root || root.includes('\0') || !path.isAbsolute(root))) {
    throw new Error('invalid_additional_writable_roots');
  }
  return [...new Set(roots.map(root => path.normalize(root)))];
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
  let additionalWritableRoots = Object.hasOwn(config, 'additionalWritableRoots')
    ? config.additionalWritableRoots : DEFAULT_ADDITIONAL_WRITABLE_ROOTS;
  if (env.T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS !== undefined) {
    try { additionalWritableRoots = JSON.parse(env.T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS); } catch { throw new Error('invalid_additional_writable_roots'); }
  }
  return { realCodex, overrides: resolveOverrides(config.overrides),
    additionalWritableRoots: resolveAdditionalWritableRoots(additionalWritableRoots) };
}

export function watchConfig(configFile, { env = process.env, onChange, report = () => {} } = {}) {
  const filePath = configFile instanceof URL ? fileURLToPath(configFile) : configFile;
  const fileName = path.basename(filePath);
  let closed = false;
  let loading = false;
  let queued = false;
  const reload = async () => {
    if (closed) return;
    if (loading) { queued = true; return; }
    loading = true;
    try {
      const config = await loadConfig({ configFile, env });
      onChange?.(config);
      report('config_reloaded');
    } catch {
      report('config_reload_failed');
    } finally {
      loading = false;
      if (queued && !closed) { queued = false; queueMicrotask(reload); }
    }
  };
  let watcher;
  try {
    watcher = watch(path.dirname(filePath), { persistent: false }, (_event, changed) => {
      if (!changed || changed.toString() === fileName) void reload();
    });
  } catch {
    report('config_watch_failed');
    return () => { closed = true; };
  }
  return () => { closed = true; watcher.close(); };
}
