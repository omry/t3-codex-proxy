# Usage and compatibility

Detailed reference for [T3 Codex Proxy](../README.md).

## Backend environment

Requires Node.js 24+ and an existing Codex CLI provider. Native Windows npm
launchers (`codex.cmd` and `codex.bat`) are supported. For the Windows desktop
app with a WSL backend, use paths and Node.js from inside that backend.

## Published installation

Install the package globally in the backend environment:

```sh
npm install --global t3-codex-proxy
t3-codex-proxy configure
```

`configure` is an explicit one-shot setup command. It prints a short-lived,
token-protected loopback URL, does not open a browser, and
does not run during normal T3 startup. The page writes the user configuration
to `$XDG_CONFIG_HOME/t3-codex-proxy/config.json`, or
`~/.config/t3-codex-proxy/config.json` when `XDG_CONFIG_HOME` is unset.
`T3_CODEX_PROXY_CONFIG` can select another absolute file. If setup has not
been completed, the wrapper exits with a message telling the user to run
`t3-codex-proxy configure`.

The setup server binds to loopback, uses a one-time random URL token, checks
the request host and origin, serves no external assets, and closes after a
successful save or timeout. Configuration writes are atomic and use restrictive
permissions. The normal app-server process never exposes this page.

## Configure T3

1. In T3 Code, open **Settings → Providers → Codex**.
2. Select the provider that uses your Codex CLI.
3. Set its **Binary path** to the absolute path printed by
   `command -v t3-codex-proxy`. On Windows PowerShell, use the path returned by
   Get-Command t3-codex-proxy.
4. Fully quit and reopen T3 Code so its shared app-server starts through the
   wrapper.
5. Resume an existing conversation or open a new one with that provider and
   send `proxy-check`.

Existing conversations use the wrapper when resumed after the restart. A new
conversation is not required. Changes to overrides and writable roots reload
for later turns; changes to `realCodex` require another T3 restart.

## Configuration file

The setup page edits a file with this shape:

```json
{
  "realCodex": "/absolute/path/to/codex",
  "additionalWritableRoots": [],
  "overrides": {
    "reviewWorkflow": true,
    "prWaiting": true,
    "browserRouting": true,
    "environmentRouting": true
  }
}
```

`realCodex` is the original Codex executable, not the proxy binary. The page
detects a Codex executable from `PATH` as its initial value. Run
`t3-codex-proxy configure` again to edit the file. It is stored at
`$XDG_CONFIG_HOME/t3-codex-proxy/config.json`, or
`~/.config/t3-codex-proxy/config.json` when `XDG_CONFIG_HOME` is unset.
`T3_CODEX_PROXY_CONFIG` can select another absolute path.

The four override switches are independent. `proxy-check` reports seven
compatibility checks: four use `reviewWorkflow`, one uses `prWaiting`, one uses
`browserRouting`, and one uses `environmentRouting`.

## Versions

The wrapper reads `initialize.params.clientInfo.version` from T3 Code and
selects one fix set for that process. It forwards initialization unchanged.
Concurrent T3 instances can select different fixes independently.

Prerelease and nightly matching ranges use optional inclusive `min` and `max` bounds:

- `{ "min": "X" }`: X and newer.
- `{ "max": "Y" }`: Y and older.
- Both bounds: the inclusive interval. Equal bounds: one exact version.

Prerelease versions use semantic ordering, including nightly numeric components. The
current rules select the older fix through `0.1.3-nightly.20261025.3655`, and
the newer fix from `0.1.3-nightly.20261025.3669` onward. No fix is assigned to
the gap between those bounds. See [the registry](../src/compatibility.mjs).

Stable releases require an explicit version-to-fix-set entry in `STABLE_FIX_SETS`.
Each supported stable release must have a captured guidance fixture and regression
coverage. A stable release never inherits support from a range, even when its
version falls inside one. Stable `0.1.3` currently selects `current`. Build metadata
does not change version selection: `0.1.3+build.7` selects the `0.1.3` entry.

Matching ranges define support for prerelease and nightly versions, including
newer nightlies in the latest open-ended range. Exact-version test coverage is
separate. Automated fixture and isolated real-Codex checks cover these exact releases:

- `0.1.3-nightly.20261025.3655`
- `0.1.3-nightly.20261025.3669`
- `0.1.3-nightly.20261027.3754`
- `0.1.3`
- `0.1.7-nightly.20261031.3991` (live PR/browser wording; unchanged inputs
  retained from the earlier fixture)
- `0.1.7-nightly.20261103.4119` (live PR/batch-linking wording and native-delegation
  bullet; other inputs retained from the 3991 fixture)
