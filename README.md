# T3 Codex Proxy

A local Codex launcher and MCP proxy for T3 Code. The user's review workflow
controls fresh-review context and follow-up continuity. T3 itself is unchanged.

This is an independent workaround, not an official T3 Code or OpenAI project.

The proxy is active in the live T3 provider after a backend restart. **The core
live filtering test passed in a fresh T3 conversation**, as reported by the
user: both tool descriptions contain the replacement policy, developer guidance
is consistent with it, and MCP forwarding succeeds. Delegation and follow-up
execution have not been tested. Optional proxy-managed Codex updates are
available and disabled by default; T3's own Update button remains unavailable
with the wrapper binary path.
Fake-peer tests and an isolated real Codex app-server smoke check also pass.
See [verification](docs/verification.md) for the evidence and remaining limits.

## Behavior

Point an existing Codex CLI provider's binary path at
`bin/t3-codex-proxy.mjs`. The launcher starts the real `codex app-server`,
filters selected client-to-Codex developer guidance, and redirects T3's existing
MCP endpoint through a proxy owned by that launcher process. Other Codex CLI
commands, including `--version`, pass through.

The exact policy is in [src/policy.mjs](src/policy.mjs):

- A fresh independent review receives the review brief and required source
  material. Earlier findings, responses, and objections are included only when
  the user's workflow requests them.
- A follow-up that needs the same reviewer conversation uses `t3_thread_send`
  with its `childThreadId` and the workflow's requested follow-up context.
- Task tracking and retry IDs remain part of the guidance.

The filter changes one known review paragraph in T3 orchestration context and
the corresponding spans in the `delegate_task` and `t3_thread_send` descriptions.
It preserves the rest of those descriptions and instructions. It does not
rewrite user prompts, tool arguments, tool results, model responses, or tool
schemas. It does not enforce review independence itself; the agent must follow
the resulting instructions.

The proxy does not enforce a particular T3 release or nightly. It matches
known protocol fields and instruction wording, rather than a version number.
The source version recorded in the test fixture and verification notes is
provenance, not a runtime pin. Other releases can work with the same formats;
changed wording may require a policy update. Unknown review wording is
preserved with a warning, so there is no claim of compatibility with every
T3 release.

## Run checks

Requires Node.js 24 or newer. There are no runtime or test package dependencies.
No `npm install` is needed.

```sh
npm run check
npm test
npm run smoke:codex -- /absolute/path/to/real/codex
```

The tests require permission to spawn child processes and bind loopback sockets.
The smoke check runs the real Codex CLI with a temporary isolated `CODEX_HOME`
and workspace. It uses its own temporary `autoUpdate: false` config, regardless
of your live setting. MCP and model responses come from fake local servers.
It does not upgrade packages, use a paid model endpoint, log in, or call live
T3 tools. It removes its temporary home after the check.

## Configure and install

1. Confirm that the intended T3 provider uses **existing Codex CLI**, rather than
   a T3-managed account/runtime. This prototype targets the existing CLI hook.
   Record the provider's current binary path and launch arguments for rollback.
2. Resolve the real Codex executable in the backend environment with
   `command -v codex`. Clone this repository, then copy `config.example.json`
   to `config.local.json` and set
   `realCodex` to that absolute executable path. The local file is ignored by
   Git. Alternatively, set `T3_CODEX_PROXY_REAL_CODEX` in the provider's environment.
   Do not point it at the wrapper itself.
3. Check the wrapper directly:

   ```sh
   ./bin/t3-codex-proxy.mjs --version
   ```

4. Run the tests and smoke check above. If the real executable's path differs
   from the local example, use that same path for the smoke check.
5. Get the absolute wrapper path:

   ```sh
   node -p "require('node:path').resolve('bin/t3-codex-proxy.mjs')"
   ```

   In T3, set Settings → Providers → the intended existing Codex CLI provider →
   Binary path to that output.

6. **Restart the backend after saving the binary path.** T3 can keep its shared
   Codex app-server running across conversations. Starting a new chat alone
   does not apply the new executable. When active sessions can stop, fully
   quit T3 Code and reopen it. This stops and restarts its desktop-owned backend.
   Confirm that a `t3-codex-proxy.mjs app-server` process is running before
   accepting a live test result.
7. Start a **new isolated T3 conversation** using that provider. Check that the developer context has
   the replacement review paragraph and that both MCP descriptions have the
   same policy. Confirm that unrelated tools still work before using it for
   a review workflow.

For the Windows desktop app with a WSL backend, both the wrapper and the real
Codex path must be valid **inside that WSL backend**. Its PATH must contain
Node.js 24+ because the launcher uses `#!/usr/bin/env node`. Changing the
desktop executable's Windows binary path would target a different environment.

Create your own ignored `config.local.json` for the real executable. The example
defaults to `autoUpdate: false`. The config controls the wrapper; it does not
change T3 settings.

Do not add a second MCP server. The wrapper redirects the existing
`mcp_servers.t3-code` URL supplied by T3, preserving its authentication headers,
timeouts, and other fields. Leaving the original server loaded alongside a
second server would leave its conflicting descriptions visible.

## Existing conversations

After restarting the backend, existing Codex conversations using the configured
provider also run through the wrapper when resumed. New developer context and
MCP discovery are filtered. The resumed development conversation was verified
after the restart; creating a new conversation is not required to activate
the wrapper for an existing thread.

The proxy does not scrub conversation history. Original developer guidance
already stored in an older conversation can remain alongside the new guidance.
A fresh conversation was used for validation to check delivery without that
older context.

## Optional Codex auto-update

`autoUpdate` defaults to `false`, including when the field is absent from an
existing config. Enable it in `config.local.json` with a JSON boolean:

