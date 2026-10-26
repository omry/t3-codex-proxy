import { loadConfig } from '../../src/config.mjs';
import { runWrapper } from '../../src/wrapper.mjs';

// The caller supplies an isolated config. Never inherit the live auto-update flag.
const config = await loadConfig({ configFile: process.argv[2], env: {} });
process.exitCode = await runWrapper({ ...config, args: process.argv.slice(3),
  report: code => process.stderr.write(`t3-codex-proxy: ${code}\n`),
});
