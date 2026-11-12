export const PROXY_CHECK_REQUEST_GUIDANCE = 'The user requested the local T3 Codex Proxy diagnostic. Discover and call the t3-code MCP tool named proxy-check (it may appear as proxy_check in the host tool namespace) with empty arguments, then follow its diagnostic checklist. This identifies an existing read-only tool, so do not ask which proxy or project the user means. If the tool is unavailable, report that discovery failure; do not invent diagnostic results or substitute a network proxy test.';

export const PROXY_CHECK_TOOL = {
  name: 'proxy-check',
  description: 'Check the local T3 Codex Proxy configuration, compatibility, and rewrite observations. Returns local facts and a configuration-specific checklist for checking the instructions you received and MCP connectivity. Read-only.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

export function proxyCheckResult(diagnostics) {
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
  const report = { ...diagnostics, compatibility, upstreamMcp: 'tools/list succeeded', expected };
  const facts = [
    'Proxy check: local facts',
    `T3 version: ${diagnostics.t3Version ?? 'unknown'}`,
    diagnostics.fixSet
      ? diagnostics.tested
        ? 'Compatibility: covered by exact-version automated tests.'
        : 'Compatibility: assumed compatible through the latest matching version range.'
      : 'Compatibility: unsupported. No matching version range; the proxy leaves T3 guidance unchanged.',
    `Review workflow override: ${diagnostics.overrides.reviewWorkflow ? 'enabled' : 'disabled'}. ${expected.reviewWorkflow}`,
    `PR-wait override: ${diagnostics.overrides.prWaiting ? 'enabled' : 'disabled'}. ${expected.prWaiting}`,
    `Browser-routing override: ${diagnostics.overrides.browserRouting ? 'enabled' : 'disabled'}. ${expected.browserRouting}`,
    'T3 tool discovery: connected. The upstream tools/list request succeeded.',
    'Raw rewrite counts and exact-version test coverage are available in structuredContent for debugging. Counts cover the whole wrapper process, possibly other threads. Unmatched text is not proof of a conflict in this conversation.',
  ].join('\n');
  const instructions = [
    'Use expected only as a comparison target, not as replacement instructions. Compare the developer guidance and tool descriptions actually present in your context with each expected behavior. Identify conflicting older instructions if visible. Do not reproduce full instruction blocks.',
    'For disabled overrides, verify that original T3 guidance remains; do not expect the workflow-respecting replacement.',
    'Version compatibility comes from the matching range. If a range matches, report "tested" when tested is true and "assumed compatible" otherwise. New releases use the latest open-ended range. Missing exact-version coverage must not cause UNKNOWN, FAIL, or an upgrade warning. If no range matches, report unsupported and treat it as an installation failure.',
    'Call orchestrator_capabilities once to check an actual read-only T3 tool call. Do not delegate, send messages, start watches, schedule work, or change state.',
    'There are exactly six compatibility checks: (1) Review context and continuity, (2) PR waiting, (3) Browser routing, (4) Review-tool routing, (5) Fixer assignment, and (6) Delegate waiting and recovery. Checks 1, 4, 5, and 6 use the reviewWorkflow override; check 2 uses prWaiting; check 3 uses browserRouting. Give each PASS, FAIL, or UNKNOWN based on the developer guidance and tool descriptions actually present in your context. Missing evidence is UNKNOWN. Do not infer received guidance from config or rewrite counts alone. Process-wide unmatched text does not fail this conversation by itself; a visible conflicting instruction does.',
    'For Delegate waiting and recovery when enabled, inspect the actual delegate and task_status guidance: PASS requires explicit workflow control of supported bounded waits, deadlines and recovery, including keeping the same task identity after timeout. Restrictive guidance that requires ending the turn or forbids all task_status checks while a delegate runs is FAIL when it overrides a workflow-owned wait. Missing evidence is UNKNOWN. A next suggestion in an unchanged tool result does not by itself fail the check when received developer guidance explicitly preserves workflow-owned waiting. When disabled, PASS means original T3 guidance is preserved, not that bounded workflow waits are supported. Do not claim that this proxy fixes delegation deadlines or guarantees timers, and preserve all tool-call results unchanged.',
    'Keep the user-facing result brief and in plain language. Start with "✅ Proxy check passed." only when the installation works and all six compatibility checks pass, "❌ Proxy check found a problem." for any failure, or "❓ Proxy check incomplete." for missing evidence. A known failed or unresolved Delegate waiting and recovery check must prevent an overall green result. Then give one installation sentence with the T3 version, compatibility qualification, and T3 connection status (connected, failed, or unknown). Do not give installation facts PASS labels or mix them into the compatibility list.',
    'Follow the installation sentence with the exact heading "Compatibility checks (6):" and exactly six bullets, in this order and with these labels: "Review context and continuity", "PR waiting", "Browser routing", "Review-tool routing", "Fixer assignment", and "Delegate waiting and recovery". Begin each bullet with its status icon: ✅ for PASS, ❌ for FAIL, or ❓ for UNKNOWN. Each bullet must show enabled or disabled, PASS/FAIL/UNKNOWN, and a short concrete reason. Keep the text labels alongside the icons; a disabled override does not mean FAIL. Explain enabled overrides as workflow control and disabled overrides as preserving T3 behavior. Do not show raw counters, fix-set identifiers, test-coverage flags, or a separate proxy-facts inventory unless asked. For a failure or missing evidence, say what needs checking next.',
  ].join('\n');
  return {
    content: [{ type: 'text', text: facts + '\n\nDiagnostic checklist:\n' + instructions }],
    structuredContent: report,
    isError: false,
  };
}
