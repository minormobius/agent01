// finance/ptable/layout.js — grid geometry, scales and formatting.
//
// No framework, no build step: this is imported directly by main.js in the
// browser and by ptable.selftest.mjs in node, which is why it stays pure.

/** Standard 18-column periodic table, with the f-block pulled out to rows 9/10. */
export function gridPos(z) {
  if (z === 1) return { col: 1, row: 1 };
  if (z === 2) return { col: 18, row: 1 };
  if (z <= 10) return { col: z <= 4 ? z - 2 : z + 8, row: 2 };
  if (z <= 18) return { col: z <= 12 ? z - 10 : z, row: 3 };
  if (z <= 36) return { col: z - 18, row: 4 };
  if (z <= 54) return { col: z - 36, row: 5 };
  if (z <= 56) return { col: z - 54, row: 6 };
  if (z <= 71) return { col: z - 54, row: 9 };  // lanthanides -> 3..17
  if (z <= 86) return { col: z - 68, row: 6 };
  if (z <= 88) return { col: z - 86, row: 7 };
  if (z <= 103) return { col: z - 86, row: 10 }; // actinides -> 3..17
  return { col: z - 100, row: 7 };
}

/** The three things you can paint the table by. All are magnitude, so all are sequential. */
export const MODES = {
  down: {
    key: 'down',
    label: 'Downstream',
    blurb: 'Annual revenue of the first-order product markets that cannot be made without this element.',
    unit: '$/yr',
    value: (e) => e.down || 0,
    // Decade bounds for the log ramp. Fixed, not data-derived, so the legend
    // means the same thing in every mode and across future data revisions.
    domain: [1e7, 1e13],
  },
  up: {
    key: 'up',
    label: 'Upstream',
    blurb: 'World annual production × price at the first marketable form — what the extraction itself is worth.',
    unit: '$/yr',
    value: (e) => upstream(e),
    domain: [1e5, 1e12],
  },
  lev: {
    key: 'lev',
    label: 'Leverage',
    blurb: 'Downstream ÷ upstream. How much economy each dollar of extraction stands under.',
    unit: '×',
    value: (e) => leverage(e),
    domain: [0.5, 2000],
  },
};

export const upstream = (e) => (e.prod || 0) * (e.price || 0);
export const leverage = (e) => {
  const up = upstream(e);
  return up > 0 ? (e.down || 0) / up : 0;
};

/**
 * Seven steps of the validated blue sequential ramp, low -> high.
 *
 * The hex values live in styles.css as --ramp-0..--ramp-6 (and their inks as
 * --ink-0..--ink-6), because dark mode has to FLIP the anchor: on a dark
 * surface "low" must sit near the surface and "high" must be the bright end,
 * which is the reverse of light mode. Doing that in CSS means the swap happens
 * on an OS theme change with no JS listener and no re-render. These names are
 * kept here so the selftest can assert the step count matches the stylesheet.
 *
 * Every step clears 4.5:1 against its paired ink, so the value label inside a
 * cell is readable on all seven fills in both modes.
 */
const RAMP_STEPS = 7;

/**
 * Bucket a value onto the ramp by log position within the mode's domain.
 * Returns null for "no value", which the caller renders as an empty cell
 * rather than as step 0 — absent and smallest are different facts.
 */
export function rampStep(v, domain) {
  if (!(v > 0)) return null;
  const [lo, hi] = domain;
  const t = (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return Math.max(0, Math.min(RAMP_STEPS - 1, Math.floor(t * RAMP_STEPS)));
}

export const rampCount = () => RAMP_STEPS;

/** Tick labels for the legend: one per ramp step, at the step's lower bound. */
export function legendTicks(mode) {
  const [lo, hi] = mode.domain;
  const span = Math.log10(hi) - Math.log10(lo);
  return Array.from({ length: RAMP_STEPS }, (_, i) => 10 ** (Math.log10(lo) + (span * i) / RAMP_STEPS));
}

/** $12.3B / $940M / $1.2T — three significant figures, never scientific notation. */
export function money(v) {
  if (!(v > 0)) return '—';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [div, suffix] of units) {
    if (v >= div) {
      const n = v / div;
      return `$${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}${suffix}`;
    }
  }
  return `$${v.toFixed(0)}`;
}

export function multiple(v) {
  if (!(v > 0)) return '—';
  if (v >= 100) return `${Math.round(v)}×`;
  if (v >= 10) return `${v.toFixed(0)}×`;
  return `${v.toFixed(1)}×`;
}

/** Tonnage with its basis, e.g. "2.60 Gt usable iron ore". */
export function quantity(e) {
  if (!(e.prod > 0)) return e.basis || '—';
  const v = e.prod;
  const [n, u] =
    v >= 1e9 ? [v / 1e9, 'G'] : v >= 1e6 ? [v / 1e6, 'M'] : v >= 1e3 ? [v / 1e3, 'k'] : [v, ''];
  const num = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  // basis already carries its own unit word ("t Si content", "m³ He"), so the
  // SI prefix is spliced in front of it rather than appended to the number.
  return `${num} ${u}${e.basis || ''}`.trim();
}

export function formatIn(mode, e) {
  const v = mode.value(e);
  return mode.key === 'lev' ? multiple(v) : money(v);
}

export const CONF_LABEL = {
  high: 'sourced upstream, measured downstream',
  med: 'sourced upstream, estimated downstream',
  low: 'order of magnitude — read the exponent',
  nil: 'no extraction economy exists',
};

export const CATEGORIES = {
  nonmetal: 'Reactive nonmetal', noble: 'Noble gas', alkali: 'Alkali metal',
  alkaline: 'Alkaline earth', metalloid: 'Metalloid', transition: 'Transition metal',
  post: 'Post-transition metal', halogen: 'Halogen', lanthanide: 'Lanthanide',
  actinide: 'Actinide',
};
