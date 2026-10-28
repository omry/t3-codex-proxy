import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy, REVIEW_GUIDANCE } from '../src/policy.mjs';

const fixtures = ['t3-guidance.json', 't3-guidance-3669.json', 't3-guidance-0.1.3.json']
  .map(name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));

for (const fixture of fixtures) {
  for (const reviewWorkflow of [false, true]) for (const prWaiting of [false, true]) for (const browserRouting of [false, true]) {
    test(`${fixture.sourceVersion}: review=${reviewWorkflow}, PR waiting=${prWaiting}, browser=${browserRouting} stay independent`, () => {
      const events = [];
      const policy = createPolicy(fixture.sourceVersion.slice(1), event => events.push(event), { reviewWorkflow, prWaiting, browserRouting });
      const runtime = `<runtime_info>private runtime marker</runtime_info>\n\n${fixture.pullRequestInstructions}`;
      const browserContext = fixture.sections?.find(section => section.startsWith('### Visuals and preview'));
      const browserTools = `${fixture.browserTools}\n\n## T3 Code devices\nprivate device marker`;
      const message = { method: 'turn/start', params: { additionalContext: {
        t3_code_orchestration_01: { kind: 'application', value: fixture.context },
        ...(browserContext ? { t3_code_orchestration_03: { kind: 'application', value: browserContext } } : {}),
        t3_code_tools: { kind: 'application', value: browserTools },
        t3_code_runtime: { kind: 'application', value: runtime },
        t3_code_orchestration_99: { kind: 'untrusted', value: fixture.context },
        other: { kind: 'application', value: runtime },
      }, input: [{ type: 'text', text: runtime }] } };
      const before = structuredClone(message);
      policy.rewriteDeveloperContext(message);
      const actual = message.params.additionalContext;
      assert.equal(actual.t3_code_orchestration_01.value.includes(REVIEW_GUIDANCE), reviewWorkflow);
      assert.equal(actual.t3_code_runtime.value !== runtime, prWaiting);
      assert.equal(actual.t3_code_tools.value !== browserTools, browserRouting);
      assert.ok(actual.t3_code_tools.value.endsWith('## T3 Code devices\nprivate device marker'));
      assert.ok(actual.t3_code_tools.value.includes('preview_status'));
      assert.ok(actual.t3_code_tools.value.includes('preview_open'));
      assert.ok(actual.t3_code_tools.value.includes('locators over coordinates'));
      if (browserContext) {
        const browser = actual.t3_code_orchestration_03.value;
        assert.equal(browser !== browserContext, browserRouting);
        assert.equal(browser.includes('names a page or tab'), !browserRouting);
        assert.ok(browser.startsWith(browserContext.split('\n')[0] + '\n\n' + browserContext.split('\n')[2] + '\n'));
        assert.ok(browser.includes('Never use `preview_*` to verify or show your own edit'));
        assert.ok(browser.includes('Close a tab you opened before you reply'));
      }
      const received = browserContext ? actual.t3_code_orchestration_03.value : actual.t3_code_tools.value;
      assert.equal(received.includes('authenticated API, CLI, or connector'), browserRouting);
      assert.equal(received.includes('does not by itself request browser automation'), browserRouting);
      assert.equal(received.includes('Before asking the user to sign in'), browserRouting);
      for (const entry of Object.values(actual).filter(entry => entry.kind === 'application')) {
        assert.ok(Buffer.byteLength(entry.value) <= 4000, 'Rewritten context fits the Codex per-entry byte limit');
      }
      if (!reviewWorkflow) assert.equal(actual.t3_code_orchestration_01.value, fixture.context);
      if (prWaiting) {
        assert.ok(actual.t3_code_runtime.value.includes('deadlines'));
        assert.ok(actual.t3_code_runtime.value.includes('recovery'));
        assert.ok(!actual.t3_code_runtime.value.includes('Never wait with sleep'));
        assert.ok(!actual.t3_code_runtime.value.includes('so do not poll or run your own watcher'));
        assert.ok(!actual.t3_code_runtime.value.includes('do not watch or poll PRs'));
        assert.ok(actual.t3_code_runtime.value.startsWith('<runtime_info>private runtime marker</runtime_info>'));
        assert.ok(actual.t3_code_runtime.value.includes('link_pull_request'));
        assert.ok(actual.t3_code_runtime.value.includes('unwatch_pull_request'));
      }
      before.params.additionalContext.t3_code_orchestration_01 = actual.t3_code_orchestration_01;
      before.params.additionalContext.t3_code_runtime = actual.t3_code_runtime;
      before.params.additionalContext.t3_code_tools = actual.t3_code_tools;
      if (browserContext) before.params.additionalContext.t3_code_orchestration_03 = actual.t3_code_orchestration_03;
      assert.deepEqual(message, before);
      const once = structuredClone(message);
      policy.rewriteDeveloperContext(message);
      assert.deepEqual(message, once);
      assert.ok(!events.some(event => event.startsWith('unrecognized_')), events.join(', '));

      const tools = { result: { tools: ['delegate_task', 't3_thread_send', 'watch_pull_request'].map(name => ({
        name, description: fixture[name], inputSchema: { type: 'object' }, _meta: { keep: true },
      })) } };
      const originalTools = structuredClone(tools);
      policy.rewriteToolsList(tools);
      for (const [i, tool] of tools.result.tools.entries()) {
        const changes = tool.name === 'watch_pull_request' ? prWaiting : reviewWorkflow && !fixture.toolDescriptionsUnchanged;
        assert.equal(tool.description !== originalTools.result.tools[i].description, changes);
        originalTools.result.tools[i].description = tool.description;
      }
      assert.deepEqual(tools, originalTools);
      const toolsOnce = structuredClone(tools);
      policy.rewriteToolsList(tools);
      assert.deepEqual(tools, toolsOnce);

      const tag = `<t3_code_runtime>${runtime}</t3_code_runtime>`;
      const reinjection = { method: 'thread/inject_items', params: { items: [
        { type: 'message', role: 'developer', content: [{ type: 'input_text', text: tag }] },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: tag }] },
        { type: 'message', role: 'developer', content: [{ type: 'input_text', text: runtime }] },
      ] } };
      policy.rewriteDeveloperContext(reinjection);
      assert.equal(reinjection.params.items[0].content[0].text,
        `<t3_code_runtime>${actual.t3_code_runtime.value}</t3_code_runtime>`);
      assert.equal(reinjection.params.items[1].content[0].text, tag);
      assert.equal(reinjection.params.items[2].content[0].text, runtime);

      const browserTag = `<t3_code_tools>${browserTools}</t3_code_tools>`;
      const browserInjection = { method: 'thread/inject_items', params: { items: [
        { type: 'message', role: 'developer', content: [{ type: 'input_text', text: browserTag }] },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: browserTag }] },
        { type: 'message', role: 'developer', content: [{ type: 'input_text', text: browserTools }] },
        ...(browserContext ? [{ type: 'message', role: 'developer', content: [{ type: 'input_text',
          text: `<t3_code_orchestration_03>${browserContext}</t3_code_orchestration_03>` }] }] : []),
      ] } };
      policy.rewriteDeveloperContext(browserInjection);
      assert.equal(browserInjection.params.items[0].content[0].text,
        `<t3_code_tools>${actual.t3_code_tools.value}</t3_code_tools>`);
      assert.equal(browserInjection.params.items[1].content[0].text, browserTag);
      assert.equal(browserInjection.params.items[2].content[0].text, browserTools);
      if (browserContext) assert.equal(browserInjection.params.items[3].content[0].text,
        `<t3_code_orchestration_03>${actual.t3_code_orchestration_03.value}</t3_code_orchestration_03>`);
      assert.deepEqual(policy.rewriteDeveloperContext(structuredClone(browserInjection)), browserInjection);
    });
  }
}

