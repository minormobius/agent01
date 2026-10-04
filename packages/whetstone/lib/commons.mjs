// commons.mjs — what the two souls keep between runs.
//
// Everything else in the lab starts from nothing. The commons is the exception, and it is the
// part that compounds:
//
//   BOARD.md            the board they share. Written in pair work and in the evening.
//   shelf/              tools either of them made and chose to keep, with SHELF.md as the index.
//                       Mounted read-only in solo work, writable in pair work and the evening.
//   journal/<soul>.md   each one's own notebook. Mounted only for its owner, only in the evening.
//
// In memory the commons is a flat map { 'relative/path': text }. run.mjs loads the last run's
// copy from runs/<run>/commons/ and writes this run's back, so it threads run to run the same
// way the board did. Everything in it is committed to a public repo: the journals are private
// from the other soul, not from people.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EMPTY_BOARD, ENGINES } from './work.mjs';

export const SHELF_INDEX = 'shelf/SHELF.md';
const EMPTY_SHELF = '# Shelf\n\nTools either of you made and wanted to keep. One line each: the file, what it does, who made it.\n';
const FILE_MAX = 100_000; // per file; a bigger file is left out of the commons, and says so

export function newCommons(souls, board = null) {
  const c = { 'BOARD.md': board || EMPTY_BOARD, [SHELF_INDEX]: EMPTY_SHELF };
  for (const s of souls) c[`journal/${s.key}.md`] = `# ${s.name}'s journal\n`;
  return c;
}

// Fill in anything a commons from an older run lacks (a soul added, a shelf never started).
export function completeCommons(c, souls) {
  const base = newCommons(souls);
  for (const [k, v] of Object.entries(base)) if (!(k in c)) c[k] = v;
  return c;
}

export function readTree(root, prefix = '') {
  const out = {};
  const base = join(root, prefix);
  if (!existsSync(base)) return out;
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel))) {
      if (name === 'node_modules' || name === '.git' || (!rel && name === ENGINES)) continue; // engines are lent, never kept
      const r = rel ? `${rel}/${name}` : name;
      const p = join(root, r);
      if (statSync(p).isDirectory()) { walk(r); continue; }
      const buf = readFileSync(p);
      if (buf.includes(0)) continue; // binary: not commons material
      out[r] = buf.length > FILE_MAX ? `[left out of the commons: ${buf.length} bytes, over ${FILE_MAX}]\n` : buf.toString('utf8');
    }
  };
  walk(prefix.replace(/\/$/, ''));
  return out;
}

export function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

export const loadCommons = (dir) => (existsSync(dir) ? readTree(dir) : null);

export const pick = (c, test) => Object.fromEntries(Object.entries(c).filter(([k]) => test(k)));
export const shelfOf = (c) => pick(c, (k) => k.startsWith('shelf/'));

// Replace one part of the commons (everything under `prefix`, or one file) with what a folder
// now holds. A file they deleted is gone from the commons too.
export function harvest(c, dir, prefix) {
  if (prefix.endsWith('/')) {
    for (const k of Object.keys(c)) if (k.startsWith(prefix)) delete c[k];
    Object.assign(c, readTree(dir, prefix));
  } else if (existsSync(join(dir, prefix))) {
    c[prefix] = readFileSync(join(dir, prefix), 'utf8');
  }
  return c;
}

// The shelf has something on it beyond its own index.
export const shelfStocked = (c) => Object.keys(shelfOf(c)).some((k) => k !== SHELF_INDEX);

