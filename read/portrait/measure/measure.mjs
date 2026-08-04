/* measure.mjs — the generator behind `stylometry.js`.
 *
 * Every number in the Style curve and the Leitmotif index is computed from
 * source/portrait-gutenberg-4217.txt by this script. Nothing in stylometry.js
 * is hand-typed: re-run it and the file is reproduced byte for byte.
 *
 *   node read/portrait/measure/measure.mjs           # check (fails if stale)
 *   node read/portrait/measure/measure.mjs --write   # regenerate
 *
 * Statistics come from packages/dataviz/stats.js — the repo's shared, selftested
 * estimator core — rather than being reimplemented here.
 *
 * WHY THIS EXISTS. The medieval tales on this site take their Motif index from
 * an authority (Thompson, ATU): the analyst looks a motif up. Modernism has no
 * such index and cannot have one — a leitmotif is not a story-atom shared across
 * a tradition, it is a word this book repeats. So the index has to be *measured*
 * off the text instead of looked up, and once you are measuring recurrence you
 * can measure the prose itself, which in this novel is the thing that changes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stats } from "../../../packages/dataviz/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "source", "portrait-gutenberg-4217.txt");
const OUT = join(HERE, "..", "stylometry.js");

/* ── the text ─────────────────────────────────────────────────────────────
   Gutenberg boilerplate off; the five chapter headings removed so they do not
   count as sentences. Offsets below are into the resulting string. */
function loadBody() {
  const raw = readFileSync(SRC, "utf8");
  const a = raw.indexOf("*** START");
  const b = raw.indexOf("*** END");
  let body = raw.slice(a, b);
  body = body.slice(body.indexOf("\n") + 1);
  return body.replace(/^[ \t]*Chapter [IVX]+[ \t]*$/gm, "");
}

/* ── the division into movements ──────────────────────────────────────────
   Portrait's chapters are divided by blank space in print (4/5/3/3/5 = 20
   sections). The Gutenberg plain text does NOT preserve those divisions — it
   flattens them to ordinary paragraph breaks — so each boundary is anchored
   here by its opening words and located by search, not by a hard offset. If the
   Gutenberg edition is ever re-released with different wording the script fails
   loudly rather than silently measuring the wrong spans. */
const ANCHORS = [
  ["I.1",   "Once upon a time and a very good time it was"],
  ["I.2",   "The wide playgrounds were swarming with boys"],
  ["I.3",   "A great fire, banked high and red, flamed in the grate"],
  ["I.4",   "The fellows talked together in little groups"],
  ["II.1",  "Uncle Charles smoked such black twist"],
  ["II.2",  "Two great yellow caravans had halted"],
  ["II.3",  "—I walked bang into him, said Mr Dedalus for the fourth time"],
  ["II.4",  "Stephen was once again seated beside his father"],
  ["II.5",  "Stephen’s mother and his brother and one of his cousins"],
  ["III.1", "The swift December dusk had come tumbling clownishly"],
  ["III.2", "Stephen sat in the front bench of the chapel"],
  ["III.3", "He walked on and on through ill-lit streets"],
  ["IV.1",  "Sunday was dedicated to the mystery of the Holy Trinity"],
  ["IV.2",  "The director stood in the embrasure of the window"],
  ["IV.3",  "He could wait no longer"],
  ["V.1",   "He drained his third cup of watery tea"],
  ["V.2",   "Towards dawn he awoke"],
  ["V.3",   "What birds were they? He stood on the steps of the library"],
  ["V.4",   "_March_ 20"],
];
const CHAPTER_OF = (id) => id.split(".")[0];

// The source is hard-wrapped, so an anchor phrase may straddle a line break:
// match on whitespace-insensitive form rather than a literal substring.
function anchorRe(anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\s+/g, "\\s+"), "g");
}

