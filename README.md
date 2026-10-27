# T3 Codex Proxy

A local workaround for an issue created by T3 Code's orchestration guidance:
its injected developer instructions and MCP tool descriptions can override
the user's review workflow. This has forced fresh delegates for re-checks and
required prior findings in reviews intended to start without them.

The proxy rewrites that review guidance so your workflow decides when to reuse
the original reviewer and what context a fresh reviewer receives.
T3 itself stays unmodified.

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

After restarting T3, open a **new conversation using that Codex provider** and
paste:

```text
Call orchestrator_capabilities exactly once. Inspect the live delegate_task and
t3_thread_send tool descriptions, and summarize the developer review guidance.
Report PASS only if the call succeeds and the developer guidance lets the user's
workflow choose review context and continuity: fresh reviews omit earlier findings
unless requested; same-reviewer follow-ups use childThreadId. Any review guidance
in the tool descriptions must agree. Newer T3 versions may have no review guidance
in those descriptions; report that explicitly. Otherwise report FAIL and explain
what differs or could not be checked. Do not create agents, send messages, or
change files or settings. Include the capability-call outcome, a summary of the
developer guidance, and relevant excerpts from both descriptions as evidence.
```

**PASS** confirms live instruction delivery and MCP forwarding. It does not
test actual delegation. If it fails, check the provider's Binary path and fully
restart T3 before retrying in another new conversation.

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

Fixes are selected automatically from T3's initialization version. Matching
ranges can be open-ended; official support covers only the
[tested versions](docs/usage.md#versions). Untested versions can still receive
a matching fix. Changes to T3 may require proxy updates; repeat the installation
check after upgrading.
See [usage and limitations](docs/usage.md),
[verification](docs/verification.md), and the [rewrite policy](src/policy.mjs).

Independent project. [MIT](LICENSE); [third-party notices](THIRD_PARTY_NOTICES.md).
