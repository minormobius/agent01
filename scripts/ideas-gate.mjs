#!/usr/bin/env node
// ideas-gate.mjs — the quality interlock between a model and a public timeline.
//
//   node scripts/ideas-gate.mjs                    # report only
//   node scripts/ideas-gate.mjs --write            # append survivors to the queue
//
// Stage 4 of 4 (pull → batch → concepts → gate). Nothing reaches the queue
// without passing every rule here.
//
// WHY THIS EXISTS AT ALL. The pipeline's weak point is not retrieval and not
// posting — it is that a model handed an abstract will happily produce "a
// website to explore proper hat-guessing on two-spine book graphs!", which is
// the paper's title with a verb bolted on. That output is indistinguishable
// from good work by any check involving the words "did it produce something",
// and posting it hourly is how an account becomes noise. So the gate encodes
// what separated the five concepts a human liked from the ones discarded:
//
//   - it names a MECHANISM you operate, not a topic you may explore
//   - it cites a real paper, by an id that was actually in today's fetch
//   - it does not restate the title
//   - it does not sell
//
// Every rule is a named, testable predicate — see ideas-gate.selftest.mjs, which
// covers each one — because "the gate rejected it" has to be actionable when it
// happens at 04:00 with nobody watching.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDEAS = join(ROOT, '.github', 'ideas');

export const MAX_GRAPHEMES = 300;
export const MIN_GRAPHEMES = 80;

/** The post as it will actually appear. Both the gate and ideas-post.mjs render
 *  through this, so the thing measured is the thing published — a length check
 *  against a different string than the one posted is not a length check. */
export function renderPost(draft) {
  return `${draft.text.trim()}\n\narxiv.org/abs/${draft.arxivId}`;
}

export function graphemeCount(text) {
  if (typeof Intl?.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
  }
  return [...text].length;
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'via', 'their', 'have', 'been',
  'into', 'over', 'under', 'using', 'toward', 'towards', 'more', 'than', 'some', 'such',
  'when', 'where', 'which', 'about', 'between', 'without', 'they', 'them', 'these', 'those',
]);

const words = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 4 && !STOP.has(w));

// Selling words. Not a taste list — every one of these is a phrase that appears
// when a model is filling space instead of describing a mechanism.
const HYPE = [
  'revolutionary', 'cutting-edge', 'cutting edge', 'game-changing', 'game changing',
  'seamless', 'unleash', 'unlock', 'harness', 'leverage', 'elevate', 'empower',
  'dive into', 'delve into', 'explore the fascinating', 'ever wondered', 'look no further',
  'stunning', 'breathtaking', 'mind-blowing', 'mind blowing', 'must-see', 'must see',
  'the future of', 'reimagine', 'reimagining', 'supercharge', 'next-level', 'next level',
  'transformative', 'groundbreaking', 'ground-breaking', 'state-of-the-art', 'showcase',
];

// A concept is something you DO. If none of these appears, the draft is almost
// always describing a topic rather than an interaction.
const OPERATIVE = [
  'you ', 'your ', 'yours', 'drag', 'flip', 'place', 'submit', 'guess', 'play', 'tune',
  'pick', 'click', 'race', 'hunt', 'beat', 'slide', 'aim', 'set ', 'sets ', 'dial',
  'tap ', 'type ', 'build', 'stack', 'fold', 'steer', 'push', 'pull', 'throw', 'bet',
  'vote', 'trade', 'breed', 'sort', 'draw', 'rotate', 'spin', 'shoot', 'solve', 'move',
];

// Claims the SITE cannot make. "an Erdos problem solved this morning" is fine and
// true; "provably the best" is a claim about our own artefact.
const OVERCLAIM = ['provably', 'we prove', 'this proves', 'proven optimal', 'guaranteed to'];

