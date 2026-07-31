// presets.js — the programs the gallery ships with.
//
// Imported by the page and by morph.selftest.mjs, which grows every one of them
// on the committed wasm. A preset that stops resolving is therefore a failing
// check rather than an empty canvas someone finds later.
//
// The first block is straight digital logic — the language was built for
// adders, and they still work. The second is what happens when you point the
// same recursion at shape instead of arithmetic: rings, tubes, branching trees.
// Mordvintsev's article calls that section "Kunstformen", after Haeckel, and
// the resemblance is the whole reason this toy exists.

/**
 * @typedef {{name: string, blurb: string, src: string, vary: (r: Roll) => number[],
 *            grow?: number, size?: number, link?: number}} Preset
 * `grow` is cells per frame; `size` scales the node glow; `link` is the spring
 * rest length. They exist because a 40-row triangle and a 4000-gate medusa do
 * not want the same pacing or the same density.
 *
 * `vary` is what a reroll changes: the arguments to `grow`, drawn fresh. It is
 * a function rather than a table of ranges because the interesting programs
 * have constraints between their arguments — an adder's two operands must be
 * the same width, a multiplexer's data bus wants to be a whole number of words
 * — and a table cannot say that.
 */

/** @type {Preset[]} */
export const PRESETS = [
  {
    name: 'triangle',
  vary: (r) => [r.int(14, 54)],
    blurb: 'tail recursion · each row one wire shorter',
    grow: 1.2,
    size: 1.6,
    src: `# Tail recursion. Each row pairs adjacent wires, so it comes out one
# wire shorter than the row before, and the recursion stops when a single
# wire is left and x[1:] is empty.

gate NOT 1
gate XOR 2

cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    z = NOT(y)
    return triangle(z)
}

grow triangle(40)
`,
  },
  {
    name: 'chain',
  vary: (r) => [r.int(16, 64), r.int(8, 32)],
    blurb: 'parallel strands · recursion on length, not on data',
    grow: 1.5,
    size: 1.6,
    link: 1.4,
    src: `# The data bus is never divided here — n is, and n only controls how
# many times the cell re-enters itself. So the width of x sets how many
# strands you get and the width of n sets how long they are.

gate NOT 1

cell chain(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}

grow chain(48, 24)
`,
  },
  {
    name: 'relay · feedback',
  vary: (r) => [r.int(8, 26), r.int(8, 24)],
    blurb: 'a loop that keeps going with the driver switched off',
    grow: 1.5,
    size: 1.5,
    src: `# The only cell here that is not feedforward. \`wire\` declares a bus
# whose driver comes later in the body — the language's one forward
# reference, and the only way to close a loop.
#
# What that buys: the graph stops being a DAG, so a pulse can come back
# round instead of sweeping off the end and dying. Turn "waves in flight"
# down to zero and this keeps running on its own. Its rhythm is the length
# of the loop, so lengthening the delay line slows it down.
#
# It only sustains while a single input can trigger a gate. Push the
# threshold above ~0.62 and the loop dies at the first link — that is a
# real boundary, not a taste setting.

gate NOT 1
gate AND 2
gate XOR 2

cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}

cell chain(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}

cell relay(x, n) {
    wire fb ~ x            # as wide as x, driven below
    y = XOR(x, fb)
    r = ring(y)            # couple the lanes so waves can also travel sideways
    d = chain(r, n)        # the delay line sets the period
    fb = NOT(d)            # …and this closes the loop
    return d
}

grow relay(16, 16)
`,
  },
  {
    name: 'grid',
  vary: (r) => [r.int(10, 30), r.int(10, 30)],
    blurb: 'binary recursion on two axes · a systolic mesh',
    grow: 2,
    size: 1.5,
    src: `# One cell divides along one axis, then swaps its buses so the next
# level divides the other. Recursion on two axes at once gives a regular
# mesh — the shape of a systolic array.

gate XOR 2

cell grid_base(x, y) {
    z = XOR(x, y)
    return z, z
}

cell grid_split(x, y) {
    x0, x1 = SPLIT(x)
    ym, x0o = grid(y, x0)
    yo, x1o = grid(ym, x1)
    xo = CAT(x0o, x1o)
    return xo, yo
}

cell grid_1d(x, y) fallback grid_base {
    yo, xo = grid_split(y, x)
    return xo, yo
}

cell grid(x, y) fallback grid_1d {
    a, b = grid_split(x, y)
    return a, b
}

grow grid(24, 24)
`,
  },
  {
    name: 'tube',
  vary: (r) => [r.int(16, 52), r.int(6, 22)],
    blurb: 'cascaded rings · a cylindrical mesh',
    grow: 2,
    size: 1.3,
    src: `# Rings stacked by recursion on the length bus rather than the data bus:
# n controls how many closures deep the cylinder goes.

gate AND 2

cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}

cell tube(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    y = tube(x, n0)
    z = ring(y)
    return tube(z, n1)
}

grow tube(40, 16)
`,
  },
  {
    name: 'tree',
  vary: (r) => [r.int(12, 36), r.int(4, 10)],
    blurb: 'grow a segment, split it, branch · recursively',
    grow: 3,
    size: 1.2,
    src: `# Grow a cylindrical segment, split its outputs, and branch. The two
# halves recurse independently, so the whole thing is one rule applied at
# every scale.

gate AND 2
gate NOT 1

cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}

cell tube(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    y = tube(x, n0)
    z = ring(y)
    return tube(z, n1)
}

cell chain(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}

cell tree(x, n) fallback chain {
    y = tube(x, n)
    y0, y1 = SPLIT(y)
    return CAT(tree(y0, n), tree(y1, n))
}

grow tree(32, 8)
`,
  },
  {
    name: 'medusa',
  vary: (r) => [r.int(12, 30), r.int(4, 8)],
    blurb: 'tree, tube and chain in series · Haeckel by accident',
    grow: 5,
    size: 1,
    src: `# Compose the three building blocks in series and the layout comes out
# looking like a plate from Haeckel's Kunstformen der Natur. Nothing here
# is trying to draw a jellyfish; it falls out of recursive division.

gate AND 2
gate NOT 1

cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}

cell tube(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    y = tube(x, n0)
    z = ring(y)
    return tube(z, n1)
}

cell chain(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}

cell tree(x, n) fallback chain {
    y = tube(x, n)
    y0, y1 = SPLIT(y)
    return CAT(tree(y0, n), tree(y1, n))
}

cell half(x, n) {
    a = tree(x, n)
    b = tube(a, n)
    return chain(b, n)
}

cell medusa(x, n) {
    a = half(x, n)
    b = half(x, n)
    return a, b
}

grow medusa(24, 6)
`,
  },
  {
    name: 'ripple adder',
  vary: (r) => { const n = r.int(8, 48); return [n, n, 1]; },
    blurb: 'divide the operands · the carry chain falls out linear',
    grow: 0.7,
    size: 2,
    src: `# The original target of the language. Split both operands in half,
# solve the low half, hand its carry to the high half. The tree of cell
# divisions produces a linear carry chain — which is exactly why a ripple
# adder is slow.

gate XOR3 3
gate MAJ3 3

cell full_adder(a, b, c) {
    s = XOR3(a, b, c)
    co = MAJ3(a, b, c)
    return s, co
}

cell ripple(a, b, c) fallback full_adder {
    a0, a1 = SPLIT(a)
    b0, b1 = SPLIT(b)
    s0, cm = ripple(a0, b0, c)
    s1, co = ripple(a1, b1, cm)
    s = CAT(s0, s1)
    return s, co
}

grow ripple(32, 32, 1)
`,
  },
  {
    name: 'brent–kung adder',
  vary: (r) => { const n = r.int(8, 48); return [n, n, 1]; },
    blurb: 'a few edits from the ripple · and logarithmic instead of linear',
    grow: 0.9,
    size: 1.8,
    src: `# Compare this with the ripple adder: the division is identical, and
# the only real change is that each half also hands up a propagate and a
# generate signal, so the carry can shortcut. Linear depth becomes
# logarithmic, and the layout stops being a chain and becomes a tree.

gate XOR 2
gate AND 2
gate CARRY 3

cell bk_base(a, b, c) {
    p = XOR(a, b)
    g = AND(a, b)
    s = XOR(p, c)
    return s, p, g
}

cell bk_rec(a, b, cin) fallback bk_base {
    a0, a1 = SPLIT(a)
    b0, b1 = SPLIT(b)
    s0, p0, g0 = bk_rec(a0, b0, cin)
    cm = CARRY(p0, g0, cin)
    s1, p1, g1 = bk_rec(a1, b1, cm)
    s = CAT(s0, s1)
    p = AND(p0, p1)
    g = CARRY(p1, g1, g0)
    return s, p, g
}

cell brent_kung(a, b, c) {
    s, p, g = bk_rec(a, b, c)
    co = CARRY(p, g, c)
    return s, co
}

grow brent_kung(32, 32, 1)
`,
  },
  {
    name: 'barrel shifter',
  vary: (r) => [r.int(16, 48), r.int(3, 6), 1],
    blurb: 'linear tail recursion · one stage per power of two',
    grow: 0.8,
    size: 1.8,
    src: `# Not binary division this time but a linear cascade: stage k either
# shifts by 2^k or does not, selected by one bit of s. The recursion stops
# by itself once the shift exceeds the bus, which is why extra select bits
# cost nothing — the same reason real CPUs ignore them.

gate MUX2 3

cell right_shifter(x, s, pad) fallback %0 {
    drop, rest = LSLICE(x, pad)
    stop = rest[0]
    shifted = CAT(rest, pad)
    bit, srest = LSLICE(s, ONE)
    y = MUX2(x, shifted, bit)
    pad2 = CAT(pad, pad)
    return right_shifter(y, srest, pad2)
}

grow right_shifter(32, 5, 1)
`,
  },
  {
    name: 'mux tree',
  vary: (r) => { const s = r.int(2, 4); return [32 * (1 << s), s]; },
    blurb: 'one rule that selects a bit or a whole word',
    grow: 0.8,
    size: 1.8,
    src: `# Slice one select bit, halve the data, recurse on both halves, and
# choose. Because the widths are inferred, the very same cell that picks
# one bit out of eight picks one 32-bit word out of eight — 256 wires in,
# 32 out, no change to the code.

gate MUX2 3

cell mux(x, sel) fallback %0 {
    rest, hi = HSLICE(sel, ONE)
    x0, x1 = SPLIT(x)
    y0 = mux(x0, rest)
    y1 = mux(x1, rest)
    return MUX2(y0, y1, hi)
}

grow mux(256, 3)
`,
  },
];

