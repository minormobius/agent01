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
//     "learned":  [ { "kind": "finding"|"dead-end"|"decision", "title": …, "body": … } ],
//                 // NOT "question" — a worker decides and records, never asks.
//     "propose":  [ { "title": …, "body": …, "priority": 0-3, "deps": ["lp-…"] } ]
//   }

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { parseLedger, mintId, toLine, validate, normalize, validateGate, CLASSES } from './lib/beads.mjs';

// WHAT AN AGENT MAY WRITE DOWN — and `question` is deliberately absent.
//
// A worker must never park a turn waiting for a human. If it hits a judgement
// call it RECORDS THE DECISION and continues: what it chose, why, and what
// would reverse it. Human review happens at the sprint boundary, over the
// decision log, at a coarser grain than the turn.
//
// Removing `question` from this set is the structural half of that rule. The
// prompt says "decide, do not ask"; this makes asking impossible, because an
// agent that CAN file a blocking question eventually will — and then the fleet
// is a queue of people waiting to be unblocked, which is the failure mode this
// whole design exists to avoid.
const AGENT_KINDS = new Set(['finding', 'dead-end', 'decision']);

// ── ASKS: the one thing a machine cannot do for itself ──────────────────────
//
// Everything above is about refusing to let a turn PARK on a human. That rule
// stands, and `asks` does not weaken it — because an ask is not a block. The
// turn finishes, the verdict is written, the chain continues, and the ask sits
// in a queue the operator reads when they feel like it. The agent never learns
// the answer; a LATER agent does, because the answer arrives as a `decision`
// in the memory every brief carries.
//
// It exists because there is a class of question no gate can settle. "Is this
// fair?" "Does this feel good to play?" "Is this the game we want?" — LOOP-WBS
// §2.3 calls that class C, taste, and says the audience is the instrument. A
// loop with no channel for it can only ever do class A: work whose acceptance a
// machine can check. That is a loop that gets better at what it can measure and
// blind to everything else, which for a GAME is the whole point missed.
//
// Two rules make an ask safe, and both are enforced below rather than asked for:
//
//   1. AN ASK CREATES NO EDGE. No deps, and nothing depends on it. It cannot
//      block its own turn, cannot block a sibling, and cannot appear in the
//      ready queue — `question` is a KNOWLEDGE kind, so the fleet can never
//      take one. Structurally it is a note, not a gate.
//   2. AN ASK NAMES A PROTOCOL. "What do you think?" is not an ask, it is a
//      shrug pointed at a human. It must say what to DO, what to WATCH, and
//      what the agent will do with either answer — because an ask whose answer
//      changes nothing is a request to spend the one resource the loop cannot
//      manufacture, on nothing.
const MAX_ASKS = 3;

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
export function planOutbox(outbox, beads, { now = new Date().toISOString(), actor = 'agent', run = null, exists = null } = {}) {
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

  // EVIDENCE THAT LOOKS LIKE A FILE MUST BE A FILE. Proposed by the turn-2
  // agent after it read the ledger, saw turn 1 marked done citing two paths,
  // and found neither on disk — turn 1's work had been written and then never
  // staged. Its point: "a bead marked done with evidence paths listed is not
  // proof those paths exist."
  //
  // Cheap, and independent of the ticket gate: a bead with NO gate still gets
  // this much. URLs, commit refs and run ids are skipped — only things shaped
  // like a repo-relative path are checked.
  if (exists && outbox.outcome === 'done') {
    const looksLikePath = (e) => e.includes('/') && !/^[a-z]+:/i.test(e) && !/^run\s/i.test(e);
    for (const e of evidence.filter(looksLikePath)) {
      if (!exists(e)) problems.push(`evidence "${e}" looks like a path and does not exist — a done outcome cannot cite a file it did not produce`);
    }
  }

  const learned = Array.isArray(outbox.learned) ? outbox.learned : [];
  if (learned.length > MAX_LEARNED) problems.push(`${learned.length} learned entries, over the ${MAX_LEARNED} limit`);
  const propose = Array.isArray(outbox.propose) ? outbox.propose : [];
  if (propose.length > MAX_PROPOSALS) problems.push(`${propose.length} proposals, over the ${MAX_PROPOSALS} limit`);
  const asks = Array.isArray(outbox.asks) ? outbox.asks : [];
  // Capped low and deliberately: human attention is the scarcest input in this
  // whole system, and a turn that files three asks has probably not tried to
  // answer any of them itself.
  if (asks.length > MAX_ASKS) problems.push(`${asks.length} asks, over the ${MAX_ASKS} limit — human attention is the scarce resource here, spend it on the one that matters`);

  if (problems.length) return { ok: false, problems, patches: [] };

  // ---- the target bead's own outcome ----
  // `blocked` returns the bead to the backlog, which parks it for a human — so
  // it is reserved for a genuine TECHNICAL dependency (a gate that does not
  // exist, a credential that is absent). A judgement call is not a blocker:
  // decide it, record the decision, and finish. See AGENT_KINDS above.
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
    if (kind === 'question') {
      problems.push(`learned[${i}].kind is "question" — a worker does not ask, it decides. `
        + `Record a "decision" with what you chose and what would reverse it.`);
      continue;
    }
    if (!AGENT_KINDS.has(kind)) { problems.push(`learned[${i}].kind must be one of ${[...AGENT_KINDS].join('|')}`); continue; }
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

  // ---- asks ----
  // Born `proposed` and kind `question`: proposed because it is genuinely
  // outstanding until a human answers, `question` because KNOWLEDGE_KINDS makes
  // that permanently unschedulable — the fleet cannot pick one up and "handle"
  // it, which is the failure mode where an agent answers the taste question by
  // guessing.
  for (const [i, a] of asks.entries()) {
    const title = text(a?.title, `asks[${i}].title`, 200);
    if (!title.trim()) { problems.push(`asks[${i}].title is empty`); continue; }
    // THE PROTOCOL IS MANDATORY. This is the whole difference between an ask
    // and a shrug: the operator must be able to act on it without a
    // conversation, because there is no conversation available.
    const doThis = text(a?.do, `asks[${i}].do`);
    const watchFor = text(a?.watch, `asks[${i}].watch`);
    const soThat = text(a?.soThat, `asks[${i}].soThat`);
    if (!doThis.trim()) { problems.push(`asks[${i}].do is empty — say what the human should DO, concretely enough to act on without asking you anything`); continue; }
    if (!watchFor.trim()) { problems.push(`asks[${i}].watch is empty — say what to pay attention to, or you are asking for a vibe`); continue; }
    if (!soThat.trim()) { problems.push(`asks[${i}].soThat is empty — say what you will do with each answer. An ask whose answer changes nothing must not be filed`); continue; }
    // An ask that carries dependencies is an ask trying to become a blocker.
    if (Array.isArray(a.deps) && a.deps.length) {
      problems.push(`asks[${i}] carries deps — an ask never blocks anything, that is what makes it safe. Drop them.`);
      continue;
    }
    const created = now;
    const id = mintId({ title, created, actor }, taken);
    taken.add(id);
    patches.push({
      id, title, kind: 'question', status: 'proposed', priority: 1,
      body: `${text(a.body, `asks[${i}].body`)}\n\nDO: ${doThis}\n\nWATCH FOR: ${watchFor}\n\nSO THAT: ${soThat}`.trim(),
      // No deps, and `asked-about` is a TAG rather than an edge on purpose:
      // it records what the ask is about without making anything wait for it.
      deps: [], parent: null,
      tags: ['ask', 'class-c', `asked-about:${outbox.bead}`], actor, run,
      evidence: [], created, updated: created,
    });
  }

  // ---- proposals ----
  for (const [i, p] of propose.entries()) {
    const title = text(p?.title, `propose[${i}].title`, 200);
    if (!title.trim()) { problems.push(`propose[${i}].title is empty`); continue; }
    const deps = Array.isArray(p.deps) ? p.deps.filter((d) => typeof d === 'string') : [];
    const unknown = deps.filter((d) => !taken.has(d));
    if (unknown.length) { problems.push(`propose[${i}] depends on unknown bead(s): ${unknown.join(', ')}`); continue; }
    // A PLANNER MAY PROPOSE A GATE AND A CLASS — that is its whole job, and it
    // is safe because both are inert until promotion: a proposed bead is never
    // dispatched, and `beads promote` prints the gate for the promoter to read.
    // The gate is still constrained to read-only verbs (beads.mjs validateGate).
    const gate = Array.isArray(p.gate) ? p.gate.filter((g) => typeof g === 'string') : [];
    const gateBad = validateGate(gate);
    if (gateBad.length) { problems.push(...gateBad.map((b) => `propose[${i}]: ${b}`)); continue; }
    const cls = typeof p.class === 'string' ? p.class.toLowerCase() : null;
    if (cls && !CLASSES.includes(cls)) { problems.push(`propose[${i}].class must be one of ${CLASSES.join('|')}`); continue; }
    // A planner may not label its own work class B — that is the class a human
    // reviews because it redefines "done", and self-labelling into it would let
    // an agent route around the very review it exists to trigger. It also may
    // not claim class A without naming a gate, since class A MEANS "certified
    // against an existing gate" and a class-A bead with no gate is the exact
    // shape of turn 1's unverified claim.
    if (cls === 'b') { problems.push(`propose[${i}]: an agent may not label work class-b — that class exists to force human review`); continue; }
    if (cls === 'a' && !gate.length) { problems.push(`propose[${i}]: class-a means "certified against a gate", so it must name one`); continue; }

    const created = now;
    const id = mintId({ title, created, actor }, taken);
    taken.add(id);
    patches.push({
      id, title, kind: 'task', gate,
      // ── THE GATE ──────────────────────────────────────────────────────────
      // ALWAYS `proposed`, whatever the outbox asked for. An agent that could
      // create ready work could feed itself indefinitely, and the ready queue
      // would stop meaning "a human or a judge decided this is worth doing".
      // This line is the difference between a loop and a perpetual motion
      // machine, and it is deliberately not configurable.
      status: 'proposed',
      priority: Number.isInteger(p.priority) && p.priority >= 0 && p.priority <= 3 ? p.priority : 2,
      body: text(p.body, `propose[${i}].body`), deps, parent: outbox.bead,
      tags: ['proposed-by-agent', ...(cls ? [`class-${cls}`] : [])],
      actor, run, evidence: [], created, updated: created,
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
      exists: (rel) => existsSync(join(ROOT, rel)),
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
