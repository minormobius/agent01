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
import { charts, stats } from '../../packages/dataviz/index.mjs';
const { median } = stats;
import { mde, designComparison } from './design.mjs';
import { iccSamplingDistribution, bimodalityPower } from './simulate.mjs';
import { loadRuns, partition, repeatedBeads, orderEffect } from './h4.mjs';
import { fitBradleyTerry } from './bt.mjs';
import { comparisonRows, TABLE_MARK } from './ste-lint.mjs';
import { build as buildPlan } from './plan.mjs';
import { renderPlan } from './layout.mjs';
import { shapeNames, buildShape, depthKenDesign, catalogue, collinearity, priceH5, H5, H6 } from './shapes.mjs';
import { shapeInvariants, positionTable } from './roles.mjs';
import { readFileSync as _read } from 'node:fs';

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

  // ── H4: the order effect is one bead ──
  const clean = partition(loadRuns()).cleanRuns;
  const beads = repeatedBeads(clean);
  const loo = [{ label: 'all 7 beads', ...orderEffect(clean, { perms: 4000 }) }];
  for (const g of beads) {
    const kept = clean.filter((r) => r.bead !== g.bead);
    loo.push({ label: `without ${g.bead}`, ...orderEffect(kept, { perms: 4000 }) });
  }
  figs['h4-leave-one-out'] = charts.forest({
    rows: loo.map((r) => ({
      label: r.label,
      est: r.slope,
      lo: r.slope - 1.96 * r.se,
      hi: r.slope + 1.96 * r.se,
    })),
    ref: 0, width: 620, height: 40 + loo.length * 26, labelW: 150,
    xlabel: 'within-bead slope, log seconds per position (dashed line = no effect)',
    aria: 'Leave-one-out sensitivity for the within-task order effect. Removing any of six '
        + 'beads barely moves the slope; removing lp-16d590 collapses it to near zero.',
  });

  // ── H4: duration rises then flattens ──
  const blocks = [];
  for (let lo = 1; lo <= 100; lo += 20) {
    const b = clean.filter((r) => r.turn >= lo && r.turn < lo + 20);
    if (b.length) blocks.push({ x: lo + 9.5, y: median(b.map((r) => r.dur)) });
  }
  figs['h4-drift'] = charts.line({
    series: [{ name: 'median duration', points: blocks }], markers: true,
    width: 620, height: 230,
    xlabel: 'turn (block of 20)', ylabel: 'median duration (s)',
    aria: 'Median turn duration by block of twenty turns: 213s, 500s, 798s, then 546s and '
        + '550s. The rise is confined to the first sixty turns.',
  });

  // ── the first judged ranking, and how little it separates ──
  const jd = JSON.parse(_read(join(HERE, 'judging', 'race-02.verdicts.json'), 'utf8'));
  const key = JSON.parse(_read(join(HERE, 'judging', 'race-02.mapping.json'), 'utf8')).map;
  const bt = fitBradleyTerry(jd.verdicts, { prior: 0.5 });
  figs['bt-ranking'] = charts.forest({
    rows: bt.map((r) => {
      const [h, m, s] = key[r.item].split('__');
      const se = r.se || 0.9;                 // the pinned reference has none of its own
      return { label: `${h} · ${m} · ${s}`, est: r.theta, lo: r.theta - 1.96 * se, hi: r.theta + 1.96 * se };
    }),
    ref: 0, width: 620, height: 40 + bt.length * 26, labelW: 176,
    xlabel: 'Bradley–Terry strength (log-odds), 56 verdicts over 28 pairs',
    aria: 'Bradley-Terry ranking of the twelve race-02 entries. The whole scale spans 2.6 '
        + 'log-odds and the standard errors are about 0.9, so only the extremes separate.',
  });

  // ── the run shape, drawn by the graph rather than placed by hand ──
  figs['plan-2x3'] = renderPlan(
    buildPlan('experiment', { conditions: ['control', 'treatment'], replicates: 3 }),
    { width: 620, title: 'Three standard runs over two conditions: 18 turns, depth 3.' });
  figs['plan-4x2'] = renderPlan(
    buildPlan('experiment', { conditions: ['a', 'b', 'c', 'd'], replicates: 2 }),
    { width: 620, title: 'The same cell over a four-condition bus: 20 turns, same depth. No geometry was changed.' });
  figs['plan-degraded'] = renderPlan(
    buildPlan('experiment', { conditions: ['solo'], replicates: 2 }),
    { width: 620, title: 'A bus of one cannot split, so each wave falls back to a single degraded arm.' });

  // ── the six-turn catalogue, one figure per org chart ──────────────
  // Not one line of geometry here: renderPlan derives every position from
  // the graph, so adding a shape to shapes.mjs adds its figure.
  for (const name of shapeNames()) {
    const g = buildShape(name);
    const inv = shapeInvariants(g);
    figs[`shape-${name}`] = renderPlan(g, {
      width: 300, rowHeight: 62,
      title: `${g.title}: 6 turns, depth ${inv.depth}, |Aut| ${inv.autOrder}, sink ken ${
        positionTable(g).find((r) => r.id === g.sink).ken}.`,
    });
  }

  // ── depth against ken, the claim the catalogue rests on ───────────
  {
    const pts = [];
    for (const name of shapeNames()) {
      for (const r of positionTable(buildShape(name))) pts.push({ x: r.depth, y: r.ken });
    }
    const d = depthKenDesign();
    figs['depth-ken'] = charts.scatterFit({
      points: pts, width: 380, height: 250,
      xlabel: 'depth (turns from the source)',
      ylabel: 'ken ratio',
      annot: `36 turns over 6 shapes · shape-level r = ${d.correlation}`,
      aria: 'Depth against ken ratio for every turn of every shape in the catalogue. Across shapes the two '
          + 'are near-orthogonal, which is what makes them separable; within a single run they are not.',
    });
  }

  return figs;
}

