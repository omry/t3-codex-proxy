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

## Codex updates

The wrapper does not update Codex. Stop T3 Code so its shared app-server is no
longer running, update Codex with the package manager used by the installation,
then reopen T3 Code. This keeps package-manager ownership and configuration in
the installation that provided Codex.

`--version`, help, and app-server tooling commands pass through to the
configured executable. T3's own Update action is unavailable while the custom
wrapper binary path is configured.

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
  16 MiB. At most 4,096 list request IDs are retained per wrapper for replay;
  session deletion or reuse of an ID for another method clears its entry.
  Further new list IDs receive HTTP 503 at the limit; restart the wrapper if
  the upstream does not delete sessions. Entries are not silently evicted.
- Tool-call response streams pass through without buffering the whole response.
  Metadata SSE is buffered one event at a time. Changed frames are reserialized;
  unrelated frames retain their bytes. No proxy tool-execution deadline is added.
- On Linux/WSL, the launcher owns the real Codex process group and local listener.
  On SIGINT/SIGTERM it signals the group and escalates after two seconds.
  Descendants are also stopped when their launcher exits. After stdin EOF it
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

