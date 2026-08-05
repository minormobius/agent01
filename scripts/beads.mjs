#!/usr/bin/env node
// beads.mjs — the ticket graph, from the command line.
//
// This is the interface a HUMAN and a WORKFLOW use. The worker agent does not:
// it runs with no Bash at all (the lab-build.yml doctrine — "prompts leak, tool
// grants don't"), so it cannot invoke this script, cannot reach git, and cannot
// touch the ledger. It writes a proposal to .github/loop/outbox/ instead, and
// scripts/loop-apply-outbox.mjs validates that proposal and applies it through
// this same code path.
//
// So there are two rings. Everything in the outer ring APPENDS through the
// verbs below, which validate; the agent is outside both and can only ask.
// The one privilege the agent never gets, by construction rather than by
// instruction, is promoting its own proposals to `ready`.
//
//   node scripts/beads.mjs new  --title "..." [--kind task] [--dep lp-abc123]…
//   node scripts/beads.mjs set  lp-abc123 --status ready --priority 1
//   node scripts/beads.mjs dep  lp-abc123 --on lp-def456        # add/remove edges
//   node scripts/beads.mjs done lp-abc123 --evidence <url|path|sha>
//   node scripts/beads.mjs drop lp-abc123 --why "superseded by lp-…"
//   node scripts/beads.mjs learn --title "…" --kind dead-end    # write down a failure
//     …--body-file notes.md   ALWAYS prefer this for prose. A body on the
//     command line is interpreted by the shell first, and a loop's memory is
//     full of prose ABOUT shell — backticks in a finding execute.
//   node scripts/beads.mjs promote lp-abc123                    # proposed → ready, DoR enforced
//   node scripts/beads.mjs answer  lp-abc123 --body-file reply.md  # reply to an ask
//   node scripts/beads.mjs ready [--n 3] [--json]               # the scheduler reads this
//   node scripts/beads.mjs show  lp-abc123 [--json]
//   node scripts/beads.mjs stats [--json]
//   node scripts/beads.mjs lint                                 # non-zero on a broken graph
//
// The ledger is .github/loop/beads.jsonl — under .github/ because that is the
// one tree the root worker does not serve to the internet (docs/IDEAS-BOT.md
// makes the same call for the same reason), and in git because bot-written
// state that is reviewable, diffable and revertable is the whole reason this
// repo keeps its robot state in commits rather than in a database.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import {
  parseLedger, computeGraph, readyQueue, summarize, mintId, toLine, validate, normalize,
  KINDS, STATUSES, KNOWLEDGE_KINDS, classOf, createsGate,
} from './lib/beads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LEDGER = join('.github', 'loop', 'beads.jsonl');

// ------------------------------------------------------------------- argv --
// A hand-rolled parser, because this repo has no dependencies and this is the
// script an agent invokes: every flag it accepts is a flag we chose to accept.
function parseArgv(argv) {
  const cmd = argv[0];
  const positional = [];
  const flags = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    const key = (eq === -1 ? a.slice(2) : a.slice(2, eq));
    const val = eq === -1
      ? (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true)
      : a.slice(eq + 1);
    // Repeatable flags collect. --dep a --dep b is two dependencies, not the
    // second overwriting the first — getting this wrong silently drops edges.
    if (key in flags) flags[key] = [].concat(flags[key], val);
    else flags[key] = val;
  }
  return { cmd, positional, flags };
}
const list = (v) => (v === undefined ? [] : [].concat(v).filter((x) => x !== true).map(String));

const { cmd, positional, flags } = parseArgv(process.argv.slice(2));
const asJson = flags.json === true || flags.json === 'true';

const ledgerArg = flags.ledger || process.env.LOOP_LEDGER || DEFAULT_LEDGER;
const LEDGER = isAbsolute(ledgerArg) ? ledgerArg : join(ROOT, ledgerArg);

// The clock is injectable so the selftest is not a flake waiting to happen and
// so a replay can reconstruct a run at its real timestamps.
const now = () => process.env.LOOP_NOW || new Date().toISOString();

