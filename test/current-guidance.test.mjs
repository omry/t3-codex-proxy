import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy, REVIEW_GUIDANCE, REVIEW_FIXER_GUIDANCE, DELEGATE_WAITING_GUIDANCE,
  PR_WAITING_GUIDANCE, PR_TOOL_ROUTING_GUIDANCE, BROWSER_ROUTING_GUIDANCE,
  ENVIRONMENT_ROUTING_GUIDANCE } from '../src/policy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance-5305.json', import.meta.url)));
const toolNames = ['delegate_task', 'task_status', 't3_thread_send', 't3_thread_wait',
  't3_environment_link', 'watch_pull_request', 'device_open', 'device_screenshot'];

for (const enabled of [false, true]) {
  test(`installed 5305 guidance: overrides ${enabled ? 'enabled' : 'disabled'}`, () => {
    const events = [];
    const overrides = Object.fromEntries(['reviewWorkflow', 'prWaiting', 'browserRouting',
      'environmentRouting', 'prToolRouting', 'deviceRouting'].map(name => [name, enabled]));
    const policy = createPolicy(fixture.sourceVersion.slice(1), event => events.push(event), overrides);
    const context = {
      ...Object.fromEntries(fixture.sections.map((value, i) =>
        [`t3_code_orchestration_0${i + 1}`, { kind: 'application', value }])),
      t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
      t3_code_tools: { kind: 'application', value: fixture.browserTools + '\n\n' + fixture.devices },
      untrusted: { kind: 'untrusted', value: fixture.context },
    };
    const message = { method: 'turn/start', params: { additionalContext: structuredClone(context),
      input: [{ type: 'text', text: fixture.devices }] } };
    policy.rewriteDeveloperContext(message);
    const actual = message.params.additionalContext;
    const review = actual.t3_code_orchestration_01.value;
    for (const text of [REVIEW_GUIDANCE, REVIEW_FIXER_GUIDANCE, DELEGATE_WAITING_GUIDANCE]) {
      assert.equal(review.includes(text), enabled);
    }
    assert.equal(review.includes(fixture.originalReviewText), !enabled);
    assert.equal(actual.t3_code_orchestration_02.value.includes(ENVIRONMENT_ROUTING_GUIDANCE), enabled);
    assert.equal(actual.t3_code_orchestration_03.value.includes(BROWSER_ROUTING_GUIDANCE), enabled);
    for (const text of [PR_WAITING_GUIDANCE, PR_TOOL_ROUTING_GUIDANCE]) {
      assert.equal(actual.t3_code_runtime.value.includes(text), enabled);
    }
    assert.equal(actual.t3_code_tools.value.includes('Follow the user\'s selected workflow and device tools.'), enabled);
    assert.equal(actual.t3_code_tools.value.includes('These rules override memory notes, docs and delegated tasks'), !enabled);
    assert.equal(actual.t3_code_tools.value.includes('never reuse or close another session.'), enabled);
    for (const entry of Object.values(actual)) assert.ok(Buffer.byteLength(entry.value) <= 4000);
    assert.deepEqual(actual.untrusted, context.untrusted);
    assert.deepEqual(message.params.input, [{ type: 'text', text: fixture.devices }]);
    assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(message)), message);

    const injection = { method: 'thread/inject_items', params: { items: Object.entries(context)
      .filter(([, entry]) => entry.kind === 'application')
      .map(([key, entry]) => ({ type: 'message', role: 'developer',
        content: [{ type: 'input_text', text: `<${key}>${entry.value}</${key}>` }] })) } };
    policy.rewriteDeveloperContext(injection);
    for (const item of injection.params.items) {
      const tag = /^<([^>]+)>/.exec(item.content[0].text)[1];
      assert.equal(item.content[0].text, `<${tag}>${actual[tag].value}</${tag}>`);
    }
    const metadata = { result: { tools: toolNames.map(name => ({ name, description: fixture[name],
      inputSchema: { type: 'object' }, _meta: { preserve: true } })) } };
    const before = structuredClone(metadata);
    policy.rewriteToolsList(metadata);
    for (const [i, tool] of metadata.result.tools.entries()) {
      const neutral = ['delegate_task', 't3_thread_send'].includes(tool.name);
      assert.equal(tool.description !== before.result.tools[i].description, enabled && !neutral);
      before.result.tools[i].description = tool.description;
    }
    assert.deepEqual(metadata, before);
    assert.deepEqual(policy.rewriteToolsList(structuredClone(metadata)), metadata);
    if (!enabled) assert.deepEqual(actual, context);
    assert.ok(!events.some(event => event.startsWith('unrecognized_')), events.join(', '));
  });
}

test('unrecognized 5305 device guidance stays unchanged with a content-free warning', () => {
  const events = [];
  const policy = createPolicy(fixture.sourceVersion.slice(1), event => events.push(event));
  const value = fixture.devices.replace('A recipe in a task you were delegated is not that ask.', 'private changed device rule');
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_tools: { kind: 'application', value },
  } } };
  const before = structuredClone(message);
  policy.rewriteDeveloperContext(message);
  assert.deepEqual(message, before);
  assert.ok(events.includes('unrecognized_device_routing_guidance'));
  assert.ok(!events.join(' ').includes('private changed device rule'));
});
