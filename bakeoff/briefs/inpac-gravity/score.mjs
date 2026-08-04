#!/usr/bin/env node
// score.mjs — objective rubric for the `inpac-gravity` brief.
//
//   node bakeoff/briefs/inpac-gravity/score.mjs <entry-dir> [--json]
//
// <entry-dir> is a directory laid out like clock/inpac/ — it must contain
// index.html and field.mjs. Prints a scorecard; --json prints the raw record
// the arena page is built from. Exit code is 0 whether the entry passes or
// fails: a failing entry is a RESULT, not a runner error. Exit 2 means the
// scorer could not evaluate the entry at all (missing/broken field.mjs), which
// is itself recorded as a zero.
//
// WHY A MODULE AND NOT A BROWSER. The thing under test is pure math, and the
// brief requires it extracted into an importable ES module. That makes scoring
// deterministic, dependency-free and ~50ms, instead of standing up WebGPU in
// headless Chromium and hoping. The cost is that the brief has to mandate the
// seam — which it does, and which is a real improvement to the file regardless.
//
// WHAT "CORRECT" MEANS HERE. INPAC puts you on the INSIDE of the tube. So
// "down" at any interior point is the direction AWAY from the tube centreline
// — straight at the nearest wall. Every check below is a restatement of that
// one sentence. The shipped code satisfies it only near the inner equator; see
// baseline.json.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TAU = Math.PI * 2;

// Geometries every entry must satisfy. The live page has sliders for R and r,
// so a fix that only works at the default aspect ratio is not a fix. The last
// one is deliberately fat (R/r = 1.5) — nearly a spindle torus, where the
// inner equator crowds the axis and naive schemes fall apart.
const GEOMETRIES = [
  { name: 'default', R: 8.0, r: 3.0 },
  { name: 'thin', R: 12.0, r: 2.0 },
  { name: 'fat', R: 6.0, r: 4.0 },
];

// Poloidal angles sampled around the tube cross-section, and fractional
// distances from the centreline out toward the wall.
const N_V = 72;
const DEPTHS = [0.05, 0.2, 0.4, 0.6, 0.75, 0.85, 0.93, 0.98];

const CHECKS = [
  ['sign', 'field points toward the wall everywhere inside the tube', 30],
  ['direction', 'field aims within 15° of the wall normal at standing depth', 15],
  ['uniformity', 'apparent gravity at the wall varies by ≤2× around the tube', 15],
  ['floor', 'field is never so weak you hang in the air', 10],
  ['finite', 'finite everywhere, including exactly on the centreline', 10],
  ['symmetry', 'obeys the torus’s own z → −z mirror symmetry', 10],
  ['speed', '100k evaluations in under 250ms', 5],
  ['integrity', 'index.html still imports the module and is intact', 5],
];
const MAX_SCORE = CHECKS.reduce((a, c) => a + c[2], 0);

function outward(v) { return { R: Math.cos(v), Z: Math.sin(v) }; }

// Sample point at poloidal angle v, fraction `f` of the way from the tube
// centreline to the wall.
function point(geom, v, f) {
  const d = f * geom.r;
  return { R: geom.R + d * Math.cos(v), Z: d * Math.sin(v) };
}

function evaluate(field, geom, v, f) {
  const p = point(geom, v, f);
  const out = field(p.R, p.Z, geom);
  if (!out || typeof out.gR !== 'number' || typeof out.gZ !== 'number') {
    throw new Error(`field() must return {gR, gZ} numbers; got ${JSON.stringify(out)}`);
  }
  const n = outward(v);
  return {
    gR: out.gR,
    gZ: out.gZ,
    radial: out.gR * n.R + out.gZ * n.Z,          // + = toward the wall = correct
    mag: Math.hypot(out.gR, out.gZ),
  };
}

