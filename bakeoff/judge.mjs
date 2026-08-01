#!/usr/bin/env node
// judge.mjs — an anonymised panel review of bake-off entries.
//
//   node bakeoff/judge.mjs --from <collected-dir> --out <results-dir> [--models a,b]
//
// A SECOND OPINION, NOT A VERDICT. The human ranking in the arena is primary.
// This exists because six entries produce more craft detail than anyone wants
// to read, and because a disagreement between the panel and the human is
// itself informative. Its output is reported BESIDE the human's, never blended
// into it and never summed with the gate or skeleton counts.
//
// THREE THINGS THAT MAKE IT HONEST:
//
//   1. ANONYMISED. Entries are relabelled "Entry A/B/C…" and every mention of
//      the producing harness and model is stripped before a judge sees it. A
//      judge that can tell it is grading its own vendor is not a judge. The
//      mapping stays here and is only rejoined afterwards.
//   2. NO SELF-JUDGING. A model never scores an entry it produced, even
//      anonymised — the panel for each entry excludes its author.
//   3. LENSES, NOT A SCORE. Each judge gets one lens and is asked for a
//      judgement plus the evidence for it. Averaging three lenses into one
//      number would recreate exactly the false objectivity this brief exists
//      to avoid.
//
// WHAT THE PANEL CANNOT SEE: the game. Headless capture does not composite the
// WebGPU view (see capture.mjs), and these endpoints are text-only here. So
// judges read NOTES.md and the diff — they assess ambition, craft, and use of
// the topology. VISUAL quality is the human's call in the arena, and the
// report must not pretend otherwise.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cells = JSON.parse(readFileSync(join(HERE, 'cells.json'), 'utf8'));

export const LENSES = [
  {
    id: 'design',
    title: 'design ambition',
    ask: 'Is there a real idea here, or is this a checklist satisfied? Did they commit to their chosen direction or hedge between two? What is the most interesting decision they made, and what is the most timid one?',
  },
  {
    id: 'craft',
    title: 'code craft',
    ask: 'Judge the diff as a colleague reviewing a pull request. Is it coherent, or bolted on? Would you want to maintain it? Are the tradeoffs deliberate and stated, or accidental?',
  },
  {
    id: 'topology',
    title: 'use of the torus',
    ask: 'This game is set inside a torus, which has two independent ways around it and puts the whole track overhead. Did they use that, or would this design work unchanged on a flat oval?',
  },
  {
    id: 'honesty',
    title: 'honesty of the notes',
    ask: 'The author was told they cannot see the game render and must not claim they verified it. Does NOTES.md claim more than it could know? Does it state real tradeoffs, or is it marketing?',
  },
];

const PATCH_BUDGET = 60_000;

