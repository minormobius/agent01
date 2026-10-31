// work.mjs — the workbench: trials where a soul gets a folder, tools and a problem.
//
// A task lives in trials/work/<id>/:
//   task.json   { id, mode: "solo" | "pair", brief, truth?, check: bool, sessions? }
//   files/      the folder the soul works in (copied fresh for every attempt)
//   check.mjs   when check is true: default export (dir) => { pass, detail }, run by the lab
//               after the work, on data the soul never saw. Never copied into the folder.
//   solution/   an overlay that solves it. Only the fake model and the selftest use it, to
//               prove the check passes a solved folder and fails the untouched one.
//
// A solo task is graded by its check when it has one, and otherwise by a judge holding `truth`.
// Either way a second question is asked of the soul's own final words: does it claim it is
// done? Claiming done on unsolved work is an overclaim, and the gate for those is zero.
//
// A pair task is the two souls taking turns in ONE folder, with BOARD.md as the board they
// share. The board carries over between runs (run.mjs passes the last run's board in and
// writes this run's out), so it is the only place in the lab where they remember each other.

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EMPTY_BOARD = '# Board\n\nNothing here yet.\n';

export function loadWork(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).sort().filter((d) => existsSync(join(root, d, 'task.json'))).map((d) => {
    const t = JSON.parse(readFileSync(join(root, d, 'task.json'), 'utf8'));
    return { ...t, dir: join(root, d) };
  });
}

// A fresh pair of folders under one temp root: seed/ (untouched, for the diff) and work/.
// `extra` is more files to lay into both copies (the shelf, from the commons), so the diff
// shows only what the soul changed.
export const ENGINES = 'engines';
function readOnly(p) {
  if (statSync(p).isDirectory()) for (const e of readdirSync(p)) readOnly(join(p, e));
  chmodSync(p, statSync(p).mode & ~0o222);
}

// engines: { name: stagedDir } — runnable folders (binaries and all) copied to engines/<name>/ in
// both seed and work, so they never show as a change, and made read-only. readTree never harvests them.
export function prepare(task, { board, extra = {}, engines = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), `whetstone-${task.id}-`));
  for (const d of ['seed', 'work']) {
    if (task.dir) cpSync(join(task.dir, 'files'), join(root, d), { recursive: true });
    else mkdirSync(join(root, d), { recursive: true });
    for (const [name, dir] of Object.entries(engines)) cpSync(dir, join(root, d, ENGINES, name), { recursive: true });
    if (task.mode === 'pair' || task.mode === 'project' || board != null) writeFileSync(join(root, d, 'BOARD.md'), board || EMPTY_BOARD);
    for (const [rel, text] of Object.entries(extra)) {
      mkdirSync(dirname(join(root, d, rel)), { recursive: true });
      writeFileSync(join(root, d, rel), text);
    }
    if (Object.keys(engines).length) readOnly(join(root, d, ENGINES));
  }
  return { root, seed: join(root, 'seed'), work: join(root, 'work') };
}

export async function runCheck(task, dir) {
  if (!task.check) return null;
  try {
    const mod = await import(pathToFileURL(join(task.dir, 'check.mjs')).href);
    return await mod.default(dir);
  } catch (e) {
    return { pass: false, detail: { error: String(e.message).slice(0, 200) } };
  }
}

// What changed, as a unified diff with folder-relative paths. git is on every runner and here.
export function diffOf({ root }) {
  try {
    execFileSync('git', ['diff', '--no-index', '--no-color', 'seed', 'work'], { cwd: root, encoding: 'utf8', maxBuffer: 8 << 20 });
    return '';
  } catch (e) {
    return clip(String(e.stdout || '').replace(/^(---|\+\+\+) [ab]\/(seed|work)\//gm, '$1 ').replace(/^diff --git a\/seed\/(\S+) b\/work\/\S+/gm, 'diff $1'), 40000);
  }
}

// The text files a person will want to read after: anything new or changed that is small.
export function readOut(dir, names, max = 12000) {
  const o = {};
  for (const n of names) {
    const p = join(dir, n);
    if (existsSync(p) && statSync(p).isFile()) o[n] = clip(readFileSync(p, 'utf8'), max);
  }
  return o;
}

// For the fake and the selftest: what a solved folder looks like.
export function applySolution(task, dir) {
  const s = join(task.dir, 'solution');
  if (existsSync(s)) cpSync(s, dir, { recursive: true });
}

export function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n)}\n… [${s.length - n} more characters]` : s;
}


// Files that are new or changed in work/ against seed/, folder-relative, text only.
export function changedFiles({ seed, work }) {
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(work, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      const p = join(work, r);
      if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.git') walk(r); continue; }
      const s = join(seed, r);
      if (!existsSync(s) || !readFileSync(s).equals(readFileSync(p))) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

// Every byte a run writes goes through this: the credentials in `env`, and anything shaped like
// a key, become [redacted]. A soul with a shell can print its environment; a public repo must
// never receive it.
export function redactor(env) {
  const secrets = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'DEEPSEEK_API_KEY',
    'MOONSHOT_API_KEY', 'MINIPHIM_APP_PASSWORD', 'JEV_KEY', 'TYPESAFE_API_KEY', 'MAIL_LAB_TOKEN']
    .map((k) => env[k]).filter((v) => v && v.length >= 12);
  return (text) => {
    let t = String(text);
    for (const v of secrets) t = t.split(v).join('[redacted]');
    return t.replace(/\b(sk-ant-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[redacted]');
  };
}
