// The phone inventory and the letter-to-sound model, shared by the trainer
// (build-data.mjs), the pun engine (engine.js), the worker and the selftest.
//
// Phones are CMUdict's ARPABET with stress stripped. Inside the data files each
// phone is one character, so a pronunciation is a short string and the model's
// outputs pack small; `decode` / `encode` cross between the two.

export const PHONES = [
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'B', 'CH', 'D', 'DH', 'EH', 'ER', 'EY',
  'F', 'G', 'HH', 'IH', 'IY', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OY', 'P',
  'R', 'S', 'SH', 'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z', 'ZH',
];
const CODES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM';
const CODE_OF = new Map(PHONES.map((p, i) => [p, CODES[i]]));
const PHONE_OF = new Map(PHONES.map((p, i) => [CODES[i], p]));

export const encode = (arpa) => arpa.map((p) => CODE_OF.get(p.replace(/\d$/, ''))).join('');
export const decode = (s) => [...s].map((c) => PHONE_OF.get(c));

export const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
export const isVowel = (p) => VOWELS.has(p);

// ---------- letter to sound ----------
//
// Each letter of a word is pronounced as zero, one or two phones (the `x` of
// `box` is two, the `h` of `shoe` is none). Which, depends on the letters
// around it: the model is a table from a letter in context to its phones,
// trained on CMUdict's aligned spellings. Contexts grow outward from the letter
// in a fixed order (WINDOWS); a context is stored only where it predicts
// something different from the next-smaller one, and prediction takes the
// largest context present. `#` marks the word's edges.

export const WINDOWS = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4]];

export function contextKey(word, i, level) {
  const [l, r] = WINDOWS[level];
  const padded = '####' + word + '####';
  const at = i + 4;
  return level + padded.slice(at - l, at) + '[' + padded[at] + ']' + padded.slice(at + 1, at + 1 + r);
}

/**
 * The phones of a spelling, letter by letter: `[{ letter, phones: [...] }]`.
 * Keeping the alignment is the point. It says which letters make which sounds,
 * so a pun can swap the letters under a run of sounds and leave the rest of
 * the name as it was spelled.
 */
export function letterPhones(model, word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const out = [];
  for (let i = 0; i < w.length; i++) {
    let code = '';
    for (let level = WINDOWS.length - 1; level >= 0; level--) {
      const hit = model.table[contextKey(w, i, level)];
      if (hit !== undefined) { code = hit; break; }
    }
    out.push({ letter: w[i], phones: decode(code) });
  }
  return out;
}

export function pronounce(model, word) {
  return letterPhones(model, word).flatMap((x) => x.phones);
}