export const RULES = [
  {
    id: 'shape',
    why: 'every field the queue and the poster read must be present and a string',
    test: (d) => {
      for (const f of ['arxivId', 'paperTitle', 'name', 'text', 'mechanism']) {
        if (typeof d[f] !== 'string' || !d[f].trim()) return `missing or empty field: ${f}`;
      }
      if (!Array.isArray(d.surfaces)) return 'surfaces must be an array (may be empty)';
      return null;
    },
  },
  {
    id: 'slug',
    why: 'the name may become a URL path segment, so it must be one',
    test: (d) => (/^[a-z0-9][a-z0-9-]{1,30}$/.test(d.name) ? null : `not a slug: "${d.name}"`),
  },
  {
    id: 'arxiv-id-real',
    why: 'a hallucinated id posts a dead link under our own name',
    test: (d, ctx) => {
      if (!/^\d{4}\.\d{4,5}$/.test(d.arxivId)) return `not an arXiv id: "${d.arxivId}"`;
      if (ctx.knownIds && ctx.knownIds.size && !ctx.knownIds.has(d.arxivId)) {
        return `id ${d.arxivId} was not in this run's batch — invented, mistyped, or taken from outside the batch`;
      }
      return null;
    },
  },
  {
    id: 'title-matches-paper',
    why: 'the id and the title must describe the same paper, or the citation is wrong',
    test: (d, ctx) => {
      const real = ctx.titles?.get(d.arxivId);
      if (!real) return null; // covered by arxiv-id-real
      const a = new Set(words(real));
      const b = words(d.paperTitle);
      if (!b.length) return 'paperTitle has no content words';
      const hit = b.filter((w) => a.has(w)).length / b.length;
      return hit >= 0.4 ? null : `paperTitle does not match ${d.arxivId} ("${real}")`;
    },
  },
  {
    id: 'not-already-queued',
    why: 'the same paper twice reads as a bot with no memory',
    test: (d, ctx) => {
      if (ctx.queuedIds?.has(d.arxivId)) return `already queued or posted: ${d.arxivId}`;
      if (ctx.queuedNames?.has(d.name)) return `name already used: ${d.name}`;
      return null;
    },
  },
  {
    id: 'name-free',
    why: '248 catalogue entries and 74 surfaces already exist; a colliding name is a broken promise',
    test: (d, ctx) => (ctx.takenNames?.has(d.name) ? `"${d.name}" already exists in this repo` : null),
  },
  {
    id: 'length',
    why: 'Bluesky truncates at 300 graphemes, and under 80 is a stub',
    test: (d) => {
      const n = graphemeCount(renderPost(d));
      if (n > MAX_GRAPHEMES) return `rendered post is ${n} graphemes (limit ${MAX_GRAPHEMES})`;
      if (n < MIN_GRAPHEMES) return `rendered post is only ${n} graphemes (min ${MIN_GRAPHEMES})`;
      return null;
    },
  },
  {
    id: 'not-a-restatement',
    why: 'the title with a verb bolted on is the characteristic failure of this pipeline',
    test: (d) => {
      const t = d.text.toLowerCase();
      const title = d.paperTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (title.length > 15 && t.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').includes(title)) {
        return 'the post contains the paper title verbatim';
      }
      const tw = words(d.paperTitle);
      if (tw.length < 3) return null;
      const inText = new Set(words(d.text));
      const overlap = tw.filter((w) => inText.has(w)).length / tw.length;
      return overlap >= 0.7 ? `${Math.round(overlap * 100)}% of the title's words are in the post — it is a restatement` : null;
    },
  },
  {
    id: 'operable',
    why: 'a concept is something you do; a topic is not a toy',
    test: (d) => {
      const t = ` ${d.text.toLowerCase()} `;
      if (!OPERATIVE.some((v) => t.includes(v))) {
        return 'no second-person or operative verb — reads as a topic, not a mechanism';
      }
      if (d.mechanism.trim().split(/\s+/).length < 5) return 'mechanism is too short to be a mechanism';
      return null;
    },
  },
  {
    id: 'no-hype',
    why: 'selling language is what makes an automated account read as a spam account',
    test: (d) => {
      const t = d.text.toLowerCase();
      const found = HYPE.filter((h) => t.includes(h));
      if (found.length) return `selling language: ${found.join(', ')}`;
      if ((d.text.match(/!/g) || []).length > 1) return 'more than one exclamation mark';
      if (d.text.includes('#')) return 'hashtags read as reach-farming';
      return null;
    },
  },
  {
    id: 'no-overclaim',
    why: 'we may cite a result; we may not claim one',
    test: (d) => {
      const t = d.text.toLowerCase();
      const found = OVERCLAIM.filter((h) => t.includes(h));
      return found.length ? `claims we cannot make: ${found.join(', ')}` : null;
    },
  },
];

export function gate(drafts, ctx = {}) {
  const accepted = [];
  const rejected = [];
  // Names and ids accumulate WITHIN the batch too — two drafts in one run that
  // pitch the same paper must not both pass.
  const queuedIds = new Set(ctx.queuedIds || []);
  const queuedNames = new Set(ctx.queuedNames || []);
  for (const d of drafts) {
    const failures = [];
    for (const rule of RULES) {
      let msg;
      try {
        msg = rule.test(d, { ...ctx, queuedIds, queuedNames });
      } catch (e) {
        msg = `rule threw: ${e.message}`;
      }
      if (msg) failures.push({ rule: rule.id, msg });
    }
    if (failures.length) {
      rejected.push({ draft: d, failures });
    } else {
      accepted.push(d);
      queuedIds.add(d.arxivId);
      queuedNames.add(d.name);
    }
  }
  return { accepted, rejected };
}