// Did a session use the shelf? Running or reading a tool on it counts; reading only the index,
// or writing to it, does not. (A tool imported by code they wrote is not seen here.)
export function usedShelf(trace = []) {
  return trace.some((t) => (t.tool === 'Bash' && /(^|[\s/'"])shelf\//.test(t.input) && !/^\s*(ls|cat\s+shelf\/SHELF\.md)\b/.test(t.input))
    || (t.tool === 'Read' && /^shelf\//.test(t.input) && t.input !== SHELF_INDEX));
}

// ---- the ledger and the custodian ----------------------------------------------------------
// The ledger (lib/ledger.mjs) lives in the commons as ledger/ledger.jsonl. Every folder that
// mounts it also gets the tool, ledger/ledger.mjs, laid in fresh each time (so nobody can edit
// the rules). What comes back is checked here, the way the loop's outbox is checked: only lines
// appended (old lines untouched, or the whole session's ledger writes are refused), each written
// as the soul whose session it was, each one the fold accepts.

export const LEDGER = 'ledger/ledger.jsonl';
const LEDGER_TOOL = readFileSync(new URL('./ledger.mjs', import.meta.url), 'utf8');

export const ledgerFiles = (c, key) => ({ 'ledger/ledger.mjs': LEDGER_TOOL, 'ledger/WHOAMI': `${key}\n`, [LEDGER]: c[LEDGER] || '' });

export function harvestLedger(c, dir, soulKey, souls, { parseLines, fold }) {
  const before = c[LEDGER] || '';
  const p = join(dir, LEDGER);
  const now = existsSync(p) ? readFileSync(p, 'utf8') : before;
  if (now === before) return { accepted: [], rejected: [] };
  if (!now.startsWith(before)) return { accepted: [], rejected: [{ why: 'the ledger was edited, not appended to: every change in this session was refused' }] };
  const fresh = parseLines(now.slice(before.length));
  const accepted = [], rejected = fresh.bad.map((b) => ({ why: b.why }));
  let ops = parseLines(before).ops;
  for (const op of fresh.ops) {
    if (op.by !== soulKey) { rejected.push({ op, why: `written as "${op.by}" in ${soulKey}'s session` }); continue; }
    if (op.op === 'sweep' || op.op === 'restore') { rejected.push({ op, why: 'only the lab records sweeps and restores' }); continue; }
    const { refused } = fold([...ops, op], { souls });
    const r = refused.find((x) => x.op === op);
    if (r) { rejected.push({ op, why: r.why }); continue; }
    ops.push(op); accepted.push(op);
  }
  if (accepted.length) c[LEDGER] = before + accepted.map((o) => JSON.stringify(o) + '\n').join('');
  return { accepted, rejected };
}

export function appendLab(c, op) { c[LEDGER] = (c[LEDGER] || '') + JSON.stringify({ ...op, by: 'lab', at: op.at || new Date().toISOString() }) + '\n'; }

// Lines of `before` that are gone from `after`, as a multiset (a line kept once of twice counts once).
export function removedLines(before, after) {
  const left = new Map();
  for (const l of String(after).split('\n')) left.set(l, (left.get(l) || 0) + 1);
  const out = [];
  for (const l of String(before).split('\n')) {
    if (left.get(l)) left.set(l, left.get(l) - 1);
    else out.push(l);
  }
  return out;
}

// Whose words were these? Count signatures and turn headings that name each soul.
export function authorsOf(text, names) {
  const out = {};
  for (const [key, name] of Object.entries(names)) {
    const n = (String(text).match(new RegExp(`(—\\s*${name}\\b|\\b${name}\\s*\\(|Turn \\d+ — ${name}\\b|— ${key}\\b)`, 'g')) || []).length;
    if (n) out[key] = n;
  }
  return out;
}

// Restore every sweep an upheld appeal reversed and the lab hasn't restored yet. The archive
// holds exactly what the sweep took: the board lines go back on the board, under a heading that
// says why; shelf files come back unless something has since taken their place.
export function applyRestores(c, items) {
  const done = [];
  for (const it of items.values()) {
    if (it.kind !== 'sweep' || it.status !== 'reversed' || it.restored) continue;
    let a = null;
    try { a = JSON.parse(c[`archive/${it.id}.json`] || 'null'); } catch { /* nothing to restore */ }
    if (a?.board?.trim()) c['BOARD.md'] = `${c['BOARD.md'].trimEnd()}\n\n## Restored on appeal (${it.id})\n\n${a.board.trim()}\n`;
    for (const [k, v] of Object.entries(a?.shelf || {})) if (!(k in c)) c[k] = v;
    appendLab(c, { op: 'restore', id: it.id });
    done.push(it.id);
  }
  return done;
}
