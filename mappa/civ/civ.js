#!/usr/bin/env node
// mappa/civ/civ.js — the headless CLI (M13), the PRIMARY interface.
//
//   node civ.js run    --world-fixture worlds/seed7.json --config configs/kurgan.json \
//                      --civ-seed 1 --ticks 4000 --out out/chronicle.json --score
//   node civ.js sweep  --world-fixture worlds/seed7.json --budget 500 --method qd \
//                      --ticks 3000 --out out/archive.json
//   node civ.js verify --world-fixture worlds/seed7.json --config configs/kurgan.json --ticks 2000
//
// World sources (any of): --world-fixture <path.json> | --world <seed|seed:N|?w=token>.
// Config sources: --config <path.json | token> (omit → defaults). Runs fully offline;
// fixtures regenerate their world deterministically from the engine.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim } from './engine.js';
import { civSignals } from './signals.js';
import { sweep } from './qd.js';
import { chronicleHash, loadWorldSpec } from './chronicle.js';
import { decodeCivConfig, normalizeConfig, encodeCivConfig } from './config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) { const k = t.slice(2); const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true; a[k] = v; }
    else a._.push(t);
  }
  return a;
}
function readJSON(p) { return JSON.parse(fs.readFileSync(resolvePath(p), 'utf8')); }
function resolvePath(p) { return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p); }
function resolveMaybeRel(p) { // try cwd, then relative to this module (so bundled fixtures/configs resolve)
  if (fs.existsSync(resolvePath(p))) return resolvePath(p);
  const rel = path.resolve(HERE, p); if (fs.existsSync(rel)) return rel;
  return resolvePath(p);
}

function loadWorld(args) {
  if (args['world-fixture']) return loadWorldSpec(JSON.parse(fs.readFileSync(resolveMaybeRel(args['world-fixture']), 'utf8')), { n: numOpt(args, 'n') });
  if (args.world != null) return loadWorldSpec(args.world, { n: numOpt(args, 'n') });
  throw new Error('need --world-fixture <path> or --world <seed|token>');
}
function loadConfig(args) {
  if (!args.config) return normalizeConfig(null);
  const c = String(args.config);
  if (fs.existsSync(resolveMaybeRel(c))) return normalizeConfig(JSON.parse(fs.readFileSync(resolveMaybeRel(c), 'utf8')));
  const dec = decodeCivConfig(c); if (dec) return dec;
  throw new Error('config: not a readable file or valid token: ' + c);
}
const numOpt = (a, k, d) => (a[k] != null && a[k] !== true ? +a[k] : d);

function cmdRun(args) {
  const world = loadWorld(args), cfg = loadConfig(args);
  const ticks = numOpt(args, 'ticks', 2000), civSeed = numOpt(args, 'civ-seed', 1);
  const t0 = Date.now();
  const ch = createSim(world, cfg, civSeed).run(ticks);
  const sig = civSignals(ch);
  const ms = Date.now() - t0;
  const out = { world: worldTag(args), config: encodeCivConfig(cfg), civSeed, ticks, hash: chronicleHash(ch), score: sig.score, descriptor: sig.descriptor, flags: sig.flags, highlights: sig.highlights, signals: sig.signals, facts: sig.facts, meta: ch.meta, chronicle: ch };
  if (args.out) { const op = resolvePath(args.out); fs.mkdirSync(path.dirname(op), { recursive: true }); fs.writeFileSync(op, JSON.stringify(out)); }
  // compact stdout summary
  console.log(`\n${sig.descriptor}`);
  console.log(`score ${sig.score}  flags [${sig.flags.join(', ')}]  hash ${out.hash}`);
  console.log(`signals ${Object.entries(sig.signals).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  console.log(`facts: pop ${sig.facts.finalPop}, cultures ${sig.facts.cultures}, langs ${sig.facts.languages}, maxTier ${sig.facts.maxTier}, agriOrigins ${sig.facts.agriOrigins}, industrialOrigins ${sig.facts.industrialOrigins}, homelands ${sig.facts.homelands}`);
  if (sig.highlights.length) console.log(`highlights: ${sig.highlights.join('; ')}`);
  console.log(`(${ticks} ticks, ${ch.meta.finalPop} final pop, ~${ch.meta.peakAgentSlots} agent slots, ${ms}ms${args.out ? ', wrote ' + args.out : ''})`);
}

function cmdSweep(args) {
  const world = loadWorld(args);
  const res = sweep(world, {
    method: String(args.method || 'qd'), budget: numOpt(args, 'budget', 60),
    ticks: numOpt(args, 'ticks', 1000), civSeed: numOpt(args, 'civ-seed', 1),
    log: m => process.stdout.write('  ' + m + '\n'),
  });
  if (args.out) { const op = resolvePath(args.out); fs.mkdirSync(path.dirname(op), { recursive: true }); fs.writeFileSync(op, JSON.stringify({ world: worldTag(args), ...res })); }
  console.log(`\nQD archive: ${res.meta.cells} distinct behavior cells from ${res.meta.evals} evals (best ★${res.meta.best})`);
  console.log('axes: ' + res.meta.axes.map(a => a.label).join(' × '));
  console.log('\ntop elites:');
  for (const e of res.archive.slice(0, 12)) console.log(`  ★${String(e.score).padStart(3)} [${e.coords.join(',')}]  ${e.descriptor}`);
  if (args.out) console.log(`\nwrote ${args.out} (${res.archive.length} elites)`);
}

function cmdVerify(args) {
  const world = loadWorld(args), cfg = loadConfig(args);
  const ticks = numOpt(args, 'ticks', 1500), civSeed = numOpt(args, 'civ-seed', 1);
  const h1 = chronicleHash(createSim(world, cfg, civSeed).run(ticks));
  const h2 = chronicleHash(createSim(world, cfg, civSeed).run(ticks));
  const ok = h1 === h2;
  console.log(`verify: run1 ${h1}  run2 ${h2}  →  ${ok ? 'DETERMINISTIC ✓' : 'NON-DETERMINISTIC ✗'}`);
  if (!ok) process.exit(1);
}

function worldTag(args) {
  if (args['world-fixture']) return 'fixture:' + path.basename(String(args['world-fixture']));
  return String(args.world);
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cmd = args._[0];
  try {
    if (cmd === 'run') cmdRun(args);
    else if (cmd === 'sweep') cmdSweep(args);
    else if (cmd === 'verify') cmdVerify(args);
    else {
      console.log('mappa civ — headless civilization-evolution CLI\n');
      console.log('  node civ.js run    --world-fixture <f> [--config <f|token>] [--civ-seed 1] [--ticks 2000] [--out f.json]');
      console.log('  node civ.js sweep  --world-fixture <f> [--method qd|grid|random] [--budget 60] [--ticks 1000] [--out f.json]');
      console.log('  node civ.js verify --world-fixture <f> [--config <f|token>] [--ticks 1500]');
      console.log('\nworld also accepts --world <seed | seed:N | ?w= token>. configs/ and worlds/ are bundled.');
      if (cmd) process.exit(2);
    }
  } catch (e) { console.error('error: ' + e.message); process.exit(1); }
}
main();
