// names — a procedural name-set engine.
//
// One seed → one coherent set of N names (default 300) that read as if they
// came from a single invented culture: thematically linked, all unique, and
// mutually DISTINCT (no two names within edit distance 1 of each other, no
// name a prefix of another).
//
// The similarity vectors:
//   culture  — a phonotactic wardrobe (onsets/nuclei/codas/morphemes/orthography).
//              Blendable: "norse+romance" merges two wardrobes.
//   setting  — a register transform laid over the culture (classical / fantasy /
//              scifi / fey / wasteland): sound shifts, clipping, epithets.
//   kind     — what is being named: given, family, place, full (given + family).
//
// Thematic linkage is not just "same culture": every seed draws a CHARTER — a
// sub-dialect of the culture. It subsamples the wardrobe, elects favorite
// sounds (Zipf-boosted so they recur across the set), fixes a handful of
// ending morphemes, and freezes the register's mutation knobs. Two sets from
// the same culture but different seeds are cousins, not twins.
//
// Deterministic: same (seed, culture, setting, kind, count) → the same set on
// any machine, forever. No Date.now(), no unseeded Math.random(). The module
// runs identically in the Cloudflare worker, the browser, and node (selftest
// in engine.selftest.mjs).

// ---------- seeded PRNG (xmur3 + mulberry32, same lineage as borges) ----------

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

function rngFrom(seedStr) {
  return mulberry32(xmur3(String(seedStr))());
}

// ---------- culture packs ----------
//
// Weighted lists: an item listed twice is twice as likely. '' in onsets means
// a vowel-initial syllable is allowed. Endings are kind-specific morphemes
// spliced onto a stem. `pre` lists are optional prefixes (family patronymics,
// toponym heads). `ortho` rules run last, before capitalization.

