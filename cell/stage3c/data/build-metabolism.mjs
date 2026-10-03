#!/usr/bin/env node
// Builds cell/stage3c/data/metabolism.json: the energy core of JCVI-syn3A as a kinetic network.
// Glucose uptake, glycolysis to lactate, GTP recharging, adenylate kinase and the ATP-burning
// ATP synthase, each with the thermodynamically balanced parameters published for the
// whole-cell model, and the genes whose proteins catalyse them (from the iMB155 reconstruction).
//
//   node cell/stage3c/data/build-metabolism.mjs            # write metabolism.json
//   node cell/stage3c/data/build-metabolism.mjs --check    # fail if metabolism.json is stale
//
// Sources: Luthey-Schulten-Lab/minimal_cell @ db048ac, CME_ODE/model_data:
//   Central_AA_Zane_Balanced_direction_fixed_nounqATP.tsv, Nucleotide_Kinetic_Parameters.tsv,
//   transport_NoH2O_Zane-TB-DB.tsv, GlobalParameters_Zane-TB-DB.csv, FBA/iMB155.json.
// Parameters from Thornburg et al. 2022 (Cell 185:345) and Breuer et al. 2019 (eLife 8:e36842).
// Only numbers are taken; the rate law is the standard common modular rate law, written here.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, 'metabolism.json');
const SHA = 'db048aca5fe85438e0129819bbf0314b037dd931';
const BASE = `https://raw.githubusercontent.com/Luthey-Schulten-Lab/minimal_cell/${SHA}/CME_ODE/model_data/`;
const FILES = {
  central: 'Central_AA_Zane_Balanced_direction_fixed_nounqATP.tsv',
  nucleo: 'Nucleotide_Kinetic_Parameters.tsv',
  transport: 'transport_NoH2O_Zane-TB-DB.tsv',
  globals: 'GlobalParameters_Zane-TB-DB.csv',
  fba: 'FBA/iMB155.json',
};
const args = process.argv.slice(2);
const CACHE = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : join(tmpdir(), 'cell-stage3c-sources');
async function source(key) {
  const path = join(CACHE, FILES[key].replace('/', '_'));
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    const r = await fetch(BASE + FILES[key]); if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
    writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  }
  return readFileSync(path, 'utf8');
}

// SBtab: blocks start with "!!SBtab ... TableName='X'", then a "!Col" header, then rows.
function sbtab(text) {
  const tables = {}; let cur = null, cols = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t+$/, '');
    if (line.startsWith('!!SBtab')) { cur = /TableName='([^']+)'/.exec(line)[1]; tables[cur] = []; cols = null; continue; }
    if (!cur || !line.trim()) continue;
    const cells = raw.split('\t');
    if (line.startsWith('!')) { cols = cells.map((c) => c.replace(/^!/, '').trim()); continue; }
    if (cols) tables[cur].push(Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()])));
  }
  return tables;
}

// [table, reaction id, plain-language name]
const REACTIONS = [
  ['central', 'GLCpts', 'glucose import (PTS)'],
  ['central', 'PGI', 'phosphoglucose isomerase'],
  ['central', 'PFK', 'phosphofructokinase'],
  ['central', 'FBA', 'aldolase'],
  ['central', 'TPI', 'triose phosphate isomerase'],
  ['central', 'GAPD', 'GAPDH'],
  ['central', 'PGK', 'phosphoglycerate kinase (makes ATP)'],
  ['central', 'PGM', 'phosphoglycerate mutase'],
  ['central', 'ENO', 'enolase'],
  ['central', 'PYK', 'pyruvate kinase (makes ATP)'],
  ['central', 'LDH_L', 'lactate dehydrogenase'],
  ['central', 'ATPase', 'ATP synthase, run in reverse (burns ATP)'],
  ['nucleo', 'PYK3', 'pyruvate kinase on GDP (makes GTP)'],
  ['nucleo', 'PGK3', 'phosphoglycerate kinase on GDP (makes GTP)'],
  ['nucleo', 'ADK1', 'adenylate kinase (AMP + ATP ⇌ 2 ADP)'],
  ['transport', 'L_LACt2r', 'lactate export'],
  ['central', 'PDH_E1', 'pyruvate dehydrogenase, step 1'],
  ['central', 'PDH_E2', 'pyruvate dehydrogenase, step 2 (makes acetyl-CoA)'],
  ['central', 'PDH_E3', 'pyruvate dehydrogenase, step 3 (makes NADH)'],
  ['central', 'PTAr', 'phosphotransacetylase (makes acetyl-phosphate)'],
  ['central', 'ACKr', 'acetate kinase (makes ATP)'],
  ['central', 'NOX', 'NADH oxidase (recycles NAD+)'],
  ['transport', 'ACt', 'acetate export'],
];
// The reconstruction gives PDH_E1 no gene rule; the whole-cell model's manual table maps it to
// protein AOE93317.1, which is the gene at 138324..139649 in CP016816 (JCVISYN3A_0227, pdhC).
const GENE_OVERRIDE = { PDH_E1: ['JCVISYN3A_0227'] };
// boundary species held constant: the medium, and gases that leave the cell freely
const FIXED = { M_glc__D_e: 'globals', M_h_e: 'globals', M_lac__L_e: 0, M_ac_e: 0, M_o2_c: 0, M_co2_c: 0 };

