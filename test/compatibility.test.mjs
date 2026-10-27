import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIX_SETS, TESTED_VERSIONS, matchesVersion, selectCompatibility } from '../src/compatibility.mjs';
import { createPolicy, REVIEW_GUIDANCE } from '../src/policy.mjs';

const fixtures = ['t3-guidance.json', 't3-guidance-3669.json', 't3-guidance-0.1.3.json']
  .map(name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));

test('inclusive open, bounded and exact ranges use semantic version precedence', () => {
  assert.equal(matchesVersion('1.2.3', { min: '1.2.3' }), true);
  assert.equal(matchesVersion('9.0.0', { min: '1.2.3' }), true);
  assert.equal(matchesVersion('1.2.2', { min: '1.2.3' }), false);
  assert.equal(matchesVersion('1.2.3', { max: '1.2.3' }), true);
  assert.equal(matchesVersion('0.0.1', { max: '1.2.3' }), true);
  assert.equal(matchesVersion('1.2.4', { max: '1.2.3' }), false);
  assert.equal(matchesVersion('1.2.3', { min: '1.2.3', max: '1.2.3' }), true);
  assert.equal(matchesVersion('1.2.3+build.7', { min: '1.2.3', max: '1.2.3' }), true);
  assert.equal(matchesVersion('1.2.4', { min: '1.2.3', max: '1.2.3' }), false);
  assert.equal(matchesVersion('1.10.0', { min: '1.9.0' }), true);
  assert.equal(matchesVersion('1.2.3-nightly.10', { min: '1.2.3-nightly.9' }), true);
  assert.equal(matchesVersion('1.2.3', { min: '1.2.3-nightly.999' }), true);
  assert.equal(matchesVersion('1.2.3-1', { min: '1.2.3-alpha' }), false);
  assert.equal(matchesVersion('1.2.3-alpha.1', { min: '1.2.3-alpha' }), true);
  assert.equal(matchesVersion('1.2.3-alpha', { min: '1.2.3-alpha.1' }), false);
  assert.equal(matchesVersion('99.0.0', {}), true);
  for (const version of [undefined, null, {}, '', '1.2', '01.2.3', '1.2.3-01', '1.2.3\n', 'private-marker']) {
    assert.equal(matchesVersion(version, {}), false);
    assert.equal(selectCompatibility(version).fixSet, null);
  }
  assert.throws(() => matchesVersion('1.2.3', { min: 'broken' }), /invalid_version_range/);
  assert.throws(() => matchesVersion('1.2.3', { min: '2.0.0', max: '1.0.0' }), /invalid_version_range/);
});

test('supported ranges include newer releases regardless of exact-version test coverage', () => {
  assert.deepEqual(selectCompatibility('0.1.3-nightly.20261025.3655'), { fixSet: 'legacy', tested: true });
  assert.deepEqual(selectCompatibility('0.1.3-nightly.20261025.3669'), { fixSet: 'current', tested: true });
  assert.deepEqual(selectCompatibility('0.1.3'), { fixSet: 'current', tested: true });
  assert.deepEqual(selectCompatibility('0.0.1'), { fixSet: 'legacy', tested: false });
  assert.deepEqual(selectCompatibility('0.1.4-nightly.20261027.3783'), { fixSet: 'current', tested: false });
  assert.deepEqual(selectCompatibility('8.0.0'), { fixSet: 'current', tested: false });
  assert.deepEqual(selectCompatibility('0.1.3-nightly.20261025.3660'), { fixSet: null, tested: false });
  for (const version of TESTED_VERSIONS) assert.equal(FIX_SETS.filter(fix => matchesVersion(version, fix.range)).length, 1);
  const events = [];
  const policy = createPolicy('8.0.0', event => events.push(event));
  const latest = fixtures.at(-1);
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: latest.context },
  } } };
  policy.rewriteDeveloperContext(message);
  assert.ok(message.params.additionalContext.t3_code_orchestration_01.value.includes(REVIEW_GUIDANCE));
  assert.deepEqual(events, ['t3_fixset_current', 'guidance_rewritten']);
});

for (const fixture of fixtures) {
  for (const sourceVersion of [fixture.sourceVersion, ...(fixture.equivalentVersion ? [fixture.equivalentVersion] : [])]) {
    test(`${sourceVersion}: selected fix preserves unrelated context, schemas and tool metadata`, () => {
      const policy = createPolicy(sourceVersion.slice(1));
      const sections = fixture.sections ?? [fixture.context];
      const original = fixture.originalReviewText ?? fixture.context.split('\n').find(line => line.startsWith('- For independent'));
      const replacement = fixture.originalReviewText ? REVIEW_GUIDANCE : '- ' + REVIEW_GUIDANCE;
      const context = Object.fromEntries(sections.map((value, i) =>
        [`t3_code_orchestration_${String(i + 1).padStart(2, '0')}`, { kind: 'application', value }]));
      context.t3_code_orchestration_99 = { kind: 'untrusted', value: fixture.context };
      const message = { method: 'turn/start', params: { additionalContext: structuredClone(context), input: [fixture.context] } };
      policy.rewriteDeveloperContext(message);
      assert.equal(message.params.additionalContext.t3_code_orchestration_01.value, fixture.context.replace(original, replacement));
      const expected = structuredClone(context);
      expected.t3_code_orchestration_01.value = message.params.additionalContext.t3_code_orchestration_01.value;
      assert.deepEqual(message.params.additionalContext, expected);
      assert.deepEqual(message.params.input, [fixture.context]);
      const once = structuredClone(message);
      assert.deepEqual(policy.rewriteDeveloperContext(message), once);
      const reinject = { method: 'thread/inject_items', params: { items: sections.map((value, i) => {
        const tag = `t3_code_orchestration_${String(i + 1).padStart(2, '0')}`;
        return { role: 'developer', type: 'message', content: [{ type: 'input_text', text: `<${tag}>${value}</${tag}>` }] };
      }) } };
      policy.rewriteDeveloperContext(reinject);
      assert.ok(reinject.params.items[0].content[0].text.includes(REVIEW_GUIDANCE));
      assert.ok(!reinject.params.items[0].content[0].text.includes(original));
      const tools = { result: { tools: ['delegate_task', 't3_thread_send'].map(name => ({
        name, description: fixture[name], inputSchema: { type: 'object', properties: { keep: { type: 'string' } } },
      })) } };
      const before = structuredClone(tools);
      policy.rewriteToolsList(tools);
      if (fixture.toolDescriptionsUnchanged) assert.deepEqual(tools, before);
      else for (let i = 0; i < 2; i++) {
        assert.ok(tools.result.tools[i].description.includes(REVIEW_GUIDANCE));
        assert.deepEqual(tools.result.tools[i].inputSchema, before.result.tools[i].inputSchema);
      }
    });
  }
}

test('missing versions and version/input mismatches preserve content and warn without private data', () => {
  for (const version of [undefined, 'not-a-version', '0.1.3']) {
    const events = [];
    const policy = createPolicy(version, event => events.push(event));
    const message = { method: 'turn/start', params: { additionalContext: {
      t3_code_orchestration_01: { kind: 'application', value: fixtures[0].context + '\nprivate-marker' },
    } } };
    const before = structuredClone(message);
    policy.rewriteDeveloperContext(message);
    assert.deepEqual(message, before);
    assert.ok(events.includes('unrecognized_review_guidance'));
    assert.ok(!events.join(' ').includes('private-marker'));
    if (!version || version === 'not-a-version') assert.ok(events.includes('unsupported_t3_version'));
  }
});