/** Names already spoken for anywhere in this repo: registered surfaces, the
 *  landing catalogue, and top-level directories. */
export function takenNames(root = ROOT) {
  const taken = new Set(['ideas', 'lab', 'auto', 'assets', 'static', 'api', 'admin', 'spec', 'docs', 'scripts']);
  try {
    const reg = JSON.parse(readFileSync(join(root, 'deploy-registry.json'), 'utf8'));
    for (const s of reg.surfaces || []) { taken.add(s.surface); taken.add(s.dir); }
  } catch { /* registry unreadable — the other two sources still apply */ }
  try {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    for (const m of html.matchAll(/\bn:\s*'([^']+)'/g)) taken.add(m[1]);
  } catch { /* landing page unreadable */ }
  return taken;
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('ideas-gate.mjs')) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

  const draftsPath = arg('drafts', join(IDEAS, 'drafts.json'));
  const batchPath = arg('batch', join(IDEAS, 'batch.json'));
  const poolPath = arg('pool', join(IDEAS, 'pool.jsonl'));
  const queuePath = arg('queue', join(IDEAS, 'queue.jsonl'));
  const write = argv.includes('--write');

  let drafts = JSON.parse(readFileSync(draftsPath, 'utf8'));
  if (!Array.isArray(drafts)) drafts = drafts.concepts || drafts.drafts || [];

  // Checked against THE BATCH, not the pool: the agent may only cite a paper it
  // was actually shown. Citing something from elsewhere in the pool means it went
  // looking, and a citation nobody handed it is exactly the case this rule is for.
  const knownIds = new Set();
  const titles = new Map();
  if (existsSync(batchPath)) {
    for (const p of JSON.parse(readFileSync(batchPath, 'utf8')).papers || []) {
      knownIds.add(p.id);
      titles.set(p.id, p.title);
    }
  }

  const queued = existsSync(queuePath)
    ? readFileSync(queuePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

  const { accepted, rejected } = gate(drafts, {
    knownIds,
    titles,
    queuedIds: new Set(queued.map((q) => q.arxivId)),
    queuedNames: new Set(queued.map((q) => q.name)),
    takenNames: takenNames(),
  });

  console.log(`gate: ${drafts.length} draft(s) — ${accepted.length} accepted, ${rejected.length} rejected\n`);
  for (const a of accepted) console.log(`  ✓ ${a.name.padEnd(24)} ${a.arxivId}  (${graphemeCount(renderPost(a))} graphemes)`);
  for (const r of rejected) {
    console.log(`  ✗ ${(r.draft.name || '<unnamed>').padEnd(24)} ${r.draft.arxivId || '?'}`);
    for (const f of r.failures) console.log(`      ${f.rule}: ${f.msg}`);
  }

  if (write) {
    if (accepted.length) {
      const lines = accepted.map((a) => JSON.stringify({
        ...a, queuedAt: new Date().toISOString(), posted: null,
      })).join('\n') + '\n';
      appendFileSync(queuePath, lines);
      console.log(`\n✓ appended ${accepted.length} to ${queuePath}`);
    } else {
      console.log('\n— nothing accepted; queue unchanged');
    }
    // Mark exactly the batch reviewed — not the whole pool. A paper the agent was
    // never shown stays unreviewed and comes back in a later batch; marking more
    // than was actually read is how a corpus gets silently burned. `produced`
    // records whether this paper yielded an accepted concept, which is the only
    // per-paper quality signal the pipeline generates.
    if (existsSync(poolPath)) {
      const producedIds = new Set(accepted.map((a) => a.arxivId));
      const at = new Date().toISOString();
      const pool = readFileSync(poolPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
      let marked = 0;
      for (const p of pool) {
        if (p.reviewed || !knownIds.has(p.id)) continue;
        p.reviewed = { at, produced: producedIds.has(p.id) };
        marked++;
      }
      writeFileSync(poolPath, pool.map((e) => JSON.stringify(e)).join('\n') + '\n');
      console.log(`✓ ${marked} paper(s) marked reviewed; ${pool.filter((p) => !p.reviewed).length} still awaiting review`);
    }
  }

  // A day that produces nothing is a normal day, not a failure: the poster
  // simply has less queue. Only a malformed drafts file is an error.
  process.exit(0);
}
