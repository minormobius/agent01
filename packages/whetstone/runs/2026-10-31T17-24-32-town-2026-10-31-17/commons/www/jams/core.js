// COPY of shelf/play/core.mjs (shelf/play/build.mjs). Edit there.
// The jams, unified (Modulo, 2026-10-13). One function for every form and genre:
//   jam({ form: 'track'|'wander', genre: 'garden'|'jazz'|'electronica', seed, drift, ride, picks }, deps)
// returns { next() } giving one 8-bar phrase at a time (track: one phrase, then null; wander: never ends).
// A phrase: { index, key, keyName, chords, text, abc, beats: 32, picks, notes: [{ t, d, part, kind, m, g }] }
// with t and d in beats from the phrase's start, m in MIDI, kind an instrument index.
// deps supplies the tune-writers, so the page runs the Rust (wasm) and the API runs the JS twins:
//   deps.tune(seed) -> [[degree, eighths], ...]   deps.walker(seed) -> { phrase(), draw(n) }
//   deps.arrange, deps.CHARTS, deps.GPARTS        (genre.js)
// Source: shelf/play/core.mjs. Copied verbatim to www/jams/core.js and into house/api/play.mjs by
// shelf/play/build.mjs, so the page and the API cannot drift apart.
export const KINDS = ['organ', 'pluck', 'bell', 'reed', 'kick', 'strings'];
export const GENRES = ['garden', 'jazz', 'electronica'];
export const FORMS = ['track', 'wander'];
export const BPM = { garden: 112, jazz: 140, electronica: 124 };
const SCALE = [0, 2, 4, 5, 7, 9, 11], LET = 'CDEFGAB';
const midi = d => 60 + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
// The garden is the rack's arrangement (www/jams/rack/rack.js PARTS): [eighth, eighths, midi].
const GARDEN = {
  melody: { kind: 1, gain: 0.30, notes: T => T.map(n => [n.at, n.len, midi(n.d)]) },
  third:  { kind: 0, gain: 0.12, notes: T => T.map(n => [n.at, n.len, midi(n.d - 2)]) },
  bass:   { kind: 5, gain: 0.22, notes: () => [0, 1, 2, 3, 4, 5, 6, 7].map(b => [8 * b, 8, b === 3 || b === 6 ? 43 : 36]) },
  beat:   { kind: 4, gain: 0.50, notes: () => Array.from({ length: 16 }, (_, i) => [4 * i, 1, 33]) },
  bells:  { kind: 2, gain: 0.10, notes: T => T.filter(n => n.at % 8 === 0).map(n => [n.at, 2, midi(n.d) + 12]) },
};
export function partsOf(genre, deps) {
  const P = genre === 'garden' ? GARDEN : deps.GPARTS[genre], o = {};
  for (const k in P) o[k] = { kind: P[k].kind, gain: P[k].gain };
  return o;
}
const DRUMS = new Set(['beat', 'kick', 'ride']);
const KEYNAME = { '-7': 'F', '-5': 'G', '-2': 'B♭', 0: 'C', 2: 'D', 5: 'F', 7: 'G' };
const TONIC = { '-7': 3, '-5': 4, '-2': 6, 0: 0, 2: 1, 5: 3, 7: 4 };   // the key's tonic letter, C = 0
const FLATKEY = k => k === -2 || k === 5 || k === -7;
const PC = k => (FLATKEY(k) ? ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'] : ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']);
export function spell(key, d) { // degree d of the key, named with the key's accidentals; with ABC (accidentals implied by K:)
  const m = midi(d) + key, letter = (TONIC[key] + ((d % 7) + 7) % 7) % 7;
  let oct = Math.round((m - SCALE[letter] - 12) / 12); const acc = m - 12 * (oct + 1) - SCALE[letter];
  const abc = oct >= 5 ? LET[letter].toLowerCase() + "'".repeat(oct - 5) : LET[letter] + ','.repeat(4 - oct);
  return { name: LET[letter] + (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc)) + oct, abc };
}
const xmix = (a, b) => { let h = Math.imul((a ^ 0x85ebca6b) >>> 0, 0x9e3779b1) ^ Math.imul(b + 1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); return ((h ^ (h >>> 12)) >>> 0) || 1; };

