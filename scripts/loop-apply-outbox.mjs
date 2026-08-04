#!/usr/bin/env node
// loop-apply-outbox.mjs — the producer/consumer boundary.
//
// The worker agent runs with NO Bash and NO git (lab-build.yml's doctrine:
// "prompts leak; tool grants don't"). It therefore cannot write the ledger. It
// writes a PROPOSAL to .github/loop/outbox/<bead>.json, and this script
// validates that proposal and applies it.
//
// The boundary buys three things that "let the agent edit the JSONL" does not:
//
//  1. **An agent cannot promote its own work.** Every bead it proposes is
//     created `proposed`, never `ready`, no matter what the file says. That is
//     the gate, and it is structural rather than a line in a prompt — the one
//     place CLOSED-LOOP.md §3's "a loop without a judge is a random walk" gets
//     enforced instead of asserted.
//
//  2. **A malformed turn cannot corrupt the graph.** A half-written outbox from
//     an agent that hit its timeout is rejected whole; the ledger is untouched
//     and the turn is recorded as failed. An agent appending directly could
//     leave the graph unreadable at the exact moment the next turn needs it.
//
//  3. **The diff is reviewable as intent.** The outbox says "I finished this, I
//     learned that, I propose these"; the ledger append is derived from it. A
//     human reading the branch history sees both.
//
//   node scripts/loop-apply-outbox.mjs .github/loop/outbox/lp-abc123.json
//   node scripts/loop-apply-outbox.mjs --all            # every outbox file
//   node scripts/loop-apply-outbox.mjs --check <file>   # validate, apply nothing
//
// Outbox shape:
//   {
//     "bead":     "lp-abc123",              // required — the bead this turn was for
//     "outcome":  "done" | "blocked" | "failed",
//     "summary":  "one paragraph, what happened",
//     "evidence": ["path/or/url", …],       // required when outcome is "done"
//     "learned":  [ { "kind": "finding"|"dead-end"|"question", "title": …, "body": … } ],
//     "propose":  [ { "title": …, "body": …, "priority": 0-3, "deps": ["lp-…"] } ]
//   }

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { parseLedger, mintId, toLine, validate, normalize, KNOWLEDGE_KINDS } from './lib/beads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOOP_DIR = join(ROOT, '.github', 'loop');
const LEDGER = join(LOOP_DIR, 'beads.jsonl');
const OUTBOX = join(LOOP_DIR, 'outbox');

const OUTCOMES = ['done', 'blocked', 'failed'];
const MAX_PROPOSALS = 12;   // a turn that proposes fifty beads has lost the plot
const MAX_LEARNED = 12;
const MAX_TEXT = 4000;      // bodies are published; this is a page, not a corpus

/**
 * Validate a proposal against the ledger it would be applied to.
 * Returns { ok, problems, patches } — patches are the exact ledger lines.
 * Pure: reads nothing, writes nothing, so the selftest can drive it directly.
 */
