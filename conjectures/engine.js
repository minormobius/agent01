/* ─────────────────────────────────────────────────────────────────────
   The Conjecture Machine — a deterministic, seeded generator of synthetic
   open problems, plus a "solvability oracle" that estimates how long each
   would resist a proof (the same difficulty rubric the curated index uses).

   Borges-style: a seed → one conjecture, forever the same on any machine, so a
   URL (?seed=…) is a permalink. NO Date.now()/Math.random() in here — that would
   break determinism. The random *button* on the page rolls a new seed; the
   engine itself is pure. Attaches to globalThis so it unit-tests in plain node
   (see engine.selftest.mjs — run it before touching this file).

   IMPORTANT: the output is FICTION. Generated statements are frequently false,
   trivial, or ill-posed — that is the joke (a Library of Babel of conjectures).
   The oracle scores the *shape* of the statement as if it were a real conjecture;
   it does not check truth. Names are invented; resemblance to real work is chance.
   ───────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  // ── PRNG: xmur3 (string→seed) + mulberry32 (seed→stream) ──────────────
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeHelpers(seed) {
    const s = xmur3(String(seed));
    const rand = mulberry32(s());
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const chance = (p) => rand() < p;
    const some = (a, k) => { const c = a.slice(); const out = []; for (let i = 0; i < k && c.length; i++) out.push(c.splice(Math.floor(rand() * c.length), 1)[0]); return out; };
    return { rand, pick, int, chance, some };
  }

  // ── invented surnames (clearly synthetic — not real people) ───────────
  const ON = ['Br', 'K', 'V', 'Str', 'Zar', 'Mor', 'Fen', 'Kol', 'Ash', 'Dre', 'Grim', 'Hal', 'Vor', 'Sel',
    'Tan', 'Corv', 'Mel', 'Rho', 'Sib', 'Ott', 'Bax', 'Vane', 'Quil', 'Feld', 'Marr', 'Oll', 'Roth', 'Sza', 'Wen', 'Yar', 'Emp', 'Nasc'];
  const NU = ['a', 'e', 'i', 'o', 'au', 'ei', 'y', 'ou', 'ae'];
  const CO = ['n', 'r', 'th', 'ke', 'sk', 'ns', 'ld', 'man', 'ov', 'ez', 'ard', 'ini', 'ström', 'wicz', 'escu', 'ault'];
  function surname(h) {
    let n = h.pick(ON) + h.pick(NU);
    if (h.chance(0.55)) n += h.pick(CO.filter(c => c.length <= 2)) + h.pick(NU);
    n += h.pick(CO);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  const ADJ = ['Iterated', 'Twisted', 'Lonely', 'Silent', 'Radiant', 'Fractured', 'Sparse', 'Vanishing', 'Recursive',
    'Hidden', 'Persistent', 'Ghostly', 'Gilded', 'Bounded', 'Wandering', 'Inverted', 'Nested', 'Orphaned', 'Luminous',
    'Stubborn', 'Crooked', 'Eternal', 'Forbidden', 'Woven', 'Pale', 'Restless', 'Unruly', 'Quiet'];
  const NOUN = ['Sieve', 'Orbit', 'Lattice', 'Cascade', 'Reflection', 'Ledger', 'Remainder', 'Partition', 'Descent',
    'Residue', 'Threshold', 'Constellation', 'Interval', 'Cover', 'Packing', 'Spectrum', 'Divisor', 'Cycle', 'Frontier',
    'Quotient', 'Manifold', 'Boundary', 'Tessellation', 'Recurrence', 'Meridian', 'Chorus', 'Aperture'];
  function makeName(h) {
    if (h.chance(0.45)) return surname(h) + '’s ' + h.pick(['conjecture', 'conjecture', 'hypothesis', 'problem']);
    return 'The ' + h.pick(ADJ) + ' ' + h.pick(NOUN) + ' ' + h.pick(['Conjecture', 'Conjecture', 'Problem', 'Hypothesis']);
  }
  const BIG = ['10^9', '10^12', '10^15', '2^64', '10^18', '10^40', '10^100'];
  function largestDigit(n) { n = Math.abs(n); let m = 0; while (n) { m = Math.max(m, n % 10); n = Math.floor(n / 10); } return m; }
  const M = () => root.CONJMATH; // reality.js — loaded before this file

  // ── domain packs: each build() returns a synthetic conjecture skeleton ─
  // features drive the oracle. Packs marked checkable:true carry an executable
  // `check` spec that reality.js can actually run to refute/classify them.
  const PACKS = [
    { key: 'iteration', field: 'Number theory', weight: 1.0, checkable: true, build(h) {
      const cm = M();
      const floor = h.chance(0.3);
      const evenProse = floor ? '⌊n/2⌋' : 'n/2';
      const mode = h.pick(['lin', 'lin', 'digit', 'rev']);
      let oddProse, oddFn;
      if (mode === 'lin') { const k = h.pick([3, 3, 5, 7]); const c = h.pick([1, 1, 5, 7, -1]); oddProse = `${k}n${c < 0 ? ' − ' + (-c) : ' + ' + c}`; oddFn = (n) => k * n + c; }
      else if (mode === 'digit') { oddProse = 'n plus its largest digit'; oddFn = (n) => n + largestDigit(n); }
      else { oddProse = 'the digit-reversal of n added to n'; oddFn = (n) => n + cm.reverseDigits(n); }
      const step = (n) => (n % 2 === 0) ? (floor ? Math.floor(n / 2) : n / 2) : oddFn(n);
      return {
        statement: `Iterating T(n) = ${evenProse} when n is even and ${oddProse} when n is odd, from any positive integer, eventually reaches 1.`,
        form: `∀ n ≥ 1, ∃ k ≥ 0 : Tᵏ(n) = 1`,
        quantifier: 'forall', disproof: 'counterexample-hard', domain: 'iteration',
        counterexample: 'A single starting value whose orbit diverges or enters a cycle avoiding 1.',
        features: { domain: 'iteration', quant: 'forall', disproof: 'counterexample-hard', elementary: true, checkable: false, undecidableFlavor: true, graft: false },
        tags: ['iteration', 'dynamics', 'arithmetic'],
        check: { kind: 'iteration', step, budget: 4000, stepCap: 3000, ceil: 1e12 },
      };
    } },
    { key: 'primes', field: 'Number theory', weight: 1.0, checkable: true, build(h) {
      const cm = M();
      const deg = h.pick([1, 2, 2, 3]);
      let coeffs;
      if (deg === 1) coeffs = [h.int(-5, 9), h.pick([1, 1, 2, 3, 6])];
      else if (deg === 2) coeffs = [h.int(-4, 9), h.int(-3, 4), 1];
      else coeffs = [h.int(-4, 7), h.int(-3, 3), h.int(-1, 2), 1];
      const ps = cm.polyString(coeffs);
      return {
        statement: `There are infinitely many primes of the form ${ps}.`,
        form: `|{ n ≥ 1 : ${ps} is prime }| = ∞`,
        quantifier: 'exists', disproof: 'existence', domain: 'primes',
        counterexample: `A proof that only finitely many n make ${ps} prime.`,
        features: { domain: 'primes', quant: 'exists', disproof: 'existence', elementary: true, checkable: false, undecidableFlavor: false, graft: false },
        tags: ['primes', 'existence'],
        check: { kind: 'prime-form', coeffs },
      };
    } },
    { key: 'diophantine', field: 'Number theory', weight: 1.0, checkable: true, build(h) {
      const cm = M();
      const F = h.pick(cm.FUNCS);
      const tmpl = h.pick(['prop', 'prop', 'compare', 'coprime']);
      const N = h.int(2, 40);
      if (tmpl === 'prop') {
        const prop = h.pick(cm.PROPS);
        const negated = h.chance(0.6);
        const col = cm.propCollapse(F.type, prop.key);
        let collapse = null;
        if (negated && col === 'never') collapse = { status: 'trivial-true', reason: `${F.prose} is always of a kind that cannot be ${prop.prose}, so the claim holds for a trivial reason.` };
        if (negated && col === 'always') collapse = { status: 'trivial-false', reason: `${F.prose} is always ${prop.prose}, so the claim fails at once.` };
        if (!negated && col === 'always') collapse = { status: 'trivial-true', reason: `${F.prose} is ${prop.prose} by its very structure.` };
        if (!negated && col === 'never') collapse = { status: 'trivial-false', reason: `${F.prose} is never ${prop.prose}.` };
        const predicate = negated ? (n) => !prop.test(F.fn(n)) : (n) => prop.test(F.fn(n));
        return {
          statement: `For every integer n > ${N}, ${F.prose} ${F.sym} is ${negated ? 'never ' : ''}${prop.prose}.`,
          form: `∀ n > ${N} : ${F.sym} ${negated ? 'is not' : 'is'} ${prop.prose}`,
          quantifier: 'forall', disproof: 'counterexample', domain: 'digits',
          counterexample: `A single n > ${N} where ${F.sym} ${negated ? 'is' : 'is not'} ${prop.prose}.`,
          features: { domain: 'digits', quant: 'forall', disproof: 'counterexample', elementary: true, checkable: true, undecidableFlavor: false, graft: false },
          tags: ['arithmetic-functions'],
          check: { kind: 'forall-int', from: N + 1, budget: 20000, predicate, collapse, describe: (n) => `${F.sym} = ${F.fn(n)}` },
        };
      }
      if (tmpl === 'compare') {
        const G = h.pick(cm.FUNCS.filter((g) => g.sym !== F.sym));
        const lt = h.chance(0.5);
        const predicate = lt ? (n) => F.fn(n) < G.fn(n) : (n) => F.fn(n) > G.fn(n);
        return {
          statement: `For every integer n > ${N}, ${F.prose} ${F.sym} ${lt ? 'is less than' : 'exceeds'} ${G.prose} ${G.sym}.`,
          form: `∀ n > ${N} : ${F.sym} ${lt ? '<' : '>'} ${G.sym}`,
          quantifier: 'forall', disproof: 'counterexample', domain: 'digits',
          counterexample: `A single n > ${N} with ${F.sym} ${lt ? '≥' : '≤'} ${G.sym}.`,
          features: { domain: 'digits', quant: 'forall', disproof: 'counterexample', elementary: true, checkable: true, undecidableFlavor: false, graft: false },
          tags: ['arithmetic-functions'],
          check: { kind: 'forall-int', from: N + 1, budget: 20000, predicate, describe: (n) => `${F.sym} = ${F.fn(n)}, ${G.sym} = ${G.fn(n)}` },
        };
      }
      const predicate = (n) => cm.gcd(F.fn(n), n + 1) === 1;
      return {
        statement: `For every integer n > ${N}, ${F.prose} ${F.sym} is coprime to n+1.`,
        form: `∀ n > ${N} : gcd(${F.sym}, n+1) = 1`,
        quantifier: 'forall', disproof: 'counterexample', domain: 'digits',
        counterexample: `A single n > ${N} with gcd(${F.sym}, n+1) > 1.`,
        features: { domain: 'digits', quant: 'forall', disproof: 'counterexample', elementary: true, checkable: true, undecidableFlavor: false, graft: false },
        tags: ['arithmetic-functions'],
        check: { kind: 'forall-int', from: N + 1, budget: 20000, predicate, describe: (n) => `${F.sym} = ${F.fn(n)}, n+1 = ${n + 1}` },
      };
    } },
    { key: 'graph', field: h => h.chance(0.5) ? 'Graph theory' : 'Combinatorics', weight: 1.1, build(h) {
      const cls = h.pick(['3-connected cubic planar graph', 'triangle-free graph', 'tournament', `bipartite graph of minimum degree ${h.int(3, 9)}`,
        'planar triangulation', 'vertex-transitive graph', `${h.int(4, 8)}-regular graph`, 'claw-free graph']);
      const concl = h.pick(['is Hamiltonian', `is ${h.int(3, 7)}-colourable`, `contains ${h.int(2, 5)} vertex-disjoint cycles`,
        'has a spanning tree with no vertex of degree 2', 'admits a nowhere-zero 5-flow', 'has an antimagic labelling',
        'contains a cycle whose length is a power of two']);
      const graft = h.chance(0.25);
      return {
        field: 'Graph theory',
        statement: `Every ${cls}${graft ? ' with an even number of vertices' : ''} ${concl}.`,
        form: `∀ G ∈ {${cls}} : G ${concl}`,
        quantifier: 'forall', disproof: 'counterexample', domain: 'graph',
        counterexample: `A single ${cls} for which the conclusion fails.`,
        features: { domain: 'graph', quant: 'forall', disproof: 'counterexample', elementary: false, checkable: true, undecidableFlavor: false, graft },
        tags: ['graphs', 'extremal'],
      };
    } },
    { key: 'packing', field: 'Geometry', weight: 0.9, build(h) {
      const bodies = h.pick(['convex bodies', 'centrally symmetric convex bodies', 'lattices', 'star-shaped bodies']);
      const quant = h.pick(['packing density', 'surface area per unit volume', 'the volume of body times polar', 'covering density']);
      const d = h.int(3, 12);
      const shape = h.chance(0.5)
        ? `the smoothed ${h.pick(['heptagon', 'nonagon', 'octagon', 'hendecagon'])}`
        : `the truncated ${h.pick(['octahedron', 'icosahedron', 'simplex', 'cuboctahedron'])}`;
      const dir = h.pick(['minimizing', 'maximizing']);
      return {
        statement: `Among all ${bodies} in dimension ${d}, the one ${dir} ${quant} is ${shape}.`,
        form: `argmin/max over ${bodies} in ℝ^${d} of (${quant}) = ${shape}`,
        quantifier: 'forall', disproof: 'counterexample', domain: 'packing',
        counterexample: `A member of that family in dimension ${d} that beats ${shape}.`,
        features: { domain: 'packing', quant: 'forall', disproof: 'counterexample', elementary: false, checkable: false, undecidableFlavor: false, graft: false },
        tags: ['packing', 'convexity', 'optimization'],
      };
    } },
    { key: 'inequality', field: 'Analysis & dynamics', weight: 0.9, build(h) {
      const cls = h.pick(['functions on the sphere Sⁿ⁻¹', 'L² functions on ℝⁿ', 'polynomials with all roots in the unit disk', 'Reeb flows on a contact manifold']);
      const op = h.pick(['the extension operator', 'the maximal function', 'the numerical range', 'the Bochner–Riesz mean']);
      const C = h.chance(0.5) ? `${h.int(2, 4)}` : `√${h.int(2, 6)}`;
      return {
        statement: `For every one of the ${cls}, the norm of ${op} is at most ${C} times the natural bound, and the constant ${C} is sharp.`,
        form: `∀ f : ‖${op.replace('the ', '')} f‖ ≤ ${C} · (natural bound), ${C} sharp`,
        quantifier: 'forall', disproof: 'counterexample-hard', domain: 'inequality',
        counterexample: `A single function among the ${cls} that violates the constant ${C}.`,
        features: { domain: 'inequality', quant: 'forall', disproof: 'counterexample-hard', elementary: false, checkable: false, undecidableFlavor: false, graft: h.chance(0.2) },
        tags: ['harmonic-analysis', 'sharp-constant'],
      };
    } },
    { key: 'decision', field: h => h.chance(0.5) ? 'Logic' : 'Theoretical CS', weight: 0.7, build(h) {
      const obj = h.pick([`a system of ${h.int(2, 5)} polynomial equations over ℤ`, 'a finitely presented group', 'an integer linear recurrence',
        `a ${h.int(3, 6)}-state cellular automaton`, 'a rational map on the projective line']);
      const prop = h.pick(['has a solution', 'is trivial', 'ever reaches zero', 'has a bounded orbit', 'is eventually periodic']);
      return {
        field: h.chance(0.5) ? 'Logic' : 'Theoretical CS',
        statement: `There is an algorithm that decides, given ${obj}, whether it ${prop}.`,
        form: `∃ algorithm A : A(⟨${obj.split(' ').slice(0, 3).join(' ')}…⟩) decides "${prop}"`,
        quantifier: 'exists-algorithm', disproof: 'other', domain: 'decision',
        counterexample: 'A proof that the decision problem is undecidable (no algorithm can exist).',
        features: { domain: 'decision', quant: 'exists-algorithm', disproof: 'other', elementary: false, checkable: false, undecidableFlavor: true, graft: false },
        tags: ['decidability', 'computability'],
      };
    } },
  ];

  function weightedPick(h, filter) {
    const pool = filter ? PACKS.filter(filter) : PACKS;
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = h.rand() * total;
    for (const p of pool) { if ((r -= p.weight) <= 0) return p; }
    return pool[pool.length - 1];
  }

  // ── the solvability oracle ────────────────────────────────────────────
  const DOMAIN_F = {
    iteration:   { d: 34, note: 'iterating an arithmetic map mixes + and × unpredictably — the Collatz curse' },
    primes:      { d: 26, note: 'the fine distribution of primes resists sieves at exactly the last step (the parity barrier)' },
    diophantine: { d: 22, note: 'a lone Diophantine constraint can hide arbitrarily large solutions' },
    digits:      { d: 17, note: 'base-dependent digit dynamics have almost no analytic theory' },
    graph:       { d: 3,  note: 'a single finite graph could settle it — searchable, so the oracle is wary of calling it deep' },
    packing:     { d: 13, note: 'optimality over all shapes needs a matching lower bound, always the hard half' },
    inequality:  { d: 19, note: 'sharp constants sit behind restriction/Kakeya-grade harmonic analysis' },
    decision:    { d: 21, note: 'deciding a property in full generality flirts with undecidability' },
  };
  const QUANT_F = {
    forall:            { d: 2,  note: 'a plain universal claim — the classic counterexample hunt' },
    exists:            { d: 9,  note: 'an existence claim can’t be settled by stumbling on a counterexample' },
    'forall-exists':   { d: 13, note: 'quantifier alternation compounds the difficulty' },
    asymptotic:        { d: 6,  note: 'an asymptotic law is refuted only by controlling a whole tail' },
    'exists-algorithm':{ d: 8,  note: 'asserting a decision procedure exists is an all-or-nothing claim' },
  };
  const REF_F = {
    counterexample:        { d: -7, note: 'a single explicit counterexample would end it — vulnerable to a lucky search' },
    'counterexample-hard': { d: 4,  note: 'a counter-object exists in principle, but exhibiting or certifying one is itself deep' },
    existence:             { d: 8,  note: 'it asserts something exists; no search can trip over a refutation' },
    other:                 { d: 5,  note: 'refutation would take an unusual, indirect form' },
  };
  function tierOf(s) {
    if (s >= 85) return 'almost certainly still open';
    if (s >= 65) return 'likely still open';
    if (s >= 45) return 'toss-up';
    if (s >= 25) return 'likely resolved by then';
    return 'expected to fall soon';
  }
  function estimateSolvability(f, h) {
    const factors = [];
    const base = 46;
    factors.push({ label: 'baseline', delta: 0, note: 'every well-posed conjecture starts near a coin flip' });
    const D = DOMAIN_F[f.domain] || { d: 8, note: 'unclassified domain' };
    factors.push({ label: 'domain · ' + f.domain, delta: D.d, note: D.note });
    const Q = QUANT_F[f.quant] || { d: 4, note: 'quantifier structure' };
    factors.push({ label: 'quantifier · ' + f.quant, delta: Q.d, note: Q.note });
    const R = REF_F[f.disproof] || { d: 0, note: '' };
    factors.push({ label: 'refutation · ' + f.disproof, delta: R.d, note: R.note });
    if (f.elementary) factors.push({ label: 'elementary statement', delta: 9, note: 'trivial to state, which historically correlates with brutal to prove' });
    if (f.checkable) factors.push({ label: 'finite witness', delta: -11, note: 'instances are finitely checkable; a computer or one hard case can crack it' });
    if (f.undecidableFlavor) factors.push({ label: 'undecidable texture', delta: 7, note: 'the underlying predicate resembles known undecidable problems' });
    if (f.graft) factors.push({ label: 'cross-domain graft', delta: 5, note: 'the machine spliced two areas; hybrids rarely have a ready-made toolkit' });
    const j = h.int(-7, 7);
    factors.push({ label: 'seeded temperament', delta: j, note: 'the irreducible luck of which idea a generation happens to land on' });
    const raw = base + factors.reduce((s, x) => s + x.delta, 0);
    const score = Math.max(5, Math.min(97, Math.round(raw)));
    return { base, factors, raw, score, clamped: raw !== score, tier: tierOf(score), note: synthNote(score, factors) };
  }
  function synthNote(score, factors) {
    const top = factors.filter(x => x.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const lead = score >= 85 ? 'The oracle files this under “ask again in a century.”'
      : score >= 65 ? 'The oracle expects this one to outlive us.'
      : score >= 45 ? 'The oracle calls it a genuine toss-up.'
      : score >= 25 ? 'The oracle bets it falls within a few decades.'
      : 'The oracle thinks a sharp student could end this by Friday.';
    return top ? `${lead} Chief obstacle: ${top.note}.` : lead;
  }

  // ── top-level: seed → whole synthetic conjecture ──────────────────────
  function generateConjecture(seed, opts) {
    opts = opts || {};
    const h = makeHelpers(seed);
    const pack = weightedPick(h, opts.checkableOnly ? (p) => p.checkable : null);
    const built = pack.build(h);
    const field = built.field || (typeof pack.field === 'function' ? pack.field(h) : pack.field);
    const name = makeName(h);
    const solv = estimateSolvability(built.features, h);
    return {
      seed: String(seed),
      id: 'gen-' + String(seed),
      synthetic: true,
      pack: pack.key,
      checkable: !!pack.checkable,
      field,
      domain: built.domain,
      name,
      statement: built.statement,
      form: built.form,
      quantifier: built.quantifier,
      disproof: built.disproof,
      counterexample: built.counterexample,
      tags: built.tags || [],
      check: built.check || null,
      solvability: solv,
      hardness: solv.score,
      hardnessNote: solv.note,
    };
  }

  root.CONJGEN = {
    generateConjecture,
    estimateSolvability,
    tierOf,
    PACK_KEYS: PACKS.map(p => p.key),
    _internal: { xmur3, mulberry32, makeHelpers },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
