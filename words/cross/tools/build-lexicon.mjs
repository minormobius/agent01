#!/usr/bin/env node
// Build the crossword answer lexicon and its clue shards.
//
// RUN BY HAND, OUTPUT COMMITTED — same contract as ../../tools/build-dawg.mjs,
// and for the same reason: a puzzle is a pure function of (seed, lexicon), so a
// lexicon rebuilt at deploy time would silently change every permalink anybody
// had ever shared. The build inputs are large and external; what is committed
// is the result plus MANIFEST.json, which records the SHA-256 of every input
// and of every output.
//
//   node words/cross/tools/build-lexicon.mjs \
//     --wordnet <dir with WordNet 3.1 index.* data.* *.exc> \
//     --freq    <norvig count_1w.txt: "word\tcount" lines> \
//     --enable  words/dict/enable1.txt \
//     --out     words/cross/dict
//
// Sources (both re-downloadable, both usable here):
//   https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz   WordNet 3.1, Princeton licence
//   https://norvig.com/ngrams/count_1w.txt                Google Web 1T unigrams via Norvig
//
// ---------------------------------------------------------- what gets in --
//
// An answer must clear three bars, and the third is the one that shapes the
// list: it must be in ENABLE (so it is a word the other half of this surface
// already agrees is a word), it must have frequency data (so it can be ranked),
// and IT MUST HAVE A CLUE. The third bar is not a quality heuristic, it is a
// hard requirement — an answer nobody can write a clue for cannot appear in a
// puzzle, so it has no business in the filler's dictionary either, where it
// would only be a trap the fill walks into and the clue stage has to reject.
//
// WordNet is what supplies the clue, and WordNet indexes base forms only: no
// DOGS, no RUNNING, no EASIEST. Excluding inflections is not an option — they
// are a third of the list and they are the filler's glue, because a word that
// can take an S is a word that fits somewhere. So inflections are recovered
// with WordNet's own morphology (the *.exc exception lists plus the standard
// detachment rules) and clued from the base's gloss carrying a grammatical tag:
// DOGS is "a member of the genus Canis" tagged `pl`, and the solver sees the
// tag rendered as "(pl.)". That is how a paper crossword marks number and
// tense too, so it reads as a clue rather than as an apology.
//
// WHAT IS KEPT OUT is the other half of the job. ENABLE is a Scrabble list and
// asks only whether a word exists; a puzzle ASSERTS its answers at a solver, so
// the two lists cannot be the same. Three filters run: WordNet's own
// "(ethnic slur)" / "(offensive)" gloss markers, the hand-written
// tools/blocklist.txt, and inflection propagation, so blocking a base blocks
// everything that resolves to it.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const POS_FILES = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' };
/** Answers shorter than 3 never appear (no slot is shorter); 15 is a full row. */
const MIN_LEN = 3;
const MAX_LEN = 15;
/** How many answers to keep, best-ranked first. */
const TARGET = 50000;
/** A clue longer than this is a paragraph, not a clue. */
const MAX_CLUE = 90;
/**
 * WordNet flags a small number of synsets in the gloss itself. Tested against
 * the RAW gloss, before the parenthetical is stripped — that is where the flag
 * lives. It catches 13 synsets, which is why blocklist.txt exists as well.
 */
const OFFENSIVE_MARKER =
  /\((?:ethnic slur|slur|offensive[^)]*|disparaging|derogatory|pejorative|vulgar|obscene|taboo)[^)]*\)|\boffensive term\b/i;

