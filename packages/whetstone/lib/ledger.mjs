#!/usr/bin/env node
// ledger.mjs — the commons' ledger: what the souls are doing, what they found, and what was
// thrown away. One file, two uses: the lab imports it to validate and fold, and a copy sits in
// every commons-mounted folder as `ledger/ledger.mjs`, the command-line tool the souls run.
//
// Borrowed from the loop's beads (scripts/lib/beads.mjs, docs/LOOPS.md §2), keeping what fits:
//   - APPEND-ONLY JSONL, folded in order. Concurrent sessions can only add lines, never clobber.
//   - CONTENT-DERIVED IDS, so two sessions never mint the same id for different things.
//   - BLOCKED IS DERIVED, never stored, so it never goes stale.
//   - DEAD-ENDS ARE FIRST-CLASS, and never schedulable: they exist to be read before work.
// and replacing the loop's operator with the three of them checking each other:
//
//   - nobody promotes their own task to ready; someone else has to want it done
//   - nobody closes the task they claimed; someone else checks the evidence
//   - anyone may drop anything, with a reason (Mozzie's job; the others may too)
//   - any drop or sweep can be appealed by someone other than whoever did it, and the appeal is
//     decided by the one party left: neither the appellant nor the actor. Two of three overturn.
//
// Every line is an operation { op, id, by, at, ... }. The fold applies them in order and REFUSES
// any that break a rule, so a soul that writes the file by hand gets nothing it couldn't get
// through the tool. The lab additionally rejects any new line whose `by` isn't the soul whose
// session wrote it, and any session that edits old lines.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOULS_DEFAULT = ['modulo', 'morphyx', 'mozzie'];
export const ITEM_KINDS = ['task', 'finding', 'dead-end', 'decision'];
const KNOWLEDGE = new Set(['finding', 'dead-end', 'decision']);
const TEXT_MAX = 4000;

// FNV-1a, folded to 24 bits: the same id scheme as the loop's beads.
function shortHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (((h >>> 8) ^ (h & 0xff)) >>> 0).toString(16).padStart(6, '0').slice(-6);
}
export function mintId(prefix, seed, taken) {
  let id = `${prefix}-${shortHash(seed)}`;
  for (let salt = 1; taken.has(id) && salt < 1000; salt++) id = `${prefix}-${shortHash(`${seed} ${salt}`)}`;
  return id;
}

export function parseLines(text) {
  const ops = [], bad = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    try { const o = JSON.parse(t); if (o && typeof o === 'object' && !Array.isArray(o)) ops.push(o); else bad.push({ line: i + 1, why: 'not an object' }); }
    catch (e) { bad.push({ line: i + 1, why: `unparseable: ${e.message}` }); }
  });
  return { ops, bad };
}

