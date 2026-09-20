#!/usr/bin/env node
// finance/ptable/ptable.selftest.mjs — invariants for the financial periodic
// table dataset. Picked up by scripts/preflight.mjs when finance/ changes.
//
// This checks COHERENCE, not truth. It cannot tell you that world sulfur
// production is 84 Mt; it can tell you that whoever edited the record left the
// price on a different basis from the quantity, which is the failure mode that
// actually happens. See METHOD.md.

import { ELEMENTS } from './elements.js';
import {
  MODES, gridPos, upstream, leverage, rampStep, rampCount, legendTicks,
  money, multiple, quantity, CONF_LABEL, CATEGORIES,
} from './layout.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`  ok    ${name}`);
};

// ---------------------------------------------------------------- coverage --
{
  const zs = ELEMENTS.map((e) => e.z);
  const missing = [];
  for (let z = 1; z <= 118; z++) if (!zs.includes(z)) missing.push(z);
  check('all 118 elements present', missing.length === 0, `missing ${missing.join(',')}`);
  check('no duplicate atomic numbers', new Set(zs).size === zs.length);
  check('records are in atomic-number order', zs.every((z, i) => i === 0 || z > zs[i - 1]));
  const syms = ELEMENTS.map((e) => e.sym);
  check('symbols are unique', new Set(syms).size === syms.length);
}

// -------------------------------------------------------------------- grid --
{
  const seen = new Map();
  let bad = '';
  for (const e of ELEMENTS) {
    const { col, row } = gridPos(e.z);
    if (col < 1 || col > 18 || row < 1 || row > 10) bad ||= `${e.sym} at ${col}/${row}`;
    const key = `${col}/${row}`;
    if (seen.has(key)) bad ||= `${e.sym} collides with ${seen.get(key)} at ${key}`;
    seen.set(key, e.sym);
  }
  check('118 grid cells, no collisions, all in range', bad === '', bad);
  check('lanthanides on row 9', gridPos(57).row === 9 && gridPos(71).row === 9);
  check('actinides on row 10', gridPos(89).row === 10 && gridPos(103).row === 10);
  check('row 8 left empty for the f-block gap', ![...seen.keys()].some((k) => k.endsWith('/8')));
}

// ------------------------------------------------------------- field shape --
{
  const required = ['sym', 'name', 'cat', 'src', 'method', 'form', 'basis', 'note', 'conf'];
  const missing = [];
  for (const e of ELEMENTS) {
    for (const f of required) if (e[f] === undefined || e[f] === null || e[f] === '') missing.push(`${e.sym}.${f}`);
  }
  check('every record has the required fields', missing.length === 0, missing.slice(0, 6).join(', '));
  check('every confidence tier is known', ELEMENTS.every((e) => CONF_LABEL[e.conf]),
    ELEMENTS.filter((e) => !CONF_LABEL[e.conf]).map((e) => `${e.sym}=${e.conf}`).join(','));
  check('every category is known', ELEMENTS.every((e) => CATEGORIES[e.cat]),
    ELEMENTS.filter((e) => !CATEGORIES[e.cat]).map((e) => `${e.sym}=${e.cat}`).join(','));
  check('notes are substantive (>80 chars)', ELEMENTS.every((e) => e.note.length > 80),
    ELEMENTS.filter((e) => e.note.length <= 80).map((e) => e.sym).join(','));
  check('every record cites at least one source', ELEMENTS.every((e) => (e.refs || []).length > 0),
    ELEMENTS.filter((e) => !(e.refs || []).length).map((e) => e.sym).join(','));
}

// ------------------------------------------------------------------ basis --
// The failure this exists to catch: a quantity in tonnes of element content
// priced per tonne of oxide, or vice versa. prod and price must travel together.
{
  const orphaned = ELEMENTS.filter((e) => (e.prod > 0) !== (e.price > 0));
  check('prod and price are both set or both zero', orphaned.length === 0,
    orphaned.map((e) => `${e.sym} prod=${e.prod} price=${e.price}`).join(', '));
  const unlabelled = ELEMENTS.filter((e) => e.prod > 0 && !/[a-z]/.test(e.basis || ''));
  check('every priced element names its basis', unlabelled.length === 0,
    unlabelled.map((e) => e.sym).join(','));
  check('no negative quantities anywhere',
    ELEMENTS.every((e) => (e.prod || 0) >= 0 && (e.price || 0) >= 0 && (e.down || 0) >= 0));
}

