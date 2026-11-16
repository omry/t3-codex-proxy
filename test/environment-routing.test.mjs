import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy, ENVIRONMENT_ROUTING_GUIDANCE } from '../src/policy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-environment-guidance-4774.json', import.meta.url)));
const version = fixture.sourceVersion.slice(1);
const originalBullets = fixture.context.split('\n').filter(line => /^- (Another machine:|Unlinked \()/.test(line));
const unrelatedLines = text => text.split('\n').filter(line => !/t3_environment_|environment linking|linked machine/.test(line));

for (const enabled of [false, true]) {
  test(`4774 environment routing ${enabled ? 'enabled' : 'disabled'}: initial context and reinjection`, () => {
    const events = [];
    const policy = createPolicy(version, event => events.push(event), {
      reviewWorkflow: false, prWaiting: false, browserRouting: false, environmentRouting: enabled,
    });
    const message = { method: 'turn/start', params: { additionalContext: {
      t3_code_orchestration_07: { kind: 'application', value: fixture.context },
      t3_code_orchestration_99: { kind: 'untrusted', value: fixture.context },
      other: { kind: 'application', value: fixture.context },
    }, input: [{ type: 'text', text: fixture.context }] } };
    const before = structuredClone(message);
    policy.rewriteDeveloperContext(message);
    const output = message.params.additionalContext.t3_code_orchestration_07.value;
    assert.equal(output.includes(ENVIRONMENT_ROUTING_GUIDANCE), enabled);
    assert.equal(originalBullets.length, 2);
    for (const bullet of originalBullets) assert.equal(output.includes(bullet), !enabled);
    if (enabled) {
      assert.ok(output.includes('When T3 environment work is explicitly requested'));
      assert.ok(output.includes('pass its `environmentId` to the T3 tool'));
      assert.ok(output.includes('pass `threadId` when targeting a thread there'));
      assert.ok(output.includes('Never ask for a pairing code in chat.'));
      assert.ok(output.includes('No link tools: say to enable Settings → Labs → Linked environments.'));
      assert.deepEqual(unrelatedLines(output), unrelatedLines(fixture.context));
      assert.ok(Buffer.byteLength(output) <= 4000);
    } else assert.equal(output, fixture.context);
    before.params.additionalContext.t3_code_orchestration_07.value = output;
    assert.deepEqual(message, before);
    assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(message)), message);

    const tag = `<t3_code_orchestration_07>${fixture.context}</t3_code_orchestration_07>`;
    const injection = { method: 'thread/inject_items', params: { items: [
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: tag }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: tag }] },
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: fixture.context }] },
    ] } };
    policy.rewriteDeveloperContext(injection);
    assert.equal(injection.params.items[0].content[0].text, `<t3_code_orchestration_07>${output}</t3_code_orchestration_07>`);
    assert.equal(injection.params.items[1].content[0].text, tag);
    assert.equal(injection.params.items[2].content[0].text, fixture.context);
    assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(injection)), injection);
    assert.ok(!events.includes('unrecognized_environment_routing_guidance'));
  });
}

test('4774 environment routing requires both exact bullets before changing either', () => {
  for (const bullet of originalBullets) {
    for (const changed of [fixture.context.replace(bullet, ''), fixture.context.replace(bullet, `${bullet} private changed rule`)]) {
      const events = [];
      const policy = createPolicy(version, event => events.push(event), {
        reviewWorkflow: false, prWaiting: false, browserRouting: false,
      });
      const message = { method: 'turn/start', params: { additionalContext: {
        t3_code_orchestration_02: { kind: 'application', value: changed },
      } } };
      const before = structuredClone(message);
      policy.rewriteDeveloperContext(message);
      assert.deepEqual(message, before);
      assert.equal(policy.diagnostics().observations.environmentRouting.unrecognized, 1);
      assert.ok(events.includes('unrecognized_environment_routing_guidance'));
      assert.ok(!events.join(' ').includes('private changed rule'));
    }
  }
});

test('4774 environment routing stays independent of other overrides and unsupported stable releases', () => {
  for (const reviewWorkflow of [false, true]) for (const prWaiting of [false, true])
    for (const browserRouting of [false, true]) for (const environmentRouting of [false, true]) {
      const message = { method: 'turn/start', params: { additionalContext: {
        t3_code_orchestration_02: { kind: 'application', value: fixture.context },
      } } };
      createPolicy(version, () => {}, { reviewWorkflow, prWaiting, browserRouting, environmentRouting })
        .rewriteDeveloperContext(message);
      assert.equal(message.params.additionalContext.t3_code_orchestration_02.value.includes(ENVIRONMENT_ROUTING_GUIDANCE), environmentRouting);
    }
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_02: { kind: 'application', value: fixture.context },
  } } };
  const before = structuredClone(message);
  createPolicy('0.1.4').rewriteDeveloperContext(message);
  assert.deepEqual(message, before);
});

