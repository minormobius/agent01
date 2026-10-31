// gangs-sheet-fuzz.mjs: Lucy's test (3my4tn4ls2v2s): make the checker try to break itself.
// Random mutations of a valid sheet go to check.js and to an independent oracle written from the
// lexicon (research/gangs/lexicons/com.minomobi.gangs.sheet.json) plus the root's rules. Every
// disagreement is printed by class. "pass-but-illegal" is the hole Lucy asked about.
// Usage: node shelf/gangs-sheet-fuzz.mjs [n=20000] [seed=1]     (Modulo, 2026-10-18)
import { reportSheet, DEFAULT_RULES, parseTime } from '../www/gangs/sheet/check.js';

const N = +(process.argv[2] ?? 20000); let s = +(process.argv[3] ?? 1) >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = a => a[Math.floor(rnd() * a.length)];
const root = { uri: 'at://did:plc:x/com.minomobi.gangs.game/1', cid: 'bafyroot' };

// ---- oracle: lexicon + rules, written without looking at check.js's branches ----
const bytes = x => Buffer.byteLength(x, 'utf8');
const gr = x => [...new Intl.Segmenter().segment(x)].length;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DID = /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;           // a name you could read off a screen
// 10-19 evening (Modulo): the oracle's clock no longer touches Date at all. Integer calendar
// (Hinnant's days_from_civil), so it can't share a Date.parse or setUTC* quirk with check.js.
// Returns ms since epoch as a Number, or NaN. Leap seconds (:60) and 24:00 are refused, as atproto does.
function oTime(x) {
  if (typeof x !== 'string') return NaN;
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d)$/.exec(x);
  if (!m) return NaN;
  const [Y, Mo, D, h, mi, se] = m.slice(1, 7).map(v => parseInt(v, 10));
  const leap = Y % 400 === 0 || (Y % 100 !== 0 && Y % 4 === 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Mo - 1];
  if (!dim || D < 1 || D > dim || h > 23 || mi > 59 || se > 59) return NaN;
  let off = 0;
  if (m[8] !== 'Z') { const oh = +m[8].slice(1, 3), om = +m[8].slice(4); if (oh > 23 || om > 59) return NaN;
    off = (m[8][0] === '-' ? -1 : 1) * (oh * 60 + om); }
  const y = Mo <= 2 ? Y - 1 : Y, era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (Mo + (Mo > 2 ? -3 : 9)) + 2) / 5) + D - 1;
  const days = era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  const ms = m[7] ? +(m[7].slice(1, 4).padEnd(3, '0')) : 0;
  return ((days * 24 + h) * 60 + mi - off) * 60000 + se * 1000 + ms;
}
function oracle(r) {
  const why = [];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['not object'];
  if (r.$type !== 'com.minomobi.gangs.sheet') why.push('$type');
  if (!r.game || r.game.uri !== root.uri || r.game.cid !== root.cid) why.push('game');
  for (const [k, gmax, bmax] of [['name', 64, 640], ['playbook', 64, 640], ['look', 300, 3000], ['drive', 300, 3000]]) {
    const v = r[k];
    if (typeof v !== 'string' || !VISIBLE.test(v)) why.push(`${k}:empty/invisible`);
    else { if (gr(v) > gmax) why.push(`${k}:graphemes`); if (bytes(v) > bmax) why.push(`${k}:bytes`); }
  }
  if (!['human', 'agent'].includes(r.controller)) why.push('controller');
  if ('operator' in r && !(typeof r.operator === 'string' && DID.test(r.operator))) why.push('operator:did');
  const a = r.actions;
  if (!Array.isArray(a) || a.length < 1 || a.length > 24) why.push('actions:shape');
  else {
    let sum = 0; const seen = new Set();
    for (const d of a) {
      if (!d || typeof d !== 'object' || typeof d.action !== 'string' || !Number.isInteger(d.dots)) { why.push('dot:shape'); continue; }
      if (bytes(d.action) > 32) why.push('dot:actionLen');
      if (!DEFAULT_RULES.actions.includes(d.action)) why.push('dot:unknown');
      if (seen.has(d.action)) why.push('dot:dup'); seen.add(d.action);
      if (d.dots < 0 || d.dots > DEFAULT_RULES.dotsMax) why.push('dot:range');
      sum += d.dots;
    }
    if (sum !== DEFAULT_RULES.dotsTotal) why.push('dots:total');
  }
  if (typeof r.createdAt !== 'string' || !RFC3339.test(r.createdAt) || isNaN(oTime(r.createdAt))) why.push('createdAt:format');
  return why;
}

// ---- mutations ----
const base = () => ({ $type: 'com.minomobi.gangs.sheet', game: { ...root }, name: 'Wren', playbook: 'Lurk',
  look: 'oilskin coat', drive: 'the ledger', controller: 'agent', operator: 'did:plc:abc123',
  actions: [{ action: 'prowl', dots: 2 }, { action: 'finesse', dots: 2 }, { action: 'survey', dots: 1 }, { action: 'study', dots: 1 }, { action: 'sway', dots: 1 }],
  createdAt: '2026-10-18T05:00:00Z' });
const STR = ['', ' ', '​', 'ㅤ', '⠀', '­', '﻿', '‮', 'é', 'x', 'Z' + '́'.repeat(400),
  '🫖', '👨‍👩‍👧‍👦', '\n', '\t\t', null, 7, ['x'], { a: 1 }];
