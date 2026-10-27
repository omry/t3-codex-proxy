import { Transform } from 'node:stream';

export const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

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
    this.atStreamStart = true;
    this.skipLf = false;
    this.afterEventCr = false;
  }
  event(bytes) {
    const hasLeadingBom = this.atStreamStart && bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM);
    this.atStreamStart = false;
    const raw = (hasLeadingBom ? bytes.subarray(UTF8_BOM.length) : bytes).toString('utf8');
    const records = [];
    let offset = 0;
    for (const match of raw.matchAll(/\r\n|\r|\n/g)) {
      records.push({ line: raw.slice(offset, match.index), ending: match[0] });
      offset = match.index + match[0].length;
    }
    if (offset < raw.length) records.push({ line: raw.slice(offset), ending: '' });
    const isDataLine = line => line.startsWith('data:') || line === 'data';
    const dataRecords = records.filter(record => isDataLine(record.line));
    const data = dataRecords.map(({ line }) => line.slice(4).replace(/^: ?/, '')).join('\n');
    if (!data) return bytes;
    const updated = rewriteJsonBytes(Buffer.from(data), this.rewrite).toString('utf8');
    if (updated === data) return bytes;
    const lastDataIndex = records.findLastIndex(record => isDataLine(record.line));
    const rewritten = Buffer.from(records.map((record, index) => {
      if (!isDataLine(record.line)) return record.line + record.ending;
      if (index !== lastDataIndex) return '';
      return `data: ${updated}${record.ending}`;
    }).join(''));
    return hasLeadingBom ? Buffer.concat([UTF8_BOM, rewritten]) : rewritten;
  }
  _transform(chunk, _encoding, callback) {
    try {
      this.pending = Buffer.concat([this.pending, chunk]);
      // Treat CRLF as one line ending, even across chunks. SSE also permits
      // lone CR, lone LF and mixed line endings within the same stream.
      while (this.scan < this.pending.length) {
        const byte = this.pending[this.scan];
        if (this.afterEventCr) {
          if (byte === 10) {
            this.push(this.pending.subarray(0, 1));
            this.pending = this.pending.subarray(1);
            this.scan = 0;
            this.lineStart = 0;
            this.afterEventCr = false;
            this.skipLf = false;
            continue;
          }
          this.afterEventCr = false;
          this.skipLf = false;
        }
        if (this.skipLf) {
          if (byte === 10) {
            this.scan++;
            this.lineStart++;
            this.skipLf = false;
            continue;
          }
          this.skipLf = false;
        }
        if (byte !== 13 && byte !== 10) { this.scan++; continue; }
        const end = this.scan + 1;
        if (this.scan === this.lineStart) {
          if (this.lineStart > this.maxBytes) throw new Error('frame_too_large');
          this.push(this.event(this.pending.subarray(0, this.lineStart)));
          this.push(this.pending.subarray(this.lineStart, end));
          this.pending = this.pending.subarray(end);
          this.scan = 0;
          this.lineStart = 0;
          this.afterEventCr = byte === 13;
          this.skipLf = byte === 13;
        } else {
          this.scan = end;
          this.lineStart = end;
          this.skipLf = byte === 13;
        }
      }
      if (this.pending.length > this.maxBytes) throw new Error('frame_too_large');
      callback();
    } catch (error) { callback(error); }
  }
  _flush(callback) {
    try {
      // An unterminated SSE event is not dispatched by the protocol. Preserve it.
      if (this.pending.length) this.push(this.pending);
      callback();
    } catch (error) { callback(error); }
  }
}
