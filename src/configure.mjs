import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { findCodexExecutable, normalizeConfig, writeConfig } from './config.mjs';

const MAX_CONFIG_BYTES = 32 * 1024;
const SETUP_TIMEOUT_MS = 10 * 60 * 1000;

function headers(extra = {}, nonce = 'setup') {
  return { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`, ...extra };
}

function send(response, status, body, contentType = 'application/json', nonce) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, headers({ 'content-type': contentType, 'content-length': Buffer.byteLength(data) }, nonce));
  response.end(data);
}

async function boundedBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_CONFIG_BYTES) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function page(nonce) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>T3 Codex Proxy setup</title><style>
body{font:16px system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#222;background:#fafafa}
main{background:white;border:1px solid #ddd;border-radius:12px;padding:2rem;box-shadow:0 2px 12px #0001}
label{display:block;font-weight:600;margin-top:1rem}input,textarea{box-sizing:border-box;width:100%;font:inherit;padding:.6rem;margin-top:.35rem;border:1px solid #aaa;border-radius:6px}
textarea{min-height:6rem}fieldset{border:0;padding:0;margin:0}button{margin-top:1.5rem;padding:.65rem 1rem;font:inherit;font-weight:600}#status{min-height:1.5rem;margin-top:1rem}
</style></head><body><main><h1>T3 Codex Proxy setup</h1>
<p>This page edits the local proxy configuration. It is available only from this machine and closes after a successful save.</p>
<form id="form"><label>Codex executable<input id="realCodex" required autocomplete="off"></label>
<label>Additional writable roots<textarea id="roots" placeholder="One absolute path per line"></textarea></label>
<fieldset><legend>Guidance overrides</legend>
<label><input type="checkbox" id="reviewWorkflow"> Review workflow</label>
<label><input type="checkbox" id="prWaiting"> PR waiting</label>
<label><input type="checkbox" id="browserRouting"> Browser routing</label>
<label><input type="checkbox" id="environmentRouting"> Environment routing</label></fieldset>
<button type="submit">Save configuration</button><p id="status" role="status"></p></form></main>
<script nonce="${nonce}">const $=id=>document.getElementById(id);const status=$('status');
async function load(){const r=await fetch(location.pathname+'/config',{cache:'no-store'});if(!r.ok)throw Error('load_failed');const c=await r.json();$('realCodex').value=c.realCodex||'';$('roots').value=(c.additionalWritableRoots||[]).join('\\n');for(const k of ['reviewWorkflow','prWaiting','browserRouting','environmentRouting'])$(k).checked=c.overrides?.[k]!==false}
$('form').addEventListener('submit',async e=>{e.preventDefault();status.textContent='Saving…';const c={realCodex:$('realCodex').value.trim(),additionalWritableRoots:$('roots').value.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),overrides:{reviewWorkflow:$('reviewWorkflow').checked,prWaiting:$('prWaiting').checked,browserRouting:$('browserRouting').checked,environmentRouting:$('environmentRouting').checked}};const r=await fetch(location.pathname+'/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});const b=await r.json().catch(()=>({}));status.textContent=r.ok?'Saved. You can close this page.':(b.error||'Save failed.')});load().catch(()=>status.textContent='Could not load the current configuration.');</script></body></html>`;
}

async function initialConfig(configFile, env) {
  try {
    const raw = JSON.parse(await readFile(configFile, 'utf8'));
    return normalizeConfig(raw);
  } catch {
    return { realCodex: findCodexExecutable(env), overrides: { reviewWorkflow: true, prWaiting: true, browserRouting: true, environmentRouting: true }, additionalWritableRoots: [] };
  }
}

function requestIsLocal(request, origin, host) {
  if (request.headers.host !== host) return false;
  const requestOrigin = request.headers.origin;
  return requestOrigin === undefined || requestOrigin === origin;
}

export async function runConfigurator({ configFile, env = process.env, input = process.stdin, output = process.stdout } = {}) {
  const token = randomBytes(32).toString('hex');
  const config = await initialConfig(configFile, env);
  let saved = false;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const server = http.createServer(async (request, response) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const base = `/setup/${token}`;
    if (!requestIsLocal(request, origin, request.headers.host)) return send(response, 404, { error: 'not_found' });
    if (request.method === 'GET' && request.url === base) {
      const nonce = randomBytes(16).toString('hex');
      return send(response, 200, page(nonce), 'text/html; charset=utf-8', nonce);
    }
    if (request.method === 'GET' && request.url === `${base}/config`) return send(response, 200, config);
    if (request.method !== 'POST' || request.url !== `${base}/config`) return send(response, 404, { error: 'not_found' });
    try {
      const parsed = JSON.parse(await boundedBody(request));
      const next = await writeConfig(configFile, parsed);
      Object.assign(config, next);
      saved = true;
      send(response, 200, { ok: true });
      resolveDone();
    } catch (error) {
      send(response, error.message === 'request_too_large' ? 413 : 400,
        { error: error.message === 'request_too_large' ? 'request_too_large' : 'invalid_proxy_config' });
    }
  });
  server.requestTimeout = 15_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/setup/${token}`;
  output.write(`t3-codex-proxy: open ${url}\n`);
  const timer = setTimeout(resolveDone, SETUP_TIMEOUT_MS);
  timer.unref();
  const onSignal = () => resolveDone();
  input.once('close', onSignal);
  try { await done; } finally {
    clearTimeout(timer);
    input.off('close', onSignal);
    await new Promise(resolve => server.close(resolve));
  }
  return saved ? 0 : 1;
}