export const CULTURES = {
  norse: {
    label: 'Norse', blurb: 'Fjord-cut Old Norse: hard clusters, -ulf and -dis, farmsteads ending in -vik and -heim.',
    syl: [2, 2, 2, 3],
    onsets: ['b', 'd', 'f', 'g', 'h', 'k', 'r', 'r', 's', 's', 't', 'v', 'th', 'hj', 'bj', 'sk', 'sn', 'gr', 'br', 'st', 'thr', 'ing'],
    nuclei: ['a', 'a', 'e', 'i', 'o', 'u', 'ei', 'au', 'ja', 'jo', 'y'],
    codas: ['r', 'r', 'l', 'n', 'n', 'nd', 'rd', 'lf', 'rn', 'ld', 'gn', 'm', 'kk', 'gg'],
    codaMid: 0.30, codaFin: 0.72,
    given: ['ulf', 'grim', 'mund', 'vald', 'dis', 'run', 'hild', 'gerd', 'leif', 'stein', 'brand', 'frid'],
    family: ['sson', 'sdottir', 'sen', 'skjold', 'nagli'],
    place: ['vik', 'fjord', 'heim', 'gard', 'nes', 'dal', 'fell', 'strand', 'borg', 'stad'],
    ortho: [[/jj/g, 'j'], [/aa/g, 'á']],
  },

  hellenic: {
    label: 'Hellenic', blurb: 'Aegean Greek: ph, th, and ch, heroes in -os and -eus, islands in -os and cities in -polis.',
    syl: [2, 3, 3, 4],
    onsets: ['k', 'l', 'm', 'n', 'p', 't', 't', 'd', 's', 's', 'th', 'ph', 'ch', 'x', 'kl', 'tr', 'str', 'pr', ''],
    nuclei: ['a', 'a', 'e', 'e', 'i', 'o', 'o', 'ai', 'ei', 'eu', 'y', 'io'],
    codas: ['n', 'n', 's', 's', 'r', 'x'],
    codaMid: 0.18, codaFin: 0.62,
    given: ['os', 'on', 'ias', 'eus', 'ippe', 'andra', 'ache', 'emos', 'ea', 'is'],
    family: ['ides', 'akis', 'atos', 'ogenes', 'archos'],
    place: ['polis', 'ene', 'eia', 'ikon', 'os', 'yra', 'inth'],
    ortho: [[/y([aeiou])/g, 'i$1']],
  },

  romance: {
    label: 'Romance', blurb: 'Sun-warmed Italo-Iberian: open vowels, -ella and -ino, towns under Monte- and San-.',
    syl: [2, 3, 3, 3, 4],
    onsets: ['b', 'c', 'd', 'f', 'g', 'l', 'l', 'm', 'm', 'n', 'p', 'r', 'r', 's', 't', 'v', 'br', 'tr', 'fr', 'gl'],
    nuclei: ['a', 'a', 'a', 'e', 'e', 'i', 'i', 'o', 'o', 'u', 'ia', 'io', 'ie'],
    codas: ['n', 'r', 'l', 's'],
    codaMid: 0.10, codaFin: 0.28,
    given: ['o', 'a', 'io', 'ella', 'ino', 'etta', 'ando', 'enza', 'ita'],
    family: ['ini', 'etti', 'aro', 'ese', 'aldi', 'anza', 'ucci'],
    place: ['ona', 'ora', 'ina', 'aggio', 'etto', 'ande'],
    placePre: ['Monte', 'San ', 'Villa', 'Porta'],
    ortho: [[/c([ei])/g, 'ch$1'], [/ii/g, 'i']],
  },

  slavic: {
    label: 'Slavic', blurb: 'Birch-forest Slavic: zl- and vl- clusters, -mir and -slava, cities in -grad and -itsa.',
    syl: [2, 2, 3, 3],
    onsets: ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'v', 'z', 'br', 'dr', 'vl', 'zl', 'sv', 'kr', 'ml', 'zh'],
    nuclei: ['a', 'a', 'e', 'e', 'i', 'o', 'o', 'u', 'ya', 'ye'],
    codas: ['n', 'r', 'v', 'k', 'l', 'st', 'sk', 'zd'],
    codaMid: 0.26, codaFin: 0.55,
    given: ['mir', 'slav', 'slava', 'ana', 'ka', 'ko', 'usha', 'yena', 'dan'],
    family: ['ov', 'ova', 'ev', 'sky', 'ich', 'enko', 'itsyn'],
    place: ['grad', 'ovo', 'itsa', 'yany', 'ansk', 'nik'],
    ortho: [[/yy/g, 'y']],
  },

  brythonic: {
    label: 'Brythonic', blurb: 'Rain-dark Welsh borders: gw-, ll-, and rh-, names in -wen and -ydd, farms under Aber- and Llan-.',
    syl: [2, 2, 3],
    onsets: ['b', 'c', 'd', 'g', 'gw', 'gw', 'h', 'll', 'll', 'm', 'n', 'p', 'r', 'rh', 's', 't', 'tr', 'br'],
    nuclei: ['a', 'a', 'e', 'e', 'i', 'o', 'u', 'w', 'y', 'y', 'ae', 'ei'],
    codas: ['n', 'n', 'r', 'l', 'dd', 'th', 'ch', 's', 'd'],
    codaMid: 0.24, codaFin: 0.66,
    given: ['wen', 'wyn', 'ydd', 'eth', 'ian', 'edd', 'nor', 'fael'],
    family: ['ys', 'wys', 'or'],
    familyPre: ['Ap ', 'Ap ', 'Ferch '],
    place: ['wy', 'fach', 'goch', 'dun', 'fawr'],
    placePre: ['Aber', 'Caer', 'Llan', 'Pen', 'Tre'],
    ortho: [[/ww/g, 'w'], [/yy/g, 'y']],
  },

  desertic: {
    label: 'Desertic', blurb: 'Caravan-route Semitic: kh and q, long aa, houses under al-, wells and forts under Wadi- and Qasr-.',
    syl: [2, 2, 3, 3],
    onsets: ['b', 'd', 'f', 'h', 'j', 'k', 'l', 'm', 'n', 'q', 'r', 'r', 's', 'sh', 't', 'y', 'z', 'kh', 'gh'],
    nuclei: ['a', 'a', 'a', 'i', 'i', 'u', 'aa', 'ai'],
    codas: ['b', 'd', 'l', 'm', 'n', 'r', 's', 'sh', 'q'],
    codaMid: 0.30, codaFin: 0.68,
    given: ['im', 'ir', 'ah', 'ana', 'eem', 'oud', 'ila', 'af'],
    family: ['i', 'ani', 'awi', 'oun'],
    familyPre: ['al-', 'al-', 'bin '],
    place: ['ah', 'ain', 'iyya', 'ar'],
    placePre: ['Qasr ', 'Wadi ', 'Bab '],
    ortho: [[/aaa+/g, 'aa'], [/shh/g, 'sh'], [/hh/g, 'h']],
  },

  steppe: {
    label: 'Steppe', blurb: 'Wind-flattened Turkic: vowel harmony (each name commits to back or front vowels), -bek and -gul, camps in -kent and -tau.',
    syl: [2, 2, 3],
    onsets: ['b', 'ch', 'd', 'j', 'k', 'k', 'kh', 'm', 'n', 's', 't', 't', 'y', 'z', 'gh', ''],
    harmony: {
      back: ['a', 'a', 'o', 'u', 'ai'],
      front: ['e', 'e', 'i', 'i', 'ei'],
    },
    nuclei: ['a', 'e', 'i', 'o', 'u'],
    codas: ['n', 'r', 'k', 'l', 't', 'sh', 'z', 'gh'],
    codaMid: 0.32, codaFin: 0.70,
    given: ['bek', 'tai', 'gul', 'nar', 'ar', 'sun', 'mal'],
    family: ['oglu', 'bay', 'ide'],
    place: ['kent', 'tau', 'kul', 'orda', 'su'],
    ortho: [[/ghgh/g, 'gh']],
  },

  nihon: {
    label: 'Nihon', blurb: 'Island Japonic: strict open syllables, given names in -ko and -ro, families in -moto and -kawa.',
    syl: [2, 3, 3, 4],
    onsets: ['k', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'r', 'w', 'g', 'z', 'd', 'b', 'sh', 'ch', 'ts', ''],
    nuclei: ['a', 'a', 'i', 'i', 'u', 'e', 'o', 'o'],
    codas: ['n'],
    codaMid: 0.06, codaFin: 0.14,
    given: ['ko', 'mi', 'ro', 'ka', 'to', 'shi', 'na', 'ya'],
    family: ['moto', 'mura', 'yama', 'kawa', 'da', 'no', 'saki', 'bara'],
    place: ['hama', 'saka', 'shima', 'gawa', 'oka', 'zaki'],
    ortho: [[/si/g, 'shi'], [/ti/g, 'chi'], [/tu/g, 'tsu'], [/hu/g, 'fu'], [/tsh/g, 'ch'], [/ssh/g, 'sh']],
  },

  polynesian: {
    label: 'Polynesian', blurb: 'Open-ocean Polynesian: few consonants, every syllable open, long rolling names, Te- headlands.',
    syl: [3, 3, 4, 4, 5],
    onsets: ['h', 'k', 'k', 'l', 'm', 'm', 'n', 'p', 't', 't', 'w', 'f', 'r', 'ng', '', ''],
    nuclei: ['a', 'a', 'a', 'e', 'i', 'i', 'o', 'u', 'ai', 'au', 'oa'],
    codas: [],
    codaMid: 0, codaFin: 0,
    given: ['ani', 'oa', 'ina', 'alu', 'ema'],
    family: ['nui', 'loa', 'tonga', 'rangi'],
    place: ['nui', 'moana', 'tua', 'roa'],
    placePre: ['Te', 'Mau'],
    ortho: [[/([aeiou])\1\1/g, '$1$1']],
  },

  mesoa: {
    label: 'Mesoa', blurb: 'Lake-valley Nahuatl: tl and tz, honorifics in -tzin, cities in -tlan and -tepec.',
    syl: [2, 3, 3, 4],
    onsets: ['ch', 'c', 'h', 'm', 'n', 'p', 'qu', 't', 'tl', 'tl', 'x', 'y', 'z', 'tz', ''],
    nuclei: ['a', 'a', 'e', 'i', 'i', 'o'],
    codas: ['l', 'n', 'tl', 'z', 'c', 'uh'],
    codaMid: 0.22, codaFin: 0.60,
    given: ['tzin', 'catl', 'atl', 'el', 'itl'],
    family: ['coatl', 'tzin', 'can', 'huitl'],
    place: ['tlan', 'co', 'pan', 'calco', 'tepec', 'titlan'],
    ortho: [[/tltl/g, 'tl'], [/tztz/g, 'tz']],
  },

  frankish: {
    label: 'Frankish', blurb: 'Continental Germanic: two-stem compounds in -bert and -hild, towns in -burg and -feld.',
    syl: [2, 2, 3],
    onsets: ['b', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'r', 's', 'w', 'br', 'fr', 'gr', 'ad', 'theo'],
    nuclei: ['a', 'a', 'e', 'e', 'i', 'o', 'u', 'ie'],
    codas: ['n', 'r', 'l', 'd', 't', 'rt', 'ld', 'nd'],
    codaMid: 0.28, codaFin: 0.60,
    given: ['bert', 'hard', 'mund', 'wig', 'lind', 'trud', 'fried', 'gard', 'helm'],
    family: ['inger', 'mann', 'hart', 'wald'],
    place: ['burg', 'feld', 'stein', 'hafen', 'bruck', 'dorf'],
    ortho: [[/uu/g, 'u']],
  },

  veil: {
    label: 'Veil', blurb: 'No earthly source: a liquid, vowel-forward otherworld — -iel and -ara, places in -oth and -ora.',
    syl: [2, 3, 3, 4],
    onsets: ['l', 'l', 's', 'v', 'v', 'th', 'sh', 'y', 'z', 'n', 'm', 'r', 'r', '', ''],
    nuclei: ['a', 'a', 'e', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ea', 'io', 'ei'],
    codas: ['l', 'n', 'r', 's', 'th', 'm'],
    codaMid: 0.16, codaFin: 0.50,
    given: ['iel', 'ara', 'ion', 'ys', 'eth', 'ael', 'una'],
    family: ['ione', 'aris', 'enne', 'avel'],
    place: ['oth', 'ora', 'ir', 'aeth', 'una'],
    ortho: [[/([aeiou])\1\1/g, '$1$1']],
  },
};