// ------------------------------------------------------------- arguments --

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}
const opt = args(process.argv);
for (const need of ['wordnet', 'freq', 'enable', 'out']) {
  if (!opt[need]) {
    console.error(`missing --${need}\n\nsee the header of ${path.basename(import.meta.url)}`);
    process.exit(2);
  }
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// --------------------------------------------------------------- WordNet --

/** synset key (`n00001740`) -> raw gloss text */
function readSynsets(dir) {
  const glosses = new Map();
  for (const [name, p] of Object.entries(POS_FILES)) {
    const txt = fs.readFileSync(path.join(dir, `data.${name}`), 'utf8');
    for (const line of txt.split('\n')) {
      if (!line || line.startsWith('  ')) continue; // licence header
      const bar = line.indexOf(' | ');
      if (bar < 0) continue;
      glosses.set(p + line.slice(0, 8), line.slice(bar + 3).trim());
    }
  }
  return glosses;
}

/**
 * lemma -> [{pos, off}] in WordNet's own sense order, which is frequency order
 * after the database is ground: sense 1 is the one to clue with.
 * Multi-word lemmas (`dog_house`) and anything with a digit or apostrophe are
 * dropped here — a crossword answer is A-Z.
 */
function readIndex(dir) {
  const senses = new Map();
  for (const [name, p] of Object.entries(POS_FILES)) {
    const txt = fs.readFileSync(path.join(dir, `index.${name}`), 'utf8');
    for (const line of txt.split('\n')) {
      if (!line || line.startsWith('  ')) continue;
      const f = line.trim().split(/\s+/);
      const lemma = f[0];
      if (!/^[a-z]+$/.test(lemma)) continue;
      const ptrCnt = Number(f[3]);
      // lemma pos synset_cnt p_cnt [ptr_symbol...] sense_cnt tagsense_cnt [offset...]
      const offsets = f.slice(4 + ptrCnt + 2);
      if (!senses.has(lemma)) senses.set(lemma, []);
      const arr = senses.get(lemma);
      let n = 0;
      for (const off of offsets) {
        if (!/^\d{8}$/.test(off)) continue;
        arr.push({ pos: p, off, lemma, sense: ++n });
      }
    }
  }
  return senses;
}

/** inflected -> [{base, pos}] from noun.exc / verb.exc / adj.exc / adv.exc. */
function readExceptions(dir) {
  const exc = new Map();
  for (const [name, p] of Object.entries(POS_FILES)) {
    const file = path.join(dir, `${name}.exc`);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const [inflected, ...bases] = line.trim().split(/\s+/);
      if (!exc.has(inflected)) exc.set(inflected, []);
      for (const base of bases) exc.get(inflected).push({ base, pos: p });
    }
  }
  return exc;
}

/**
 * cntlist.rev: how often each sense was actually TAGGED in SemCor. WordNet's
 * index order is not usage order — TURTLE's first sense is the sweater — and
 * cluing a common word with its rarest meaning is the single most reliable way
 * to make a generated puzzle feel broken. Returns `lemma|pos|senseNumber` ->
 * tag count; senses with no entry sort last, in index order.
 */
function readSenseCounts(dir) {
  const counts = new Map();
  const file = path.join(dir, 'cntlist.rev');
  if (!fs.existsSync(file)) return counts;
  const SS = { 1: 'n', 2: 'v', 3: 'a', 4: 'r', 5: 'a' }; // 5 = adjective satellite
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [key, sense, cnt] = line.trim().split(/\s+/);
    if (!key || !cnt) continue;
    const pct = key.indexOf('%');
    if (pct < 0) continue;
    const lemma = key.slice(0, pct);
    const pos = SS[Number(key[pct + 1])];
    if (!pos) continue;
    const k = `${lemma}|${pos}|${sense}`;
    counts.set(k, Math.max(counts.get(k) || 0, Number(cnt) || 0));
  }
  return counts;
}

/** tools/blocklist.txt -> Set of lowercase base forms that may never appear. */
function readBlocklist(file) {
  const out = new Set();
  if (!fs.existsSync(file)) {
    console.warn(`WARNING: no blocklist at ${file} — nothing is being filtered`);
    return out;
  }
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const w = line.trim().toLowerCase();
    if (w && !w.startsWith('#')) out.add(w);
  }
  return out;
}

