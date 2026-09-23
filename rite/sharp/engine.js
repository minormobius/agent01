// sharp — a monosyllable engine.
//
// Three jobs, one model:
//
//   1. MINT    procgen single-syllable words that obey English phonotactics but
//              have no English definition. A shape with no meaning attached —
//              semantogenesis, if you like.
//   2. DRAW    hand back a REAL single-syllable word from the corpus (~15k of
//              them), optionally dialled by how common it is.
//   3. CHECK   given any string: how many syllables, and is it taken?
//
// The wardrobe is not hand-written. `buildModel()` segments every real English
// monosyllable into (onset, nucleus, coda) orthographically and tallies the
// conditional distributions P(nucleus | onset) and P(coda | nucleus). The
// minter samples from those tables, so a minted word is shaped by English's
// own habits rather than by someone's idea of them — and the same tables give
// every minted word a plausibility score, a guessed pronunciation, and the
// real words it rhymes with.
//
// Deterministic: same (seed, style, count) -> the same words on any machine,
// forever. No Date.now(), no unseeded Math.random(). The module runs
// identically in the Cloudflare worker, the browser, and node (selftest in
// engine.selftest.mjs). Corpus data is INJECTED, never imported, so the engine
// stays pure and the same code serves all three.

// ---------- seeded PRNG (xmur3 + mulberry32, same lineage as names/org) ----------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(seedStr) {
  return mulberry32(xmur3(String(seedStr))());
}

// ---------- syllable counting ----------
//
// For a word the corpus knows, the caller should prefer the corpus count (it
// comes from CMUdict and is right by construction). This heuristic is for the
// words nobody has counted yet — which, for a site that invents them, is the
// interesting case. Measured against CMUdict restricted to real English words
// (engine.selftest.mjs re-measures on every run):
//
//   exact syllable count   93.8%
//   "is it one syllable"   precision 96.6%, recall 99.8%
//
// The asymmetry is deliberate. A minted word is only shipped if this says ONE,
// so high recall keeps good candidates and the rejection loop absorbs the rest.

const SYLLABIC_E = /(?:[bcdfgkpstvz]l|[bcdfgkpt]r|cm|cn|thm)(?:e|es|ed)$/;   // able, acres, addled, acme
const SILENT_ISLE = /^(?:a?isle)s?$/;                                       // isle, aisles: silent s, live e
const ED_VOICED = new Set(['aged', 'learned', 'naked', 'wicked', 'ragged', 'rugged',
  'jagged', 'crooked', 'beloved', 'wretched', 'rented']);                   // -ed keeps its own beat

