// /spooky — Treehouse-of-Horror names. A name goes in; a handful of seasonal
// puns on it come out ("James L. Brooks" → "James Hell Brooks").
//
// A pun of this kind is a sound-alike: part of the name is swapped for a spooky
// word that sounds nearly the same, and the result is spelled so you can see
// both. So the engine works in sound, not letters:
//
//   1. pronounce   the name, letter by letter (phones.js, trained on CMUdict),
//                  so we know which letters make which sounds
//   2. match       every spooky word against every stretch of each part of the
//                  name, by an edit distance whose costs are phonetic (b↔p is
//                  cheap, b↔s is not, a dropped h costs almost nothing)
//   3. spell       the winner: the name's own letters around the spooky word's,
//                  hyphenated only where the joined spelling would be misread
//   4. rank        by how much of the name survives in the sound, plus how much
//                  spooky word got in; deal a handful, varied, from a seed
//
// Three shapes come out of step 2: a SWAP (Groening → Groaning), a BLEND where
// the name runs into the start of a spooky word (Kowalski → Kowalskeleton) or a
// spooky word runs into the start of the name, and, when sound gives nothing
// good, an EPITHET that alliterates (Morbid Madison).
//
// Pure: no fetches. The caller passes the model and vocabulary in (the page
// fetches data/*.json; the worker reads them from ASSETS; the selftest from
// disk). Deterministic: the same name and seed give the same names.

import { letterPhones, isVowel } from './phones.js';
import { decode } from './phones.js';
import { BANNED, rngFrom } from '../sharp/engine.js';

// ---------- what sounds like what ----------

const CONS = {
  P: ['lab', 'stop', 0], B: ['lab', 'stop', 1], M: ['lab', 'nas', 1], W: ['lab', 'glide', 1],
  F: ['labd', 'fric', 0], V: ['labd', 'fric', 1], TH: ['dent', 'fric', 0], DH: ['dent', 'fric', 1],
  T: ['alv', 'stop', 0], D: ['alv', 'stop', 1], N: ['alv', 'nas', 1], S: ['alv', 'sib', 0], Z: ['alv', 'sib', 1],
  L: ['alv', 'liq', 1], R: ['post', 'liq', 1], SH: ['post', 'sib', 0], ZH: ['post', 'sib', 1],
  CH: ['post', 'affr', 0], JH: ['post', 'affr', 1], Y: ['pal', 'glide', 1],
  K: ['vel', 'stop', 0], G: ['vel', 'stop', 1], NG: ['vel', 'nas', 1], HH: ['glot', 'fric', 0],
};
// Vowels on a rough chart: [front→back, low→high].
const VOW = {
  IY: [0, 3], IH: [0.3, 2.5], EY: [0.2, 2.2], EH: [0.4, 1.5], AE: [0.5, 0.6], AA: [1.6, 0], AO: [2, 0.8],
  OW: [2, 2], UH: [1.7, 2.5], UW: [2, 3], AH: [1.2, 1.2], ER: [1.1, 1.6], AY: [0.9, 0.4], AW: [1.4, 0.4], OY: [1.9, 1.2],
};
const NEAR = { 'ER R': 0.45, 'IY Y': 0.5, 'UW W': 0.5, 'TH F': 0.45, 'DH V': 0.5, 'S SH': 0.45, 'Z ZH': 0.45, 'CH SH': 0.4, 'JH ZH': 0.4, 'N NG': 0.35, 'M N': 0.45 };

export function sub(a, b) {
  if (a === b) return 0;
  const near = NEAR[a + ' ' + b] ?? NEAR[b + ' ' + a];
  if (near !== undefined) return near;
  const va = VOW[a], vb = VOW[b];
  if (va && vb) {
    const d = Math.hypot(va[0] - vb[0], va[1] - vb[1]);
    return Math.min(0.8, 0.15 + 0.22 * d);
  }
  if (va || vb) return 2;               // a vowel for a consonant is not a pun
  const [pa, ma, xa] = CONS[a], [pb, mb, xb] = CONS[b];
  if (pa === pb && ma === mb) return 0.3;  // voicing only: p/b, s/z
  return 1 - (pa === pb ? 0.35 : 0) - (ma === mb ? 0.3 : 0) + (xa === xb ? 0 : 0.05);
}

