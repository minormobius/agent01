// Streaming RFC-4180 CSV reader: quoted fields, doubled quotes, newlines inside quotes,
// CRLF, and a UTF-8 BOM. No dependencies. Yields arrays of strings. A path ending .gz is
// gunzipped on the fly.
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

export async function* readCsv(path) {
  let field = '', row = [], inQ = false, pendingQuote = false, first = true;
  const src = path.endsWith('.gz')
    ? createReadStream(path, { highWaterMark: 1 << 20 }).pipe(createGunzip()).setEncoding('utf8')
    : createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 });
  for await (let chunk of src) {
    if (first) { if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1); first = false; }
    const rows = [];
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (pendingQuote) {           // previous char was a quote inside a quoted field
        pendingQuote = false;
        if (c === 34) { field += '"'; start = i + 1; continue; } // "" -> "
        inQ = false;                 // it was the closing quote; fall through
      }
      if (inQ) {
        if (c === 34) { field += chunk.slice(start, i); pendingQuote = true; start = i + 1; }
        continue;
      }
      if (c === 34) { field += chunk.slice(start, i); inQ = true; start = i + 1; }
      else if (c === 44) { row.push(field + chunk.slice(start, i)); field = ''; start = i + 1; }
      else if (c === 10) {
        let end = i; if (end > start && chunk.charCodeAt(end - 1) === 13) end--;
        row.push(field + chunk.slice(start, end)); field = ''; start = i + 1;
        rows.push(row); row = [];
      }
    }
    field += chunk.slice(start);
    if (field.endsWith('\r') && !inQ) field = field.slice(0, -1);
    yield* rows;
  }
  if (field !== '' || row.length) { row.push(field); yield row; }
}