export function countSyllables(word) {
  let w = String(word).toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  let bonus = 0;
  if (/(?:s|x|z|ch|sh)'s$/.test(w)) bonus++;                 // actress's, fox's
  w = w.replace(/'/g, '');
  if (!w) return 0;
  if (w.length <= 2) return 1;
  if (SILENT_ISLE.test(w)) return 1;

  let s = w.replace(/^y(?=[aeiou])/, '');                    // yes, yard: y is a consonant here
  s = s.replace(/que(d|s)?$/, 'k$1');                        // plaque, basques, piqued
  s = s.replace(/(?<!r)gue(d|s)?$/, 'g$1');                  // vogue, leagues, tongue — not argue
  const syllabic = SYLLABIC_E.test(s);

  // silent inflections
  if (!ED_VOICED.has(s)) s = s.replace(/([^aeiouytd]|[aeiouy][^td])ed$/, '$1d');  // walked, cared — not wanted
  s = s.replace(/(ch|sh|[sxzcg])es$/, '$1\u0000s');          // boxes, wishes keep the beat
  s = s.replace(/([^aeiouy])es$/, '$1s');                    // cakes, hopes lose it
  s = s.replace(/\u0000/g, 'e');
  s = s.replace(/([^aeiouy])e(ment|less|ness|ful|ly)$/, '$1$2');  // abatement, lovely

  let n = (s.match(/[aeiouy]+/g) || []).length;

  if (/[^aeiouy]e$/.test(s) && n > 1 && !syllabic) n--;      // silent final e
  if (syllabic && !/e$/.test(s)) n++;                        // addled, apples
  if (/(?:sm|thm)$/.test(s)) n++;                            // prism, activism, chasm, rhythm
  n += (s.match(/[aeiou]y[aeiou](?!s?$)/g) || []).length;    // player, loyal — not eye, ayes
  n += (s.match(/[^aeiouy]y[aeiou](?!s?$)/g) || []).length;  // crying, canyon — not bye, dyes
  n += (s.match(/(?<![ctsx])i[aou]/g) || []).length;         // piano, violin — not -tial, -cial, -sion
  n += (s.match(/(?<![gq])u[ao]/g) || []).length;            // actual, duo — not guard, quote
  n += (s.match(/(?<![gq])ue(?![sd]?$)/g) || []).length;     // bluer, cruel — not argues, queen
  n += (s.match(/oe(?=[mtr])/g) || []).length;               // poem, poet, coerce — not does, shoe
  n += (s.match(/(?<=[^aeiouy])[aeou]ing$/g) || []).length;  // being, doing, going

  return Math.max(1, n + bonus);
}

// ---------- orthographic segmentation ----------
//
// A monosyllable spelled in English is onset + nucleus + coda, with an
// optional magic <e> hanging off the end that belongs to the nucleus rather
// than the coda (mane is m-a(e)-n, not m-a-ne). Longest-match on a fixed onset
// inventory, then the vowel run, then whatever is left.
//
// The contract, gated in the selftest: render(segment(w)) === w for every word
// it accepts. Segmentation is lossless or it is a bug.

const ONSETS_4 = ['schl', 'schm', 'schn', 'schr', 'schw'];
const ONSETS_3 = ['chr', 'phl', 'phr', 'psh', 'sch', 'scl', 'scr', 'shm', 'sht', 'shr', 'skl',
  'skr', 'sph', 'spl', 'spr', 'squ', 'str', 'thr', 'thw'];
const ONSETS_2 = ['bl', 'br', 'ch', 'cl', 'cr', 'cz', 'dr', 'dw', 'fl', 'fr', 'gh', 'gl', 'gn',
  'gr', 'gw', 'kl', 'kn', 'kr', 'kv', 'kw', 'ph', 'pl', 'pn', 'pr', 'ps', 'pt', 'qu', 'rh', 'sc',
  'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sv', 'sw', 'th', 'tr', 'ts', 'tw', 'vl', 'vr', 'wh',
  'wr', 'zh'];
const ONSETS_1 = 'bcdfghjklmnpqrstvwxyz'.split('');

// A magic <e> can sit behind these; 'dg' and 'ck' spell their own coda (bridge,
// lock) and 'w'/'y'/'x' never take one.
const NO_MAGIC_E = new Set(['dg', 'ck', 'w', 'y', 'x', 'h', 'j', 'q']);

const VOWEL = /[aeiou]/;

export function segment(word) {
  const w = String(word).toLowerCase();
  if (!/^[a-z]+$/.test(w)) return null;

  // onset: longest match, but never swallow the word's only vowel
  let onset = '';
  for (const list of [ONSETS_4, ONSETS_3, ONSETS_2, ONSETS_1]) {
    const hit = list.find((o) => w.startsWith(o));
    if (hit && hit.length < w.length) { onset = hit; break; }
  }
  let rest = w.slice(onset.length);

  // nucleus: the vowel run, plus a trailing glide when it spells a digraph
  let m = rest.match(/^[aeiou]+/);
  let nucleus;
  if (m) {
    nucleus = m[0];
    const after = rest.slice(nucleus.length);
    if (/^[wy]/.test(after) && !VOWEL.test(after.slice(1, 2))) nucleus += after[0];
  } else if (rest.startsWith('y')) {
    nucleus = 'y';                                           // try, myth, rhythm
  } else {
    return null;                                             // no vowel: not a syllable we can model
  }
  rest = rest.slice(nucleus.length);

  // magic <e>
  let magicE = false;
  const me = rest.match(/^([^aeiouy]{1,2})e$/);
  if (me && !NO_MAGIC_E.has(me[1]) && !/[wy]$/.test(nucleus)) {
    magicE = true;
    rest = me[1];
  }
  return { onset, nucleus, coda: rest, magicE };
}

export function render(seg) {
  return seg.onset + seg.nucleus + seg.coda + (seg.magicE ? 'e' : '');
}

/** The nucleus as the model keys it — magic <e> is part of the vowel, not the coda. */
export function nucleusKey(seg) { return seg.magicE ? seg.nucleus + '_e' : seg.nucleus; }

/** Orthographic rime: everything from the vowel on. Two words with the same key rhyme. */
export function rimeKey(seg) { return nucleusKey(seg) + '|' + seg.coda; }

// ---------- the phonotactic model ----------
//
// buildModel() runs at build time over the real monosyllables; the result is
// data/phono.json and the minter's whole wardrobe.

export function buildModel(entries) {
  const onsets = new Map(), nuclei = new Map(), codas = new Map();
  const nucGivenOnset = new Map(), codaGivenNuc = new Map();
  const onsetPhone = new Map(), rimePhone = new Map();
  let total = 0, skipped = 0;

  const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);
  const bump2 = (map, a, b) => {
    if (!map.has(a)) map.set(a, new Map());
    bump(map.get(a), b);
  };
  const vote = (map, k, v) => {
    if (!map.has(k)) map.set(k, new Map());
    const m = map.get(k);
    m.set(v, (m.get(v) || 0) + 1);
  };

  for (const e of entries) {
    const seg = segment(e.word);
    if (!seg || render(seg) !== e.word) { skipped++; continue; }
    total++;
    const nk = nucleusKey(seg);
    bump(onsets, seg.onset); bump(nuclei, nk); bump(codas, seg.coda);
    bump2(nucGivenOnset, seg.onset, nk);
    bump2(codaGivenNuc, nk, seg.coda);
    if (e.phones) {
      const i = e.phones.findIndex((p) => /\d$/.test(p));
      if (i >= 0) {
        vote(onsetPhone, seg.onset, e.phones.slice(0, i).join(' '));
        vote(rimePhone, rimeKey(seg), e.phones.slice(i).map((p) => p.replace(/\d$/, '')).join(' '));
      }
    }
  }

  const plain = (m) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
  const nested = (m) => Object.fromEntries([...m].map(([k, v]) => [k, plain(v)]));
  const modal = (m) => Object.fromEntries([...m].map(([k, v]) => {
    let best = '', n = -1;
    for (const [val, c] of v) if (c > n || (c === n && val < best)) { best = val; n = c; }
    return [k, best];
  }));

  return {
    total, skipped,
    onsets: plain(onsets), nuclei: plain(nuclei), codas: plain(codas),
    nucGivenOnset: nested(nucGivenOnset), codaGivenNuc: nested(codaGivenNuc),
    onsetPhone: modal(onsetPhone), rimePhone: modal(rimePhone),
  };
}

// ---------- styles ----------
//
// A style is a re-weighting of the empirical tables, never a separate
// inventory: every part a style can reach is a part English actually uses.
// `native` is the untouched distribution — English monosyllables as they are.

const isShort = (n) => /^[aeiouy]$/.test(n);
const isLong = (n) => n.length > 1;
const stops = new Set(['p', 't', 'k', 'b', 'd', 'g', 'ck', 'ct', 'pt', 'ft', 'kt', 'tch', 'dge', 'x']);
const sonorants = new Set(['l', 'll', 'r', 'm', 'n', 'ng', 'rl', 'rm', 'rn', 'lm', 'ln', 'nn', '']);
const archaic = /th|wh|wr|kn|gh|ph|gn|sh/;
const bright = new Set(['i', 'ee', 'ea', 'y', 'i_e', 'ie', 'ei']);

export const STYLES = {
  native: {
    label: 'native',
    blurb: 'English monosyllables as they actually distribute — nothing reweighted.',
    onset: () => 1, nucleus: () => 1, coda: () => 1,
  },
  blunt: {
    label: 'blunt',
    blurb: 'Short vowel, hard stop. The Anglo-Saxon core: one beat, closed fast.',
    onset: (o) => (o.length <= 2 ? 1.5 : 0.4),
    nucleus: (n) => (isShort(n) ? 5 : 0.15),
    coda: (c) => (stops.has(c) ? 5 : c === '' ? 0.05 : 1),
  },
  liquid: {
    label: 'liquid',
    blurb: 'Long vowels and sonorant codas — nothing in it stops the air.',
    onset: (o) => (/[lr]$/.test(o) ? 2.5 : 1),
    nucleus: (n) => (isLong(n) ? 3.5 : 0.4),
    coda: (c) => (sonorants.has(c) ? 5 : stops.has(c) ? 0.15 : 1),
  },
  gnarly: {
    label: 'gnarly',
    blurb: 'Three consonants in, three out. Maximum legal cluster on both ends.',
    onset: (o) => (o.length >= 3 ? 9 : o.length === 2 ? 2 : 0.1),
    nucleus: (n) => (isShort(n) ? 2 : 1),
    coda: (c) => (c.length >= 3 ? 8 : c.length === 2 ? 3 : c === '' ? 0.02 : 0.5),
  },
  old: {
    label: 'old',
    blurb: 'The digraphs that survived from before the printers got tidy: th, wr, kn, gh.',
    onset: (o) => (archaic.test(o) ? 9 : 0.5),
    nucleus: (n) => (/ou|ow|ea|ai|igh|augh/.test(n) ? 3.5 : 1),
    coda: (c) => (archaic.test(c) ? 6 : 1),
  },
  bright: {
    label: 'bright',
    blurb: 'High front vowels, light voiceless codas. Small, quick, metallic.',
    onset: (o) => (/^[fkpstz]|[fkpstz]$/.test(o) ? 2.5 : 1),
    nucleus: (n) => (bright.has(n) ? 6 : 0.3),
    coda: (c) => (/^(p|t|k|ck|ff|ss|st|sk|sp|nt|nk|ft|pt|x|tch)$/.test(c) ? 4 : c === '' ? 0.2 : 1),
  },
  wide: {
    label: 'wide',
    blurb: 'Open or barely closed — the shapes that leave the vowel hanging.',
    onset: (o) => (o.length <= 2 ? 1 : 0.3),
    nucleus: (n) => (isLong(n) ? 4 : 0.5),
    coda: (c) => (c === '' ? 12 : c.length === 1 ? 1.5 : 0.1),
  },
};

export const STYLE_KEYS = Object.keys(STYLES);

// ---------- weighted sampling ----------

function pick(rng, table, weight) {
  let total = 0;
  const keys = [], weights = [];
  for (const k in table) {
    const w = table[k] * (weight ? weight(k) : 1);
    if (w <= 0) continue;
    keys.push(k); weights.push(w); total += w;
  }
  if (!total) return null;
  let r = rng() * total;
  for (let i = 0; i < keys.length; i++) { r -= weights[i]; if (r <= 0) return keys[i]; }
  return keys[keys.length - 1];
}

/** Back off to the marginal when a conditional cell is too thin to trust. */
function conditional(table, key, marginal, floor) {
  const cell = table[key];
  if (!cell) return marginal;
  let n = 0;
  for (const k in cell) n += cell[k];
  return n >= floor ? cell : marginal;
}

// ---------- plausibility ----------
//
// Log-probability of a word's parts under the model, mapped onto 0..100 by
// where it falls against the real corpus's own distribution (the calibration
// percentiles are computed at build time and shipped in the model). 50 means
// "as ordinary as the median real monosyllable".

export function plausibility(model, seg) {
  const nk = nucleusKey(seg);
  const sum = (t) => { let n = 0; for (const k in t) n += t[k]; return n; };
  const p = (t, k) => { const n = sum(t); return n ? ((t[k] || 0) + 0.5) / (n + 0.5 * Object.keys(t).length) : 1e-6; };
  const nucT = conditional(model.nucGivenOnset, seg.onset, model.nuclei, 12);
  const codT = conditional(model.codaGivenNuc, nk, model.codas, 12);
  const lp = Math.log(p(model.onsets, seg.onset)) + Math.log(p(nucT, nk)) + Math.log(p(codT, seg.coda));
  const cal = model.calibration;
  if (!cal || !cal.length) return { logp: lp, score: null };
  let lo = 0;
  while (lo < cal.length && cal[lo] < lp) lo++;
  return { logp: lp, score: Math.round((lo / cal.length) * 100) };
}

// ---------- pronunciation ----------

const ARPA_IPA = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ', D: 'd', DH: 'ð',
  EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h', IH: 'ɪ', IY: 'i', JH: 'dʒ', K: 'k',
  L: 'l', M: 'm', N: 'n', NG: 'ŋ', OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'ɹ', S: 's', SH: 'ʃ',
  T: 't', TH: 'θ', UH: 'ʊ', UW: 'u', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};

