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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliModel, fakeModel, DEFAULT_MODEL } from './lib/model.mjs';
import { runLab, loadSoul, applyGates, KINDS } from './lib/lab.mjs';
import { scorecardMarkdown } from './lib/report.mjs';
import { fakeResponder } from './lib/fake.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

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
const bank = JSON.parse(readFileSync(join(HERE, 'trials', 'bank.json'), 'utf8'));
const gates = JSON.parse(readFileSync(join(HERE, 'gates.json'), 'utf8'));
const kinds = opt.kinds ? String(opt.kinds).split(',') : KINDS;
const model = opt.model || DEFAULT_MODEL;
const judgeModel = opt['judge-model'] || model;

const fake = opt.fake === true || opt.fake === 'true';
const call = fake ? fakeModel(fakeResponder()) : cliModel({ model, effort: opt.effort });
const judge = fake ? call : cliModel({ model: judgeModel, effort: opt.effort });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const label = String(opt.label || (fake ? 'fake' : souls.map((s) => `${s.key}@${s.hash.slice(0, 6)}`).join('+')))
  .replace(/[^A-Za-z0-9@+._-]/g, '-').slice(0, 80); // it becomes a directory name
const out = resolve(HERE, opt.out || join('runs', `${stamp}-${label}`));

try {
  const t0 = Date.now();
  const { records, judged, scorecard } = await runLab({
    souls, bank, call, judge, kinds,
    reps: Number(opt.reps || 3), seed: Number(opt.seed || 1), concurrency: Number(opt.concurrency || 4),
    log: (m) => console.error(`· ${m}`),
  });
  scorecard.run.model = fake ? 'fake' : model;
  scorecard.run.judge_model = fake ? 'fake' : judgeModel;
  scorecard.run.seconds = Math.round((Date.now() - t0) / 1000);
  scorecard.run.label = label;
  scorecard.run.at = new Date().toISOString();
  scorecard.gates = applyGates(scorecard, gates);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'transcript.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(out, 'judged.jsonl'), judged.map(({ prompt, ...j }) => JSON.stringify(j)).join('\n') + '\n');
  writeFileSync(join(out, 'scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n');
  const md = scorecardMarkdown(scorecard, records);
  writeFileSync(join(out, 'scorecard.md'), md);
  if (!existsSync(join(out, 'souls'))) mkdirSync(join(out, 'souls'));
  for (const s of souls) writeFileSync(join(out, 'souls', `${s.key}.md`), s.text); // what was tested, exactly

  console.log(md);
  console.error(`· wrote ${out}`);
  const failed = scorecard.gates.filter((g) => g.pass === false).length;
  process.exit(failed ? 3 : 0);
} catch (e) {
  console.error(`whetstone: ${e.stack || e.message}`);
  process.exit(1);
}