export function indel(p) {
  if (p === 'HH') return 0.3;
  if (p === 'R' || p === 'L' || p === 'Y' || p === 'W') return 0.5;
  if (p === 'AH') return 0.5;
  return VOW[p] ? 0.8 : 0.65;
}

/** Phonetic edit distance between two phone arrays. */
export function distance(a, b) {
  let prev = new Float64Array(b.length + 1);
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + indel(b[j - 1]);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Float64Array(b.length + 1);
    cur[0] = prev[0] + indel(a[i - 1]);
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + indel(a[i - 1]), cur[j - 1] + indel(b[j - 1]), prev[j - 1] + sub(a[i - 1], b[j - 1]));
    prev = cur;
  }
  return prev[b.length];
}

// ---------- the name, in sound ----------

const LETTER_NAMES = {
  a: 'EY', b: 'B IY', c: 'S IY', d: 'D IY', e: 'IY', f: 'EH F', g: 'JH IY', h: 'EY CH', i: 'AY',
  j: 'JH EY', k: 'K EY', l: 'EH L', m: 'EH M', n: 'EH N', o: 'OW', p: 'P IY', q: 'K Y UW', r: 'AA R',
  s: 'EH S', t: 'T IY', u: 'Y UW', v: 'V IY', w: 'D AH B AH L Y UW', x: 'EH K S', y: 'W AY', z: 'Z IY',
};
const VOWEL_LETTER = /[aeiouy]/;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * A part of a name as a run of units: letters grouped with the sounds they
 * make. A silent letter joins a neighbour (the `h` of `sh` joins the `s`; the
 * first `o` of `oo` joins the second), so a swap never strands half a digraph.
 */
export function units(model, part) {
  const letters = fold(part).toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length === 1) return [{ letters, phones: LETTER_NAMES[letters].split(' ') }];
  const lp = letterPhones(model, letters);
  const out = [];
  let pending = '';
  lp.forEach(({ letter, phones }, k) => {
    if (phones.length) { out.push({ letters: pending + letter, phones }); pending = ''; return; }
    const next = lp[k + 1];
    if (VOWEL_LETTER.test(letter) && next && next.phones.length && isVowel(next.phones[0])) { pending += letter; return; }
    if (out.length) out[out.length - 1].letters += letter;
    else pending += letter;
  });
  if (pending) { if (out.length) out[out.length - 1].letters += pending; else out.push({ letters: pending, phones: [] }); }
  return out;
}

function parse(model, name) {
  // Words split on spaces; a hyphenated word keeps its hyphen but each side
  // is its own part, since each side is said on its own.
  const parts = [];
  for (const word of name.trim().split(/\s+/).filter(Boolean)) {
    word.split('-').forEach((p, i, all) => {
      if (!p) return;
      const us = /[a-z]/i.test(fold(p)) ? units(model, p) : [];
      parts.push({ text: p, joiner: i < all.length - 1 ? '-' : ' ', units: us, phones: us.flatMap((u) => u.phones), initial: fold(p).replace(/[^a-z]/gi, '').length === 1 });
    });
  }
  return parts;
}

// ---------- spelling the result ----------

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The letters English lets a word start with. A pun that opens on "Brh" or
// "Grc" is unreadable, whatever it sounds like; the name's own opening (Ng,
// Sz, Zb) is always allowed.
const ONSETS = new Set(('b bl br c ch chr cl cr d dr dw f fl fr g gh gl gn gr h j k kh kl kn kr l m n p ph ' +
  'phl phr pl pr ps qu r rh s sc sch scr sh shr sk sl sm sn sp sph spl spr squ st str sw t th thr tr ts tw ' +
  'v vl w wh wr x y z zh').split(' '));
