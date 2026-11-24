import { selectCompatibility } from './compatibility.mjs';
import { resolveOverrides } from './config.mjs';

// Version-selected, guarded substitutions. User prompts are never rewritten.
export const WAITING_TOOL_NAMES = ['delegate_task', 'task_status', 't3_thread_wait'];
export const RUNNING_TASK_NEXT_HINTS = [
  'Completion wakes this thread, so end your turn. Do not wait on it or poll it.',
  'Completion wakes this thread. End your turn unless you need this result now.',
  'Completion wakes this thread. Do not wait on it or poll it. Continue other work, and end your turn when none is left.',
];
export const THREAD_WAIT_END_TURN = 'On timeout, with `next` end your turn; without, call again.';
export const WORKFLOW_WAITING_NEXT = 'Completion will notify this thread. Follow the workflow\'s bounded wait, deadline and recovery rules. When no workflow owns the wait, end this turn and await the notification.';
export const REVIEW_GUIDANCE = "Let the user's review workflow choose available review tools, reviewer context, reviewer continuity, and who fixes findings. Use the workflow's selected native-agent or T3 tools. For a fresh independent review, supply the review brief and required source material; omit earlier findings, responses, and objections unless the workflow requests them. For a follow-up that needs the same reviewer conversation, continue that reviewer with the context requested by the workflow. When using T3 delegates, start fresh reviews with `delegate_task`, continue a reviewer with `t3_thread_send` on its `childThreadId`, and retain returned `taskId` values. Use a new `clientRequestId` for each T3 task or follow-up and keep it stable across retries.";

export const REVIEW_FIXER_GUIDANCE = "Follow the workflow's assignment of review fixes, including small findings. When no workflow assigns a fixer, fix small review findings yourself.";

export const DELEGATE_WAITING_GUIDANCE = "Let the user's workflow control delegate waits, deadlines, retries, recovery, and retained evidence. Use available bounded wait operations or workflow-paced task_status checks for the same taskId. A next hint never overrides workflow-owned waiting. Preserve task identity, status and timeout facts. A wait timeout does not cancel the child or prove completion: retain its identity, inspect its state, and follow the workflow's recovery or cancellation rules without launching a duplicate. When no workflow owns the wait, follow the delegate's next and use T3 completion notifications instead of polling.";

const delegateWaitingContextRules = ["Do not", "Don't"].map(prohibition => [
  `Follow a running delegate's \`next\`. ${prohibition} poll it (\`task_status\`, \`sleep\`, watchers, Monitor, ScheduleWakeup).`,
  DELEGATE_WAITING_GUIDANCE,
]);

const legacyRules = {
  context: [[
    '- For independent T3 delegated review rounds, call `delegate_task` again. Include the original brief, prior findings, responses, and unresolved objections in each new task prompt. Track each round by its own `taskId`. Use a distinct `clientRequestId` per round, stable across retries of that round. For a follow-up that needs the same child\'s conversation, use `t3_thread_send` on its `childThreadId`.',
    `- ${REVIEW_GUIDANCE}`,
  ]],
  delegate_task: [[
    "For independent T3 delegated review rounds, call delegate_task again with the original brief, prior findings, responses, and unresolved objections in the task prompt. Track each round by its own taskId and use a distinct clientRequestId per round, stable across retries of that round. For a follow-up that needs the same child's conversation, use t3_thread_send on its childThreadId.",
    REVIEW_GUIDANCE,
  ]],
  t3_thread_send: [[
    "Use delegate_task with the full review context and a new clientRequestId for independent review rounds. For a follow-up that needs the same child's conversation, send to its childThreadId.",
    REVIEW_GUIDANCE,
  ]],
};

const currentRules = {
  context: [[
    'Every new delegate review or re-check is a new `delegate_task` (brief, findings, objections), never a `t3_thread_send`.',
    REVIEW_GUIDANCE,
  ], [
    'Fix small review findings yourself; start no delegate for them.',
    REVIEW_FIXER_GUIDANCE,
  ], ...delegateWaitingContextRules],
  task_status: [[
    'Do not call it on a running task before its completion wakes you.',
    DELEGATE_WAITING_GUIDANCE,
  ]],
  t3_thread_wait: [[THREAD_WAIT_END_TURN,
    'On timeout, preserve task identity and follow the workflow\'s wait, deadline and recovery rules. When no workflow owns the wait, use `next` to decide whether to wait again or end this turn.']],
};

