import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { accessSync, constants as fsConstants, existsSync, watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

export const DEFAULT_OVERRIDES = Object.freeze({ reviewWorkflow: true, prWaiting: true, browserRouting: true, environmentRouting: true });
export const DEFAULT_ADDITIONAL_WRITABLE_ROOTS = Object.freeze([]);

function defaultConfigDirectory(env = process.env) {
  return env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config');
}

export function resolveConfigFile({ env = process.env, packageConfigFile } = {}) {
  const configured = env.T3_CODEX_PROXY_CONFIG;
  if (configured !== undefined) {
    if (typeof configured !== 'string' || !configured || !path.isAbsolute(configured)) {
      throw new Error('absolute_proxy_config_required');
    }
    return configured;
  }
  if (packageConfigFile) {
    const local = packageConfigFile instanceof URL ? fileURLToPath(packageConfigFile) : packageConfigFile;
    if (existsSync(local)) return local;
  }
  return path.join(defaultConfigDirectory(env), 't3-codex-proxy', 'config.json');
}

export function findCodexExecutable(env = process.env, platform = process.platform) {
  for (const directory of String(env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const name of platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.bat', 'codex'] : ['codex']) {
      const candidate = path.join(directory, name);
      try { accessSync(candidate, fsConstants.X_OK); return candidate; } catch { /* Try the next PATH entry. */ }
    }
  }
  return '';
}

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

export function inspectWritableRoots(roots = []) {
  const configured = Array.isArray(roots) ? roots : [];
  const entries = configured.map(path => {
    let processWritable = false;
    try { accessSync(path, fsConstants.W_OK); processWritable = true; } catch { /* Report the failed root. */ }
    return { path, processWritable };
  });
  const processWritable = entries.filter(entry => entry.processWritable).length;
  const status = configured.length === 0 ? 'not_configured'
    : processWritable === configured.length ? 'ready' : processWritable === 0 ? 'unavailable' : 'partial';
  return { paths: [...configured], entries, configured: configured.length, processWritable, status };
}

export function normalizeConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid_proxy_config');
  const realCodex = config.realCodex;
  if (typeof realCodex !== 'string' || !path.isAbsolute(realCodex)) throw new Error('absolute_real_codex_required');
  const additionalWritableRoots = Object.hasOwn(config, 'additionalWritableRoots')
    ? config.additionalWritableRoots : DEFAULT_ADDITIONAL_WRITABLE_ROOTS;
  return { realCodex, overrides: resolveOverrides(config.overrides),
    additionalWritableRoots: resolveAdditionalWritableRoots(additionalWritableRoots) };
}

export async function loadConfig({ configFile, env = process.env } = {}) {
  configFile ??= resolveConfigFile({ env, packageConfigFile: new URL('../config.local.json', import.meta.url) });
  let config = {};
  try {
    config = JSON.parse(await readFile(configFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('invalid_proxy_config');
  }
  if (env.T3_CODEX_PROXY_REAL_CODEX !== undefined && env.T3_CODEX_PROXY_REAL_CODEX !== '') {
    config = { ...config, realCodex: env.T3_CODEX_PROXY_REAL_CODEX };
  }
  if (env.T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS !== undefined) {
    try { config = { ...config, additionalWritableRoots: JSON.parse(env.T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS) }; }
    catch { throw new Error('invalid_additional_writable_roots'); }
  }
  return normalizeConfig(config);
}

export async function writeConfig(configFile, config) {
  const normalized = normalizeConfig(config);
  const directory = path.dirname(configFile instanceof URL ? fileURLToPath(configFile) : configFile);
  const target = configFile instanceof URL ? fileURLToPath(configFile) : configFile;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.config.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(normalized, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    try { await rm(temporary, { force: true }); } catch { /* Preserve the original error. */ }
    throw error;
  }
  return normalized;
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
