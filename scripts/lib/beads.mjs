// beads.mjs — the ticket graph. Pure functions over an append-only JSONL ledger.
//
// This is the memory a long-running loop has instead of a context window. The
// premise, borrowed from beads (github.com/steveyegge/beads) and from
// docs/CLOSED-LOOP.md §6.2: a flat queue cannot carry *why*, so the unit is a
// node in a graph with dependency edges, and the graph is what survives
// compaction, a runner dying, and the operator going to bed.
//
// ---------------------------------------------------------------- the ledger
//
// APPEND-ONLY JSONL, LAST RECORD PER ID WINS. Not a JSON document, and the
// reason is git, not taste. Two agents working two beads on two branches both
// "update the tracker"; with a JSON object they conflict on every write, and a
// three-way merge of a rewritten object silently loses one side's edit. With an
// append-only log, a merge is a concatenation — the union is always the right
// answer, and ordering within a file only decides which of two edits to the
// SAME bead wins, which is exactly the case where you want the later one.
//
// So: never rewrite a line. Append a new record with the same id and the fields
// that changed. `parseLedger` folds them left-to-right.
//
// -------------------------------------------------------------------- ids
//
// CONTENT-DERIVED, NOT A COUNTER. A counter is the obvious thing and it is
// wrong here for the same reason: two branches that each mint `lp-0042` produce
// a file that merges cleanly and means something false. The id is a short hash
// of (title, created, actor), so two agents inventing the same bead
// independently collide only if they invented *the same bead at the same
// millisecond*, and two agents inventing different beads never collide.
//
// ------------------------------------------------------------------- kinds
//
// `dead-end` is the one that is not in most trackers and is the whole point.
// CLOSED-LOOP.md records a build that spent several turns working around a
// fetch failure the harness had already hit and not recorded, then published
// the wrong general claim to a live page. A dead-end bead is that finding,
// written down, addressed to turn 30. It is never schedulable — it exists to be
// read before work starts, and `readyQueue` will not return one.

// `decision` exists so that a worker never has to wait for a human. An agent
// that hits a judgement call inside a turn RECORDS THE CALL AND CONTINUES —
// what it chose, why, and what would reverse it. Human review happens at the
// sprint boundary, over the decision log, not inside the turn.
//
// This is the difference between a fleet and a queue of people waiting to be
// unblocked. `question` is retained for the OPERATOR's own open calls and is
// deliberately not writable by an agent (see loop-apply-outbox.mjs): a worker
// that can file a blocking question eventually will.
export const KINDS = ['epic', 'task', 'finding', 'dead-end', 'question', 'decision'];

// STATUS IS WHAT SOMEONE DECIDED. `blocked` is NOT in this list, deliberately:
// blocked-ness is a fact about the graph, not a decision, and storing it means
// storing something that goes stale the moment a dependency closes. It is
// derived in `computeGraph`. The bug this avoids is a bead sitting `blocked`
// forever because the run that closed its last dependency forgot to un-block it.
export const STATUSES = ['proposed', 'ready', 'in_progress', 'done', 'dropped'];

// Kinds that are knowledge rather than work. They can be depended ON — "do not
// start X until someone has read finding Y" is a real edge — but they are never
// dispatched, and a dependency on one is satisfied by it merely existing.
export const KNOWLEDGE_KINDS = new Set(['finding', 'dead-end', 'question', 'decision']);

// ------------------------------------------------------------------ class --
// LOOP-WBS.md §2.3. Only class A may be dispatched to an unattended fleet:
//   A  certified against an EXISTING gate
//   B  gate-extending — it defines what "done" means, so a human reviews it
//   C  taste — settles over days on the audience ladder
//   D  exploratory — output is a finding, hard-capped
//
// Carried as a `class-a`…`class-d` tag. UNTAGGED IS NOT CLASS A. A rehearsal
// found the reactor picking a class-B bead as its first-ever act, because the
// taxonomy lived in a document and in tags that nothing read. Defaulting an
// unlabelled bead to schedulable would reintroduce exactly that, so the default
// is "not dispatchable" and the cost of forgetting a tag is a bead that sits
// still — visible, cheap, and the right direction to fail in.
export const CLASSES = ['a', 'b', 'c', 'd'];

