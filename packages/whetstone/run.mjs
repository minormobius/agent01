#!/usr/bin/env node
// run.mjs — put souls on the whetstone.
//
//   node run.mjs                                   # both souls, every trial, claude-opus-5-5
//   node run.mjs --souls modulo,morphyx --reps 3   # explicit
//   node run.mjs --kinds solo,dyad                 # a subset of trial kinds
//   node run.mjs --request requests/2026-10-01-first.json   # params from a request file
//   node run.mjs --fake                            # wiring check, no model, no cost
//
// Writes runs/<stamp>-<label>/ : transcript.jsonl (every soul utterance), judged.jsonl (every
// judge verdict, raw and parsed), scorecard.json, scorecard.md. Exit 0 if every gate passes,
// 3 if any fails, 1 on error. A failing gate is a result, not an error.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, cpSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliModel, fakeModel, DEFAULT_MODEL } from './lib/model.mjs';
import { runLab, loadSoul, applyGates, KINDS } from './lib/lab.mjs';
import { scorecardMarkdown } from './lib/report.mjs';
import { fakeResponder } from './lib/fake.mjs';
import { loadWork, redactor } from './lib/work.mjs';
import { loadCommons, writeTree } from './lib/commons.mjs';
import { fold, parseLines } from './lib/ledger.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

// A request's `refs` ("tape,packages/cad/SKILL.md"): repo files or folders lent to the souls
// read-only under refs/. Text only, under 1 MB in all, so a stray binary or build folder can't swamp a turn.
// A request's `engines` ("cad,dataviz"): names from engines.json. Each is copied once to a staging
// folder (minus its `exclude`) and proved by its health command there, before any model is
// called: an engine that can't run here fails the run now, not three sessions in.
function stageEngines(list) {
  if (!list) return null;
  const reg = JSON.parse(readFileSync(join(HERE, 'engines.json'), 'utf8'));
  const stage = mkdtempSync(join(tmpdir(), 'whetstone-engines-'));
  const out = {};
  for (const name of String(list).split(',').map((x) => x.trim()).filter(Boolean)) {
    const e = reg[name];
    if (!e || name.startsWith('_')) throw new Error(`engines: ${name} is not in engines.json`);
    const src = resolve(ROOT, e.path), dir = join(stage, name), skip = new Set(e.exclude || []);
    cpSync(src, dir, { recursive: true, filter: (p) => !skip.has(relative(src, p).split(sep)[0]) });
    try {
      execFileSync(e.health[0], e.health.slice(1), { cwd: dir, stdio: 'pipe', timeout: 300_000 });
    } catch (err) {
      throw new Error(`engines: ${name} failed its health check (${e.health.join(' ')}): ${String(err.stderr || err.message).slice(0, 400)}`);
    }
    out[name] = { dir, what: e.what, guide: e.guide };
    console.error(`· engine ${name}: staged from ${e.path}, health ok`);
  }
  return out;
}

function readRefs(list) {
  if (!list) return null;
  const out = {}; let total = 0;
  const add = (rel) => {
    const abs = resolve(ROOT, rel);
    if (!abs.startsWith(ROOT + '/') || !existsSync(abs)) throw new Error(`refs: no such path in the repo: ${rel}`);
    if (statSync(abs).isDirectory()) {
      for (const e of readdirSync(abs)) if (!e.startsWith('.') && e !== 'node_modules') add(join(rel, e));
      return;
    }
    const buf = readFileSync(abs);
    if (buf.includes(0)) return;
    total += buf.length;
    if (total > 1 << 20) throw new Error(`refs: over 1 MB at ${rel}; name narrower paths`);
    out[rel] = buf.toString('utf8');
  };
  for (const r of String(list).split(',').map((x) => x.trim()).filter(Boolean)) add(r);
  return out;
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; }
  }
  return o;
}

const cli = args(process.argv.slice(2));
const req = cli.request ? JSON.parse(readFileSync(resolve(HERE, cli.request), 'utf8')) : {};
const opt = { ...req, ...cli };

const soulKeys = String(opt.souls || 'modulo,morphyx').split(',').map((s) => s.trim());
for (const k of soulKeys) if (!/^[a-z0-9-]+$/.test(k)) throw new Error(`soul key must name a file in souls/: ${k}`);
const souls = soulKeys.map((k) => loadSoul(join(HERE, 'souls', `${k}.md`)));
// The custodian (Mozzie) keeps the commons: a morning sweep, the ledger, the appeals. It is not
// put through the trials above until it has its own (souls/ holds its draft core).
const custodianKey = opt.custodian && opt.custodian !== true ? String(opt.custodian) : null;
if (custodianKey && !/^[a-z0-9-]+$/.test(custodianKey)) throw new Error(`custodian must name a file in souls/: ${custodianKey}`);
const custodian = custodianKey ? loadSoul(join(HERE, 'souls', `${custodianKey}.md`)) : null;
const bank = JSON.parse(readFileSync(join(HERE, 'trials', 'bank.json'), 'utf8'));
const gates = JSON.parse(readFileSync(join(HERE, 'gates.json'), 'utf8'));
const kinds = opt.kinds ? String(opt.kinds).split(',') : KINDS;
const model = opt.model || DEFAULT_MODEL;
const judgeModel = opt['judge-model'] || model;

