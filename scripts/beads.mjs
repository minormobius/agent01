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
  KINDS, STATUSES, KNOWLEDGE_KINDS,
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
    body: flags.body && flags.body !== true ? String(flags.body) : '',
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
  if (flags.body !== undefined && flags.body !== true) patch.body = String(flags.body);
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

const VERBS = {
  new: cmdNew, set: cmdSet, dep: cmdDep, done: cmdDone, drop: cmdDrop,
  learn: cmdLearn, ready: cmdReady, show: cmdShow, stats: cmdStats, lint: cmdLint,
};

if (!cmd || cmd === '--help' || cmd === '-h' || !VERBS[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(cmd && !VERBS[cmd] ? 1 : 0);
}
VERBS[cmd]();