function anonymise(text, entries) {
  if (!text) return text;
  let out = text;
  // Strip anything that identifies the producing cell: model ids, vendor names,
  // harness names, and the cell slug itself.
  const needles = new Set();
  for (const e of entries) {
    needles.add(e.cell); needles.add(e.harness); needles.add(e.model);
    if (e.modelId) needles.add(e.modelId);
  }
  for (const [name, m] of Object.entries(cells.models)) {
    needles.add(name); needles.add(m.model); needles.add(m.vendor); needles.add(m.name);
  }
  for (const [name, h] of Object.entries(cells.harnesses)) { needles.add(name); needles.add(h.name); }
  needles.add('claude'); needles.add('Claude'); needles.add('Anthropic');
  needles.add('opencode'); needles.add('OpenCode');
  for (const n of [...needles].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(new RegExp(escapeRe(n), 'gi')).join('«redacted»');
  }
  return out;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPrompt(label, entry, lens, anonNotes, anonPatch) {
  return `You are reviewing one entry in a blind comparison. Several agents were given the same brief:

  "INPAC is a first-person Pac-Man played on the INSIDE of a torus. Turn it into
   a race. Make it look good. Either keep the Pac-Man DNA (maze, pellets, now on
   a clock) or clear the board for a pure tube racer — but choose, commit, and
   say which. They also had to fix a real bug: the interior gravity field
   reversed sign near the wall over most of the tube."

You are judging through ONE lens only: **${lens.title}**.

${lens.ask}

Identifying information has been redacted; do not speculate about who wrote this.
You CANNOT see the game running — nobody can, headlessly. Judge what is in front
of you and say plainly where you are inferring rather than observing.

Machine results for this entry (facts, not opinions):
  gate: ${entry.gate?.passed ? 'PASS' : 'FAIL'}${entry.gate?.passed ? '' : ` (failed: ${Object.entries(entry.gate?.checks || {}).filter(([, c]) => !c.passed).map(([k]) => k).join(', ')})`}
  race primitives: ${entry.skeleton?.passed ?? '?'}/${entry.skeleton?.of ?? 4}

--- ENTRY ${label} · NOTES.md ---
${anonNotes || '(no NOTES.md written)'}

--- ENTRY ${label} · DIFF (truncated) ---
${anonPatch || '(no diff captured)'}

Reply as JSON only, no prose outside it:
{"verdict":"<two sentences, the judgement itself>","evidence":"<the specific thing in the entry that drove it>","strongest":"<best decision they made>","weakest":"<weakest decision they made>","rank_hint":<1-10 integer, 10 = you would want to play this>}`;
}

async function askModel(modelKey, prompt) {
  const m = cells.models[modelKey];
  if (!m) return { error: `unknown model ${modelKey}` };
  const key = process.env[m.keyEnv];
  if (!key) return { skipped: `${m.keyEnv} not set` };

  const base = m.anthropicBase.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: m.model, max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return { error: `upstream ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'no JSON in reply', raw: text.slice(0, 400) };
    try { return { ok: JSON.parse(match[0]) }; }
    catch (e) { return { error: `bad JSON: ${e.message}`, raw: match[0].slice(0, 400) }; }
  } catch (e) {
    return { error: String(e.message || e).slice(0, 200) };
  }
}

export async function judgeAll({ from, out, models }) {
  const dir = resolve(from);
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    const d = join(dir, name);
    if (!statSync(d).isDirectory()) continue;
    const meta = join(d, 'cell.json');
    if (!existsSync(meta)) continue;
    let rec; try { rec = JSON.parse(readFileSync(meta, 'utf8')); } catch { continue; }
    if (rec.status !== 'ran') continue;
    rec.dir = d;
    rec.notes = existsSync(join(d, 'entry', 'NOTES.md')) ? readFileSync(join(d, 'entry', 'NOTES.md'), 'utf8') : null;
    rec.patch = existsSync(join(d, 'entry.patch')) ? readFileSync(join(d, 'entry.patch'), 'utf8').slice(0, PATCH_BUDGET) : null;
    entries.push(rec);
  }
  if (!entries.length) { console.error(`judge: no ran cells under ${dir}`); return null; }

  // Only entries that cleared the gate are worth a panel's time — and a judge
  // told "this one does not run" would grade the failure, not the design.
  const eligible = entries.filter((e) => e.gate?.passed);
  const labels = new Map();
  eligible.forEach((e, i) => labels.set(e.cell, String.fromCharCode(65 + i)));

  const panel = (models && models.length) ? models : Object.keys(cells.models);
  const reviews = [];

  for (const e of eligible) {
    const label = labels.get(e.cell);
    const anonNotes = anonymise(e.notes, entries);
    const anonPatch = anonymise(e.patch, entries);
    for (const lens of LENSES) {
      // Round-robin the lens across the panel, skipping the entry's own author.
      const candidates = panel.filter((p) => p !== e.model);
      if (!candidates.length) continue;
      const judgeModel = candidates[(LENSES.indexOf(lens) + eligible.indexOf(e)) % candidates.length];
      const prompt = buildPrompt(label, e, lens, anonNotes, anonPatch);
      const res = await askModel(judgeModel, prompt);
      reviews.push({
        cell: e.cell, label, lens: lens.id, lensTitle: lens.title,
        judge: judgeModel, ...res,
      });
      console.log(`  ${label} · ${lens.id.padEnd(9)} judged by ${judgeModel.padEnd(10)} ${res.ok ? `→ ${res.ok.rank_hint}/10` : `(${res.skipped || res.error})`}`);
    }
  }

  const payload = {
    labels: Object.fromEntries([...labels].map(([cell, l]) => [l, cell])),
    excluded: entries.filter((e) => !e.gate?.passed).map((e) => ({ cell: e.cell, reason: 'did not clear the gate' })),
    lenses: LENSES.map((l) => ({ id: l.id, title: l.title })),
    reviews,
  };
  if (out) {
    mkdirSync(resolve(out), { recursive: true });
    writeFileSync(join(resolve(out), 'judges.json'), JSON.stringify(payload, null, 2) + '\n');
    console.log(`\nwrote ${join(resolve(out), 'judges.json')}`);
  }
  return payload;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const from = val('--from');
  if (!from) { console.error('usage: judge.mjs --from <collected-dir> [--out <dir>] [--models a,b]'); process.exit(2); }
  await judgeAll({ from, out: val('--out'), models: val('--models')?.split(',').filter(Boolean) });
}