export const PR_WAITING_GUIDANCE = "Let the user's workflow choose how PR checks and reviews are awaited. Before choosing T3 watching, check the user's selected workflow and applicable skills for an integrated PR review/check mechanism. A standalone prerequisite PR does not automatically leave that workflow. Use its request, polling, evidence, retry, recovery, and completion gates when applicable. Preserve its polling helpers, completion conditions, deadlines, retry limits, recovery, and retained evidence. Do not replace a workflow-owned wait with watch_pull_request or end the turn while that workflow requires its helper to remain active. Use watch_pull_request as a fallback only after establishing that no workflow wait mechanism applies, then end the turn. T3 notifications are updates to inspect; they do not satisfy workflow gates or replace timeout recovery. Watching for a later owner merge must not bypass CI/review qualification.";

export const BROWSER_ROUTING_GUIDANCE = "Follow the user's selected workflow and tools. Otherwise, prefer an available authenticated API, CLI, or connector that supports the task. A URL identifies a resource; it does not by itself request browser automation. A missing operation in one interface does not establish that the service lacks API support. Check the relevant available interface before declaring browser access necessary. Use browser automation when the user requests it or when the task requires browser interaction. Before asking the user to sign in, check whether existing authenticated tools can complete the task.";

export const ENVIRONMENT_ROUTING_GUIDANCE = "Use T3 environment tools only when the user explicitly asks you to use a T3-linked environment or delegate work to another machine through T3. A host, VM, load balancer, service endpoint, or repository named as a debugging target does not by itself request environment linking. Otherwise follow the user's selected workflow and available tools.";

const ENVIRONMENT_TARGETING_GUIDANCE = "When T3 environment work is explicitly requested, use `t3_environment_links` for linked environments and pass its `environmentId` to the T3 tool. Those ids are the linked machine's, so pass `threadId` when targeting a thread there.";

const environmentRoutingRule = { context: [[
  '- Another machine: `t3_environment_links` lists linked ones. Pass its `environmentId` to a T3 tool to act there. Ids are then that machine\'s, so pass `threadId`.',
  `- ${ENVIRONMENT_ROUTING_GUIDANCE}\n- ${ENVIRONMENT_TARGETING_GUIDANCE}`,
], [
  '- A machine the user names that is not linked ("delegate this to my vps"): call `t3_environment_link` with a `hint` from their words. Never ask for a pairing code in chat.',
  '- When T3 environment work is explicitly requested, use `t3_environment_links` for linked environments and `t3_environment_link` for an unlinked machine with a hint from the user\'s words. Never ask for a pairing code in chat.',
]] };

// Nightly 4774 shortens both machine-routing bullets. Keep each observed
// pair together so a changed or missing counterpart cannot be partly rewritten.
const environmentRouting4774 = { context: [[
  '- Another machine: `t3_environment_links` lists linked ones. Pass its `environmentId` and that machine\'s `threadId` to T3 tools.',
  `- ${ENVIRONMENT_ROUTING_GUIDANCE}\n- ${ENVIRONMENT_TARGETING_GUIDANCE}`,
], [
  '- Unlinked ("delegate this to my vps"): `t3_environment_link` with a `hint` from the user\'s words, never a pairing code in chat. No link tools: say to enable Settings → Labs → Linked environments.',
  '- When T3 environment work is explicitly requested, use `t3_environment_links` for linked environments and `t3_environment_link` for an unlinked machine with a hint from the user\'s words. Never ask for a pairing code in chat. No link tools: say to enable Settings → Labs → Linked environments.',
]] };

const environmentRoutingRules = {
  legacy: [environmentRoutingRule],
  current: [environmentRoutingRule, environmentRouting4774],
};