// WordNet's detachment rules, plus the two English spelling changes its
// morphology assumes the caller knows about: -y -> -ie- and the doubled final
// consonant (STOP -> STOPPED). Order matters only in that the first candidate
// that resolves to a real lemma wins, so the longer suffixes come first.
const RULES = [
  ['ches', 'ch', 'n', 'pl'], ['shes', 'sh', 'n', 'pl'], ['ses', 's', 'n', 'pl'],
  ['xes', 'x', 'n', 'pl'], ['zes', 'z', 'n', 'pl'], ['men', 'man', 'n', 'pl'],
  ['ies', 'y', 'n', 'pl'], ['es', '', 'n', 'pl'], ['s', '', 'n', 'pl'],
  ['ies', 'y', 'v', '3sg'], ['es', 'e', 'v', '3sg'], ['es', '', 'v', '3sg'], ['s', '', 'v', '3sg'],
  ['ied', 'y', 'v', 'past'], ['ed', 'e', 'v', 'past'], ['ed', '', 'v', 'past'],
  ['ing', 'e', 'v', 'ing'], ['ing', '', 'v', 'ing'],
  ['iest', 'y', 'a', 'sup'], ['est', 'e', 'a', 'sup'], ['est', '', 'a', 'sup'],
  ['ier', 'y', 'a', 'comp'], ['er', 'e', 'a', 'comp'], ['er', '', 'a', 'comp'],
];
const VOWELS = 'aeiou';

/** Every (base, pos, tag) `word` might be an inflection of. Order is priority. */
function inflectionsOf(word, exc) {
  const out = [];
  for (const e of exc.get(word) || []) out.push({ base: e.base, pos: e.pos, tag: 'irr' });
  for (const [suffix, replacement, pos, tag] of RULES) {
    if (word.length <= suffix.length || !word.endsWith(suffix)) continue;
    const stem = word.slice(0, word.length - suffix.length);
    const base = stem + replacement;
    if (base.length >= 2) out.push({ base, pos, tag });
    if (!replacement && stem.length >= 3) {
      const last = stem[stem.length - 1];
      if (last === stem[stem.length - 2] && !VOWELS.includes(last)) {
        out.push({ base: stem.slice(0, -1), pos, tag });
      }
    }
  }
  return out;
}

// ----------------------------------------------------------------- clues --

/**
 * A WordNet gloss is `definition; another definition; "an example"`. Keep the
 * first definition and drop the examples: an example sentence is the wrong
 * shape for a clue and it is where the answer word itself usually appears.
 */
