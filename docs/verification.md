# Verification

## Configurable overrides and diagnostic check

Verified on 2026-10-28 with Node.js 24.14.0 and Codex CLI 0.164.0:

- Explicit tests for all four override combinations, enabled defaults, config
  rejection, initial runtime context, and tagged developer reinjection.
- Exact released PR instructions and watch descriptions from the existing
  three source fixtures, including both versions of the PR-wait guidance.
- Local `proxy-check` discovery, explicit config expectations, process-wide
  observations, upstream authentication, empty-argument validation, pagination,
  GET/SSE replay, request-ID reuse, opaque ordinary results, and name collisions.
- Plain-language diagnostic facts and reporting checklist separate installation
  facts from the two override checks. New nightly
  `0.1.4-nightly.20261027.3783` selects the latest open-ended range and reports
  assumed compatibility, without an exact-version test-coverage warning. The regression
  and an additional real-Codex smoke run use existing fixture wording with
  that advertised version. This verifies range selection and diagnostic delivery,
  not nightly-specific source coverage. Missing and unmatched versions remain unsupported.
- The public binary loading the configured switches in an isolated installation.
- Real Codex with local fake MCP and inference servers: both instruction fixes
  reach inference before and after reinjection; an inference-issued code-mode
  tool call invokes `proxy-check`, whose report and checklist reach the next
  inference request. No live T3 tool or paid model endpoint is called.

The real-Codex matrix uses each listed test release with enabled defaults and
all four explicit combinations on stable `0.1.3`. To select explicit flags:

```sh
npm run smoke:codex -- /absolute/path/to/real/codex test/fixtures/t3-guidance-0.1.3.json 0.1.3 '{"reviewWorkflow":false,"prWaiting":true}'
```

The fake model proves tool-result delivery, not semantic compliance by a real
model. Live T3 startup and model interpretation of the new checklist still
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