test('all overrides are enabled when configuration omits them', () => {
  const fixture = fixtures.at(-1);
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: fixture.context },
    t3_code_runtime: { kind: 'application', value: fixture.pullRequestInstructions },
    t3_code_orchestration_03: { kind: 'application', value: fixture.sections[2] },
  } } };
  createPolicy('0.1.3').rewriteDeveloperContext(message);
  assert.ok(message.params.additionalContext.t3_code_orchestration_01.value.includes(REVIEW_GUIDANCE));
  assert.notEqual(message.params.additionalContext.t3_code_runtime.value, fixture.pullRequestInstructions);
  assert.ok(message.params.additionalContext.t3_code_orchestration_03.value.includes('authenticated API, CLI, or connector'));
});

test('disabled overrides produce no guidance warnings', () => {
  const events = [];
  const policy = createPolicy('0.1.3', code => events.push(code), { reviewWorkflow: false, prWaiting: false, browserRouting: false });
  events.length = 0;
  const message = { method: 'turn/start', params: { additionalContext: {
    t3_code_orchestration_01: { kind: 'application', value: 'Unknown private review marker' },
    t3_code_runtime: { kind: 'application', value: 'Unknown private PR marker' },
    t3_code_tools: { kind: 'application', value: 'Unknown private browser marker' },
  } } };
  const tools = { result: { tools: [{ name: 'watch_pull_request', description: 'Unknown private PR marker' }] } };
  const before = structuredClone({ message, tools });
  policy.rewriteDeveloperContext(message);
  policy.rewriteToolsList(tools);
  assert.deepEqual({ message, tools }, before);
  assert.deepEqual(events, []);
});

