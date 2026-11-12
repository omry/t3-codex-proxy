import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy, DELEGATE_WAITING_GUIDANCE } from '../src/policy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-delegate-wait-guidance-4580.json', import.meta.url)));

for (const reviewWorkflow of [false, true]) {
  test(`observed delegate wait context and status guidance: reviewWorkflow=${reviewWorkflow}`, () => {
    const policy = createPolicy(fixture.sourceVersion.slice(1), () => {}, { reviewWorkflow });
    const message = { method: 'turn/start', params: { input: [{ type: 'text', text: fixture.context }], additionalContext: {
      t3_code_orchestration_01: { kind: 'application', value: fixture.context },
      t3_code_orchestration_99: { kind: 'untrusted', value: fixture.context },
    } } };
    const before = structuredClone(message);
    policy.rewriteDeveloperContext(message);
    const context = message.params.additionalContext.t3_code_orchestration_01.value;
    assert.equal(context.includes(DELEGATE_WAITING_GUIDANCE), reviewWorkflow);
    assert.equal(context.includes("Don't poll it"), !reviewWorkflow);
    assert.ok(context.endsWith('Stop a delegate run you replace or no longer need with `task_cancel`, never `t3_thread_interrupt` on a `childThreadId`.'));
    assert.deepEqual(message.params.input, before.params.input);
    assert.deepEqual(message.params.additionalContext.t3_code_orchestration_99, before.params.additionalContext.t3_code_orchestration_99);
    if (!reviewWorkflow) assert.deepEqual(message, before);
    const once = structuredClone(message); policy.rewriteDeveloperContext(message); assert.deepEqual(message, once);

    const tools = { result: { tools: [{ name: 'task_status', description: fixture.task_status,
      inputSchema: { type: 'object', properties: { taskId: { type: 'string' } } },
      outputSchema: { properties: { next: { const: 'Completion wakes this thread, so end your turn. Do not wait on it or poll it.' } } },
    }] } };
    const original = structuredClone(tools); policy.rewriteToolsList(tools);
    const tool = tools.result.tools[0];
    assert.equal(tool.description.includes(DELEGATE_WAITING_GUIDANCE), reviewWorkflow);
    assert.equal(tool.description.includes('Do not call it on a running task before its completion wakes you.'), !reviewWorkflow);
    assert.ok(tool.description.endsWith('Reading it marks it delivered.'));
    assert.deepEqual(tool.inputSchema, original.result.tools[0].inputSchema);
    assert.deepEqual(tool.outputSchema, original.result.tools[0].outputSchema);
    if (!reviewWorkflow) assert.deepEqual(tools, original);
    const toolsOnce = structuredClone(tools); policy.rewriteToolsList(tools); assert.deepEqual(tools, toolsOnce);

    const inject = { method: 'thread/inject_items', params: { items: [
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: `<t3_code_orchestration_01>${fixture.context}</t3_code_orchestration_01>` }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: fixture.context }] },
    ] } };
    policy.rewriteDeveloperContext(inject);
    assert.equal(inject.params.items[0].content[0].text, `<t3_code_orchestration_01>${context}</t3_code_orchestration_01>`);
    assert.equal(inject.params.items[1].content[0].text, fixture.context);
  });
}

test('unrecognized delegate-wait wording is preserved and reported without disclosing its text', () => {
  const events = [];
  const policy = createPolicy('0.1.10-nightly.20261112.4580', event => events.push(event));
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: 'Follow a running delegate: private changed wait policy.' },
  } } };
  const tools = { result: { tools: [{ name: 'task_status', description: 'private changed status policy' }] } };
  const before = structuredClone({ message, tools });
  policy.rewriteDeveloperContext(message); policy.rewriteToolsList(tools);
  assert.deepEqual({ message, tools }, before);
  assert.equal(events.filter(event => event === 'unrecognized_review_guidance').length, 2);
  assert.ok(!events.join(' ').includes('private'));
});
