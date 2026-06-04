#!/usr/bin/env node
// surface-mitosis.mjs — detect surfaces that have grown enough to divide.
//
// A surface is healthy as a single cell while one branch can hold it. It should
// undergo MITOSIS when it grows past a threshold AND a clean cleavage plane
// exists — a set of low-coupling members that can separate into two daughters,
// each viable alone, each getting its own branch in deploy-registry.json. This
// restores the invariant's health: one surface, one branch, low contention.
//
// This tool measures the file-level signals and flags candidates. It does NOT
// move anything — the actual division (anaphase) is staged, one daughter at a
// time. See docs/surface-mitosis.md for the model.
//
// Signals it measures per surface:
//   mass        total bytes on disk
//   files       file count
//   members     independent sub-units (immediate subdirs that hold a page:
//               index.html / app.js) — a high count is a "syncytium"
//   biggestFile largest single-file LOC (a monster file is REFACTOR, not split)
//
// Thresholds (tunable constants below). A surface trips MITOSIS when it is both
// massive/many-membered AND divisible (>=2 members so a cleavage plane exists).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- thresholds ---
const MEMBER_SPLIT   = 8;        // >= this many independent members → divide
const MASS_SPLIT     = 250_000;  // CODE bytes (assets excluded); heavy surfaces
const MONSTER_LOC    = 2500;     // a single file this big → refactor flag (noise-tuned)
const FILE_SPLIT     = 25;       // raw file count fallback

const PAGE_MARKERS = ['index.html', 'app.js', 'main.js'];
const ASSET = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|wasm|mp3|wav|m4a|mp4|pdf|zip|duckdb|parquet)$/i;

// Measure CODE mass, not asset mass: committed images/wasm/fonts inflate bytes
// without making a surface harder to hold (read's 318MB is storybook PNGs).
function walk(dir) {
  let bytes = 0, files = 0, maxLoc = 0, maxLocFile = '';
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = walk(p);
      bytes += sub.bytes; files += sub.files;
      if (sub.maxLoc > maxLoc) { maxLoc = sub.maxLoc; maxLocFile = sub.maxLocFile; }
    } else {
      files++;
      if (ASSET.test(e.name)) continue;       // asset: counted as a file, not as mass
      bytes += statSync(p).size;
      if (/\.(js|html|css|ts|mjs)$/.test(e.name)) {
        const loc = readFileSync(p, 'utf8').split('\n').length;
        if (loc > maxLoc) { maxLoc = loc; maxLocFile = p.replace(ROOT + '/', ''); }
      }
    }
  }
  return { bytes, files, maxLoc, maxLocFile };
}

function members(dir) {
  // immediate subdirs that are independent page-units
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'lib')
    .filter(e => PAGE_MARKERS.some(m => existsSync(join(dir, e.name, m))))
    .map(e => ({ name: e.name, bytes: walk(join(dir, e.name)).bytes }))
    .sort((a, b) => b.bytes - a.bytes);
}

// greedy size-balanced 2-way partition → proposed daughters
function cleave(ms) {
  const a = [], b = []; let aw = 0, bw = 0;
  for (const m of ms) (aw <= bw ? (a.push(m), aw += m.bytes) : (b.push(m), bw += m.bytes));
  return [{ list: a, w: aw }, { list: b, w: bw }];
}

const kb = n => (n / 1000).toFixed(0) + 'kb';

// surfaces to examine: registry surfaces + the root-bundled static dirs
const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));
const targets = new Map();
// surfaces tagged `cohesion: "integrated"` are organs — specialized cells around
// a shared structure (read's cross-tale hub, rite's shared atproto pipeline).
// They trip size thresholds but must NOT divide, so we exclude them from mitosis.
const organ = new Set(reg.surfaces.filter(s => s.cohesion === 'integrated').map(s => s.dir));
for (const s of reg.surfaces) if (s.dir && s.dir !== '.' && existsSync(join(ROOT, s.dir))) targets.set(s.dir, s.surface);
for (const d of reg.surfaces.find(s => s.surface === 'root')?.serves ?? [])
  if (d !== '(landing index)' && existsSync(join(ROOT, d))) targets.set(d, `${d} (root-bundled)`);

console.log(`\nSurface mitosis scan — thresholds: members>=${MEMBER_SPLIT}, mass>=${kb(MASS_SPLIT)}, monsterFile>${MONSTER_LOC} loc\n`);

const flagged = [];
for (const [dir, name] of [...targets].sort()) {
  const w = walk(join(ROOT, dir));
  const ms = members(join(ROOT, dir));
  const reasons = [];
  if (ms.length >= MEMBER_SPLIT) reasons.push(`syncytium: ${ms.length} members`);
  if (w.bytes >= MASS_SPLIT && ms.length >= 2) reasons.push(`heavy: ${kb(w.bytes)}`);
  if (w.files >= FILE_SPLIT && ms.length >= 2) reasons.push(`${w.files} files`);
  const monster = w.maxLoc > MONSTER_LOC;
  const isOrgan = organ.has(dir);
  if (!reasons.length && !monster) continue;
  if (isOrgan && !monster && reasons.length) {
    console.log(`○ ${name}  [${dir}]  ${kb(w.bytes)} code, ${ms.length} members — ORGAN (cohesion:integrated): trips ${reasons.join('; ')} but shares a core; do NOT divide.\n`);
    continue;
  }

  flagged.push(name);
  console.log(`● ${name}  [${dir}]  ${kb(w.bytes)} code, ${w.files} files, ${ms.length} members`);
  if (monster) console.log(`    ⟳ REFACTOR: ${w.maxLocFile} is ${w.maxLoc} loc (monster file — refactor, not mitosis)`);
  if (reasons.length && !isOrgan) {
    console.log(`    ✄ MITOSIS candidate — ${reasons.join('; ')}`);
    if (ms.length >= 2) {
      const [a, b] = cleave(ms);
      console.log(`      proposed cleavage (size-balanced; rebucket thematically before committing):`);
      console.log(`        daughter A (${kb(a.w)}): ${a.list.map(m => m.name).join(', ')}`);
      console.log(`        daughter B (${kb(b.w)}): ${b.list.map(m => m.name).join(', ')}`);
    }
  }
  console.log('');
}

if (!flagged.length) console.log('No split candidates — all surfaces within thresholds.\n');
else console.log(`${flagged.length} surface(s) flagged: ${flagged.join(', ')}\n`);