export function arpaToIpa(phones) {
  if (!phones) return null;
  const out = phones.trim().split(/\s+/).filter(Boolean)
    .map((p) => ARPA_IPA[p.replace(/\d$/, '')] || null);
  return out.some((x) => x === null) ? null : out.join('');
}

/**
 * Phones for an onset spelling. English spells /skr/ as <scr>, so <skr> is
 * never attested — but it decomposes into <sk> and <r>, both of which are.
 * Longest attested prefix, then the rest, recursively.
 */
function onsetPhones(model, onset, depth = 0) {
  const direct = model.onsetPhone[onset];
  if (direct !== undefined) return direct;
  if (!onset || depth > 3) return undefined;
  for (let n = onset.length - 1; n >= 1; n--) {
    const head = model.onsetPhone[onset.slice(0, n)];
    if (head === undefined) continue;
    const tail = onsetPhones(model, onset.slice(n), depth + 1);
    if (tail === undefined) continue;
    return [head, tail].filter(Boolean).join(' ');
  }
  return undefined;
}

/**
 * Guessed pronunciation for a word nobody has ever said: the modal phones for
 * its onset spelling, plus the modal phones for its rime spelling. Both halves
 * come from real words that spell it the same way, so the guess is only as
 * novel as the word is.
 */
export function pronounce(model, seg) {
  const on = onsetPhones(model, seg.onset);
  const ri = model.rimePhone[rimeKey(seg)];
  if (on === undefined || ri === undefined) return null;
  const arpa = (on ? on + ' ' : '') + ri;
  const ipa = arpaToIpa(arpa);
  return ipa ? { arpabet: arpa, ipa } : null;
}