const onsetOf = (w) => (w.match(/^[^aeiouy]*/) || [''])[0];
const codaOf = (w) => (w.match(/[^aeiouy]*$/) || [''])[0];
// ...and the letters it lets a word end with.
const CODAS = new Set(('b bb c ch ck ct d dd ds f ff ft g gg gh ght gs h k ks l ld lf lk ll lls lm lp ls lt m mb mn mp ' +
  'ms n nce nch nd nds ng ngs nk nn ns nt nth nts p ph ps pt r rb rc rch rd rds rf rg rk rl rm rn rp rs rst rt rth rts ' +
  's sh sk sp ss st sts t tch th ts tt tz w wl wn ws x z zz').split(' '));

/** Does this spelling read as a word: a known opening and no pile-up at a seam? */
function readable(pieces, allowOnset, allowCoda) {
  const word = pieces.join('');
  const on = onsetOf(word), co = codaOf(word);
  if (on && on !== allowOnset && !ONSETS.has(on)) return false;
  if (co && co !== word && co !== allowCoda && !CODAS.has(co)) return false;
  let at = 0;
  for (let i = 0; i < pieces.length - 1; i++) {
    at += pieces[i].length;
    if (!pieces[i].length || !pieces[i + 1].length) continue;
    // The consonant run across the seam: at most three letters, and what
    // follows the seam must be a run English can start a syllable with.
    let l = at, r = at;
    while (l > 0 && !/[aeiouy]/.test(word[l - 1])) l--;
    while (r < word.length && !/[aeiouy]/.test(word[r])) r++;
    if (r - l > 3 && r < word.length) return false;
    const after = word.slice(at, r);
    if (after && r < word.length && !ONSETS.has(after) && !ONSETS.has(after.slice(1)) && after.length > 1) return false;
    // A silent e before a vowel (crone + ing) is misread joined: "croneing".
    if (/[^aeiouy]e$/.test(pieces[i]) && /^[aeiouy]/.test(pieces[i + 1])) return false;
    // A vowel pile-up across the seam (Obri + infernal) reads as nothing.
    let vl = at, vr = at;
    while (vl > 0 && /[aeiouy]/.test(word[vl - 1])) vl--;
    while (vr < word.length && /[aeiouy]/.test(word[vr])) vr++;
    if (vl < at && vr > at && vr - vl > 2) return false;
    if (vl < at && vr > at && word[at - 1] === word[at]) return false;
  }
  return true;
}

/**
 * Join the name's letters to the spooky word's. Joined is preferred; a hyphen
 * goes in where the model would misread the joined spelling (`Slime` + `on`
 * reads "slimy-on" joined), and always when the pun is silent — when the new
 * spelling sounds exactly like the name, the hyphen is the only place the
 * joke shows (Mirkin → Murk-in). Returns null if no spelling reads.
 */
function spell(model, pieces, intended, silent, allowOnset, allowCoda) {
  const nonEmpty = pieces.filter((p) => p);
  const reads = (ps) => readable(ps, allowOnset, allowCoda);
  if (nonEmpty.length === 1) return reads(nonEmpty) ? nonEmpty[0] : null;
  const say = (spelling) => spelling.split('-').flatMap((x) => units(model, x).flatMap((u) => u.phones));
  const joined = nonEmpty.join(''), hyph = nonEmpty.join('-');
  const okJoined = !silent && reads(nonEmpty);
  // Hyphenated, every piece must be a syllable you could say on its own.
  const okHyph = nonEmpty.every((p) => /[aeiouy]/.test(p) && readable([p], allowOnset, allowCoda));
  if (okJoined && (!okHyph || distance(say(joined), intended) <= distance(say(hyph), intended) + 0.3)) return joined;
  return okHyph ? hyph : null;
}

