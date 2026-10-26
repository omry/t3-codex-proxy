# T3 Codex Proxy

A local workaround for controlling T3 Code's injected review guidance.
It rewrites selected developer instructions and MCP tool descriptions so your
workflow decides what context fresh reviewers receive and when to reuse a
reviewer conversation. T3 itself stays unmodified.

Requires Node.js 24+ and an existing Codex CLI installation. Tested with a WSL
backend. No npm dependencies to install.

## Install

Run these commands in the same environment as T3's backend (inside WSL if you
use T3's WSL backend):

```sh
git clone https://github.com/omry/t3-codex-proxy.git
cd t3-codex-proxy
cp config.example.json config.local.json
command -v codex
```

1. Edit `config.local.json`. Set `realCodex` to the absolute path printed by
   `command -v codex`.
2. Print the wrapper's absolute path:

   ```sh
   realpath bin/t3-codex-proxy.mjs
   ```

3. Open T3 Code → **Settings → Providers → Codex**. Select the provider that
   uses your existing Codex CLI installation.
4. Record its original **Binary path**, then replace it with the wrapper path
   from step 2. Keep `realCodex` in the config pointing to the original Codex.
5. **Fully quit and reopen T3 Code** to restart its shared app-server.

Existing threads then use the wrapper when resumed. Their old history remains.
To undo the setup, restore the original Binary path and restart T3.

## Codex updates

T3's built-in Codex update action is unavailable with a custom wrapper path.
Optional Linux/npm auto-update runs before app-server startup; enable it with
`"autoUpdate": true`. It defaults to `false` and does not apply T3's version
compatibility checks. [Details](docs/usage.md#optional-codex-auto-update).

## Checks

```sh
npm run check
npm test
```

The filter matches known wording rather than a specific T3 version. Changed
wording may require an update. See [usage and limitations](docs/usage.md),
[verification](docs/verification.md), and the [rewrite policy](src/policy.mjs).

Independent project. [MIT](LICENSE); [third-party notices](THIRD_PARTY_NOTICES.md).
