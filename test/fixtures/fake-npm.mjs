import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const prefix = args[args.indexOf('--prefix') + 1];
const mode = JSON.parse(await readFile(path.join(prefix, 'mode.json'), 'utf8'));
await appendFile(path.join(prefix, 'updates.jsonl'), JSON.stringify({ event: 'start', pid: process.pid, args }) + '\n');
console.log('private-updater-output-marker');
console.error('private-updater-output-marker');
if (mode.stubbornChild) {
  const child = spawn(process.execPath, ['--eval', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send('ready');"],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  await new Promise(resolve => child.once('message', resolve));
  await writeFile(path.join(prefix, 'descendant-pid'), String(child.pid));
  await new Promise(() => {});
}
if (mode.delayMs) await new Promise(resolve => setTimeout(resolve, mode.delayMs));
if (mode.fail) process.exit(17);
const binary = path.join(prefix, 'lib/node_modules/@openai/codex/bin/codex.js');
const code = await readFile(binary, 'utf8');
await writeFile(binary, code.replaceAll('codex-cli fake', 'codex-cli updated'));
await appendFile(path.join(prefix, 'updates.jsonl'), JSON.stringify({ event: 'end', pid: process.pid }) + '\n');