export function classOf(bead) {
  const t = (bead.tags ?? []).find((x) => /^class-[a-d]$/.test(x));
  return t ? t.slice('class-'.length) : null;
}

/**
 * GATE-CREATING WORK — the escape from a loop that can only polish.
 *
 * class-A means "certified against an EXISTING gate", and only class-A is
 * dispatchable. Follow that through and the consequence is severe: **work that
 * needs a new gate can never be given to the fleet**, so the loop can only ever
 * do work whose test someone already wrote. It cannot expand its own
 * verification surface, which means it cannot build anything genuinely new.
 *
 * That is not a hypothetical. This loop spent five turns producing an excellent
 * explainer for a primitive and no game, and the operator noticed before the
 * machinery did. The mechanism was exactly this: every gateable thing was a
 * refinement of what already existed, and everything on the roadmap — the
 * production oracle, object kinds, placement into a real pocket — had no test
 * yet and was therefore permanently unschedulable. A gate-graded loop drifts
 * toward whatever is already gateable, and the drift looks like diligence.
 *
 * So a bead may instead declare the gate it will CREATE. The machine check is
 * strictly stronger than class-A's, not weaker:
 *
 *   1. the named gate file did NOT exist when the bead was promoted;
 *   2. it EXISTS after the turn;
 *   3. it PASSES;
 *   4. and the whole existing suite still passes — no regression.
 *
 * The residual risk is real and worth naming: an agent can write a gate that
 * asserts nothing and then pass it. Nothing here prevents that. What stands
 * against it is the review seat reading the diff and the judge's adversarial
 * signal — both human-shaped checks on a machine-shaped claim. Treat a
 * gate-creating turn as the one most worth reading.
 */
export function createsGate(bead) {
  return (bead.tags ?? []).includes('creates-gate')
    && Array.isArray(bead.gate) && bead.gate.length > 0;
}

const ID_RE = /^[a-z]{2}-[0-9a-f]{6}$/;