const browserRoutingRules = {
  legacy: {
    tools: [[
      'You are running inside T3 Code. The `t3-code` MCP server is the product-native collaborative browser shared with the user. When it exposes `preview_*` tools, prefer those tools for browser navigation, inspection, interaction, screenshots, and recordings.',
      BROWSER_ROUTING_GUIDANCE + '\n\nFor browser automation, use the `t3-code` MCP server as the product-native collaborative browser shared with the user. When it exposes `preview_*` tools, prefer those tools for browser navigation, inspection, interaction, screenshots, and recordings.',
    ]],
  },
  current: {
    context: [[
      'Use them only when the current request asks for browser work or names a page or tab. Public pages: web fetch or search unless browser work was asked; then preview tools only, no web fetch.',
      BROWSER_ROUTING_GUIDANCE + " For browser automation, follow T3's shared-browser instructions. For public pages without a browser request, use web fetch or search when they suffice.",
    ], [
      'Use them when the current request asks for browser work, including recording edits, or names a page or tab.',
      BROWSER_ROUTING_GUIDANCE + " For browser automation, follow T3's shared-browser instructions.",
    ]],
    tools: [[
      'When browser work was asked, `preview_*` is the browser you share with the user: `preview_status` first, then `preview_open` if no tab can be automated. Prefer snapshot locators over coordinates. Switch browsers only if the tools are absent or `preview_open` says unsupported, the user asks, or two preview calls fail on one step. Then quote the error and switch.',
      'For browser automation, `preview_*` is the browser you share with the user: `preview_status` first, then `preview_open` if no tab can be automated. Prefer snapshot locators over coordinates. Switch browsers only if the tools are absent or `preview_open` says unsupported, the user or their selected workflow asks, or two preview calls fail on one step. Then quote the error and switch.',
    ]],
  },
};

const prWaitingRules = {
  "legacy": {
    "runtime": [
      [
        "<pull_request_linking>\nWhen the t3-code MCP server exposes link_pull_request, you must use it to register every pull request you create or work on for this thread. Call link_pull_request with the full PR URL immediately after creating a PR or starting work on an existing PR. For a stack, call it for every layer, not just the current branch or the top PR. This applies when creating or updating PRs through your host's CLI (including its stack commands) or its API: those operations do not register the PRs with this thread. Linking an already-linked PR is safe. Before finishing PR work, call list_thread_pull_requests and link any PR from your work that is missing. Do not link unrelated PRs mentioned only as background. If a linking call fails, report that failure instead of claiming the PR is linked. As a delegated child task, do not watch or poll PRs; return PR URLs, head SHA, and pending review/check state to your parent. Otherwise, when asked to monitor, watch, or babysit a PR and watch_pull_request is available, call it and end your turn: T3 Code wakes you when checks finish, someone else comments, or the branch conflicts, so do not poll or run your own watcher. When monitoring is done and you hand the work back to the user, call unwatch_pull_request first so the thread returns to their inbox.\n</pull_request_linking>",
        "<pull_request_linking>\nWhen the t3-code MCP server exposes link_pull_request, you must use it to register every pull request you create or work on for this thread. Call link_pull_request with the full PR URL immediately after creating a PR or starting work on an existing PR. For a stack, call it for every layer, not just the current branch or the top PR. This applies when creating or updating PRs through your host's CLI (including its stack commands) or its API: those operations do not register the PRs with this thread. Linking an already-linked PR is safe. Before finishing PR work, call list_thread_pull_requests and link any PR from your work that is missing. Do not link unrelated PRs mentioned only as background. If a linking call fails, report that failure instead of claiming the PR is linked. As a delegated child task, do not use T3 PR watches; follow your assigned workflow for polling and return PR URLs, head SHA, and pending review/check state to your parent. " + PR_WAITING_GUIDANCE + " When monitoring is done and you hand the work back to the user, call unwatch_pull_request first so the thread returns to their inbox.\n</pull_request_linking>"
      ]
    ],
    "watch_pull_request": [
      [
        "Have T3 Code watch an open pull request for this thread, linking it first if needed. T3 Code checks it every two minutes and wakes you with a message when a check fails, the required checks pass, someone else comments or reviews, or the branch starts to conflict with its base. Use this to monitor or babysit a pull request instead of polling, sleeping, or running a watcher. Only comments posted after this call wake you, so handle the existing ones first, then end your turn. A wake is news, not a merge decision: check readiness yourself before merging. While T3 Code watches, the thread stays in the user's Working list, not their inbox. When you hand the work back to the user, call unwatch_pull_request first so the thread returns to their inbox. Watching ends when the pull request merges or closes, when its thread settles or is archived, when T3 Code fails to read it 8 times in a row (a host rate limit only delays it), when the user stops this thread, or when you call unwatch_pull_request. Unsettle the thread before starting a new watch. A subagent cannot watch: its parent thread owns the pull request.",
        "Have T3 Code watch an open pull request for this thread, linking it first if needed. T3 Code checks it every two minutes and wakes you with a message when a check fails, the required checks pass, someone else comments or reviews, or the branch starts to conflict with its base. Use this when the user's workflow chooses T3 watching; it does not replace workflow-owned polling or timeout recovery. Only comments posted after this call wake you, so handle the existing ones first. End your turn when T3 owns the wait; preserve any workflow-owned wait, deadlines, and recovery. A wake is news, not a merge decision: check readiness yourself before merging. While T3 Code watches, the thread stays in the user's Working list, not their inbox. When you hand the work back to the user, call unwatch_pull_request first so the thread returns to their inbox. Watching ends when the pull request merges or closes, when its thread settles or is archived, when T3 Code fails to read it 8 times in a row (a host rate limit only delays it), when the user stops this thread, or when you call unwatch_pull_request. Unsettle the thread before starting a new watch. A subagent cannot watch: its parent thread owns the pull request."
      ]
    ]
  },
  "current": {
    "runtime": [
      [
        "<pull_request_linking>\nLink each PR you create, take over, or push to: one link_pull_request per PR, full URL, every stack layer, as your next call. Host tools do not link for you. If linking fails, say so. Skip PRs you only read or review, and PRs named only as background. Call watch_pull_request when asked to monitor or babysit, or when work you were asked to do, such as a merge, still waits on checks or reviews, even after an earlier unwatch. Finish any needed branch update and push first, then watch and end your turn. Otherwise act now or hand back. Delegated children never watch, even if the brief says babysit. After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>. Links and watches persist across pushes. Never wait with sleep, loops, gh --watch, Monitor, or ScheduleWakeup. Before handback, call unwatch_pull_request on any PR you watch.\n</pull_request_linking>",
        "<pull_request_linking>\nLink each PR you create, take over, or push to: one link_pull_request per PR, full URL, every stack layer, as your next call. Host tools do not link for you. If linking fails, say so. Skip PRs you only read or review, and PRs named only as background. " + PR_WAITING_GUIDANCE + " Before starting T3 watching: Finish any needed branch update and push first, then watch and end your turn. Delegated children never watch, even if the brief says babysit. After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>. Links and watches persist across pushes. Before handback, call unwatch_pull_request on any PR you watch.\n</pull_request_linking>"
      ]
    ],
    "watch_pull_request": [
      [
        "Watch an open PR for this thread, linking it first if needed. T3 wakes you on failed checks, passed required checks, new comments or reviews, or conflicts. Handle old comments first. Only later ones wake you. After this call, end your turn. The watch stays on after each wake, so do not call this again on a wake. A wake is not a merge decision. Check readiness yourself.",
        "Watch an open PR for this thread, linking it first if needed. T3 wakes you on failed checks, passed required checks, new comments or reviews, or conflicts. Handle old comments first. Only later ones wake you. End your turn when T3 owns the wait; preserve any workflow-owned wait, deadlines, and recovery. The watch stays on after each wake, so do not call this again on a wake. A wake is not a merge decision. Check readiness yourself."
      ],
      [
        // Description observed in nightly 5191. Preserve its merge/close notifications.
        "Watch an open PR for this thread, linking it if needed. T3 wakes you on failed checks, passed required checks, new comments or reviews, conflicts, and once on merge or close unless you did it via CLI. Handle old comments first; only new ones wake you. After this call, end your turn. The watch stays on: do not call this again on a wake. A wake is not a merge decision. Check readiness yourself.",
        "Watch an open PR for this thread, linking it if needed. T3 wakes you on failed checks, passed required checks, new comments or reviews, conflicts, and once on merge or close unless you did it via CLI. Handle old comments first; only new ones wake you. End your turn when T3 owns the wait; preserve any workflow-owned wait, deadlines, and recovery. The watch stays on: do not call this again on a wake. A wake is not a merge decision. Check readiness yourself."
      ]
    ]
  }
};