function cleanGloss(raw) {
  let g = raw;
  const quote = g.indexOf('"');
  if (quote >= 0) g = g.slice(0, quote);
  g = g.split(';')[0];
  g = g.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  g = g.replace(/[,;:.\s]+$/, '');
  if (g.length > MAX_CLUE) {
    const cut = g.slice(0, MAX_CLUE);
    const sp = cut.lastIndexOf(' ');
    g = (sp > MAX_CLUE * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
  }
  return g;
}

/**
 * Blank out the answer where the gloss gives it away. This is what a setter
 * does with a fill-in-the-blank clue, so it costs nothing to read; what it
 * costs is information, which is the point.
 * Matching is on a 4-character stem so RUN also catches RUNNING and RUNS.
 */
function maskAnswer(gloss, ...forms) {
  let out = gloss;
  for (const form of forms) {
    if (!form || form.length < 3) continue;
    const stem = form.slice(0, Math.max(4, Math.ceil(form.length * 0.7)));
    out = out.replace(new RegExp(`\\b${stem}[a-z]*\\b`, 'gi'), '___');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Is what is left still a clue, or did masking eat it? */
function usable(clue) {
  if (clue.length < 8) return false;
  const words = clue.split(/\s+/).filter((w) => w !== '___');
  if (words.length < 3) return false;
  if ((clue.match(/___/g) || []).length > 2) return false;
  return true;
}

/**
 * The best clue for `word`, or null when every sense fails.
 *
 * Two passes over the senses, and the order is the point. An UNMASKED clue —
 * one whose gloss never mentions the answer — is better than a masked one at
 * ANY sense rank, because masking trades away the information that makes a
 * clue solvable. Only if no sense avoids the answer does the common sense get
 * masked and used. Within each pass, senses are in usage order.
 *
 * @param {string} word    the answer, lowercase
 * @param {string} base    its uninflected form (=== word when not inflected)
 * @param {{pos:string,off:string,lemma:string,sense:number}[]} senses usage-ordered
 * @returns {string | null}
 */
function clueFor(word, base, senses, glosses) {
  const cleaned = [];
  for (const s of senses) {
    const raw = glosses.get(s.pos + s.off);
    if (!raw) continue;
    // An offensive sense poisons the whole answer, not just this clue: a solver
    // who reaches for a dictionary finds the sense we declined to print.
    if (OFFENSIVE_MARKER.test(raw)) return null;
    const text = cleanGloss(raw);
    if (text) cleaned.push(text);
  }
  for (const text of cleaned) {
    if (maskAnswer(text, word, base) === text && usable(text)) {
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
  }
  for (const text of cleaned) {
    const masked = maskAnswer(text, word, base);
    if (usable(masked)) return masked.charAt(0).toUpperCase() + masked.slice(1);
  }
  return null;
}

/** Usage order: most-tagged sense first, ties and untagged senses in index order. */
function byUsage(senses, counts) {
  return senses
    .map((s, i) => ({ s, i, n: counts.get(`${s.lemma}|${s.pos}|${s.sense}`) || 0 }))
    .sort((a, b) => (b.n - a.n) || (a.i - b.i))
    .map((x) => x.s);
}

// ------------------------------------------------------------------ main --

const wnDir = opt.wordnet;
console.log(`reading WordNet from ${wnDir}…`);
const glosses = readSynsets(wnDir);
const senses = readIndex(wnDir);
const exc = readExceptions(wnDir);
const senseCounts = readSenseCounts(wnDir);
const blocked = readBlocklist(path.join(path.dirname(new URL(import.meta.url).pathname), 'blocklist.txt'));
console.log(`  ${glosses.size} synsets, ${senses.size} single-word lemmas, ${exc.size} exceptions`);
console.log(`  ${senseCounts.size} tagged senses, ${blocked.size} blocked base forms`);

const enableRaw = fs.readFileSync(opt.enable);
const enable = enableRaw.toString('utf8').split('\n').map((w) => w.trim()).filter(Boolean);
console.log(`  ${enable.length} ENABLE words`);

const freqRaw = fs.readFileSync(opt.freq);
const freq = new Map();
for (const line of freqRaw.toString('utf8').split('\n')) {
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const w = line.slice(0, tab);
  const n = Number(line.slice(tab + 1));
  if (w && Number.isFinite(n)) freq.set(w, n);
}
console.log(`  ${freq.size} frequency entries`);

/** @type {{word: string, count: number, tag: string, clue: string}[]} */
const entries = [];
const TAGS = new Set(['pl', '3sg', 'past', 'ing', 'comp', 'sup', 'irr']);
let noClue = 0, noFreq = 0, refused = 0;

for (const lower of enable) {
  if (lower.length < MIN_LEN || lower.length > MAX_LEN) continue;
  if (!/^[a-z]+$/.test(lower)) continue;
  const count = freq.get(lower);
  if (!count) { noFreq++; continue; }
  if (blocked.has(lower)) { refused++; continue; }

  // Every base this word could be an inflection of, MOST COMMON BASE FIRST.
  // Without that ordering ASSURES resolves to ASSUR — an Assyrian city that
  // happens to be a WordNet lemma — rather than to ASSURE, because the noun
  // plural rule is tried before the verb one. Frequency is the tiebreak that
  // makes the choice the reader's choice and not the rule table's.
  //
  // This runs even when `lower` is itself a lemma, because the blocklist has to
  // see through inflection in BOTH directions: FUCKING is a WordNet lemma in
  // its own right, and blocking FUCK has to be enough to stop it.
  const bases = [];
  const seen = new Set();
  for (const cand of inflectionsOf(lower, exc)) {
    const matching = (senses.get(cand.base) || []).filter((x) => x.pos === cand.pos);
    if (!matching.length) continue;
    const key = `${cand.base}|${cand.pos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bases.push({ ...cand, senses: matching, freq: freq.get(cand.base) || 0 });
  }
  bases.sort((a, b) => b.freq - a.freq);
  if (bases.some((b) => blocked.has(b.base))) { refused++; continue; }

  let clue = senses.has(lower)
    ? clueFor(lower, lower, byUsage(senses.get(lower), senseCounts), glosses)
    : null;
  let tag = '';
  if (!clue) {
    for (const cand of bases) {
      const c = clueFor(lower, cand.base, byUsage(cand.senses, senseCounts), glosses);
      if (c) { clue = c; tag = TAGS.has(cand.tag) ? cand.tag : ''; break; }
    }
  }
  if (!clue) { noClue++; continue; }
  entries.push({ word: lower.toUpperCase(), count, tag, clue });
}
console.log(`  ${entries.length} candidates (${noFreq} no frequency, ${noClue} no usable clue, ${refused} refused)`);

// Rank by frequency, most common first. `rank` is the only number the puzzle
// generator reads: a difficulty is a prefix of this list, and inside a pool the
// filler prefers a lower rank. Ties broken alphabetically so the rank of a word
// is a pure function of the inputs and not of Map iteration order.
entries.sort((a, b) => (b.count - a.count) || (a.word < b.word ? -1 : 1));
const kept = entries.slice(0, TARGET);
kept.forEach((e, i) => { e.rank = i; });

// Committed sorted alphabetically: the file is diffable, the loader can binary
// search it, and the bit index the filler builds is a pure function of it.
kept.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));

const outDir = opt.out;
fs.mkdirSync(path.join(outDir, 'clues'), { recursive: true });

const answersBody = kept.map((e) => `${e.word} ${e.rank}`).join('\n') + '\n';
const header =
  `# minomobi crossword answers — GENERATED by cross/tools/build-lexicon.mjs, do not hand-edit.\n` +
  `# <WORD> <rank>, rank 0 = most frequent. Sorted by word. ${kept.length} answers.\n` +
  `# A change here changes every puzzle: the lexicon id below is stamped into permalinks.\n`;
const answersPath = path.join(outDir, 'answers.txt');
fs.writeFileSync(answersPath, header + answersBody);

// The clue store is sharded by first letter so a lookup reads one file rather
// than three megabytes. The worker serves lookups out of these; nothing fetches
// a whole shard into a browser.
const shards = new Map();
for (const e of kept) {
  const k = e.word[0];
  if (!shards.has(k)) shards.set(k, []);
  shards.get(k).push(`${e.word}\t${e.tag}\t${e.clue}`);
}
const shardHashes = {};
for (const [letter, lines] of [...shards].sort()) {
  const p = path.join(outDir, 'clues', `${letter}.txt`);
  const body = lines.join('\n') + '\n';
  fs.writeFileSync(p, body);
  shardHashes[`clues/${letter}.txt`] = sha(body);
}

// The lexicon id is the hash of the ANSWER BODY only — not the header, not the
// clues. It identifies what the generator reads, so re-wording a clue does not
// invalidate a shared puzzle, and adding a word does.
const lexiconId = sha(answersBody).slice(0, 12);

const manifest = {
  generator: 'cross/tools/build-lexicon.mjs',
  lexiconId,
  answers: kept.length,
  refused: refused,
  byLength: kept.reduce((acc, e) => { acc[e.word.length] = (acc[e.word.length] || 0) + 1; return acc; }, {}),
  tagged: kept.reduce((acc, e) => { if (e.tag) acc[e.tag] = (acc[e.tag] || 0) + 1; return acc; }, {}),
  inputs: {
    enable: { path: opt.enable, sha256: sha(enableRaw), words: enable.length },
    frequency: { source: 'https://norvig.com/ngrams/count_1w.txt', sha256: sha(freqRaw), entries: freq.size },
    wordnet: {
      source: 'https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz',
      synsets: glosses.size,
      lemmas: senses.size,
      sha256: sha(Buffer.concat(
        ['data.noun', 'data.verb', 'data.adj', 'data.adv', 'index.noun', 'index.verb', 'index.adj', 'index.adv']
          .map((f) => fs.readFileSync(path.join(wnDir, f)))
      )),
    },
  },
  outputs: { 'answers.txt': sha(answersBody), ...shardHashes },
};
fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`\nwrote ${kept.length} answers -> ${answersPath}`);
console.log(`      ${shards.size} clue shards -> ${path.join(outDir, 'clues')}`);
console.log(`      lexicon id ${lexiconId}`);
console.log(`      by length: ${Object.entries(manifest.byLength).map(([k, v]) => `${k}:${v}`).join(' ')}`);