```json
{
  "realCodex": "/absolute/path/to/real/codex",
  "autoUpdate": true
}
```

When enabled, the wrapper makes one npm install attempt **before each new stdio
app-server starts**, targeting `@openai/codex@latest`. It waits for that attempt
before launching Codex, so successful updates take effect in the new process.
This can delay startup. T3 normally shares a long-lived app-server, so a new
conversation or turn does not itself trigger another update. There is no
periodic background updater. `--version`, help, and app-server tooling commands
never trigger an update.

The supported updater is for **Linux/WSL global npm installations** with a real
launcher under `<prefix>/lib/node_modules/@openai/codex/bin/codex.js` and npm
installed under the same prefix. The wrapper resolves the configured executable's
symlink, checks the package manifests, and runs that prefix's npm CLI using Node:

```text
npm install -g --prefix <resolved-prefix> --allow-scripts=@openai/codex @openai/codex@latest
```

It requires util-linux `flock`. A lock at
`<prefix>/.t3-codex-proxy-update.lock` serializes this proxy's installers for
the same prefix. The empty lock file can remain after exit; the OS releases
the lock when its holder exits. No executable is moved into a fake installation
layout, and no T3 hook or package-manager configuration is changed.

The attempt has a two-minute total timeout, including lock waiting. On timeout
or cancellation, its process group is terminated, with forced termination after
two seconds if needed. npm output is discarded so it cannot enter the protocol
stream or proxy logs. Fixed stderr diagnostics report `auto_update_started`,
`auto_update_completed`, `auto_update_failed`, `auto_update_timed_out`,
`auto_update_cancelled`, or `auto_update_unsupported_install`.

An unsupported installation or failed update is reported, then the wrapper
attempts to start the configured Codex. There is no package rollback or repair:
if npm leaves a damaged installation, Codex startup can still fail. This updater
follows npm's `latest` tag and **does not apply T3's version-compatibility checks**.
Other operating systems, standalone installs, and other package managers are
not automatically updated.

Set `autoUpdate` back to `false` to disable future automatic attempts. The next
wrapper process reads the new config. `T3_CODEX_PROXY_REAL_CODEX` still overrides
only the executable path; the auto-update flag comes from the config file.
This feature leaves T3's own Update action disabled for the wrapper path.

## Roll back

1. Stop the affected provider's running sessions through T3.
2. Restore its recorded original binary path and launch arguments.
3. Restart the provider and use a new conversation. T3's normal start/resume/fork
   configuration must supply its original MCP endpoint again.

The wrapper's HTTP listener ends with the wrapper process. There is no daemon,
service, container, or global Codex configuration to uninstall. Keep this
directory if you want to retain the prototype, or remove it after stopping the
wrapper. No files in T3's installation or shared workflow files are changed.

Rollback restores normal instruction delivery for new turns and sessions. It
does not erase rewritten instructions already stored in conversation history.
Likewise, installation does not erase original instructions in an old history.

## Compatibility and diagnostics

- Supports Codex app-server over newline-delimited JSON on stdio. Non-stdio
  app-server listeners are rejected. App-server tooling subcommands pass through.
- Rewrites `turn/start` entries only when their keys match
  `t3_code_orchestration_<number>` and their kind is `application`.
  For `thread/inject_items`, only corresponding tagged developer `input_text`
  messages are filtered. User and untrusted context stay unchanged.
- Redirects the flat dotted config used by T3 on `thread/start`, `thread/resume`,
  and `thread/fork`; nested `mcp_servers` config is also supported. A resume
  without config passes through. After a wrapper restart, T3 must supply the
  fresh original endpoint. Bare resumes of persisted proxy URLs are not repaired.
  An explicitly supplied old proxy URL is rejected.
- T3 supplies the runtime endpoint in the inspected release. Custom launch-arg
  overrides for `mcp_servers.t3-code` are rejected; move those out before using
  this prototype. Global custom MCP configuration is not migrated by the wrapper.
- Upstream endpoints must use HTTP(S) on `127.0.0.1`, `localhost`, or `::1`.
  The local listener binds to `127.0.0.1` with a random route per upstream.
  Authentication and MCP session headers pass through; the proxy does not
  refresh or issue credentials. Requests with an Origin header are rejected.
- Supports MCP JSON responses and SSE, including GET-stream list responses,
  session headers, reconnect event IDs, errors, and concurrent requests.
  HTTP connection headers are normalized for proxying. It requests identity
  encoding; compressed metadata responses are rejected. JSON request bodies,
  buffered metadata responses, and individual stream frames are limited to
  16 MiB. At most 4,096 unresolved list requests are tracked per wrapper.
- Tool-call response streams pass through without buffering the whole response.
  Metadata SSE is buffered one event at a time. Changed frames are reserialized;
  unrelated frames retain their bytes. No proxy tool-execution deadline is added.
- The launcher owns its real Codex child and local listener. On SIGINT/SIGTERM
  it forwards the signal and escalates after two seconds. After stdin EOF it
  allows two seconds for graceful exit, then signals the child, then escalates
  after two more seconds. SIGKILL of the wrapper cannot run this cleanup.

The proxy writes fixed diagnostic event names to stderr once per process per
event. It never writes prompts, credentials, URLs, or wire payloads to its own
logs. Real Codex stderr is forwarded unchanged, so Codex's own diagnostics remain
subject to Codex's logging behavior.

`guidance_rewritten` and `mcp_endpoint_redirected` report that those operations
occurred. `unrecognized_review_guidance` means a targeted review description or
context has unknown wording: it was preserved, so the requested policy may not
be in effect. Inspect that version before relying on it. Unknown formats are
never replaced with a broad removal of orchestration instructions.

Reploy was not added. This process-scoped launcher needs no persistent service
manager; adding one would increase installation and rollback work.

## License

MIT. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
