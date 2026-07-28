// worship/oracle-cast.js — the WORSHIP fixture's divination kernel. Pure, no DOM, deterministic.
//
// The worship room's principal fixture is THE ORACLE: a player draws ENTROPY and the draw is read.
// Two rites, both seeded so a given omen reproduces for ever (the seed rides in the published rumor):
//   • yijing   — the three-coin oracle: 6 lines → King Wen hexagram + moving lines + the hexagram it
//                changes toward.
//   • geomancy — cast four Mothers from sixteen tallies → the shield → its JUDGE figure (the synthesis)
//                + Robert Fludd's signification.
//
// Each cast returns { system, omen, profile, seed }. `profile` is the stable ARCHETYPE PROFILE that rides
// in the rumor (com.minomobi.hoop.story.rumor, kind:'divination', profileJson) — the engine (hoopy) tails
// the outbox and reads these as its ENTROPIC OMEN signal. Inference-free + node-tested (oracle.selftest.mjs).
//
// Vendored kernels (re-sync from clock/, never fork — the vendor/auth.js rule): lib/iching.js,
// lib/hexagrams.js, lib/geomancy.js, lib/geomancy-meanings.js.

import { decompose, movingLines, transformedLines, lines2yang, composeReading } from './lib/iching.js';
import { HEX } from './lib/hexagrams.js';
import { ZHOUYI } from './lib/zhouyi.js';
import { mothersFromCounts, shield, figureKey } from './lib/geomancy.js';
import { MEANINGS } from './lib/geomancy-meanings.js';