// The 3991 nightly narrows the wait prohibition to PRs. Keep the complete
// runtime-block guard and the same replacement for both observed wordings.
const [currentPrRuntime, rewrittenPrRuntime] = prWaitingRules.current.runtime[0];
prWaitingRules.current.runtime.push([
  currentPrRuntime.replace('Never wait with sleep, loops, gh --watch, Monitor, or ScheduleWakeup.',
    'For PR waits, no sleep, loops, gh --watch, Monitor or ScheduleWakeup.'),
  rewrittenPrRuntime,
]);

// Nightly 4119 offers batch PR linking. Preserve that choice in the rewritten
// block while retaining the full-block guard for unrecognized instructions.
prWaitingRules.current.runtime.push(prWaitingRules.current.runtime[1].map(text => text.replace(
  'one link_pull_request per PR, full URL, every stack layer, as your next call.',
  'link_pull_request, or link_pull_requests for several, full URL, every stack layer, as your next call.')));

// Nightly 4580 edits two linking sentences. Keep those edits in the replacement
// and require the complete observed block, as with the earlier variants.
prWaitingRules.current.runtime.push(prWaitingRules.current.runtime[2].map(text => text
  .replace('Host tools do not link for you.', "Host tools don't link for you.")
  .replace('Skip PRs you only read or review, and PRs named only as background.',
    'Skip PRs you only read or review and PRs named only as background.')));