/** Letter edit distance: how different the new spelling looks. */
function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Longest common subsequence: how many phones of b are heard, exactly, in a. */
function lcs(a, b) {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

const FILLER = new Set(['epithet', 'rhyme', 'affix']);   // at most two of these in a handful
const WEAK = new Set(['AH', 'IH', 'ER']);   // the vowels unstressed syllables reduce to

// ---------- matching ----------

const MIN_SIM = 0.6;


/** Every swap and blend of one spooky word into one part of the name. */
function matches(model, part, spook, out) {
  const U = part.units, P = part.phones, Q = spook.phones, m = Q.length, n = P.length;
  if (!U.length || m < 2) return;
  const b = [0];
  for (const u of U) b.push(b[b.length - 1] + u.phones.length);
  const letters = (from, to) => U.slice(from, to).map((u) => u.letters).join('');
  const word = spook.w.toLowerCase();
  const multi = /[\s-]/.test(word);
  const orig = letters(0, U.length);

  const onset = onsetOf(orig), coda = codaOf(orig);
  // `heard` is the stretch of the name the spooky word was matched against,
  // `anchored` the part of the spooky word it was matched with.
  const emit = (kind, pieces, intended, cost, heard, anchored, keep) => {
    const sim = 1 - cost / Math.max(heard.length, anchored.length);
    if (sim < MIN_SIM) return;
    // Enough of the spooky word must be heard exactly, or it is a stretch.
    const exact = lcs(heard, anchored);
    if (exact < Math.max(2, Math.ceil(anchored.length / 2))) return;
    if (kind === 'blend') {
      // A blend hangs on its overlap: three sounds, or two with a full vowel
      // heard on both sides. An overlap on a reduced "un" or "in" is no pun.
      const full = anchored.some((p) => isVowel(p) && !WEAK.has(p) && heard.includes(p));
      if (anchored.length < 3 && !full) return;
    }
    const spelled = spell(model, pieces, intended, cost === 0, onset, coda);
    if (!spelled || spelled.replace(/-/g, '') === orig) return;   // no pun if nothing changed
    // A pun needs both halves recognisable. The name: how much of it is still
    // heard, and how much still looks the same. The spooky word: how closely
    // it was heard, and how much of it there is.
    const kept = 1 - distance(P, intended) / Math.max(n, intended.length);
    const looks = part.initial ? 1 : 1 - lev(orig, spelled.replace(/-/g, '')) / Math.max(orig.length, spelled.length);
    const name = 0.55 * kept + 0.45 * looks;
    const spooky = sim * (0.5 + 0.1 * Math.min(anchored.length, 5));
    const score = Math.pow(Math.max(0, name), 0.6) * Math.pow(spooky, 0.4) + keep;
    out.push({ kind, part, spook, text: cap(spelled), score, cost });
  };

  for (let a = 0; a < U.length; a++) {
    // DP of P[b[a]..] against Q: D[i][j] = cost of the first i name phones
    // from b[a] against the first j spooky phones.
    const rows = n - b[a];
    const D = [new Float64Array(m + 1)];
    for (let j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + indel(Q[j - 1]);
    for (let i = 1; i <= rows; i++) {
      const r = new Float64Array(m + 1), p = P[b[a] + i - 1];
      r[0] = D[i - 1][0] + indel(p);
      for (let j = 1; j <= m; j++) r[j] = Math.min(D[i - 1][j] + indel(p), r[j - 1] + indel(Q[j - 1]), D[i - 1][j - 1] + sub(p, Q[j - 1]));
      D.push(r);
    }
    // SWAP: units a..e-1 become the whole spooky word.
    for (let e = a + 1; e <= U.length; e++) {
      const span = P.slice(b[a], b[e]);
      if (!span.some(isVowel) && !part.initial) continue;
      const whole = a === 0 && e === U.length;
      if (multi && !whole) continue;
      if (part.initial && !whole) continue;
      const intended = [...P.slice(0, b[a]), ...Q, ...P.slice(b[e])];
      emit('swap', [letters(0, a), word, letters(e, U.length)], intended, D[b[e] - b[a]][m], span, Q, part.initial ? 0.06 : whole ? -0.04 : 0);
    }
    // BLEND (tail): the name from unit a on is the start of the spooky word.
    if (a > 0 && !multi && !part.initial) {
      for (let k = 2; k < m; k++) {
        if (!Q.slice(0, k).some(isVowel)) continue;
        const intended = [...P.slice(0, b[a]), ...Q];
        emit('blend', [letters(0, a), word], intended, D[rows][k], P.slice(b[a]), Q.slice(0, k), -0.02);
      }
    }
  }
  // BLEND (head): the spooky word's end is the name's start.
  if (!multi && !part.initial) {
    for (let e = 1; e < U.length; e++) {
      const head = P.slice(0, b[e]);
      if (!head.some(isVowel)) continue;
      for (let k = 1; k < m - 1; k++) {
        const tail = Q.slice(k);
        const intended = [...Q, ...P.slice(b[e])];
        emit('blend', [word, letters(e, U.length)], intended, distance(head, tail), head, tail, -0.02);
      }
    }
  }
}

// ---------- the handful ----------

/**
 * Spooky names for `name`. `vocab` is data/spooks.json; `model` data/g2p.json.
 * Returns up to `count` results, best-first for seed '' and a varied deal
 * from the top for any other seed.
 */
export function spookify(name, { model, vocab, seed = '', count = 6 } = {}) {
  const clean = String(name || '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return { name: '', results: [] };
  const parts = parse(model, clean);
  const spooks = vocab.map((s) => ({ ...s, phones: decode(s.ph) }));
  const raw = [];
  for (const part of parts) if (part.units.length) for (const s of spooks) matches(model, part, s, raw);

  // One result per (part, spooky word), its best spelling.
  const best = new Map();
  for (const r of raw) {
    const key = parts.indexOf(r.part) + '|' + r.spook.w;
    if (!best.has(key) || best.get(key).score < r.score) best.set(key, r);
  }
  let cands = [...best.values()].map((r) => ({
    text: assemble(parts, new Map([[r.part, r.text]])),
    kind: r.kind, spook: r.spook.w, part: r.part.text, score: r.score,
  }));

  // When sound alone runs thin, the other Treehouse moves:
  const named = parts.filter((p) => p.units.length && !p.initial);
  // A nickname goes after the first whole word (after "Mary-Kate", not "Mary").
  const words = parts.filter((p) => p.joiner === ' ');
  const firstWord = words.length && parts.some((p) => p.units.length && parts.indexOf(p) > parts.indexOf(words[0])) ? words[0] : null;
  const nickname = (word) => firstWord
    ? assemble(parts, new Map([[firstWord, `${firstWord.text} “${cap(word)}”`]]))
    : `${assemble(parts, new Map())} “${cap(word)}”`;
  const nick = (p, word) => firstWord && p === named[0] ? nickname(word) : null;
  for (const p of named) for (const s of spooks) {
    // EPITHET: an alliterating adjective (Morbid Madison).
    if (s.k === 'a' && s.phones[0] === p.phones[0] && !isVowel(p.phones[0])) {
      const text = nick(p, s.w) ?? `${cap(s.w)} ${assemble(parts, new Map())}`;
      cands.push({ text, kind: 'epithet', spook: s.w, part: p.text, score: 0.6 + (s.phones[1] === p.phones[1] ? 0.06 : 0) });
    }
    // RHYME: a nickname that rhymes with the name (Al “Halloween” Jean).
    const r = rime(p.phones), rs = rime(s.phones);
    if (r && rs && r.join(' ') === rs.join(' ') && s.phones.length > r.length && !WEAK.has(r[0]) && s.w.toLowerCase() !== fold(p.text).toLowerCase() && !/\s/.test(s.w)) {
      const text = nickname(s.w);
      cands.push({ text, kind: 'rhyme', spook: s.w, part: p.text, score: 0.62 + 0.03 * Math.min(s.phones.length, 4) });
    }
  }
  // AFFIX: the monster's own ending on the surname (Jeanenstein, Brooksula).
  const last = named[named.length - 1];
  if (last) {
    const stem = last.text.replace(/[^\p{L}]+$/u, '');
    const endsVowel = /[aeiouy]$/i.test(stem);
    const affixes = [
      ['Frankenstein', endsVowel ? stem.replace(/[aeiouy]+$/i, '') + 'enstein' : stem + 'enstein'],
      ['Dracula', endsVowel ? stem.replace(/[aeiouy]+$/i, '') + 'ula' : stem + 'ula'],
    ];
    for (const [w, t] of affixes) {
      if (t.length < 5) continue;
      cands.push({ text: assemble(parts, new Map([[last, t]])), kind: 'affix', spook: w, part: last.text, score: 0.56 });
    }
    cands.push({ text: `Count ${assemble(parts, new Map())}`, kind: 'affix', spook: 'Count', part: '', score: 0.5 });
  }

  // DOUBLES: the best pun on two different parts at once (Bat Groaning),
  // only when both would stand on their own.
  const byPart = new Map();
  for (const r of best.values()) if (!byPart.has(r.part) || byPart.get(r.part).score < r.score) byPart.set(r.part, r);
  const tops = [...byPart.values()].sort((x, y) => y.score - x.score);
  if (tops.length >= 2 && tops[1].score > 0.76 && tops[0].spook.w !== tops[1].spook.w) {
    cands.push({
      text: assemble(parts, new Map([[tops[0].part, tops[0].text], [tops[1].part, tops[1].text]])),
      kind: 'double', spook: tops[0].spook.w + ' + ' + tops[1].spook.w, part: '', score: (tops[0].score + tops[1].score) / 2 + 0.02,
    });
  }

  // House rules: never volunteer an ugly string the name did not already hold.
  const had = (t) => (fold(t).toLowerCase().replace(/[^a-z]/g, '').match(new RegExp(BANNED.source, 'g')) || []).length;
  const base = had(clean);
  cands = cands.filter((c) => had(c.text) <= base);

  // Deal: seed '' is the ranking itself; any other seed draws from the top,
  // weighted by score, never the same spooky word twice.
  cands.sort((x, y) => y.score - x.score || (x.text < y.text ? -1 : 1));
  const seen = new Set(), pool = [];
  for (const c of cands) {
    if (seen.has(c.text.toLowerCase())) continue;
    seen.add(c.text.toLowerCase()); pool.push(c);
    if (pool.length >= Math.max(24, count * 3)) break;
  }
  const picked = [], used = new Set();
  let epithets = 0;
  const take = (c) => { picked.push(c); used.add(c.spook); if (FILLER.has(c.kind)) epithets++; };
  const ok = (c) => !used.has(c.spook) && (!FILLER.has(c.kind) || epithets < 2);
  if (!seed) {
    for (const c of pool) { if (picked.length >= count) break; if (ok(c)) take(c); }
    // Short of a handful, the fillers make up the rest.
    for (const c of pool) { if (picked.length >= count) break; if (!picked.includes(c) && !used.has(c.spook)) take(c); }
  } else {
    const rng = rngFrom(clean.toLowerCase() + '|' + seed);
    const left = pool.slice();
    while (picked.length < count && left.length) {
      let live = left.filter(ok);
      if (!live.length) live = left.filter((c) => !used.has(c.spook));
      if (!live.length) break;
      const w = live.map((c) => Math.pow(Math.max(0.01, c.score), 6));
      let t = rng() * w.reduce((s, x) => s + x, 0), i = 0;
      while (i < live.length - 1 && (t -= w[i]) > 0) i++;
      take(live[i]);
      left.splice(left.indexOf(live[i]), 1);
    }
  }
  picked.sort((x, y) => y.score - x.score);
  return { name: clean, results: picked.map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 })) };
}

/**
 * What a rhyme has to share: the last vowel and everything after it — and, when
 * nothing comes after it, the sound before it too. Every name ending in "-ee"
 * would otherwise rhyme with "banshee"; Harry and eerie share the r.
 */
function rime(phones) {
  for (let i = phones.length - 1; i >= 0; i--) {
    if (!isVowel(phones[i])) continue;
    if (i === phones.length - 1) return i > 0 ? phones.slice(i - 1) : null;
    return phones.slice(i);
  }
  return null;
}

function assemble(parts, replaced) {
  return parts.map((p, i) => (replaced.get(p) ?? p.text) + (i < parts.length - 1 ? p.joiner : '')).join('');
}

/** Name → how the engine hears it, for the page's "how it heard you" line. */
export function hear(model, name) {
  return parse(model, String(name || '').trim()).map((p) => ({ text: p.text, phones: p.phones }));
}
