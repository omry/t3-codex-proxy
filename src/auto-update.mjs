import { spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

// Support the known Linux global npm layout. Do not guess ownership for custom
// launchers, project-local packages, standalone installations, or other managers.
export async function resolveNpmUpdate(realCodex, platform = process.platform) {
  if (platform !== 'linux') return null;
  const entry = await realpath(realCodex);
  const match = /^(.*)\/lib\/node_modules\/@openai\/codex\/bin\/codex\.js$/.exec(entry);
  if (!match || match[1].includes('/node_modules/')) return null;
  const prefix = match[1] || '/';
  const codexRoot = path.join(prefix, 'lib/node_modules/@openai/codex');
  const npmRoot = path.join(prefix, 'lib/node_modules/npm');
  const codexPackage = JSON.parse(await readFile(path.join(codexRoot, 'package.json'), 'utf8'));
  const npmPackage = JSON.parse(await readFile(path.join(npmRoot, 'package.json'), 'utf8'));
  if (codexPackage.name !== '@openai/codex' || npmPackage.name !== 'npm') return null;
  const npmCli = await realpath(path.join(npmRoot, 'bin/npm-cli.js'));
  return {
    prefix,
    // flock is supplied by util-linux on the supported Linux/WSL environment.
    // --no-fork lets cancellation stop the installer and its children as a group.
    command: 'flock',
    args: ['--exclusive', '--no-fork', '--timeout=120',
      path.join(prefix, '.t3-codex-proxy-update.lock'), process.execPath, npmCli,
      'install', '-g', '--prefix', prefix, '--allow-scripts=@openai/codex', '@openai/codex@latest'],
  };
}

export async function autoUpdateCodex({ realCodex, report = () => {}, signal,
  timeoutMs = 120_000, killGraceMs = 2000 } = {}) {
  if (signal?.aborted) return 'cancelled';
  let update;
  try { update = await resolveNpmUpdate(realCodex); } catch { /* Unsupported or unreadable install. */ }
  if (!update) { report('auto_update_unsupported_install'); return 'unsupported'; }
  if (signal?.aborted) return 'cancelled';
  report('auto_update_started');
  return new Promise(resolve => {
    let child, timer, killTimer, stopping, closed = false, graceElapsed = false, finished = false;
    const sendSignal = name => {
      if (!child?.pid) return;
      try { process.kill(-child.pid, name); } catch { /* Already exited. */ }
    };
    const stop = reason => {
      if (stopping || finished) return;
      stopping = reason;
      sendSignal('SIGTERM');
      killTimer = setTimeout(() => {
        graceElapsed = true;
        sendSignal('SIGKILL');
        if (closed) finish(stopping);
      }, killGraceMs);
    };
    const onAbort = () => stop('cancelled');
    const finish = status => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      report(`auto_update_${status}`);
      resolve(status);
    };
    try {
      child = spawn(update.command, update.args, {
        detached: true,
        stdio: 'ignore', // npm output must never enter app-server stdout or our logs.
        env: { ...process.env, PATH: path.join(update.prefix, 'bin') + path.delimiter + (process.env.PATH ?? '') },
      });
      child.once('error', () => finish('failed'));
      child.once('close', code => {
        closed = true;
        if (stopping && !graceElapsed) {
          try { process.kill(-child.pid, 0); return; } catch { /* No installer descendants remain. */ }
        }
        finish(stopping ?? (code === 0 ? 'completed' : 'failed'));
      });
      timer = setTimeout(() => stop('timed_out'), timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    } catch { finish('failed'); }
  });
}