- `0.1.10-nightly.20261112.4580` (live PR-linking wording; other inputs retained
  from the 4119 fixture)

New prerelease versions within a matching range receive that fix without an untested-version
warning. The diagnostic describes them as assumed compatible. Exact-version
test coverage is recorded separately in its raw data.
Every rewrite checks its expected input; changed review wording is preserved
with `unrecognized_review_guidance`; changed PR-wait
wording is preserved with `unrecognized_pr_wait_guidance`; changed browser
wording is preserved with `unrecognized_browser_routing_guidance`. Missing,
invalid, or unmatched versions, and stable releases without an explicit entry,
produce `unsupported_t3_version` and pass the
guidance through unchanged. These warnings do not stop Codex startup. No
version or private input is interpolated into the diagnostics.

Newer `delegate_task` and `t3_thread_send` descriptions contain no review rule
and are preserved.
The review fix lets the workflow choose available review tools, review context,
reviewer continuity, and the fixer, including for small findings. T3-specific
review calls apply only when the workflow uses T3 delegates. Without a workflow
assignment, the parent still fixes small findings itself.
Known conflicting review sentences are replaced in orchestration context.
The same `reviewWorkflow` switch replaces the known unconditional delegate
no-poll instruction and the corresponding `task_status` restriction. Workflow
waits can use supported bounded operations or paced status checks with their
own deadline and recovery. A wait timeout does not cancel the child or prove
completion: keep its task identity and follow the workflow's recovery rules.
Without a workflow-owned wait, follow T3's `next` and completion notifications.
The switch also replaces the known `t3_thread_wait` timeout instruction and
normalizes the two observed `next` waiting hints in identified `delegate_task`,
`task_status`, and `t3_thread_wait` results. JSON-text and structured replies
receive the same hint. Task IDs, status, timeout facts, summaries, cancellation
instructions, input schemas and unrelated data stay unchanged. Matching direct
`next` output-schema literals are updated to agree with the normalized reply.
Unknown hints, unrecognized result shapes, errors and unrelated tools remain
unchanged. Disabled overrides and unsupported versions preserve the original
reply. This changes delivered waiting guidance; it does not add a timer or a
scheduler to T3.
The PR-wait fix rewrites the known runtime PR block and watch-tool description,
retaining linking rules and unrelated runtime information. Before choosing T3
watching, check the selected workflow and applicable skills for an integrated
PR review/check mechanism. A standalone prerequisite PR does not automatically
leave that workflow. When applicable, use its request, polling, evidence,
retry, recovery, and completion gates, preserving its deadlines and retry limits.
Use T3 watching as a fallback only after establishing that no workflow wait
mechanism applies. Notifications may supplement workflow waits; they do not
satisfy or replace the gates. Watching for a later owner merge must not bypass
CI/review qualification. This changes delivered guidance; it does not guarantee
that a model correctly classifies every PR.

Repeat the README installation check after upgrading to detect any changed
instruction wording.
Known variants include the block captured from nightly
`0.1.11-nightly.20261119.4928`, preserving its added PR-tool routing and
issue-linking instructions. That fixture covers the PR block only; the release
retains assumed compatibility through the nightly range.

The browser-routing fix replaces the condition that naming a page or tab permits
browser automation. It prioritizes the user's selected tools and workflow, then
suitable authenticated APIs, CLIs, or connectors. A missing operation in one
interface is not proof that API access is unavailable. Browser automation remains
available when requested or needed, with T3's shared-browser controls. Older
versions receive this guidance in their browser-tool block instead. The proxy
changes instruction delivery; it cannot guarantee that a model follows the guidance.

The environment-routing fix replaces the unconditional machine-linking bullets
with guidance that preserves `environmentId` and `threadId` targeting when the
user explicitly requests a T3-linked environment or T3 delegation to another
machine. Naming a host, VM, load balancer, service endpoint, or repository for
debugging does not request environment linking. This changes developer
guidance; it cannot enforce model behavior or guarantee tool availability. The
`environmentRouting` switch controls this rewrite.

The known machine-routing variants include the shorter pair captured from
nightly `0.1.10-nightly.20261116.4774`. Both complete bullets must match one known
pair before either is rewritten. Changed or incomplete pairs remain unchanged
and emit `unrecognized_environment_routing_guidance`. The 4774 environment
fixture covers this section only; the release retains assumed compatibility
through the nightly range.