function readLedger() {
  const text = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '';
  return parseLedger(text);
}

function append(patch) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  const line = toLine(patch) + '\n';
  // Append to a file that may not end in a newline — a half-written previous
  // run is exactly when this matters, and concatenating onto a partial line
  // corrupts two records instead of one.
  if (existsSync(LEDGER)) {
    const cur = readFileSync(LEDGER, 'utf8');
    if (cur.length && !cur.endsWith('\n')) appendFileSync(LEDGER, '\n');
  }
  appendFileSync(LEDGER, line);
  return patch.id;
}

function die(msg, code = 1) { console.error(`beads: ${msg}`); process.exit(code); }

function requireBead(id, beads) {
  const b = beads.find((x) => x.id === id);
  if (!b) die(`no such bead: ${id}`);
  return b;
}

// ------------------------------------------------------------------ verbs --

/**
 * The body, from `--body` or `--body-file`.
 *
 * `--body-file` exists because a body arrives here THROUGH A SHELL, and a
 * knowledge tool whose input is shell is a knowledge tool that can act. Writing
 * down a finding about `git pull --rebase && git push` ran it: the backticks in
 * the prose were command substitution, and the CLI never saw the text at all —
 * the shell had already executed part of it and pasted the output in. The
 * finding survived only because the stray pull happened to refuse.
 *
 * Prose about shell is exactly what a loop's memory is FULL of. Read the file
 * here and the whole class is gone.
 */
function bodyArg() {
  const f = flags['body-file'];
  if (f !== undefined && f !== true) {
    const p = isAbsolute(String(f)) ? String(f) : join(process.cwd(), String(f));
    if (!existsSync(p)) die(`--body-file: no such file ${p}`);
    return readFileSync(p, 'utf8').replace(/\s+$/, '');
  }
  if (flags.body !== undefined && flags.body !== true) return String(flags.body);
  return undefined;
}

function cmdNew() {
  const title = flags.title && flags.title !== true ? String(flags.title) : positional.join(' ');
  if (!title) die('new: --title is required');
  const kind = String(flags.kind ?? 'task');
  if (!KINDS.includes(kind)) die(`new: --kind must be one of ${KINDS.join('|')}`);
  const status = String(flags.status ?? (KNOWLEDGE_KINDS.has(kind) ? 'done' : 'proposed'));
  if (!STATUSES.includes(status)) die(`new: --status must be one of ${STATUSES.join('|')}`);

  const { beads } = readLedger();
  const created = now();
  const actor = String(flags.actor ?? process.env.LOOP_ACTOR ?? 'human');
  const draft = { title, created, actor };
  const id = mintId(draft, new Set(beads.map((b) => b.id)));

  const rec = {
    id, title, kind, status,
    priority: flags.priority !== undefined ? Number(flags.priority) : 2,
    body: bodyArg() ?? '',
    deps: list(flags.dep),
    parent: flags.parent && flags.parent !== true ? String(flags.parent) : null,
    tags: list(flags.tag),
    actor,
    run: flags.run && flags.run !== true ? String(flags.run) : (process.env.LOOP_RUN ?? null),
    evidence: list(flags.evidence),
    gate: list(flags.gate),
    created, updated: created,
  };

  const bad = validate(normalize(rec));
  if (bad.length) die(`new: ${bad.join('; ')}`);
  // A dep on a bead that does not exist is caught here rather than at schedule
  // time, where it would present as "the queue is empty" — the least
  // debuggable failure this system can have.
  const known = new Set(beads.map((b) => b.id));
  for (const d of rec.deps) if (!known.has(d)) die(`new: --dep ${d} does not exist`);
  if (rec.parent && !known.has(rec.parent)) die(`new: --parent ${rec.parent} does not exist`);

  append(rec);
  console.log(asJson ? JSON.stringify({ id }) : id);
}

