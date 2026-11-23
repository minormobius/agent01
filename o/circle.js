// o/circle.js — the ranking and the rings. Pure: no DOM, no network, so the
// selftest can hold it to known answers.
//
// An EVENT is one interaction between the centre and someone else:
//   { did, kind: 'like'|'repost'|'reply'|'quote', dir: 'out'|'in', t: ms }
// out = the centre did it to them (read from the centre's own repo);
// in  = they did it to the centre's posts (read from the AppView).
//
// The default is the plain count the circle promises: total interactions, both
// directions, every kind worth 1. Weights and direction are there for the
// people who open "tune"; nobody else should have to think about them.

export const KINDS = ['like', 'repost', 'reply', 'quote'];
// URL keys for the weights: repost and reply share a first letter, so spell them out
const WKEY = { like: 'wl', repost: 'wp', reply: 'wr', quote: 'wq' };
export const DEFAULTS = Object.freeze({
  days: 20,
  dir: 'both',                       // 'both' | 'in' | 'out'
  weights: { like: 1, repost: 1, reply: 1, quote: 1 },
  inner: 8, outer: 16, third: 0,   // third ring: off unless asked for
});

/**
 * Rank everyone the centre interacted with.
 * @returns [{ did, score, total, in: {like,…}, out: {like,…} }] best first
 */
export function rank(events, centre, { days = DEFAULTS.days, dir = DEFAULTS.dir, weights = DEFAULTS.weights, now = Date.now() } = {}) {
  const since = now - days * 86400000;
  const rows = new Map();
  for (const e of events) {
    if (!e.did || e.did === centre) continue;
    if (e.t && e.t < since) continue;
    if (dir !== 'both' && e.dir !== dir) continue;
    if (!KINDS.includes(e.kind)) continue;
    let r = rows.get(e.did);
    if (!r) {
      r = { did: e.did, score: 0, total: 0, in: zero(), out: zero() };
      rows.set(e.did, r);
    }
    r[e.dir === 'in' ? 'in' : 'out'][e.kind]++;
    r.total++;
    r.score += weights[e.kind] ?? 1;
  }
  return [...rows.values()].sort((a, b) =>
    b.score - a.score
    || conversation(b) - conversation(a)          // ties: who actually talked
    || both(b) - both(a)                          // then: two-way beats one-way
    || (a.did < b.did ? -1 : a.did > b.did ? 1 : 0));
}
const zero = () => ({ like: 0, repost: 0, reply: 0, quote: 0 });
const conversation = (r) => r.in.reply + r.out.reply + r.in.quote + r.out.quote;
const both = (r) => (sum(r.in) > 0 && sum(r.out) > 0 ? 1 : 0);
export const sum = (o) => o.like + o.repost + o.reply + o.quote;

/**
 * Where everything sits on a square canvas of side `S`.
 * Centre avatar, then two rings (three if `third` > 0); rank 1 at twelve
 * o'clock, clockwise. Sizes are chosen so no avatar overlaps another, within a
 * ring or across rings (selftest asserts it).
 */
export function rings(S, inner = DEFAULTS.inner, outer = DEFAULTS.outer, third = DEFAULTS.third) {
  const c = S / 2;
  // three rings pull everything in to make room; two keep the roomier layout
  const L = third > 0
    ? { centre: 0.10, r: [0.205, 0.32, 0.435], cap: [0.060, 0.044, 0.034] }
    : { centre: 0.13, r: [0.255, 0.405, 0], cap: [0.075, 0.052, 0] };
  const centreR = S * L.centre;
  const [r1, r2, r3] = L.r.map((v) => S * v);
  // the largest avatar that fits n around a ring, with a gap, capped for looks
  const fit = (R, n, cap) => Math.min(cap, R * Math.sin(Math.PI / Math.max(n, 2)) * 0.86);
  const a1 = fit(r1, inner, S * L.cap[0]), a2 = fit(r2, outer, S * L.cap[1]), a3 = third > 0 ? fit(r3, third, S * L.cap[2]) : 0;
  const place = (R, n, r, offset) => Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + offset + (i / n) * Math.PI * 2;
    return { x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, r };
  });
  return {
    centre: { x: c, y: c, r: centreR },
    inner: place(r1, inner, a1, 0),
    // the outer ring is turned half a step so its seats sit in the inner ring's gaps
    outer: place(r2, outer, a2, Math.PI / Math.max(outer, 1)),
    third: third > 0 ? place(r3, third, a3, 0) : [],
    guides: third > 0 ? [r1, r2, r3] : [r1, r2],
  };
}

/** Settings ⇄ URL query. Only what differs from the defaults is written. */
export function toQuery(o) {
  const q = new URLSearchParams();
  if (o.days !== DEFAULTS.days) q.set('d', o.days);
  if (o.dir !== DEFAULTS.dir) q.set('dir', o.dir);
  for (const k of KINDS) if ((o.weights[k] ?? 1) !== DEFAULTS.weights[k]) q.set(WKEY[k], o.weights[k]);
  if (o.inner !== DEFAULTS.inner) q.set('i', o.inner);
  if (o.outer !== DEFAULTS.outer) q.set('o', o.outer);
  if ((o.third || 0) !== DEFAULTS.third) q.set('t', o.third);
  return q.toString();
}
export function fromQuery(qs) {
  const q = new URLSearchParams(qs);
  const num = (k, lo, hi, d) => { const v = Number(q.get(k)); return Number.isFinite(v) && q.has(k) ? Math.max(lo, Math.min(hi, v)) : d; };
  const w = {};
  for (const k of KINDS) w[k] = num(WKEY[k], 0, 10, DEFAULTS.weights[k]);
  return {
    days: Math.round(num('d', 1, 90, DEFAULTS.days)),
    dir: ['both', 'in', 'out'].includes(q.get('dir')) ? q.get('dir') : DEFAULTS.dir,
    weights: w,
    inner: Math.round(num('i', 3, 12, DEFAULTS.inner)),
    outer: Math.round(num('o', 0, 24, DEFAULTS.outer)),
    third: Math.round(num('t', 0, 32, DEFAULTS.third)),
  };
}

/** A handle or DID out of whatever was typed or pasted (incl. bsky.app links and o.mino.mobi/<handle>). */
export function cleanActor(s) {
  let a = String(s || '').trim();
  a = a.replace(/^https?:\/\/[^/]+\/(profile\/)?/, '').replace(/^@/, '').split(/[/?#\s]/)[0];
  return a.toLowerCase().startsWith('did:') ? a : a.toLowerCase();
}

/** `at://did:plc:x/coll/rkey` → `did:plc:x`. */
export const authorOf = (uri) => (typeof uri === 'string' && uri.startsWith('at://') ? uri.slice(5).split('/')[0] : null);
