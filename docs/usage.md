# Usage and compatibility

Detailed reference for [T3 Codex Proxy](../README.md).

## Backend environment

Requires Node.js 24+ and an existing Codex CLI provider. For the Windows desktop app with a WSL backend, use paths and Node.js from inside that backend.

The proxy does not enforce a particular T3 release or nightly. It matches
known protocol fields and instruction wording, rather than a version number.
The source version recorded in the test fixture and verification notes is
provenance, not a runtime pin. Other releases can work with the same formats;
changed wording may require a policy update. Unknown review wording is
preserved with a warning, so there is no claim of compatibility with every
T3 release.

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

