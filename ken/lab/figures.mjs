/* ken/lab/figures.mjs — render the site's figures to committed SVG files.

   Server-side rendering rather than client-side: the figures print, need no
   JavaScript at the reader, and can be diffed. ken.selftest.mjs regenerates
   them and fails if a committed file has drifted from the data.

     node ken/lab/figures.mjs           # check only
     node ken/lab/figures.mjs --write   # regenerate ken/fig/*.svg

   Charts come from packages/dataviz, whose Okabe–Ito palette is already
   validated; nothing here picks a colour. */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { charts } from '../../packages/dataviz/index.mjs';
import { mde, designComparison } from './design.mjs';
import { iccSamplingDistribution, bimodalityPower } from './simulate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'fig');

export function buildFigures() {
  const figs = {};

  // ── the money figure: how wide is the ICC estimate, by pilot size ──
  const ladder = [8, 12, 16, 24, 32, 48, 64, 96].map((tasks) => {
    const d = iccSamplingDistribution({ tasks, repeats: 3, trueIcc: 0.5, trials: 3000, seed: 31 });
    return { label: `${tasks} tasks · ${d.runs} runs`, est: d.median, lo: d.lo, hi: d.hi };
  });
  figs['icc-precision'] = charts.forest({
    rows: ladder, ref: 0.5, width: 620, height: 40 + ladder.length * 26, labelW: 130,
    xlabel: 'estimated ICC (dashed line = true value 0.5)',
    aria: 'Forest plot: the 95% interval on the intraclass correlation narrows slowly with '
        + 'pilot size. At 24 runs it spans nearly the whole parameter range; 144 runs are '
        + 'needed before it is usefully narrow.',
  });

  // ── what the same 24 runs are good for ──
  const power = [1, 1.5, 2, 2.5, 3, 4].map((gap) => ({
    x: gap,
    y: bimodalityPower({ tasks: 8, repeats: 3, p: 0.5, gap, noise: 0.35, trials: 2000, seed: 13 }).power,
  }));
  figs['bimodality-power'] = charts.line({
    series: [{ name: 'detection rate', points: power }], markers: true,
    width: 620, height: 240,
    xlabel: 'separation between modes (SD)', ylabel: 'detected',
    aria: 'Detection rate against mode separation for a 24-run pilot: near zero at one '
        + 'standard deviation, about seven in ten at two, and certain by three.',
  });

  // ── the retrospective: what a run budget can detect ──
  const mdeCurve = [];
  for (let n = 2; n <= 80; n += n < 10 ? 1 : 2) mdeCurve.push({ x: n, y: mde({ n }) });
  figs['mde-curve'] = charts.line({
    series: [{ name: 'smallest detectable effect', points: mdeCurve }],
    width: 620, height: 240,
    xlabel: 'runs per arm', ylabel: 'detectable effect (d)',
    aria: 'Smallest detectable standardised effect against runs per arm. At the two runs '
        + 'per cell the bake-offs used, only a difference of about 2.8 standard deviations '
        + 'would register.',
  });

  // ── the lever: pairing ──
  const pairing = [];
  for (let r = 0; r <= 0.9; r += 0.05) {
    pairing.push({ x: Number(r.toFixed(2)), y: designComparison({ d: 0.5, rho: r }).pairedObservations });
  }
  figs['pairing-saving'] = charts.line({
    series: [{ name: 'runs needed', points: pairing }], markers: true,
    width: 620, height: 240,
    xlabel: 'correlation between conditions on a shared task (ρ)', ylabel: 'runs for one contrast',
    aria: 'Runs needed for one medium-effect contrast against the correlation between '
        + 'conditions on shared tasks: 126 unpaired, falling to about 20 at a correlation '
        + 'of 0.85.',
  });

  return figs;
}

// CLI only. ken.selftest.mjs imports buildFigures(), and an unguarded block
// here would run the staleness check (and possibly exit) on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  const figs = buildFigures();
  const write = process.argv.includes('--write');
  let stale = 0;

  for (const [name, svg] of Object.entries(figs)) {
    const path = join(OUT, `${name}.svg`);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === svg) { console.log(`  ✓ ${name}.svg current`); continue; }
    stale++;
    if (write) { writeFileSync(path, svg); console.log(`  → ${name}.svg written (${svg.length}B)`); }
    else console.log(`  ✗ ${name}.svg STALE`);
  }

  if (!write && stale) {
    console.error(`\n${stale} figure(s) stale — run: node ken/lab/figures.mjs --write`);
    process.exit(1);
  }
  console.log(`\n${Object.keys(figs).length} figures`);
}
