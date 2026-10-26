import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { constants as osConstants } from 'node:os';
import { JsonLines } from './framing.mjs';
import { rewriteDeveloperContext } from './policy.mjs';
import { startMcpProxy } from './mcp-proxy.mjs';
import { autoUpdateCodex } from './auto-update.mjs';

export function rewriteClientMessage(message, proxy, report) {
  rewriteDeveloperContext(message, report);
  if (!['thread/start', 'thread/resume', 'thread/fork'].includes(message?.method)) return message;
  const config = message.params?.config;
  if (!config || typeof config !== 'object') return message;
  // T3 uses a flat dotted key; also accept Codex's nested config representation.
  const server = config['mcp_servers.t3-code'] ?? config.mcp_servers?.['t3-code'];
  if (!server) return message;
  if (typeof server.url !== 'string') throw new Error('unsupported_t3_mcp_config');
  server.url = proxy.register(server.url);
  return message;
}

export async function runWrapper({ realCodex, autoUpdate = false, args, input = process.stdin, output = process.stdout,
  stderr = process.stderr, report = () => {} }) {
  const appServer = args[0] === 'app-server';
  const subcommands = ['generate-ts', 'generate-json-schema', 'help', 'daemon', 'proxy'];
  const passThrough = !appServer || args.some(x => subcommands.includes(x) || ['--help', '-h', '--print-startup-config'].includes(x));
  if (!passThrough) {
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--listen=') && args[i] !== '--listen=stdio://') throw new Error('stdio_required');
      if (args[i] === '--listen' && args[i + 1] !== 'stdio://') throw new Error('stdio_required');
      if (args[i].includes('mcp_servers.t3-code') || args[i].includes('mcp_servers."t3-code"')) throw new Error('launch_mcp_override_unsupported');
    }
  }
  let proxy;
  let child;
  const workers = [];
  let failed = false;
  let finished = false;
  let eofTimer;
  let killTimer;
  let signalled;
  const updateAbort = new AbortController();
  const stop = signal => {
    signalled ??= signal;
    updateAbort.abort();
    child?.kill(signal);
    if (child) {
      killTimer ??= setTimeout(() => child?.kill('SIGKILL'), 2000);
      killTimer.unref();
    }
  };
  const onTerm = () => stop('SIGTERM');
  const onInt = () => stop('SIGINT');
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);
  const pump = (promise, fromInput = false) => workers.push(promise.catch(error => {
    if (finished) return;
    // A child may close stdin before emitting its exit event (e.g. --version).
    // Let its actual exit status decide the result in that case.
    if (fromInput && ['EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)) return;
    if (!signalled) { failed = true; report('stdio_forward_failed'); }
    stop('SIGTERM');
  }));
  try {
    if (autoUpdate && !passThrough) await autoUpdateCodex({ realCodex, report, signal: updateAbort.signal });
    if (signalled) return 128 + (osConstants.signals[signalled] ?? 1);
    if (!passThrough) proxy = await startMcpProxy({ report });
    if (signalled) return 128 + (osConstants.signals[signalled] ?? 1);
    child = spawn(realCodex, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    if (proxy) pump(pipeline(input, new JsonLines(message => rewriteClientMessage(message, proxy, report)), child.stdin), true);
    else pump(pipeline(input, child.stdin), true);
    // EOF must terminate the owned process even if the real app-server ignores it.
    child.stdin.once('finish', () => {
      if (passThrough) return;
      eofTimer ??= setTimeout(() => stop('SIGTERM'), 2000);
      eofTimer.unref();
    });
    pump(pipeline(child.stdout, output, { end: false }));
    pump(pipeline(child.stderr, stderr, { end: false }));
    const { code, signal } = await exited;
    finished = true;
    input.unpipe();
    input.destroy();
    await Promise.allSettled(workers);
    return failed ? 1 : code ?? 128 + (osConstants.signals[signal] ?? 1);
  } finally {
    input.destroy();
    clearTimeout(eofTimer);
    clearTimeout(killTimer);
    process.off('SIGTERM', onTerm);
    process.off('SIGINT', onInt);
    if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGKILL');
    await proxy?.close();
  }
}
