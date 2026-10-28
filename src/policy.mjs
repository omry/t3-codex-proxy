import { selectCompatibility } from './compatibility.mjs';
import { resolveOverrides } from './config.mjs';

// Version-selected, guarded substitutions. Never apply these to user prompts or tool results.
export const REVIEW_GUIDANCE = "Let the user's review workflow determine review context and reviewer continuity. For a fresh independent review, call `delegate_task` with the review brief and required source material; omit earlier findings, responses, and objections unless the workflow requests them. For a follow-up that needs the same reviewer conversation, use `t3_thread_send` on its `childThreadId` and supply the follow-up context requested by the workflow. Retain returned `taskId` values for tracking. Use a new `clientRequestId` for each new task or follow-up and keep it stable across retries.";

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
  ]],
};

export const PR_WAITING_GUIDANCE = "Let the user's workflow choose how PR checks and reviews are awaited. Preserve its polling helpers, completion conditions, deadlines, retry limits, recovery, and retained evidence. Do not replace a workflow-owned wait with watch_pull_request or end the turn while that workflow requires its helper to remain active. When no workflow specifies a wait, use watch_pull_request for PR monitoring and end the turn. T3 notifications are updates to inspect; they do not satisfy workflow gates or replace timeout recovery.";

export const BROWSER_ROUTING_GUIDANCE = "Follow the user's selected workflow and tools. Otherwise, prefer an available authenticated API, CLI, or connector that supports the task. A URL identifies a resource; it does not by itself request browser automation. A missing operation in one interface does not establish that the service lacks API support. Check the relevant available interface before declaring browser access necessary. Use browser automation when the user requests it or when the task requires browser interaction. Before asking the user to sign in, check whether existing authenticated tools can complete the task.";

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
      ]
    ]
  }
};

function rewriteGuidance(text, scope, rules, report, feature) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const [before, after] of rules[scope] ?? []) result = result.replaceAll(before, after);
  if (result !== text) report('guidance_rewritten');
  else if (feature !== 'reviewWorkflow' || /\breview/i.test(text)) {
    const replacements = (rules[scope] ?? []).map(([, after]) => after);
    const warning = { reviewWorkflow: 'unrecognized_review_guidance', prWaiting: 'unrecognized_pr_wait_guidance',
      browserRouting: 'unrecognized_browser_routing_guidance' }[feature];
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
    browserRouting: browserRoutingRules[compatibility.fixSet] ?? {} };
  const observations = {
    reviewWorkflow: { rewrites: 0, unrecognized: 0 },
    prWaiting: { rewrites: 0, unrecognized: 0 },
    browserRouting: { rewrites: 0, unrecognized: 0 },
  };
  const apply = (text, scope, feature) => rewriteGuidance(text, scope,
    featureRules[feature], code => {
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
    if (settings.prWaiting && key === 't3_code_runtime') return apply(value, 'runtime', 'prWaiting');
    return value;
  };
  const rewriteTool = (name, text) => {
    if (settings.reviewWorkflow && (name === 'delegate_task' || name === 't3_thread_send')) return apply(text, name, 'reviewWorkflow');
    if (settings.prWaiting && name === 'watch_pull_request') return apply(text, name, 'prWaiting');
    return text;
  };
  if (!compatibility.fixSet) report('unsupported_t3_version');
  else report(`t3_fixset_${compatibility.fixSet}`);
  return {
    ...compatibility,
    rewriteDeveloperContext: message => rewriteDeveloperContext(message, rewriteContext),
    rewriteToolsList: message => rewriteToolsList(message, rewriteTool),
    diagnostics: () => ({
      t3Version: compatibility.fixSet ? version : null,
      ...compatibility,
      overrides: { ...settings },
      observations: structuredClone(observations),
      observationScope: 'wrapper process, possibly including other threads; not proof of the current model context',
    }),
  };
}
