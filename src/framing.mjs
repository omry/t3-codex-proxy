import { Transform } from 'node:stream';

export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

// Preserve the exact bytes for all frames whose parsed contents do not change.
export function rewriteJsonBytes(bytes, rewrite) {
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return bytes; }
  const before = JSON.stringify(parsed);
  const after = JSON.stringify(rewrite(parsed));
  return before === after ? bytes : Buffer.from(after);
}

export class JsonLines extends Transform {
  constructor(rewrite, maxBytes = MAX_FRAME_BYTES) {
    super();
    this.rewrite = rewrite;
    this.maxBytes = maxBytes;
    this.pending = Buffer.alloc(0);
  }
  _transform(chunk, _encoding, callback) {
    try {
      this.pending = Buffer.concat([this.pending, chunk]);
      let index;
      while ((index = this.pending.indexOf(10)) !== -1) {
        if (index > this.maxBytes) throw new Error('frame_too_large');
        const frame = this.pending.subarray(0, index);
        this.push(rewriteJsonBytes(frame, this.rewrite));
        this.push(Buffer.from('\n'));
        this.pending = this.pending.subarray(index + 1);
      }
      if (this.pending.length > this.maxBytes) throw new Error('frame_too_large');
      callback();
    } catch (error) { callback(error); }
  }
  _flush(callback) {
    try {
      if (this.pending.length) this.push(rewriteJsonBytes(this.pending, this.rewrite));
      callback();
    } catch (error) { callback(error); }
  }
}

// MCP SSE events carry a JSON-RPC message in one or more data lines.
// Reassemble one event, not the whole stream. Leave ids, retry and comments intact.
export class SseRewrite extends Transform {
  constructor(rewrite, maxBytes = MAX_FRAME_BYTES) {
    super();
    this.rewrite = rewrite;
    this.maxBytes = maxBytes;
    this.pending = Buffer.alloc(0);
    this.scan = 0;
    this.lineStart = 0;
  }
  event(bytes) {
    const raw = bytes.toString('utf8');
    const lines = raw.split(/\r\n|\r|\n/);
    const data = lines.filter(line => line.startsWith('data:') || line === 'data')
      .map(line => line.slice(4).replace(/^: ?/, '')).join('\n');
    if (!data) return bytes;
    const updated = rewriteJsonBytes(Buffer.from(data), this.rewrite).toString('utf8');
    if (updated === data) return bytes;
    let emitted = false;
    const eol = raw.includes('\r\n') ? '\r\n' : raw.includes('\r') ? '\r' : '\n';
    return Buffer.from(lines.flatMap(line => {
      if (!line.startsWith('data:') && line !== 'data') return [line];
      if (emitted) return [];
      emitted = true;
      return [`data: ${updated}`];
    }).join(eol));
  }
  _transform(chunk, _encoding, callback) {
    try {
      this.pending = Buffer.concat([this.pending, chunk]);
      // Treat CRLF as one line ending, even across chunks. SSE also permits
      // lone CR, lone LF and mixed line endings within the same stream.
      while (this.scan < this.pending.length) {
        const byte = this.pending[this.scan];
        if (byte !== 13 && byte !== 10) { this.scan++; continue; }
        if (byte === 13 && this.scan + 1 === this.pending.length) break;
        const end = this.scan + (byte === 13 && this.pending[this.scan + 1] === 10 ? 2 : 1);
        if (this.scan === this.lineStart) {
          this.push(this.event(this.pending.subarray(0, this.lineStart)));
          this.push(this.pending.subarray(this.lineStart, end));
          this.pending = this.pending.subarray(end);
          this.scan = 0;
          this.lineStart = 0;
        } else {
          this.scan = end;
          this.lineStart = end;
        }
      }
      if (this.pending.length > this.maxBytes) throw new Error('frame_too_large');
      callback();
    } catch (error) { callback(error); }
  }
  _flush(callback) {
    // An unterminated SSE event is not dispatched by the protocol. Preserve it.
    if (this.pending.length) this.push(this.pending);
    callback();
  }
}
