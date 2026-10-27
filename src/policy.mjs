import { selectCompatibility } from './compatibility.mjs';

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

function rewriteGuidance(text, scope, rules, report) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const [before, after] of rules[scope] ?? []) result = result.replaceAll(before, after);
  if (result !== text) report('guidance_rewritten');
  else if (/review/i.test(text) && !text.includes(REVIEW_GUIDANCE)) report('unrecognized_review_guidance');
  return result;
}

function rewriteDeveloperContext(message, rules, report) {
  if (!message || typeof message !== 'object' || !message.params) return message;
  const params = message.params;
  if (message.method === 'turn/start' && params.additionalContext && !Array.isArray(params.additionalContext)) {
    for (const [key, entry] of Object.entries(params.additionalContext)) {
      if (/^t3_code_orchestration_\d+$/.test(key) && entry?.kind === 'application') {
        entry.value = rewriteGuidance(entry.value, 'context', rules, report);
      }
    }
  }
  if (message.method === 'thread/inject_items' && Array.isArray(params.items)) {
    for (const item of params.items) {
      if (item?.type !== 'message' || item.role !== 'developer' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type !== 'input_text' || typeof part.text !== 'string') continue;
        part.text = part.text.replace(/(<(t3_code_orchestration_\d+)>)([\s\S]*?)(<\/\2>)/g,
          (_whole, open, _key, body, close) => open + rewriteGuidance(body, 'context', rules, report) + close);
      }
    }
  }
  return message;
}

function rewriteToolsList(message, rules, report) {
  if (!Array.isArray(message?.result?.tools)) return message;
  for (const tool of message.result.tools) {
    if (tool && (tool.name === 'delegate_task' || tool.name === 't3_thread_send')) {
      tool.description = rewriteGuidance(tool.description, tool.name, rules, report);
    }
  }
  return message;
}

export function createPolicy(version, report = () => {}) {
  const compatibility = selectCompatibility(version);
  const rules = compatibility.fixSet === 'legacy' ? legacyRules : compatibility.fixSet === 'current' ? currentRules : {};
  if (!compatibility.fixSet) report('unsupported_t3_version');
  else {
    report(`t3_fixset_${compatibility.fixSet}`);
    if (!compatibility.tested) report('untested_t3_version');
  }
  return {
    ...compatibility,
    rewriteDeveloperContext: message => rewriteDeveloperContext(message, rules, report),
    rewriteToolsList: message => rewriteToolsList(message, rules, report),
  };
}
