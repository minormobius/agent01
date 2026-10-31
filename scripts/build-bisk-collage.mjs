#!/usr/bin/env node
// Builds the Bisk daily collage — every image in the day's Scenes, tiled into
// ONE picture. Deterministic: same digest in, same layout out.
//
//   node scripts/build-bisk-collage.mjs              # the latest edition
//   node scripts/build-bisk-collage.mjs 2026-10-02   # a back issue
//
// Reads bisk/data/<date>.json (written by build-bisk-digest.mjs), fetches each
// scene's thumbnail from the Bluesky CDN, lays them out in justified rows
// (most-liked at the top), and writes:
//   • bisk/data/collage/<date>.jpg — the collage itself
//   • bisk/data/collage/latest.jpg — a copy, when <date> is the latest edition
//     (git stores identical blobs once, so the copy costs nothing). og:image.
//   • a `collage` block patched into <date>.json (and latest.json): the image
//     path, its size, and every tile's rectangle + scene index, so the page can
//     make each tile a link back to its post.
//
// Needs `sharp`, which the rest of the bisk pipeline does not. The daily Action
// installs it into a temp prefix and points SHARP_FROM at it; locally, any
// resolvable sharp works. Failure here never touches the digest itself.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'bisk', 'data');
const outDir = join(dataDir, 'collage');

const require = createRequire(process.env.SHARP_FROM ? join(process.env.SHARP_FROM, 'noop.js') : import.meta.url);
const sharp = require('sharp');

const W = 1600;            // canvas width
const MAX_H = 1200;        // image-area height for a full day (4:3 with W)
const MIN_H = 420;         // floor for a thin day
const GAP = 4;             // gutter between tiles, and the outer margin
const BAND = 56;           // masthead strip along the bottom
const MAX_TILES = 60;      // the digest already caps scenes at 60
const PAPER = '#fffdf7', INK = '#1c1a16', MUTED = '#7a7568', ACCENT = '#a8324a';