function cmdSet() {
  const id = positional[0];
  if (!id) die('set: needs a bead id');
  const { beads } = readLedger();
  requireBead(id, beads);

  const patch = { id, updated: now() };
  if (flags.status !== undefined) {
    const s = String(flags.status);
    if (!STATUSES.includes(s)) die(`set: --status must be one of ${STATUSES.join('|')}`);
    patch.status = s;
  }
  if (flags.priority !== undefined) patch.priority = Number(flags.priority);
  if (flags.title !== undefined && flags.title !== true) patch.title = String(flags.title);
  { const b = bodyArg(); if (b !== undefined) patch.body = b; }
  if (flags.kind !== undefined) {
    const k = String(flags.kind);
    if (!KINDS.includes(k)) die(`set: --kind must be one of ${KINDS.join('|')}`);
    patch.kind = k;
  }
  if (flags.run !== undefined && flags.run !== true) patch.run = String(flags.run);
  const ev = list(flags.evidence);
  if (ev.length) patch.evidence = [...requireBead(id, beads).evidence, ...ev];
  const gate = list(flags.gate);
  if (gate.length) patch.gate = gate;
  const tags = list(flags.tag);
  if (tags.length) patch.tags = [...new Set([...requireBead(id, beads).tags, ...tags])];

  if (Object.keys(patch).length <= 2) die('set: nothing to change');
  const bad = validate(normalize({ ...requireBead(id, beads), ...patch }));
  if (bad.length) die(`set: ${bad.join('; ')}`);
  append(patch);
  console.log(asJson ? JSON.stringify({ id, ...patch }) : `${id} updated`);
}

function cmdDep() {
  const id = positional[0];
  if (!id) die('dep: needs a bead id');
  const { beads } = readLedger();
  const b = requireBead(id, beads);
  const known = new Set(beads.map((x) => x.id));

  const add = list(flags.on);
  const rm = list(flags.off);
  if (!add.length && !rm.length) die('dep: needs --on <id> and/or --off <id>');
  for (const d of add) if (!known.has(d)) die(`dep: --on ${d} does not exist`);

  const deps = [...new Set([...b.deps.filter((d) => !rm.includes(d)), ...add])];
  const patch = { id, deps, updated: now() };
  const bad = validate(normalize({ ...b, ...patch }));
  if (bad.length) die(`dep: ${bad.join('; ')}`);

  // Refuse an edge that would close a cycle. A cycle is recoverable (every
  // member simply blocks) but it is a graph nobody meant to write, and the
  // cheapest moment to reject it is the one where the author is still here.
  const after = computeGraph(beads.map((x) => (x.id === id ? normalize({ ...x, ...patch }) : x)));
  const cycle = after.cycles.find((c) => c.includes(id));
  if (cycle) die(`dep: that edge closes a cycle — ${cycle.join(' → ')} → ${cycle[0]}`);

  append(patch);
  console.log(asJson ? JSON.stringify(patch) : `${id} deps: ${deps.join(', ') || '(none)'}`);
}

function cmdDone() {
  const id = positional[0];
  if (!id) die('done: needs a bead id');
  const { beads } = readLedger();
  const b = requireBead(id, beads);
  // EVIDENCE IS REQUIRED TO CLOSE. The whole value of the graph to turn 30 is
  // that turn 4's claims are checkable; "done" with nothing attached is a
  // self-report, and a loop grading its own homework with no artifact is the
  // failure mode docs/CLOSED-LOOP.md §3 names.
  const ev = list(flags.evidence);
  if (!ev.length && !flags.force) die('done: --evidence <commit|url|path> is required (or --force)');
  append({ id, status: 'done', evidence: [...b.evidence, ...ev], updated: now(),
    run: flags.run && flags.run !== true ? String(flags.run) : (process.env.LOOP_RUN ?? b.run) });
  console.log(asJson ? JSON.stringify({ id, status: 'done' }) : `${id} done`);
}

function cmdDrop() {
  const id = positional[0];
  if (!id) die('drop: needs a bead id');
  const { beads } = readLedger();
  const b = requireBead(id, beads);
  const why = flags.why && flags.why !== true ? String(flags.why) : '';
  if (!why) die('drop: --why is required — a dropped bead its dependents can still see needs a reason');
  append({ id, status: 'dropped', body: b.body ? `${b.body}\n\nDROPPED: ${why}` : `DROPPED: ${why}`, updated: now() });
  console.log(asJson ? JSON.stringify({ id, status: 'dropped' }) : `${id} dropped`);
}