function divide(body) {
  const marks = ANCHORS.map(([id, anchor]) => {
    const hits = [...body.matchAll(anchorRe(anchor))];
    if (!hits.length) throw new Error(`anchor not found for ${id}: ${anchor.slice(0, 40)}…`);
    if (hits.length > 1) throw new Error(`anchor for ${id} matches ${hits.length}×: ${anchor.slice(0, 40)}…`);
    return { id, at: hits[0].index };
  });
  for (let i = 1; i < marks.length; i++) {
    if (marks[i].at <= marks[i - 1].at) throw new Error(`anchors out of order at ${marks[i].id}`);
  }
  return marks.map((m, i) => ({
    id: m.id,
    chapter: CHAPTER_OF(m.id),
    text: body.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : body.length),
  }));
}

/* ── measures ─────────────────────────────────────────────────────────────
   Each is a plain count over the span. Nothing here needs a parser; every
   number can be checked by hand against the source with grep. */
const WORD = /[A-Za-z’']+/g;
const VOWELS = /[aeiouy]+/g;

function syllables(w) {
  const s = w.toLowerCase().replace(/['’]/g, "");
  let n = (s.match(VOWELS) || []).length;
  if (s.endsWith("e") && n > 1) n -= 1;
  return Math.max(n, 1);
}

const RELATIVES = ["which", "whose", "whom", "wherein", "whereby", "whereupon"];

function measure(text) {
  const words = text.match(WORD) || [];
  const lower = words.map((w) => w.toLowerCase());
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => WORD.test(s) && ((WORD.lastIndex = 0), true));
  const lens = sentences.map((s) => (s.match(WORD) || []).length).filter((n) => n > 0);
  const syls = words.map(syllables);
  const per1k = (n) => +((n / words.length) * 1000).toFixed(2);

  // Standardised type-token ratio: mean TTR over consecutive 500-word windows,
  // so the figure does not simply fall as a span gets longer. Spans under one
  // window get null rather than an incomparable number.
  const ttrs = [];
  for (let i = 0; i + 500 <= lower.length; i += 500) ttrs.push(new Set(lower.slice(i, i + 500)).size / 500);

  return {
    words: words.length,
    sentences: lens.length,
    meanSentence: +stats.mean(lens).toFixed(2),
    medianSentence: +stats.median(lens).toFixed(1),
    sdSentence: +stats.sd(lens).toFixed(2),
    meanWordLen: +stats.mean(words.map((w) => w.length)).toFixed(3),
    meanSyllables: +stats.mean(syls).toFixed(4),
    polysyllabic: +((syls.filter((n) => n >= 3).length / words.length) * 100).toFixed(2),
    ttr: ttrs.length ? +stats.mean(ttrs).toFixed(4) : null,
    ttrWindows: ttrs.length,
    comma: per1k((text.match(/,/g) || []).length),
    colon: per1k((text.match(/[;:]/g) || []).length),
    and: per1k(lower.filter((w) => w === "and").length),
    relative: per1k(lower.filter((w) => RELATIVES.includes(w)).length),
    speech: +(((text.match(/\n—/g) || []).length / Math.max(lens.length, 1)) * 100).toFixed(2),
  };
}

/* ── the leitmotif lexicons ───────────────────────────────────────────────
   HONESTY. These word-lists are editorial. Thompson's numbers are an external
   authority you can be wrong about; these are a hypothesis about which words
   this novel is repeating, and the count only tells you how often the listed
   words occur — not that they carry the meaning claimed for them. They are
   printed in full on the Leitmotifs page for exactly that reason: the reader
   should be able to see the list and disagree with it. Each is matched
   case-insensitively on whole words. */
const LEXICONS = {
  water:  ["water","waters","watery","sea","seas","wave","waves","tide","river","rain","pool","pools","damp","wet","drown","drowned","flood","stream","liquid","ooze","slime","bog","drip","dripping","fountain","brimming"],
  // "air" was in this list and contributed 85 of 174 hits on its own — mostly
  // "the evening air" and "an air" meaning a tune, neither of which is flight.
  // Dropped: a lexicon half-made of one ambiguous word measures that word.
  flight: ["bird","birds","wing","wings","fly","flying","flew","flight","hawk","swallow","swallows","soar","soaring","falcon","eagle","feather","feathers","dove","crane","nest","aerial"],
  eyes:   ["eye","eyes","glasses","spectacles","gaze","gazed","gazing","stare","stared","staring","look","looked","blind","sight","seen","vision","glance","glanced"],
  hands:  ["hand","hands","palm","palms","finger","fingers","touch","touched","grasp","clasp","clasped","fist"],
  smell:  ["smell","smelt","smelled","odour","odours","scent","reek","stink","stench","perfume","fume","fumes","musty","rank"],
  fire:   ["fire","fires","flame","flames","burn","burning","burned","burnt","blaze","ablaze","ember","scorch","scorching","smoke","hell"],
  cold:   ["cold","colder","coldly","chill","chilly","chilled","shiver","shivering","freeze","frozen","frost","icy","numb"],
  colour: ["rose","roses","rosy","red","crimson","scarlet","maroon","green","greenish","ivory","white","whiteness","pale"],
  voice:  ["voice","voices","word","words","language","speech","tongue","silence","silent","cry","cried","whisper","whispered","sound","sounds","music"],
  net:    ["net","nets","snare","snares","trap","prison","cage","bound","bind","chain","chains","fetter"],
  soul:   ["soul","souls","sin","sins","sinful","guilt","shame","penance","confess","confession","absolution","grace","god","christ","virgin","holy","sacred","priest"],
  art:    ["beauty","beautiful","art","artist","aesthetic","image","images","imagination","radiance","whatness","epiphany","artificer"],
};

function countLexicon(text, list) {
  const re = new RegExp("\\b(?:" + list.join("|") + ")\\b", "gi");
  return (text.match(re) || []).length;
}

/* ── the parataxis test ───────────────────────────────────────────────────
   Kenner's reading of Portrait is that every chapter closes on an exaltation
   the next chapter's opening deflates. That is a claim about rhetoric, so it
   ought to leave a trace. It does not leave one in sentence length — chapter
   openings are mostly LONGER than the closings they follow. It leaves one in
   coordination: the closings chant ("and … and … and"), the openings explain.
   For each chapter the closing 400 words are compared against 4000 random
   400-word windows drawn from that same chapter, giving a one-tailed p per
   chapter; the five are combined with Fisher's method.

   The metric was chosen AFTER looking at the section table, so the combined p
   is optimistic — it is reported as support for a reading, not as a proof, and
   the site says so. The PRNG is seeded so the figure is reproducible. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Upper tail of the chi-square distribution for even degrees of freedom.
function chiSqUpper(x, df) {
  const k = df / 2, h = x / 2;
  let term = 1, sum = 1;
  for (let i = 1; i < k; i++) { term *= h / i; sum += term; }
  return Math.exp(-h) * sum;
}

function parataxisTest(chapters) {
  const rand = mulberry32(20260802);
  const N = 400, DRAWS = 4000;
  const rows = chapters.map((ch) => {
    const words = (ch.text.match(WORD) || []).map((w) => w.toLowerCase());
    const rate = (arr) => (arr.filter((w) => w === "and").length / arr.length) * 1000;
    const close = rate(words.slice(-N));
    const open = rate(words.slice(0, N));
    let atLeast = 0;
    for (let i = 0; i < DRAWS; i++) {
      const j = Math.floor(rand() * (words.length - N));
      if (rate(words.slice(j, j + N)) >= close) atLeast++;
    }
    const p = Math.max(atLeast / DRAWS, 1 / DRAWS);
    return {
      chapter: ch.id, close: +close.toFixed(1), open: +open.toFixed(1),
      chapterMean: +(rate(words)).toFixed(1),
      percentile: +((1 - atLeast / DRAWS) * 100).toFixed(1), p: +p.toFixed(4),
    };
  });
  const X = -2 * rows.reduce((s, r) => s + Math.log(r.p), 0);
  return {
    windowWords: N, draws: DRAWS, rows,
    fisher: { X2: +X.toFixed(2), df: 2 * rows.length, p: +chiSqUpper(X, 2 * rows.length).toFixed(4) },
  };
}

/* ── build ────────────────────────────────────────────────────────────────*/
const body = loadBody();
const movements = divide(body);

const chapters = ["I", "II", "III", "IV", "V"].map((c) => ({
  id: c,
  text: movements.filter((m) => m.chapter === c).map((m) => m.text).join(""),
}));

const sections = movements.map((m) => ({ id: m.id, chapter: m.chapter, ...measure(m.text) }));
const chapterRows = chapters.map((c) => ({ id: c.id, ...measure(c.text) }));

const motifs = Object.entries(LEXICONS).map(([key, list]) => {
  const per = chapters.map((c) => {
    const w = (c.text.match(WORD) || []).length;
    return +((countLexicon(c.text, list) / w) * 10000).toFixed(1);
  });
  const bySection = {};
  movements.forEach((m) => {
    const w = (m.text.match(WORD) || []).length;
    bySection[m.id] = +((countLexicon(m.text, list) / w) * 10000).toFixed(1);
  });
  // Per-term counts across the whole book, biggest first. Printed on the
  // Leitmotifs page so a reader can see when one ambiguous word is carrying a
  // lexicon (the reason "air" is no longer in `flight`) and discount it.
  const termCounts = list
    .map((t) => [t, countLexicon(body, [t])])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return {
    key, terms: list, termCounts,
    total: chapters.reduce((s, c) => s + countLexicon(c.text, list), 0),
    byChapter: per, bySection,
    // The four movements where this lexicon is densest — the EXHIBITS edges in
    // the Mythograph are drawn from here, so they are evidence, not assertion.
    topSections: Object.entries(bySection).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id),
  };
});

// Does the aesthetic lexicon displace the religious one? Report the ratio per
// chapter rather than asserting the transfer.
const soul = motifs.find((m) => m.key === "soul").byChapter;
const art = motifs.find((m) => m.key === "art").byChapter;
const transfer = soul.map((s, i) => +(s / art[i]).toFixed(2));

const bookWords = (body.match(WORD) || []).length;

const payload = {
  generated: {
    source: "source/portrait-gutenberg-4217.txt",
    edition: "Project Gutenberg eBook #4217 (A Portrait of the Artist as a Young Man, 1916)",
    script: "measure/measure.mjs",
    words: bookWords,
  },
  sections, chapters: chapterRows, motifs, transfer,
  parataxis: parataxisTest(chapters),
};

const banner = `/* GENERATED FILE — do not edit by hand.
   Every number below is computed from source/portrait-gutenberg-4217.txt by
   measure/measure.mjs. Regenerate with:

     node read/portrait/measure/measure.mjs --write

   and verify a stale copy with the same command minus --write. The lexicons
   behind the motif densities are editorial and are printed in full on the
   Leitmotifs page so a reader can disagree with them.
   Attaches to window.PORTRAIT. */
window.PORTRAIT = window.PORTRAIT || {};
window.PORTRAIT.style = `;

const text = banner + JSON.stringify(payload, null, 2) + ";\n";

if (process.argv.includes("--write")) {
  writeFileSync(OUT, text);
  console.log(`wrote stylometry.js — ${bookWords.toLocaleString()} words, ${sections.length} sections, ${motifs.length} lexicons`);
} else {
  let current = null;
  try { current = readFileSync(OUT, "utf8"); } catch { /* absent */ }
  if (current === text) {
    console.log("stylometry.js is current");
  } else {
    console.error("stylometry.js is STALE — re-run with --write");
    process.exit(1);
  }
}