T3 tool results can still suggest ending the turn and awaiting a completion
notification. With `reviewWorkflow` enabled on a version using the current
waiting-result fix set, the proxy normalizes the two recognized waiting `next`
hints in identified waiting replies while preserving their task facts and
unknown hints, as described above. The workflow must use an agent path with
supported wait and recovery operations. The proxy does not implement those
operations or guarantee wall-clock deadlines. The `prWaiting` switch applies
to PR waits and does not control delegate waits.

## Overrides and diagnostics

The user config has an optional `overrides` object. In an unpacked checkout,
`config.local.json` remains a development fallback. `reviewWorkflow`,
`prWaiting`, `browserRouting`, and `environmentRouting` each default to
`true`; explicit `false`
leaves that behavior's developer text and tool descriptions unchanged. Unknown names, null, arrays,
and non-boolean values are rejected. Legacy unrelated top-level properties
remain ignored. The executable environment override does not override these flags.

The proxy watches its configuration while the app-server runs. Valid changes to
overrides and writable roots apply to subsequent turns. A malformed edit keeps
the last valid configuration. Changes to `realCodex` require a T3 restart
because the Codex child is already running. Neither disabling a fix nor
restarting erases older instructions already retained in conversation history.

The optional top-level `additionalWritableRoots` array configures extra
absolute paths for `workspaceWrite` turn policies. Existing writable roots,
network settings, and other sandbox fields remain intact; read-only and
full-access policies are unchanged. Duplicate paths are removed. The
`T3_CODEX_PROXY_ADDITIONAL_WRITABLE_ROOTS` environment variable can override
the configured array with a JSON array. Invalid values are rejected at startup.

The proxy adds a read-only `proxy-check` tool on the final MCP discovery page.
For a `turn/start` request whose only input is the exact text `proxy-check` or
`proxy_check` (ignoring surrounding whitespace), and which carries T3's
application runtime context, the wrapper adds a small application-context hint
to discover and call that tool. The user input stays unchanged. Discussion of
the command and requests with attachments do not trigger this hint. This local
diagnostic routing is independent of the four guidance override switches.
The agent still makes the tool call and writes the final answer; this is not a
direct chat-command response from the wrapper.
The result includes a read-only writable-root block with one row per configured
directory. When roots are configured, the checklist gives the agent a
create/verify/delete marker test to run in the current turn. Each row has one
status symbol: `✅` only when both the proxy process and Codex turn pass; `❌`
when either check fails; or `❓` when the turn check is unavailable. The text
after the symbol names the failed or missing check. The proxy-side status alone
does not prove access from the Codex turn sandbox and does not create marker
files. Each row renders the full absolute directory path as a Markdown link.
Both `t3-code` and `t3-code-direct` use the same proxy policy. The wrapper keeps
their enabled/disabled tool lists, direct-exposure settings, authentication and
timeouts intact. A rewritten regular discovery list alone does not prove that
the model-visible direct tools were rewritten; verify those descriptions too.
It handles the diagnostic locally, using an upstream `tools/list` request with the
caller's route, authentication, and session to verify access. Authentication
failures pass through. Only identified waiting-tool replies with a recognized
`next` hint receive the bounded guidance change described above. Other results
remain opaque.
The check returns plain-language configuration and compatibility facts,
and a configuration-specific checklist for the agent's next inference. Raw
process-wide rewrite counts and exact-version test coverage remain in
`structuredContent` for debugging. It contains no executable path, credentials,
original prompts, or conversation text.

The agent must compare its actual guidance with the reported expectations and
make one read-only `orchestrator_capabilities` call. A rewrite count is not proof
of the current conversation's context. Process-wide unmatched text does not
by itself indicate conflicting instructions in this conversation. The agent
reports a short overall result, one installation sentence with the T3 version,
compatibility qualification, and connection status, then "Compatibility checks
(7):" with exactly seven bullets: review context and continuity, PR waiting,
browser routing, review-tool routing, fixer assignment, delegate waiting and
recovery, and environment routing. Checks 1, 4, 5, and 6 use `reviewWorkflow`;
check 2 uses `prWaiting`; check 3 uses `browserRouting`; and check 7 uses
`environmentRouting`. Each bullet shows its
PASS/FAIL/UNKNOWN result and a short reason, along with whether its
override is enabled or disabled. The overall result is green only when all seven
checks pass. The overall result and each bullet use ✅ for pass, ❌ for failure,
and ❓ for missing evidence. A disabled override can still pass. Installation
facts have no PASS labels. It omits raw counters and internal identifiers unless
requested. New prerelease versions in a matching range are assumed compatible
without an exact-version coverage warning. Unlisted stable releases are unsupported.
Missing evidence about received
guidance or connectivity is UNKNOWN.

