import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy } from '../src/policy.mjs';
import { resolveOverrides } from '../src/config.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-routing-guidance-5245.json', import.meta.url)));
const version = fixture.sourceVersion.slice(1);
const prRule = 'When pull_request_* tools are listed, use them, not gh or cafe';
const deviceRule = 'These rules override memory notes, docs and delegated tasks';

function input() {
  return { method: 'turn/start', params: { additionalContext: {
    t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
    t3_code_tools: { kind: 'application', value: fixture.devices },
  }, input: [{ type: 'text', text: fixture.devices + fixture.pullRequestInstructions }] } };
}
function tools() {
  return { result: { tools: ['t3_environment_link', 'device_open', 'device_screenshot'].map(name => ({
    name, description: fixture[name], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, annotations: { readOnlyHint: false },
  })) } };
}
for (const prToolRouting of [false, true]) for (const prWaiting of [false, true])
  for (const deviceRouting of [false, true]) for (const environmentRouting of [false, true]) {
    test(`5245 routing independent: PR tools=${prToolRouting} waits=${prWaiting} devices=${deviceRouting} environments=${environmentRouting}`, () => {
      const events = [];
      const policy = createPolicy(version, event => events.push(event), { prToolRouting, prWaiting, deviceRouting, environmentRouting });
      const message = input();
      const before = structuredClone(message);
      policy.rewriteDeveloperContext(message);
      const runtime = message.params.additionalContext.t3_code_runtime.value;
      const devices = message.params.additionalContext.t3_code_tools.value;
      assert.equal(runtime.includes(prRule), !prToolRouting);
      assert.equal(runtime.includes('Let the user\'s workflow choose how PR checks'), prWaiting);
      assert.equal(devices.includes(deviceRule), !deviceRouting);
      if (prToolRouting) assert.match(runtime, /workflow.*PR tools/);
      if (deviceRouting) {
        assert.match(devices, /workflow.*device tools/);
        assert.match(devices, /never reuse or close another session/);
        assert.match(devices, /device_list/);
        assert.match(devices, /device_open/);
        assert.match(devices, /device_screenshot/);
        assert.match(devices, /agent-device/);
      }
      assert.ok(Buffer.byteLength(runtime) <= 4000);
      assert.ok(Buffer.byteLength(devices) <= 4000);
      assert.deepEqual(message.params.input, before.params.input);
      assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(message)), message);
      const metadata = tools();
      const original = structuredClone(metadata);
      policy.rewriteToolsList(metadata);
      for (const [i, tool] of metadata.result.tools.entries()) {
        const enabled = tool.name === 't3_environment_link' ? environmentRouting : deviceRouting;
        assert.equal(tool.description !== original.result.tools[i].description, enabled);
        if (enabled) assert.match(tool.description, tool.name === 't3_environment_link' ? /explicitly requests/ : /workflow/);
        original.result.tools[i].description = tool.description;
      }
      assert.deepEqual(metadata, original);
      assert.deepEqual(policy.rewriteToolsList(structuredClone(metadata)), metadata);
      const injection = { method: 'thread/inject_items', params: { items: [{ type: 'message', role: 'developer', content: [
        { type: 'input_text', text: `<t3_code_tools>${fixture.devices}</t3_code_tools>\n<t3_code_runtime>${fixture.pullRequestInstructions}</t3_code_runtime>` },
      ] }, { type: 'message', role: 'user', content: [{ type: 'input_text', text: `<t3_code_tools>${fixture.devices}</t3_code_tools>` }] }] } };
      policy.rewriteDeveloperContext(injection);
      assert.equal(injection.params.items[0].content[0].text, `<t3_code_tools>${devices}</t3_code_tools>\n<t3_code_runtime>${runtime}</t3_code_runtime>`);
      assert.equal(injection.params.items[1].content[0].text, `<t3_code_tools>${fixture.devices}</t3_code_tools>`);
      assert.ok(!events.some(event => event.startsWith('unrecognized_')), events.join(', '));
    });
  }

test('unknown routing text is preserved and reported; unrelated and untrusted context is untouched', () => {
  const events = [];
  const policy = createPolicy(version, event => events.push(event));
  const message = input();
  message.params.additionalContext.t3_code_tools.value = fixture.devices.replace('Never do those', 'Do not do those');
  message.params.additionalContext.t3_code_runtime.value = fixture.pullRequestInstructions.replace('not gh or cafe', 'not other tools');
  message.params.additionalContext.other = { kind: 'application', value: fixture.devices };
  message.params.additionalContext.t3_code_orchestration_99 = { kind: 'untrusted', value: fixture.devices };
  const before = structuredClone(message);
  policy.rewriteDeveloperContext(message);
  assert.equal(message.params.additionalContext.t3_code_tools.value, before.params.additionalContext.t3_code_tools.value);
  assert.equal(message.params.additionalContext.other.value, fixture.devices);
  assert.equal(message.params.additionalContext.t3_code_orchestration_99.value, fixture.devices);
  const metadata = tools();
  metadata.result.tools[0].description += ' changed';
  metadata.result.tools[1].description += ' changed';
  const original = structuredClone(metadata);
  policy.rewriteToolsList(metadata);
  assert.equal(metadata.result.tools[0].description, original.result.tools[0].description);
  assert.equal(metadata.result.tools[1].description, original.result.tools[1].description);
  for (const event of ['unrecognized_device_routing_guidance', 'unrecognized_pr_tool_routing_guidance', 'unrecognized_environment_routing_guidance']) assert.ok(events.includes(event), event);
});

test('unsupported versions preserve all new routing surfaces', () => {
  const policy = createPolicy('0.1.4');
  const message = input();
  const metadata = tools();
  const before = structuredClone({ message, metadata });
  policy.rewriteDeveloperContext(message);
  policy.rewriteToolsList(metadata);
  assert.deepEqual({ message, metadata }, before);
});

test('routing switches default on and reject non-boolean values', () => {
  assert.equal(resolveOverrides().prToolRouting, true);
  assert.equal(resolveOverrides().deviceRouting, true);
  for (const key of ['prToolRouting', 'deviceRouting']) assert.throws(() => resolveOverrides({ [key]: 'true' }));
});

test('device routing preserves neighboring browser guidance and rejects changed device sections', () => {
  for (const enabled of [true, false]) {
    const policy = createPolicy(version, () => {}, { deviceRouting: enabled, browserRouting: false });
    const value = '## T3 Code browser\nprivate browser instructions\n\n' + fixture.devices + '\n## Other tools\nprivate instructions';
    const message = input();
    message.params.additionalContext.t3_code_tools.value = value;
    policy.rewriteDeveloperContext(message);
    const output = message.params.additionalContext.t3_code_tools.value;
    assert.ok(output.startsWith('## T3 Code browser\nprivate browser instructions\n\n'));
    assert.ok(output.endsWith('\n## Other tools\nprivate instructions'));
    assert.equal(output.includes(deviceRule), !enabled);
  }
});
