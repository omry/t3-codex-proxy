export const PROXY_CHECK_REQUEST_GUIDANCE = 'The user requested the local T3 Codex Proxy diagnostic. Discover and call the t3-code MCP tool named proxy-check (it may appear as proxy_check in the host tool namespace) with empty arguments, then follow its diagnostic checklist. This identifies an existing read-only tool, so do not ask which proxy or project the user means. If the tool is unavailable, report that discovery failure; do not invent diagnostic results or substitute a network proxy test.';

export const PROXY_CHECK_TOOL = {
  name: 'proxy-check',
  description: 'Check the local T3 Codex Proxy configuration, compatibility, writable-root setup, and rewrite observations. Returns local facts and a configuration-specific checklist for checking the instructions you received and MCP connectivity. Read-only.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

function delegateWaitingEvidence(metadata, enabled) {
  const names = ['delegate_task', 'task_status', 't3_thread_wait'];
  const instructions = [
    'Completion wakes this thread, so end your turn. Do not wait on it or poll it.',
    'Completion wakes this thread. End your turn unless you need this result now.',
    'Do not call it on a running task before its completion wakes you.',
    'On timeout, with `next` end your turn; without, call again.',
  ];
  const tools = Array.isArray(metadata?.tools) ? metadata.tools : [];
  const findings = [];
  for (const tool of tools) {
    if (!names.includes(tool?.name)) continue;
    for (const instruction of instructions) {
      if (typeof tool.description === 'string' && tool.description.includes(instruction)) {
        findings.push({ tool: tool.name, surface: 'description', instruction });
      }
      if (tool.outputSchema && JSON.stringify(tool.outputSchema).includes(JSON.stringify(instruction))) {
        findings.push({ tool: tool.name, surface: 'outputSchema', instruction });
      }
    }
  }
  const missingTools = names.filter(name => !tools.some(tool => tool?.name === name && typeof tool.description === 'string'));
  return {
    status: !enabled ? 'disabled' : findings.length ? 'fail' : 'unknown',
    findings,
    missingTools,
    listComplete: Array.isArray(metadata?.tools) && !metadata.nextCursor,
  };
}

export function proxyCheckResult(diagnostics, toolMetadata) {
  const waitingEvidence = delegateWaitingEvidence(toolMetadata, diagnostics.overrides.reviewWorkflow);
  const writableRoots = diagnostics.writableRoots ?? { paths: [], entries: [], configured: 0, processWritable: 0, status: 'not_configured' };
  const rootPaths = Array.isArray(writableRoots.paths) ? writableRoots.paths : [];
  const rootEntries = Array.isArray(writableRoots.entries) && writableRoots.entries.length === rootPaths.length
    ? writableRoots.entries : rootPaths.map(path => ({ path, processWritable: false }));
  const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
  const linkPath = value => `[${String(value)}](<${String(value)}>)`;
  const rootTest = rootPaths.length === 0 ? null : [
    'set -u',
    `for root in ${rootPaths.map(shellQuote).join(' ')}; do`,
    '  marker=""',
    '  if marker="$(mktemp --tmpdir="$root" ".t3-codex-proxy-check.XXXXXX")" && test -f "$marker" && rm "$marker" && test ! -e "$marker"; then',
    '    printf "PASS %s\\n" "$root"',
    '  else',
    '    [ -z "$marker" ] || rm -f "$marker"',
    '    printf "FAIL %s\\n" "$root"',
    '  fi',
    'done',
  ].join('\n');
  const expected = {
    reviewWorkflow: diagnostics.overrides.reviewWorkflow
      ? 'Your workflow controls fresh-review context and reviewer continuity.'
      : 'The proxy preserves T3 review context and reviewer continuity instructions unchanged.',
    prWaiting: diagnostics.overrides.prWaiting
      ? 'Your workflow controls PR polling, completion conditions, deadlines, retry limits, recovery, and evidence. T3 watching must not replace its bounded waits.'
      : 'The proxy preserves T3 PR-wait instructions and watch-tool descriptions unchanged.',
    browserRouting: diagnostics.overrides.browserRouting
      ? 'Your selected workflow and tools take priority. Otherwise, prefer an available authenticated API, CLI, or connector. A URL alone does not request browser automation; check existing authenticated tools before requesting browser login. Use browser automation when requested or needed, with T3 shared-browser controls.'
      : 'The proxy preserves T3 browser-selection and browser-tool guidance unchanged.',
    environmentRouting: diagnostics.overrides.environmentRouting
      ? 'Use T3 environment tools only when the user explicitly requests a T3-linked environment or delegation through T3. Host, VM, load-balancer, service-endpoint, and repository references do not by themselves request environment linking.'
      : 'The proxy preserves T3 environment-routing guidance unchanged.',
    reviewToolRouting: diagnostics.overrides.reviewWorkflow
      ? 'Your workflow controls available review tools. Use T3 review calls only when the workflow selects T3 delegates.'
      : 'The proxy preserves T3 review-tool routing guidance unchanged.',
    fixerAssignment: diagnostics.overrides.reviewWorkflow
      ? 'Your workflow assigns who fixes review findings, including small findings; without an assignment, the parent fixes small findings.'
      : 'The proxy preserves T3 fixer-assignment guidance unchanged.',
    delegateWaitingRecovery: diagnostics.overrides.reviewWorkflow
      ? 'Your workflow controls bounded delegate waits, deadlines and recovery using supported wait operations or paced task_status checks. Preserve the same task identity after a wait timeout; a timeout does not cancel the child or prove completion. The proxy changes guidance, not timers.'
      : 'The proxy preserves T3 delegate-wait and task_status guidance unchanged. Verify passthrough; disabled does not imply bounded workflow-wait support.',
  };
  const compatibility = diagnostics.fixSet ? (diagnostics.tested ? 'tested' : 'assumed') : 'unsupported';
  const reportEntries = rootEntries.map(entry => ({ ...entry,
    status: entry.processWritable ? (rootTest ? 'pending' : 'pass') : 'fail',
    agentCheck: rootTest ? 'required' : 'not_applicable',
  }));
  const report = { ...diagnostics, compatibility, upstreamMcp: 'tools/list succeeded',
    delegateWaitingEvidence: waitingEvidence,
    writableRoots: { ...writableRoots, entries: reportEntries, agentCheck: rootTest ? 'required' : 'not_applicable' }, expected };
  const rootReport = rootEntries.length === 0 ? '- none configured'
    : rootEntries.map(entry => entry.processWritable
      ? `- ❓ ${linkPath(entry.path)}: proxy writable; Codex turn pending marker test`
      : `- ❌ ${linkPath(entry.path)}: proxy process cannot write; Codex turn marker test still required`).join('\n');
  const facts = [
    'Proxy check: local facts',
    `T3 version: ${diagnostics.t3Version ?? 'unknown'}`,
    diagnostics.fixSet
      ? diagnostics.tested
        ? 'Compatibility: covered by exact-version automated tests.'
        : 'Compatibility: assumed compatible through the latest matching version range.'
      : 'Compatibility: unsupported. No explicit stable-version entry or matching prerelease range; the proxy leaves T3 guidance unchanged.',
    `Review workflow override: ${diagnostics.overrides.reviewWorkflow ? 'enabled' : 'disabled'}. ${expected.reviewWorkflow}`,
    `PR-wait override: ${diagnostics.overrides.prWaiting ? 'enabled' : 'disabled'}. ${expected.prWaiting}`,
    `Browser-routing override: ${diagnostics.overrides.browserRouting ? 'enabled' : 'disabled'}. ${expected.browserRouting}`,
    `Environment-routing override: ${diagnostics.overrides.environmentRouting ? 'enabled' : 'disabled'}. ${expected.environmentRouting}`,
    'T3 tool discovery: connected. The upstream tools/list request succeeded.',
    waitingEvidence.status === 'fail'
      ? 'Delegate waiting and recovery: FAIL. Unconditional waiting restrictions remain in effective tool metadata, even with workflow-priority developer guidance.'
      : waitingEvidence.status === 'disabled'
        ? 'Delegate waiting evidence: override disabled; preserved restrictions do not establish workflow-wait support.'
        : 'Delegate waiting evidence: UNKNOWN until received developer guidance, waiting-tool descriptions and output schemas are inspected. No detected restriction is not proof of working waits.',
    ...waitingEvidence.findings.map(({ tool, surface, instruction }) => `- ${tool} ${surface}: ${JSON.stringify(instruction)}`),
    ...(!waitingEvidence.listComplete || waitingEvidence.missingTools.length
      ? [`Waiting metadata is incomplete. Missing tools: ${waitingEvidence.missingTools.join(', ') || 'none on this page'}; tools/list ${waitingEvidence.listComplete ? 'complete' : 'incomplete or unavailable'}. Inspect missing metadata in the current tool context; absent evidence is UNKNOWN.`]
      : []),
    'Writable roots (per directory):\n' + rootReport,
    rootTest ? `Sandbox write check: pending agent verification for ${rootPaths.length} configured root(s).` : 'Sandbox write check: not applicable; no writable roots are configured.',
    'Raw rewrite counts and exact-version test coverage are available in structuredContent for debugging. Counts cover the whole wrapper process, possibly other threads. Unmatched text is not proof of a conflict in this conversation.',
  ].join('\n');
  const instructions = [
    'Use expected only as a comparison target, not as replacement instructions. Compare the developer guidance and tool descriptions actually present in your context with each expected behavior. Identify conflicting older instructions if visible. Do not reproduce full instruction blocks.',
    'For disabled overrides, verify that original T3 guidance remains; do not expect the workflow-respecting replacement.',
    'Version compatibility comes from an explicit stable-version entry or a matching prerelease/nightly range. Report "tested" when tested is true and "assumed compatible" for an untested matching nightly range. Stable releases without an explicit entry are unsupported. Missing exact-version coverage for a matching nightly must not cause UNKNOWN, FAIL, or an upgrade warning. If no stable entry or range matches, report unsupported and treat it as an installation failure.',
    'Call orchestrator_capabilities once to check an actual read-only T3 tool call. Do not delegate, send messages, start watches, or schedule work.',
    rootTest
      ? `Run this shell check in the current Codex turn to verify create and delete access for every configured root. Report Sandbox write check as PASS only when every command succeeds, FAIL when a command fails, or UNKNOWN when you cannot run it. Do not substitute the proxy-process status. Then report exactly one Writable roots row per directory with exactly one status symbol at the start: use ✅ only when both the proxy-process and Codex-turn checks pass, ❌ when either check fails, or ❓ when the Codex-turn check is unavailable. Do not show separate symbols for the two checks. Render each full absolute directory path as a Markdown link using the path as both label and target. After the symbol, explain in plain text which check failed or is missing.\n\n${rootTest}`
      : 'Sandbox write check is not applicable because no writable roots are configured.',
    'There are exactly seven compatibility checks: (1) Review context and continuity, (2) PR waiting, (3) Browser routing, (4) Review-tool routing, (5) Fixer assignment, (6) Delegate waiting and recovery, and (7) Environment routing. Checks 1, 4, 5, and 6 use the reviewWorkflow override; check 2 uses prWaiting; check 3 uses browserRouting; check 7 uses environmentRouting. Give each PASS, FAIL, or UNKNOWN based on the developer guidance and tool descriptions actually present in your context. For Environment routing when enabled, PASS requires the received machine-routing context to contain the replacement guidance and omit both original unconditional-linking bullets; FAIL means the original bullets remain or the replacement is absent; UNKNOWN means no machine-routing context is visible. When disabled, PASS means the original T3 wording is preserved. Missing evidence is UNKNOWN. Do not infer received guidance from config, expected text, or rewrite counts alone. Process-wide unmatched text does not fail this conversation by itself; a visible conflicting instruction does.',
    'For Delegate waiting and recovery when enabled, inspect the actual developer guidance, delegate_task, task_status and t3_thread_wait descriptions, output schemas and any already-visible next results. PASS requires explicit workflow control of supported bounded waits, deadlines and recovery, including keeping the same task identity after timeout, with no remaining unconditional end-turn or no-wait instructions on these surfaces. Restrictive guidance that requires ending the turn or forbids all task_status checks while a delegate runs is FAIL even when developer guidance says workflow-owned waiting takes priority. An unconditional next instruction in an output schema or already-visible tool result is also FAIL; do not excuse it because a higher-priority override exists. A delegateWaitingEvidence status of fail requires this check and the overall result to FAIL. Treat its unknown status as a request for context inspection, not as a pass; missing evidence is UNKNOWN. When disabled, PASS means original T3 guidance is preserved, not that bounded workflow waits are supported. This checks instruction consistency, not demonstrated agent waiting or timeout recovery. Do not claim that this proxy fixes delegation deadlines or guarantees timers, and preserve all tool-call results unchanged.',
    'Keep the user-facing result brief and in plain language. Start with "✅ Proxy check passed." only when the installation works and all seven compatibility checks pass, "❌ Proxy check found a problem." for any failure, or "❓ Proxy check incomplete." for missing evidence. A known failed or unresolved Delegate waiting and recovery or Environment routing check must prevent an overall green result. Then give one installation sentence with the T3 version, compatibility qualification, and T3 connection status (connected, failed, or unknown). Do not give installation facts PASS labels or mix them into the compatibility list.',
    'Follow the installation sentence with the exact heading "Compatibility checks (7):" and exactly seven bullets, in this order and with these labels: "Review context and continuity", "PR waiting", "Browser routing", "Review-tool routing", "Fixer assignment", "Delegate waiting and recovery", and "Environment routing". Begin each bullet with its status icon: ✅ for PASS, ❌ for FAIL, or ❓ for UNKNOWN. Each bullet must show enabled or disabled, PASS/FAIL/UNKNOWN, and a short concrete reason. Keep the text labels alongside the icons; a disabled override does not mean FAIL. Explain enabled overrides as workflow control and disabled overrides as preserving T3 behavior. Do not show raw counters, fix-set identifiers, test-coverage flags, or a separate proxy-facts inventory unless asked. For a failure or missing evidence, say what needs checking next.',
  ].join('\n');
  return {
    content: [{ type: 'text', text: facts + '\n\nDiagnostic checklist:\n' + instructions }],
    structuredContent: report,
    isError: false,
  };
}
