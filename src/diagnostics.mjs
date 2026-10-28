export const PROXY_CHECK_TOOL = {
  name: 'proxy-check',
  description: 'Check the local T3 Codex Proxy configuration, compatibility, and rewrite observations. Returns local facts and a configuration-specific checklist for checking the instructions you received and MCP connectivity. Read-only.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

export function proxyCheckResult(diagnostics) {
  const expected = {
    reviewWorkflow: diagnostics.overrides.reviewWorkflow
      ? 'Your workflow controls fresh-review context and reviewer continuity, including same-reviewer follow-ups.'
      : 'The proxy preserves T3 review instructions and review-tool descriptions unchanged.',
    prWaiting: diagnostics.overrides.prWaiting
      ? 'Your workflow controls PR polling, completion conditions, deadlines, retry limits, recovery, and evidence. T3 watching must not replace its bounded waits.'
      : 'The proxy preserves T3 PR-wait instructions and watch-tool descriptions unchanged.',
    browserRouting: diagnostics.overrides.browserRouting
      ? 'Your selected workflow and tools take priority. Otherwise, prefer an available authenticated API, CLI, or connector. A URL alone does not request browser automation; check existing authenticated tools before requesting browser login. Use browser automation when requested or needed, with T3 shared-browser controls.'
      : 'The proxy preserves T3 browser-selection and browser-tool guidance unchanged.',
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
    'There are exactly three override checks: review workflow, PR waiting, and browser routing. Give each PASS, FAIL, or UNKNOWN based on the guidance you actually received. Missing evidence is UNKNOWN. Do not infer received guidance from config or rewrite counts alone. Process-wide unmatched text does not fail this conversation by itself; a visible conflicting instruction does.',
    'Keep the user-facing result brief and in plain language. Start with "Proxy check passed." when the installation works and all three override checks pass, "Proxy check found a problem." for any failure, or "Proxy check incomplete." for missing evidence. Then give one installation sentence with the T3 version, compatibility qualification, and T3 connection status (connected, failed, or unknown). Do not give installation facts PASS labels or mix them into the override list.',
    'Follow the installation sentence with "Override checks (3):" and exactly three bullets, named "Review workflow", "PR waiting", and "Browser routing". Each bullet must show enabled or disabled, PASS/FAIL/UNKNOWN, and a short concrete reason. Explain enabled overrides as workflow control over reviews and PR waits, and suitable authenticated tools before unnecessary browser login; explain disabled overrides as preserving T3 behavior. Do not show raw counters, fix-set identifiers, test-coverage flags, or a separate proxy-facts inventory unless asked. For a failure or missing evidence, say what needs checking next.',
  ].join('\n');
  return {
    content: [{ type: 'text', text: facts + '\n\nDiagnostic checklist:\n' + instructions }],
    structuredContent: report,
    isError: false,
  };
}
