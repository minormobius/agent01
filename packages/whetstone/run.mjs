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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliModel, fakeModel, compatModel, DEFAULT_MODEL } from './lib/model.mjs';
import { runLab, loadSoul, applyGates, DEFAULT_KINDS } from './lib/lab.mjs';
import { scorecardMarkdown } from './lib/report.mjs';
import { startModelsProxy } from './lib/models-proxy.mjs';
import { townBefore, townReadme, townAfter, HASH_TOOL } from './lib/town-run.mjs';
import { LETTERS_FROM } from './lib/carries.mjs';
import { fakeResponder } from './lib/fake.mjs';
import { loadWork, redactor } from './lib/work.mjs';
import { loadCommons, writeTree, readTree } from './lib/commons.mjs';
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

// A whole ATProto repo, lent for one run (a request's `lend_repo`: a handle or DID). Fetched fresh
// from its PDS as a CAR (com.atproto.sync.getRepo), decoded with packages/atproto/car.js into posts
// by month plus a summary, and mounted read-only like an engine (engines/<name>/), so it is never
// harvested and never committed: a post its author deletes is gone from the next lending.
async function stageRepo(who) {
  const { readCar } = await import('../atproto/car.js');
  const handle = String(who).trim();
  const did = handle.startsWith('did:') ? handle : (await (await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)).json()).did;
  if (!did) throw new Error(`lend_repo: cannot resolve ${handle}`);
  const doc = await (await fetch(`https://plc.directory/${did}`)).json();
  const pds = (doc.service || []).find((x) => x.id === '#atproto_pds')?.serviceEndpoint;
  if (!pds) throw new Error(`lend_repo: no PDS for ${did}`);
  const res = await fetch(`${pds}/xrpc/com.atproto.sync.getRepo?did=${did}`);
  if (!res.ok) throw new Error(`lend_repo: getRepo answered ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { posts, collections } = readCar(bytes);
  const name = (doc.alsoKnownAs?.[0] || did).replace('at://', '').split('.')[0].replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'repo';
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-lend-')), name);
  mkdirSync(join(dir, 'posts'), { recursive: true });
  const byMonth = {};
  for (const p of posts.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const m = String(p.createdAt || 'unknown').slice(0, 7);
    (byMonth[m] ||= []).push(JSON.stringify({ ...p, url: `https://bsky.app/profile/${did}/post/${p.rkey}` }));
  }
  for (const [m, lines] of Object.entries(byMonth)) writeFileSync(join(dir, 'posts', `${m}.jsonl`), lines.join('\n') + '\n');
  const at = new Date().toISOString();
  const perMonth = Object.fromEntries(Object.entries(byMonth).map(([m, l]) => [m, l.length]));
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ handle: doc.alsoKnownAs?.[0] || null, did, pds, fetched_at: at, car_bytes: bytes.length, posts: posts.length, collections: Object.fromEntries([...(collections instanceof Map ? collections : Object.entries(collections || {}))].sort((a, b) => b[1] - a[1])), posts_per_month: perMonth }, null, 1) + '\n');
  writeFileSync(join(dir, 'README.md'), `# ${doc.alsoKnownAs?.[0]?.replace('at://', '@') || did}: the whole repo, lent\n\n` +
    `Fetched ${at} from ${pds} as one CAR file (${(bytes.length / 1e6).toFixed(1)} MB, com.atproto.sync.getRepo): every record this account has, signed. ` +
    `Lent for this run only, read-only: it is not kept, and it is fetched fresh each time it's lent, so anything the account deletes is gone from the next lending.\n\n` +
    `- \`posts/YYYY-MM.jsonl\`: all ${posts.length} posts, one JSON object a line: rkey, text, createdAt, lang, isReply, replyTo (the DID replied to), embed (its kind), counts of links, mentions and tags, and url.\n` +
    `- \`summary.json\`: every collection in the repo with its record count (likes, reposts, follows, blocks, lists, and records from other apps), and posts per month. Only posts are decoded; the rest are counts.\n\n` +
    `Searching it: \`grep -h -i "word" posts/*.jsonl | head\`, or node over the files. ${Object.keys(byMonth).length} months, ${Object.keys(byMonth)[0]} to ${Object.keys(byMonth).at(-1)}.\n`);
  console.error(`· lent repo ${name}: ${posts.length} posts, ${(bytes.length / 1e6).toFixed(1)} MB CAR from ${pds}`);
  return { [name]: { dir, what: `the whole repo of ${doc.alsoKnownAs?.[0]?.replace('at://', '@') || did}, lent for this run: ${posts.length} posts by month, and counts of everything else`, guide: 'README.md' } };
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
const kinds = opt.kinds ? String(opt.kinds).split(',') : DEFAULT_KINDS;
const model = opt.model || DEFAULT_MODEL;
// A soul worn by another model (`provider`: deepseek, moonshot) is still judged by Claude, so
// the grid's columns differ only in the wearer, never in the judge.
const provider = opt.provider || null;
const judgeModel = opt['judge-model'] || (provider ? DEFAULT_MODEL : model);

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
if (provider && kinds.some((k) => !['solo', 'taste', 'pressure', 'silence', 'injection', 'dyad'].includes(k))) {
  console.error(`provider ${provider} runs text trials only (solo, taste, pressure, silence, injection, dyad); asked for ${kinds.join(',')}`);
  process.exit(2);
}
const call = fake ? fakeModel(fakeResponder()) : provider ? compatModel({ provider, model }) : cliModel({ model, effort: opt.effort, workTimeoutMs });
const judge = fake ? call : cliModel({ model: judgeModel, effort: opt.effort });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const label = String(opt.label || (fake ? 'fake' : souls.map((s) => `${s.key}@${s.hash.slice(0, 6)}`).join('+')))
  .replace(/[^A-Za-z0-9@+._-]/g, '-').slice(0, 80); // it becomes a directory name
