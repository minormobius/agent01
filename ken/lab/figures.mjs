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
import { build as buildPlan } from '../graph/plan.mjs';
import { renderPlan } from '../graph/layout.mjs';
import { shapeNames, buildShape, depthKenDesign, catalogue, collinearity, priceH5, H5, H6 } from '../graph/shapes.mjs';
import { shapeInvariants, positionTable } from '../graph/roles.mjs';
import { HYPOTHESES, statusCounts, STATUSES } from '../graph/hypotheses.mjs';
import { RESIDUES, costToPin, simulateFit } from './probe.mjs';
import { curve, grid, exchangeRate, residue, PARAMETERS, ILLUSTRATIVE } from '../graph/equivalence.mjs';
import { costLadder } from './seeded.mjs';
import {
  ungated, specifyFirst, stoppingPoint, optimalCoverage, unsoundnessCeiling,
  agreementFloor, strategies, VERIFICATION_FIRST, CHOICE,
} from '../graph/gate.mjs';
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

  /* ── WP3: what direction buys, and where it stops being buyable ──
     Two figures, and the pair is the argument. The first shows the
     unattended arm flattening while the directed one keeps falling. The
     second shows where that flattening happens above the target, which
     is the region no chain length reaches. */
  {
    const c = curve({ upTo: 14 });
    figs['equiv-curve'] = charts.line({
      series: [
        { name: 'unattended', points: c.rows.map((r) => ({ x: r.n, y: r.automated })) },
        { name: 'directed', points: c.rows.map((r) => ({ x: r.n, y: r.directed })) },
        { name: 'unattended floor', points: c.rows.map((r) => ({ x: r.n, y: c.floor })) },
      ],
      markers: true, width: 620, height: 250,
      xlabel: 'turns in the chain', ylabel: 'defect density (units of r)',
      aria: 'Defect density against chain length for an unattended chain and a directed one. The '
          + 'unattended curve flattens onto a floor above zero; the directed curve keeps falling, '
          + 'because a person`s context does not decay and their later chances stay worth something.',
    });

    /* The boundary: the smallest catch rate that lets ANY number of
       unattended turns reach three directed ones, swept over lambda.
       Computed by bisection rather than a scan, since the predicate is
       monotone in g and a 0.01 scan was both slower and coarser. */
    const boundary = [];
    for (let i = 1; i <= 19; i++) {
      const lambda = Number((i * 0.05).toFixed(2));
      let lo = 0, hi = 1;
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2;
        if (exchangeRate({ lambda, g: mid }).reachable) hi = mid; else lo = mid;
      }
      boundary.push({ x: lambda, y: Number(hi.toFixed(3)) });
    }
    figs['equiv-boundary'] = charts.line({
      series: [{ name: 'smallest workable catch rate', points: boundary }],
      markers: true, width: 620, height: 250,
      xlabel: 'λ — context surviving one handoff', ylabel: 'g — catch rate needed',
      aria: 'The feasibility boundary. Below and left of the curve no number of unattended turns '
          + 'reaches the density of three directed ones. The curve falls steeply, so attenuation '
          + 'and gate quality substitute for each other.',
    });
  }

  /* ── WP4: what a check does to the floor ──────────────────────────
     Two figures, and the pair is the argument: where to stop specifying,
     and where the two strategies cross. */
  {
    const cov = [];
    for (let c = 0; c <= 1.0001; c += 0.02) {
      const cc = Math.round(c * 100) / 100;
      cov.push({ x: cc, ...specifyFirst({ coverage: cc }) });
    }
    figs['gate-coverage'] = charts.line({
      series: [
        { name: 'total density', points: cov.map((r) => ({ x: r.x, y: r.density })) },
        { name: 'missed by the check', points: cov.map((r) => ({ x: r.x, y: r.missed })) },
        { name: 'created by the check', points: cov.map((r) => ({ x: r.x, y: r.certified })) },
      ],
      width: 620, height: 250,
      xlabel: 'coverage — share of defects the check detects', ylabel: 'defect density (units of r)',
      aria: 'Defect density against check coverage, split into what the check misses and what its '
          + 'own wrong assertions create. The total falls and then rises, so there is a coverage '
          + 'past which more specification makes the artefact worse.',
    });

    /* The crossing. Correlation is the honest axis, being the quantity
       Knight and Leveson showed is not zero. */
    const cross = [];
    for (let rho = 0; rho <= 0.9001; rho += 0.05) {
      const r = Math.round(rho * 100) / 100;
      const by = Object.fromEntries(strategies({ correlation: r }).rows.map((x) => [x.name, x.density]));
      cross.push({ x: r, sf: by['specify-first'], bt: by['build-twice'], un: by.ungated });
    }
    figs['gate-crossing'] = charts.line({
      series: [
        { name: 'specify-first', points: cross.map((r) => ({ x: r.x, y: r.sf })) },
        { name: 'build-twice', points: cross.map((r) => ({ x: r.x, y: r.bt })) },
        { name: 'ungated', points: cross.map((r) => ({ x: r.x, y: r.un })) },
      ],
      width: 620, height: 250,
      xlabel: 'ρ — how much two independent attempts fail together',
      ylabel: 'defect density (units of r)',
      aria: 'Defect density for the three strategies against error correlation. Specify-first is '
          + 'flat in correlation; build-twice rises with it and meets the ungated line at one, '
          + 'where two correlated attempts buy nothing at all.',
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

  // ── §12, the attenuation probe ──────────────────────────────────────
  // These are generated for the same reason as the rest: the residue
  // definitions and the price of the probe both live in lab/probe.mjs,
  // and a copy of either typed into the page would be free to drift from
  // the simulator that produced it.
  out.TBL.residues = table(
    ['Residue', 'Where it comes from', 'Why it is incidental', 'How it is scored', 'Guessable?'],
    Object.entries(RESIDUES).map(([k, r]) => `<tr><td><code>${k}</code><br><b>${r.name}</b></td>`
      + `<td>${r.how}</td><td>${r.incidental}; ${r.loadBearing}</td>`
      + `<td>${r.scoring}</td><td>${r.guessable}</td></tr>`), { num: [] });

  const cost = costToPin({ target: 0.25 });
  out.TBL['probe-cost'] = table(
    ['Chains', 'Turns', '95% width on λ', 'Bias', 'Failed to identify λ'],
    cost.rows.map((r) => {
      const win = cost.enough && r.chains === cost.enough.chains;
      const cell = (x) => num(win ? `<b>${x}</b>` : x);
      return `<tr><td>${win ? `<b>${r.chains}</b>` : r.chains}</td>${cell(r.turns)}${cell(r.width)}`
        + `${cell(r.bias > 0 ? `+${r.bias}` : r.bias)}${cell(`${r.unidentified} of 1500`)}</tr>`;
    }));

  out.TBL['probe-range'] = table(
    ['True λ', 'Median estimate', '95% interval', 'Width', 'Failed to identify λ'],
    [0.2, 0.5, 0.7, 0.95].map((lambda) => {
      const s = simulateFit({ lambda, k: 20, chains: 3, floorK: 60, trials: 1500, seed: 7 });
      return `<tr><td class="num">${lambda.toFixed(2)}</td>${num(s.median)}`
        + `<td class="num">[${s.lo}, ${s.hi}]</td>${num(s.width)}${num(`${s.unidentified} of 1500`)}</tr>`;
    }), { num: [0, 1, 2, 3, 4] });
  return out;
}

/** WP3's generated blocks. */
export function buildEquivalenceBlocks() {
  const figs = buildFigures();
  const num = (x) => `<td class="num">${x}</td>`;
  const out = { FIG: {}, TBL: {} };

  out.FIG['equiv-curve'] = figs['equiv-curve'];
  out.FIG['equiv-boundary'] = figs['equiv-boundary'];

  /* The grid is the paper's centre, so it is generated and its "never"
     cells are rendered as the word rather than as a blank. A blank reads
     as missing data; this is a result. */
  const gs = [0.2, 0.35, 0.5, 0.65, 0.8];
  out.TBL['exchange-grid'] = table(
    ['λ \\ g', ...gs.map((g) => g.toFixed(2))],
    grid({ gs }).map((row) => `<tr><td><b>${row.lambda.toFixed(2)}</b></td>`
      + row.cells.map((c) => (c.n === null
        ? '<td class="num never">never</td>'
        : `<td class="num${c.n <= 6 ? ' within' : ''}">${c.n}</td>`)).join('')
      + '</tr>'));

  out.TBL['equiv-params'] = table(
    ['', 'What it is', 'What would measure it', 'What stands behind it now'],
    PARAMETERS.map((p) => `<tr><td><b>${p.symbol}</b><br><span class="muted">${p.name}</span></td>`
      + `<td>${p.role}</td><td>${p.instrument}</td><td>${p.standing}</td></tr>`), { num: [] });

  const ladder = costLadder();
  out.TBL['seeded-cost'] = table(
    ['Seeds', 'Runs', 'Turns', 'Far: width on g', 'Far: band right', 'Near: width on g', 'Near: band right', 'Near: rate right'],
    ladder.rows.map((r) => `<tr><td class="num">${r.k}</td>${num(r.runs)}${num(r.turns)}`
      + `${num(r.easyWidth)}${num(pct(r.easyVerdict))}${num(r.hardWidth)}`
      + `${num(pct(r.hardVerdict))}${num(pct(r.hardNumeric))}</tr>`));

  const ill = exchangeRate();
  out.TBL['equiv-illustration'] = table(
    ['Quantity', 'Value', 'Where it comes from'],
    [
      `<tr><td>λ, context surviving a handoff</td>${num(ILLUSTRATIVE.lambda)}<td>assumed — H8 would measure it</td></tr>`,
      `<tr><td>g, unattended catch rate</td>${num(ILLUSTRATIVE.g)}<td>assumed — H9's seeded arm would measure it</td></tr>`,
      `<tr><td>h, directed catch rate</td>${num(ILLUSTRATIVE.h)}<td>assumed — H9 observes the directed arm's density instead</td></tr>`,
      `<tr><td>target: density of ${ILLUSTRATIVE.directedTurns} directed turns</td>${num(ill.target)}<td>computed</td></tr>`,
      `<tr><td>floor: density no chain length beats</td>${num(ill.floor)}<td>computed</td></tr>`,
      `<tr><td><b>exchange rate</b></td>${num(`<b>${ill.n ?? 'never'}</b>`)}<td><b>computed</b></td></tr>`,
    ]);
  return out;
}

const pct = (x) => `${Math.round(x * 1000) / 10}%`;

/** WP4's generated blocks. */
export function buildGateBlocks() {
  const figs = buildFigures();
  const num = (x) => `<td class="num">${x}</td>`;
  const out = { FIG: {}, TBL: {} };

  out.FIG['gate-coverage'] = figs['gate-coverage'];
  out.FIG['gate-crossing'] = figs['gate-crossing'];

  out.TBL.duties = table(
    ['Turn', 'Duty', 'Role · lanes only', 'Role · builder also briefed', 'Makes'],
    VERIFICATION_FIRST.duties.map((d) => `<tr><td><code>${d.turn}</code></td><td><b>${d.duty}</b></td>`
      + `<td><code>${d.roleLanes}</code></td>`
      + `<td><code${d.roleLanes === d.roleBriefed ? '' : ' class="changed"'}>${d.roleBriefed}</code></td>`
      + `<td>${d.makes}</td></tr>`), { num: [] });

  /* The inversion, which is the paper's least comfortable result: better
     briefing lowers the optimal amount of specification. */
  out.TBL.stopping = table(
    ['λ', 'Ungated density M', 'Stop specifying at', 'Density there', 'Against no gate'],
    [0.2, 0.4, 0.6, 0.8, 0.95].map((lambda) => {
      const sp = stoppingPoint({ lambda });
      const opt = optimalCoverage({ lambda });
      return `<tr><td class="num">${lambda.toFixed(2)}</td>${num(ungated({ lambda }))}${num(sp.coverage)}`
        + `${num(opt.density)}${num(opt.noGate)}</tr>`;
    }), { num: [0, 1, 2, 3, 4] });

  out.TBL.agreement = table(
    ['ρ', 'Two versions', 'Three versions', 'One version'],
    [0, 0.15, 0.3, 0.5, 0.8, 1].map((rho) => {
      const p = ungated();
      return `<tr><td class="num">${rho.toFixed(2)}</td>`
        + `${num(agreementFloor({ p, correlation: rho }))}`
        + `${num(agreementFloor({ p, correlation: rho, versions: 3 }))}${num(p)}</tr>`;
    }), { num: [0, 1, 2, 3] });

  out.TBL.choice = table(
    ['', 'What it is', 'What it decides', 'What stands behind it'],
    CHOICE.map((c) => `<tr><td><b>${c.symbol}</b><br><span class="muted">${c.quantity}</span></td>`
      + `<td>${c.is}</td><td>${c.decides}</td><td>${c.standing}</td></tr>`), { num: [] });

  out.TBL['open-questions'] = table(
    ['The profile does not settle', 'Which changes what the run measures'],
    VERIFICATION_FIRST.openQuestions.map((q) => `<tr><td><b>${q[0]}</b></td><td>${q[1]}</td></tr>`),
    { num: [] });

  return out;
}

/** The hypothesis register, rendered from hypotheses.mjs. */
export function buildRegisterBlocks() {
  const counts = statusCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const summary = table(
    ['Status', 'Count', 'Meaning'],
    STATUSES.map((st) => `<tr><td><code>${st}</code></td><td class="num">${counts[st]}</td>`
      + `<td>${STATUS_GLOSS[st]}</td></tr>`)
      .concat(`<tr><td><b>total</b></td><td class="num"><b>${total}</b></td><td></td></tr>`), { num: [1] });

  const rows = Object.values(HYPOTHESES).map((h) => {
    const ev = h.evidence
      ? `<p class="small"><b>Evidence.</b> ${h.evidence}</p>`
      : '<p class="small"><b>Evidence.</b> <i>none recorded</i></p>';
    const req = h.requires
      ? `<p class="small hyp-req"><b>Requires.</b> ${h.requires}</p>`
      : '';
    const pred = h.predicts
      ? `<p class="small"><b>Predicts.</b> ${h.predicts.map((p) => `${p[0]} <span class="muted">(${p[1]})</span>`).join('; ')}</p>`
      : '';
    return `<div class="hyp"><div class="hyp-head"><b>${h.id}</b> <span class="hyp-name">${h.name}</span>`
      + `<span class="hyp-status ${h.status}">${h.status}</span>`
      + `<span class="grow"></span><span class="muted">Unit ${h.curriculumUnit} · <a href="${h.owner}">${h.owner}</a></span></div>`
      + `<p class="hyp-claim">${h.claim}</p>`
      + req
      + `<p class="small"><b>Outcome.</b> ${h.outcome} <span class="muted">Unit of analysis: ${h.analysisUnit}.</span></p>`
      + pred
      + `<p class="small"><b>Refuted by.</b></p><ul class="tight small">${h.refutedBy.map((r) => `<li>${r}</li>`).join('')}</ul>`
      + ev
      + `<p class="small"><b>Cost.</b> ${h.cost}</p></div>`;
  }).join('');

  return { FIG: {}, TBL: { 'status-summary': summary, register: rows } };
}

const STATUS_GLOSS = {
  untested: 'stated, nothing run and nothing computed',
  designed: 'a design exists and is priced, no data collected',
  undecided: 'measured, and the measurement does not decide it',
  supported: 'evidence consistent with it, and the evidence is named',
  refuted: 'evidence against it, and the evidence is named',
};

/* `num` names the columns that hold numbers, because the first version
   right-aligned every column but the first and shoved the register's prose
   "Meaning" header against the right edge. */
const table = (head, rows, { num = null } = {}) => '<table class="booktabs"><thead><tr>'
  + head.map((h, i) => {
    const isNum = num ? num.includes(i) : i > 0;
    return `<th${isNum ? ' class="num"' : ''}>${h}</th>`;
  }).join('')
  + `</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/** Pages carrying generated blocks. Add one here and it is gated. */
export const GENERATED_PAGES = ['wp2.html', 'register.html', 'wp3.html', 'wp4.html'];

/** Which blocks on a page have drifted from the code. */
export function blocksCurrent(pageName = 'wp2.html') {
  const path = join(HERE, '..', pageName);
  let page = readFileSync(path, 'utf8');
  const blocks = pageName === 'register.html' ? buildRegisterBlocks()
    : pageName === 'wp3.html' ? buildEquivalenceBlocks()
      : pageName === 'wp4.html' ? buildGateBlocks()
        : buildBlocks();
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

  // the generated blocks on every page that has them
  for (const pageName of GENERATED_PAGES) {
    const b = blocksCurrent(pageName);
    if (b.stale.length) {
      stale += b.stale.length;
      if (write) { writeFileSync(b.path, b.page); console.log(`  → ${pageName}: ${b.stale.length} block(s) written`); }
      else console.log(`  ✗ ${pageName} STALE: ${b.stale.join(', ')}`);
    } else console.log(`  ✓ ${pageName} generated blocks current`);
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