// Nightly 4928 appends PR-tool routing and issue linking. Preserve those rules
// on both sides of the existing full-block substitution.
prWaitingRules.current.runtime.push(prWaitingRules.current.runtime[3].map(text => text.replace(
  '\n</pull_request_linking>',
  ' When pull_request_* tools are listed, use them, not gh or cafe, to read, list, open, edit, review, reply on, close, or merge PRs, and ci_logs and ci_rerun for their checks. pull_request_create links for you.\nIf available, call link_issue for each issue you take on or file, even via CLI; skip issues you only read.\n</pull_request_linking>')));

function rewriteGuidance(text, scope, rules, report, feature) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const [before, after] of rules[scope] ?? []) result = result.replaceAll(before, after);
  if (result !== text) report('guidance_rewritten');
  else if (feature !== 'reviewWorkflow' || /\breview|running delegate/i.test(text) ||
      ((scope === 'task_status' || scope === 't3_thread_wait') && rules[scope])) {
    const replacements = (rules[scope] ?? []).map(([, after]) => after);
    const warning = { reviewWorkflow: 'unrecognized_review_guidance', prWaiting: 'unrecognized_pr_wait_guidance',
      browserRouting: 'unrecognized_browser_routing_guidance', environmentRouting: 'unrecognized_environment_routing_guidance' }[feature];
    if (!replacements.some(after => text.includes(after))) report(warning);
  }
  return result;
}

function rewriteDeveloperContext(message, rewriteContext) {
  if (!message || typeof message !== 'object' || !message.params) return message;
  const params = message.params;
  if (message.method === 'turn/start' && params.additionalContext && !Array.isArray(params.additionalContext)) {
    for (const [key, entry] of Object.entries(params.additionalContext)) {
      if (entry?.kind === 'application') {
        entry.value = rewriteContext(key, entry.value);
      }
    }
  }
  if (message.method === 'thread/inject_items' && Array.isArray(params.items)) {
    for (const item of params.items) {
      if (item?.type !== 'message' || item.role !== 'developer' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type !== 'input_text' || typeof part.text !== 'string') continue;
        part.text = part.text.replace(/(<(t3_code_orchestration_\d+|t3_code_runtime|t3_code_tools)>)([\s\S]*?)(<\/\2>)/g,
          (_whole, open, key, body, close) => open + rewriteContext(key, body) + close);
      }
    }
  }
  return message;
}

function rewriteToolsList(message, rewriteTool) {
  if (!Array.isArray(message?.result?.tools)) return message;
  for (const tool of message.result.tools) {
    if (tool && typeof tool.description === 'string') tool.description = rewriteTool(tool.name, tool.description);
  }
  return message;
}