const out = resolve(HERE, opt.out || join('runs', `${stamp}-${label}`));

// Other models, lent through a proxy that holds their keys (`models`: "deepseek-v4-flash,…",
// `model_calls`: the run's budget). Sessions find it at MINIPHIM_MODELS_URL.
const proxy = opt.models && !fake ? await startModelsProxy({ models: String(opt.models).split(',').map((x) => x.trim()).filter(Boolean), calls: Number(opt.model_calls || 200) }) : null;
if (proxy) console.error(`· models lent: ${opt.models} (budget ${opt.model_calls || 200} calls) at ${proxy.url}`);

// A town day: read the town through the account's door before the sessions (the password stays in
// this process; sessions never carry it), publish after (packages/miniphim-account/town.mjs).
const townDay = kinds.includes('town');
const tb = townDay && !fake ? await townBefore({ password: process.env.MINIPHIM_APP_PASSWORD }) : { town: null, error: fake ? 'a fake run reads no town' : null };
if (townDay) console.error(`· town: ${tb.town ? `${tb.town.inbox.length} addressed, ${tb.town.feed.posts.length} feed posts, ${tb.town.errors.length} read errors` : `not read (${tb.error})`}`);

// The person's letters (packages/whetstone/letters/<name>.md, written by them in the repo): lent to the
// commons verbatim as letters/from-the-person/<name>.md every run (lib/carries.mjs). README.md is the
// how-to, not a letter.
function readLetters() {
  const dir = join(HERE, 'letters');
  if (!existsSync(dir)) return null;
  // Any text file at the top level is a letter, whatever its name (the first one had no extension,
  // and a .md-only filter would have skipped it silently). readTree already drops binaries.
  return Object.fromEntries(Object.entries(readTree(dir)).filter(([k]) => !k.includes('/') && k !== 'README.md' && !k.startsWith('.')));
}

// Their side of the letter file, copied next to the person's letters after every run
// (letters/from-the-miniphim/), so the person finds the replies where they wrote, not inside a run's
// archive. A subfolder, so readLetters never mistakes a reply for a letter.
function replyLetters(commons) {
  const dir = join(HERE, 'letters', 'from-the-miniphim');
  const mine = Object.entries(commons).filter(([k]) => k.startsWith('letters/') && !k.startsWith(LETTERS_FROM));
  if (!mine.length) return 0;
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of mine) { const p = join(dir, k.slice('letters/'.length)); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, redact(v)); }
  return mine.length;
}