// ── a tiny seeded PRNG (xmur3 → mulberry32): same seed string ⇒ same cast, on any machine, for ever ──
export function rngFromSeed(seedStr) {
  const s = String(seedStr);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 6-bit hexagram code (bit i = line i, bottom = 0) ⇄ King Wen number, via the vendored HEX.b strings.
const codeOf = (yang) => { let c = 0; for (let i = 0; i < 6; i++) if (yang[i]) c |= 1 << i; return c; };
function codeToNo(code) { for (let n = 1; n <= 64; n++) { const b = HEX[n].b; let c = 0; for (let i = 0; i < 6; i++) if (b[i] === '1') c |= 1 << i; if (c === code) return n; } return null; }
const hexName = (n) => ({ zh: HEX[n].ch, py: HEX[n].py, en: HEX[n].en });

// ── YIJING reading from 6 cast lines (6/7/8/9). The ritual (yarrow.js / coins) produces the lines; this
//    turns them into the EXPANDED reading via the library's composeReading + the canonical Zhouyi text:
//    hexagram + trigrams + the Image, the Judgment (卦辭), the surfaced moving-line texts (爻辭), and the
//    relating hexagram it changes toward. `profile` is the compact record (re-derivable from `lines`);
//    `full` is the display reading. ──
export function yijingFromLines(lines) {
  const r = composeReading(lines, HEX, ZHOUYI);
  const primaryNo = r.primaryNo;
  const result = r.transformedNo;
  const name = hexName(primaryNo);
  const profile = {
    system: 'yijing',
    hexagram: primaryNo, name,
    trigrams: { below: r.lower.en, above: r.upper.en },
    elements: { below: r.lower.element, above: r.upper.element },
    moving: r.moving.map((i) => i + 1),                               // 1-based line positions
    changesTo: result, changesToName: result ? hexName(result).en : null,
    lines: lines.slice(),
    judgment: HEX[primaryNo].j,
  };
  // the expanded, display-only reading (not re-stored in the rumor — the engine re-derives it from `lines`).
  const full = {
    image: r.image || null,
    structure: r.structure || null,
    judgment: (r.judgment && r.judgment.e) || HEX[primaryNo].j,
    judgmentZh: (r.judgment && r.judgment.z) || name.zh,
    lines: (r.lineReadings || []).map((L) => ({ pos: L.pos, text: (L.canonical && L.canonical.e) || L.text, zh: (L.canonical && L.canonical.z) || null })),
    relating: r.relating ? { no: r.relating.no, name: hexName(r.relating.no).en, judgment: (r.relating.judgment && r.relating.judgment.e) || null, role: r.relating.role } : null,
    useLine: (r.useLine && r.useLine.e) || null,
  };
  const omen = `${name.en} (${name.zh} ${name.py}) — ${r.lower.en} below, ${r.upper.en} above. ${HEX[primaryNo].j}`
    + (result ? ` It changes toward ${hexName(result).en}.` : '');
  return { system: 'yijing', omen, profile, full, lines: lines.slice() };
}

// ── YIJING: the three-coin oracle (each line is three coins: 2|3 each → sum 6/7/8/9; 6 & 9 are moving) ──
export function castYijing(rng) {
  const lines = [];
  for (let i = 0; i < 6; i++) { let s = 0; for (let k = 0; k < 3; k++) s += rng() < 0.5 ? 2 : 3; lines.push(s); }
  return yijingFromLines(lines);
}

// one figure node {rows, figure} → its full descriptor (name + Fludd's signification fields).
export function figInfo(node) {
  const m = MEANINGS[figureKey(node.rows)] || {};
  return {
    name: (node.figure && node.figure.name) || m.la || '—',
    latin: m.la || null, en: m.en || null,
    planet: m.planet || null, nature: m.nature || null,
  };
}

// the whole shield, flattened to descriptors — the FULL report (4 Mothers · 4 Daughters · 4 Nieces ·
// 2 Witnesses · Judge · Reconciler). Rides in the geomancy rumor's profile (the engine gets the lot).
export function shieldReport(S) {
  return {
    mothers: S.mothers.map(figInfo),
    daughters: S.daughters.map(figInfo),
    nieces: S.nieces.map(figInfo),
    witnessRight: figInfo(S.witnessRight),
    witnessLeft: figInfo(S.witnessLeft),
    judge: figInfo(S.judge),
    reconciler: figInfo(S.reconciler),
  };
}

// ── GEOMANCY reading from a SHIELD (the sand cast / a tally roll produces the shield). Reports the FULL
//    shield — every figure — alongside the JUDGE headline + Fludd's signification. ──
export function geomancyFromShield(S) {
  const judge = S.judge;                                              // {rows, figure}
  const m = MEANINGS[figureKey(judge.rows)] || {};
  const witnesses = [S.witnessRight, S.witnessLeft].map((w) => (w && w.figure ? w.figure.name : '—'));
  const judgeName = (judge.figure && judge.figure.name) || m.la || '—';
  const report = shieldReport(S);
  const profile = {
    system: 'geomancy',
    judge: judgeName, latin: m.la || null, gloss: m.en || (judge.figure && judge.figure.gloss) || null,
    planet: m.planet || null, zodiac: m.zodiac || null,
    nature: m.nature || null, strength: m.strength || null,
    witnesses,
    shield: report,                                                   // THE FULL SHIELD (the user's ask)
  };
  const omen = (`The Judge is ${judgeName}${m.en ? ` (${m.en})` : ''}`
    + `${m.planet ? `, under ${m.planet}` : ''}${m.zodiac ? ` in ${m.zodiac}` : ''}. ${m.sig || ''}`).trim();
  return { system: 'geomancy', omen, profile, shield: report };
}

// ── GEOMANCY: sixteen tallies → four Mothers → the shield → the JUDGE figure + Fludd's signification ──
export function castGeomancy(rng) {
  const counts = Array.from({ length: 16 }, () => 1 + Math.floor(rng() * 16));
  return { ...geomancyFromShield(shield(mothersFromCounts(counts))), counts };
}

// Cast a named rite from a seed string (deterministic). The UI rolls a fresh seed per draw (a player
// gesture — like nav's random-page pick), then the seed rides in the rumor so the omen reproduces.
export function cast(system, seed) {
  const rng = rngFromSeed(seed);
  const r = system === 'geomancy' ? castGeomancy(rng) : castYijing(rng);
  return { ...r, seed: String(seed) };
}

export const ORACLE_SYSTEMS = ['yijing', 'geomancy'];

// The rumor an omen publishes (kind:'divination'). The engine reads `profile`/`profileJson` as the
// entropic-omen signal; `text` is the human omen. Append-only outbox in the player's own repo.
export function divinationRumor(world, reading) {
  return {
    world, kind: 'divination', seed: String(reading.seed),
    text: String(reading.omen || '').slice(0, 600),
    profileJson: JSON.stringify(reading.profile || {}),
  };
}