The delegate-waiting check inspects actual T3 instructions, the `delegate_task`,
`task_status` and `t3_thread_wait` descriptions, output schemas, and any
already-visible `next` results. The diagnostic scans the current upstream
discovery response after applying the configured rewrites. It reports known
unconditional end-turn and no-wait instructions as failure evidence when the
override is enabled. Workflow-priority developer guidance does not excuse a
remaining conflicting instruction. Partial discovery or no detected conflict
does not prove compatibility; the agent must inspect the remaining context.
Missing evidence is UNKNOWN. PASS requires explicit workflow control of
supported bounded waits, deadlines and recovery, including retaining task
identity after a timeout, with no remaining unconditional waiting restrictions.
When disabled, PASS verifies original T3 guidance, not bounded-wait support.
The proxy does not implement delegate deadlines or guarantee timers, and it
preserves result facts while normalizing recognized waiting hints. This diagnostic checks instruction
consistency; it does not demonstrate agent waiting or timeout recovery.
The diagnostic does not create delegates,
watches, schedules, or messages. T3 has no knowledge of this diagnostic tool,
and existing T3 watch notifications remain unchanged.

`proxy-check` reports newer or changed T3 guidance as an informational drift
notice when the installed version is outside the proxy's exact fixtures or a
known guidance surface has changed. Drift does not by itself change a
compatibility check from PASS to FAIL; inspect the received guidance and tool
metadata before treating it as a problem.

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
service, container, or global Codex configuration to uninstall. Remove the
package after stopping the wrapper if you no longer need it. No files in T3's
installation or shared workflow files are changed.

Rollback restores normal instruction delivery for new turns and sessions. It
does not erase rewritten instructions already stored in conversation history.
Likewise, installation does not erase original instructions in an old history.

## Compatibility and diagnostics

- Supports Codex app-server over newline-delimited JSON on stdio. Non-stdio
  app-server listeners are rejected. App-server tooling subcommands pass through.
- Rewrites `turn/start` entries only when their keys match
  `t3_code_orchestration_<number>`, `t3_code_runtime`, or `t3_code_tools` and
  their kind is `application`.
  For `thread/inject_items`, only corresponding tagged developer `input_text`
  messages are filtered. User and untrusted context stay unchanged.
- Redirects the flat dotted config used by T3 on `thread/start`, `thread/resume`,
  and `thread/fork`; nested `mcp_servers` config is also supported. A resume
  without config passes through. After a wrapper restart, T3 must supply the
  fresh original endpoint. Bare resumes of persisted proxy URLs are not repaired.
  An explicitly supplied old proxy URL is rejected.
- T3 supplies the runtime endpoint in the inspected release. Custom launch-arg
  overrides for `mcp_servers.t3-code` are rejected; move those out before using
  this package. Global custom MCP configuration is not migrated by the wrapper.
- Upstream endpoints must use HTTP(S) on `127.0.0.1`, `localhost`, or `::1`.
  The local listener binds to `127.0.0.1` with a random route per upstream.
  Authentication and MCP session headers pass through; the proxy does not
  refresh or issue credentials. Requests with an Origin header are rejected.
- Supports MCP JSON responses and SSE, including GET-stream list responses,
  session headers, reconnect event IDs, errors, and concurrent requests.
  HTTP connection headers are normalized for proxying. It requests identity
  encoding; compressed metadata responses are rejected. JSON request bodies,
  buffered metadata responses, and individual stream frames are limited to
  16 MiB. At most 4,096 discovery, diagnostic, and recognized waiting-call IDs
  are retained per wrapper. Pending replies and replayable SSE/GET results keep
  their correlation. Completed waiting-call JSON replies release their matching
  entry; a terminal SSE waiting reply releases it only after a matching result
  or error is parsed and no matching terminal event had a replay cursor. Session
  deletion or reuse of an ID for another method clears its entry. New
  discovery, diagnostic, or recognized waiting calls can receive HTTP 503 at
  the limit; restart the wrapper if the upstream does not delete sessions.
  Entries are not silently evicted.
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
occurred. `unrecognized_review_guidance`, `unrecognized_pr_wait_guidance`, and
`unrecognized_browser_routing_guidance`
mean targeted text has unknown wording: it was preserved, so the requested
policy may not be in effect. Disabled overrides produce no guidance warnings.
`proxy_check_name_conflict` means the upstream now uses the reserved diagnostic
name; the proxy rejects that metadata response rather than shadowing its tool.
Inspect the version before relying on it. Unknown formats are never replaced
with a broad removal of instructions.

