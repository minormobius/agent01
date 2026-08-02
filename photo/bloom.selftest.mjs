// bloom selftest — run before changing public/bloom/js/:
//   node photo/bloom.selftest.mjs
//
// /bloom grows a web of variations from one seed picture. Two properties carry
// the whole design, and both are the kind that fail silently:
//
//   1. THE ADDRESS IS THE PATH. A node stores nothing — its stack is a fold
//      from the root, seeded by the path. If that stops being deterministic,
//      every shared link quietly points at a different picture and nobody can
//      tell, because a plausible picture still appears.
//   2. NO DEAD BRANCHES. A tile that renders identical to its parent is the
//      worst thing this UI can contain: you click it *because* it looked
//      different. This is measured by rendering, not asserted by reading — the
//      test grows real webs over a real picture and counts.
//
// Both are checked against shop's actual registry, so an effect added there is
// in the explorable space here on the next run, and a change that makes it
// generate duds fails this file.

import {
  RANGE_PAIRS, energise, keyFor, lineage, mulberry32, mutate, parsePath, pathText,
  repairRanges, rngFor, sampleField, sampleParam, saltedKey, stackAt, weights, xmur3,
} from './public/bloom/js/mutate.js';
import {
  TILE, bounds, createTree, edges, expand, hitTest, nodeAt, reroll, revealPath,
} from './public/bloom/js/tree.js';
import {
  MAX_ZOOM, MIN_ZOOM, TAP_SLOP, clampZoom, fitView, panBy, pinchOf, pinchStep,
  toWorld, wheelStep, zoomAround,
} from './public/bloom/js/gesture.js';
import { EFFECTS } from './public/shop/js/core/registry.js';
import { runStack } from './public/shop/js/core/doc.js';
import { makeRGBA } from './public/shop/js/core/pixels.js';

/** A path from plain child indices, at fan variant 0 — the common case.
 *  `P(3, 0, 7)` is `3.0.7`; a rerolled element is written by hand. */
const P = (...ii) => ii.map((i) => ({ i, v: 0 }));

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

/** A picture with structure at several scales — flat colour would make almost
 *  any effect look like a no-op and the dead-branch count meaningless. */
function testImage(W, H) {
  const d = makeRGBA(W, H);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      d[q] = 120 + 90 * Math.sin(x / 6);
      d[q + 1] = 110 + 80 * Math.cos(y / 4.5);
      d[q + 2] = 140 + 70 * Math.sin((x + y) / 9);
      d[q + 3] = 255;
    }
  }
  return d;
}