/**
 * A tiny seeded generator, so a roll can be reproduced from its seed.
 * mulberry32, same as the engine's.
 */
export function roller(seed) {
  let a = seed >>> 0 || 1;
  const unit = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Discard the first few draws. mulberry32's opening output varies smoothly
  // with its seed, so without this two rolls a moment apart — or any two
  // adjacent seeds — come out suspiciously similar.
  unit();
  unit();
  unit();
  return {
    unit,
    int: (lo, hi) => lo + Math.floor(unit() * (hi - lo + 1)),
    /** A multiplier around 1, for nudging a knob without leaving the species. */
    near: (spread) => 1 + (unit() * 2 - 1) * spread,
  };
}

/**
 * One individual of a species: the same program, grown at different sizes.
 *
 * Only the `grow` line is rewritten. Changing the cell bodies would be a
 * different organism, not another of the same kind — the whole point of a roll
 * is to see the range a single set of rules covers.
 */
export function rollSource(preset, seed) {
  if (typeof preset.vary !== 'function') return { src: preset.src, label: '' };
  const args = preset.vary(roller(seed));
  let label = '';
  const src = preset.src.replace(/^grow\s+(\w+)\s*\(([^)]*)\)/m, (_, name) => {
    label = `${name}(${args.join(', ')})`;
    return `grow ${label}`;
  });
  return { src, label };
}

/** Look a preset up by name. */
export function preset(name) {
  return PRESETS.find((p) => p.name === name) || PRESETS[0];
}
