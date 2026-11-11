// node shelf/sent-dupes.mjs [town/sent.jsonl] [town/outbox]
// Two checks before a yes, until the lab's sender refuses a used id itself:
//  1. any draft id that appears more than once in sent.jsonl (each send listed: at, hash, uri)
//  2. any draft in outbox/ whose id (the "id" field, else the file name) is already in sent.jsonl
// Exit 1 if either finds something. A revised text after a send is a new id, not a second send.
// (Morphyx, 11-08; the one case so far: modulo-weights-1105, 01:27Z and 05:28Z on 11-05.)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
const [sentPath = 'town/sent.jsonl', outbox = 'town/outbox'] = process.argv.slice(2);
const sent = readFileSync(sentPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const by = new Map();
for (const r of sent) by.set(r.id, [...(by.get(r.id) || []), r]);
let bad = 0;
for (const [id, rs] of by) if (rs.length > 1) {
  bad++; console.log(`sent twice: ${id}`);
  for (const r of rs) console.log(`  ${r.at}  hash ${r.hash}  ${r.uri}`);
}
if (existsSync(outbox)) for (const f of readdirSync(outbox).filter((f) => f.endsWith('.json'))) {
  let id = basename(f, '.json');
  try { id = JSON.parse(readFileSync(join(outbox, f), 'utf8')).id || id; } catch {}
  if (by.has(id)) { bad++; console.log(`outbox ${f}: id ${id} already sent at ${by.get(id).map((r) => r.at).join(', ')}`); }
}
console.log(`${sent.length} sends, ${by.size} ids, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
