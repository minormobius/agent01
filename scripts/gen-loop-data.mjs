#!/usr/bin/env node
// gen-loop-data.mjs — publish the ticket graph to the viewing surface.
//
//   .github/loop/{beads.jsonl,runs.jsonl,config.json}   →   loop/data/graph.json
//
// Two trees, and the split is deliberate. The LEDGER lives under `.github/`,
// which is the one part of this repo the root worker does not serve to the
// internet; the VIEW lives under `loop/`, which is served. So publishing is an
// explicit, reviewable generation step rather than a side effect of the loop
// writing state — and the thing on the internet is a derived artifact that a
// human can diff before it ships.
//
// That matters more than it sounds. An autonomous loop writes its own ledger;
// if the ledger were served directly, the loop would have a direct write path
// to a public page, and every bead body an agent composes would be published
// the instant it was written. This way the publish is a separate commit that
// wakes a separate workflow.
//
//   node scripts/gen-loop-data.mjs           # dry run, print the summary
//   node scripts/gen-loop-data.mjs --write   # write loop/data/graph.json
//   node scripts/gen-loop-data.mjs --check   # non-zero if stale (preflight uses this)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLedger, computeGraph, readyQueue, summarize } from './lib/beads.mjs';
import { scrubText } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

const LEDGER = join(ROOT, '.github', 'loop', 'beads.jsonl');
const RUNS = join(ROOT, '.github', 'loop', 'runs.jsonl');
const CONFIG = join(ROOT, '.github', 'loop', 'config.json');
const OUT = join(ROOT, 'loop', 'data', 'graph.json');

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const { beads, problems } = parseLedger(read(LEDGER));
const graph = computeGraph(beads);
const counts = summarize(graph);
const queue = readyQueue(graph);

// ------------------------------------------------------------------- runs --
// One record per turn: what it worked on, what it cost, what the judge said.
// This is the curve — the deliverable of the whole programme — and it is empty
// until a turn has actually run. IT STAYS EMPTY UNTIL THEN. A seeded example
// curve on a public page is indistinguishable from a measured one to everybody
// except the person who seeded it, and this repo's own house rule is that
// green is not proof.
const runs = read(RUNS).split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'))
  .map((l, i) => { try { return JSON.parse(l); } catch { console.error(`  ! runs.jsonl:${i + 1} unparseable`); return null; } })
  .filter(Boolean);

const cfg = existsSync(CONFIG) ? JSON.parse(read(CONFIG)) : {};

/**
 * THE ORACLE STACK — the only honest progress bar this programme has.
 *
 * `FACTORIO.md` §2 lists seven gates the game must pass, and they are the
 * cathedral: each one is a machine check that must exist before the work above
 * it can be judged at all. Turn count is not progress, and neither is bead
 * count — a loop can produce a hundred green turns polishing what it already
 * had (it did: lp-ec52ed). **A gate coming into existence is progress**, because
 * it permanently widens what the loop is able to build next.
 *
 * Derived from the FILESYSTEM, never from a hand-maintained list. A gate is
 * built when its checker is on disk, so this cannot drift into claiming
 * something the repo does not have — which is the failure mode a progress
 * dashboard is most prone to and least forgiven for.
 */
const ORACLE = [
  { n: 1, name: 'determinism', what: 'the same seed gives an identical pocket', file: 'foam/test/foamworld.selftest.mjs' },
  { n: 2, name: 'watertightness', what: 'per-cell Euler V−E+F=2, volumes sum', file: 'foam/test/foamworld.selftest.mjs' },
  { n: 3, name: 'macro solvability', what: 'the walk certificate, par in band', file: 'foam/test/foamworld.selftest.mjs' },
  { n: 4, name: 'solid fidelity', what: 'a summon produced the solid it claimed', file: 'plant/test/solids.selftest.mjs' },
  { n: 5, name: 'production feasibility', what: 'the recipe network is satisfiable', file: 'plant/test/production.selftest.mjs' },
  { n: 6, name: 'the build certificate', what: 'a legal construction order exists', file: 'plant/test/buildorder.selftest.mjs' },
  { n: 7, name: 'frame budget', what: 'a per-turn number on mobile', file: 'plant/test/frame.selftest.mjs' },
];
function oracle() {
  return ORACLE.map((g) => ({ ...g, built: existsSync(join(ROOT, g.file)) }));
}

/**
 * What the loop is doing THIS MINUTE, read off the same files the workflows
 * use as their message bus. Not a status a component reports — a status
 * derived from the artefacts, so it cannot claim to be running something it
 * is not.
 */