/**
 * `answer` — the operator's reply to an ask, and the only inbound channel the
 * loop has for taste.
 *
 * An agent files an ask when it hits a question no gate can settle: is this
 * fair, does this feel good, is this the game we want. It never learns the
 * answer — its turn ended long before you read it. So an answer is not a reply
 * to anyone; it is a DECISION written into the ledger, and the next agent
 * inherits it through the memory every brief carries. That indirection is the
 * feature: it means a human can answer a week later, out of order, or never,
 * and nothing is waiting.
 *
 * The decision is a separate bead rather than an edit to the question, because
 * the ledger is append-only and because the two are genuinely different facts:
 * one is what the machine could not decide, the other is what you decided.
 * Both are worth keeping, and a diff between them is the taste record.
 */
function cmdAnswer() {
  const id = positional[0];
  if (!id) die('answer: needs the ask\'s bead id');
  const { beads } = readLedger();
  const q = requireBead(id, beads);
  if (q.kind !== 'question') die(`answer: ${id} is a ${q.kind}, not a question — only an ask can be answered`);
  const body = bodyArg();
  if (body === undefined || !body.trim()) {
    die('answer: needs --body or --body-file. An answer with no content is worse than none: '
      + 'it closes the ask and teaches the loop nothing.');
  }
  const created = now();
  const actor = String(flags.actor ?? process.env.LOOP_ACTOR ?? 'human');
  const title = flags.title && flags.title !== true
    ? String(flags.title)
    : `Answered: ${q.title}`;
  const decision = {
    id: mintId({ title, created, actor }, new Set(beads.map((b) => b.id))),
    title, kind: 'decision', status: 'done', priority: 1,
    body: `${body}\n\n(in answer to ${id} — "${q.title}")`,
    deps: [], parent: null, tags: ['answer', `answers:${id}`],
    actor, run: null, evidence: [], created, updated: created,
  };
  const bad = validate(normalize(decision));
  if (bad.length) die(`answer: ${bad.join('; ')}`);
  append(decision);
  // The ask itself closes. `done` not `dropped`: it was answered, not abandoned.
  append({ id, status: 'done', updated: created });
  console.log(asJson
    ? JSON.stringify({ ask: id, decision: decision.id })
    : `${id} answered — recorded as decision ${decision.id}\n`
      + '  The agent that asked will never see it. The next one reads it as memory.');
}

/** `learn` is `new --kind dead-end|finding` with the ergonomics reversed: a
 *  finding is born done, because it is knowledge, not work. It gets its own
 *  verb so that "write down what you just discovered" is one obvious command
 *  in the worker agent's prompt rather than a flag combination it has to
 *  remember at the end of a long turn. */
function cmdLearn() {
  if (flags.kind === undefined) flags.kind = 'finding';
  if (!KNOWLEDGE_KINDS.has(String(flags.kind))) {
    die(`learn: --kind must be one of ${[...KNOWLEDGE_KINDS].join('|')}`);
  }
  flags.status = 'done';
  if (flags.actor === undefined) flags.actor = process.env.LOOP_ACTOR ?? 'agent';
  cmdNew();
}

function cmdReady() {
  const { beads } = readLedger();
  const g = computeGraph(beads);
  const n = flags.n !== undefined ? Number(flags.n) : Infinity;
  const q = readyQueue(g).slice(0, n);
  if (asJson) { console.log(JSON.stringify(q, null, 2)); return; }
  if (!q.length) { console.log('(nothing ready)'); return; }
  for (const b of q) {
    console.log(`  P${b.priority}  ${b.id}  ${b.unblocks ? `unblocks ${b.unblocks}` : '          '}  ${b.title}`);
  }
}