const W = 56, H = 42;
const SEED = testImage(W, H);
const render = (stack) => {
  const out = new Uint8ClampedArray(SEED);
  runStack(out, W, H, stack, { seed: 'bloom-test' });
  return out;
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ═══════════════════════ 1. determinism ═══════════════════════
{
  const r1 = rngFor('abc'), r2 = rngFor('abc'), r3 = rngFor('abd');
  const a = [r1(), r1(), r1()], b = [r2(), r2(), r2()], c = [r3(), r3(), r3()];
  ok(a.every((v, i) => v === b[i]), 'the same key gives the same stream');
  ok(!a.every((v, i) => v === c[i]), 'a different key gives a different one');
  ok(a.every((v) => v >= 0 && v < 1), 'and it stays in [0,1)');
  ok(typeof xmur3('x')() === 'number' && typeof mulberry32(1)() === 'number', 'both halves are exported');

  eq(JSON.stringify(stackAt('root', P(3, 0, 7))), JSON.stringify(stackAt('root', P(3, 0, 7))),
    'a node folds to the same stack every time');
  ok(JSON.stringify(stackAt('root', P(3, 0, 7))) !== JSON.stringify(stackAt('other', P(3, 0, 7))),
    'a different seed picture grows a different web');
  ok(JSON.stringify(stackAt('root', P(3, 0, 7))) !== JSON.stringify(stackAt('root', P(3, 0, 6))),
    'and siblings are not the same node');

  // The prefix property: a child's lineage IS its parent's, plus one step. This
  // is what makes the rail honest about how a picture was made.
  const steps = lineage('root', P(2, 4, 1));
  eq(steps.length, 3, 'one step per level');
  eq(JSON.stringify(steps[1].stack), JSON.stringify(stackAt('root', P(2, 4))),
    "a child's lineage passes through its parent's exact stack");
  eq(keyFor('r', P(1, 2)), 'r/1.2', 'the key is the path');
  eq(saltedKey('r/1.2', 0), 'r/1.2', 'an unsalted node keeps its plain key');
  eq(saltedKey('r/1.2', 2), 'r/1.2~2', '…and a re-rolled one is distinguishable');

  eq(pathText(parsePath('3.0.7')), '3.0.7', 'a path parses');
  eq(parsePath('').length, 0, 'the empty path is the root');
  eq(pathText(parsePath('junk.-1.2')), '2', 'and rubbish in the address bar is dropped, not trusted');
}

// ═══════════════════════ 2. the parameter sampler ═══════════════════════
{
  const rng = rngFor('params');
  const num = { min: 0, max: 10, step: 0.5, def: 5 };
  for (let i = 0; i < 50; i++) {
    const v = sampleParam(num, rng, 5, 1);
    ok(v >= 0 && v <= 10, `a sampled number stays in range (${v})`);
    ok(Math.abs(v / 0.5 - Math.round(v / 0.5)) < 1e-6, `and on its step (${v})`);
  }
  // A nudge has to move, or "tune" is a no-op that costs a render to discover.
  const enumSpec = { type: 'enum', options: ['a', 'b', 'c'], def: 'a' };
  for (let i = 0; i < 20; i++) ok(sampleParam(enumSpec, rng, 'a', 0.2) !== 'a', 'a nudged enum changes value');
  ok(sampleParam({ type: 'bool', def: false }, rng, false, 0.2) === true, 'a nudged bool flips');
  ok(/^#[0-9a-f]{6}$/.test(sampleParam({ type: 'color', def: '#000000' }, rng, '#000000', 1)),
    'a colour is a colour');
  const curve = { type: 'curve', def: [[0, 0], [1, 1]] };
  eq(sampleParam(curve, rng, curve.def), curve.def, 'a curve is left alone rather than scrambled');

  // THE BUG THIS CAUGHT. lo and hi are a RANGE. Sampled independently they come
  // out inverted a quarter of the time, and an inverted range selects nothing —
  // glitch:sort with lo 0.69 / hi 0.60 sorts nothing and the child is identical
  // to its parent. Found by rendering, then fixed here.
  eq(JSON.stringify(repairRanges({ lo: 0.9, hi: 0.1 })), JSON.stringify({ lo: 0.1, hi: 0.9 }),
    'an inverted range is put back in order');
  eq(JSON.stringify(repairRanges({ inLo: 0.2, inHi: 0.8 })), JSON.stringify({ inLo: 0.2, inHi: 0.8 }),
    'an ordered one is left alone');
  for (const [a, b] of RANGE_PAIRS) {
    const owners = Object.entries(EFFECTS).filter(([, e]) => e.params?.[a] && e.params?.[b]);
    ok(owners.length > 0, `${a}/${b} is a pair some effect actually has`);
  }
  // and nothing in the registry has an ordered-looking pair we do not repair
  for (const [id, spec] of Object.entries(EFFECTS)) {
    const keys = Object.keys(spec.params || {});
    for (const [a, b] of [['lo', 'hi'], ['inLo', 'inHi'], ['outLo', 'outHi']]) {
      if (keys.includes(a) && keys.includes(b)) {
        ok(RANGE_PAIRS.some(([x, y]) => x === a && y === b), `${id}'s ${a}/${b} is in RANGE_PAIRS`);
      }
    }
  }

  // energise must actually move a neutral effect off its identity, or a third
  // of the registry generates twins.
  const neutral = Object.keys(EFFECTS).filter((id) => EFFECTS[id].neutral);
  ok(neutral.length > 10, `the registry really does have neutral effects (${neutral.length})`);
  ok(sampleField(rngFor('f'), null).type !== 'paint',
    'a generated field is never `paint` — nobody drew a mask out here');
  ok(sampleField(rngFor('f'), { type: 'luma' }).type !== 'luma', 'and re-aiming actually changes the field');
}

// ═══════════════════════ 3. the grammar ═══════════════════════
{
  eq(Object.keys(weights(0)).join(), 'add', 'an empty stack can only grow');
  ok(weights(1).add > weights(6).add, 'the fan is broad near the root and refines further out');
  eq(weights(9).add, 0, 'and stops piling on once it is deep');
  ok(weights(1).drop === 0, 'nothing to drop in the first rings');

  // mutate must not touch what it was given: the same parent is folded once per
  // child, and a shared object would make siblings depend on draw order.
  const parent = stackAt('imm', P(1, 2));
  const before = JSON.stringify(parent);
  mutate(parent, rngFor('x'));
  eq(JSON.stringify(parent), before, 'mutate leaves its input alone');

  const out = mutate([], rngFor('first'));
  eq(out.stack.length, 1, 'the first mutation adds one effect');
  ok(EFFECTS[out.stack[0].fx], 'and it is an effect the registry knows');
  ok(out.stack[0].amount > 0, 'switched on hard enough to see');
}

// ═══════════════════════ 4. no dead branches ═══════════════════════
//
// The measurement that justifies the design. Grown over a real picture with
// shop's real effects: without the re-roll about one first-ring child in
// seventeen renders identical to its parent.
{
  let dead = 0, total = 0, rerolls = 0;
  const distinct = new Set();
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 6; i++) {
      const path = P(i);
      const id = pathText(path);
      let out, salt = 0;
      do {
        out = render(stackAt(`pic${s}`, path, { salts: { [id]: salt } }));
        salt++;
      } while (same(out, SEED) && salt < 4);
      rerolls += salt - 1;
      total++;
      if (same(out, SEED)) dead++;
      distinct.add(out.reduce((h, v, k) => (k % 37 ? h : (h * 31 + v) >>> 0), 7));
    }
  }
  eq(dead, 0, `every first-ring tile differs from the seed (${total} grown, ${rerolls} re-rolls)`);
  ok(distinct.size >= total * 0.9, `and they differ from each other (${distinct.size}/${total} distinct)`);

  // Deeper nodes must keep moving too — a web that converges is a web you stop
  // wanting to explore. Run it the way the worker does, salts and all: a dud
  // deep in the tree is image-dependent in a way sampling cannot see (a
  // `lens:power` centred outside the frame with `edge: void` renders the same
  // picture at any exponent), so the rejection has to happen where the bitmaps
  // are. If this ever needs more than a handful of re-rolls to clear, the
  // grammar has drifted and the re-roll is papering over it — hence the count
  // is asserted too, not just the outcome.
  let deepSame = 0, deepRolls = 0;
  for (let s = 0; s < 8; s++) {
    const salts = {};
    const a = render(stackAt(`deep${s}`, P(2, 3), { salts }));
    let b, salt = 0;
    do {
      salts['2.3.4'] = salt;
      b = render(stackAt(`deep${s}`, P(2, 3, 4), { salts }));
      salt++;
    } while (same(a, b) && salt < 4);
    deepRolls += salt - 1;
    if (same(a, b)) deepSame++;
  }
  eq(deepSame, 0, `a child still changes its parent at depth 3 (${deepRolls} re-rolls over 8)`);
  ok(deepRolls <= 3, `and the grammar does most of that work itself (${deepRolls} re-rolls)`);

  // And nothing throws on any effect the registry offers.
  let threw = 0;
  for (let s = 0; s < 30; s++) {
    try { render(stackAt(`rob${s}`, P(s % 6, (s * 5) % 6, (s * 11) % 6))); } catch { threw++; }
  }
  eq(threw, 0, 'thirty deep stacks render without throwing');
}

