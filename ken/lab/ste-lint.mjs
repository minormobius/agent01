/* ─────────────────────────────────────────────────────────────────────
   ken/lab/ste-lint.mjs — the structural rules of ASD-STE100, as a lint.

   ASD-STE100 Simplified Technical English is maintained by the ASD STEMG.
   It has two parts: Part 1, writing rules; Part 2, a controlled dictionary.

   WHAT THIS DOES NOT DO. Part 2 is licensed, so the approved-vocabulary
   rule — the heart of the standard — is not implemented. A page passing
   this lint is NOT in Simplified Technical English. It satisfies the
   structural subset, which is the part that can be checked from a text
   without the dictionary.

   The numeric limits below are the commonly cited ones. The specification
   is the authority and we do not hold a copy, so they are configurable and
   labelled as our settings rather than quoted as the standard's.

   WHY BOTHER. The claim being tested is that plain prose isolates the
   subject's difficulty from the writing's. Our other lint removes tics;
   this one removes structure. Whether the result reads better on a
   statistics argument is an open question, which is why it is applied to
   one procedural document rather than to the site.
   ───────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
import { proseBlocks, paragraphs, headers } from '../prose-lint.mjs';

export const LIMITS = {
  procedureSentenceWords: 20,
  descriptiveSentenceWords: 25,
  sentencesPerParagraph: 6,
  nounClusterMax: 3,
};

const FUNCTION_WORDS = new Set(('a an the of to in on at by for with from into over under and or but '
  + 'if then than that this these those is are was were be been being do does did have has had will '
  + 'would can could may might must shall should not no it its as so such per via up out off about '
  // added after the first run flagged "score variance across cells" and
  // "dictionary rule because Part" as noun clusters
  + 'because across which when while where whether both each every all some any more most less '
  + 'only also other another same before after during between through without within above below '
  + 'first second third next last here their your our you we they them he she him her '
  + 'one two three four five six seven eight nine ten '
  // adverbs and modals: 'estimate therefore cannot drift' was flagged
  + 'therefore cannot however instead rather again still already never always '
  + 'often very much many few less least much own way thing things')
  .split(' '));

/* A noun cluster is consecutive NOUNS used as modifiers. Without a tagger the
   nearest workable rule is: a run of content words containing no verb. The
   first version had no verb list and flagged "One run costs six turns", which
   is an ordinary clause. */
const COMMON_VERBS = new Set(('costs cost make makes made give gives gave get gets got take takes took '
  + 'use uses used run runs ran show shows showed report reports reported record records recorded '
  + 'check checks checked write writes wrote read reads set sets put puts keep keeps kept '
  + 'become becomes became remove removes removed vary varies separate separates fail fails failed '
  + 'pass passes passed spend spends spent decide decides decided read stop stops start starts '
  + 'find finds found need needs needed hold holds held depend depends means mean sit sits '
  + 'apply applies rest rests carry carries count counts counted name names named '
  + 'drift drifts settle settles wire wires wired split splits expand expands')
  .split(' '));

const BE = /\b(is|are|was|were|be|been|being)\b/i;
const PARTICIPLE = /\b\w+(ed|en)\b|\b(shown|given|taken|made|done|seen|known|found|held|kept|left|set|put|built|drawn|chosen|written|read)\b/i;