// CLI only. ken.selftest.mjs imports buildFigures(), and an unguarded block
// here would run the staleness check (and possibly exit) on import.
/** The STE comparison table on /run, kept current the same way figures are. */
export function buildSteTable() {
  const rows = comparisonRows(join(HERE, '..'));
  return `${TABLE_MARK.start}\n${rows.map((r) => `        ${r.html}`).join('\n')}\n        ${TABLE_MARK.end}`;
}

export function steTableCurrent() {
  const page = readFileSync(join(HERE, '..', 'run.html'), 'utf8');
  const want = buildSteTable();
  const re = new RegExp(`${TABLE_MARK.start}[\\s\\S]*?${TABLE_MARK.end}`);
  return { current: re.test(page) && re.exec(page)[0].replace(/\s+/g, ' ') === want.replace(/\s+/g, ' '), want, re };
}

/* ── generated blocks on a page ────────────────────────────────────────
   A page marks a slot with <!-- FIG:name:START --><!-- FIG:name:END -->
   or TBL:name, and the content between the markers is written from code.

   This generalises what the STE table on /run did for one table. The
   reason is the same and it is now recorded twice: a number typed into a
   page beside the code that computes it goes stale, and the two times
   /run's table did so were both inside one turn. WP2 has five such
   tables and seven figures, so none of them are typed.
   ──────────────────────────────────────────────────────────────────── */
const blockRe = (kind, name) =>
  new RegExp(`(<!-- ${kind}:${name}:START -->)[\\s\\S]*?(<!-- ${kind}:${name}:END -->)`);