// ------------------------------------------------------------- gate safety --
// A gate is SHELL THAT CI RUNS with the repo checked out and a push token in
// the environment. Originally only a human could write one, which was safe and
// made the `plan` seat impossible: a planner's entire job is to write
// requirements that name their acceptance test.
//
// So gates are allowed from a planner, and constrained instead. A command must
// begin with one of a short list of verbs that read or compare, and must carry
// no shell metacharacter that could chain, redirect or substitute. That turns
// "arbitrary shell from the ledger" into "run one read-only checker", which is
// all a gate has ever needed to be.
//
// The promotion gate still applies on top: a proposed bead is never dispatched,
// so a gate is inert until someone promotes it, and `beads promote` prints it.
export const GATE_VERBS = ['node ', 'cmp ', 'diff ', 'test ', 'grep ', 'ls ', 'head ', 'wc '];
const GATE_FORBIDDEN = /[;&|><`$(){}]|\B--no-verify\b/;

export function validateGate(cmds) {
  const bad = [];
  for (const c of cmds) {
    if (typeof c !== 'string' || !c.trim()) { bad.push('a gate command is empty'); continue; }
    if (!GATE_VERBS.some((v) => c.startsWith(v))) {
      bad.push(`gate "${c.slice(0, 60)}" must start with one of: ${GATE_VERBS.map((v) => v.trim()).join(', ')}`);
    }
    if (GATE_FORBIDDEN.test(c)) {
      bad.push(`gate "${c.slice(0, 60)}" contains a shell metacharacter — a gate runs one checker, it does not compose`);
    }
  }
  return bad;
}

/** FNV-1a → 24 bits of hex. No crypto import: this runs in the browser viewer
 *  too (to mint ids for a bead composed in the UI), and it is an identifier,
 *  not a security boundary. Collisions are checked against the ledger anyway. */
function shortHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Fold 32 bits into 24 so the id stays six hex characters — short enough to
  // say out loud, which matters when a human is reading a run log.
  return (((h >>> 8) ^ (h & 0xff)) >>> 0).toString(16).padStart(6, '0').slice(-6);
}

/** Mint an id for a bead. `taken` is any Set-like of existing ids; on collision
 *  we perturb rather than counting up, so the retry is still content-derived. */
export function mintId(bead, taken = new Set(), prefix = 'lp') {
  const seed = `${bead.title || ''} ${bead.created || ''} ${bead.actor || ''}`;
  let id = `${prefix}-${shortHash(seed)}`;
  for (let salt = 1; taken.has(id) && salt < 1000; salt++) {
    id = `${prefix}-${shortHash(`${seed} ${salt}`)}`;
  }
  return id;
}

/** A bead with every optional field filled in. The viewer and the scheduler both
 *  read these, and neither should carry `?? []` at every use site. */
export function normalize(raw) {
  return {
    id: raw.id,
    title: raw.title ?? '',
    kind: raw.kind ?? 'task',
    status: raw.status ?? 'proposed',
    priority: Number.isInteger(raw.priority) ? raw.priority : 2, // 0 = drop everything
    body: raw.body ?? '',
    deps: Array.isArray(raw.deps) ? [...raw.deps] : [],   // blocked-by
    parent: raw.parent ?? null,
    tags: Array.isArray(raw.tags) ? [...raw.tags] : [],
    actor: raw.actor ?? 'unknown',
    run: raw.run ?? null,          // which turn touched it last
    evidence: Array.isArray(raw.evidence) ? [...raw.evidence] : [],
    // R2 MADE MACHINE-RUNNABLE. Shell commands that decide `done`, run by the
    // WORKFLOW after the agent's turn — never by the agent, which has no Bash
    // and correctly reported that it could not verify its own acceptance test.
    //
    // Only a human can put a gate here: loop-apply-outbox.mjs never copies this
    // field onto an agent's proposal, and proposals are born `proposed` anyway.
    // So "the loop runs shell from its own ledger" is bounded by the same
    // promotion gate as everything else.
    gate: Array.isArray(raw.gate) ? [...raw.gate] : [],
    created: raw.created ?? null,
    updated: raw.updated ?? raw.created ?? null,
  };
}

export function validate(bead) {
  const bad = [];
  if (!bead.id || !ID_RE.test(bead.id)) bad.push(`id "${bead.id}" is not <xx>-<6 hex>`);
  if (!bead.title || !bead.title.trim()) bad.push('title is empty');
  if (!KINDS.includes(bead.kind)) bad.push(`kind "${bead.kind}" not one of ${KINDS.join('|')}`);
  if (!STATUSES.includes(bead.status)) bad.push(`status "${bead.status}" not one of ${STATUSES.join('|')}`);
  if (!Number.isInteger(bead.priority) || bead.priority < 0 || bead.priority > 3) {
    bad.push(`priority ${bead.priority} outside 0..3`);
  }
  bad.push(...validateGate(bead.gate ?? []));
  if (bead.deps.includes(bead.id)) bad.push('depends on itself');
  if (bead.parent === bead.id) bad.push('is its own parent');
  return bad;
}

/**
 * Fold the append-only log into current state.
 *
 * Each line is a partial record: `{id, ...changed fields}`. Later lines patch
 * earlier ones. A line with `"tombstone": true` removes the bead outright —
 * used only for beads created in error, because a *finished* bead is `done`,
 * not deleted, and a *wrong* bead is `dropped`. Deleting loses the memory,
 * which is the one thing this file exists to keep.
 *
 * Malformed lines are collected, never thrown: a single bad append from a
 * half-written agent turn must not make the whole graph unreadable, because the
 * graph is what the next turn reads to find out what happened.
 */
export function parseLedger(text) {
  const order = [];             // first-seen order, so output is stable
  const byId = new Map();
  const problems = [];
  const lines = String(text ?? '').split('\n');

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) return;
    let rec;
    try { rec = JSON.parse(t); }
    catch (e) { problems.push({ line: i + 1, why: `unparseable JSON: ${e.message}` }); return; }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      problems.push({ line: i + 1, why: 'record is not an object' }); return;
    }
    if (!rec.id) { problems.push({ line: i + 1, why: 'record has no id' }); return; }

    if (rec.tombstone) { byId.delete(rec.id); return; }
    if (!byId.has(rec.id)) order.push(rec.id);
    byId.set(rec.id, { ...(byId.get(rec.id) ?? {}), ...rec });
  });

  const beads = order.filter((id) => byId.has(id)).map((id) => normalize(byId.get(id)));
  for (const b of beads) for (const why of validate(b)) problems.push({ id: b.id, why });
  return { beads, problems };
}

/** One appendable line. Sorted keys so a diff of the ledger reads as a diff of
 *  meaning rather than of key order. */
export function toLine(patch) {
  const keys = Object.keys(patch).sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a.localeCompare(b)));
  const out = {};
  for (const k of keys) out[k] = patch[k];
  return JSON.stringify(out);
}

/**
 * Derived view of the graph: what is blocked, what is ready, where cycles are,
 * and a layering for drawing it.
 *
 * A dep on a MISSING bead is treated as blocking and reported. The alternative —
 * ignoring it — means a typo in a dependency silently promotes a bead into the
 * ready queue, and the scheduler dispatches work whose prerequisite never ran.
 */
export function computeGraph(beads) {
  const byId = new Map(beads.map((b) => [b.id, b]));
  const dangling = [];
  const edges = [];

  for (const b of beads) {
    for (const d of b.deps) {
      if (!byId.has(d)) { dangling.push({ id: b.id, dep: d }); continue; }
      edges.push({ from: d, to: b.id, kind: 'dep' });     // d must land before b
    }
    if (b.parent && byId.has(b.parent)) edges.push({ from: b.parent, to: b.id, kind: 'parent' });
    else if (b.parent) dangling.push({ id: b.id, dep: b.parent });
  }

  // A dependency is SATISFIED if it is done, dropped, or knowledge. Dropped
  // counts because "we decided not to" is a resolution — leaving dependents
  // blocked on an abandoned bead is how a queue quietly stops producing work,
  // and a loop that stops producing work looks identical to a loop that is done.
  const satisfied = (id) => {
    const b = byId.get(id);
    if (!b) return false;
    return b.status === 'done' || b.status === 'dropped' || KNOWLEDGE_KINDS.has(b.kind);
  };

  const cycles = detectCycles(beads, byId);
  const inCycle = new Set(cycles.flat());

  const nodes = beads.map((b) => {
    const unmet = b.deps.filter((d) => !satisfied(d));
    const blocked = unmet.length > 0 || inCycle.has(b.id);
    return {
      ...b,
      unmet,
      blocked,
      // READY IS A DERIVED FACT, and it is deliberately narrow: only a bead
      // someone has explicitly marked `ready` and whose dependencies have all
      // landed. `proposed` beads are a backlog, not a queue — promotion is a
      // decision, and an autonomous loop that promotes its own proposals with
      // no gate is a random walk with a commit log (CLOSED-LOOP.md §3).
      ready: b.status === 'ready' && !blocked && !KNOWLEDGE_KINDS.has(b.kind),
      // READY and DISPATCHABLE are different questions and conflating them is
      // what let a class-B bead reach the front of the queue. `ready` means a
      // human or an agent may pick this up. `dispatchable` means the UNATTENDED
      // fleet may — which additionally requires class A, because class B defines
      // what "done" means and an agent that can redefine done has no gate.
      dispatchable: b.status === 'ready' && !blocked && !KNOWLEDGE_KINDS.has(b.kind)
        && (classOf(b) === 'a' || createsGate(b)),
      class: classOf(b),
      createsGate: createsGate(b),
    };
  });

  return { nodes, edges, cycles, dangling, layers: layer(nodes, byId) };
}

/** Depth-first cycle detection. Returns each cycle as its list of ids. A cycle
 *  is a bug in the graph, not a state to survive: every bead in one is treated
 *  as blocked so the scheduler refuses to dispatch any of them. */
export function detectCycles(beads, byId = new Map(beads.map((b) => [b.id, b]))) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map(beads.map((b) => [b.id, WHITE]));
  const stack = [];
  const cycles = [];

  const walk = (id) => {
    if (!byId.has(id)) return;
    colour.set(id, GREY);
    stack.push(id);
    for (const d of byId.get(id).deps) {
      if (!byId.has(d)) continue;
      const c = colour.get(d);
      if (c === WHITE) walk(d);
      else if (c === GREY) cycles.push(stack.slice(stack.indexOf(d)));
    }
    stack.pop();
    colour.set(id, BLACK);
  };

  for (const b of beads) if (colour.get(b.id) === WHITE) walk(b.id);
  return cycles;
}

/** Longest-path layering, for drawing. Layer 0 is work with nothing in front of
 *  it; a bead sits one layer past its deepest dependency. Cycle members are
 *  pinned to layer 0 rather than recursing forever. */
export function layer(nodes, byId = new Map(nodes.map((n) => [n.id, n]))) {
  const depth = new Map();
  const visiting = new Set();

  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0;                  // cycle — stop descending
    const n = byId.get(id);
    if (!n) return 0;
    visiting.add(id);
    let d = 0;
    for (const dep of n.deps) if (byId.has(dep)) d = Math.max(d, depthOf(dep) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };

  const out = [];
  for (const n of nodes) {
    const d = depthOf(n.id);
    (out[d] ??= []).push(n.id);
  }
  return out.map((l) => l ?? []);
}

/**
 * What to work on next, best first.
 *
 * Ordering: priority, then how much the bead unblocks, then age. The middle
 * term is the one that matters and the one a flat queue cannot express — a
 * ready bead with eight dependents is worth more than a ready leaf of the same
 * priority, because finishing it converts eight blocked beads into schedulable
 * ones. This is the scheduling value of having a graph at all.
 */
export function readyQueue(graph, { dispatchableOnly = false } = {}) {
  const dependents = new Map();
  for (const e of graph.edges) {
    if (e.kind !== 'dep') continue;
    dependents.set(e.from, (dependents.get(e.from) ?? 0) + 1);
  }
  return graph.nodes
    .filter((n) => (dispatchableOnly ? n.dispatchable : n.ready))
    .map((n) => ({ ...n, unblocks: dependents.get(n.id) ?? 0 }))
    .sort((a, b) =>
      a.priority - b.priority ||
      b.unblocks - a.unblocks ||
      String(a.created ?? '').localeCompare(String(b.created ?? '')) ||
      a.id.localeCompare(b.id));
}

/** Counts the viewer and the stop-conditions both want, in one pass. */
export function summarize(graph) {
  const c = { total: graph.nodes.length, ready: 0, blocked: 0, in_progress: 0, done: 0, dropped: 0, proposed: 0, knowledge: 0 };
  for (const n of graph.nodes) {
    if (KNOWLEDGE_KINDS.has(n.kind)) { c.knowledge++; continue; }
    if (n.status === 'done') c.done++;
    else if (n.status === 'dropped') c.dropped++;
    else if (n.status === 'in_progress') c.in_progress++;
    else if (n.ready) c.ready++;
    else if (n.blocked) c.blocked++;
    else c.proposed++;
  }
  return c;
}
