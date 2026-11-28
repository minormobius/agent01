// morphyx-listing.mjs: who listed each ask, how late, and is the witness's discretion bounded?
// Council 10-18, item 1. No dependencies. `node proposals/morphyx-listing.mjs` runs the cases.
//
// The witness has one lever the dice don't take away: leaving an ask out. Auditing that
// (Modulo's late-listing flag) tells you it happened; it doesn't undo it. This adds a second
// door: a snapshot counts if written by root.witness.did OR root.gm. An ask the witness
// omits can be listed by the GM, and its round counts from that snapshot. The witness can
// delay a rival's roll, never deny it, and the delay is published next to its own seat's.
//
// listings(root, prompt, asks, snaps, tick) -> one row per counted ask:
//   { uri, did, listedBy: 'witness'|'gm'|null, gap (s), flags: [...] }
// asks:  [{ uri, did, sheet, indexedAt }]       (already filtered to this prompt)
// snaps: [{ did, indexedAt, asks: [uri...] }]

const t = s => Date.parse(s) / 1000;

export function listings(root, asks, snaps, tick, now) {
  const counted = snaps.filter(s => s.did === root.witness.did || s.did === root.gm)
                       .sort((a, b) => t(a.indexedAt) - t(b.indexedAt));
  const seats = new Set((root.seats ?? []).map(s => s.did));
  const firstPerSheet = new Map();
  for (const a of [...asks].sort((x, y) => t(x.indexedAt) - t(y.indexedAt)))
    if (!firstPerSheet.has(a.sheet)) firstPerSheet.set(a.sheet, a);
  const rows = [];
  for (const a of firstPerSheet.values()) {
    const flags = [];
    if (seats.has(a.did)) flags.push('house-seat');
    if (a.did === root.witness.did || a.did === root.gm) flags.push('seat-conflict');
    const s = counted.find(s => s.asks.includes(a.uri) && t(s.indexedAt) >= t(a.indexedAt));
    if (!s) {
      const wait = now - t(a.indexedAt);
      if (wait > tick + root.dice.marginSeconds) flags.push('unlisted');
      rows.push({ uri: a.uri, did: a.did, listedBy: null, gap: null, flags });
      continue;
    }
    const gap = t(s.indexedAt) - t(a.indexedAt);
    const listedBy = s.did === root.witness.did ? 'witness' : 'gm';
    if (gap > tick + root.dice.marginSeconds) flags.push('late-listing');
    if (listedBy === 'gm') flags.push('witness-skipped');
    rows.push({ uri: a.uri, did: a.did, listedBy, gap, flags });
  }
  return rows;
}

// --- cases ---------------------------------------------------------------------------------
const root = { gm: 'did:gm', witness: { did: 'did:works' }, dice: { marginSeconds: 60 },
               seats: [{ did: 'did:mozzie' }] };
const T = s => new Date(Date.UTC(2026, 9, 18, 12, 0, s)).toISOString();
const asks = [
  { uri: 'a1', did: 'did:nora',   sheet: 'n', indexedAt: T(0) },
  { uri: 'a2', did: 'did:mozzie', sheet: 'm', indexedAt: T(10) },
  { uri: 'a3', did: 'did:lucy',   sheet: 'l', indexedAt: T(20) },
  { uri: 'a4', did: 'did:lucy',   sheet: 'l', indexedAt: T(30) },   // second ask, same sheet
];
const now = t(T(0)) + 3600;
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) fails++; };

// 1. honest witness: all listed at the next tick
{
  const r = listings(root, asks, [{ did: 'did:works', indexedAt: T(300), asks: ['a1', 'a2', 'a3'] }], 300, now);
  check('honest: three rows, second ask per sheet dropped', r.length === 3);
  check('honest: no late or unlisted flags', r.every(x => !x.flags.some(f => f === 'late-listing' || f === 'unlisted')));
  check('honest: house seat tagged', r.find(x => x.did === 'did:mozzie').flags.includes('house-seat'));
}
// 2. censoring witness: leaves Lucy out; without the GM door she never rolls
{
  const s = [{ did: 'did:works', indexedAt: T(300), asks: ['a1', 'a2'] },
             { did: 'did:works', indexedAt: T(600), asks: [] }];
  const r = listings(root, asks, s, 300, now);
  check('censored: Lucy flagged unlisted', r.find(x => x.did === 'did:lucy').flags.includes('unlisted'));
}
// 3. second door: GM lists her; she rolls, late, and the record says who skipped her
{
  const s = [{ did: 'did:works', indexedAt: T(300), asks: ['a1', 'a2'] },
             { did: 'did:gm', indexedAt: T(900), asks: ['a3'] }];
  const l = listings(root, asks, s, 300, now).find(x => x.did === 'did:lucy');
  check('gm door: Lucy listed by gm', l.listedBy === 'gm');
  check('gm door: flagged late-listing and witness-skipped', l.flags.includes('late-listing') && l.flags.includes('witness-skipped'));
}
// 4. a third party's snapshot is ignored
{
  const r = listings(root, asks, [{ did: 'did:stranger', indexedAt: T(5), asks: ['a1', 'a2', 'a3'] }], 300, now);
  check('stranger snapshot: nothing counts as listed', r.every(x => x.listedBy === null));
}
// 5. the witness account holding a seat is reported
{
  const r = listings({ ...root, seats: [{ did: 'did:works' }] },
    [{ uri: 'w1', did: 'did:works', sheet: 'w', indexedAt: T(0) }], [], 300, now);
  check('witness with a seat: seat-conflict', r[0].flags.includes('seat-conflict'));
}
console.log(fails ? `${fails} failed` : 'all cases pass');
process.exitCode = fails ? 1 : 0;