// ---------- the corpus index ----------
//
// The taken-word list is ~243k entries; holding it as a JS Set of strings costs
// tens of megabytes per isolate. Instead it stays as one newline-delimited
// string with an Int32Array of line offsets, and lookups binary-search it —
// about 3MB resident, O(log n) per query, and no parse step on cold start.
//
// Line format: `word` or `word\tN`, where N is the true syllable count from
// CMUdict. Sorted by word.

export class WordIndex {
  constructor(text) {
    this.text = text;
    const offsets = [];
    let i = 0;
    while (i < text.length) {
      offsets.push(i);
      const nl = text.indexOf('\n', i);
      if (nl === -1) break;
      i = nl + 1;
    }
    this.offsets = Int32Array.from(offsets);
  }

  /** The word at line `i`, without its syllable field. */
  wordAt(i) {
    const start = this.offsets[i];
    let end = start;
    const t = this.text;
    while (end < t.length && t[end] !== '\t' && t[end] !== '\n') end++;
    return t.slice(start, end);
  }

  /** Line index of `word`, or -1. */
  find(word) {
    const w = String(word).toLowerCase();
    let lo = 0, hi = this.offsets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const at = this.wordAt(mid);
      if (at === w) return mid;
      if (at < w) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  has(word) { return this.find(word) !== -1; }

  /**
   * The full record for `word`, or null if English has not claimed it.
   * `syllables` is CMUdict's count (null if it has no entry). `kinds` names the
   * lists that claim it: e for ENABLE1, f for the SUBTLEX-US frequency corpus,
   * c for CMUdict. A word only CMUdict has is, nearly always, a proper name.
   */
  entry(word) {
    const i = this.find(word);
    if (i === -1) return null;
    const t = this.text;
    let p = this.offsets[i];
    while (p < t.length && t[p] !== '\t' && t[p] !== '\n') p++;
    const rec = { word: String(word).toLowerCase(), syllables: null, kinds: '' };
    if (t[p] !== '\t') return rec;
    let end = p + 1;
    while (end < t.length && t[end] !== '\n') end++;
    const field = t.slice(p + 1, end);
    const m = field.match(/^(\d*)([a-z]*)$/);
    if (m) {
      if (m[1]) rec.syllables = parseInt(m[1], 10);
      rec.kinds = m[2];
    }
    return rec;
  }

  /** Recorded syllable count for `word`, or null if unknown / not present. */
  syllables(word) {
    const e = this.entry(word);
    return e ? e.syllables : null;
  }

  get size() { return this.offsets.length; }
}

// ---------- house rules ----------
//
// The lexicon filter removes every real word, which removes almost every slur
// along with them — they are real words. What it cannot remove is a coincidence:
// a string nobody has ever used that still lands on something ugly. These are
// substring bans applied to minted words only; the checker never refuses to
// answer a question about a string someone typed themselves.

const BANNED = /fap|felch|smeg|pube|poon|turd|arse|fag|nig|coon|kike|spic|chink|wog|paki|gook|dyke|tran|cunt|twat|retar|rape|jizz|cum|tit|dick|cock|fuk|fuc|coc|phuc|shit|piss|wank|slut|whor|homo|jew|nazi|kkk|isis/;

/** Real words we will not volunteer in a rhyme or neighbour list nobody asked for. */
const COARSE = new Set(['fuck', 'fucks', 'fucked', 'shit', 'shits', 'cunt', 'cunts', 'twat', 'twats',
  'piss', 'pissed', 'slut', 'sluts', 'whore', 'whores', 'wank', 'wanks', 'jizz', 'spic', 'spics',
  'chink', 'chinks', 'kike', 'kikes', 'wog', 'wogs', 'gook', 'gooks', 'coon', 'coons', 'fag', 'fags',
  'dyke', 'dykes', 'jap', 'japs', 'paki', 'pakis']);

export function permitted(word) { return !BANNED.test(word); }

/** True for a real word that is fine to show in a list the reader did not ask for. */
export function showable(word) { return !COARSE.has(word); }

// ---------- MINT ----------

const DEFAULT_COUNT = 24;
const MAX_COUNT = 500;

// Codas that make a word look like an inflection: any -ed, and a final -s that
// is not part of <ss>. `bless` survives, `stalms` does not.
const INFLECTION = /ed$|(?:^|[^s])s$/;

/**
 * Mint `count` single-syllable words that no English dictionary claims.
 *
 * @param {object} o
 * @param {string} o.seed        any string; the same seed always mints the same set
 * @param {number} [o.count]     how many, 1..500
 * @param {string} [o.style]     one of STYLE_KEYS
 * @param {object} o.model       the phonotactic model (data/phono.json)
 * @param {WordIndex} o.lexicon  every word English has already claimed
 * @param {number} [o.minLen]    reject shorter than this
 * @param {number} [o.maxLen]    reject longer than this
 * @param {boolean} [o.inflected] allow forms that read as a plural or a past
 *                                tense of a word that does not exist (`stalms`,
 *                                `sunked`). Off by default: a minted word should
 *                                be a root, not an inflection of nothing.
 * @param {number} [o.distinct]   reject a candidate that sits one edit from a
 *                                real word this common (per million). `grought`
 *                                and `fruilt` are perfectly legal shapes that
 *                                read as typos of `brought` and `built`; a word
 *                                you have to spell out loud is worth less than
 *                                one you do not. 0 (default) keeps them.
 */
export function mint(o = {}) {
  const seed = String(o.seed ?? '').trim() || 'sharp';
  const style = STYLES[o.style] ? o.style : 'native';
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(o.count) || DEFAULT_COUNT)));
  const minLen = Math.max(1, Math.floor(Number(o.minLen) || 2));
  const maxLen = Math.min(12, Math.floor(Number(o.maxLen) || 9));
  const model = o.model, lexicon = o.lexicon, corpus = o.corpus;
  const inflected = !!o.inflected;
  const distinct = Math.max(0, Number(o.distinct) || 0);
  if (!model) throw new Error('mint: model is required');

  const st = STYLES[style];
  const rng = rngFrom(`sharp|${seed}|${style}|${count}|${minLen}|${maxLen}|${inflected ? 'i' : 'r'}|${distinct}`);
  const words = [];
  const seen = new Set();
  let tries = 0;
  const budget = count * 400 + 2000;

  while (words.length < count && tries < budget) {
    tries++;
    const onset = pick(rng, model.onsets, st.onset);
    if (onset === null) break;
    const nucT = conditional(model.nucGivenOnset, onset, model.nuclei, 12);
    const nk = pick(rng, nucT, st.nucleus);
    if (nk === null) continue;
    const magicE = nk.endsWith('_e');
    const nucleus = magicE ? nk.slice(0, -2) : nk;
    const codT = conditional(model.codaGivenNuc, nk, model.codas, 12);
    const coda = pick(rng, codT, st.coda);
    if (coda === null) continue;

    const seg = { onset, nucleus, coda, magicE };
    const word = render(seg);

    if (word.length < minLen || word.length > maxLen) continue;
    if (!inflected && INFLECTION.test(coda)) continue;
    if (seen.has(word)) continue;
    if (!permitted(word)) continue;
    // must round-trip: a spelling that segments differently is a different word
    const back = segment(word);
    if (!back || back.onset !== onset || back.nucleus !== nucleus || back.coda !== coda || back.magicE !== magicE) continue;
    // must actually read as one syllable
    if (countSyllables(word) !== 1) continue;
    // must be unclaimed
    if (lexicon && lexicon.has(word)) continue;
    // must not read as a misspelling of something common
    if (distinct && corpus && nearestCommon(corpus, word) >= distinct) continue;

    seen.add(word);
    const { logp, score } = plausibility(model, seg);
    const say = pronounce(model, seg);
    const rimeArpa = model.rimePhone[rimeKey(seg)] || null;
    words.push({
      word,
      syllables: 1,
      taken: false,
      score,
      logp: Math.round(logp * 1000) / 1000,
      parts: { onset, nucleus: nk, coda },
      rime: rimeKey(seg),
      say,
      rhymes: corpus && rimeArpa ? rhymesFor(corpus, rimeArpa, { limit: 8 }) : [],
      homophones: corpus && say ? homophonesFor(corpus, say.arpabet) : [],
      neighbours: corpus ? neighboursFor(corpus, word, { limit: 6 }) : [],
    });
  }

  return {
    seed, style, requested: count, count: words.length, tries,
    inflected, distinct,
    styleBlurb: st.blurb,
    words,
  };
}

