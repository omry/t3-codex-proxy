#!/usr/bin/env node
import readline from 'node:readline';

const fakeVersion = 'codex-cli fake';
if (process.argv.includes('--version')) {
  process.stdout.write(fakeVersion + '\n');
  process.exit(0);
}
if (process.argv.includes('--fake-exit')) process.exit(23);
if (process.argv.includes('--fake-ignore-eof')) {
  setInterval(() => {}, 1000);
  process.on('SIGTERM', () => {});
}
const lines = readline.createInterface({ input: process.stdin });
for await (const line of lines) {
  let request;
  try { request = JSON.parse(line); } catch { process.stdout.write(line + '\n'); continue; }
  if (request.method === 'server-request-test') {
    process.stdout.write(' { "id": "server-1", "method": "item/commandExecution/requestApproval", "params": {} }\n');
  }
  if (request.method === 'http-test') {
    const response = await fetch(request.params.url, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: request.params.authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }),
    });
    process.stdout.write(JSON.stringify({ id: request.id, result: await response.json() }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ id: request.id, result: { received: request, loadedVersion: fakeVersion } }) + '\n');
  }
}