// ------------------------------------------------------------- consistency --
{
  const nilPriced = ELEMENTS.filter((e) => e.conf === 'nil' && upstream(e) > 0);
  check('nil-confidence elements have no priced extraction', nilPriced.length === 0,
    nilPriced.map((e) => e.sym).join(','));

  const gates = ELEMENTS.filter((e) => e.gate);
  check('gates exist and stay a minority', gates.length > 0 && gates.length < ELEMENTS.length / 4,
    `${gates.length} of ${ELEMENTS.length}`);
  const emptyGates = gates.filter((e) => !(e.down > 0));
  check('every gate has a downstream to gate', emptyGates.length === 0,
    emptyGates.map((e) => e.sym).join(','));

  const midMismatch = ELEMENTS.filter((e) => e.mid && !(e.mid.v > 0 && e.mid.n));
  check('every traded-form market has a name and a value', midMismatch.length === 0,
    midMismatch.map((e) => e.sym).join(','));

  // Gold is the load-bearing counterexample in the prose: if a data edit ever
  // pushes it above 1x, the "runs backwards" claim on the page becomes false.
  const au = ELEMENTS.find((e) => e.sym === 'Au');
  check('gold still has leverage below 1x (the page says so)', leverage(au) < 1,
    `Au leverage ${leverage(au).toFixed(2)}`);
}

// ------------------------------------------------------------------ scales --
{
  for (const mode of Object.values(MODES)) {
    const steps = ELEMENTS.map((e) => rampStep(mode.value(e), mode.domain)).filter((s) => s !== null);
    const inRange = steps.every((s) => Number.isInteger(s) && s >= 0 && s < rampCount());
    check(`${mode.key}: every value lands on a real ramp step`, inRange);
    check(`${mode.key}: legend has one tick per step`, legendTicks(mode).length === rampCount());
    // A scale nobody's values reach the top of is a badly chosen domain.
    check(`${mode.key}: the ramp's full range is used`,
      new Set(steps).size >= 4, `only ${new Set(steps).size} distinct steps in use`);
  }
}

// -------------------------------------------------------------- formatting --
{
  check('money() renders magnitudes', money(2.4e12) === '$2.40T' && money(9.6e8) === '$960M' && money(0) === '—');
  check('multiple() renders ratios', multiple(1042) === '1042×' && multiple(7.9) === '7.9×' && multiple(0) === '—');
  check('quantity() splices the SI prefix into the basis',
    quantity(ELEMENTS.find((e) => e.sym === 'Fe')) === '2.60 Gt usable iron ore',
    quantity(ELEMENTS.find((e) => e.sym === 'Fe')));
  check('no record leaks an undefined into its rendered strings',
    ELEMENTS.every((e) => !`${e.src}${e.method}${e.form}${e.note}`.includes('undefined')));
}

// ------------------------------------------------------------------ totals --
{
  const up = ELEMENTS.reduce((s, e) => s + upstream(e), 0);
  const down = ELEMENTS.reduce((s, e) => s + (e.down || 0), 0);
  check('world upstream is the right order of magnitude ($1–5T)', up > 1e12 && up < 5e12, money(up));
  check('downstream exceeds upstream in aggregate', down > up, `${money(down)} vs ${money(up)}`);
  console.log(`\n  upstream ${money(up)} · downstream ${money(down)} · aggregate leverage ${multiple(down / up)}`);
  console.log(`  ${ELEMENTS.filter((e) => upstream(e) > 0).length} priced · ${ELEMENTS.filter((e) => e.gate).length} chokepoints · ${ELEMENTS.filter((e) => e.conf === 'nil').length} with no extraction economy`);
}

console.log(failures === 0 ? '\nptable selftest: PASS' : `\nptable selftest: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