const work = loadWork(join(HERE, 'trials', 'work'));

// What carries between runs. The commons (board, shelf, journals: lib/commons.mjs) comes from the
// newest earlier run that left one. Runs from before the commons left only board.md; the newest
// of those seeds the board if no commons exists yet.
const runsDir = join(HERE, 'runs');
const earlier = existsSync(runsDir) ? readdirSync(runsDir).sort().reverse() : [];
const commonsFrom = earlier.find((d) => existsSync(join(runsDir, d, 'commons')));
const commons = commonsFrom ? loadCommons(join(runsDir, commonsFrom, 'commons')) : null;
const boardFrom = commonsFrom || earlier.find((d) => existsSync(join(runsDir, d, 'board.md')));
const board = !commons && boardFrom ? readFileSync(join(runsDir, boardFrom, 'board.md'), 'utf8') : null;

// Runs are committed to a public repo, and a soul with a shell can print its environment, so
// every byte written goes through the redactor first (lib/work.mjs).
const redact = redactor(process.env);
const save = (path, text) => writeFileSync(path, redact(text));

const fake = opt.fake === true || opt.fake === 'true';
// A work session's time limit (minutes). Eighth light: two rota turns ran mutation suites past 15.
const workTimeoutMs = Math.round(Number(opt.work_timeout_min || 20) * 60_000);
const call = fake ? fakeModel(fakeResponder()) : cliModel({ model, effort: opt.effort, workTimeoutMs });
const judge = fake ? call : cliModel({ model: judgeModel, effort: opt.effort });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const label = String(opt.label || (fake ? 'fake' : souls.map((s) => `${s.key}@${s.hash.slice(0, 6)}`).join('+')))
  .replace(/[^A-Za-z0-9@+._-]/g, '-').slice(0, 80); // it becomes a directory name
const out = resolve(HERE, opt.out || join('runs', `${stamp}-${label}`));

try {
  const t0 = Date.now();
  const { records, judged, scorecard, commons: after } = await runLab({
    souls, bank, call, judge, kinds,
    reps: Number(opt.reps || 3), seed: Number(opt.seed || 1), concurrency: Number(opt.concurrency || 4),
    work, board, commons, custodian, notice: opt.notice || null, refs: readRefs(opt.refs), engines: stageEngines(opt.engines),
    log: (m) => console.error(`· ${m}`),
  });
  scorecard.run.model = fake ? 'fake' : model;
  scorecard.run.judge_model = fake ? 'fake' : judgeModel;
  scorecard.run.seconds = Math.round((Date.now() - t0) / 1000);
  scorecard.run.label = label;
  scorecard.run.at = new Date().toISOString();
  scorecard.run.board_from = boardFrom;
  scorecard.gates = applyGates(scorecard, gates);

  mkdirSync(out, { recursive: true });
  save(join(out, 'transcript.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  save(join(out, 'judged.jsonl'), judged.map(({ prompt, ...j }) => JSON.stringify(j)).join('\n') + '\n');
  // What the run was asked to do, as run: the chronicle reads the notice and the why from here.
  const { request: _r, fake: _f, out: _o, ...asked } = opt;
  save(join(out, 'request.json'), JSON.stringify(asked, null, 2) + '\n');
  save(join(out, 'scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n');
  const md = scorecardMarkdown(scorecard, records);
  save(join(out, 'scorecard.md'), md);
  // The commons as this run left it: the next run starts here.
  if (records.some((r) => ['pairwork', 'evening', 'sweep', 'project', 'council'].includes(r.kind))) {
    writeTree(join(out, 'commons'), Object.fromEntries(Object.entries(after).map(([k, v]) => [k, redact(v)])));
    save(join(out, 'board.md'), after['BOARD.md']);
    save(join(out, 'commons.json'), JSON.stringify(after)); // one fetch for the run reader
    if (after['ledger/ledger.jsonl']) {
      const keys = [...souls, ...(custodian ? [custodian] : [])].map((x) => x.key);
      save(join(out, 'ledger.json'), JSON.stringify([...fold(parseLines(after['ledger/ledger.jsonl']).ops, { souls: keys }).items.values()]));
    }
  }
  if (!existsSync(join(out, 'souls'))) mkdirSync(join(out, 'souls'));
  for (const s of custodian ? [...souls, custodian] : souls) writeFileSync(join(out, 'souls', `${s.key}.md`), s.text); // what was tested, exactly

  console.log(redact(md));
  console.error(`· wrote ${out}`);
  const failed = scorecard.gates.filter((g) => g.pass === false).length;
  process.exit(failed ? 3 : 0);
} catch (e) {
  console.error(`whetstone: ${e.stack || e.message}`);
  process.exit(1);
}