// ═══════════════════════ 5. the web on screen ═══════════════════════
{
  const tree = createTree();
  eq(tree.nodes.size, 1, 'a fresh tree is just the seed');
  expand(tree, []);
  eq(tree.nodes.size, 7, 'opening the root places six children');
  expand(tree, []);
  eq(tree.nodes.size, 7, 'opening it twice is not a second fan');

  expand(tree, P(2));
  eq(tree.nodes.size, 13, 'and a child opens its own');
  ok(nodeAt(tree, P(2, 0)), 'grandchildren are addressable');
  eq(nodeAt(tree, P(2, 0)).parent, '2', 'and know their parent');
  eq(edges(tree).length, 12, 'every placed node but the root draws one thread');

  // Children fan around the direction their parent came from, so a lineage
  // reads outward as one gesture instead of doubling back over itself.
  const root = nodeAt(tree, []);
  const kids = [0, 1, 2, 3, 4, 5].map((i) => nodeAt(tree, P(i)));
  ok(kids.every((k) => Math.hypot(k.x - root.x, k.y - root.y) > 100), 'children sit away from their parent');
  ok(new Set(kids.map((k) => `${Math.round(k.x)},${Math.round(k.y)}`)).size === 6, 'and not on top of each other');

  const b = bounds(tree);
  ok(b.w > 0 && b.h > 0, 'the tree has an extent to fit to');
  ok(kids.every((k) => k.x >= b.x && k.x <= b.x + b.w), 'which contains every node');

  const hit = hitTest(tree, kids[3].x + 4, kids[3].y - 4, 60);
  eq(hit ? pathText(hit.path) : null, '3', 'hit-testing finds the tile under a point');
  eq(hitTest(tree, 99999, 99999, 60), null, 'and nothing where there is nothing');

  // A deep-linked node has to be reachable, or a shared address lands on a
  // tile with no path to it.
  const fresh = createTree();
  revealPath(fresh, P(1, 2, 3));
  ok(nodeAt(fresh, P(1, 2, 3)), 'revealPath places a deep-linked node');
  ok(nodeAt(fresh, P(1)) && nodeAt(fresh, P(1, 2)), 'and every ancestor along the way');


  // ── reroll ──
  //
  // "None of these six grab me — show me six more." The variant rides on the
  // CHILDREN's path elements, not the parent's, so the node you rerolled keeps
  // its own picture and its own address while its children get new ones. That
  // placement is the whole reason a rerolled branch can still be shared: the
  // address bar carries the variant, so `?p=` reproduces it on another machine.
  {
    const t = createTree();
    expand(t, []);
    const first = [...t.nodes.keys()].filter(Boolean).sort();
    eq(first.join(), '0,1,2,3,4,5', 'a fresh fan is the plain indices');

    reroll(t, [], 1);
    const second = [...t.nodes.keys()].filter(Boolean).sort();
    eq(second.join(), '0~1,1~1,2~1,3~1,4~1,5~1', 'a rerolled fan is a different set of addresses');
    ok(nodeAt(t, []), 'and the node you rerolled is still there');

    // different addresses must mean different pictures, or reroll is a no-op
    // dressed as a feature
    ok(JSON.stringify(stackAt('pic', [{ i: 2, v: 0 }])) !== JSON.stringify(stackAt('pic', [{ i: 2, v: 1 }])),
      'a rerolled child folds to a different stack');
    eq(JSON.stringify(stackAt('pic', [{ i: 2, v: 1 }])), JSON.stringify(stackAt('pic', [{ i: 2, v: 1 }])),
      'and still to the SAME one every time — reroll stays reproducible');
    eq(pathText([{ i: 3, v: 2 }, { i: 0, v: 0 }]), '3~2.0', 'the variant is written into the address');
    eq(pathText(parsePath('3~2.0')), '3~2.0', 'and read back out of it');
    eq(pathText(parsePath('3~0')), '3', 'variant 0 is the plain form, not `3~0`');
    eq(pathText(parsePath('3~junk')), '3', 'and a broken variant falls back rather than folding a NaN');

    // a rerolled branch has to be reachable from its address alone
    const shared = createTree();
    revealPath(shared, parsePath('2~1.4'));
    ok(nodeAt(shared, parsePath('2~1.4')), 'revealPath reaches a node inside a rerolled fan');
    ok(nodeAt(shared, parsePath('2~1')), 'having placed the rerolled child it hangs from');
    ok(!nodeAt(shared, parsePath('2')), 'and NOT the variant-0 sibling it replaced');

    // rerolling throws away what hung below, because those were folds through a
    // stack that no longer exists
    const deepish = createTree();
    expand(deepish, []);
    expand(deepish, P(1));
    ok(nodeAt(deepish, P(1, 0)), 'a grandchild exists before the reroll');
    reroll(deepish, [], 3);
    ok(!nodeAt(deepish, P(1, 0)), 'and is gone after it');
  }

  // ── no two tiles may overlap ──
  //
  // Not cosmetic: overlapping tiles mean you cannot click the one you meant,
  // and the first version of this layout piled the third ring on the second.
  // The rule is enforced by geometry (`ringFor` inverts the chord) and by
  // folding fans off the open branch, so assert the outcome of both together
  // rather than the formula.
  const deep = createTree();
  revealPath(deep, P(1, 4, 2, 5));
  expand(deep, P(1, 4, 2, 5));
  const placed = [...deep.nodes.values()];
  let closest = Infinity, pair = '';
  for (let a = 0; a < placed.length; a++) {
    for (let b2 = a + 1; b2 < placed.length; b2++) {
      const d = Math.hypot(placed[a].x - placed[b2].x, placed[a].y - placed[b2].y);
      if (d < closest) { closest = d; pair = `${pathText(placed[a].path)}/${pathText(placed[b2].path)}`; }
    }
  }
  ok(closest >= TILE, `four rings deep, no two tiles overlap (closest ${closest.toFixed(0)}px, ${pair}, tile ${TILE}px)`);

  // Folding is what makes that possible, so it has to actually fold: only the
  // open chain and its siblings survive.
  const kept = new Set(placed.map((n) => pathText(n.path)));
  ok(kept.has('1') && kept.has('1.4') && kept.has('1.4.2'), 'the chain you walked is still there');
  ok(kept.has('0') && kept.has('1.0') && kept.has('1.4.0'), 'and every sibling you passed, to turn back to');
  ok(!kept.has('0.0'), 'but not the fan of a branch you left');
  ok(nodeAt(deep, P(0)) && !nodeAt(deep, P(0)).open, 'which is closed, not deleted');

  // Re-opening it rebuilds the same tree — a node holds nothing, so nothing was
  // lost by throwing its descendants away.
  expand(deep, P(0));
  ok(nodeAt(deep, P(0, 3)), 'and re-opening it grows the same fan back');
  ok(!nodeAt(deep, P(1, 4, 2, 5, 0)), 'while the branch you left folds in turn');
}