const DATES = ['1', '2026', 'Oct 18 2026', '2026-10-18', '2026-10-18 05:00', '2026-10-18T05:00:00', '2026-13-40T99:00:00Z',
  '0000-01-01T00:00:00Z', '9999-12-31T23:59:59Z', '2026-10-18T05:00:00+05:00', 'tomorrow', 12345,
  '2026-02-29T00:00:00Z', '2024-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '2000-02-29T00:00:00Z', '2026-02-30T00:00:00Z',
  '2026-04-31T00:00:00Z', '2026-10-18T24:00:00Z', '2016-12-31T23:59:60Z', '2026-10-18T05:00:00+24:00', '2026-10-18T05:00:00-00:00',
  '2026-10-18t05:00:00z', '2026-10-18T05:00:00.123456789Z', '2026-10-18T05:00:00.Z', '0099-01-01T00:00:00Z', '2026-00-10T00:00:00Z'];
const DIDS = ['did:', 'did:x', 'did:plc:', 'did:plc:abc', 'didn\'t', 'did:web:example.com', 'did:plc:a b', 'DID:plc:abc'];
const M = {
  str(r) { const k = pick(['name', 'playbook', 'look', 'drive']); const v = pick(STR);
    r[k] = typeof v === 'string' && rnd() < 0.3 ? v.repeat(1 + Math.floor(rnd() * 400)) : v; },
  zalgo(r) { const k = pick(['name', 'look']); r[k] = Array.from({ length: k === 'name' ? 60 : 290 }, () => 'a' + '́'.repeat(1 + Math.floor(rnd() * 20))).join(''); },
  date(r) { r.createdAt = pick(DATES); },
  did(r) { r.operator = pick(DIDS); },
  controller(r) { r.controller = pick(['Agent', 'AGENT', 'bot', 'human ', '', null, 'agent']); },
  dots(r) { const d = pick(r.actions); d.dots = pick([0, 1, 2, 3, -1, -0, 1.5, '2', null, 1e21, NaN]); },
  rename(r) { pick(r.actions).action = pick(['wreck', 'hunt', 'Prowl', 'prowl ', 'constructor', '__proto__', 'x'.repeat(40), '', 7]); },
  dup(r) { r.actions.push({ ...pick(r.actions) }); },
  zeros(r) { for (const a of DEFAULT_RULES.actions) if (!r.actions.some(d => d.action === a)) r.actions.push({ action: a, dots: 0 }); if (rnd() < 0.5) r.actions.push({ action: 'hunt', dots: 0 }); },
  extra(r) { r[pick(['stress', 'xp', '__proto__', 'constructor', 'toString'])] = 1; },
  drop(r) { delete r[pick(Object.keys(r))]; },
  game(r) { r.game = pick([{ uri: root.uri }, { uri: root.uri, cid: 'other' }, 'at://x', null, { ...root, extra: 1 }]); },
};
const kinds = Object.keys(M);

const tally = {}; const ex = {};
for (let i = 0; i < N; i++) {
  const r = base(); const used = [];
  for (let k = 0, m = 1 + Math.floor(rnd() * 2); k < m; k++) { const kind = pick(kinds); used.push(kind); try { M[kind](r); } catch {} }
  const rec = JSON.parse(JSON.stringify(r));        // what a PDS would actually hold
  const passes = reportSheet(rec, root).bad.length === 0;
  const why = oracle(rec);
  if (passes === (why.length === 0)) continue;
  const cls = passes ? `pass-but-illegal: ${why.join('+')}` : `fail-but-legal: ${reportSheet(rec, root).bad.join(' | ')}`;
  tally[cls] = (tally[cls] ?? 0) + 1;
  ex[cls] ??= JSON.stringify(rec).slice(0, 220);
}
console.log(`${N} random sheets, seed ${process.argv[3] ?? 1}`);
const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
for (const [c, n] of rows) console.log(String(n).padStart(6), c, '\n       e.g.', ex[c]);
console.log(rows.length ? `${rows.reduce((t, r) => t + r[1], 0)} disagreements in ${rows.length} classes` : 'no disagreements');

// ---- second desk: the instant itself, not just yes/no. pickSheets orders by parseTime, so a
// wrong millisecond is a wrong seat. Random valid stamps across 0000–9999, all offsets.
const p2 = n => String(n).padStart(2, '0');
let tBad = 0, tEx = '';
for (let i = 0; i < N; i++) {
  const Y = Math.floor(rnd() * 10000), Mo = 1 + Math.floor(rnd() * 12), D = 1 + Math.floor(rnd() * 31);
  const off = rnd() < 0.3 ? 'Z' : `${rnd() < 0.5 ? '+' : '-'}${p2(Math.floor(rnd() * 24))}:${p2(Math.floor(rnd() * 60))}`;
  const frac = rnd() < 0.5 ? '' : '.' + String(Math.floor(rnd() * 1e9)).padStart(9, '0').slice(0, 1 + Math.floor(rnd() * 9));
  const x = `${String(Y).padStart(4, '0')}-${p2(Mo)}-${p2(D)}T${p2(Math.floor(rnd() * 24))}:${p2(Math.floor(rnd() * 60))}:${p2(Math.floor(rnd() * 60))}${frac}${off}`;
  const a = parseTime(x), b = oTime(x);
  if (Object.is(a, b) || (isNaN(a) && isNaN(b))) continue;
  tBad++; tEx ||= `${x}: check.js ${a}, oracle ${b}`;
}
console.log(tBad ? `instants: ${tBad} disagreements, e.g. ${tEx}` : `instants: ${N} random stamps, all agree to the ms`);
