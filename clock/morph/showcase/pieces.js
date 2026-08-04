// pieces.js — the showcase compositions.
//
// These are not presets. A preset is a single rule shown plainly; a piece here
// composes several of them and is chosen because the *combination* does
// something none of the parts does alone — sustains itself, beats against
// itself, prunes itself, or simply comes out looking like something.
//
// Every piece carries the settings it wants, because most of them do not work
// at the defaults: erosion needs the threshold above the per-wire charge before
// anything can starve, the polyrhythm needs the driver switched off before you
// can hear that it is keeping its own time. Shipping a composition without its
// settings is shipping a composition that does not work.
//
// Grown by showcase.selftest.mjs on the committed wasm, so a piece that stops
// resolving is a failing check rather than a blank canvas in a gallery.

/**
 * @typedef {{name, sub, notes: string[], src: string,
 *            settings: Record<string, number>}} Piece
 * `settings` keys match the control ids on the toy: waves, threshold, leak,
 * starve, tick, grow, size, glow, bright.
 */

const CHAIN = `cell chain(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}`;

const RING = `cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}`;

const TUBE = `cell tube(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    y = tube(x, n0)
    z = ring(y)
    return tube(z, n1)
}`;

/** @type {Piece[]} */
export const PIECES = [
  {
    name: 'polyrhythm',
    sub: 'twenty rings, four lengths, no clock',
    notes: [
      'Four feedback voices with delay lines of 4, 7, 11 and 18 — and nothing else. No tempo is written down anywhere.',
      'You are looking at twenty rings, not four, and that is the language showing its hand: each voice is handed a five-wire bus, `XOR` and `NOT` are per-wire, so every wire closes a loop of its own. Four lengths, five copies each, 220 gates.',
      'A wave circulating a ring of L cells comes round every L ticks, so each size keeps its own time — and because 5, 8, 12 and 19 share no factors, the four sizes only agree every few thousand ticks.',
      'Turn the sound on and the driver off — waves in flight to zero. It keeps going, and what you are listening to is four numbers.',
    ],
    settings: { waves: 0, tick: 0.5, grow: 1, size: 2.2, glow: 0.6, bright: 1.0 },
    src: `# Four lengths. The only thing that differs between the voices is the
# number at the end of the line, and that number sets the period: a wave
# takes one tick per cell to come round a ring of chain(n) + 2 gates.
#
# The bus is five wires wide and every gate here is per-wire, so each
# voice is five independent rings — twenty on screen, four sizes.
#
# Switch the driver off (waves in flight → 0) and it keeps its own time.

gate NOT 1
gate XOR 2

${CHAIN}

cell voice(x, n) {
    wire fb ~ x            # the forward reference that closes the loop
    y = XOR(x, fb)
    d = chain(y, n)        # this delay line is the tempo
    fb = NOT(d)
    return d
}

cell quartet(x, a, b, c, d) {
    p = voice(x, a)
    q = voice(x, b)
    r = voice(x, c)
    s = voice(x, d)
    return CAT(CAT(p, q), CAT(r, s))
}

grow quartet(5, 4, 7, 11, 18)
`,
  },
  {
    name: 'anemone',
    sub: 'a branching crown that feeds itself',
    notes: [
      'A tree — tubes splitting into tubes — with its own tips gathered back and returned to the stem. The crown drives the stem that grew it.',
      'Feedforward, this is the medusa: it flowers once and goes quiet. Closing one wire from the tips to the base turns the whole thing into an oscillator whose period is the height of the tree.',
      'The gather is `AND` over the two halves of the crown, so the loop only fires when both sides do. The branches have to agree before the stem hears anything.',
      'Shipped with starvation on, which is what stops it settling: branches that fall quiet are removed and lineages that lose everything divide again, so the crown keeps being rebuilt into something slightly different. Measured, that took it from a piece that repeats to one that never does — and its depth now wanders by about 7 levels, which moves every pitch in it.',
    ],
    settings: { waves: 1.4, threshold: 0.9, starve: 2, tick: 0.7, grow: 2, size: 1.4, glow: 0.5, bright: 0.9 },
    src: `# A tree that feeds itself. Everything below the last cell is the
# ordinary branching structure; the last cell is what makes it alive.
#
# AND on the gather means both halves of the crown must fire before the
# stem hears anything — the branches have to agree.

gate NOT 1
gate AND 2
gate XOR 2

${RING}

${TUBE}

${CHAIN}

cell tree(x, n) fallback %0 {
    y = tube(x, n)
    y0, y1 = SPLIT(y)
    return CAT(tree(y0, n), tree(y1, n))
}

cell anemone(x, n) {
    wire fb ~ x
    stem = XOR(x, fb)
    crown = tree(stem, n)
    a, b = SPLIT(crown)
    half = AND(a, b)               # the two halves must agree
    gathered = CAT(half, half)
    fb = chain(gathered, n)        # …and the crown drives the stem
    return crown
}

grow anemone(8, 6)
`,
  },
  {
    name: 'erosion',
    sub: 'grows, is pruned to what conducts, regrows',
    notes: [
      'Three ripple adders in series: a carry chain 120 gates deep, which is about as long a single-driver path as this language will build.',
      'The threshold is set above the per-wire charge, so one input is no longer enough to fire a gate — and a carry chain is single drivers all the way down. Past the first stage nothing conducts.',
      'With starvation armed, what cannot conduct does not survive. Watch the far end wither, then watch lineages that lost every descendant divide again. It never settles and it never runs out: deaths and regrowths climb forever while the cell count holds.',
      'This is the only piece here where the structure you end up looking at is not the structure that was grown — and by a long way the one that keeps changing most. Its depth swings by about 25 levels as limbs come and go, and since depth is what sets pitch, the whole piece slowly retunes itself.',
      'It needs a fast driver — the surviving stage has to keep firing often enough for the engine to measure the structure\'s rhythm, and starvation is scaled against that.',
    ],
    settings: { waves: 4, threshold: 1.15, starve: 1.5, tick: 1.4, grow: 3, size: 1.8, glow: 0.5, bright: 0.9 },
    src: `# Three adders in series — a carry chain 120 gates deep.
#
# The threshold is above the per-wire charge, so a gate needs two inputs
# arriving together, and a carry chain has only ever one. Everything past
# the first stage stops conducting, and starvation removes what does not
# conduct. Lineages that lose every descendant divide again.

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

cell bank(a, b, c) {
    s1, c1 = ripple(a, b, c)
    s2, c2 = ripple(s1, b, c1)
    s3, c3 = ripple(s2, b, c2)
    return s3, c3
}

grow bank(40, 40, 1)
`,
  },
  {
    name: 'cathedral',
    sub: 'a tree of tubes, closed and grown through again',
    notes: [
      'Tree, then a ring across everything it produced, then a tube, then another tree. Each stage takes the whole width of the last, so the branching happens twice at different scales.',
      'The ring in the middle is what makes it hold together: without it the two trees are independent and it reads as two separate objects that happen to share a screen.',
      'Nothing here is recursive in a way the earlier pieces are not. It is only *composed* more deeply — four stages instead of one — and that is enough to change what it looks like entirely.',
      'The one piece here deliberately left as a fixed object. Every setting that gives it structural drift costs it more in variety than it gains, so it is shipped as architecture: grown once, then stood still and played.',
    ],
    settings: { waves: 1.6, tick: 1, grow: 2.5, size: 1.1, glow: 0.4, bright: 0.85 },
    src: `# Four stages, each taking the whole output of the last: branch, close,
# extend, branch again. The ring in the middle is load-bearing — without
# it the two trees never meet and you get two objects, not one.

gate AND 2
gate NOT 1

${RING}

${TUBE}

${CHAIN}

cell tree(x, n) fallback chain {
    y = tube(x, n)
    y0, y1 = SPLIT(y)
    return CAT(tree(y0, n), tree(y1, n))
}

cell vault(x, n) {
    a = tree(x, n)
    b = ring(a)                # close the branches into one body
    c = tube(b, n)
    d = tree(c, n)             # …and branch the whole thing again
    return d
}

grow vault(16, 5)
`,
  },
  {
    name: 'weave',
    sub: 'three meshes, each one fed the other axis of the last',
    notes: [
      'A systolic mesh, then another mesh built from its two outputs with the axes swapped, then a third. Each grid is the same cell; only what is handed to it changes.',
      'The axis swap is the whole trick. `grid(b, a)` after `grid(a, b)` means the second mesh is threaded through the first at right angles, and by the third pass the structure has no clean axis left.',
      'Deepest thing in the showcase at 71 levels, so a wavefront takes a long visible sweep to cross it. Slow the tick speed down and follow one.',
      'The threshold is up and starvation is on, and on this structure that costs nothing: all 972 gates survive, because a mesh is paired drivers everywhere and a mesh is exactly what can conduct at a threshold that kills chains. What it buys is texture. The wall of sound thins to two or three voices at a time, and the depth wanders by 11 levels, so the whole piece drifts in pitch instead of looping.',
    ],
    settings: { waves: 3, threshold: 1.0, starve: 2, tick: 0.6, grow: 3, size: 1.1, glow: 0.4, bright: 0.9 },
    src: `# One mesh, then a second built from the first's outputs with the axes
# swapped, then a third. Same cell each time — only the wiring between
# them changes, and by the third pass there is no clean axis left.

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

cell weave(x, y) {
    a, b = grid(x, y)
    c, d = grid(b, a)          # swap the axes
    e, f = grid(d, c)          # and again
    return CAT(e, f)
}

grow weave(18, 18)
`,
  },
  {
    name: 'carry-save',
    sub: 'eight numbers reduced to two, in constant depth',
    notes: [
      'The unsung circuit behind every multiplier and every matrix unit: a carry-save adder takes three numbers to two without propagating a carry at all, in constant time whatever the width.',
      'Eight operands reduced to two in four levels. Compare the depth here — 4 — against erosion\'s 120 for the same family of gates. That gap is the entire reason this circuit exists.',
      'The shift is the trick: `CAT(ZERO, carry[:-1])` is a carry vector moved up one place, which is what lets the sum and carry be kept apart instead of resolved.',
      'Static by nature and no setting changes that: at depth 4 there is nothing for a wave to erode and nowhere for pitch to wander. It is here to be compared, not to morph.',
    ],
    settings: { waves: 2.4, tick: 1, grow: 1.5, size: 1.9, glow: 0.5, bright: 0.9 },
    src: `# Carry-save addition: three numbers in, two out, and no carry
# propagation anywhere — so the depth does not grow with the width.
#
# Compare this piece's depth against erosion's. Same gates, same job,
# two orders of magnitude apart. That is why this circuit exists.

gate XOR3 3
gate MAJ3 3

cell full_adder(a, b, c) {
    s = XOR3(a, b, c)
    co = MAJ3(a, b, c)
    return s, co
}

cell csa(a, b, c) {
    s, carry = full_adder(a, b, c)
    shifted = CAT(ZERO, carry[:-1])    # the carry moves up one place
    return s, shifted
}

cell reduce4(a, b, c, d) {
    s1, c1 = csa(a, b, c)
    s2, c2 = csa(s1, c1, d)
    return s2, c2
}

cell reduce8(a, b, c, d, e, f, g, h) {
    s1, c1 = reduce4(a, b, c, d)
    s2, c2 = reduce4(e, f, g, h)
    s3, c3 = csa(s1, c1, s2)
    s4, c4 = csa(s3, c3, c2)
    return s4, c4
}

grow reduce8(24, 24, 24, 24, 24, 24, 24, 24)
`,
  },
];