// ---------- setting registers ----------
//
// A setting is a transform laid over the culture: consistent sound shifts
// (chosen once per charter, applied to every name), a syllable-count bias,
// and — for the `full` kind — how a whole name is assembled (epithets,
// call-sign hyphens). `shifts` are [regex, replacement, probability that this
// charter adopts the shift at all]; adopted shifts apply to every name.

export const SETTINGS = {
  classical: {
    label: 'Classical', blurb: 'The culture as itself. No transform.',
    shifts: [], sylBias: 0,
    epithets: null, joiner: ' ',
  },
  fantasy: {
    label: 'High Fantasy', blurb: 'Archaicized: y for i, ae digraphs, and a chance of an epithet in place of a family name.',
    shifts: [
      [/i(?=[^aeiou]*$)/, 'y', 0.6],   // final-syllable i → y (Elric → Elryc territory)
      [/e(?=[dlnr])/, 'ae', 0.35],
      [/c(?=[aou])/, 'k', 0.4],         // fantasy loves a hard k
    ],
    sylBias: 0,
    epithets: ['the Bold', 'the Grey', 'the Unbowed', 'the Wanderer', 'of the Ash Gate', 'of the Long Watch', 'Thrice-Crowned', 'the Quiet', 'of the West Marches', 'Oathkeeper', 'the Younger', 'Stormsworn'],
    epithetProb: 0.3, joiner: ' ',
  },
  scifi: {
    label: 'Spacer', blurb: 'Clipped for comms: c hardens to k, qu to q, names run a syllable short, full names hyphenate like call signs.',
    shifts: [
      [/c(?![h])/, 'k', 0.85],
      [/qu/, 'q', 0.8],
      [/ph/, 'f', 0.7],
      [/[aeiou]$/, '', 0.45],           // clip trailing vowel
    ],
    sylBias: -1,
    epithets: null, joiner: '-',
  },
  fey: {
    label: 'Feywild', blurb: 'Softened and stretched: doubled vowels, c for k, liquid glides; full names flow unhyphenated.',
    shifts: [
      [/k/, 'c', 0.6],
      [/([ae])(?=[^aeiou][aeiou])/, '$1$1', 0.4],
      [/r(?=[aeiou])/, 'rh', 0.3],
    ],
    sylBias: 1,
    epithets: ['of the Hollow Hill', 'Dewsworn', 'of the Third Ring', 'Moth-Mothered', 'the Ever-Laughing', 'of No Shadow'],
    epithetProb: 0.22, joiner: ' ',
  },
  wasteland: {
    label: 'Wasteland', blurb: "Worn down by use: unstressed vowels collapse to apostrophes, soft endings shear off.",
    shifts: [
      [/(?<=[^aeiou\s'])[aeiou](?=[^aeiou][aeiou])/, "'", 0.55], // medial vowel → '
      [/[aeiou]$/, '', 0.5],
      [/th/, 't', 0.35],
    ],
    sylBias: 0,
    epithets: ['Nine-Fingers', 'of the Glass Flats', 'Rustborn', 'the Twice-Buried', 'Saltblood', 'of the Last Road'],
    epithetProb: 0.25, joiner: ' ',
  },
};

export const KINDS = {
  given: { label: 'Given names', blurb: 'Personal names.' },
  family: { label: 'Family names', blurb: 'Surnames, houses, patronymics.' },
  place: { label: 'Place names', blurb: 'Settlements, regions, landmarks.' },
  full: { label: 'Full names', blurb: 'Given + family (or epithet, if the setting carries them).' },
};

// ---------- charter: the per-seed sub-dialect ----------

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Deterministic subsample: keep ~frac of arr (at least min), preserving order.
function subsample(rng, arr, frac, min) {
  if (!arr || arr.length === 0) return [];
  const keep = arr.filter(() => rng() < frac);
  if (keep.length >= Math.min(min, arr.length)) return keep;
  // too aggressive — take a deterministic rotation instead
  const start = Math.floor(rng() * arr.length);
  const out = [];
  for (let i = 0; i < Math.min(min, arr.length); i++) out.push(arr[(start + i) % arr.length]);
  return out;
}

// Boost a few "favorite" items by re-appending copies — the Zipf thumb on the
// scale that makes a set's sounds recur enough to feel related.
function elect(rng, arr, n, copies) {
  const favs = [];
  const pool = arr.slice();
  for (let i = 0; i < n && pool.length; i++) {
    const f = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    favs.push(f);
    for (let c = 0; c < copies; c++) arr.push(f);
  }
  return favs;
}

function resolveCulture(cultureKey) {
  const parts = String(cultureKey).split('+').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) if (!CULTURES[p]) return null;
  if (parts.length === 1) return { key: parts[0], ...CULTURES[parts[0]] };
  // Blend: concatenate wardrobes, average the knobs. Two cultures max is
  // plenty — more just turns to mud.
  const [a, b] = [CULTURES[parts[0]], CULTURES[parts[1]]];
  const cat = (k) => [...(a[k] || []), ...(b[k] || [])];
  return {
    key: parts.slice(0, 2).join('+'),
    label: `${a.label} × ${b.label}`,
    blurb: `A border culture: ${a.label} bones wearing ${b.label} clothes (and vice versa).`,
    syl: cat('syl'),
    onsets: cat('onsets'), nuclei: cat('nuclei'), codas: cat('codas'),
    codaMid: (a.codaMid + b.codaMid) / 2, codaFin: (a.codaFin + b.codaFin) / 2,
    given: cat('given'), family: cat('family'), place: cat('place'),
    familyPre: cat('familyPre'), placePre: cat('placePre'),
    harmony: a.harmony || b.harmony || null,
    ortho: [...(a.ortho || []), ...(b.ortho || [])],
  };
}

function buildCharter(rng, culture, setting, kind) {
  const onsets = subsample(rng, culture.onsets.slice(), 0.72, 6);
  const nuclei = subsample(rng, culture.nuclei.slice(), 0.75, 4);
  const codas = subsample(rng, culture.codas.slice(), 0.7, Math.min(3, culture.codas.length));
  const favOnsets = elect(rng, onsets, 3, 2);
  const favNuclei = elect(rng, nuclei, 2, 2);

  const endingsPool = culture[kind === 'full' ? 'given' : kind] || culture.given;
  const endings = subsample(rng, endingsPool.slice(), 0.6, Math.min(5, endingsPool.length));
  const familyEndings = kind === 'full'
    ? subsample(rng, (culture.family || []).slice(), 0.6, Math.min(4, (culture.family || []).length))
    : null;

  // Adopt (or not) each of the setting's sound shifts — once, for the whole set.
  const shifts = [];
  for (const [re, repl, prob] of setting.shifts) {
    if (rng() < prob) shifts.push([new RegExp(re.source, 'g' + re.flags.replace(/g/g, '')), repl]);
  }

  const harmony = culture.harmony || null;
  const pre = {
    family: culture.familyPre || null,
    place: culture.placePre || null,
  };

  return {
    onsets, nuclei, codas,
    favorites: { onsets: favOnsets, nuclei: favNuclei },
    endings, familyEndings,
    endProb: { given: 0.55, family: 0.8, place: 0.72, full: 0.55 }[kind] ?? 0.6,
    preProb: 0.4,
    pre,
    shifts,
    harmony,
    syl: culture.syl.map((s) => Math.max(1, s + setting.sylBias)),
    codaMid: culture.codaMid, codaFin: culture.codaFin,
    ortho: culture.ortho || [],
    epithets: setting.epithets ? subsample(rng, setting.epithets.slice(), 0.7, 4) : null,
    epithetProb: setting.epithetProb || 0,
    joiner: setting.joiner || ' ',
  };
}

// ---------- stem synthesis ----------

const VOWEL = /[aeiouyáãäāéêīōöúü]/;

function buildStem(rng, ch, endings, endProb) {
  // Decide the ending first: a morpheme ending IS a syllable or two, so a
  // stem that will carry one runs a syllable short. Keeps names lean.
  const end = (endings && endings.length && rng() < endProb) ? pick(rng, endings) : null;
  let sylCount = pick(rng, ch.syl);
  if (end) sylCount = Math.max(1, sylCount - 1);
  const nuclei = ch.harmony ? pick(rng, [ch.harmony.back, ch.harmony.front]) : ch.nuclei;
  let s = '';
  let prevOnset = null;
  for (let i = 0; i < sylCount; i++) {
    let onset = pick(rng, ch.onsets);
    if (onset && onset === prevOnset) onset = pick(rng, ch.onsets); // one re-pick: favorites recur across the SET, not within a name
    prevOnset = onset;
    const nucleus = pick(rng, nuclei);
    const last = i === sylCount - 1;
    const wantCoda = ch.codas.length && rng() < (last ? ch.codaFin : ch.codaMid);
    const coda = wantCoda ? pick(rng, ch.codas) : '';
    s += onset + nucleus + coda;
  }
  if (end) {
    // splice: avoid vowel-vowel and doubled-consonant seams
    if (VOWEL.test(end[0]) && VOWEL.test(s[s.length - 1])) s = s.replace(/[aeiouy]+$/, '');
    if (s && end[0] === s[s.length - 1]) s = s.slice(0, -1);
    s += end;
  }
  return s;
}

// A polished part that is never a runt (settings like Spacer can clip a
// 1-syllable stem down to a single letter).
function buildPart(rng, ch, endings, endProb) {
  for (let t = 0; t < 6; t++) {
    const p = polish(buildStem(rng, ch, endings, endProb), ch);
    if (p.length >= 3) return p;
  }
  return polish(buildStem(rng, ch, endings, 1), ch);
}

function polish(name, ch) {
  let s = name;
  for (const [re, repl] of ch.shifts) s = s.replace(re, repl);
  for (const [re, repl] of ch.ortho) s = s.replace(re, repl);
  s = s.replace(/(.)\1\1+/g, '$1$1');        // no triple letters
  s = s.replace(/^['-]+|['-]+$/g, '');       // no dangling separators
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function makeName(rng, ch, kind) {
  if (kind === 'full') {
    const given = buildPart(rng, ch, ch.endings, ch.endProb);
    if (ch.epithets && rng() < ch.epithetProb) {
      return given + ' ' + pick(rng, ch.epithets);
    }
    let family = buildPart(rng, ch, ch.familyEndings, 0.8);
    if (ch.pre.family && rng() < ch.preProb) family = capJoin(pick(rng, ch.pre.family), family);
    return given + ch.joiner + family;
  }
  let s = buildPart(rng, ch, ch.endings, ch.endProb);
  const pre = ch.pre[kind];
  if (pre && pre.length && rng() < ch.preProb) s = capJoin(pick(rng, pre), s);
  return s;
}

function capJoin(prefix, stem) {
  // "al-" + "Rashid" → "al-Rashid"; "Aber" + "Gwyn" → "Abergwyn" (fused heads lowercase the stem)
  if (/[\s-]$/.test(prefix)) return prefix + stem;
  return prefix + stem[0].toLowerCase() + stem.slice(1);
}

// ---------- distinctness ----------

function normKey(name) {
  return name.toLowerCase().replace(/[\s'\-]/g, '');
}

// True iff edit distance ≤ 1 (one substitution, insertion, or deletion).
function withinOneEdit(a, b) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i]) { if (++diff > 1) return false; }
    return true;
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; j++;
  }
  return true;
}

// ---------- the generator ----------

export const DEFAULT_COUNT = 300;
export const MAX_COUNT = 1000;

export function generateSet(opts = {}) {
  const seed = String(opts.seed ?? 'minomobi');
  const cultureKey = String(opts.culture ?? 'norse');
  const settingKey = String(opts.setting ?? 'classical');
  const kind = String(opts.kind ?? 'given');
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(opts.count) || DEFAULT_COUNT)));

  const culture = resolveCulture(cultureKey);
  if (!culture) throw new Error(`unknown culture "${cultureKey}" — valid: ${Object.keys(CULTURES).join(', ')} (blend with "+")`);
  const setting = SETTINGS[settingKey];
  if (!setting) throw new Error(`unknown setting "${settingKey}" — valid: ${Object.keys(SETTINGS).join(', ')}`);
  if (!KINDS[kind]) throw new Error(`unknown kind "${kind}" — valid: ${Object.keys(KINDS).join(', ')}`);

  const rng = rngFrom(`${seed}|${culture.key}|${settingKey}|${kind}`);
  const ch = buildCharter(rng, culture, setting, kind);

  const names = [];
  const keys = [];
  const seen = new Set();
  const maxAttempts = count * 80;
  let attempts = 0;
  // Distinctness relaxes in tiers if the phonotactic space runs tight: full
  // rules → drop the prefix rule → exact-uniqueness only. Deterministic,
  // since the tier depends only on the attempt counter.
  const tier2 = count * 30, tier3 = count * 55;

  while (names.length < count && attempts < maxAttempts) {
    attempts++;
    const name = makeName(rng, ch, kind);
    const key = normKey(name);
    if (key.length < 3 || key.length > (kind === 'full' ? 26 : 14)) continue;
    if (seen.has(key)) continue;
    let ok = true;
    if (attempts < tier3) {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (withinOneEdit(key, k)) { ok = false; break; }
        if (attempts < tier2 && (k.startsWith(key) || key.startsWith(k))) { ok = false; break; }
      }
    }
    if (!ok) continue;
    seen.add(key);
    keys.push(key);
    names.push(name);
  }

  names.sort((a, b) => a.localeCompare(b));

  return {
    seed, culture: culture.key, cultureLabel: culture.label,
    setting: settingKey, kind, count: names.length, requested: count,
    charter: {
      favorites: ch.favorites,
      endings: ch.endings,
      familyEndings: ch.familyEndings || undefined,
      shifts: ch.shifts.map(([re, repl]) => `${re.source} → ${repl || '∅'}`),
      epithets: ch.epithets || undefined,
      harmony: !!ch.harmony,
    },
    names,
  };
}

// Metadata for UIs / the API's /cultures endpoint.
export function catalog() {
  return {
    cultures: Object.fromEntries(Object.entries(CULTURES).map(([k, v]) => [k, { label: v.label, blurb: v.blurb }])),
    settings: Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, { label: v.label, blurb: v.blurb }])),
    kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { label: v.label, blurb: v.blurb }])),
    blend: 'join two culture keys with "+" (e.g. norse+romance) for a border culture',
    defaults: { culture: 'norse', setting: 'classical', kind: 'given', count: DEFAULT_COUNT },
    maxCount: MAX_COUNT,
  };
}

// Browser <script type="module"> and worker both use the exports; node
// selftests and any non-module consumer can reach it via globalThis.
if (typeof globalThis !== 'undefined') {
  globalThis.NAMES = { generateSet, catalog, CULTURES, SETTINGS, KINDS };
}
