/* ─────────────────────────────────────────────────────────────────────
   ken/prose-lint.mjs — a density lint for LLM prose tics.

   Adapted from the tic register in oaustegard/claude-skills (declauding
   v0.1.1). The tics it looks for share one mechanism: the sentence is built to
   make a reader FEEL a finding arrive, rather than stating the finding.

   This is a DENSITY lint, not a ban. Every construction below is legitimate
   once. The thresholds are set where a habit becomes a mannerism, because the
   documented failure of over-correcting is prose with uniform sentence length,
   no first-person judgement and no digression — worse than the tics.

   Used by ken.selftest.mjs over every page. Run standalone for a report:
     node ken/prose-lint.mjs            # lint ken/*.html
     node ken/prose-lint.mjs --verbose  # show every hit, not just counts
   ───────────────────────────────────────────────────────────────────── */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── text extraction ───────────────────────────────────────────────────
export function proseOf(html) {
  let s = html;
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  return s;
}

// Two extractors, because two kinds of rule need different scopes.
//
//   proseBlocks() — <p>, <li> and <td>. LEXICAL rules run over all of it: an
//     em-dash in a table cell is the same tic as one in a paragraph, and an
//     earlier version reading only <p> let twelve of them hide in one page.
//   paragraphs()  — <p> only. STRUCTURAL rules (paragraph length, fragment
//     cadence, sentence-length variance) run here alone, because a table cell
//     and a list item are supposed to be short and flagging them is noise.
export function proseBlocks(html) {
  const out = [];
  for (const m of proseOf(html).matchAll(/<(p|li|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = strip(m[2]);
    if (t) out.push(t);
  }
  return out;
}

export function paragraphs(html) {
  const out = [];
  for (const m of proseOf(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = strip(m[1]);
    if (t) out.push(t);
  }
  return out;
}

export function headers(html) {
  const out = [];
  for (const m of proseOf(html).matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    // drop a leading section marker ("3.1", "§") so the header is judged on its words
    const t = strip(m[2]).replace(/^(?:§|\d+(?:\.\d+)*)\s*/, '').trim();
    if (t) out.push(t);
  }
  return out;
}

function strip(s) {
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

// ── the register ──────────────────────────────────────────────────────
// Each rule: name, per-1000-word ceiling (or absolute), and a matcher.
const RULES = [
  {
    id: 'em-dash',
    label: 'em-dash density',
    per1000: 6,
    find: (text) => [...text.matchAll(/—/g)].map(() => '—'),
    note: 'the single most reliable tell; a comma, a colon or a full stop almost always serves',
  },
  {
    id: 'negation-first',
    label: 'negation-first reveal ("It is not X. It is Y.")',
    per1000: 2.5,
    find: (text) => [
      ...text.matchAll(/\b(?:It|This|That|These|Those)\s+(?:is|was|are|were)\s+not\s+[^.!?]{2,90}[.;]\s+[A-Z][^.!?]{2,90}[.!?]/g),
      ...text.matchAll(/\bis\s+not\s+(?:that|a|an|the)\b[^.!?]{2,60}[,;]\s*(?:it|but|rather)\b/gi),
      ...text.matchAll(/\bnot\s+(?:a|an|the)\s+\w+[^.!?]{0,40},\s+but\s+(?:a|an|the)\b/gi),
    ].map((m) => m[0].slice(0, 60)),
    note: 'state the positive; the reader does not need the discarded reading first',
  },
  {
    id: 'significance',
    label: 'significance designation ("the thing that matters", "load-bearing")',
    per1000: 2.5,
    find: (text) => [...text.matchAll(
      /\b(?:load-bearing|the (?:one|only|whole|entire|real|actual|essential) (?:point|thing|question|reason|move|idea|defect|difference)|what (?:actually )?matters|the thing that matters|is the point|that is the (?:point|whole point)|the most important \w+|is precisely (?:why|what|the)|the check that (?:actually )?matters|worth (?:having|emphasis|recording)|and (?:that|this) is (?:the|why|what)|which is (?:the|why|exactly))\b/gi,
    )].map((m) => m[0]),
    note: 'if it matters, the placement and the argument should show it',
  },
  {
    id: 'abstraction-agency',
    label: 'abstraction agency ("the table shows", "the number lies")',
    per1000: 3,
    find: (text) => [...text.matchAll(
      /\b(?:the )?(?:table|figure|chart|data|number|numbers|median|mean|result|results|record|ledger|evidence|graph|curve)\s+(?:shows?|tells?|says?|reveals?|hides?|lies|admits?|knows?|remembers?|insists?|refuses?|betrays?)\b/gi,
    )].map((m) => m[0]),
    note: 'name the agent, or use the passive honestly',
  },
  {
    id: 'aphoristic-closer',
    label: 'aphoristic closer (a short sententious final sentence)',
    per1000: 2,
    find: (text) => {
      const hits = [];
      for (const s of sentences(text)) {
        if (words(s) > 14 || words(s) < 4) continue;
        if (/^(?:It|That|This|Which)\s+is\s+(?:the|what|why|how|exactly|precisely)\b/i.test(s)
          || /\bis (?:the point|the whole point|the reason|the exam|the finding|the discipline|the answer)\.$/i.test(s)) {
          hits.push(s);
        }
      }
      return hits;
    },
    note: 'stage-managed endings; let the paragraph stop when the information stops',
  },
  {
    id: 'coy-header',
    label: 'coy or thesis-shaped header',
    absolute: 0,
    find: (_text, { hdrs }) => hdrs.filter((h) =>
      /^(?:why|what|how)\b/i.test(h)
      || /\bmatters?\b/i.test(h)
      || /^the (?:one|only|real|actual|surprising|uncomfortable)\b/i.test(h)
      || /\bwhat .* means\b/i.test(h)),
    note: 'a header should name its section, not tease or argue it',
  },
  {
    id: 'fragment-run',
    scope: 'paragraphs',
    label: 'fragment cadence (2+ consecutive sub-5-word sentences)',
    per1000: 1,
    find: (text) => {
      const hits = [];
      const ss = sentences(text);
      for (let i = 1; i < ss.length; i++) {
        if (words(ss[i]) < 5 && words(ss[i - 1]) < 5) hits.push(`${ss[i - 1]} ${ss[i]}`);
      }
      return hits;
    },
    note: 'stylised staccato; join them or write them out',
  },
  {
    id: 'intensifier',
    label: 'unearned intensifiers (genuinely, actually, precisely, simply…)',
    per1000: 5,
    find: (text) => [...text.matchAll(
      /\b(?:genuinely|actually|precisely|exactly|simply|merely|crucially|notably|remarkably|profoundly|deeply|utterly|entirely|wholly|frankly|honestly)\b/gi,
    )].map((m) => m[0]),
    note: 'they assert emphasis instead of earning it',
  },
];

// ── runner ────────────────────────────────────────────────────────────
/* A page may declare <body data-register="procedure">. The rhythm rules —
   sentence-length variance and fragment cadence — are then skipped.
   They exist to stop argumentative prose being flattened; a procedure is
   SUPPOSED to be flat, so that every step reads the same. Writing /run to
   ASD-STE100 made the two lints contradict each other, which is how this
   exemption was found. */
export function registerOf(html) {
  return /<body[^>]*data-register="procedure"/.test(html) ? 'procedure' : 'prose';
}

export function lintHtml(html, name = 'page') {
  const register = registerOf(html);
  const blocks = proseBlocks(html);       // lexical scope: p + li + td
  const paras = paragraphs(html);         // structural scope: p only
  const hdrs = headers(html);
  const allText = blocks.join(' ');
  const paraText = paras.join(' ');
  const n = words(allText);
  const findings = [];

  for (const rule of RULES) {
    if (register === 'procedure' && rule.id === 'fragment-run') continue;
    const text = rule.scope === 'paragraphs' ? paraText : allText;
    const hits = rule.find(text, { hdrs, paras });
    const scopeWords = rule.scope === 'paragraphs' ? words(paraText) : n;
    const budget = rule.absolute !== undefined
      ? rule.absolute
      : Math.max(1, Math.round((rule.per1000 * scopeWords) / 1000));
    if (hits.length > budget) {
      findings.push({
        rule: rule.id, label: rule.label, note: rule.note,
        count: hits.length, budget, hits: hits.slice(0, 6),
      });
    }
  }

  // one-line paragraphs, as a share of all paragraphs
  const oneLiners = paras.filter((p) => words(p) < 22).length;
  if (paras.length >= 8 && oneLiners / paras.length > 0.28) {
    findings.push({
      rule: 'one-line-paragraphs', label: 'one-line paragraphs',
      note: 'a paragraph carrying one sentence is being used for emphasis',
      count: oneLiners, budget: Math.floor(paras.length * 0.28), hits: [],
    });
  }

  // sentence-length monotony: too little variation reads as machine-set
  const lens = sentences(paraText).map(words).filter((w) => w > 2);
  if (register !== 'procedure' && lens.length > 25) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    if (sd / mean < 0.42) {
      findings.push({
        rule: 'monotony', label: 'sentence-length monotony',
        note: 'vary the rhythm; short and long sentences should sit together',
        count: Number((sd / mean).toFixed(3)), budget: 0.42, hits: [],
      });
    }
  }

  return { name, register, words: n, paragraphs: paras.length, findings };
}

// ── CLI ───────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const verbose = process.argv.includes('--verbose');
  let total = 0;
  for (const f of readdirSync(HERE).filter((x) => x.endsWith('.html'))) {
    const r = lintHtml(readFileSync(join(HERE, f), 'utf8'), basename(f));
    console.log(`\n${r.name}  (${r.words} words, ${r.paragraphs} paragraphs)`);
    if (!r.findings.length) { console.log('  clean'); continue; }
    for (const fd of r.findings) {
      total++;
      console.log(`  ${fd.label}: ${fd.count} (budget ${fd.budget})`);
      console.log(`      ${fd.note}`);
      if (verbose) for (const h of fd.hits) console.log(`      · ${h}`);
    }
  }
  console.log(`\n${total} rule(s) over budget`);
  process.exit(total ? 1 : 0);
}