const oldFixture = JSON.parse(readFileSync(new URL('./fixtures/t3-guidance-4580.json', import.meta.url)));
const environmentCases = [
  {
    name: '4580',
    version: oldFixture.sourceVersion.slice(1),
    context: oldFixture.sections.find(section => section.includes('Another machine: `t3_environment_links`')),
  },
  { name: '4774', version, context: fixture.context },
];
const routingBullet = line => /^- (?:Another machine:|A machine the user names|Unlinked \()/.test(line);
const routingBullets = text => text.split(/\r?\n/).filter(routingBullet);
const unrelatedEnvironmentLines = text => text.split(/\r?\n/).filter(line => !routingBullet(line) &&
  !/t3_environment_|environment linking|linked machine|Use T3 environment tools|When T3 environment work|No link tools/.test(line));
const withLineEnding = (text, ending) => text.replaceAll('\n', ending);

for (const environment of environmentCases) {
  for (const ending of ['\n', '\r\n']) {
    for (const enabled of [false, true]) {
      test(`${environment.name} environment routing ${ending === '\n' ? 'LF' : 'CRLF'} ${enabled ? 'enabled' : 'disabled'}: focused delimiter matrix`, () => {
        const context = withLineEnding(environment.context, ending);
        const events = [];
        const policy = createPolicy(environment.version, event => events.push(event), {
          reviewWorkflow: false, prWaiting: false, browserRouting: false, environmentRouting: enabled,
        });
        const message = { method: 'turn/start', params: { additionalContext: {
          t3_code_orchestration_07: { kind: 'application', value: context },
          t3_code_orchestration_99: { kind: 'untrusted', value: context },
          other: { kind: 'application', value: context },
        }, input: [{ type: 'text', text: context }] } };
        const before = structuredClone(message);
        policy.rewriteDeveloperContext(message);
        const output = message.params.additionalContext.t3_code_orchestration_07.value;
        if (!enabled) {
          assert.equal(output, context);
        } else {
          assert.ok(output.includes(ENVIRONMENT_ROUTING_GUIDANCE));
          assert.ok(output.includes('When T3 environment work is explicitly requested'));
          assert.ok(output.includes('environmentId'));
          assert.ok(output.includes('threadId'));
          assert.ok(output.includes(environment.name === '4774'
            ? 'No link tools: say to enable Settings → Labs → Linked environments.'
            : 'Never ask for a pairing code in chat.'));
          for (const bullet of routingBullets(context)) assert.equal(output.includes(bullet), false);
          assert.deepEqual(unrelatedEnvironmentLines(output), unrelatedEnvironmentLines(context));
          assert.ok(Buffer.byteLength(output) <= 4000);
        }
        before.params.additionalContext.t3_code_orchestration_07.value = output;
        assert.deepEqual(message, before);
        const once = structuredClone(message);
        policy.rewriteDeveloperContext(message);
        assert.deepEqual(message, once);

        const tag = `<t3_code_orchestration_07>${context}</t3_code_orchestration_07>`;
        const injection = { method: 'thread/inject_items', params: { items: [
          { type: 'message', role: 'developer', content: [{ type: 'input_text', text: tag }] },
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: tag }] },
          { type: 'message', role: 'developer', content: [{ type: 'input_text', text: context }] },
        ] } };
        policy.rewriteDeveloperContext(injection);
        const expectedTagged = enabled ? output : context;
        assert.equal(injection.params.items[0].content[0].text,
          `<t3_code_orchestration_07>${expectedTagged}</t3_code_orchestration_07>`);
        assert.equal(injection.params.items[1].content[0].text, tag);
        assert.equal(injection.params.items[2].content[0].text, context);
        const reinjectedOnce = structuredClone(injection);
        policy.rewriteDeveloperContext(injection);
        assert.deepEqual(injection, reinjectedOnce);
        assert.ok(!events.includes('unrecognized_environment_routing_guidance'));
      });
    }
  }
}

for (const environment of environmentCases) {
  for (const ending of ['\n', '\r\n']) {
    test(`${environment.name} environment routing ${ending === '\n' ? 'LF' : 'CRLF'} rejects missing or appended changed bullets`, () => {
      const context = withLineEnding(environment.context, ending);
      for (const bullet of routingBullets(context)) {
        for (const changed of [context.replace(bullet, ''), context.replace(bullet, `${bullet} private changed rule`)]) {
          const events = [];
          const policy = createPolicy(environment.version, event => events.push(event), {
            reviewWorkflow: false, prWaiting: false, browserRouting: false, environmentRouting: true,
          });
          const message = { method: 'turn/start', params: { additionalContext: {
            t3_code_orchestration_02: { kind: 'application', value: changed },
          } } };
          const before = structuredClone(message);
          policy.rewriteDeveloperContext(message);
          assert.deepEqual(message, before);
          assert.equal(policy.diagnostics().observations.environmentRouting.unrecognized, 1);
          assert.ok(events.includes('unrecognized_environment_routing_guidance'));
          assert.ok(!events.join(' ').includes('private changed rule'));
        }
      }
    });
  }
}
