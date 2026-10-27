# Verification

Verified on 2026-10-27 using WSL, Node.js 24.14.0, Codex CLI 0.164.0, and
T3 Code `0.1.3-nightly.20261025.3655`. The T3 version records what was tested;
the proxy does not enforce a version pin. Other versions are not qualified by
these results.

## Automated checks

The complete-suite count is intentionally omitted for this repair. Focused
config/wrapper tests and syntax checks use local fake peers and installed fake
Codex layouts; they do not update the real Codex installation or call a paid
model endpoint.

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

The guidance fixture and original matcher strings were derived from the
T3 release's orchestration instructions and orchestrator tool descriptions.
See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Isolated real-Codex check

```sh
npm run smoke:codex -- /absolute/path/to/real/codex
```

This starts the actual Codex CLI through the wrapper using a temporary Codex
home, workspace, and an isolated config. Fake local servers supply
MCP metadata and model responses.

Verified:

- A new Codex thread starts and authenticates with the fake MCP server through
  the local proxy.
- `mcpServerStatus/list` returns both rewritten descriptions with unchanged
  input schemas.
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

Actual delegated-review and follow-up execution, real automatic compaction,
live fork recovery, and compatibility across upgrades have not been qualified.
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
