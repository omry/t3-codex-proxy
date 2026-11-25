# Verification

## PR tool choice, device tool choice, and environment-link descriptions

Verified locally on 2026-11-26 against partial source captures from installed
T3 `0.1.13-nightly.20261125.5245`, commit `1c3f0ee88fc7`. This capture does not
add the release to the complete exact-version coverage list.

The new independent `prToolRouting` and `deviceRouting` switches default to
true. PR tool selection follows the user's workflow, including `gh` or `cafe`
when selected, while retaining PR and issue linking. Device instructions and
the `device_open` and `device_screenshot` descriptions let the workflow choose
tools and recovery, keeping T3 as the default and retaining session ownership.
The existing `environmentRouting` switch now also requires an explicit request
in the `t3_environment_link` description. Config validation, setup controls,
examples, and the nine-check diagnostic include these changes.

These are local guidance truth fixes: the changed output removes the conflicting
instructions instead of merely hiding the claims in the diagnostic. Live instruction delivery was subsequently checked after the proxy reloaded this
checkout, as recorded below.
The diagnostic now detects preserved conflicting environment and device tool
descriptions; a clean metadata scan still needs actual received-context inspection.

The focused new routing tests failed before implementation. After implementation,
all 288 tests and syntax checks passed. The full suite requires execution outside
the sandbox for temporary loopback listeners and child processes; the initial
sandbox attempt failed with EPERM. The package dry run passed with a temporary
npm cache because the default cache is read-only in the sandbox.

Isolated real-Codex 0.172.0 smoke checks passed with all overrides enabled and
with all disabled, advertised as nightly 5245. Temporary fake model and MCP
servers verified initial and reinjected developer context, regular tool-description
discovery reaching inference, direct waiting descriptions and replies, and the
nine-check diagnostic. No live device, delegate, or linked machine was exercised.
The subsequent live `proxy-check` on nightly 5245 passed all nine instruction
checks. The current developer runtime lets the workflow choose PR tools,
including `gh` and `cafe`. Current discovery exposes environment linking only
on an explicit request and device-tool descriptions that defer tool choice to
the workflow. Device developer guidance is not active in this conversation;
its complete rewrite was verified by the isolated real-Codex smoke, while the
live check covers the exposed descriptions. The waiting metadata scan was
complete, with no known conflicts; installed output schemas use a plain-string
`next`. Both proxy-process access and this turn's create/delete marker check
passed for `/home/omry/.local/state/awd`. The earlier read-only
`orchestrator_capabilities` call in this thread succeeded; the live diagnostic
also authenticated a fresh upstream `tools/list` request.

This is instruction-delivery verification, not a demonstration of a live device,
delegate timeout, or environment-link operation. At the time of that live check, publication, a version bump,
and remote push had not occurred.


## Nightly 5191 PR watching; verified live

Verified on 2026-11-25 with T3 `0.1.12-nightly.20261124.5191`.
The nightly changed the `watch_pull_request` description, so the old guarded
rewrite missed it and left "After this call, end your turn." in the live tool.
The initial all-green agent report missed that conflict.

The description-only fixture records the exact live catalog wording, checked
against the installed AppImage server bundle. It does not claim complete
version or schema coverage. The diagnostic regressions failed before detection
was added. The watch-description and endpoint regressions then failed before
the new guarded rewrite was added. They pass afterward. Unknown surrounding
wording containing the known restriction still produces `PR waiting: FAIL`;
disabled overrides preserve T3 behavior. Conflict-free or missing metadata
still requires inspection of received developer and tool guidance.

The rewrite changes only the unconditional end-turn sentence. It preserves
merge/close notifications, watch persistence, schemas and unrelated metadata.
All 265 tests and syntax checks pass. Enabled and all-disabled isolated smoke
checks pass with real Codex 0.172.0 and local fake model/MCP servers. Their
composite fixture uses the 5191 watch description, 4928 PR context, 4774
environment section and remaining 4580 inputs, rather than a complete capture
of 5191 guidance.

The requested updated live diagnostic failure was not demonstrated before the
rewrite fix. The pre-restart MCP call returned the old diagnostic payload,
without `prWaitingEvidence`. Inspection showed the conflicting live description,
but reporting that as the promised updated diagnostic checkpoint overstated
the evidence. The user chose one restart to verify the completed fix; the
missing live pre-fix diagnostic checkpoint remains an explicit process gap.

After that restart, the live `proxy-check` returned the new PR-wait evidence
field, with no detected restrictions. The actual model-visible watch description
now says "End your turn when T3 owns the wait; preserve any workflow-owned wait,
deadlines, and recovery." The merge/close wording and optional `until` values
`checks` and `merged` remain visible. Inspection of current developer guidance,
regular tools and direct waiting tools supports all seven compatibility checks.
The configured writable root passed both the proxy-process check and this
Codex turn's create/delete check. T3 remained connected and assumed compatible
through the matching nightly range.

