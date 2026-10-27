# T3 Codex Proxy

A local workaround for an issue created by T3 Code's orchestration guidance:
its injected developer instructions and MCP tool descriptions can override
the user's workflow. This has forced fresh delegates for re-checks, required
prior findings in independent reviews, and replaced bounded PR polling with
T3 watches that do not preserve the workflow's timeout recovery.

The proxy rewrites those rules so your workflow controls reviews and PR waits.
Both fixes are enabled by default and can be disabled independently. T3 itself
stays unmodified.

Background: [original continuity issue #19821](https://github.com/pingdotgg/t3code/issues/19821),
[regression report #24877](https://github.com/pingdotgg/t3code/issues/24877), and
[workflow-control discussion #25010](https://github.com/pingdotgg/t3code/discussions/25010#discussioncomment-19201466).

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

## Check the installation

After restarting T3, open a new conversation using that Codex provider and paste:

```text
proxy-check
```

The agent checks the two overrides and reports version compatibility and the T3 connection separately.

## Override configuration

In `config.local.json`:

```json
{
  "realCodex": "/absolute/path/to/real/codex",
  "overrides": {
    "reviewWorkflow": true,
    "prWaiting": true
  }
}
```

- `reviewWorkflow`: let the user's workflow choose fresh-review context and
  reviewer continuity.
- `prWaiting`: preserve workflow-owned PR polling, deadlines, retry limits,
  recovery, and evidence. Retain PR linking; use T3 watching when the workflow
  selects it or specifies no waiting mechanism.

Both default to `true`, including in existing configs without `overrides`.
Set either to `false` to preserve T3's original guidance for that behavior.
Unknown override names and non-boolean values are rejected. Restart T3's shared
app-server after changing config; existing conversation history is not scrubbed.

## Codex updates

T3's built-in Codex update action is unavailable with a custom wrapper path.
Stop T3 Code, update Codex with the package manager used by its installation,
then reopen T3 Code. `--version`, help, and tooling commands pass through to
the configured Codex executable.

## Checks

```sh
npm run check
npm test
```

Fixes are selected automatically from T3's initialization version. Newer
nightlies and stable releases use the latest open-ended range and are assumed
compatible. [Exact-version test coverage](docs/usage.md#versions) is recorded
separately; missing coverage does not prevent applying the matching fixes.
Changes to T3 may require proxy updates; repeat the installation check after upgrading.
See [usage and limitations](docs/usage.md),
[verification](docs/verification.md), and the [rewrite policy](src/policy.mjs).

Independent project. [MIT](LICENSE); [third-party notices](THIRD_PARTY_NOTICES.md).