test('unknown browser wording and unsupported versions pass through with content-free warnings', () => {
  for (const version of ['0.1.3', undefined, 'unknown-private-version']) {
    const events = [];
    const policy = createPolicy(version, event => events.push(event), { reviewWorkflow: false, prWaiting: false });
    const message = { method: 'turn/start', params: { additionalContext: {
      t3_code_orchestration_03: { kind: 'application', value: '### Visuals and preview\nChanged private browser marker' },
      t3_code_tools: { kind: 'application', value: '## T3 Code browser\nChanged private browser marker' },
    } } };
    const original = structuredClone(message);
    policy.rewriteDeveloperContext(message);
    assert.deepEqual(message, original);
    assert.equal(policy.diagnostics().observations.browserRouting.unrecognized, 2);
    assert.ok(events.includes('unrecognized_browser_routing_guidance'));
    assert.ok(!events.join(' ').includes('private'));
  }
});

test('browser rewrites leave user input, unrelated context, tool results, and browser tool metadata untouched', () => {
  const fixture = fixtures.at(-1);
  const policy = createPolicy('0.1.3');
  const browser = fixture.sections[2];
  const messages = [
    { method: 'turn/start', params: { additionalContext: {
      unrelated: { kind: 'application', value: browser },
      t3_code_tools: { kind: 'untrusted', value: fixture.browserTools },
      t3_code_orchestration_04: { kind: 'application', value: '### Showing visuals\nUse `html_preview`, then `html_render`.' },
    }, input: [{ type: 'text', text: browser }] } },
    { id: 1, result: { content: [{ type: 'text', text: fixture.browserTools }] } },
    { result: { tools: [{ name: 'preview_open', description: fixture.browserTools,
      inputSchema: { type: 'object' } }] } },
  ];
  const originals = structuredClone(messages);
  for (const message of messages) {
    policy.rewriteDeveloperContext(message);
    policy.rewriteToolsList(message);
  }
  assert.deepEqual(messages, originals);
  assert.equal(policy.diagnostics().observations.browserRouting.unrecognized, 0);
});

test('changed PR wording and unsupported versions are preserved with fixed warnings', () => {
  for (const version of ['0.1.3', undefined, 'unknown-private-marker']) {
    const events = [];
    const policy = createPolicy(version, code => events.push(code), { reviewWorkflow: false, prWaiting: true });
    const message = { method: 'turn/start', params: { additionalContext: {
      t3_code_runtime: { kind: 'application', value: '<pull_request_linking>Changed private PR marker</pull_request_linking>' },
    } } };
    const tools = { result: { tools: [{ name: 'watch_pull_request', description: 'Changed private PR marker' }] } };
    const before = structuredClone({ message, tools });
    policy.rewriteDeveloperContext(message);
    policy.rewriteToolsList(tools);
    assert.deepEqual({ message, tools }, before);
    assert.ok(events.includes('unrecognized_pr_wait_guidance'));
    assert.ok(!events.join(' ').includes('private'));
  }
});

test('current PR waiting preserves the branch update prerequisite in context and reinjection', () => {
  const fixture = fixtures.find(({ sourceVersion }) => sourceVersion === 'v0.1.3');
  const prerequisite = 'Finish any needed branch update and push first, then watch and end your turn.';
  const runtime = fixture.pullRequestInstructions;

  const enabled = createPolicy('0.1.3', () => {}, { reviewWorkflow: false, prWaiting: true });
  const initial = { method: 'turn/start', params: { additionalContext: {
    t3_code_runtime: { kind: 'application', value: runtime },
  } } };
  enabled.rewriteDeveloperContext(initial);
  assert.ok(initial.params.additionalContext.t3_code_runtime.value.includes(prerequisite));

  const reinjection = { method: 'thread/inject_items', params: { items: [
    { type: 'message', role: 'developer', content: [
      { type: 'input_text', text: `<t3_code_runtime>${runtime}</t3_code_runtime>` },
    ] },
  ] } };
  enabled.rewriteDeveloperContext(reinjection);
  assert.ok(reinjection.params.items[0].content[0].text.includes(prerequisite));

  const disabled = createPolicy('0.1.3', () => {}, { reviewWorkflow: false, prWaiting: false });
  const passthrough = { method: 'turn/start', params: { additionalContext: {
    t3_code_runtime: { kind: 'application', value: runtime },
  } } };
  disabled.rewriteDeveloperContext(passthrough);
  assert.equal(passthrough.params.additionalContext.t3_code_runtime.value, runtime);

  const disabledReinjection = { method: 'thread/inject_items', params: { items: [
    { type: 'message', role: 'developer', content: [
      { type: 'input_text', text: `<t3_code_runtime>${runtime}</t3_code_runtime>` },
    ] },
  ] } };
  disabled.rewriteDeveloperContext(disabledReinjection);
  assert.equal(disabledReinjection.params.items[0].content[0].text,
    `<t3_code_runtime>${runtime}</t3_code_runtime>`);
});