This is a truth fix verified in the running session for instruction delivery
and consistency. It does not demonstrate behavior on an actual live PR wait or
guarantee model compliance. At live verification, source changes remained local
and publication had not occurred. The user then authorized the release.

## Waiting guidance normalization; verified live

Verified locally on 2026-11-21 after diagnostic checkpoint `cff76ab010f7`.
Before normalization, the updated live `proxy-check` on T3
`0.1.12-nightly.20261121.5024` reported FAIL for the remaining
`t3_thread_wait` timeout instruction. T3 connectivity and the configured
writable-root checks also passed. This preserves the requested live failing
state before underlying remediation.

The source now replaces that known timeout instruction and the two observed
`next` hints in identified waiting-tool results, including JSON-text and
structured content. Direct matching output-schema literals agree with the
normalized results. This is a narrow exception to the earlier blanket
result/schema preservation rule; task identity, status, timeout facts,
summaries, input schemas and unrelated result fields remain unchanged.
Unknown hints, unsupported schema shapes, errors, unrelated tools, disabled
overrides and unsupported versions retain their previous behavior. The
diagnostic still fails when a known conflict remains outside a supported
rewrite shape; its pass criteria have not been relaxed.

The metadata and reply regressions failed before the source change. All 243
tests and syntax checks pass afterward, including JSON, SSE, GET replay,
session separation, request-ID reuse and preserved result facts. Isolated
real-Codex 0.171.0 smoke checks pass with enabled defaults and all overrides
disabled. Fake model and MCP servers verify delivery of the normalized or
original waiting hint to the next inference without calling live T3 tools.
The smoke includes a starting task with a null child thread, matching the
nullable `childThreadId` exposed by the current live T3 signature.

After a coordinated restart, the regular diagnostic scan no longer found the
known restriction, and the new developer and `task_status` guidance were
visible. This did not prove that the direct tools were rewritten. The user
reported the conflicting direct `t3_thread_wait` description still present.
Inspection of the installed nightly 5024 server's `codexThreadRuntimeParams`
found a second MCP server, `t3-code-direct`, with `delegate_task` and
`t3_thread_wait` excluded from deferred/code-mode discovery. The wrapper had
redirected only `t3-code`, leaving this model-visible route untouched.

The source now redirects both exact server names through the existing proxy,
preserving enabled/disabled tool lists, direct-exposure settings, headers and
timeouts. Both the routing regression and real-Codex direct-description check
failed before this change. The updated smoke uses the installed two-server
layout, verifies the actual direct tool definition in the model request, and
calls a fake direct waiting tool to check its normalized timeout reply at the
next inference. Enabled and disabled checks pass. The underlying guidance
fixture is from nightly 4580; the server layout is from installed nightly 5024.

Checking the live signature also exposed a startup case the source fixture
missed: `childThreadId` can be null. Its regression failed against the first
normalization, then passed after a one-line guard correction. The final tests
and smoke checks include both corrections.

After the final reload, T3 explicitly refreshed the model-visible direct
`t3_thread_wait` declaration with the workflow-controlled timeout guidance.
The live `proxy-check` on nightly 5024 then passed all seven compatibility
checks after inspection of the actual current developer instructions and tool
descriptions. Its complete metadata scan had no known waiting conflicts, and
both writable-root checks passed. This verifies instruction delivery and
consistency in the running session, including the direct path that previously
bypassed the proxy. No actual live delegated timeout or model compliance has
been demonstrated. At the time of this verification, publication had not yet
occurred.

## Waiting diagnostic coverage; underlying issue remains

Verified locally on 2026-11-21. The diagnostic now inspects effective waiting
tool descriptions and output schemas from its authenticated `tools/list`
response. Known unconditional `next` and `t3_thread_wait` instructions fail
the enabled waiting check even when developer guidance gives the workflow
priority. Missing metadata and no detected conflict do not imply a pass.

An endpoint regression failed before the diagnostic change because the result
had no failure evidence. After the change, the unchanged T3 source fixture
reports FAIL for the `next` output-schema literal and `t3_thread_wait`
description. Tests verify that these instructions and ordinary tool results
remain unchanged, and that a disabled override still checks passthrough.
All 226 tests and syntax checks pass.

Local evaluation of the current session's exposed tool descriptions also
reports FAIL for `t3_thread_wait`. This is a diagnostic truth fix: it detects
the remaining conflict. The underlying waiting fix is deferred at the user's
request. No shared backend restart or live `proxy-check` with the new
diagnostic has occurred; the running proxy still needs to reload this source.

