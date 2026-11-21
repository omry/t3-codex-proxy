import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyCheckResult } from '../src/diagnostics.mjs';
import { createPolicy } from '../src/policy.mjs';

function diagnostics(tested) {
  return {
    t3Version: '0.1.12-nightly.20261121.5024',
    fixSet: 'current',
    tested,
    overrides: { reviewWorkflow: true, prWaiting: true, browserRouting: true, environmentRouting: true },
    observations: {
      reviewWorkflow: { rewrites: 1, unrecognized: 0 },
      prWaiting: { rewrites: 0, unrecognized: 0 },
      browserRouting: { rewrites: 0, unrecognized: 0 },
      environmentRouting: { rewrites: 0, unrecognized: 0 },
    },
    writableRoots: { paths: [], entries: [], configured: 0, processWritable: 0, status: 'not_configured' },
  };
}

test('proxy-check reports newer untested T3 guidance as informational drift', () => {
  const result = proxyCheckResult(diagnostics(false), { tools: [] });
  assert.equal(result.structuredContent.guidelineDrift.status, 'info');
  assert.match(result.content[0].text, /ℹ️ Guideline drift:/);
  assert.match(result.content[0].text, /informational/);
});

test('exactly tested guidance does not add a drift notice', () => {
  const result = proxyCheckResult(diagnostics(true), { tools: [] });
  assert.equal(result.structuredContent.guidelineDrift.status, 'none');
  assert.doesNotMatch(result.content[0].text, /ℹ️ Guideline drift:/);
});

test('changed waiting-result wording is reported as informational drift', () => {
  const events = [];
  const policy = createPolicy('0.1.3', event => events.push(event));
  const data = { taskId: 'task', childThreadId: 'child', status: 'running', waitTimedOut: false, next: 'new T3 waiting wording' };
  policy.rewriteToolResult({ result: { structuredContent: data } }, 'task_status');
  const result = proxyCheckResult({ ...policy.diagnostics(), overrides: { reviewWorkflow: true, prWaiting: true, browserRouting: true, environmentRouting: true }, writableRoots: { paths: [], entries: [], configured: 0, processWritable: 0, status: 'not_configured' } }, { tools: [] });
  assert.ok(events.includes('unrecognized_waiting_hint'));
  assert.equal(result.structuredContent.guidelineDrift.status, 'info');
  assert.match(result.content[0].text, /waitingResults guidance wording/);
});