// ---------- DRAW ----------
//
// Real single-syllable words, pulled from the corpus. `obscurity` dials where
// in the frequency ranking to draw from: 0 pulls from the commonest, 1 from
// words most people have never had cause to use.

export function draw(o = {}) {
  const corpus = o.corpus;
  if (!corpus || !corpus.words || !corpus.words.length) throw new Error('draw: corpus is required');
  const seed = String(o.seed ?? '').trim() || 'sharp';
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(o.count) || DEFAULT_COUNT)));
  const obscurity = Math.max(0, Math.min(1, Number(o.obscurity ?? 0.5)));
  const rng = rngFrom(`sharp-draw|${seed}|${count}|${obscurity}`);

  // corpus.order is the word indices sorted commonest-first; take a window
  // around the obscurity point, wide enough that neighbouring dials overlap.
  const order = corpus.order;
  const n = order.length;
  const span = Math.max(count * 6, Math.floor(n * 0.18));
  const centre = Math.floor(obscurity * (n - 1));
  let lo = Math.max(0, centre - (span >> 1));
  let hi = Math.min(n, lo + span);
  lo = Math.max(0, hi - span);

  const picked = new Set();
  const words = [];
  let tries = 0;
  while (words.length < count && tries < count * 200 + 1000) {
    tries++;
    const i = order[lo + Math.floor(rng() * (hi - lo))];
    if (picked.has(i)) continue;
    picked.add(i);
    const w = corpus.words[i];
    if (!permitted(w)) continue;
    words.push(realEntry(corpus, i, o.model));
  }
  for (const w of words) {
    w.rhymes = rhymesFor(corpus, corpus.rimes[corpus.rimeIdx[corpus.index.get(w.word)]], { limit: 8, exclude: w.word });
    w.homophones = homophonesFor(corpus, corpus.phones[corpus.index.get(w.word)]).filter((x) => x !== w.word);
    w.neighbours = neighboursFor(corpus, w.word, { limit: 6 }).filter((x) => x !== w.word);
  }
  return { seed, obscurity, requested: count, count: words.length, words };
}