function parseFormula(f) {
  const side = (s) => s.split(' + ').map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = /^(\d+(?:\.\d+)?)\s+(\S+)$/.exec(t); return m ? [m[2], +m[1]] : [t, 1];
  });
  const [l, r] = f.split('<=>'); return [side(l), side(r)];
}

async function build() {
  const T = { central: sbtab(await source('central')), nucleo: sbtab(await source('nucleo')), transport: sbtab(await source('transport')) };
  const globals = Object.fromEntries((await source('globals')).trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [c[3], +c[1]]));
  const fba = JSON.parse(await source('fba'));
  const gpr = Object.fromEntries(fba.reactions.map((r) => [r.id, r.gene_reaction_rule || '']));

  const conc = {}; // initial concentrations, mM: prefer a balanced value over the 0.1 placeholder
  for (const key of ['nucleo', 'central']) for (const row of T[key].Parameter || []) {
    if (row.QuantityType !== 'concentration') continue;
    const id = row['Compound:SBML:species:id'], v = +row.Mode;
    if (!(id in conc) || (conc[id] === 0.1 && v !== 0.1)) conc[id] = v;
  }

  const reactions = [];
  for (const [tbl, id, label] of REACTIONS) {
    const rid = 'R_' + id, rx = T[tbl].Reaction.find((r) => r.Reaction === rid);
    if (!rx) throw new Error(`${rid} not found in ${tbl}`);
    const [subs, prods] = parseFormula(rx.ReactionFormula);
    const rule = gpr[id] || '';
    const genes = GENE_OVERRIDE[id] || (rule.match(/MMSYN1_\d+/g) || []).map((m) => 'JCVISYN3A_' + m.split('_')[1]);
    const out = { id, label, subs, prods, genes, rule: / or /i.test(rule) ? 'or' : 'and' };
    if (tbl === 'transport') {
      const P = +T.transport.Quantity.find((q) => q['Parameter:SBML:parameter:id'] === 'P_' + rid).Value;
      out.law = 'permeability'; out.P = P; out.rCell = globals.r_cell;
    } else {
      const ps = T[tbl].Parameter.filter((p) => p['Reaction:SBML:reaction:id'] === rid);
      const q = (type) => +ps.find((p) => p.QuantityType === type).Mode;
      out.law = 'modular'; out.kcatF = q('substrate catalytic rate constant'); out.kcatR = q('product catalytic rate constant');
      out.km = Object.fromEntries(ps.filter((p) => p.QuantityType === 'Michaelis constant').map((p) => [p['Compound:SBML:species:id'], +p.Mode]));
      for (const [m] of [...subs, ...prods]) if (!(m in out.km)) throw new Error(`${rid}: no Km for ${m}`);
    }
    reactions.push(out);
  }
  const species = [...new Set(reactions.flatMap((r) => [...r.subs, ...r.prods].map(([m]) => m)))];
  const fixed = {}, init = {};
  for (const m of species) {
    if (m in FIXED) fixed[m] = FIXED[m] === 'globals' ? globals[m] : (conc[m] ?? 0.1);
    else init[m] = conc[m] ?? 0.1;
  }
  return {
    meta: {
      built: 'cell/stage3c/data/build-metabolism.mjs',
      units: 'concentrations mM, rates mM/s, enzyme mM (copies × 1000 / (NA × V)), cell radius m',
      rateLaw: 'common modular: v = E · (kcatF·Π(S/Km) − kcatR·Π(P/Km)) / (Π(1+S/Km) + Π(1+P/Km) − 1); enzyme = min of subunits (AND) or sum (OR)',
      cellRadius: globals.r_cell,
      sources: [
        { cite: 'Thornburg Z.R. et al. (2022) Fundamental behaviors emerge from simulations of a living minimal cell. Cell 185:345. Balanced kinetic parameters, via Luthey-Schulten-Lab/minimal_cell @ ' + SHA.slice(0, 7), url: 'https://github.com/Luthey-Schulten-Lab/minimal_cell' },
        { cite: 'Breuer M. et al. (2019) Essential metabolism for a minimal cell. eLife 8:e36842. The iMB155 reconstruction (gene–reaction rules).', url: 'https://elifesciences.org/articles/36842' },
      ],
    },
    reactions, init, fixed,
  };
}

const data = await build(), json = JSON.stringify(data, null, 1) + '\n';
if (args.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== json) { console.error('metabolism.json is stale'); process.exit(1); }
  console.log('metabolism.json is current');
} else {
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT}: ${data.reactions.length} reactions, ${Object.keys(data.init).length} dynamic species, fixed:`, data.fixed);
  for (const r of data.reactions) console.log(`  ${r.id.padEnd(9)} ${r.rule} ${r.genes.join(',') || '(no gene)'}  kF=${r.kcatF ?? '-'} kR=${r.kcatR ?? '-'}`);
  console.log('init:', data.init);
}
