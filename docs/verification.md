# Verification

## Review tools and fixer assignment

Verified on 2026-11-12 with Node.js 24.14.0 and Codex CLI 0.166.0:

- The review replacement now follows the workflow's choice of available native
  or T3 review tools. T3 task and follow-up calls apply only to T3 delegates.
- The known small-finding instruction now follows the workflow's assigned
  fixer. The parent fixes small findings when no workflow assigns a fixer.
- All 124 tests and syntax checks pass. The fixture matrix checks enabled and
  disabled fixer guidance, and existing tests cover reinjection, idempotence,
  schemas, unrelated instructions, and the 4,000-byte context-entry limit.
- Isolated real-Codex checks pass for 4580 with all overrides enabled and all
  disabled. Both initial inference and tagged reinjection receive the expected
  fixer guidance. These checks use fake local MCP and inference servers.
- The current source diagnostic expands the checklist to six compatibility
  checks, including an independent delegate-waiting check. This source change
  is not live-verified yet; the running proxy still serves the prior checklist.

After reloading the shared app-server, live `proxy_check` passed on 4580.
The latest received developer context lets the workflow choose native or T3
review tools and assign the fixer for small findings. The earlier tool-routing
conflict no longer blocks AWD's native review path.

Delegate waiting remains unresolved. The proxy continues to preserve tool-call
results and does not implement delegate deadlines or timeout recovery.

## Nightly 4580 linking wording

Verified on 2026-11-12 with Node.js 24.14.0 and Codex CLI 0.166.0:

- Live `proxy_check` reported T3 `0.1.10-nightly.20261112.4580`. The received
  PR block changed two linking sentences, preventing the complete-block match.
  Review and browser overrides were present; conflicting PR-wait rules remained.
- The new fixture records that observed PR block. Its other inputs come from
  the 4119 fixture, with provenance recorded in `sourceNote`. The regression
  failed before the fix and passed afterward.
- Added an exact guarded variant that preserves the new linking text and
  restores workflow control over PR waits. Unknown surrounding rules still
  pass through with a content-free warning.
- All 123 tests and syntax checks pass. The new fixture covers all eight
  override combinations, disabled passthrough, idempotence, tagged reinjection,
  linking-text preservation and the 4,000-byte context-entry limit.
- Isolated real-Codex smoke checks pass with enabled defaults and all overrides
  disabled. Local fake MCP and inference servers verify initial context,
  reinjection, tool descriptions and diagnostic delivery. The complete suite
  and smoke checks required permission to bind localhost outside the sandbox.

After reloading the shared app-server, live `proxy_check` passed on 4580 and
confirmed that workflow-owned PR waits are preserved in the received guidance.

## Nightly 4119 batch PR linking

Verified on 2026-11-03 with Node.js 24.14.0 and Codex CLI 0.166.0:

- Live `proxy-check` reported T3 `0.1.7-nightly.20261103.4119`. The received
  PR block offered `link_pull_requests` for several PRs. That changed linking
  sentence prevented the complete-block match, leaving the PR-wait policy
  unchanged. Review and browser overrides were present.
- The new fixture captures the observed PR block and native-delegation bullet.
  Its other inputs come from the 3991 fixture; their provenance is recorded
  in `sourceNote`. The regression failed before the fix and passed afterward.
- Added a guarded match for the observed block. Its replacement preserves the
  batch-linking choice and restores workflow control over PR waits. Unknown
  surrounding PR rules still pass through with a content-free warning.
- All 114 tests and syntax checks pass. Coverage includes all eight override
  combinations for 4119, disabled passthrough, idempotence, tagged reinjection,
  batch-linking preservation, and the 4,000-byte context-entry limit.
- Isolated real-Codex smoke checks pass for 4119 with enabled defaults and
  all overrides disabled. They use fake local MCP and inference servers and
  verify initial context, reinjection, tool descriptions, and diagnostic delivery.
  The sandbox blocked localhost listeners; the checks passed when run with
  permission to bind localhost outside the sandbox.
- The diagnostic now requests ✅, ❌, or ❓ beside the overall result and
  each override check, retaining the text status and enabled/disabled state.
  All 13 diagnostic tests and syntax checks pass after the format change.

After reloading T3's shared app-server, the live installation check passed on
4119. The tool reported exact-version test coverage and working MCP discovery.
The received developer context included all three overrides, including
workflow-owned PR waits, and the diagnostic supplied the new icon format.

## Nightly wording regression

Verified on 2026-11-01 with Node.js 24.14.0 and Codex CLI 0.166.0:

- Live `proxy-check` and `orchestrator_capabilities` calls succeeded on T3
  `0.1.7-nightly.20261031.3991`. The received review guidance was rewritten,
  but the PR runtime block and browser-selection sentence were not. Both had
  changed wording that no longer matched the guarded substitutions.
- Added exact matches for those two inputs. The new fixture records the
  observed PR block and visual section; it retains known review and browser-tool
  inputs whose rewritten forms were observed unchanged in live context.
- All eight override combinations pass for the new fixture, including disabled
  passthrough, idempotence, tagged reinjection, preservation of unrelated
  guidance, and the 4,000-byte context-entry limit. All 105 tests and syntax
  checks pass; changed surrounding PR rules and unknown browser sentences
  remain untouched with content-free warnings.
- The isolated real-Codex smoke passes with the new fixture. All three fixes
  reach fake inference before and after reinjection, and the diagnostic reaches
  the next inference. The smoke now selects its fake provider at app-server
  startup as well as on the thread, as required by Codex 0.166.0. Additional
  smoke runs pass with every override disabled on the nightly and with enabled
  defaults on stable `0.1.3`.

The running shared app-server still needs a T3 restart to load the source
changes. A post-restart live installation check has not been performed.

## Configurable overrides and diagnostic check

Verified on 2026-10-28 with Node.js 24.14.0 and Codex CLI 0.164.0:

- All 95 tests pass, including all eight combinations of `reviewWorkflow`,
  `prWaiting`, and `browserRouting`, enabled defaults, config rejection,
  initial context, and tagged developer reinjection.
- Exact released PR instructions and watch descriptions from the existing
  three source fixtures, including both versions of the PR-wait guidance.
  The fixtures also capture browser-tool guidance from each release. Browser
  routing replaces the page/tab condition in newer orchestration sections
  and adds API/CLI/connector guidance to the older browser-tool block.
  Tests preserve shared-browser controls, unrelated visual/device guidance,
  user input, and tool results; verify repeated application and disabled
  passthrough; and check the Codex 4,000-byte context-entry limit. Unknown
  browser wording stays unchanged with a content-free warning.
- Local `proxy-check` discovery, explicit config expectations, process-wide
  observations, upstream authentication, empty-argument validation, pagination,
  GET/SSE replay, request-ID reuse, opaque ordinary results, and name collisions.
- Plain-language diagnostic facts and reporting checklist separate installation
  facts from the three override checks. New nightly
  `0.1.4-nightly.20261027.3783` selects the latest open-ended range and reports
  assumed compatibility, without an exact-version test-coverage warning. The regression
  and an additional real-Codex smoke run use existing fixture wording with
  that advertised version. This verifies range selection and diagnostic delivery,
  not nightly-specific source coverage. Missing and unmatched versions remain unsupported.
- The public binary loading the configured switches in an isolated installation.
- Real Codex with local fake MCP and inference servers: all three instruction fixes
  reach inference before and after reinjection; an inference-issued code-mode
  tool call invokes `proxy-check`, whose report and checklist reach the next
  inference request. No live T3 tool or paid model endpoint is called.

The real-Codex matrix uses each listed test release with enabled defaults and
all eight explicit combinations on stable `0.1.3`. To select explicit flags:

```sh
npm run smoke:codex -- /absolute/path/to/real/codex test/fixtures/t3-guidance-0.1.3.json 0.1.3 '{"reviewWorkflow":false,"prWaiting":true,"browserRouting":true}'
```

The fake model proves instruction and tool-result delivery, not semantic
compliance by a real model. The private-advisory incident was not replayed
against a live service, and no model-behavior evaluation was run. Live T3
startup and model interpretation of the new guidance and checklist still
require the installation check in the README after restarting the backend.

## Earlier installation verification