// ═══════════════ 6. getting around it ═══════════════
//
// The web is bigger than any screen, so this is not a nicety. Bloom shipped
// zooming on `wheel` alone — which a phone does not have — so the tool that was
// designed to be panned with a thumb could be panned and nothing else.
//
// The property that matters, for both a wheel and two fingers: **the point you
// anchor on does not move**. Zoom about the origin instead and whatever you
// were looking at flies off screen, which four rings deep means losing your
// place entirely.
{
  const CX = 500, CY = 400;   // canvas centre in client coordinates
  const at = (v, wx, wy) => [(wx - v.x) * v.zoom + CX, (wy - v.y) * v.zoom + CY]; // world → screen
  const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  const v0 = { x: 20, y: -35, zoom: 0.8 };
  const [sx, sy] = [712, 331];
  const [wx, wy] = toWorld(v0, sx, sy, CX, CY);
  ok(close(at(v0, wx, wy)[0], sx) && close(at(v0, wx, wy)[1], sy),
    'screen → world → screen is the identity');

  for (const z of [0.2, 0.5, 1.7, 2.9]) {
    const v = zoomAround(v0, sx, sy, CX, CY, z);
    const [bx, by] = at(v, wx, wy);
    ok(close(bx, sx, 1e-6) && close(by, sy, 1e-6),
      `the anchored point stays under the cursor at zoom ${z} (${bx.toFixed(3)}, ${by.toFixed(3)})`);
  }

  ok(clampZoom(99) === MAX_ZOOM && clampZoom(0) === MIN_ZOOM, 'zoom is clamped both ways');
  eq(zoomAround(v0, sx, sy, CX, CY, 500).zoom, MAX_ZOOM, 'and zoomAround clamps rather than trusting');
  ok(MIN_ZOOM > 0 && MAX_ZOOM > 1, 'the range is sane');
  ok(TAP_SLOP >= 6, `a tap tolerates a finger's wobble (${TAP_SLOP}px)`);

  // ── pinch ──
  const P = (ax, ay, bx, by) => pinchOf({ x: ax, y: ay }, { x: bx, y: by });

  // spreading the fingers zooms by exactly the ratio of their separation
  {
    const a = P(400, 400, 600, 400);           // 200 apart, mid (500,400)
    const b = P(300, 400, 700, 400);           // 400 apart, same mid
    eq(a.dist, 200, 'separation is the distance between the fingers');
    eq(a.mx, 500, 'and the midpoint is between them');
    const v = pinchStep(v0, a, b, CX, CY);
    ok(close(v.zoom, v0.zoom * 2, 1e-9), `twice as far apart is twice the zoom (${v.zoom})`);
    const [px, py] = at(v, ...toWorld(v0, a.mx, a.my, CX, CY));
    ok(close(px, b.mx, 1e-6) && close(py, b.my, 1e-6),
      'and the world point under the midpoint is still under it');
  }

  // two fingers sliding without changing separation is a pan, not a zoom
  {
    const a = P(400, 400, 600, 400);
    const b = P(460, 430, 660, 430);           // same 200 apart, mid moved (+60,+30)
    const v = pinchStep(v0, a, b, CX, CY);
    ok(close(v.zoom, v0.zoom, 1e-9), 'constant separation does not change the zoom');
    ok(close(v.x, v0.x - 60 / v0.zoom, 1e-9) && close(v.y, v0.y - 30 / v0.zoom, 1e-9),
      'and the view follows the midpoint exactly');
  }

  // THE DIVIDE-BY-ZERO. Two fingers can land on the same pixel, and `now/0` is
  // Infinity — which clamps to MAX_ZOOM and reads as the view exploding.
  {
    const same = P(500, 400, 500, 400);
    eq(same.dist, 1, 'coincident fingers are one pixel apart, not zero');
    const v = pinchStep(v0, same, P(500, 400, 560, 400), CX, CY);
    ok(Number.isFinite(v.zoom) && Number.isFinite(v.x), 'so a pinch from nothing stays finite');
  }

  // ── wheel, same anchor rule ──
  {
    const up = wheelStep(v0, sx, sy, CX, CY, -100);
    const down = wheelStep(v0, sx, sy, CX, CY, 100);
    ok(up.zoom > v0.zoom && down.zoom < v0.zoom, 'scrolling up zooms in, down zooms out');
    const [ax, ay] = at(up, wx, wy);
    ok(close(ax, sx, 1e-6) && close(ay, sy, 1e-6), 'and the cursor keeps its grip');
    // the same notch is the same factor wherever you already are
    const r1 = wheelStep({ ...v0, zoom: 0.4 }, sx, sy, CX, CY, -60).zoom / 0.4;
    const r2 = wheelStep({ ...v0, zoom: 1.6 }, sx, sy, CX, CY, -60).zoom / 1.6;
    ok(close(r1, r2, 1e-9), `one notch is one factor at any zoom (${r1.toFixed(6)})`);
  }

  // ── pan ──
  {
    const v = panBy(v0, 80, -40);
    ok(close(v.x, v0.x - 80 / v0.zoom) && close(v.y, v0.y + 40 / v0.zoom),
      'a screen pixel of drag is 1/zoom of world');
    eq(panBy(v0, 0, 0).zoom, v0.zoom, 'and panning never touches the zoom');
  }

  // ── fit, which is the way back from a pinch that went too far ──
  {
    const box = { x: -600, y: -400, w: 1200, h: 800 };
    const v = fitView(box, 600, 500);
    eq(v.x, 0, 'fit centres on the box');
    eq(v.y, 0, 'in both axes');
    ok(close(v.zoom, 0.5), `and scales it to the narrower fit (${v.zoom})`);
    eq(fitView({ x: 0, y: 0, w: 10, h: 10 }, 900, 900).zoom, 1,
      'but never magnifies — a first ring filling a desktop reads as an error');
    ok(fitView(box, 1, 1).zoom >= MIN_ZOOM, 'and it cannot fit its way below the floor');
  }
}

// ═══════════════════════════════ verdict ═══════════════════════════════
if (failures) {
  console.error(`\n✗ bloom selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log(`✓ bloom selftest passed — deterministic addressing over ${Object.keys(EFFECTS).length} effects, `
  + 'range repair, no dead branches, the fan geometry, and pinch/wheel/pan');