// Tools the souls list in shelf/PUBLISH.md go to packages/miniphim-tools/ for other agents.
function publishTools(commons) {
  const list = (commons['shelf/PUBLISH.md'] || '').split('\n').map((l) => l.match(/^\s*-\s*(shelf\/[\w.\/-]+)\s*:\s*(.+)$/)).filter(Boolean);
  if (!list.length) return [];
  const dir = join(ROOT, 'packages', 'miniphim-tools');
  mkdirSync(dir, { recursive: true });
  const done = [];
  for (const [, path, what] of list) {
    if (!(path in commons) || path.includes('..')) continue;
    const name = path.slice('shelf/'.length);
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), redact(commons[path]));
    done.push({ name, what: what.trim() });
  }
  writeFileSync(join(dir, 'README.md'), redact(`# miniphim-tools\n\nTools Modulo, Morphyx and Mozzie made on their shelf and chose to publish for other agents, listed by them in shelf/PUBLISH.md and copied here by the lab after each run (packages/whetstone/run.mjs). Each is meant to meet the engine contract (packages/whetstone/ENGINES.md): node only, runs from a copy, a guide, a selftest. Last published ${new Date().toISOString().slice(0, 10)}.\n\n| Tool | What it does |\n|---|---|\n${done.map((d) => `| [\`${d.name}\`](${d.name}) | ${d.what.replace(/\|/g, '\\|')} |`).join('\n')}\n`));
  return done;
}

try {
  const t0 = Date.now();
  // The town's publish runs inside the lab, between the town sessions and the evening.
  const afterTown = townDay ? (C) => (fake ? { published: [], held: [], failed: [] } : townAfter(C, { town: tb.town, password: process.env.MINIPHIM_APP_PASSWORD })) : null;
  const { records, judged, scorecard, commons: after, townResult } = await runLab({
    souls, bank, call, judge, kinds,
    reps: Number(opt.reps || 3), seed: Number(opt.seed || 1), concurrency: Number(opt.concurrency || 4),
    work, board, commons, custodian, notice: opt.notice || null, refs: readRefs(opt.refs), engines: { ...(stageEngines(opt.engines) || {}), ...(opt.lend_repo ? await stageRepo(opt.lend_repo) : {}) }, councilQuestion: opt.council_question || null, net: opt.net === true || opt.net === 'true', sessionEnv: proxy ? { MINIPHIM_MODELS_URL: proxy.url } : {}, town: tb.town, townReadme: townDay ? townReadme(tb) : '', townFiles: townDay ? { 'town/hash.mjs': HASH_TOOL } : {}, letters: readLetters(), afterTown,
    log: (m) => console.error(`· ${m}`),
  });
  scorecard.run.model = fake ? 'fake' : model;
  scorecard.run.judge_model = fake ? 'fake' : judgeModel;
  if (provider) scorecard.run.provider = provider;
  if (proxy) {
    const used = {};
    for (const c of proxy.log) { const u = (used[`${c.who} ${c.model}`] ??= { who: c.who, model: c.model, calls: 0, failed: 0, tokens_in: 0, tokens_out: 0, cost: 0 });
      u.calls++; if (!c.ok) u.failed++; u.tokens_in += c.tokens?.in || 0; u.tokens_out += c.tokens?.out || 0; u.cost += c.cost || 0; }
    scorecard.run.models_used = Object.values(used);
    scorecard.run.cost_usd = Math.round(((scorecard.run.cost_usd || 0) + proxy.log.reduce((a, c) => a + (c.cost || 0), 0)) * 1e4) / 1e4;
    await proxy.close();
  }
  if (opt.net === true || opt.net === 'true') scorecard.run.net = true;
  if (townDay) {
    const res = townResult || { published: [], held: [], failed: [] };
    scorecard.run.town = { read: tb.town ? { addressed: tb.town.inbox.length, other: tb.town.other.length, feed: tb.town.feed.posts.length, errors: tb.town.errors } : { error: tb.error },
      published: res.published.map((d) => ({ kind: d.kind, uri: d.uri || d.target, writer: d.writer, approved_by: d.approved_by || null })),
      held: res.held, failed: res.failed };
    console.error(`· town: published ${res.published.length}, held ${res.held.length}, failed ${res.failed.length}`);
  }
  if (!fake) { const n = replyLetters(after); if (n) console.error(`· letters: ${n} file(s) of theirs copied to letters/from-the-miniphim/`); }
  if (!fake) { const tools = publishTools(after); if (tools.length) { scorecard.run.tools_published = tools.map((t) => t.name); console.error(`· tools published: ${tools.map((t) => t.name).join(', ')}`); } }
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
  if (records.some((r) => ['pairwork', 'evening', 'sweep', 'project', 'council', 'town'].includes(r.kind))) {
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