export function scoreField(field, opts = {}) {
  const checks = {};
  const note = (id, passed, detail, extra = {}) => {
    checks[id] = { passed, detail, ...extra };
  };

  // ── sign: the actual bug ────────────────────────────────────────
  {
    let worst = Infinity, worstAt = null, bad = 0, total = 0;
    for (const geom of GEOMETRIES) {
      for (let i = 0; i < N_V; i++) {
        const v = (i / N_V) * TAU;
        for (const f of DEPTHS) {
          const e = evaluate(field, geom, v, f);
          total++;
          // Normalise by magnitude so this measures DIRECTION, not strength —
          // a weak-but-correct field should not be scored as a sign failure.
          const rel = e.mag > 0 ? e.radial / e.mag : 0;
          if (rel <= 0) bad++;
          if (rel < worst) {
            worst = rel;
            worstAt = { geom: geom.name, vDeg: +(v * 180 / Math.PI).toFixed(1), depth: f };
          }
        }
      }
    }
    note('sign', bad === 0,
      bad === 0
        ? `all ${total} interior samples push toward the wall`
        : `${bad}/${total} samples push AWAY from the wall (worst cos=${worst.toFixed(3)} at ${worstAt.geom} v=${worstAt.vDeg}° d=${worstAt.depth}r)`,
      { badSamples: bad, totalSamples: total, worstCos: +worst.toFixed(4), worstAt });
  }

  // ── direction: at standing depth, gravity should aim at the floor ──
  {
    let worstDeg = 0, worstAt = null;
    for (const geom of GEOMETRIES) {
      for (let i = 0; i < N_V; i++) {
        const v = (i / N_V) * TAU;
        const e = evaluate(field, geom, v, 0.93);
        const n = outward(v);
        const cos = e.mag > 0 ? (e.gR * n.R + e.gZ * n.Z) / e.mag : -1;
        const deg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        if (deg > worstDeg) { worstDeg = deg; worstAt = { geom: geom.name, vDeg: +(v * 180 / Math.PI).toFixed(1) }; }
      }
    }
    note('direction', worstDeg <= 15,
      `worst tilt off the wall normal: ${worstDeg.toFixed(1)}°${worstAt ? ` (${worstAt.geom} v=${worstAt.vDeg}°)` : ''}`,
      { worstTiltDeg: +worstDeg.toFixed(2) });
  }

  // ── uniformity: you should not weigh 5× more on one side of the tube ──
  {
    let ratios = [];
    for (const geom of GEOMETRIES) {
      let lo = Infinity, hi = 0;
      for (let i = 0; i < N_V; i++) {
        const e = evaluate(field, geom, (i / N_V) * TAU, 0.98);
        const g = Math.max(0, e.radial);
        lo = Math.min(lo, g); hi = Math.max(hi, g);
      }
      ratios.push({ geom: geom.name, ratio: lo > 0 ? hi / lo : Infinity });
    }
    const worst = Math.max(...ratios.map((r) => r.ratio));
    note('uniformity', worst <= 2.0,
      `heaviest/lightest point at the wall: ${Number.isFinite(worst) ? worst.toFixed(2) : '∞'}×`,
      { worstRatio: Number.isFinite(worst) ? +worst.toFixed(3) : null, perGeometry: ratios });
  }

  // ── floor: never so weak that a jump never comes down ────────────
  {
    let weakest = Infinity, at = null;
    for (const geom of GEOMETRIES) {
      // Reference: the field halfway out, averaged — the fix is free to choose
      // its own overall strength, so this is a RELATIVE floor.
      let ref = 0, n = 0;
      for (let i = 0; i < N_V; i++) { ref += Math.abs(evaluate(field, geom, (i / N_V) * TAU, 0.5).radial); n++; }
      ref /= n || 1;
      for (let i = 0; i < N_V; i++) {
        const v = (i / N_V) * TAU;
        for (const f of DEPTHS) {
          const rel = ref > 0 ? evaluate(field, geom, v, f).radial / ref : 0;
          if (rel < weakest) { weakest = rel; at = { geom: geom.name, vDeg: +(v * 180 / Math.PI).toFixed(1), depth: f }; }
        }
      }
    }
    note('floor', weakest >= 0.1,
      `weakest interior pull is ${weakest.toFixed(3)}× the mid-tube average${at ? ` (${at.geom} v=${at.vDeg}° d=${at.depth}r)` : ''}`,
      { weakestRelative: +weakest.toFixed(4), at });
  }

  // ── finite: including the singular-looking centreline ────────────
  {
    const bad = [];
    for (const geom of GEOMETRIES) {
      const probes = [
        { R: geom.R, Z: 0, why: 'exactly on the tube centreline' },
        { R: geom.R, Z: 1e-9, why: 'a hair off the centreline' },
        { R: geom.R + geom.r, Z: 0, why: 'on the outer wall' },
        { R: geom.R - geom.r, Z: 0, why: 'on the inner wall' },
        { R: 1e-6, Z: 0, why: 'on the symmetry axis' },
      ];
      for (const p of probes) {
        let out;
        try { out = field(p.R, p.Z, geom); } catch (e) { bad.push(`${geom.name} ${p.why}: threw ${e.message}`); continue; }
        if (!out || !Number.isFinite(out.gR) || !Number.isFinite(out.gZ)) {
          bad.push(`${geom.name} ${p.why}: ${JSON.stringify(out)}`);
        }
      }
    }
    note('finite', bad.length === 0,
      bad.length === 0 ? 'finite at every degenerate probe' : bad.join('; '), { badProbes: bad });
  }

  // ── symmetry: the torus is a mirror-symmetric solid ──────────────
  {
    let worst = 0, at = null;
    for (const geom of GEOMETRIES) {
      for (let i = 0; i < N_V; i++) {
        const v = (i / N_V) * TAU;
        const p = point(geom, v, 0.7);
        const a = field(p.R, p.Z, geom);
        const b = field(p.R, -p.Z, geom);
        const scale = Math.max(1e-9, Math.hypot(a.gR, a.gZ));
        // Mirroring z flips gZ and preserves gR.
        const err = (Math.abs(a.gR - b.gR) + Math.abs(a.gZ + b.gZ)) / scale;
        if (err > worst) { worst = err; at = { geom: geom.name, vDeg: +(v * 180 / Math.PI).toFixed(1) }; }
      }
    }
    note('symmetry', worst <= 0.01,
      `worst mirror asymmetry: ${(worst * 100).toFixed(2)}% of local field${at ? ` (${at.geom} v=${at.vDeg}°)` : ''}`,
      { worstAsymmetry: +worst.toFixed(5) });
  }

  // ── speed: this runs 8 substeps per frame ────────────────────────
  {
    const geom = GEOMETRIES[0];
    const t0 = process.hrtime.bigint();
    let sink = 0;
    for (let i = 0; i < 100_000; i++) {
      const v = (i % 360) * Math.PI / 180;
      const p = point(geom, v, 0.5 + 0.4 * Math.sin(i));
      sink += field(p.R, p.Z, geom).gR;
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    note('speed', ms < 250, `100k evaluations in ${ms.toFixed(0)}ms`, { ms: +ms.toFixed(1), sink: sink === Infinity ? 1 : 0 });
  }

  const score = CHECKS.reduce((a, [id, , w]) => a + (checks[id]?.passed ? w : 0), 0);
  return { checks, score, maxScore: MAX_SCORE };
}

// ── integrity: the page must actually USE the module it exports ────
export function scoreIntegrity(entryDir) {
  const htmlPath = join(entryDir, 'index.html');
  if (!existsSync(htmlPath)) return { passed: false, detail: 'index.html missing' };
  const html = readFileSync(htmlPath, 'utf8');
  const problems = [];
  // The fix must be wired into the page, not parked in an orphan module —
  // otherwise the module passes every check above while the game still breaks.
  if (!/field\.mjs/.test(html)) problems.push('index.html never references field.mjs');
  if (!/<canvas|getContext|requestAnimationFrame/.test(html)) problems.push('index.html lost its render loop');
  if (html.length < 20_000) problems.push(`index.html shrank to ${html.length} bytes — the game was gutted, not fixed`);
  return {
    passed: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `wired in, ${html.length} bytes`,
    bytes: html.length,
  };
}

export async function scoreEntry(entryDir) {
  const dir = resolve(entryDir);
  const modPath = join(dir, 'field.mjs');
  const record = {
    entryDir: dir,
    ok: false,
    score: 0,
    maxScore: MAX_SCORE,
    checks: {},
    error: null,
  };

  const integrity = scoreIntegrity(dir);

  if (!existsSync(modPath)) {
    record.error = 'field.mjs not found — the brief requires the interior field extracted into it';
    record.checks.integrity = { ...integrity, weight: 5 };
    record.score = integrity.passed ? 5 : 0;
    return record;
  }

  let mod;
  try {
    mod = await import(pathToFileURL(modPath).href);
  } catch (e) {
    record.error = `field.mjs failed to import: ${e.message}`;
    record.checks.integrity = { ...integrity, weight: 5 };
    record.score = integrity.passed ? 5 : 0;
    return record;
  }

  const field = mod.field ?? mod.default;
  if (typeof field !== 'function') {
    record.error = 'field.mjs exports no `field` function';
    record.checks.integrity = { ...integrity, weight: 5 };
    record.score = integrity.passed ? 5 : 0;
    return record;
  }

  try {
    const res = scoreField(field);
    record.checks = res.checks;
    record.score = res.score;
    record.ok = true;
  } catch (e) {
    record.error = `field() blew up during scoring: ${e.message}`;
  }

  record.checks.integrity = integrity;
  if (integrity.passed) record.score += 5;

  for (const [id, label, weight] of CHECKS) {
    if (record.checks[id]) { record.checks[id].label = label; record.checks[id].weight = weight; }
  }
  return record;
}

// ── CLI ─────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: score.mjs <entry-dir> [--json]');
    process.exit(2);
  }
  const record = await scoreEntry(dir);
  if (asJson) {
    console.log(JSON.stringify(record, null, 2));
  } else {
    console.log(`\n  ${dir}`);
    console.log(`  score ${record.score}/${record.maxScore}\n`);
    for (const [id, label, weight] of CHECKS) {
      const c = record.checks[id];
      const mark = !c ? '–' : c.passed ? '✓' : '✗';
      console.log(`  ${mark} ${id.padEnd(11)} ${String(weight).padStart(2)}pt  ${label}`);
      if (c?.detail) console.log(`      ${c.detail}`);
    }
    if (record.error) console.log(`\n  ERROR: ${record.error}`);
    console.log();
  }
}

export { CHECKS, MAX_SCORE, GEOMETRIES };
