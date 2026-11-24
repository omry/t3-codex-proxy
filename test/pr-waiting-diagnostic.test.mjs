import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import { createPolicy } from '../src/policy.mjs';
import { proxyCheckResult } from '../src/diagnostics.mjs';
import { startMcpProxy } from '../src/mcp-proxy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/t3-pr-watch-guidance-5191.json', import.meta.url)));
const version = fixture.sourceVersion.slice(1);
const watch = description => ({ name: 'watch_pull_request', description, inputSchema: { type: 'object' } });

test('proxy-check fails PR waiting on the observed 5191 watch restriction', () => {
  const result = proxyCheckResult(createPolicy(version).diagnostics(), { tools: [watch(fixture.watch_pull_request)] });
  const evidence = result.structuredContent.prWaitingEvidence;
  assert.equal(evidence?.status, 'fail');
  assert.deepEqual(evidence.findings, [{ tool: 'watch_pull_request', surface: 'description',
    instruction: 'After this call, end your turn.' }]);
  assert.match(result.content[0].text, /PR waiting: FAIL/);
  assert.match(result.content[0].text, /For PR waiting when enabled, inspect/);
  assert.match(result.content[0].text, /A prWaitingEvidence status of fail requires this check and the overall result to FAIL/);
});

test('proxy-check reports disabled PR restrictions as preserved behavior', () => {
  const result = proxyCheckResult(createPolicy(version, () => {}, { prWaiting: false }).diagnostics(),
    { tools: [watch(fixture.watch_pull_request)] });
  const evidence = result.structuredContent.prWaitingEvidence;
  assert.equal(evidence?.status, 'disabled');
  assert.equal(evidence.findings.length, 1);
  assert.doesNotMatch(result.content[0].text, /PR waiting: FAIL/);
});

test('missing or conflict-free PR metadata still needs context inspection', () => {
  for (const metadata of [undefined, { tools: [] }, { tools: [], nextCursor: 'more' },
    { tools: [watch('End your turn when T3 owns the wait; preserve any workflow-owned wait, deadlines, and recovery.')] }]) {
    const result = proxyCheckResult(createPolicy(version).diagnostics(), metadata);
    const evidence = result.structuredContent.prWaitingEvidence;
    assert.equal(evidence?.status, 'unknown');
    assert.deepEqual(evidence.findings, []);
    assert.equal(evidence.missingTools.length, metadata?.tools?.length ? 0 : 1);
    assert.equal(evidence.listComplete, Boolean(metadata?.tools && !metadata.nextCursor));
    assert.match(result.content[0].text, /PR waiting evidence: UNKNOWN/);
  }
});

for (const recognized of [false, true]) test(`proxy-check endpoint inspects effective 5191 watch metadata: recognized=${recognized}`, async t => {
  // Unknown surrounding wording must keep the full-description rewrite from matching.
  const description = recognized ? fixture.watch_pull_request
    : fixture.watch_pull_request.replace('The watch stays on:', 'The watch remains active:');
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks));
    assert.equal(message.method, 'tools/list');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [watch(description)] } }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(() => { upstream.closeAllConnections(); return new Promise(resolve => upstream.close(resolve)); });
  const policy = createPolicy(version);
  const proxy = await startMcpProxy({ rewriteToolsList: policy.rewriteToolsList, diagnostics: policy.diagnostics });
  t.after(() => proxy.close());
  const url = proxy.register(`http://127.0.0.1:${upstream.address().port}/mcp`);
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'proxy-check', arguments: {} } }) });
  const message = await response.json();
  const evidence = message.result.structuredContent.prWaitingEvidence;
  assert.equal(evidence?.status, recognized ? 'unknown' : 'fail');
  assert.equal(evidence.findings.length, recognized ? 0 : 1);
  assert.equal(message.result.content[0].text.includes('PR waiting: FAIL'), !recognized);
});