function realEntry(corpus, i, model) {
  const word = corpus.words[i];
  const seg = segment(word);
  const arpa = corpus.phones[i];
  const ipa = arpaToIpa(arpa);
  return {
    word,
    syllables: 1,
    taken: true,
    kinds: 'ec',
    freq: corpus.freq[i] / 100,
    rank: corpus.rank ? corpus.rank[i] : null,
    parts: seg ? { onset: seg.onset, nucleus: nucleusKey(seg), coda: seg.coda } : null,
    rime: seg ? rimeKey(seg) : null,
    say: ipa ? { arpabet: arpa, ipa } : null,
    score: seg && render(seg) === word && model ? plausibility(model, seg).score : null,
  };
}

// ---------- rhymes and neighbours ----------

/** Real monosyllables sharing a phonetic rime, commonest first. */
export function rhymesFor(corpus, arpaRime, { limit = 12, exclude = '' } = {}) {
  if (!corpus || !arpaRime) return [];
  const bucket = corpus.byRime[arpaRime];
  if (!bucket) return [];
  return bucket.map((i) => corpus.words[i])
    .filter((w) => w !== exclude && showable(w))
    .slice(0, limit);
}

/**
 * Real monosyllables pronounced exactly the same way. A minted word can be
 * unclaimed in spelling and still already exist in the ear — `cind` is `kind`.
 * The page says so rather than pretending otherwise.
 */