function cmdShow() {
  const id = positional[0];
  if (!id) die('show: needs a bead id');
  const { beads } = readLedger();
  const g = computeGraph(beads);
  const n = g.nodes.find((x) => x.id === id);
  if (!n) die(`no such bead: ${id}`);
  if (asJson) { console.log(JSON.stringify(n, null, 2)); return; }
  console.log(`${n.id}  [${n.kind}/${n.status}${n.ready ? ' READY' : n.blocked ? ' BLOCKED' : ''}]  P${n.priority}`);
  console.log(`  ${n.title}`);
  if (n.body) console.log(`\n${n.body.split('\n').map((l) => `  ${l}`).join('\n')}\n`);
  if (n.deps.length) console.log(`  deps:     ${n.deps.join(', ')}`);
  if (n.unmet.length) console.log(`  UNMET:    ${n.unmet.join(', ')}`);
  if (n.tags.length) console.log(`  tags:     ${n.tags.join(', ')}`);
  if (n.gate.length) console.log(`  GATE:     ${n.gate.join('\n            ')}`);
  if (n.evidence.length) console.log(`  evidence: ${n.evidence.join('\n            ')}`);
  console.log(`  actor:    ${n.actor}${n.run ? `  run ${n.run}` : ''}`);
}

function cmdStats() {
  const { beads, problems } = readLedger();
  const g = computeGraph(beads);
  const s = summarize(g);
  if (asJson) { console.log(JSON.stringify({ ...s, problems: problems.length, cycles: g.cycles.length }, null, 2)); return; }
  for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(12)} ${v}`);
  if (g.cycles.length) console.log(`  cycles       ${g.cycles.length}`);
  if (problems.length) console.log(`  problems     ${problems.length}  (run: beads lint)`);
}

function cmdLint() {
  const { beads, problems } = readLedger();
  const g = computeGraph(beads);
  let bad = 0;
  for (const p of problems) { console.log(`  ✗ ${p.id ?? `line ${p.line}`}: ${p.why}`); bad++; }
  for (const d of g.dangling) { console.log(`  ✗ ${d.id}: depends on ${d.dep}, which does not exist`); bad++; }
  for (const c of g.cycles) { console.log(`  ✗ cycle: ${c.join(' → ')} → ${c[0]}`); bad++; }
  if (bad) { console.log(`\n✗ ledger has ${bad} problem${bad === 1 ? '' : 's'}\n`); process.exit(1); }
  console.log(`✓ ledger clean — ${beads.length} beads, ${g.edges.length} edges\n`);
}

/**
 * Files a gate command refers to, that must therefore already exist.
 *
 * class-A does not mean "has a gate", it means CERTIFIED AGAINST AN EXISTING
 * ONE — a requirement whose acceptance test has yet to be written is a request
 * FOR a test, which is different work with a different risk profile. Nothing
 * enforced that: `validateGate` checks the verb and the metacharacters, and it
 * is deliberately pure so it can run in the outbox validator with no
 * filesystem. So a planner could write `node plant/test/worker.selftest.mjs`,
 * label it class-A, and be entirely within the rules with no such file
 * anywhere. One did, on its second run, within an hour of the surface existing.
 *
 * Promotion is where a filesystem is available and where a human is looking,
 * so the check lives here. Conservative on purpose: only tokens that end in a
 * source extension are treated as paths, so a grep pattern containing a slash
 * is not mistaken for a file that must exist.
 */
const GATE_PATH = /^[\w./-]+\.(mjs|js|ts|json|sh|md|html|css)$/;
export function gateFiles(gate) {
  const out = [];
  for (const cmd of gate) {
    for (const tok of String(cmd).split(/\s+/)) {
      if (!tok.startsWith('-') && GATE_PATH.test(tok)) out.push(tok);
    }
  }
  return out;
}

/**
 * PROMOTE — the only privileged act in the system, with the Definition of Ready
 * enforced rather than remembered.
 *
 * This exists because promotion is where a human's attention actually enters
 * the loop, and a checklist a human is trusted to run from memory is a
 * checklist that gets skipped at 1am. LOOP-WBS.md §2.1 lists six criteria; the
 * three a machine can check are checked here, and the gate is PRINTED so the
 * promoter reads the shell they are about to authorise CI to run.
 */
function cmdPromote() {
  const id = positional[0];
  if (!id) die('promote: needs a bead id');
  const { beads } = readLedger();
  const b = requireBead(id, beads);
  const cls = classOf(b);

  const bad = [];
  if (KNOWLEDGE_KINDS.has(b.kind)) bad.push(`kind is "${b.kind}" — knowledge is never scheduled`);
  if (b.status !== 'proposed') bad.push(`status is "${b.status}", not "proposed"`);
  if (!cls) bad.push('R2/class: no class-a…class-d tag — an untagged bead is never dispatchable');
  if (cls === 'a' && !b.gate.length) bad.push('R2: class-a means certified against a gate, and this names none');
  // …and the gate must EXIST. "certified against an existing gate" is the whole
  // definition of the class, and a gate file that has yet to be written makes
  // this a request FOR a test rather than work certified by one.
  const creating = createsGate(b);
  if (cls === 'a' && !creating) {
    for (const f of gateFiles(b.gate)) {
      if (!existsSync(isAbsolute(f) ? f : join(ROOT, f))) {
        bad.push(`R2: the gate names ${f}, which does not exist — class-a means certified against an `
          + 'EXISTING gate. Either write the gate first, or tag this `creates-gate` so the turn '
          + 'builds it and is judged on it existing, passing, and breaking nothing.');
      }
    }
  }
  // The mirror image, and it matters as much: a gate-CREATING bead whose gate
  // already exists is mislabelled. The turn would "create" a file that is
  // already there, and the check that is supposed to prove new capability
  // would pass on day one having proved nothing.
  // The TAG, not createsGate(): a bead tagged `creates-gate` with no gate named
  // fails createsGate() and would quietly degrade to plain class-d — safe, but
  // silently not what its author meant. Catch the mistake rather than absorb it.
  if ((b.tags ?? []).includes('creates-gate') && !b.gate.length) {
    bad.push('creates-gate names no gate. Say which file the turn will bring into being, '
      + 'or drop the tag — the whole check is that a specific gate exists afterwards and did not before.');
  }
  if (creating) {
    for (const f of gateFiles(b.gate)) {
      if (existsSync(isAbsolute(f) ? f : join(ROOT, f))) {
        bad.push(`creates-gate names ${f}, which ALREADY exists — this is class-a work. `
          + 'A gate-creating turn is judged on bringing a gate into being; one that is already there proves nothing.');
      }
    }
    console.log('  ⚠ GATE-CREATING TURN. This bead is dispatchable without a pre-existing gate,');
    console.log('    so the agent writes both the work and the test that judges it. Read the diff:');
    console.log('    a gate that asserts nothing passes just as green as one that does.');
  }
  if (cls === 'b') bad.push('class-b is never fleet-dispatchable — promote it only if a human will do the work');
  if (!b.body.trim()) bad.push('R5: no body, so it carries no brief and no memory');
  for (const g of b.gate) console.log(`  gate: ${g}`);

  if (bad.length && !flags.force) {
    console.error(`\nbeads: ${id} does not meet the Definition of Ready:`);
    for (const x of bad) console.error(`  ✗ ${x}`);
    console.error('\n  Fix the bead, or --force if you know why this one is different.\n');
    process.exit(1);
  }
  append({ id, status: 'ready', updated: now() });
  console.log(`${id} promoted to ready${bad.length ? ' (FORCED past ' + bad.length + ' DoR failure(s))' : ''}`);
}

const VERBS = {
  new: cmdNew, set: cmdSet, dep: cmdDep, done: cmdDone, drop: cmdDrop,
  learn: cmdLearn, ready: cmdReady, show: cmdShow, stats: cmdStats, lint: cmdLint,
  promote: cmdPromote, answer: cmdAnswer,
};

if (!cmd || cmd === '--help' || cmd === '-h' || !VERBS[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(cmd && !VERBS[cmd] ? 1 : 0);
}
VERBS[cmd]();
