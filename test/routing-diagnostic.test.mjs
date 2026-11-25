import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPolicy } from '../src/policy.mjs';
import { proxyCheckResult } from '../src/diagnostics.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-routing-guidance-5245.json', import.meta.url)));
const version = fixture.sourceVersion.slice(1);
const tools = ['t3_environment_link', 'device_open', 'device_screenshot'].map(name => ({ name, description: fixture[name] }));

test('diagnostic flags original device and environment descriptions even with correct developer guidance', () => {
  const policy = createPolicy(version);
  const result = proxyCheckResult(policy.diagnostics(), { tools });
  assert.equal(result.structuredContent.environmentRoutingEvidence.status, 'fail');
  assert.equal(result.structuredContent.deviceRoutingEvidence.status, 'fail');
  assert.deepEqual(result.structuredContent.deviceRoutingEvidence.findings.map(f => f.tool), ['device_open', 'device_screenshot']);
  assert.match(result.content[0].text, /mention-based linking wording is FAIL/);
  assert.match(result.content[0].text, /Compatibility checks \(9\)/);
});

test('fixed metadata removes conflicts but still needs received context inspection', () => {
  const policy = createPolicy(version);
  const metadata = { result: { tools: structuredClone(tools) } };
  policy.rewriteToolsList(metadata);
  const result = proxyCheckResult(policy.diagnostics(), metadata.result);
  for (const key of ['environmentRoutingEvidence', 'deviceRoutingEvidence']) {
    assert.equal(result.structuredContent[key].status, 'unknown');
    assert.deepEqual(result.structuredContent[key].findings, []);
    assert.deepEqual(result.structuredContent[key].missingTools, []);
  }
});

test('disabled routing checks preserve original descriptions; missing metadata remains explicit', () => {
  const disabled = createPolicy(version, () => {}, { environmentRouting: false, deviceRouting: false });
  const result = proxyCheckResult(disabled.diagnostics(), { tools });
  assert.equal(result.structuredContent.environmentRoutingEvidence.status, 'disabled');
  assert.equal(result.structuredContent.deviceRoutingEvidence.status, 'disabled');
  const missing = proxyCheckResult(createPolicy(version).diagnostics(), { tools: [], nextCursor: 'more' });
  assert.deepEqual(missing.structuredContent.environmentRoutingEvidence.missingTools, ['t3_environment_link']);
  assert.deepEqual(missing.structuredContent.deviceRoutingEvidence.missingTools, ['device_open', 'device_screenshot']);
  assert.equal(missing.structuredContent.deviceRoutingEvidence.listComplete, false);
});
