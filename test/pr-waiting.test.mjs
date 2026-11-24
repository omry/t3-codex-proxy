import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy, PR_WAITING_GUIDANCE } from '../src/policy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-pr-guidance-4928.json', import.meta.url)));
const watchFixture = JSON.parse(readFileSync(new URL('./fixtures/t3-pr-watch-guidance-5191.json', import.meta.url)));
const version = fixture.sourceVersion.slice(1);
const runtime = `<runtime_info>private runtime marker</runtime_info>\n\n${fixture.pullRequestInstructions}`;
const makeMessage = (value = runtime) => ({ method: 'turn/start', params: { additionalContext: {
  t3_code_runtime: { kind: 'application', value },
  other: { kind: 'application', value },
  t3_code_untrusted: { kind: 'untrusted', value },
}, input: [{ type: 'text', text: value }] } });

for (const enabled of [false, true]) {
  test(`4928 PR waiting ${enabled ? 'enabled' : 'disabled'}: context, reinjection and routing preservation`, () => {
    const events = [];
    const policy = createPolicy(version, event => events.push(event), { prWaiting: enabled });
    const message = makeMessage();
    const before = structuredClone(message);
    policy.rewriteDeveloperContext(message);
    const output = message.params.additionalContext.t3_code_runtime.value;
    assert.equal(output.includes(PR_WAITING_GUIDANCE), enabled);
    assert.equal(output.includes('For PR waits, no sleep'), !enabled);
    assert.equal(output.includes('Call watch_pull_request when asked'), !enabled);
    if (enabled) {
      assert.ok(output.includes("Before choosing T3 watching, check the user's selected workflow and applicable skills for an integrated PR review/check mechanism."));
      assert.ok(output.includes('A standalone prerequisite PR does not automatically leave that workflow.'));
      assert.ok(output.includes('Use its request, polling, evidence, retry, recovery, and completion gates when applicable.'));
      assert.ok(output.includes('Use watch_pull_request as a fallback only after establishing that no workflow wait mechanism applies, then end the turn.'));
      assert.ok(output.includes('Watching for a later owner merge must not bypass CI/review qualification.'));
      assert.ok(output.startsWith('<runtime_info>private runtime marker</runtime_info>'));
      const linking = fixture.pullRequestInstructions.split(' Call watch_pull_request')[0];
      assert.ok(output.includes(linking));
      const routing = fixture.pullRequestInstructions.split(' When pull_request_*')[1];
      assert.ok(output.endsWith(` When pull_request_*${routing}`));
      assert.ok(output.includes('Finish any needed branch update and push first'));
      assert.ok(output.includes('Delegated children never watch'));
      assert.ok(output.includes('Before handback, call unwatch_pull_request'));
      assert.ok(Buffer.byteLength(output) <= 4000);
    } else assert.equal(output, runtime);
    before.params.additionalContext.t3_code_runtime.value = output;
    assert.deepEqual(message, before);
    assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(message)), message);

    const tag = `<t3_code_runtime>${runtime}</t3_code_runtime>`;
    const injection = { method: 'thread/inject_items', params: { items: [
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: tag }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: tag }] },
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: runtime }] },
    ] } };
    policy.rewriteDeveloperContext(injection);
    assert.equal(injection.params.items[0].content[0].text, `<t3_code_runtime>${output}</t3_code_runtime>`);
    assert.equal(injection.params.items[1].content[0].text, tag);
    assert.equal(injection.params.items[2].content[0].text, runtime);
    assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(injection)), injection);
    assert.ok(!events.includes('unrecognized_pr_wait_guidance'));
  });
}

test('4928 PR waiting requires the complete observed block', () => {
  for (const sentence of ['Links and watches persist across pushes.',
    'pull_request_create links for you.', 'If available, call link_issue']) {
    const events = [];
    const policy = createPolicy(version, event => events.push(event));
    const message = makeMessage(runtime.replace(sentence, 'private changed instruction'));
    const before = structuredClone(message);
    policy.rewriteDeveloperContext(message);
    assert.deepEqual(message, before);
    assert.ok(events.includes('unrecognized_pr_wait_guidance'));
    assert.ok(!events.join(' ').includes('private changed instruction'));
  }
});

test('4928 PR waiting remains independent of other overrides and unsupported stable releases', () => {
  for (const reviewWorkflow of [false, true]) for (const prWaiting of [false, true])
    for (const browserRouting of [false, true]) for (const environmentRouting of [false, true]) {
      const message = makeMessage();
      createPolicy(version, () => {}, { reviewWorkflow, prWaiting, browserRouting, environmentRouting })
        .rewriteDeveloperContext(message);
      assert.equal(message.params.additionalContext.t3_code_runtime.value.includes(PR_WAITING_GUIDANCE), prWaiting);
    }
  const message = makeMessage();
  const before = structuredClone(message);
  createPolicy('0.1.11').rewriteDeveloperContext(message);
  assert.deepEqual(message, before);
});

test('5191 watch rewrite removes the end-turn conflict and preserves notification behavior and schemas', () => {
  const policy = createPolicy(watchFixture.sourceVersion.slice(1));
  const message = { result: { tools: [{ name: 'watch_pull_request', description: watchFixture.watch_pull_request,
    inputSchema: { type: 'object', properties: { until: { type: 'string', enum: ['checks', 'merged'] } } },
    outputSchema: { type: 'object', properties: { watching: { type: 'boolean' } } },
    annotations: { readOnlyHint: false },
  }] } };
  const before = structuredClone(message);
  policy.rewriteToolsList(message);
  const description = message.result.tools[0].description;
  assert.ok(!description.includes('After this call, end your turn.'));
  assert.equal(description, watchFixture.watch_pull_request.replace('After this call, end your turn.',
    'End your turn when T3 owns the wait; preserve any workflow-owned wait, deadlines, and recovery.'));
  before.result.tools[0].description = description;
  assert.deepEqual(message, before);
  policy.rewriteToolsList(message);
  assert.deepEqual(message, before);
  assert.equal(policy.diagnostics().observations.prWaiting.unrecognized, 0);
});

test('5191 watch rewrite preserves disabled, unsupported, unrelated and unrecognized descriptions', () => {
  const changed = watchFixture.watch_pull_request.replace('The watch stays on:', 'The watch remains active:');
  for (const [version, overrides, name, description] of [
    [watchFixture.sourceVersion.slice(1), { prWaiting: false }, 'watch_pull_request', watchFixture.watch_pull_request],
    ['0.1.12', undefined, 'watch_pull_request', watchFixture.watch_pull_request],
    [watchFixture.sourceVersion.slice(1), undefined, 'other_tool', watchFixture.watch_pull_request],
    [watchFixture.sourceVersion.slice(1), undefined, 'watch_pull_request', changed],
  ]) {
    const policy = createPolicy(version, () => {}, overrides);
    const message = { result: { tools: [{ name, description }] } };
    const before = structuredClone(message);
    policy.rewriteToolsList(message);
    assert.deepEqual(message, before);
    assert.equal(policy.diagnostics().observations.prWaiting.unrecognized,
      description === changed || version === '0.1.12' ? 1 : 0);
  }
});