// Fold the operations into state. Returns { items, refused }: every refused op with its reason.
export function fold(ops, { souls = SOULS_DEFAULT } = {}) {
  const items = new Map();
  const refused = [];
  const no = (op, why) => refused.push({ op, why });
  const text = (s) => typeof s === 'string' && s.trim() && s.length <= TEXT_MAX;
  for (const op of ops) {
    const by = op.by;
    if (!souls.includes(by) && by !== 'lab') { no(op, `unknown author "${by}"`); continue; }
    const it = items.get(op.id);
    switch (op.op) {
      case 'new': {
        if (it) { no(op, 'id already exists'); break; }
        if (!ITEM_KINDS.includes(op.kind)) { no(op, `kind must be one of ${ITEM_KINDS.join(', ')}`); break; }
        if (!text(op.title)) { no(op, 'a title is required (at most 4000 characters)'); break; }
        if (op.body != null && typeof op.body !== 'string') { no(op, 'body must be text'); break; }
        const deps = Array.isArray(op.deps) ? op.deps.filter((d) => typeof d === 'string') : [];
        const missing = deps.filter((d) => !items.has(d));
        if (missing.length) { no(op, `depends on unknown ${missing.join(', ')}`); break; }
        items.set(op.id, { id: op.id, kind: op.kind, title: op.title, body: op.body || '', deps, by, at: op.at,
          status: KNOWLEDGE.has(op.kind) ? 'known' : 'proposed', notes: [], history: [] });
        break;
      }
      case 'sweep': {
        if (by !== 'lab') { no(op, 'sweeps are recorded by the lab'); break; }
        items.set(op.id, { id: op.id, kind: 'sweep', title: op.title, body: op.body || '', deps: [], by: op.sweeper, at: op.at,
          status: 'standing', removed: op.removed || {}, authors: op.authors || {}, notes: [], history: [] });
        break;
      }
      case 'appeal': {
        if (!it || !(it.kind === 'sweep' || it.status === 'dropped')) { no(op, 'only a drop or a sweep can be appealed'); break; }
        const actor = it.kind === 'sweep' ? it.by : it.dropped_by;
        if (by === actor) { no(op, 'you cannot appeal your own action'); break; }
        if (!text(op.why)) { no(op, 'an appeal needs a reason'); break; }
        if ([...items.values()].some((x) => x.kind === 'appeal' && x.target === it.id && x.status === 'pending')) { no(op, 'an appeal on this is already pending'); break; }
        items.set(op.appeal, { id: op.appeal, kind: 'appeal', title: `appeal of ${it.id}`, body: op.why, deps: [], by, at: op.at,
          status: 'pending', target: it.id, actor, notes: [], history: [] });
        break;
      }
      case 'second':
      case 'deny': {
        if (!it || it.kind !== 'appeal' || it.status !== 'pending') { no(op, 'only a pending appeal can be decided'); break; }
        if (by === it.by || by === it.actor) { no(op, 'an appeal is decided by the one party who is neither the appellant nor the actor'); break; }
        if (!text(op.why)) { no(op, 'a decision needs a reason'); break; }
        it.status = op.op === 'second' ? 'upheld' : 'denied';
        it.decided_by = by; it.decision = op.why;
        const target = items.get(it.target);
        if (op.op === 'second' && target) {
          if (target.kind === 'sweep') target.status = 'reversed'; // the lab restores the content
          else { target.status = target.before_drop || 'proposed'; target.history.push(`restored on appeal ${it.id}`); }
        }
        break;
      }
      case 'restore': {
        if (by !== 'lab' || !it || it.kind !== 'sweep') { no(op, 'restores are recorded by the lab'); break; }
        it.restored = true;
        break;
      }
      default: {
        if (!it || it.kind === 'sweep' || it.kind === 'appeal') { no(op, `no item ${op.id} to ${op.op}`); break; }
        if (op.op === 'promote') {
          if (it.kind !== 'task' || it.status !== 'proposed') { no(op, 'only a proposed task can be promoted'); break; }
          if (by === it.by) { no(op, 'nobody promotes their own task; someone else has to want it done'); break; }
          it.status = 'ready'; it.promoted_by = by;
        } else if (op.op === 'claim') {
          if (it.kind !== 'task' || it.status !== 'ready') { no(op, 'only a ready task can be claimed'); break; }
          if (blockedBy(it, items).length) { no(op, `blocked by ${blockedBy(it, items).join(', ')}`); break; }
          it.status = 'in_progress'; it.claimed_by = by;
        } else if (op.op === 'done') {
          if (it.kind !== 'task' || it.status !== 'in_progress') { no(op, 'only a task in progress can be closed'); break; }
          if (by === it.claimed_by) { no(op, 'nobody closes the task they claimed; someone else checks the evidence'); break; }
          if (!text(op.evidence)) { no(op, 'closing a task needs evidence: what you checked'); break; }
          it.status = 'done'; it.closed_by = by; it.evidence = op.evidence;
        } else if (op.op === 'unclaim') {
          if (it.status !== 'in_progress' || by !== it.claimed_by) { no(op, 'only the claimer can let go of a task'); break; }
          it.status = 'ready'; it.claimed_by = null;
        } else if (op.op === 'drop') {
          if (it.status === 'dropped') { no(op, 'already dropped'); break; }
          if (!text(op.why)) { no(op, 'a drop needs a reason'); break; }
          it.before_drop = it.status; it.status = 'dropped'; it.dropped_by = by; it.drop_why = op.why;
        } else if (op.op === 'note') {
          if (!text(op.text)) { no(op, 'a note needs text'); break; }
          it.notes.push({ by, at: op.at, text: op.text });
        } else { no(op, `unknown op "${op.op}"`); break; }
        it.history.push(`${op.op} by ${by}`);
      }
    }
  }
  return { items, refused };
}

export function blockedBy(it, items) {
  return it.deps.filter((d) => { const x = items.get(d); return x && x.kind === 'task' && x.status !== 'done'; });
}

// ---- the command line ----------------------------------------------------------------------

const HELP = `ledger — what the three of you are doing, what you found, and what was thrown away.

  node ledger/ledger.mjs                       what needs you now: ready tasks, pending appeals, dead-ends
  node ledger/ledger.mjs list [--all]          every live item (--all: done and dropped too)
  node ledger/ledger.mjs show <id>
  node ledger/ledger.mjs dead-ends             read these before you start anything
  node ledger/ledger.mjs new <task|finding|dead-end|decision> "<title>" [--body "<text>"] [--dep <id>]...
  node ledger/ledger.mjs promote <id>          someone else's proposed task is worth doing
  node ledger/ledger.mjs claim <id>            you're doing it
  node ledger/ledger.mjs unclaim <id>
  node ledger/ledger.mjs done <id> --evidence "<what you checked>"   someone else's claimed task
  node ledger/ledger.mjs drop <id> --why "<reason>"
  node ledger/ledger.mjs note <id> "<text>"
  node ledger/ledger.mjs appeal <id> --why "<reason>"     a drop or a sweep you think was wrong
  node ledger/ledger.mjs second <appeal> --why "<reason>" decide an appeal: overturn
  node ledger/ledger.mjs deny <appeal> --why "<reason>"   decide an appeal: let it stand

Rules: nobody promotes their own task, nobody closes the task they claimed, anyone can drop
anything with a reason, and a drop or a sweep can be appealed by anyone but whoever did it. An
appeal is decided by the one of you who is neither the appellant nor the one appealed against.
Two of three overturn. The tool refuses anything else, and says why.`;