export function planOutbox(outbox, beads, { now = new Date().toISOString(), actor = 'agent', run = null } = {}) {
  const problems = [];
  const patches = [];
  const known = new Map(beads.map((b) => [b.id, b]));
  const taken = new Set(known.keys());

  const text = (v, field, max = MAX_TEXT) => {
    if (v == null) return '';
    if (typeof v !== 'string') { problems.push(`${field} must be a string`); return ''; }
    if (v.length > max) { problems.push(`${field} is ${v.length} chars, over the ${max} limit`); return v.slice(0, max); }
    return v;
  };

  if (!outbox || typeof outbox !== 'object' || Array.isArray(outbox)) {
    return { ok: false, problems: ['outbox is not an object'], patches: [] };
  }
  const target = known.get(outbox.bead);
  if (!outbox.bead) problems.push('no "bead" field — an outbox must say which bead the turn was for');
  else if (!target) problems.push(`bead ${outbox.bead} is not in the ledger`);

  if (!OUTCOMES.includes(outbox.outcome)) {
    problems.push(`outcome must be one of ${OUTCOMES.join('|')} (got ${JSON.stringify(outbox.outcome)})`);
  }
  const summary = text(outbox.summary, 'summary');
  if (!summary.trim()) problems.push('summary is empty — a turn with nothing to say did not happen');

  const evidence = Array.isArray(outbox.evidence) ? outbox.evidence.filter((e) => typeof e === 'string') : [];
  if (outbox.outcome === 'done' && !evidence.length) {
    // Same rule as the CLI's `done`. A self-reported success with nothing
    // attached is the loop grading its own homework.
    problems.push('outcome "done" requires at least one evidence entry');
  }

  const learned = Array.isArray(outbox.learned) ? outbox.learned : [];
  if (learned.length > MAX_LEARNED) problems.push(`${learned.length} learned entries, over the ${MAX_LEARNED} limit`);
  const propose = Array.isArray(outbox.propose) ? outbox.propose : [];
  if (propose.length > MAX_PROPOSALS) problems.push(`${propose.length} proposals, over the ${MAX_PROPOSALS} limit`);

  if (problems.length) return { ok: false, problems, patches: [] };

  // ---- the target bead's own outcome ----
  const status = outbox.outcome === 'done' ? 'done' : outbox.outcome === 'blocked' ? 'proposed' : 'ready';
  patches.push({
    id: outbox.bead,
    status,
    // The summary is appended, never replacing the body: the brief a human
    // wrote is not the agent's to overwrite.
    body: `${target.body}${target.body ? '\n\n' : ''}[turn ${run ?? '?'} — ${outbox.outcome}] ${summary}`,
    evidence: [...target.evidence, ...evidence],
    updated: now, run,
  });

  // ---- knowledge ----
  for (const [i, l] of learned.entries()) {
    const kind = l?.kind;
    if (!KNOWLEDGE_KINDS.has(kind)) { problems.push(`learned[${i}].kind must be one of ${[...KNOWLEDGE_KINDS].join('|')}`); continue; }
    const title = text(l.title, `learned[${i}].title`, 200);
    if (!title.trim()) { problems.push(`learned[${i}].title is empty`); continue; }
    const created = now;
    const id = mintId({ title, created, actor }, taken);
    taken.add(id);
    patches.push({
      id, title, kind, status: 'done', priority: 2,
      body: text(l.body, `learned[${i}].body`), deps: [], parent: null,
      tags: ['learned'], actor, run, evidence: [], created, updated: created,
    });
  }

  // ---- proposals ----
  for (const [i, p] of propose.entries()) {
    const title = text(p?.title, `propose[${i}].title`, 200);
    if (!title.trim()) { problems.push(`propose[${i}].title is empty`); continue; }
    const deps = Array.isArray(p.deps) ? p.deps.filter((d) => typeof d === 'string') : [];
    const unknown = deps.filter((d) => !taken.has(d));
    if (unknown.length) { problems.push(`propose[${i}] depends on unknown bead(s): ${unknown.join(', ')}`); continue; }
    const created = now;
    const id = mintId({ title, created, actor }, taken);
    taken.add(id);
    patches.push({
      id, title, kind: 'task',
      // ── THE GATE ──────────────────────────────────────────────────────────
      // ALWAYS `proposed`, whatever the outbox asked for. An agent that could
      // create ready work could feed itself indefinitely, and the ready queue
      // would stop meaning "a human or a judge decided this is worth doing".
      // This line is the difference between a loop and a perpetual motion
      // machine, and it is deliberately not configurable.
      status: 'proposed',
      priority: Number.isInteger(p.priority) && p.priority >= 0 && p.priority <= 3 ? p.priority : 2,
      body: text(p.body, `propose[${i}].body`), deps, parent: outbox.bead,
      tags: ['proposed-by-agent'], actor, run, evidence: [], created, updated: created,
    });
  }

  if (problems.length) return { ok: false, problems, patches: [] };

  // Final pass: every patch that creates a bead must validate on its own terms.
  for (const p of patches) {
    if (!p.title) continue;                       // a status-only patch
    const bad = validate(normalize(p));
    if (bad.length) problems.push(`${p.id}: ${bad.join('; ')}`);
  }

  return { ok: problems.length === 0, problems, patches };
}

// ------------------------------------------------------------------ driver --

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const all = argv.includes('--all');
  const files = all
    ? (existsSync(OUTBOX) ? readdirSync(OUTBOX).filter((f) => f.endsWith('.json')).map((f) => join(OUTBOX, f)) : [])
    : argv.filter((a) => !a.startsWith('--')).map((a) => resolve(ROOT, a));

  if (!files.length) { console.log('no outbox files to apply'); process.exit(0); }

  let bad = 0;
  for (const file of files) {
    console.log(`\n${basename(file)}`);
    let outbox;
    try { outbox = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { console.log(`  ✗ unparseable: ${e.message}`); bad++; continue; }

    const { beads } = parseLedger(existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '');
    const plan = planOutbox(outbox, beads, {
      now: process.env.LOOP_NOW || new Date().toISOString(),
      actor: process.env.LOOP_ACTOR || 'agent',
      run: process.env.LOOP_RUN || null,
    });

    if (!plan.ok) {
      for (const p of plan.problems) console.log(`  ✗ ${p}`);
      bad++;
      continue;
    }
    const created = plan.patches.filter((p) => p.created).length;
    console.log(`  ✓ valid — 1 outcome, ${created} new bead(s)`);
    if (checkOnly) continue;

    mkdirSync(dirname(LEDGER), { recursive: true });
    const cur = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '';
    if (cur.length && !cur.endsWith('\n')) appendFileSync(LEDGER, '\n');
    appendFileSync(LEDGER, plan.patches.map(toLine).join('\n') + '\n');
    console.log(`  → appended ${plan.patches.length} record(s) to the ledger`);

    // The outbox is consumed. Leaving it would make the next tick count it as
    // an open work order forever, and the loop would never regain a slot.
    unlinkSync(file);
    const order = join(LOOP_DIR, 'work', `${outbox.bead}.json`);
    if (existsSync(order)) unlinkSync(order);
    console.log('  → consumed the outbox and its work order');
  }

  if (bad) {
    console.log(`\n✗ ${bad} outbox file(s) rejected — the ledger was not modified for those\n`);
    process.exit(1);
  }
  console.log('');
}
