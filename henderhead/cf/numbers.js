// numbers.js — turning what someone types into something the engine can expand
// exactly. Shared by the page and by cf.selftest.mjs, so: no DOM in here.
//
// Three exact routes into the engine, and one honest fallback:
//
//   ratio   p/q               Euclid. Exact and finite.
//   surd    (a + b√n)/c       Periodic. Exact and endless.
//   decimal a literal string  Exact as the rational it is; certain as the
//                             constant it stands for while q_k² < 10^digits.
//   f64     anything else     Evaluated in double precision, ~17 digits.
//
// The constants below are given to 40 significant figures, which carries their
// terms past any q this page will ever draw. Each one's opening terms are
// recorded next to it and checked by the selftest — if a digit ever gets
// fat-fingered, the expansion changes and the test says so.

export const CONSTANTS = [
  { id: 'half',    label: '1/2',    kind: 'ratio', p: 1, q: 2,
    head: [0, 2], blurb: 'A rational: two circles and the expansion is over.' },
  { id: 'fiveeighths', label: '5/8', kind: 'ratio', p: 5, q: 8,
    head: [0, 1, 1, 1, 2], blurb: 'Still rational, but long enough to have a shape.' },
  { id: 'pi22',    label: '22/7',   kind: 'ratio', p: 22, q: 7,
    head: [3, 7], blurb: 'Archimedes. Seven lobes, and nothing else.' },
  { id: 'pi355',   label: '355/113', kind: 'ratio', p: 355, q: 113,
    head: [3, 7, 16], blurb: 'Zu Chongzhi. The same seven lobes with 113 ripples laid over them.' },
  { id: 'phi',     label: 'φ',      kind: 'surd', a: 1, b: 1, c: 2, n: 5,
    head: [1, 1, 1, 1, 1, 1], blurb: 'All ones — the slowest q_k can grow, so the roughest picture there is.' },
  { id: 'sqrt2',   label: '√2',     kind: 'surd', a: 0, b: 1, c: 1, n: 2,
    head: [1, 2, 2, 2, 2], blurb: 'Period 1. The silver ratio’s cousin, and nearly as rough as φ.' },
  { id: 'sqrt3',   label: '√3',     kind: 'surd', a: 0, b: 1, c: 1, n: 3,
    head: [1, 1, 2, 1, 2], blurb: 'Period 2 — the picture has two interleaved scales.' },
  { id: 'sqrt5',   label: '√5',     kind: 'surd', a: 0, b: 1, c: 1, n: 5,
    head: [2, 4, 4, 4, 4], blurb: 'Period 1 again, but on 4s, so q_k climbs faster than φ’s.' },
  { id: 'sqrt7',   label: '√7',     kind: 'surd', a: 0, b: 1, c: 1, n: 7,
    head: [2, 1, 1, 1, 4, 1, 1, 1, 4], blurb: 'Period 4 — the first surd whose repeat is long enough to see.' },
  { id: 'e',       label: 'e',      kind: 'dec',
    dec: '2.718281828459045235360287471352662497757',
    head: [2, 1, 2, 1, 1, 4, 1, 1, 6, 1, 1, 8], blurb: 'Euler’s pattern 1,2,1 · 1,4,1 · 1,6,1 …: q_k outruns Fibonacci, so e draws smoother than φ.' },
  { id: 'pi',      label: 'π',      kind: 'dec',
    dec: '3.141592653589793238462643383279502884197',
    head: [3, 7, 15, 1, 292, 1, 1, 1, 2], blurb: 'The 292 is why 355/113 is such a good approximation — and why π’s picture settles so early.' },
  { id: 'cbrt2',   label: '∛2',     kind: 'dec',
    dec: '1.259921049894873164767210607278228350570',
    head: [1, 3, 1, 5, 1, 1, 4, 1, 1, 8], blurb: 'Cubic, so not periodic — no known pattern at all.' },
  { id: 'ln2',     label: 'ln 2',   kind: 'dec',
    dec: '0.6931471805599453094172321214581765680755',
    head: [0, 1, 2, 3, 1, 6, 3, 1, 1, 2], blurb: 'Transcendental, and about as unremarkable as an expansion gets.' },
  { id: 'gamma',   label: 'γ',      kind: 'dec',
    dec: '0.5772156649015328606065120900824024310422',
    head: [0, 1, 1, 2, 1, 2, 1, 4, 3, 13], blurb: 'Euler–Mascheroni. Nobody knows whether it is even irrational.' },
  { id: 'zeta3',   label: 'ζ(3)',   kind: 'dec',
    dec: '1.202056903159594285399738161511449990765',
    head: [1, 4, 1, 18, 1, 1, 1, 4, 1, 9], blurb: 'Apéry’s constant. Irrational since 1978; the 18 puts an early dent in it.' },
  { id: 'epi',     label: 'e^π',    kind: 'dec',
    dec: '23.14069263277926900572908636794854738027',
    head: [23, 7, 9, 3, 1, 1, 591], blurb: 'Gelfond’s constant. That 591 flattens the curve in one step.' },
  { id: 'liouville', label: 'L',    kind: 'dec',
    dec: '0.1100010000000000000000010000000000000000',
    head: [0, 9, 11, 99, 1, 10, 9, 999999999999], blurb: 'Liouville’s constant, Σ10⁻ⁿ! — built to be approximable. After the 999999999999 every remaining circle is far too small to see, so the picture is finished at seven terms.' },
  { id: 'champernowne', label: 'C₁₀', kind: 'dec',
    dec: '0.1234567891011121314151617181920212223243',
    head: [0, 8, 9, 1, 149083], blurb: 'Champernowne’s constant, the digits written out in order. The 149083 ends it after four circles.' },
];