## Workflow coverage before PR watching

Verified locally on 2026-11-20. The PR-wait guidance now requires checking the
selected workflow and applicable skills before choosing T3 watching. A
standalone prerequisite PR does not automatically leave the workflow. The
guidance preserves applicable request, polling, evidence, retry, recovery,
and completion gates, and separates later owner-merge notifications from
CI/review qualification.

The new guidance assertions failed before the source change and passed after
it. All 222 tests and syntax checks pass, including disabled passthrough,
reinjection, idempotence, and context byte limits. The full suite needed
execution outside the sandbox for local loopback listeners and child processes.
An isolated real-Codex 0.171.0 smoke check passed with enabled defaults and
advertised nightly 4928, combining its captured PR block with the 4774
environment section and earlier 4580 inputs for other surfaces. Fake local
model and MCP servers verified delivery in initial and reinjected context.

After the user restarted T3, live `proxy-check` passed all seven compatibility
checks on `0.1.12-nightly.20261120.4994`. The received PR runtime block included
the new workflow-coverage, prerequisite-PR, and owner-merge guidance. T3 tool
discovery was connected, and the configured writable root passed both checks.
The nightly retains assumed compatibility through its matching range.

This fixes instruction delivery in the running session. It does not replay the
reported Hydra incident or prove model compliance on an actual PR. After
reviewing the live result, the user authorized the PR cycle, merge, and
publication. The later 0.1.5 release completed that publication process.

## Nightly 4928 PR waiting

The live proxy check on 2026-11-19 found a PR-wait conflict on T3
`0.1.11-nightly.20261119.4928`. The runtime block now appends PR-tool routing
and issue-linking instructions. The older complete-block guard did not match,
so unconditional watching and end-of-turn rules remained in received context.
The other six compatibility checks passed. A read-only T3 capability call and
the configured writable root's Codex-turn create/delete check also passed.

The new exact variant preserves the added tool-routing and issue-linking text
while restoring workflow control over PR waits. The PR-only fixture records
the observed block and its provenance. Unknown surrounding instructions remain
unchanged with a content-free warning. The regression failed before the fix
and passed afterward. Tests cover enabled and disabled behavior, tagged
reinjection, idempotence, unrelated context and user-input preservation, all
override combinations, unsupported stable releases, and the context byte limit.

All 222 tests and syntax checks pass. Enabled and all-disabled isolated checks
pass with Codex 0.170.0, using local fake model and MCP servers. Their composite
input combines the captured 4928 PR block and 4774 environment section with the
earlier 4580 fixture for other surfaces. These checks verify delivery before
initial and reinjected inference; they do not exercise a live PR wait. The
full suite and smoke checks ran outside the sandbox for loopback sockets and
child processes. Package dry-run validation also passes.

After restarting T3 on 2026-11-19, live `proxy-check` passed all seven
compatibility checks on nightly 4928. The newly received PR runtime block
contained the workflow-owned waiting guidance and preserved the added PR-tool
and issue-linking instructions. The configured writable root passed both the
proxy-process and Codex-turn create/delete checks. This verifies the behavior
fix in the running session; it does not guarantee model compliance on every
task. This nightly retains assumed compatibility through its matching range;
the partial capture does not add it to the complete tested-version list.

After the user reviewed that live result and approved publication, npm login
and publication used browser approval with the user's YubiKey. Version 0.1.3
became available as `latest` after npm processing. The downloaded registry
tarball matched the approved package's SHA-1 checksum:
`0305682360f114f99917664732b2ec3f9f27093a`.

## Nightly 4774 environment routing

The live check on T3 `0.1.10-nightly.20261116.4774` still received the original
machine-routing instructions. T3 had shortened both bullets, so neither matched
the proxy's older exact pair. The guarded rewrite left the section unchanged.

The source now accepts the captured 4774 pair as a second known variant. Both
complete original lines must match before either changes. The replacement
requires an explicit T3 environment request, preserves `environmentId` and
`threadId` targeting, and retains the pairing-code and missing-link-tools
instructions. Unknown or incomplete pairs remain unchanged with a content-free
warning. Stable-version selection and nightly range selection are unchanged.

The environment-only fixture records the exact received section and its source.
It does not claim a complete capture of 4774 guidance. The reproduction failed
before the fix and passed afterward. The initial 205-test suite and syntax
checks passed. Review then found and corrected CRLF line-ending handling,
with added regression coverage for old and new bullet pairs.
Tests cover initial context, tagged reinjection, idempotence, unrelated text,
disabled passthrough, all override combinations, unsupported stable releases,
the context byte limit, and rejection of missing or changed bullets.