function nowDoing() {
  const workDir = join(ROOT, '.github', 'loop', 'work');
  const orders = existsSync(workDir)
    ? readdirSync(workDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    : [];
  if (orders.length) return { state: 'working', detail: `${orders.length} turn(s) in flight`, beads: orders };
  if (existsSync(join(ROOT, '.github', 'loop', 'review', 'request.json'))) return { state: 'reviewing', detail: 'judging the backlog against the vision', beads: [] };
  if (existsSync(join(ROOT, '.github', 'loop', 'plan', 'request.json'))) return { state: 'planning', detail: 'writing requirements', beads: [] };
  return { state: 'idle', detail: 'nothing in flight', beads: [] };
}

/**
 * The operator's answer to an ask, if there is one.
 *
 * Found by tag rather than by edge, because an ask deliberately carries no
 * dependencies — that absence is what stops it blocking anything, so the link
 * back has to live somewhere that is not the graph.
 */
function answerFor(askId, nodes) {
  const d = nodes.find((n) => n.kind === 'decision' && n.tags.includes(`answers:${askId}`));
  return d ? { id: d.id, title: scrubText(d.title), body: scrubText(d.body) } : null;
}

/** The curve: judge score against turn number, per artifact. */
function curve(runs) {
  const byArtifact = new Map();
  for (const r of runs) {
    if (typeof r.turn !== 'number' || typeof r.score !== 'number') continue;
    const key = r.artifact ?? 'unnamed';
    if (!byArtifact.has(key)) byArtifact.set(key, []);
    byArtifact.get(key).push({ turn: r.turn, score: r.score, bead: r.bead ?? null, at: r.at ?? null });
  }
  return [...byArtifact.entries()]
    .map(([artifact, points]) => ({ artifact, points: points.sort((a, b) => a.turn - b.turn) }))
    .sort((a, b) => a.artifact.localeCompare(b.artifact));
}

// Trim what the browser does not need. Bodies are kept — they are the memory,
// and a dead-end nobody can read is a dead-end nobody learns from — but every
// string that reaches a public page goes through the same redaction every other
// generator in this repo uses (CLAUDE.md: the whole repo root is internet-facing).
const publicBead = (n) => ({
  id: n.id,
  title: scrubText(n.title),
  kind: n.kind,
  status: n.status,
  priority: n.priority,
  body: scrubText(n.body),
  deps: n.deps,
  parent: n.parent,
  tags: n.tags,
  actor: n.actor,
  run: n.run,
  evidence: n.evidence.map(scrubText),
  created: n.created,
  updated: n.updated,
  blocked: n.blocked,
  ready: n.ready,
  unmet: n.unmet,
});

const payload = {
  $generated: 'scripts/gen-loop-data.mjs — do not edit by hand',
  // NO TIMESTAMP. Every other generated file here that embeds one has to be
  // special-cased in preflight because it always differs (see spec/data.js).
  // The ledger's own `updated` fields already carry the time that matters.
  enabled: cfg.enabled === true,
  branch: cfg.branch ?? null,
  budget: cfg.budget ?? null,
  stop: cfg.stop ?? null,
  judge: cfg.judge ?? null,
  // The org chart is published for the same reason the budget is: the governor
  // being legible from outside is the point, not a courtesy. It carries a
  // `status` so the page can say "proposed" rather than implying it is wired.
  seats: cfg.seats ?? null,
  counts,
  beads: graph.nodes.map(publicBead),
  edges: graph.edges,
  layers: graph.layers,
  ready: queue.map((n) => ({ id: n.id, unblocks: n.unblocks })),
  oracle: oracle(),
  now: nowDoing(),
  // ASKS — the loop's outbound channel to its operator, published because an
  // ask nobody sees is an ask nobody answers. Open ones first and unanswered
  // is the whole point of showing them; answered ones stay so the page carries
  // the taste record, which is the only part of this graph that could not have
  // been produced by more looping.
  asks: graph.nodes
    .filter((n) => n.kind === 'question' && n.tags.includes('ask'))
    .map((n) => ({
      id: n.id,
      title: scrubText(n.title),
      body: scrubText(n.body),
      open: n.status === 'proposed',
      about: (n.tags.find((t) => t.startsWith('asked-about:')) ?? '').slice('asked-about:'.length) || null,
      answer: answerFor(n.id, graph.nodes),
      updated: n.updated,
    }))
    .sort((a, b) => (a.open === b.open ? b.updated.localeCompare(a.updated) : a.open ? -1 : 1)),
  cycles: graph.cycles,
  dangling: graph.dangling,
  problems: problems.map((p) => ({ ...p, why: scrubText(p.why) })),
  runs: runs.map((r) => ({ ...r, note: r.note ? scrubText(r.note) : undefined })),
  curve: curve(runs),
};

const json = JSON.stringify(payload, null, 2) + '\n';
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
const stale = current !== json;

if (check) {
  if (stale) {
    console.log(`  ✗ loop/data/graph.json is stale — run: node scripts/gen-loop-data.mjs --write`);
    process.exit(1);
  }
  console.log('  ✓ loop/data/graph.json is current');
  process.exit(0);
}

if (write) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`${stale ? 'wrote' : 'unchanged'} loop/data/graph.json`);
} else {
  console.log(`${stale ? 'WOULD CHANGE' : 'up to date'} — loop/data/graph.json`);
}

console.log(`  ${counts.total} beads (${counts.done} done, ${counts.ready} ready, ${counts.blocked} blocked, ${counts.knowledge} knowledge)`);
console.log(`  ${graph.edges.length} edges, ${graph.layers.length} layers`);
console.log(`  ${runs.length} run${runs.length === 1 ? '' : 's'} recorded — the curve has ${payload.curve.length} series`);
if (problems.length) console.log(`  ⚠ ${problems.length} ledger problem(s) — node scripts/beads.mjs lint`);
if (graph.cycles.length) console.log(`  ⚠ ${graph.cycles.length} cycle(s)`);