const BY_ID = new Map(CONSTANTS.map((c) => [c.id, c]));

// what someone might type for each
const ALIASES = {
  pi: 'pi', 'π': 'pi', e: 'e', phi: 'phi', 'φ': 'phi', golden: 'phi',
  'ln2': 'ln2', 'log2': 'ln2', gamma: 'gamma', 'γ': 'gamma',
  'zeta3': 'zeta3', 'ζ(3)': 'zeta3', apery: 'zeta3', 'epi': 'epi',
  liouville: 'liouville', champernowne: 'champernowne',
  'sqrt2': 'sqrt2', '√2': 'sqrt2', 'sqrt3': 'sqrt3', '√3': 'sqrt3',
  'sqrt5': 'sqrt5', '√5': 'sqrt5', 'sqrt7': 'sqrt7', '√7': 'sqrt7',
  'cbrt2': 'cbrt2', '∛2': 'cbrt2',
};

/** Greatest common divisor, for keeping typed fractions in range. */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }

const I64_MAX = (1n << 63n) - 1n;

/**
 * Read a string as a number the engine can expand.
 *
 * Returns { kind, …, label, note } or { error }. `note` is the honest sentence
 * about how far the terms can be trusted; the page prints it verbatim rather
 * than implying every expansion is equally solid.
 */
export function resolve(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { error: 'type a number' };
  const key = raw.toLowerCase().replace(/\s+/g, '');

  const named = BY_ID.get(key) || BY_ID.get(ALIASES[key] || '');
  if (named) return fromConstant(named);

  // p/q — exact, and the only route that can hold a big denominator
  const frac = key.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    let p = BigInt(frac[1]), q = BigInt(frac[2]);
    if (q === 0n) return { error: 'denominator is zero' };
    const g = gcd(p, q) || 1n;
    p /= g; q /= g;
    if (p > I64_MAX || -p > I64_MAX || q > I64_MAX) return { error: 'fraction too large' };
    return { kind: 'ratio', p, q, label: `${p}/${q}`, note: 'Exact. A rational, so the expansion terminates.' };
  }

  // sqrt(n) and (a ± sqrt(n))/c — exact, and periodic, so endless
  const s1 = key.match(/^(?:sqrt|√)\(?(\d+)\)?$/);
  if (s1) return surd(0n, 1n, 1n, BigInt(s1[1]), `√${s1[1]}`);
  const s2 = key.match(/^\((-?\d+)\+(?:sqrt|√)\(?(\d+)\)?\)\/(-?\d+)$/);
  if (s2) return surd(BigInt(s2[1]), 1n, BigInt(s2[3]), BigInt(s2[2]), `(${s2[1]}+√${s2[2]})/${s2[3]}`);

  // a plain decimal — a terminating decimal *is* a rational, and the person
  // typing it meant that rational, so there is nothing to caveat
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(key)) {
    return { kind: 'dec', dec: key, digits: significantDigits(key), label: key,
             note: 'Exact. A terminating decimal is a rational, so the expansion terminates.' };
  }

  // anything else: evaluate it in double precision and say so
  const v = evaluate(key);
  if (v === null || !Number.isFinite(v)) return { error: `can’t read “${raw}”` };
  const dec = v.toPrecision(17);
  return { kind: 'dec', dec, digits: 17, label: raw, approx: true,
           note: decNote(17, 'evaluated in double precision') };
}