Enabled and all-disabled isolated real-Codex checks passed with Codex 0.169.0.
Those checks combined the captured 4774 environment section with the existing
4580 fixture for other surfaces. They verified delivery and removal of the
original machine-routing bullets before initial and reinjected inference.
Fake local MCP and model servers were used; no live environment action ran.
The full suite required execution outside the sandbox for loopback sockets
and child processes, with temporary files in the workspace.

After restarting T3 on 2026-11-16, live `proxy-check` passed on nightly 4774.
The received machine-routing context contained the explicit-request replacement
and omitted both original unconditional-linking bullets. All seven compatibility
checks passed, a read-only T3 capability call succeeded, and the configured
writable root passed the Codex-turn create/delete check. This verifies delivery
of the source behavior fix; it does not guarantee model compliance on every task.

## Explicit stable-version support

Stable T3 releases require an explicit version-to-fix-set entry. Stable `0.1.3`
selects `current`; unlisted stable releases receive no compatibility rewrites,
emit `unsupported_t3_version`, and report unsupported in `proxy-check`.
Prerelease and nightly versions retain range selection. Build metadata does not
change the stable version selected. Regression checks require each supported
stable entry to reference an existing fix set, tested version, and guidance
fixture. Separate checks verify that unlisted stable versions preserve developer
guidance and tool descriptions and produce an unsupported diagnostic.

Validation: syntax checks and 120 focused policy tests pass. The full suite
passed 200 of 201 tests; the remaining test hit a `/tmp` quota error while
copying a fixture. It passed when rerun with a temporary directory in the
workspace. The running shared proxy has not loaded this change.

## Workflow-owned delegate waits

The source now replaces the two observed delegate no-poll sentences and the
known `task_status` restriction under the existing `reviewWorkflow` switch.
It preserves cancellation, schemas and tool results. The workflow retains
control of supported bounded waits and timeout recovery; a timeout keeps the
same child identity and does not imply cancellation or completion. The sixth
diagnostic check reports this switch's enabled/disabled state and checks
actual received guidance, rather than reporting an independent unimplemented
override. It still requires evidence before PASS.

All 200 tests and syntax checks pass. Enabled and all-disabled isolated
real-Codex smoke checks verify context, reinjection and `task_status`
descriptions at inference. The fixture matrix covers the earlier no-poll
wording; a separate fixture records the live 4580 wording and status-tool text.
Regression checks retain cancellation rules, output schemas, task identity,
timeout fields and the original `next` value. Smoke responses use a fake model;
no live delegated task or timeout-recovery behavior was exercised.

The local full suite and isolated smoke checks verify the replacement in both
developer instructions and the `task_status` description. The diagnostic now
specifies seven checks. A live shared-proxy check has not been run for this
change, and the shared proxy was not restarted. Earlier live checks below used
the preceding source and still found the delegate-wait conflict.

## Environment routing

The proxy now treats machine routing as a separate compatibility surface. Its
default `environmentRouting` rewrite preserves the `environmentId` and
`threadId` targeting details for explicit T3 environment or cross-machine
delegation requests, while guiding the model away from environment linking when
host, VM, load-balancer, service-endpoint, or repository names appear during
ordinary debugging. This changes developer guidance; it cannot enforce model
behavior or guarantee tool availability. The setup page and configuration file
expose the switch, and `proxy-check` reports it as the seventh check.

The rewrite is guarded by machine-routing markers and applies to both initial
developer context and tagged compaction reinjection. Setting
`environmentRouting` to `false` preserves the original T3 wording. No live
environment tool call is made or used as proof of model compliance by these
checks.

## Diagnostic request discovery

A fresh T3 conversation on 2026-11-12 asked which proxy `proxy-check` referred
to and made no tool calls. Advertising the diagnostic in MCP discovery alone
did not reliably map that short request to the tool.

The wrapper now adds a tool-discovery hint for exact `proxy-check` and
`proxy_check` requests with T3 application runtime context. All 126 tests and
syntax checks pass. Enabled and all-disabled real-Codex smoke checks verify
that the hint reaches inference before the bare diagnostic request, and that
the tool result reaches the next inference. Those smoke checks use a fake
model; they verify delivery, not a live model's decision to call the tool.
The hint was subsequently observed in the resumed development conversation,
where `proxy-check` invoked the diagnostic. Recognition in a fresh conversation
remains unverified.

## Review tools and fixer assignment (earlier checkpoint)

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
conflict no longer blocks the native review path.

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

The GitHub Actions workflow also runs the isolated real-Codex smoke test on
`ubuntu-latest`, `macos-latest`, and `windows-latest`. It installs the pinned
Codex CLI release, points it at the local fake model and MCP services, and
does not require an OpenAI subscription or API key. The Windows job resolves
the npm `codex.cmd` launcher and exercises the wrapper's command-shell path.

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