/** Every generated block on wp2.html, as kind -> name -> html. */
export function buildBlocks() {
  const out = { FIG: {}, TBL: {} };
  const figs = buildFigures();

  // the whole catalogue grid is one block, so its captions are generated
  // with the pictures rather than typed beside them
  out.FIG['catalogue-grid'] = '<div class="figgrid">' + shapeNames().map((n) => {
    const g = buildShape(n);
    const inv = shapeInvariants(g);
    const sinkKen = positionTable(g).find((r) => r.id === g.sink).ken;
    return `<figure>${figs[`shape-${n}`]}<figcaption><b>${g.title}</b><br>`
      + `depth ${inv.depth} · |Aut| ${inv.autOrder} · sink ken ${sinkKen}</figcaption></figure>`;
  }).join('') + '</div>';

  out.FIG['depth-ken'] = figs['depth-ken'];

  const num = (x) => `<td class="num">${x}</td>`;
  const cat = catalogue();

  out.TBL.catalogue = table(
    ['Shape', 'Depth', 'Width', 'Max in', 'Sink ken', 'Mean ken', '|Aut|', 'Orbits', 'Largest orbit'],
    cat.map((r) => `<tr><td><b>${r.name}</b> <span class="muted">${r.real}</span></td>`
      + [r.depth, r.width, r.maxInDeg, r.sinkKen, r.meanKen, r.autOrder, r.orbitCount, r.largestOrbit].map(num).join('')
      + '</tr>'));

  out.TBL.collinearity = table(
    ['Shape', 'r(depth, ken)', 'VIF', 'Ken spread', 'Separable within one run'],
    collinearity().map((c) => `<tr><td><b>${c.shape}</b></td>${num(c.r)}${num(c.vif)}${num(c.kenSpread)}`
      + `<td>${c.separable ? '<b>yes</b>' : 'no'}</td></tr>`));

  out.TBL.hypotheses = table(
    ['', 'Claim', 'Outcome', 'Refuted by'],
    [H5, H6].map((h) => `<tr><td><b>${h.id}</b> ${h.name}</td><td>${h.claim}</td>`
      + `<td>${h.outcome}<br><span class="muted">unit: ${h.unit}</span></td>`
      + `<td><ul class="tight">${h.refutedBy.map((r) => `<li>${r}</li>`).join('')}</ul></td></tr>`));

  const p = priceH5({ d: 0.8 });
  out.TBL.price = table(
    ['Design', 'Runs', 'Turns', 'What it estimates'],
    [
      `<tr><td>unpaired, chain against briefed</td>${num(p.unpaired.runs)}${num(p.unpaired.turns)}<td>${p.unpaired.note}</td></tr>`,
      `<tr><td><b>paired on task</b></td>${num(p.paired.runs)}${num(`<b>${p.paired.turns}</b>`)}<td>${p.paired.note}; saves ${Math.round(p.paired.saving * 100)}%</td></tr>`,
      `<tr><td>within-run ken slope</td>${num(p.withinRun.runs)}${num(p.withinRun.turns)}<td>${p.withinRun.note}. ${p.withinRun.caveat}</td></tr>`,
    ]);
  return out;
}

const table = (head, rows) => '<table class="booktabs"><thead><tr>'
  + head.map((h, i) => `<th${i === 0 ? '' : ' class="num"'}>${h}</th>`).join('')
  + `</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/** Which blocks on wp2.html have drifted from the code. */
export function blocksCurrent() {
  const path = join(HERE, '..', 'wp2.html');
  let page = readFileSync(path, 'utf8');
  const blocks = buildBlocks();
  const stale = [];
  for (const kind of ['FIG', 'TBL']) {
    for (const [name, html] of Object.entries(blocks[kind])) {
      const re = blockRe(kind, name);
      const m = re.exec(page);
      if (!m) { stale.push(`${kind}:${name} (no slot on the page)`); continue; }
      if (m[0] !== `${m[1]}${html}${m[2]}`) stale.push(`${kind}:${name}`);
      page = page.replace(re, `$1${html.replace(/\$/g, '$$$$')}$2`);
    }
  }
  return { stale, page, path };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const figs = buildFigures();
  const write = process.argv.includes('--write');
  let stale = 0;

  // the generated blocks on wp2
  {
    const b = blocksCurrent();
    if (b.stale.length) {
      stale += b.stale.length;
      if (write) { writeFileSync(b.path, b.page); console.log(`  → wp2.html: ${b.stale.length} block(s) written`); }
      else console.log(`  ✗ wp2.html STALE: ${b.stale.join(', ')}`);
    } else console.log('  ✓ wp2.html generated blocks current');
  }

  // the generated table on /run
{
  const { current, want, re } = steTableCurrent();
  if (!current) {
    stale++;
    if (write) {
      const path = join(HERE, '..', 'run.html');
      writeFileSync(path, readFileSync(path, 'utf8').replace(re, want));
      console.log('  → run.html STE table written');
    } else console.log('  ✗ run.html STE table STALE');
  } else console.log('  ✓ run.html STE table current');
}

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
