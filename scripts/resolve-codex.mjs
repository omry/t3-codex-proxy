import { appendFileSync } from 'node:fs';
import { findCodexExecutable } from '../src/config.mjs';

const codex = findCodexExecutable();
if (!codex) throw new Error('Codex CLI was not found on PATH');
console.log(codex);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `path=${codex}\n`);
