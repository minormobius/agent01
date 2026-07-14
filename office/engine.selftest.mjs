#!/usr/bin/env node
// Node selftest for office/engine.js — run before touching the engine:
//   node office/engine.selftest.mjs
// Exercises tree building against the real generated data plus the pure layout
// and PRNG helpers. No DOM, no network.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildTree, layoutWall, gridDims, rngFor, paletteFor, pathTo,
} from "./engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  ✗ " + m); fails++; } else console.log("  ✓ " + m); };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log("PRNG determinism");
{
  const a = rngFor("clock"), b = rngFor("clock");
  ok(a() === b() && a() === b(), "same key → identical stream");
  const r = rngFor("g");
  const v = r();
  ok(v >= 0 && v < 1, "values in [0,1)");
}

console.log("gridDims / layoutWall");
{
  ok(gridDims(1).cols === 1 && gridDims(1).rows === 1, "1 → 1×1");
  ok(gridDims(4).cols === 2 && gridDims(4).rows === 2, "4 → 2×2");
  ok(gridDims(22).cols === 5 && gridDims(22).rows === 5, "22 → 5×5 (fits 25)");
  for (const n of [1, 2, 3, 7, 13, 16, 22, 68]) {
    const rects = layoutWall(n);
    ok(rects.length === n, `layoutWall(${n}) → ${n} rects`);
    const inBox = rects.every((r) =>
      r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9 && r.w > 0 && r.h > 0);
    ok(inBox, `layoutWall(${n}) rects inside unit box, positive size`);
  }
  // no overlap between two distinct posters (grid cells are disjoint)
  const rr = layoutWall(9);
  let overlap = false;
  for (let i = 0; i < rr.length; i++) for (let j = i + 1; j < rr.length; j++) {
    const a = rr[i], b = rr[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap = true;
  }
  ok(!overlap, "layoutWall(9) posters do not overlap");
}

console.log("buildTree over office/surfaces.json");
{
  const data = JSON.parse(readFileSync(join(HERE, "surfaces.json"), "utf8"));
  const root = buildTree(data);
  ok(root.isRoot === true && root.id === "__root", "root is synthetic mino.mobi");
  ok(root.children.length > 0 && root.children.every((c) => c.isCategory), "root's children are category desks");

  // every raw node reachable exactly once; parents back-linked; cats inherited.
  const seen = new Map();
  let maxDepth = 0, leaves = 0, withUrl = 0;
  (function walk(n) {
    maxDepth = Math.max(maxDepth, n.depth);
    if (!n.children.length) leaves++;
    if (n.url) withUrl++;
    for (const c of n.children) {
      if (c.parentNode !== n) { console.error(`  ✗ ${c.id} does not back-link to ${n.id}`); fails++; }
      seen.set(c.id, (seen.get(c.id) || 0) + 1);
      walk(c);
    }
  })(root);
  const dupes = [...seen.entries()].filter(([, k]) => k > 1);
  ok(dupes.length === 0, "no node attached twice");
  ok(maxDepth >= 3, `tree reaches depth ${maxDepth} (root→cat→surface→wing)`);
  ok(leaves > 50, `${leaves} leaf endpoints`);

  // wings inherit their surface's category colour
  const rite = [...seen.keys()].length && findByName(root, "rite");
  if (rite && rite.children.length) {
    const same = rite.children.every((c) => c.cat === rite.cat);
    ok(same, "rite's wings inherit rite's category");
  }

  // pathTo climbs back to root
  const deep = deepest(root);
  const path = pathTo(deep);
  ok(path[0] === root && path[path.length - 1] === deep, "pathTo spans root→node");
  console.log(`  · ${seen.size} nodes, ${root.children.length} categories, max depth ${maxDepth}, deepest = ${path.map((p) => p.name).join(" / ")}`);
}

function findByName(root, name) {
  let hit = null;
  (function w(n) { if (hit) return; if (n.name === name && !n.isCategory) hit = n; for (const c of n.children) w(c); })(root);
  return hit;
}
function deepest(root) {
  let best = root;
  (function w(n) { if (n.depth > best.depth) best = n; for (const c of n.children) w(c); })(root);
  return best;
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