// ── fetch ────────────────────────────────────────────────────────────
async function fetchImage(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(buf).metadata();       // trust the pixels, not the record's aspectRatio
      if (!meta.width || !meta.height) return null;
      return { buf, ratio: meta.width / meta.height };
    } catch {}
  }
  return null;
}
async function fetchAll(scenes, concurrency = 6) {
  const out = new Array(scenes.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < scenes.length) {
      const i = next++;
      out[i] = await fetchImage(scenes[i].thumb);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

// ── layout ───────────────────────────────────────────────────────────
// Justified rows: walk the images in order, closing a row once it is wide
// enough at roughly `h` tall. Each row is then scaled to fill the inner width
// exactly. Extreme ratios are clamped so one panorama can't flatten a row.
const clampRatio = r => Math.max(0.5, Math.min(2.4, r));
function rowsFor(ratios, h, inner) {
  const rows = [];
  let row = [], sum = 0;
  for (let i = 0; i < ratios.length; i++) {
    row.push(i); sum += ratios[i];
    const width = sum * h + GAP * (row.length - 1);
    if (width >= inner) {
      // Close here, or before this image — whichever lands nearer to h.
      const hWith = (inner - GAP * (row.length - 1)) / sum;
      const sumWithout = sum - ratios[i];
      const hWithout = row.length > 1 ? (inner - GAP * (row.length - 2)) / sumWithout : Infinity;
      if (Math.abs(hWithout - h) < Math.abs(hWith - h)) {
        row.pop(); rows.push(row); row = [i]; sum = ratios[i];
      } else { rows.push(row); row = []; sum = 0; }
    }
  }
  if (row.length) {
    // A short last row would stretch tall when justified: fold it into the
    // row above unless it is at least half full.
    const fill = (sum * h + GAP * (row.length - 1)) / inner;
    if (fill < 0.5 && rows.length) rows[rows.length - 1].push(...row);
    else rows.push(row);
  }
  return rows;
}
function rowHeight(row, ratios, inner) {
  return (inner - GAP * (row.length - 1)) / row.reduce((a, i) => a + ratios[i], 0);
}
function naturalHeight(rows, ratios, inner) {
  return rows.reduce((a, r) => a + rowHeight(r, ratios, inner), 0) + GAP * (rows.length - 1);
}
function layout(ratios) {
  const inner = W - 2 * GAP;
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  // Aim for tiles ~220px tall: a full day fills MAX_H, a thin day gets shorter.
  const bodyH = Math.round(Math.max(MIN_H, Math.min(MAX_H, ratios.length * avg * 220 * 220 / inner)));
  // Binary-search the target row height whose natural layout is closest to bodyH.
  let lo = 40, hi = inner, best = null;
  for (let k = 0; k < 40; k++) {
    const h = (lo + hi) / 2;
    const rows = rowsFor(ratios, h, inner);
    const nat = naturalHeight(rows, ratios, inner);
    if (!best || Math.abs(nat - bodyH) < Math.abs(best.nat - bodyH)) best = { rows, nat };
    if (nat < bodyH) lo = h; else hi = h;
  }
  // Scale every row to fill bodyH exactly; tiles are cover-cropped, so the
  // small distortion this implies becomes a small crop.
  const { rows } = best;
  const avail = bodyH - GAP * (rows.length - 1);
  const natRows = rows.map(r => rowHeight(r, ratios, inner));
  const natSum = natRows.reduce((a, b) => a + b, 0);
  const tiles = [];
  let y = GAP, usedH = 0;
  rows.forEach((row, ri) => {
    const rh = ri === rows.length - 1 ? avail - usedH : Math.round(natRows[ri] / natSum * avail);
    usedH += rh;
    const sum = row.reduce((a, i) => a + ratios[i], 0);
    const availW = inner - GAP * (row.length - 1);
    let x = GAP, usedW = 0;
    row.forEach((i, ci) => {
      const w = ci === row.length - 1 ? availW - usedW : Math.round(ratios[i] / sum * availW);
      usedW += w;
      tiles.push({ i, x, y, w, h: rh });
      x += w + GAP;
    });
    y += rh + GAP;
  });
  return { tiles, height: GAP + bodyH + GAP };
}

// ── masthead strip ───────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function bandSvg(digest, count, authors) {
  const d = new Date(digest.date + 'T12:00:00Z').toLocaleDateString('en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const right = `${count} image${count === 1 ? '' : 's'} · ${authors} resident${authors === 1 ? '' : 's'} · bisk.mino.mobi`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAND}">
  <rect width="100%" height="100%" fill="${PAPER}"/>
  <rect x="${GAP}" y="0" width="${W - 2 * GAP}" height="2" fill="${INK}"/>
  <text x="${GAP + 10}" y="38" font-family="DejaVu Serif, Georgia, serif" font-weight="bold" font-size="28" fill="${INK}">Bisk</text>
  <text x="${GAP + 92}" y="36" font-family="DejaVu Sans Mono, monospace" font-size="13" letter-spacing="2" fill="${ACCENT}">THE SIMCLUSTER DAILY · ${esc(d.toUpperCase())}</text>
  <text x="${W - GAP - 10}" y="36" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="13" fill="${MUTED}">${esc(right)}</text>
</svg>`);
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  const latest = JSON.parse(readFileSync(join(dataDir, 'latest.json'), 'utf8'));
  const date = process.argv[2] || latest.date;
  const path = join(dataDir, `${date}.json`);
  if (!existsSync(path)) { console.error(`No digest for ${date}.`); process.exit(1); }
  const digest = JSON.parse(readFileSync(path, 'utf8'));
  const isLatest = latest.date === date;

  const scenes = (digest.scenes || []).slice(0, MAX_TILES);
  console.log(`Collage ${date}: fetching ${scenes.length} scenes…`);
  const imgs = await fetchAll(scenes);
  const ok = scenes.map((s, i) => ({ s, i, img: imgs[i] })).filter(e => e.img);
  console.log(`  ${ok.length}/${scenes.length} fetched`);

  let collage = null;
  if (ok.length) {
    const { tiles, height } = layout(ok.map(e => clampRatio(e.img.ratio)));
    const comps = await Promise.all(tiles.map(async t => ({
      input: await sharp(ok[t.i].img.buf).resize(t.w, t.h, { fit: 'cover', position: 'attention' }).toBuffer(),
      left: t.x, top: t.y,
    })));
    const authors = new Set(ok.map(e => e.s.handle)).size;
    comps.push({ input: bandSvg(digest, ok.length, authors), left: 0, top: height });
    const H = height + BAND;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${date}.jpg`);
    await sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
      .composite(comps)
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(file);
    if (isLatest) copyFileSync(file, join(outDir, 'latest.jpg'));
    collage = {
      src: `data/collage/${date}.jpg`,
      width: W, height: H, count: ok.length, authors,
      // i is the index into digest.scenes — the page links each tile to its post.
      tiles: tiles.map(t => ({ i: ok[t.i].i, x: t.x, y: t.y, w: t.w, h: t.h })),
    };
    console.log(`  wrote ${file} (${W}×${H}, ${tiles.length} tiles from ${authors} residents)`);
  } else {
    console.log('  no images today — no collage.');
  }

  digest.collage = collage;
  writeFileSync(path, JSON.stringify(digest, null, 2));
  if (isLatest) writeFileSync(join(dataDir, 'latest.json'), JSON.stringify(digest, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