export function jam(o, deps) {
  const form = o.form, genre = o.genre, seed = o.seed >>> 0, P = partsOf(genre, deps);
  const picks = {}; for (const k in P) picks[k] = o.picks && k in o.picks ? o.picks[k] : P[k].kind;
  const W = form === 'wander' ? deps.walker(seed) : null; let i = 0;
  const names = Object.keys(P).filter(k => k !== 'melody'); // four in every genre, so drift draws the same in each
  function next() {
    let key = 0, T, bassDeg = null;
    if (form === 'track') { if (i > 0) return null; let t = 0; T = deps.tune(seed).map(([d, len]) => { const n = { d, at: t, len }; t += len; return n; }); }
    else {
      // drift: one phrase in three, one part (never the melody) changes instrument or rests. Drawn from
      // the walker's own stream, so it happens on the API exactly as on the page, and moves the walk the same.
      if (i > 0 && o.drift && W.draw(3) === 0) { const nm = names[W.draw(4)]; picks[nm] = W.draw(KINDS.length + 1) - 1; }
      const p = W.phrase(); key = p.key; bassDeg = p.bass; let t = 0;
      T = p.notes.map(([d, len]) => { const n = { d, at: t, len }; t += len; return n; });
    }
    const notes = [], E = (part, t, d, m, g) => { if (picks[part] >= 0) notes.push({ t, d, part, kind: picks[part], m, g }); };
    let chords = null;
    if (genre === 'garden') {
      const root = 36 + ((key % 12) + 12) % 12;
      for (const [part, p] of Object.entries(GARDEN)) {
        const lines = part === 'bass' && bassDeg ? bassDeg.map((b, j) => [8 * j, 8, root + SCALE[b % 7] - (root + SCALE[b % 7] > 47 ? 12 : 0)]) : p.notes(T);
        for (const [at, len, m] of lines) E(part, at / 2, len / 2 * 0.92, m + (DRUMS.has(part) || (part === 'bass' && bassDeg) ? 0 : key), p.gain);
      }
    } else {
      const Tm = T.map(n => ({ m: midi(n.d), at: n.at, len: n.len }));
      // a wander phrase gets its own arrangement seed, mixed from the walk's seed and the phrase number,
      // so the comping and walking bass vary without touching the walker's stream
      for (const e of deps.arrange(genre, Tm, form === 'track' ? seed : xmix(seed, i), o.ride ? { ride: o.ride } : {}))
        E(e.part, e.t, e.d, e.m + (DRUMS.has(e.part) ? 0 : key), P[e.part].gain * e.g);
      const N = PC(key);
      chords = deps.CHARTS[genre].map(bar => bar.map(([b, c]) => { const nm = N[(c.root + key + 120) % 12] + c.name.replace(/^[A-G]/, ''); return b ? `${nm}@${b + 1}` : nm; }).join(' ')).join(' | ');
    }
    notes.sort((a, b) => a.t - b.t || (a.part < b.part ? -1 : 1));
    const sp = T.map(n => spell(key, n.d));
    let abc = '', t = 0;
    for (let j = 0; j < T.length; j++) { abc += sp[j].abc + (T[j].len === 1 ? '' : T[j].len); t += T[j].len; abc += t % 8 === 0 ? (t === 64 ? ' |' : ' | ') : ' '; }
    const out = { index: i, key, keyName: KEYNAME[key] + ' major', chords, beats: 32, picks: Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v < 0 ? 'off' : KINDS[v]])),
      text: sp.map(s => s.name).join(' '), abc: `[K:${KEYNAME[key].replace('♭', 'b')}] ` + abc.trim(), notes };
    i++; return out;
  }
  return { next, parts: P };
}
export const noteName = (m, key = 0) => PC(key)[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