export function createPolicy(version, report = () => {}, overrides) {
  const settings = resolveOverrides(overrides);
  const compatibility = selectCompatibility(version);
  const rules = compatibility.fixSet === 'legacy' ? legacyRules : compatibility.fixSet === 'current' ? currentRules : {};
  const featureRules = { reviewWorkflow: rules, prWaiting: prWaitingRules[compatibility.fixSet] ?? {},
    browserRouting: browserRoutingRules[compatibility.fixSet] ?? {},
    environmentRouting: environmentRoutingRules[compatibility.fixSet] ?? [] };
  const observations = {
    reviewWorkflow: { rewrites: 0, unrecognized: 0 },
    prWaiting: { rewrites: 0, unrecognized: 0 },
    browserRouting: { rewrites: 0, unrecognized: 0 },
    environmentRouting: { rewrites: 0, unrecognized: 0 },
    waitingResults: { rewrites: 0, unrecognized: 0 },
  };
  const apply = (text, scope, feature, rules = featureRules[feature]) => rewriteGuidance(text, scope,
    rules, code => {
      observations[feature][code === 'guidance_rewritten' ? 'rewrites' : 'unrecognized']++;
      report(code);
    }, feature);
  const rewriteContext = (key, value) => {
    if (/^t3_code_orchestration_\d+$/.test(key)) {
      if (settings.reviewWorkflow) value = apply(value, 'context', 'reviewWorkflow');
      if (settings.browserRouting && typeof value === 'string' && /\bpreview_|### Visuals and preview/.test(value)) {
        value = apply(value, 'context', 'browserRouting');
      }
    }
    if (settings.browserRouting && key === 't3_code_tools' && typeof value === 'string' && /\bbrowser\b/i.test(value)) {
      value = apply(value, 'tools', 'browserRouting');
    }
    if (/^t3_code_orchestration_\d+$/.test(key) && compatibility.fixSet && settings.environmentRouting && typeof value === 'string' &&
        /t3_environment_links|t3_environment_link|Another machine|machine the user names|environment linking/i.test(value)) {
      const variants = featureRules.environmentRouting;
      const lines = value.split(/\r?\n/);
      const matched = variants.find(rules => rules.context.every(([before]) => lines.includes(before)));
      if (matched) value = apply(value, 'context', 'environmentRouting', matched);
      else if (!variants.some(rules => rules.context.every(([, after]) => value.includes(after)))) {
        observations.environmentRouting.unrecognized++;
        report('unrecognized_environment_routing_guidance');
      }
    }
    if (settings.prWaiting && key === 't3_code_runtime') return apply(value, 'runtime', 'prWaiting');
    return value;
  };
  const rewriteTool = (name, text) => {
    if (settings.reviewWorkflow && ['delegate_task', 't3_thread_send', 'task_status', 't3_thread_wait'].includes(name)) return apply(text, name, 'reviewWorkflow');
    if (settings.prWaiting && name === 'watch_pull_request') return apply(text, name, 'prWaiting');
    return text;
  };
  const shouldRewriteToolResult = name => Boolean(settings.reviewWorkflow && compatibility.fixSet === 'current' && WAITING_TOOL_NAMES.includes(name));
  const rewriteWaitingData = (data, name) => {
    if (!data || typeof data !== 'object' || typeof data.status !== 'string') return false;
    const identified = name === 't3_thread_wait'
      ? typeof data.threadId === 'string' && typeof data.timedOut === 'boolean'
      : typeof data.taskId === 'string' && (typeof data.childThreadId === 'string' || data.childThreadId === null) && typeof data.waitTimedOut === 'boolean';
    if (!identified || typeof data.next !== 'string') return false;
    if (!RUNNING_TASK_NEXT_HINTS.includes(data.next)) {
      if (data.next !== WORKFLOW_WAITING_NEXT) {
        observations.waitingResults.unrecognized++;
        report('unrecognized_waiting_hint');
      }
      return false;
    }
    data.next = WORKFLOW_WAITING_NEXT;
    observations.waitingResults.rewrites++;
    report('waiting_hint_rewritten');
    return true;
  };
  if (!compatibility.fixSet) report('unsupported_t3_version');
  else report(`t3_fixset_${compatibility.fixSet}`);
  return {
    ...compatibility,
    rewriteDeveloperContext: message => rewriteDeveloperContext(message, rewriteContext),
    rewriteToolsList: message => {
      rewriteToolsList(message, rewriteTool);
      for (const tool of Array.isArray(message?.result?.tools) ? message.result.tools : []) {
        if (!shouldRewriteToolResult(tool?.name)) continue;
        const next = tool.outputSchema?.properties?.next;
        if (next && RUNNING_TASK_NEXT_HINTS.includes(next.const)) next.const = WORKFLOW_WAITING_NEXT;
        if (Array.isArray(next?.enum)) next.enum = next.enum.map(value => RUNNING_TASK_NEXT_HINTS.includes(value) ? WORKFLOW_WAITING_NEXT : value);
      }
      return message;
    },
    shouldRewriteToolResult,
    rewriteToolResult: (message, name) => {
      if (!shouldRewriteToolResult(name) || !message?.result || message.result.isError) return message;
      rewriteWaitingData(message.result.structuredContent, name);
      if (Array.isArray(message.result.content)) for (const part of message.result.content) {
        if (part?.type !== 'text' || typeof part.text !== 'string') continue;
        let data;
        try { data = JSON.parse(part.text); } catch { continue; }
        if (rewriteWaitingData(data, name)) part.text = JSON.stringify(data);
      }
      return message;
    },
    diagnostics: () => ({
      t3Version: compatibility.fixSet ? version : null,
      ...compatibility,
      overrides: { ...settings },
      observations: structuredClone(observations),
      observationScope: 'wrapper process, possibly including other threads; not proof of the current model context',
    }),
  };
}