export function homophonesFor(corpus, arpa, { limit = 4 } = {}) {
  if (!corpus || !corpus.byPhones || !arpa) return [];
  const key = arpa.split(' ').map((p) => p.replace(/\d$/, '')).join(' ');
  const bucket = corpus.byPhones[key];
  return bucket ? bucket.map((i) => corpus.words[i]).filter(showable).slice(0, limit) : [];
}

/**
 * How common the commonest real word one edit away is, per million. A high
 * number means the word reads as a typo of that word rather than as itself.
 */
export function nearestCommon(corpus, word) {
  if (!corpus) return 0;
  const near = neighboursFor(corpus, word, { limit: 1 });
  if (!near.length) return 0;
  return corpus.freq[corpus.index.get(near[0])] / 100;
}

/** Real monosyllables one edit away — the word's immediate lexical neighbours. */
export function neighboursFor(corpus, word, { limit = 8 } = {}) {
  if (!corpus) return [];
  const w = String(word).toLowerCase();
  const out = [];
  const cands = new Set();
  for (let i = 0; i < w.length; i++) {
    cands.add(w.slice(0, i) + w.slice(i + 1));                        // deletion
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      if (ch !== w[i]) cands.add(w.slice(0, i) + ch + w.slice(i + 1));  // substitution
      cands.add(w.slice(0, i) + ch + w.slice(i));                       // insertion
    }
  }
  for (let c = 97; c <= 122; c++) cands.add(w + String.fromCharCode(c));
  for (const c of cands) {
    const i = corpus.index.get(c);
    if (i !== undefined) out.push([i, c]);
  }
  out.sort((a, b) => (corpus.freq[b[0]] - corpus.freq[a[0]]) || (a[1] < b[1] ? -1 : 1));
  return out.map(([, c]) => c).filter(showable).slice(0, limit);
}

