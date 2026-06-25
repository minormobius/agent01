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

import { decompose, movingLines, transformedLines, lines2yang } from './lib/iching.js';
import { HEX } from './lib/hexagrams.js';
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

// ── YIJING: the three-coin oracle (each line is three coins: 2|3 each → sum 6/7/8/9; 6 & 9 are moving) ──
export function castYijing(rng) {
  const lines = [];
  for (let i = 0; i < 6; i++) { let s = 0; for (let k = 0; k < 3; k++) s += rng() < 0.5 ? 2 : 3; lines.push(s); }
  const d = decompose(lines);
  const primaryNo = codeToNo(codeOf(d.y));
  const moving = movingLines(lines);                                  // 0-based indices of the 6/9 lines
  const result = moving.length ? codeToNo(codeOf(lines2yang(transformedLines(lines)))) : null;
  const name = hexName(primaryNo);
  const profile = {
    system: 'yijing',
    hexagram: primaryNo, name,
    trigrams: { below: d.lower.en, above: d.upper.en },
    elements: { below: d.lower.element, above: d.upper.element },
    moving: moving.map((i) => i + 1),                                 // 1-based line positions
    changesTo: result, changesToName: result ? hexName(result).en : null,
    judgment: HEX[primaryNo].j,
  };
  const omen = `${name.en} (${name.zh} ${name.py}) — ${d.lower.en} below, ${d.upper.en} above. ${HEX[primaryNo].j}`
    + (result ? ` It changes toward ${hexName(result).en}.` : '');
  return { system: 'yijing', omen, profile, lines };
}

// ── GEOMANCY: sixteen tallies → four Mothers → the shield → the JUDGE figure + Fludd's signification ──
export function castGeomancy(rng) {
  const counts = Array.from({ length: 16 }, () => 1 + Math.floor(rng() * 16));
  const mothers = mothersFromCounts(counts);
  const S = shield(mothers);
  const judge = S.judge;                                              // {rows, figure}
  const m = MEANINGS[figureKey(judge.rows)] || {};
  const witnesses = [S.witnessRight, S.witnessLeft].map((w) => (w && w.figure ? w.figure.name : '—'));
  const judgeName = (judge.figure && judge.figure.name) || m.la || '—';
  const profile = {
    system: 'geomancy',
    judge: judgeName, latin: m.la || null, gloss: m.en || (judge.figure && judge.figure.gloss) || null,
    planet: m.planet || null, zodiac: m.zodiac || null,
    nature: m.nature || null, strength: m.strength || null,
    witnesses,
  };
  const omen = (`The Judge is ${judgeName}${m.en ? ` (${m.en})` : ''}`
    + `${m.planet ? `, under ${m.planet}` : ''}${m.zodiac ? ` in ${m.zodiac}` : ''}. ${m.sig || ''}`).trim();
  return { system: 'geomancy', omen, profile, counts };
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
