import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { MAX_FRAME_BYTES, SseRewrite, rewriteJsonBytes } from './framing.mjs';
import { rewriteToolsList } from './policy.mjs';

function endError(response, status, code) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error: code }));
}

function headersWithoutHopByHop(headers) {
  const copy = { ...headers };
  const excluded = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', ...(String(headers.connection ?? '').split(',').map(x => x.trim().toLowerCase()))];
  for (const name of excluded) delete copy[name];
  return copy;
}

async function readBounded(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_FRAME_BYTES) throw new Error('frame_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function startMcpProxy({ report = () => {} } = {}) {
  const routes = new Map();
  const byUpstream = new Map();
  const upstreamRequests = new Set();
  const sockets = new Set();
  // Track tools/list response IDs per route, credential and MCP session. A result
  // may arrive on a GET event stream instead of its originating POST stream.
  const pendingLists = new Set();
  const sessionKey = (route, auth, session) => JSON.stringify([route, auth ?? null, session ?? null]);
  const listKey = (session, id) => JSON.stringify([session, id]);

  const server = http.createServer(async (request, response) => {
    const route = routes.get(request.url);
    if (!route || request.headers.origin) return endError(response, 404, 'unknown_route');
    if (!['POST', 'GET', 'DELETE'].includes(request.method)) return endError(response, 405, 'unsupported_method');
    let upstream;
    let requestKey;
    const session = sessionKey(request.url, request.headers.authorization, request.headers['mcp-session-id']);
    const abort = () => upstream?.destroy();
    response.on('close', abort);
    try {
      const body = await readBounded(request);
      let parsed;
      try { parsed = JSON.parse(body.toString('utf8')); } catch { /* Forward opaque bodies. */ }
      if (request.method === 'POST' && parsed?.method === 'tools/list' &&
          (typeof parsed.id === 'string' || typeof parsed.id === 'number')) {
        if (pendingLists.size >= 4096) return endError(response, 503, 'too_many_pending_lists');
        requestKey = listKey(session, parsed.id);
        pendingLists.add(requestKey);
      }
      const rewrite = message => {
        if (!message || typeof message !== 'object' || message.method || !Object.hasOwn(message, 'id')) return message;
        const key = listKey(session, message.id);
        // A POST response belongs to this request even when another stateless
        // connection reused its ID and already consumed the shared GET lookup.
        // Only GET streams need the cross-request pending-list registry.
        if (request.method === 'POST') {
          if (requestKey === undefined || message.id !== parsed.id) return message;
        } else if (!pendingLists.has(key)) return message;
        pendingLists.delete(key);
        return rewriteToolsList(message, report);
      };
      const headers = headersWithoutHopByHop(request.headers);
      headers.host = route.host;
      // No decompression/recompression: ask the loopback upstream for identity.
      headers['accept-encoding'] = 'identity';
      if (headers['content-length'] !== undefined) headers['content-length'] = String(body.length);
      upstream = (route.protocol === 'https:' ? https : http).request(route, {
        method: request.method, headers,
      });
      upstreamRequests.add(upstream);
      upstream.once('close', () => upstreamRequests.delete(upstream));
      const received = new Promise((resolve, reject) => {
        upstream.once('response', resolve);
        upstream.once('error', reject);
      });
      upstream.end(body);
      const incoming = await received;
      if (requestKey && incoming.statusCode >= 400) pendingLists.delete(requestKey);
      const outputHeaders = headersWithoutHopByHop(incoming.headers);
      const contentType = String(incoming.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const inspect = requestKey !== undefined || request.method === 'GET';
      if (inspect && incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') {
        incoming.destroy();
        throw new Error('unsupported_metadata_encoding');
      }
      if (inspect && contentType === 'application/json') {
        const raw = await readBounded(incoming);
        const updated = rewriteJsonBytes(raw, rewrite);
        if (!raw.equals(updated)) {
          delete outputHeaders['content-length'];
          delete outputHeaders.etag;
          delete outputHeaders['content-md5'];
          delete outputHeaders.digest;
        }
        response.writeHead(incoming.statusCode, outputHeaders);
        response.end(updated);
      } else if (inspect && contentType === 'text/event-stream') {
        delete outputHeaders['content-length'];
        delete outputHeaders.etag;
        delete outputHeaders['content-md5'];
        delete outputHeaders.digest;
        response.writeHead(incoming.statusCode, outputHeaders);
        response.flushHeaders();
        await pipeline(incoming, new SseRewrite(rewrite), response);
      } else {
        if (requestKey && incoming.statusCode < 400 && incoming.statusCode !== 202) report('unrecognized_metadata_transport');
        response.writeHead(incoming.statusCode, outputHeaders);
        await pipeline(incoming, response);
      }
      if (request.method === 'DELETE' && incoming.statusCode < 300) {
        for (const key of pendingLists) if (JSON.parse(key)[0] === session) pendingLists.delete(key);
      }
    } catch (error) {
      if (requestKey) pendingLists.delete(requestKey);
      upstream?.destroy();
      report('mcp_forward_failed');
      endError(response, error.message === 'frame_too_large' ? 413 : 502, 'mcp_forward_failed');
    }
  });
  server.requestTimeout = 0; // T3 tools can wait for an hour; no proxy deadline.
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    register(endpoint) {
      if (byUpstream.has(endpoint)) return byUpstream.get(endpoint);
      let url;
      try { url = new URL(endpoint); } catch { throw new Error('invalid_mcp_endpoint'); }
      if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
          url.username || url.password || url.hash) throw new Error('unsupported_mcp_endpoint');
      // Persisted local URLs belong to a previous wrapper process. Never proxy
      // back to them: T3 must supply a fresh original endpoint on resume/fork.
      if (/^\/t3-codex-proxy\//.test(url.pathname)) throw new Error('stale_proxy_endpoint');
      const path = `/t3-codex-proxy/${randomBytes(24).toString('hex')}/mcp`;
      routes.set(path, url);
      const local = origin + path;
      byUpstream.set(endpoint, local);
      report('mcp_endpoint_redirected');
      return local;
    },
    async close() {
      for (const request of upstreamRequests) request.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
      pendingLists.clear();
    },
  };
}