function fromConstant(c) {
  if (c.kind === 'ratio') {
    return { kind: 'ratio', p: BigInt(c.p), q: BigInt(c.q), label: c.label, const: c,
             note: 'Exact. A rational, so the expansion terminates.' };
  }
  if (c.kind === 'surd') {
    const r = surd(BigInt(c.a), BigInt(c.b), BigInt(c.c), BigInt(c.n), c.label);
    r.const = c;
    return r;
  }
  const digits = significantDigits(c.dec);
  return { kind: 'dec', dec: c.dec, digits, label: c.label, const: c, approx: true,
           note: decNote(digits, `given here to ${digits} significant figures`) };
}

function surd(a, b, c, n, label) {
  if (c === 0n) return { error: 'denominator is zero' };
  const r = Math.round(Math.sqrt(Number(n)));
  const square = BigInt(r) * BigInt(r) === n;
  return { kind: 'surd', a, b, c, n, label,
           note: square
             ? 'Exact — and a perfect square, so this is really a rational.'
             : 'Exact, and periodic: a quadratic irrational’s terms repeat forever, so there is no last one.' };
}

function significantDigits(s) {
  const m = String(s).replace(/^[-+]/, '').replace('.', '').replace(/^0+/, '');
  return Math.max(1, m.length);
}

function decNote(digits, provenance) {
  const q = Math.pow(10, digits / 2);
  return `A decimal ${provenance}. Expanded exactly as that rational; as the constant it stands for, the terms are certain while q stays below about ${sci(q)}.`;
}

function sci(x) {
  const e = Math.floor(Math.log10(x));
  return e >= 6 ? `10^${e}` : Math.round(x).toLocaleString('en-US');
}

// ------------------------------------------------------------- the fallback --

/**
 * A four-function evaluator over doubles, so `pi/4`, `sqrt(2)+1` and
 * `(1+sqrt(5))/2` all work even when they miss the exact routes above.
 * Deliberately small: it is the least trustworthy path on the page.
 */
export function evaluate(src) {
  const fns = { sqrt: Math.sqrt, cbrt: Math.cbrt, ln: Math.log, log: Math.log10, exp: Math.exp,
                sin: Math.sin, cos: Math.cos, abs: Math.abs };
  const consts = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2, tau: Math.PI * 2 };
  const toks = String(src).match(/\d+\.?\d*|\.\d+|[a-z]+|\*\*|[-+*/^()]/g);
  if (!toks) return null;
  let i = 0;
  const peek = () => toks[i];
  const eat = (t) => (toks[i] === t ? (i++, true) : false);

  function primary() {
    if (eat('(')) { const v = expr(); if (!eat(')')) throw 0; return v; }
    if (eat('-')) return -primary();
    if (eat('+')) return primary();
    const t = peek();
    if (t === undefined) throw 0;
    if (/^[a-z]+$/.test(t)) {
      i++;
      if (fns[t]) { if (!eat('(')) throw 0; const v = expr(); if (!eat(')')) throw 0; return fns[t](v); }
      if (t in consts) return consts[t];
      throw 0;
    }
    i++;
    return parseFloat(t);
  }
  function power() { const b = primary(); if (eat('^') || eat('**')) return Math.pow(b, power()); return b; }
  function term() { let v = power(); for (;;) { if (eat('*')) v *= power(); else if (eat('/')) v /= power(); else return v; } }
  function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; } }

  try { const v = expr(); return i === toks.length ? v : null; } catch { return null; }
}