const strip = (s) => s.replace(/<[^>]+>/g, ' ')
  .replace(/&mdash;/g, '—').replace(/&rsquo;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const sentences = (t) => t.split(/(?<=[.!?:])\s+/).map((s) => s.trim()).filter(Boolean);
const words = (s) => s.split(/\s+/).filter(Boolean);

/**
 * Passive voice: a form of "be" followed within three words by a participle
 * that is NOT acting as an adjective.
 *
 * The attributive test is what the first version lacked. It called "the wave
 * is a matched pair" and "the limits are the commonly cited ones" passive,
 * because both contain be plus an -ed word. A participle followed by a content
 * word is modifying that word; a participle at a clause end, or before a
 * preposition, is the real thing.
 */
export function isPassive(sentence) {
  const w = words(sentence.toLowerCase().replace(/[^a-z\s]/g, ''));
  for (let i = 0; i < w.length; i++) {
    if (!BE.test(w[i])) continue;
    for (let j = i + 1; j <= Math.min(i + 3, w.length - 1); j++) {
      if (FUNCTION_WORDS.has(w[j])) continue;
      if (!PARTICIPLE.test(w[j])) continue;
      const after = w[j + 1];
      const attributive = after !== undefined
        && !FUNCTION_WORDS.has(after)
        && !COMMON_VERBS.has(after);
      if (!attributive) return true;
    }
  }
  return false;
}

/** Runs of content words longer than the limit, as an approximate noun cluster. */
export function nounClusters(sentence, max = LIMITS.nounClusterMax) {
  const w = words(sentence.replace(/[^A-Za-z\s-]/g, ''));
  const hits = [];
  let run = [];
  for (const x of w) {
    const lower = x.toLowerCase();
    const contentish = !FUNCTION_WORDS.has(lower)
      && !COMMON_VERBS.has(lower)
      && !/ly$|ing$|ed$/.test(lower) && lower.length > 2;
    if (contentish) run.push(x);
    else { if (run.length > max) hits.push(run.join(' ')); run = []; }
  }
  if (run.length > max) hits.push(run.join(' '));
  return hits;
}

/** More than one instruction joined into one sentence. */
export function compoundInstruction(sentence) {
  return /^[A-Z][a-z]+[^.!?]*\b(and|then)\b\s+[a-z]+\b/.test(sentence.trim())
    && /^(Add|Check|Compute|Do|Draw|Fix|Give|Keep|Make|Measure|Open|Put|Read|Record|Remove|Report|Run|Set|Show|Start|Stop|Take|Use|Verify|Write|Push|Pull|Send|Wait|Count|Fit|Plot|Save|Load|Apply|Split|Drop|Pin|Commit|Publish)\b/.test(sentence.trim());
}

/* A cell holding "204" is not a sentence. Excluding numeric and near-empty
   blocks matters for more than tidiness: /run publishes a generated table of
   its OWN violation counts, so counting those cells made the page's score
   depend on its score. */
const isProse = (t) => {
  const w = words(t);
  if (w.length < 3) return false;
  const numeric = w.filter((x) => /^[\d.,%()[\]–-]+$/.test(x)).length;
  return numeric / w.length < 0.5;
};

export function lintSte(html, { mode = 'descriptive', declared = [] } = {}) {
  const blocks = proseBlocks(html).map(strip).filter(isProse);
  const paras = paragraphs(html).map(strip).filter(isProse);
  const limit = mode === 'procedure' ? LIMITS.procedureSentenceWords : LIMITS.descriptiveSentenceWords;
  const declaredSet = new Set(declared.map((d) => d.toLowerCase()));

  const findings = [];
  let sentenceCount = 0, longest = 0, passive = 0;

  for (const b of blocks) {
    for (const s of sentences(b)) {
      sentenceCount++;
      const n = words(s).length;
      longest = Math.max(longest, n);
      if (n > limit) findings.push({ rule: 'sentence-length', detail: `${n} words (limit ${limit})`, text: s.slice(0, 90) });
      if (isPassive(s)) { passive++; findings.push({ rule: 'passive-voice', detail: 'a be-verb with a participle', text: s.slice(0, 90) }); }
      for (const c of nounClusters(s)) {
        if (declaredSet.has(c.toLowerCase())) continue;
        findings.push({ rule: 'noun-cluster', detail: `${words(c).length} content words`, text: c });
      }
      if (compoundInstruction(s)) findings.push({ rule: 'compound-instruction', detail: 'more than one instruction', text: s.slice(0, 90) });
    }
  }
  for (const p of paras) {
    const n = sentences(p).length;
    if (n > LIMITS.sentencesPerParagraph) {
      findings.push({ rule: 'paragraph-length', detail: `${n} sentences (limit ${LIMITS.sentencesPerParagraph})`, text: p.slice(0, 70) });
    }
  }

  const byRule = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  return {
    mode, limit,
    sentences: sentenceCount,
    words: blocks.reduce((a, b) => a + words(b).length, 0),
    longestSentence: longest,
    passiveShare: sentenceCount ? passive / sentenceCount : 0,
    findings, byRule,
    violations: findings.length,
    perHundredSentences: sentenceCount ? (100 * findings.length) / sentenceCount : 0,
  };
}

/* The comparison table published on /run. Generated rather than typed,
   because the prose pages change and a hand-typed count goes stale on the next
   log entry — which it did, twice. */
export const COMPARISON = [
  { file: 'run.html', label: '<b>This page</b>', mode: 'procedure', bold: true },
  { file: 'methods.html', label: '/methods', mode: 'descriptive' },
  { file: 'lab.html', label: '/lab', mode: 'descriptive' },
  { file: 'log.html', label: '/log', mode: 'descriptive' },
  { file: 'wp1.html', label: '/wp1', mode: 'descriptive' },
  { file: 'wp2.html', label: '/wp2', mode: 'descriptive' },
];

export function comparisonRows(dir, read = readFileSync) {
  return COMPARISON.map((c) => {
    const r = lintSte(read(`${dir}/${c.file}`, 'utf8'), { mode: c.mode });
    const v = Math.round(r.perHundredSentences);
    return {
      ...c, sentences: r.sentences, longest: r.longestSentence, per100: v,
      html: `<tr><td>${c.label}</td><td class="num">${r.sentences}</td>`
          + `<td class="num">${r.longestSentence}</td>`
          + `<td class="num">${c.bold ? `<b>${v}</b>` : v}</td></tr>`,
    };
  });
}

export const TABLE_MARK = { start: '<!-- STE-TABLE:START -->', end: '<!-- STE-TABLE:END -->' };

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const mode = process.argv.includes('--procedure') ? 'procedure' : 'descriptive';
  for (const f of files) {
    const r = lintSte(readFileSync(f, 'utf8'), { mode });
    console.log(`\n${f}  [${r.mode}, limit ${r.limit} words]`);
    console.log(`  ${r.sentences} sentences, ${r.words} words, longest ${r.longestSentence}`);
    console.log(`  ${r.violations} violations = ${r.perHundredSentences.toFixed(0)} per 100 sentences`);
    for (const [k, v] of Object.entries(r.byRule).sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}`);
  }
}