Verified on 2026-10-27 using WSL, Node.js 24.14.0 and Codex CLI 0.164.0.
The [tested-version list](usage.md#versions) records exact-release coverage
separately from the open-ended support ranges used to select fixes.

## Automated checks

Run `npm run check` and `npm test`. Tests use local fake peers and installed
fake Codex layouts; they do not update the real Codex installation or call a
paid model endpoint.

Coverage includes:

- Exact scoped developer-guidance rewrites, user/untrusted context preservation,
  idempotence, and tagged developer-message reinjection.
- Both original tool descriptions, unchanged schemas, and unrelated descriptions.
- MCP endpoint overrides on start/resume/fork, nested config, authentication and
  timeout preservation, and config-less resume behavior.
- NDJSON and SSE framing, split UTF-8, mixed line endings, comments, event IDs,
  progress events, malformed data, frame limits, complete CR-only EOF events,
  incomplete lines, split CRLF, live CR/mixed-interleaved delivery before upstream close,
  semantic complete-event decoding, interleaved data fields, stream-leading BOM handling,
  and opaque results.
- HTTP initialize/list/call/delete, session and protocol headers, pagination
  arguments, opaque tool results, authentication errors, and sanitized failures.
- Concurrent requests across credentials/sessions, list replies on GET streams,
  streamed tool output, response-header correction, and active-stream shutdown.
- Stateless clients reusing the same request ID and credential on concurrent
  POSTs: each list response is matched to its own originating request.
- Replayed GET list responses, request-ID reuse, and session deletion.
- Complete and fragmented oversized SSE events, plus multiple small events.
- Executable passthrough, interleaved approval messages, exit codes, signals,
  EOF escalation, listener cleanup, and npm-style launcher descendants.
- Legacy unknown config properties, executable override, direct launch through
  an installed fake global layout, read-only prefixes, candidate-layout spawn
  failures, fixed diagnostics, and output privacy.
- Inclusive/open version ranges, nightly semantic ordering, tested-support
  classification independent of matching, missing/mismatched versions, and
  concurrent wrappers selecting different fix sets.

The guidance fixture and original matcher strings were derived from the
T3 release's orchestration instructions and orchestrator tool descriptions.
See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Isolated real-Codex check

```sh
npm run smoke:codex -- /absolute/path/to/real/codex
```

This starts the actual Codex CLI through the wrapper using a temporary Codex
home, workspace, and an isolated config. Fake local servers supply MCP metadata
and model responses. Optional arguments after the Codex path select a fixture
and advertised T3 version, for example:

```sh
npm run smoke:codex -- /absolute/path/to/real/codex test/fixtures/t3-guidance-0.1.3.json 0.1.3
```

The same check passed for all four tested versions. Fixtures retain the exact
released instruction sections and tool descriptions. Stable `0.1.3` and nightly
`20261027.3754` share upstream commit `d2c440312e5f39d59827ed466838a623516454d6`.
The published Linux `0.1.3` artifact was SHA-256 verified; its bundled
`buildCodexInitializeParams` sends `clientInfo.version` from the stamped
`0.1.3` value. Release workflows stamp package versions before building.

Verified:

- A new Codex thread starts and authenticates with the fake MCP server through
  the local proxy.
- `mcpServerStatus/list` returns the rewritten older descriptions or the
  unchanged neutral newer descriptions, with unchanged input schemas.
- Model-bound requests contain the rewritten developer paragraph and exclude
  the original conflicting paragraph.
- A later model-bound request includes the rewritten tagged developer message
  supplied through `thread/inject_items`, with a unique reinjection marker.

The generated schemas from the installed Codex CLI were used to check exact
request shapes. The official
[Codex app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes the underlying stdio JSON-RPC and thread lifecycle.

## Live T3 check

The first attempt bypassed the wrapper because T3 kept its pre-change shared
app-server running after the binary-path setting was saved. Restarting the
desktop-owned backend activated the wrapper. A new conversation alone was
insufficient before that restart.

After restart, direct process inspection confirmed the running wrapper. The
resumed development conversation received rewritten developer guidance, and
its two live tool descriptions matched the expected substitutions exactly.
Their remaining text and embedded declarations stayed unchanged. A live
`orchestrator_capabilities` call succeeded.

The user then supplied the successful result from a fresh T3 conversation:
both tool descriptions quoted the replacement policy, developer review
guidance was reported consistent with it, and one capabilities call succeeded.
No agents were created or persistent state changed by that test.

This verifies core instruction delivery and a working MCP call. Existing
threads can use the wrapper when resumed after a backend restart; stored
conversation history is not scrubbed.

## Limits

The four-version automated matrix uses actual released payloads with real
Codex, rather than four running T3 desktop installations. The user's live
installation check after upgrading is still required. Actual delegated-review
and follow-up execution on the new release, real automatic compaction, live
fork recovery, and compatibility across other upgrades have not been qualified.
The reinjection test exercises the RPC used after compaction, without forcing
automatic compaction. Delivery does not guarantee that a model follows the
policy in every case. Complete removal of all developer messages is untested.

Codex package updates are manual: stop T3 Code, use the installation's normal
package manager, and reopen T3. T3's own Update action remains unavailable
with a custom wrapper binary path.

The live capability response omitted the Codex provider's `runtimeModes` field.
That limits validation of explicitly requested child runtime modes. It is a
separate upstream metadata gap; the proxy preserves capability results.

During publication checks, the real-Codex smoke exposed a request-ID collision
between two stateless MCP connections. A regression test reproduced the missing
rewrite before the fix. POST replies are now matched to their own request,
while GET-stream replies use a retained request-ID lookup for reconnect replay. This fixes the
underlying response filtering rather than relaxing the smoke assertion.
