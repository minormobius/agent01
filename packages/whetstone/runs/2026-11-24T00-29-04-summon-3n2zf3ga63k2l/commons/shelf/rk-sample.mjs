// rk-sample.mjs (Morphyx, 2026-10-07). CHOICE research piece 1: the fetch half.
// Seeded, stratified sample of DIDs by creation month from plc.directory, archived as compact
// extracts plus sha256 of every raw byte fetched. The figure is computed by rk-figure.mjs, net off.
// usage: node shelf/rk-sample.mjs <outdir> [perStart=50] [starts=4] [seed=20261007]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const [out = 'research/rotation-keys', PER = '50', STARTS = '4', SEED = '20261007'] = process.argv.slice(2);
const per = +PER, starts = +STARTS;
mkdirSync(out, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex');

// mulberry32, so the start times can be re-drawn exactly
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(+SEED);

async function get(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      const body = await r.text();
      if (r.status === 429 || r.status >= 500) { await new Promise((z) => setTimeout(z, 2000 * (i + 1))); continue; }
      return { status: r.status, body, at: new Date().toISOString() };
    } catch { await new Promise((z) => setTimeout(z, 2000 * (i + 1))); }
  }
  return { status: 0, body: '', at: new Date().toISOString() };
}

const months = [];
for (let y = 2022, m = 11; y < 2026 || (y === 2026 && m <= 9); m === 12 ? (y++, m = 1) : m++) months.push([y, m]);

const manifest = [];
const sampledKeys = new Set(); // every fetch: url, time, status, sha256, bytes
const keyDids = new Map(); // rotation key -> Set of DIDs seen holding it in any op of any export page
const note = (k, did) => { if (!keyDids.has(k)) keyDids.set(k, new Set()); keyDids.get(k).add(did); };
const keysOf = (op) => op.type === 'create' ? [op.recoveryKey, op.signingKey].filter(Boolean) : (op.rotationKeys || []);

for (const [y, m] of months) {
  const t0 = Date.UTC(y, m - 1, 1), t1 = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
  const label = `${y}-${String(m).padStart(2, '0')}`;
  const picks = [];
  const seen = new Set();
  const draws = Array.from({ length: starts }, () => new Date(t0 + Math.floor(rand() * (t1 - t0))).toISOString()).sort();
  for (const after of draws) {
    const url = `https://plc.directory/export?count=1000&after=${after}`;
    const r = await get(url);
    manifest.push({ url, at: r.at, status: r.status, sha256: sha(r.body), bytes: Buffer.byteLength(r.body) });
    let got = 0;
    for (const line of r.body.split('\n')) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      for (const k of keysOf(e.operation)) note(k, e.did);
      if (got < per && e.operation.prev === null && !seen.has(e.did) && e.createdAt < new Date(t1).toISOString()) {
        seen.add(e.did); picks.push({ did: e.did, created: e.createdAt, start: after }); got++;
      }
    }
  }
  // the audit log of each pick: its whole history, so current state and any later key changes
  const rows = [];
  for (let i = 0; i < picks.length; i += 10) {
    const batch = picks.slice(i, i + 10);
    const res = await Promise.all(batch.map((p) => get(`https://plc.directory/${p.did}/log/audit`)));
    res.forEach((r, j) => {
      const p = batch[j];
      const prov = { fetched: r.at, sha256: sha(r.body), bytes: Buffer.byteLength(r.body) }; // audit-log provenance lives in the row
      if (r.status !== 200) { rows.push({ ...p, status: r.status, ...prov }); return; }
      const log = JSON.parse(r.body);
      const live = log.filter((e) => !e.nullified);
      for (const e of log) for (const k of keysOf(e.operation)) note(k, e.did);
      const last = live[live.length - 1].operation;
      rows.push({
        ...p, status: 200, ops: log.length, nullified: log.length - live.length,
        tombstone: last.type === 'plc_tombstone',
        genesisKeys: keysOf(log[0].operation),
        keys: last.type === 'plc_tombstone' ? [] : keysOf(last),
        endpoint: last.type === 'create' ? last.service : last.services?.atproto_pds?.endpoint ?? null,
        keyChanges: live.slice(1).filter((e, i) => JSON.stringify(keysOf(e.operation)) !== JSON.stringify(keysOf(live[i].operation))).map((e) => e.createdAt),
        ...prov,
      });
    });
  }
  for (const r of rows) for (const k of [...(r.keys || []), ...(r.genesisKeys || [])]) sampledKeys.add(k);
  writeFileSync(`${out}/sample-${label}.json`, JSON.stringify(rows));
  console.error(label, picks.length, 'picks');
}
writeFileSync(`${out}/manifest.jsonl`, manifest.map((x) => JSON.stringify(x)).join('\n') + '\n');
// only the keys our sampled DIDs hold (a full map is megabytes); each with how many distinct DIDs held it
const counts = {}; for (const k of sampledKeys) counts[k] = keyDids.get(k)?.size ?? 0;
writeFileSync(`${out}/key-dids.json`, JSON.stringify(counts));
console.error('fetches', manifest.length, 'keys', keyDids.size);