// ---------- CHECK ----------

/**
 * Adjudicate a string someone typed.
 *
 * Returns what is known versus what is guessed, and keeps them apart: a word
 * the corpus has is answered from the corpus, a word it does not have is
 * answered by the model, and `source` says which happened.
 */
export function check(input, o = {}) {
  const raw = String(input ?? '');
  const word = raw.trim().toLowerCase().replace(/[^a-z']/g, '');
  const model = o.model, lexicon = o.lexicon, corpus = o.corpus;

  if (!word) return { input: raw, word: '', ok: false, reason: 'nothing to check' };

  const rec = lexicon ? lexicon.entry(word) : null;
  const taken = lexicon ? !!rec : null;
  const known = rec ? rec.syllables : null;
  const kinds = rec ? rec.kinds : '';
  const nameOnly = !!rec && !kinds.includes('e');           // no dictionary list claims it
  const syllables = known ?? countSyllables(word);
  const syllableSource = known != null ? 'corpus' : 'model';

  // Everything below describes the shape of a SYLLABLE. Asking for the onset of
  // "banana" is a category error, so a polysyllable simply does not get one.
  const mono = syllables === 1;
  const seg = mono && /^[a-z]+$/.test(word) ? segment(word) : null;
  const roundTrips = !!seg && render(seg) === word;
  const plaus = roundTrips && model ? plausibility(model, seg) : null;

  const i = corpus ? corpus.index.get(word) : undefined;
  const say = i !== undefined
    ? (() => { const a = corpus.phones[i], ipa = arpaToIpa(a); return ipa ? { arpabet: a, ipa, source: 'corpus' } : null; })()
    : (roundTrips && model ? (() => { const g = pronounce(model, seg); return g && { ...g, source: 'model' }; })() : null);

  const rimeArpa = i !== undefined
    ? corpus.rimes[corpus.rimeIdx[i]]
    : (roundTrips && model ? model.rimePhone[rimeKey(seg)] || null : null);

  return {
    input: raw,
    word,
    ok: true,
    syllables,
    syllableSource,
    monosyllable: mono,
    taken,
    takenAs: !taken ? null : nameOnly ? 'name' : 'word',
    sources: kinds ? [...kinds].map((k) => ({ e: 'enable1', f: 'subtlex-us', c: 'cmudict' })[k]).filter(Boolean) : [],
    score: plaus ? plaus.score : null,
    englishShaped: roundTrips && !!say,
    parts: roundTrips ? { onset: seg.onset, nucleus: nucleusKey(seg), coda: seg.coda } : null,
    rime: roundTrips ? rimeKey(seg) : null,
    say,
    rhymes: rimeArpa && corpus ? rhymesFor(corpus, rimeArpa, { limit: 12, exclude: word }) : [],
    neighbours: corpus ? neighboursFor(corpus, word, { limit: 8 }) : [],
    verdict: verdictFor({ taken, nameOnly, syllables, score: plaus ? plaus.score : null, englishShaped: roundTrips && !!say }),
  };
}

function verdictFor({ taken, nameOnly, syllables, score, englishShaped }) {
  const beats = syllables === 1 ? 'one syllable' : `${syllables} syllables`;
  if (taken && nameOnly) return `taken — the corpora have it (usually a name), though the dictionary list does not (${beats})`;
  if (taken) return `taken — a real English word, ${beats}`;
  if (syllables !== 1) return `free, but ${beats}`;
  if (!englishShaped) return 'free and one syllable, but not spelled the way English spells things';
  if (score >= 60) return 'free, one syllable, and it reads as English. Yours.';
  if (score >= 25) return 'free, one syllable, and it just about reads as English';
  return 'free and one syllable, but the shape is a stretch';
}

// ---------- catalog ----------

export function catalog() {
  return {
    styles: STYLE_KEYS.map((k) => ({ key: k, label: STYLES[k].label, blurb: STYLES[k].blurb })),
    limits: { maxCount: MAX_COUNT, defaultCount: DEFAULT_COUNT, minLen: 2, maxLen: 12 },
  };
}
