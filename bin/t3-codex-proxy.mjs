#!/usr/bin/env node
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runWrapper } from '../src/wrapper.mjs';
import { loadConfig } from '../src/config.mjs';

// Diagnostic messages contain fixed event names only. Never log protocol data,
// URLs, prompts, configuration, upstream errors, or authentication headers.
const counts = new Map();
function report(code) {
  const count = (counts.get(code) ?? 0) + 1;
  counts.set(code, count);
  if (count === 1) process.stderr.write(`t3-codex-proxy: ${code}\n`);
}

try {
  const { realCodex, autoUpdate } = await loadConfig();
  if (await realpath(realCodex) === await realpath(fileURLToPath(import.meta.url))) throw new Error('recursive_wrapper');
  process.exitCode = await runWrapper({ realCodex, autoUpdate, args: process.argv.slice(2), report });
} catch {
  // Do not interpolate an exception: spawn and HTTP errors can contain secrets.
  report('startup_or_protocol_failed');
  process.exitCode = 1;
}
