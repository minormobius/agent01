#!/usr/bin/env node
// baseline.mjs — score the SHIPPED inpac scheme against this brief's rubric.
//
//   node bakeoff/briefs/inpac-gravity/baseline.mjs [--write]
//
// Reconstructs the charge-based interior field exactly as clock/inpac/index.html
// computes it today (shell attraction + centreline line-charge repulsion, baked
// into a 32×32 LUT and bilinearly sampled), stages it as a scorer-shaped entry
// in a temp dir, and runs the rubric over it.
//
// This exists for one reason: a rubric nobody has seen FAIL is not evidence of
// anything. The baseline is the control. Every bake-off entry is reported as a
// delta against it, and if a change to the scorer ever makes the baseline pass,
// the scorer is wrong — not the game.
//
// --write refreshes baseline.json, which the arena page uses as its zero line.

import { mkdtempSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreEntry, CHECKS } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const SHIPPED_HTML = join(REPO, 'clock/inpac/index.html');

// Verbatim transcription of clock/inpac/index.html's computeGravLUT +
// sampleGravity, re-exposed through this brief's field(R, Z, geom) seam. The
// numbers below are the file's own defaults (GRAV_SCALE, LINE_SCALE, LUT size).
const BASELINE_FIELD = `// BASELINE — the shipped inpac interior field, transcribed unchanged.
// Shell attraction (oppositely-charged torus surface) + line-charge repulsion
// (same-charge ring on the tube centreline), precomputed into a 32x32 LUT over
// (R_cyl, Z) and bilinearly interpolated. This is the code that is broken.

const GRAV_SCALE = 1.0;
const LINE_SCALE = 3.0;
const LUT_SIZE = 32;

const cache = new Map();

function buildLUT(R0, r0) {
  const key = R0 + ':' + r0;
  if (cache.has(key)) return cache.get(key);

  const R_MIN = 0.1, R_MAX = R0 + r0 + 5, Z_MIN = -(r0 + 5), Z_MAX = r0 + 5;
  const gR = new Float64Array(LUT_SIZE * LUT_SIZE);
  const gZ = new Float64Array(LUT_SIZE * LUT_SIZE);

  const NuS = 48, NvS = 32, duS = 2 * Math.PI / NuS, dvS = 2 * Math.PI / NvS;
  const NuL = 64, duL = 2 * Math.PI / NuL;

  for (let gi = 0; gi < LUT_SIZE; gi++) {
    const Rp = R_MIN + (gi / (LUT_SIZE - 1)) * (R_MAX - R_MIN);
    for (let gj = 0; gj < LUT_SIZE; gj++) {
      const Zp = Z_MIN + (gj / (LUT_SIZE - 1)) * (Z_MAX - Z_MIN);

      let sR = 0, sZ = 0;
      for (let iu = 0; iu < NuS; iu++) {
        const u = (iu + 0.5) * duS, cosU = Math.cos(u), sinU = Math.sin(u);
        for (let iv = 0; iv < NvS; iv++) {
          const v = (iv + 0.5) * dvS, cosV = Math.cos(v), sinV = Math.sin(v);
          const Rc = R0 + r0 * cosV;
          const dx = Rc * cosU - Rp, dy = Rc * sinU, dz = r0 * sinV - Zp;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.005) continue;
          const dist = Math.sqrt(d2);
          const f3 = (r0 * Math.abs(Rc) * duS * dvS) / (dist * d2);
          sR += dx * f3; sZ += dz * f3;
        }
      }

      let lR = 0, lZ = 0;
      for (let iu = 0; iu < NuL; iu++) {
        const u = (iu + 0.5) * duL, cosU = Math.cos(u), sinU = Math.sin(u);
        const dx = Rp - R0 * cosU, dy = -R0 * sinU, dz = Zp;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.005) continue;
        const dist = Math.sqrt(d2);
        const f3 = (R0 * duL) / (dist * d2);
        lR += dx * f3; lZ += dz * f3;
      }

      const idx = gi * LUT_SIZE + gj;
      gR[idx] = sR * GRAV_SCALE + lR * LINE_SCALE;
      gZ[idx] = sZ * GRAV_SCALE + lZ * LINE_SCALE;
    }
  }

  const lut = { gR, gZ, R_MIN, R_MAX, Z_MIN, Z_MAX };
  cache.set(key, lut);
  return lut;
}

export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

export function field(R, Z, geom = {}) {
  const R0 = geom.R ?? params.TORUS_R;
  const r0 = geom.r ?? params.TORUS_r;
  const L = buildLUT(R0, r0);

  const fi = (R - L.R_MIN) / (L.R_MAX - L.R_MIN) * (LUT_SIZE - 1);
  const fj = (Z - L.Z_MIN) / (L.Z_MAX - L.Z_MIN) * (LUT_SIZE - 1);
  const i0 = Math.max(0, Math.min(LUT_SIZE - 2, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(LUT_SIZE - 2, Math.floor(fj)));
  const fr = fi - i0, fz = fj - j0;
  const i00 = i0 * LUT_SIZE + j0, i10 = (i0 + 1) * LUT_SIZE + j0;
  const i01 = i0 * LUT_SIZE + (j0 + 1), i11 = (i0 + 1) * LUT_SIZE + (j0 + 1);
  const lerp = (a) => a[i00] * (1 - fr) * (1 - fz) + a[i10] * fr * (1 - fz)
                    + a[i01] * (1 - fr) * fz + a[i11] * fr * fz;
  return { gR: lerp(L.gR), gZ: lerp(L.gZ) };
}

export default field;
`;

const dir = mkdtempSync(join(tmpdir(), 'inpac-baseline-'));
writeFileSync(join(dir, 'field.mjs'), BASELINE_FIELD);

// Integrity is scored against the real page, with one line added so the
// baseline is judged on its physics rather than on a missing import.
if (existsSync(SHIPPED_HTML)) {
  copyFileSync(SHIPPED_HTML, join(dir, 'index.html'));
  const { readFileSync, writeFileSync: w } = await import('node:fs');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  w(join(dir, 'index.html'), html.replace('</head>', '<script type="module" src="./field.mjs"></script>\n</head>'));
} else {
  console.error(`warning: ${SHIPPED_HTML} not found — integrity check will fail`);
}

const record = await scoreEntry(dir);
record.entryDir = '(shipped clock/inpac, reconstructed)';

console.log(`\n  BASELINE — the shipped inpac scheme`);
console.log(`  score ${record.score}/${record.maxScore}\n`);
for (const [id, label, weight] of CHECKS) {
  const c = record.checks[id];
  const mark = !c ? '–' : c.passed ? '✓' : '✗';
  console.log(`  ${mark} ${id.padEnd(11)} ${String(weight).padStart(2)}pt  ${label}`);
  if (c?.detail) console.log(`      ${c.detail}`);
}
if (record.error) console.log(`\n  ERROR: ${record.error}`);
console.log();

if (process.argv.includes('--write')) {
  writeFileSync(join(HERE, 'baseline.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(`  wrote ${join(HERE, 'baseline.json')}\n`);
}

// A baseline that PASSES means the rubric stopped measuring the bug.
if (record.score === record.maxScore) {
  console.error('  !! baseline scores full marks — the rubric no longer detects the defect');
  process.exit(1);
}