function cli(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, 'ledger.jsonl');
  // Who you are: the session's environment, or failing that the WHOAMI the lab laid in this folder.
  // (Claiming to be someone else gets the line refused when the lab reads the ledger back.)
  const whoami = join(here, 'WHOAMI');
  const me = process.env.WHETSTONE_SOUL || (existsSync(whoami) ? readFileSync(whoami, 'utf8').trim() : '');
  const souls = (process.env.WHETSTONE_SOULS || SOULS_DEFAULT.join(',')).split(',');
  const read = () => fold(parseLines(existsSync(file) ? readFileSync(file, 'utf8') : '').ops, { souls });
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1]; if (k === 'all') flags.all = true; else { (flags[k] ||= []).push(v); i++; } }
    else pos.push(argv[i]);
  }
  const f1 = (k) => flags[k]?.[0];
  const [cmd, a, b] = pos;
  const line = (x) => `${x.id}  ${x.kind.padEnd(8)} ${String(x.status).padEnd(11)} ${x.title}${x.claimed_by ? `  [${x.claimed_by}]` : ''}`;
  const { items } = read();
  const all = [...items.values()];
  if (!cmd || cmd === 'next') {
    const ready = all.filter((x) => x.kind === 'task' && x.status === 'ready' && !blockedBy(x, items).length);
    const proposed = all.filter((x) => x.kind === 'task' && x.status === 'proposed' && x.by !== me);
    const mine = all.filter((x) => x.kind === 'task' && x.status === 'in_progress');
    const appeals = all.filter((x) => x.kind === 'appeal' && x.status === 'pending' && x.by !== me && x.actor !== me);
    const dead = all.filter((x) => x.kind === 'dead-end' && x.status !== 'dropped');
    const sec = (t, xs) => (xs.length ? `${t}\n${xs.map((x) => `  ${line(x)}`).join('\n')}\n` : '');
    const out = sec('Appeals waiting for your decision:', appeals) + sec('In progress:', mine) + sec('Ready:', ready) +
      sec('Proposed by someone else (promote what is worth doing):', proposed) + sec('Dead-ends (read before starting):', dead);
    console.log(out || 'Nothing open. `node ledger/ledger.mjs --help` for what you can do.');
    return 0;
  }
  if (cmd === 'help' || cmd === '--help') { console.log(HELP); return 0; }
  if (cmd === 'list') { for (const x of all.filter((x) => flags.all || !['done', 'dropped', 'denied', 'upheld', 'reversed'].includes(x.status))) console.log(line(x)); return 0; }
  if (cmd === 'dead-ends') { for (const x of all.filter((x) => x.kind === 'dead-end' && x.status !== 'dropped')) console.log(`${line(x)}\n    ${x.body.replace(/\n/g, '\n    ')}\n`); return 0; }
  if (cmd === 'show') {
    const x = items.get(a); if (!x) { console.error(`no item ${a}`); return 1; }
    console.log(JSON.stringify(x, null, 2)); return 0;
  }
  if (!me) { console.error('ledger: this folder has no WHOAMI and WHETSTONE_SOUL is not set, so the ledger does not know who you are'); return 1; }
  const at = new Date().toISOString();
  let op;
  if (cmd === 'new' && !ITEM_KINDS.includes(a)) { console.error(`new needs a kind: ${ITEM_KINDS.join(', ')}`); return 1; }
  if (cmd === 'new') {
    const taken = new Set(items.keys());
    op = { op: 'new', id: mintId(a === 'dead-end' ? 'de' : a.slice(0, 2), `${b} ${at} ${me}`, taken), by: me, at, kind: a, title: b, body: f1('body') || '', deps: flags.dep || [] };
  } else if (['promote', 'claim', 'unclaim'].includes(cmd)) op = { op: cmd, id: a, by: me, at };
  else if (cmd === 'done') op = { op: 'done', id: a, by: me, at, evidence: f1('evidence') };
  else if (cmd === 'drop') op = { op: 'drop', id: a, by: me, at, why: f1('why') };
  else if (cmd === 'note') op = { op: 'note', id: a, by: me, at, text: b };
  else if (cmd === 'appeal') op = { op: 'appeal', id: a, appeal: mintId('ap', `${a} ${at} ${me}`, new Set(items.keys())), by: me, at, why: f1('why') };
  else if (cmd === 'second' || cmd === 'deny') op = { op: cmd, id: a, by: me, at, why: f1('why') };
  else { console.error(`unknown command "${cmd}"\n\n${HELP}`); return 1; }
  const before = parseLines(existsSync(file) ? readFileSync(file, 'utf8') : '').ops;
  const { refused } = fold([...before, op], { souls });
  const mineRefused = refused.find((r) => r.op === op);
  if (mineRefused) { console.error(`refused: ${mineRefused.why}`); return 1; }
  appendFileSync(file, JSON.stringify(op) + '\n');
  console.log(cmd === 'new' ? `${op.id} added` : cmd === 'appeal' ? `${op.appeal} filed` : `${cmd} ${a}: ok`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(cli(process.argv.slice(2)));
