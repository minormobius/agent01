// mappa/civ/names.js — the suite naming layer (Phase II of civ/STRATEGY.md).
//
// One naming voice: civ draws its people, cultures, faiths and institutions from the
// rite/names engine (12 blendable phonotactic culture packs), so a civilization's names
// cohere the way its norms do. Each civ culture is assigned a pack blend deterministically
// at first use; namebooks are generated lazily per (culture, kind) and indexed by hashed
// entity id, so naming stays O(1) per entity after the first request.
//
// Names are PRESENTATION ONLY — chronicleHash serialises events/series/final without name
// strings — so switching generators never invalidates a run hash. cfg.names = 'legacy'
// still reproduces the original syllable generators verbatim (byte-stable name strings
// for replays of old payloads); the default is 'rite'.
//
// Determinism: rite/names is seeded by string (xmur3 → mulberry32, the same substrate);
// every book seed is derived from (civSeed, cultureId, kind) only. No wall-clock, no
// unseeded randomness — a namer is a pure function of its seed, like everything else here.

import { generateSet, CULTURES } from '../../rite/names/engine.js';
import { stream } from './prng.js';

const PACKS = Object.keys(CULTURES); // 12 packs, insertion order is stable

// integer mix (Knuth/xorshift finaliser) — id → well-spread uint32 for book indexing
function mix(a, b = 0) {
  let h = (Math.imul(a, 2654435761) ^ Math.imul(b + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

export function makeNamer(seed, mode) {
  return mode === 'legacy' ? legacyNamer(seed >>> 0) : riteNamer(seed >>> 0);
}

// ---- rite mode (default): culture-pack namebooks --------------------------------
function riteNamer(seed) {
  const packs = new Map();  // cultureId → pack key ("norse" or "steppe+brythonic")
  const books = new Map();  // `cu:kind` → string[]
  const COUNT = { given: 96, full: 72, family: 48, place: 64 };

  // a culture's phonotactic wardrobe, fixed at first use: one pack, 40% a blend of two
  function packFor(cu) {
    let p = packs.get(cu);
    if (p == null) {
      const r = stream((seed ^ mix(cu, 7)) >>> 0, 'name-pack');
      const a = PACKS[Math.floor(r() * PACKS.length)];
      if (r() < 0.4) {
        let b = PACKS[Math.floor(r() * PACKS.length)];
        if (b === a) b = PACKS[(PACKS.indexOf(a) + 1) % PACKS.length];
        p = a + '+' + b;
      } else p = a;
      packs.set(cu, p);
    }
    return p;
  }
  function book(cu, kind) {
    const k = cu + ':' + kind;
    let b = books.get(k);
    if (!b) {
      b = generateSet({ seed: 'civ:' + seed + ':cu' + cu + ':' + kind, culture: packFor(cu), setting: 'classical', kind, count: COUNT[kind] }).names;
      books.set(k, b);
    }
    return b;
  }
  const pick = (arr, h) => arr[h % arr.length];
  const cuOr0 = cu => (cu == null || cu < 0 ? 0 : cu);

  return {
    mode: 'rite',
    // a notable individual — full names (given + family, sometimes an epithet)
    person: (id, cu) => pick(book(cuOr0(cu), 'full'), mix(id, 1)),
    // a faith/philosophy — reads like a founder's name (Buddhism ← Buddha)
    belief: (sd, cu) => pick(book(cuOr0(cu), 'given'), mix(sd, 2)),
    // the root word institutions wrap ("the <root> State/Guild", "<root> Company")
    instRoot: (type, seat, cu) => pick(book(cuOr0(cu), 'place'), mix(seat, 3 + type)),
    // the culture itself (a people-name; clan-shaped)
    culture: cu => book(cu, 'family')[0],
    // a toponym for a cell in a culture's tongue (state seats → founded cities)
    place: (cell, cu) => pick(book(cuOr0(cu), 'place'), mix(cell, 11)),
    // a continent name — its own pack per landmass (continents pre-date cultures)
    landmassName: lm => {
      const r = stream((seed ^ mix(lm, 13)) >>> 0, 'landmass-name');
      const pack = PACKS[Math.floor(r() * PACKS.length)];
      return generateSet({ seed: 'civ:' + seed + ':lm' + lm, culture: pack, setting: 'classical', kind: 'place', count: 4 }).names[0];
    },
    packFor,
  };
}

// ---- legacy mode: the original syllable generators, verbatim --------------------
// (Pre-Phase-II strings. Kept for byte-stable replays; do not "improve" these.)
function legacyNamer(seed) {
  const syll = (r, on, vo) => {
    const pick = s => s[Math.floor(r() * s.length)];
    let t = pick(on).toUpperCase() + pick(vo);
    for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) t += pick(on) + pick(vo);
    return t;
  };
  const person = id => syll(stream((seed ^ (id * 2246822519)) >>> 0, 'person'), 'ktrmnvbslpgdhwz', 'aeiouaei');
  const belief = sd => syll(stream((seed ^ (sd * 2654435761) ^ 0x9e3779b9) >>> 0, 'belief-name'), 'thmnvrbkldshpmzthph', 'aeiouaei');
  const instRoot = (type, seat, cu) => syll(stream((seed ^ (seat * 2654435761) ^ (cu * 40503) ^ (type * 97)) >>> 0, 'inst-name'), 'ktrmnvbslpgdh', 'aeiouoa');
  return {
    mode: 'legacy',
    person: (id, _cu) => person(id),
    belief: (sd, _cu) => belief(sd),
    instRoot,
    // legacy had no culture/place names; mint them in the legacy voice (new fields
    // exist in both modes — only the strings differ)
    culture: cu => syll(stream((seed ^ (cu * 374761393) ^ 0x85ebca6b) >>> 0, 'culture-name'), 'ktrmnvbslpgdh', 'aeioua'),
    place: (cell, _cu) => syll(stream((seed ^ (cell * 668265263) ^ 0xc2b2ae35) >>> 0, 'place-name'), 'ktrmnvbslpgdh', 'aeioua'),
    landmassName: lm => syll(stream((seed ^ (lm * 374761393) ^ 0x27d4eb2f) >>> 0, 'landmass-name'), 'ktrmnvbslpgdh', 'aeioua'),
    packFor: () => null,
  };
}
