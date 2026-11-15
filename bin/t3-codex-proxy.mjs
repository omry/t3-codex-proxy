#!/usr/bin/env node
import { runWrapper } from '../src/wrapper.mjs';
import { loadConfig, resolveConfigFile } from '../src/config.mjs';
import { runConfigurator } from '../src/configure.mjs';

// Diagnostic messages contain fixed event names only. Never log protocol data,
// URLs, prompts, configuration, upstream errors, or authentication headers.
const counts = new Map();
function report(code) {
  const count = (counts.get(code) ?? 0) + 1;
  counts.set(code, count);
  if (count === 1) process.stderr.write(`t3-codex-proxy: ${code}\n`);
}

try {
  const configFile = resolveConfigFile({ packageConfigFile: new URL('../config.local.json', import.meta.url) });
  if (process.argv[2] === 'configure') {
    process.exitCode = await runConfigurator({ configFile });
  } else {
    const config = await loadConfig({ configFile });
    process.exitCode = await runWrapper({ ...config, configFile, args: process.argv.slice(2), report });
  }
} catch (error) {
  // Do not interpolate an exception: spawn and HTTP errors can contain secrets.
  report('startup_or_protocol_failed');
  if (error?.message === 'absolute_real_codex_required') {
    process.stderr.write('t3-codex-proxy: configuration required; run `t3-codex-proxy configure` first.\n');
  }
  process.exitCode = 1;
}
