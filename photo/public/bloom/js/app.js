// app.js — the web on screen, and the door out of it into /shop.
//
// One canvas, hit-tested (see `tree.js`) rather than a DOM node per tile: a few
// hundred absolutely-positioned elements is what makes an infinite canvas
// stutter on a phone, and this one is meant to be panned with a thumb.
//
// THE DOOR IS THE POINT
// ---------------------
// Everything here is a thumbnail of a *recipe*. Nothing is edited, nothing is
// exported, nothing is saved. When a picture is worth more than a glance it
// goes to `/shop` as `?u=<seed>#r=<recipe>` — the recipe format shop already
// writes for its own share links, and which its boot already applies to
// whatever picture arrives. So "open the one I liked and dive into what made
// it" is not a feature built here; it is shop's stack panel, reached with a
// link. A seed off a local disk has no URL, so it goes through IndexedDB
// instead and shop picks it up by key.
//
// That door swings both ways. Shop's `file → grow variations in /bloom…` sends
// its composite back here the same way, and /explore's lightbox opens a picture
// here as `?u=`. Shop is "I know what to do to this"; bloom is "I don't, show
// me" — and until both were reachable from a picture, the second was a thing
// you had to already know existed.

import {
  TILE, bounds, createTree, edges, expand, hitTest, layoutAnchored, layoutRadial,
  nodeAt, pathToText, reroll, revealPath,
} from './tree.js';
import {
  STEERS, describeStep, lineage, originId, parseOrigin, parsePath, pathText,
} from './mutate.js';
import { BRIDGE_STEPS, bridgePath, describeBridge } from './bridge.js';
import {
  TAP_SLOP, fitView, pinchOf, pinchStep, toWorld, wheelStep,
} from './gesture.js';
import { MAX_SIDE, createDoc, addLayer, makeLayer, encodeRecipe } from '../../shop/js/core/doc.js';
import { previewScale } from '../../shop/js/core/scale.js';
import { makeRGBA } from '../../shop/js/core/pixels.js';
// One copy, in shop — the hub every tool hands pictures to. Cross-directory
// imports inside public/ are the established pattern here (shop's registry
// imports /glitch, /lens and /glass the same way).
import { peek, putSeed } from '../../shop/js/handoff.js';

const THUMB = 168;          // px, the long side the worker renders at
// TILE comes from tree.js, which needs it to place nodes far enough apart that
// two never overlap. One number, one owner.

const $ = (id) => document.getElementById(id);
const canvas = $('web');
const ctx = canvas.getContext('2d');

const state = {
  tree: createTree(),
  tiles: new Map(),          // path id → ImageBitmap
  root: '',
  seed: null,                // { px, W, H, url|null, name }
  view: { x: 0, y: 0, zoom: 1 },
  hover: null,
  selected: null,
  worker: null,
  pending: new Set(),
  // path id → the salt the worker actually used. A node that came out identical
  // to its parent is re-rolled at render time (see `worker.js`), which means the
  // renderer, not the address, knows which stack produced the picture on screen.
  // The rail and the hand-off to /shop MUST fold with these or they describe —
  // and open — a different picture from the one that was clicked. That is the
  // one bug in this design that would look like nothing at all.
  salts: {},
  // path text → how many times its fan has been redrawn. Only needed to know
  // what the NEXT variant number is; the variant itself lives in the children's
  // addresses, where a shared link can find it.
  fans: {},
  seedKey: null,
  seedError: null,
  // Keep every branch you open instead of folding the ones you left. Off by
  // default: the graph gets big fast, and `layoutRadial` is what makes it
  // navigable rather than pleasant.
  retain: false,
  // Which family the next fan is drawn from, or null for all fifty-seven.
  steer: null,
  // A pending "bridge from here", and the arc itself once both ends are picked.
  bridgeFrom: null,
  bridge: null,
  // origin id → the stack it starts from. A bridge step is a blend rather than
  // a fold, so a node grown FROM one needs its starting stack supplied; the id
  // is in the address and the stack is recomputable from it, which is what
  // keeps `?p=` a pure function of one string.
  origins: {},
};

// ─────────────────────────────────────────────────────────────── seeding ──

async function startFrom(source) {
  const { px, W, H, url, name } = source;
  state.seed = source;
  state.root = `${name || 'seed'}:${W}x${H}:${hashPixels(px)}`;
  state.tree = createTree();
  state.tiles.clear();
  state.pending.clear();
  state.salts = {};
  state.fans = {};
  state.origins = {};
  state.bridge = null;

  $('veil').hidden = true;
  $('stage').hidden = false;

  state.worker?.terminate();
  state.worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  state.worker.onmessage = onTile;
  state.worker.postMessage({
    type: 'seed', pixels: px.buffer.slice(0), W, H, root: state.root,
    scale: source.scale ?? 1,
  }, []);

  // ⚠️ Stash the picture for /shop NOW, not when the door is clicked.
  //
  // `openInShop` used to `await putSeed(...)` and then set `location.href`. On
  // iOS Safari a navigation after an async gap inside a click handler can be
  // refused for want of user activation — and because nothing caught the
  // rejection either, the button simply did nothing at all. Reported from an
  // iOS beta and not reproducible on desktop Firefox or Safari, which is
  // exactly the shape of a user-activation rule tightening.
  //
  // Writing it here means the handler has the key already and navigates in the
  // same task as the tap. A failure now is also visible now, rather than at the
  // one moment someone is trying to leave with their picture.
  state.seedKey = null;
  state.seedError = null;
  if (source.blob) {
    putSeed(source.blob)
      .then((key) => { state.seedKey = key; })
      .catch((err) => { state.seedError = err?.message || String(err); });
  }

  const params = new URLSearchParams(location.search);
  let wanted = parsePath(params.get('p'));

  // `?p=` may itself name a step on an arc — that is what an address grown from
  // a bridge looks like. The arc has to exist before the path through it can be
  // revealed, and the arc is rebuildable from the id, which is the whole reason
  // the id spells out both ends and the step.
  const org = wanted[0]?.o ? parseOrigin(wanted[0].o) : null;
  if (org) {
    const fromP = parsePath(org.from), toP = parsePath(org.to);
    revealPath(state.tree, fromP); expand(state.tree, fromP, { retain: true });
    revealPath(state.tree, toP); expand(state.tree, toP, { retain: true });
    makeBridge(fromP, toP);
    const tile = state.bridge?.tiles[org.step];
    if (tile) growFrom(tile); else wanted = [];
  }
  revealPath(state.tree, wanted);
  expand(state.tree, wanted.length ? wanted : [], { retain: state.retain });
  select(wanted);
  fit();
  requestTiles();

  // `?to=` — an arc, rebuilt from its two ends. Both have to be placed first,
  // which is why this runs after the reveal above.
  if (params.get('to')) {
    const far = parsePath(params.get('to'));
    revealPath(state.tree, far);
    expand(state.tree, far, { retain: true });
    relayout();
    makeBridge(wanted, far);
    const i = parseInt(params.get('i'), 10);
    if (Number.isFinite(i)) selectBridgeStep(i);
    requestTiles();
  }
  status(`growing from ${name || 'your picture'} — click a tile to open it up`);
}

/** A cheap content hash, so the same picture always grows the same web. */
function hashPixels(px) {
  let h = 2166136261;
  for (let i = 0; i < px.length; i += 997) h = Math.imul(h ^ px[i], 16777619);
  return (h >>> 0).toString(36);
}

async function seedFromBlob(blob, name) {
  const bmp = await createImageBitmap(blob);
  // What /shop will actually open this at: the original, capped the way shop
  // caps an import. That ratio is what every length in the stack is divided by
  // to preview it here — see core/scale.js.
  const cap = Number(localStorage.getItem('shop.maxSide')) || MAX_SIDE;
  const fullLong = Math.min(cap, Math.max(bmp.width, bmp.height));
  const k = THUMB / Math.max(bmp.width, bmp.height);
  const W = Math.max(1, Math.round(bmp.width * k));
  const H = Math.max(1, Math.round(bmp.height * k));
  const c = new OffscreenCanvas(W, H);
  const cc = c.getContext('2d', { willReadFrequently: true });
  cc.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  return {
    px: new Uint8ClampedArray(cc.getImageData(0, 0, W, H).data), W, H, name,
    fullLong,
    scale: previewScale(Math.max(W, H), fullLong),
  };
}

// ─────────────────────────────────────────────────────────────── the web ──

function onTile(ev) {
  const m = ev.data;
  if (m.type === 'ready') return;
  if (m.type !== 'tile') return;
  const px = new Uint8ClampedArray(m.pixels);
  if (m.salt) state.salts[m.id] = m.salt;
  // A node grown from a bridge step is rendered from a stack we computed, so
  // the worker cannot re-roll it itself — it reports the miss and we re-fold
  // with a salt, which is the same guarantee by a longer road.
  if (m.dead) {
    const salt = (state.salts[m.id] || 0) + 1;
    if (salt < 4) {
      state.salts[m.id] = salt;
      state.worker.postMessage({
        type: 'stack', id: m.id, stack: stackOf(parsePathIn(m.id)), parentId: m.parentId,
      });
      return;
    }
  }
  createImageBitmap(new ImageData(px, m.W, m.H)).then((bmp) => {
    state.tiles.set(m.id, bmp);
    state.pending.delete(m.id);
    // A late-arriving salt changes what the rail should say about the node
    // already selected, so re-read it rather than leaving stale text up.
    if (m.salt && state.selected === m.id) select(parsePath(m.id));
    draw();
  });
}

/** Ask for every placed node we do not have yet, parents first. */
function requestTiles() {
  const want = [...state.tree.nodes.values()]
    .map((n) => n.path)
    .filter((p) => !state.tiles.has(pathToText(p)) && !state.pending.has(pathToText(p)))
    .sort((a, b) => a.length - b.length);
  // Parents first, and plain nodes in one message — the worker renders a child
  // against its parent's pixels, so order matters.
  for (const p of want) requestNode(p);
}

// ─────────────────────────────────────────────────────────────── bridges ──

/**
 * Lay an arc's tiles between two nodes.
 *
 * A bowed curve rather than a straight line, for two reasons: a straight run
 * between two siblings would lie on top of the tiles between them, and the bow
 * is what makes a cycle *read* as a cycle rather than as another branch.
 *
 * The bow is grown until no two steps are closer than a tile — the same rule
 * the rings obey, applied to a curve whose length we do not otherwise control.
 */
function placeBridge(from, to, n, avoid = []) {
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;

  for (let bow = 0.2; bow <= 6; bow += 0.1) {
    const cx = mx + nx * len * bow, cy = my + ny * len * bow;
    const at = (t) => {
      const u = 1 - t;
      return {
        x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
        y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
      };
    };
    // ⚠️ SPACED BY ARC LENGTH, NOT BY `t`.
    //
    // Sampling a quadratic at even `t` bunches the points in the middle, where
    // the curve is slowest. Bowing harder then spreads the ENDS apart and
    // barely moves the middle: at a 333px chord the middle gaps went 59 → 93px
    // as the bow went from 1 to 4, and the first bow that satisfied a 132px
    // tile was 8 — an arc two and a half thousand pixels tall to join two
    // siblings. Walking the curve and placing the steps at equal fractions of
    // its LENGTH puts them evenly apart, and a bow of about 2.5 then does it.
    const WALK = 240;
    const pts = [at(0)];
    const cum = [0];
    for (let i = 1; i <= WALK; i++) {
      const p = at(i / WALK);
      cum.push(cum[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y));
      pts.push(p);
    }
    const total = cum[WALK];
    if (total < (n + 1) * TILE * 1.05) continue;   // no bow will fit fewer steps in
    const out = [];
    let j = 0;
    for (let k = 1; k <= n; k++) {
      const want = (total * k) / (n + 1);
      while (j < WALK && cum[j + 1] < want) j++;
      out.push(pts[j]);
    }
    const chain = [from, ...out, to];
    let ok = true;
    for (let i = 1; i < chain.length; i++) {
      if (Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y) < TILE * 1.05) { ok = false; break; }
    }
    // …and clear of the web it is crossing. Spacing the steps against each
    // other is not enough: an arc thrown across a retained graph can drop a
    // step straight onto somebody else's tile, and a tile under another tile
    // cannot be clicked — which is the whole reason the rule exists.
    if (ok) {
      ok = out.every((p) => avoid.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= TILE * 1.02));
    }
    if (ok) return out;
  }
  return null;   // the two ends are too close together to string an arc between
}

/** Build the arc between the selected node and another, and ask for its tiles. */
function makeBridge(fromPath, toPath) {
  const a = nodeAt(state.tree, fromPath), b = nodeAt(state.tree, toPath);
  if (!a || !b) return;
  const stackA = stackOf(fromPath), stackB = stackOf(toPath);
  const steps = bridgePath(stackA, stackB, BRIDGE_STEPS);
  const pts = placeBridge(a, b, steps.length,
    [...state.tree.nodes.values()].filter((n) => n !== a && n !== b));
  if (!pts) { status('those two are too close together to arc between — pick a further pair'); return; }
  const fromId = pathToText(fromPath), toId = pathToText(toPath);
  state.bridge = {
    from: fromPath, to: toPath, fromId, toId,
    changes: describeBridge(stackA, stackB),
    tiles: steps.map((s, k) => ({
      ...s, ...pts[k], id: originId(fromId, toId, k), index: k,
    })),
  };
  for (const tile of state.bridge.tiles) {
    if (state.tiles.has(tile.id)) continue;
    state.pending.add(tile.id);
    state.worker.postMessage({ type: 'stack', id: tile.id, stack: tile.stack });
  }
  const search = new URLSearchParams(location.search);
  search.set('p', fromId); search.set('to', toId); search.delete('i');
  history.replaceState(null, '', `${location.pathname}?${search}`);
  state.bridgeFrom = null;
  fit();
  status(`${steps.length} steps from ${fromId ? `#${fromId}` : 'the seed'} to #${toId} — `
    + `${state.bridge.changes.slice(0, 3).join(', ')}`);
}

/**
 * The fold to a node — the ONE place the folding context is assembled.
 *
 * Both halves of it are load-bearing and both were once left off somewhere:
 * `salts` are which re-roll the worker actually rendered (leave them out and
 * the rail describes a different picture from the tile), and `origins` supply
 * the starting stack for anything grown from a bridge step (leave them out and
 * such a node folds from nothing, which is how the rail came to say "0 effects"
 * for a step that plainly had two).
 */
const foldTo = (path) => lineage(state.root, path, { salts: state.salts, origins: state.origins });

/** The stack at a node. */
function stackOf(path) {
  const steps = foldTo(path);
  return steps.length ? steps[steps.length - 1].stack : [];
}

/**
 * Ask for a node's tile.
 *
 * A plain node is a fold from the root, so the worker can do the whole thing
 * from its path — and gets to reject dead branches, because it holds the
 * parent's pixels. A node grown from a bridge step cannot be folded there (the
 * origin is a blend the worker never saw), so its stack is computed here and
 * sent whole, with the parent's id so the same rejection still applies.
 */
function requestNode(path) {
  const id = pathToText(path);
  if (state.tiles.has(id) || state.pending.has(id)) return;
  state.pending.add(id);
  if (path.some((e) => e.o)) {
    state.worker.postMessage({
      type: 'stack', id, stack: stackOf(path), parentId: pathToText(path.slice(0, -1)),
    });
  } else {
    state.worker.postMessage({ type: 'render', paths: [path] });
  }
}

// ────────────────────────────────────────────────────────────── drawing ──

let queued = false;
function draw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(paint);
}

function paint() {
  queued = false;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { x, y, zoom } = state.view;
  const toScreen = (wx, wy) => [(wx - x) * zoom + cssW / 2, (wy - y) * zoom + cssH / 2];

  // threads first, so tiles sit on top of them
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--thread') || '#3a3f47';
  ctx.lineWidth = Math.max(1, 1.5 * zoom);
  for (const { from, to } of edges(state.tree)) {
    const [ax, ay] = toScreen(from.x, from.y);
    const [bx, by] = toScreen(to.x, to.y);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    // a slight bow, so overlapping threads stay distinguishable
    ctx.quadraticCurveTo((ax + bx) / 2 + (by - ay) * 0.08, (ay + by) / 2 - (bx - ax) * 0.08, bx, by);
    ctx.stroke();
  }

  // the arc, drawn under its tiles and in a different colour so a cycle does
  // not read as another branch
  if (state.bridge) {
    const a = nodeAt(state.tree, state.bridge.from), b = nodeAt(state.tree, state.bridge.to);
    if (a && b) {
      ctx.strokeStyle = 'rgba(240,161,54,.45)';
      ctx.lineWidth = Math.max(1.5, 2.5 * zoom);
      ctx.setLineDash([6 * zoom, 5 * zoom]);
      ctx.beginPath();
      const chain = [a, ...state.bridge.tiles, b];
      chain.forEach((p, i) => {
        const [sx, sy] = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const size = TILE * zoom;
  for (const node of [...state.tree.nodes.values(), ...(state.bridge?.tiles || [])]) {
    const id = node.path ? pathToText(node.path) : node.id;
    const [sx, sy] = toScreen(node.x, node.y);
    if (sx < -size || sy < -size || sx > cssW + size || sy > cssH + size) continue;

    const bmp = state.tiles.get(id);
    const half = size / 2;
    const isSel = state.selected === id;
    const isHover = state.hover === id;

    ctx.save();
    if (bmp) {
      const k = Math.min(size / bmp.width, size / bmp.height);
      const w = bmp.width * k, h = bmp.height * k;
      ctx.drawImage(bmp, sx - w / 2, sy - h / 2, w, h);
      if (isSel || isHover) {
        ctx.strokeStyle = isSel ? '#f0a136' : 'rgba(255,255,255,.55)';
        ctx.lineWidth = isSel ? 3 : 1.5;
        ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
      }
      if (!node.open && node.path && node.path.length) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath(); ctx.arc(sx + w / 2 - 9, sy + h / 2 - 9, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `${11 * Math.min(1.4, zoom)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', sx + w / 2 - 9, sy + h / 2 - 8);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(sx - half, sy - half * 0.75, size, size * 0.75);
    }
    ctx.restore();
  }
}

// ───────────────────────────────────────────────────────── interaction ──

/**
 * Put everything where it belongs: the web from the seed first, then the fans
 * that hang off bridge steps, which need the rest settled before they can find
 * room beside it.
 */
function relayout() {
  if (state.retain) layoutRadial(state.tree);
  layoutAnchored(state.tree);
}

/** Frame everything currently placed. Also the way back from a pinch that
 *  went too far — the `fit` chip in the bar calls exactly this. */
function fit() {
  state.view = fitView(bounds(state.tree, TILE * 0.7), canvas.clientWidth || 1, canvas.clientHeight || 1);
  draw();
}

/** The canvas centre, which is the origin all the view maths is relative to. */
function centre() {
  const r = canvas.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function screenToWorld(sx, sy) {
  const [cx, cy] = centre();
  return toWorld(state.view, sx, sy, cx, cy);
}

// ── pointers ──
//
// A Map rather than a single `drag`, because two fingers is a different
// gesture from one and the second one arriving must not be mistaken for the
// first one teleporting. `gest` is re-anchored on every down and every up, so
// lifting one finger of a pinch continues as a pan from where that finger
// actually is instead of snapping.
const pointers = new Map();
let gest = null;

function reanchor() {
  const pts = [...pointers.values()];
  if (!pts.length) { gest = null; return; }
  const carry = { moved: gest?.moved || false, everTwo: (gest?.everTwo || false) || pts.length > 1 };
  if (pts.length === 1) {
    gest = { mode: 'pan', ...carry, sx: pts[0].x, sy: pts[0].y, vx: state.view.x, vy: state.view.y };
  } else {
    gest = { mode: 'pinch', ...carry, everTwo: true, ...pinchOf(pts[0], pts[1]) };
  }
}

function drive() {
  const pts = [...pointers.values()];
  if (!gest) return;
  if (gest.mode === 'pan' && pts.length === 1) {
    const dx = pts[0].x - gest.sx, dy = pts[0].y - gest.sy;
    if (Math.hypot(dx, dy) > TAP_SLOP) gest.moved = true;
    state.view.x = gest.vx - dx / state.view.zoom;
    state.view.y = gest.vy - dy / state.view.zoom;
    draw();
  } else if (gest.mode === 'pinch' && pts.length >= 2) {
    const now = pinchOf(pts[0], pts[1]);
    const [cx, cy] = centre();
    state.view = pinchStep(state.view, gest, now, cx, cy);
    gest.dist = now.dist; gest.mx = now.mx; gest.my = now.my;
    draw();
  }
}

/** Whatever is under a world point: a tree node, or a step on an arc. */
function pick(wx, wy) {
  const node = hitTest(state.tree, wx, wy, TILE * 0.6);
  let best = node, bestD = node ? Math.hypot(node.x - wx, node.y - wy) : Infinity;
  for (const t of state.bridge?.tiles || []) {
    const d = Math.hypot(t.x - wx, t.y - wy);
    if (d < TILE * 0.6 && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

function tapAt(sx, sy) {
  const [wx, wy] = screenToWorld(sx, sy);
  const hit = pick(wx, wy);
  if (!hit) return;

  // A step on an arc is a picture like any other: taking it to /shop works, and
  // so does growing six variations from it. It becomes a node whose path starts
  // with an ORIGIN element naming the arc and the step — see mutate.js.
  if (!hit.path) {
    selectBridgeStep(hit.index);
    growFrom(hit);
    return;
  }

  // Second half of "bridge from here": the tile you tap becomes the far end.
  if (state.bridgeFrom) {
    const from = state.bridgeFrom;
    if (pathToText(from) !== pathToText(hit.path)) { makeBridge(from, hit.path); return; }
    state.bridgeFrom = null;
  }

  select(hit.path);
  expand(state.tree, hit.path, { retain: state.retain, steer: state.steer });
  relayout();
  // The tree just changed shape — a fan opened and the branches beside it
  // folded — so re-frame rather than leaving the reader looking at where the
  // old one used to be.
  fit();
  requestTiles();
}

canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  reanchor();
});

canvas.addEventListener('pointermove', (ev) => {
  if (pointers.has(ev.pointerId)) {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    drive();
    return;
  }
  // Hover, which only a mouse has. A finger that is not down is not anywhere.
  const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);
  const hit = pick(wx, wy);
  const id = hit ? (hit.path ? pathToText(hit.path) : hit.id) : null;
  if (id !== state.hover) { state.hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; draw(); }
});

function release(ev) {
  const was = gest;
  const last = pointers.size === 1 && pointers.has(ev.pointerId);
  pointers.delete(ev.pointerId);
  // A tap is the LAST finger leaving having never moved and never had company:
  // the end of a pinch is not a click on whatever was under one of the fingers.
  if (last && was && !was.moved && !was.everTwo) tapAt(ev.clientX, ev.clientY);
  reanchor();
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const [cx, cy] = centre();
  state.view = wheelStep(state.view, ev.clientX, ev.clientY, cx, cy, ev.deltaY);
  draw();
}, { passive: false });

window.addEventListener('resize', draw);

// ────────────────────────────────────────────────────────── the lineage ──

function select(path) {
  const id = pathToText(path);
  if (!nodeAt(state.tree, path)) return;
  state.selected = id;

  const search = new URLSearchParams(location.search);
  if (id) search.set('p', id); else search.delete('p');
  const q = search.toString();
  history.replaceState(null, '', q ? `${location.pathname}?${q}` : location.pathname);

  const steps = foldTo(path);
  const rail = $('lineage');
  rail.innerHTML = '';
  if (!steps.length) {
    rail.appendChild(el('p', 'muted', 'the seed, untouched. click any tile to grow it.'));
  } else {
    for (const step of steps) {
      const row = el('div', 'step');
      row.appendChild(el('span', 'step-n', String(step.depth)));
      row.appendChild(el('span', null, describeStep(step)));
      rail.appendChild(row);
    }
    const n = steps[steps.length - 1].stack.length;
    rail.appendChild(el('p', 'muted', `${n} effect${n === 1 ? '' : 's'} in the stack`));
  }
  $('open').disabled = false;
  $('addr').textContent = id ? `#${id}` : 'root';
  draw();
}

/** Show a step on the arc: it becomes what `open in /shop` will hand over. */
function selectBridgeStep(index) {
  const b = state.bridge;
  if (!b) return;
  const tile = b.tiles[index];
  if (!tile) return;
  state.selected = tile.id;
  const search = new URLSearchParams(location.search);
  search.set('p', b.fromId); search.set('to', b.toId); search.set('i', String(index));
  history.replaceState(null, '', `${location.pathname}?${search}`);
  $('addr').textContent = `${b.fromId || 'seed'} → ${b.toId} · ${Math.round(tile.t * 100)}%`;
  const rail = $('lineage');
  rail.innerHTML = '';
  rail.appendChild(el('p', 'muted',
    `${Math.round(tile.t * 100)}% of the way from ${b.fromId ? `#${b.fromId}` : 'the seed'} to #${b.toId}.`));
  for (const change of b.changes) {
    const row = el('div', 'step');
    row.appendChild(el('span', 'step-n', '·'));
    row.appendChild(el('span', null, change));
    rail.appendChild(row);
  }
  rail.appendChild(el('p', 'muted', `${tile.stack.length} effect${tile.stack.length === 1 ? '' : 's'} in the stack`));
  $('open').disabled = false;
  draw();
}

/** Plant a bridge step in the tree so it can be grown from. */
function growFrom(tile) {
  state.origins[tile.id] = tile.stack;
  const path = [{ o: tile.id }];
  // ⚠️ Keyed by `pathText(path)`, NOT by the bare id. `pathText` terminates an
  // origin with `!`, so `2>4*2` and `2>4*2!` are different strings — keying by
  // the first meant `nodeAt` never found the node, and both the fan and the
  // selection silently did nothing at all.
  if (!nodeAt(state.tree, path)) {
    state.tree.nodes.set(pathText(path), {
      path, parent: null, x: tile.x, y: tile.y,
      // point its fan away from the arc, so the six do not sit on the steps
      // either side of the one you opened
      angle: Math.atan2(tile.y, tile.x),
      open: false,
    });
  }
  expand(state.tree, path, { retain: state.retain, steer: state.steer });
  relayout();
  requestTiles();
  fit();
  status(`growing from ${Math.round(tile.t * 100)}% along the arc — `
    + `six variations on a picture that is part one end and part the other`);
}

/** The path a rendered id came from, for a re-roll. */
const parsePathIn = (id) => parsePath(id);

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ───────────────────────────────────────────────── the door into /shop ──

/**
 * Build the recipe for the selected node and hand it to shop.
 *
 * The recipe is shop's own format — `serialize()` over a one-layer document
 * whose layer carries the stack — so shop's existing `#r=` boot applies it with
 * no new code on that side. Only the *seed* needed a new door: a picture
 * dragged in here has no URL, so it goes into IndexedDB and shop is told the
 * key.
 */
function openInShop() {
  try { doOpenInShop(); } catch (err) {
    status(`could not open that in /shop — ${err.message}`);
  }
}

/** Synchronous from the click to the navigation. See `startFrom` for why. */
function doOpenInShop() {
  if (!state.seed || state.selected === null) return;
  // A bridge step has no path — its stack was blended, not folded — so it is
  // read straight off the arc rather than recomputed from an address.
  const onArc = state.bridge?.tiles.find((t) => t.id === state.selected);
  const path = onArc ? [] : parsePath(state.selected);
  const stack = onArc
    ? onArc.stack
    : (foldTo(path).slice(-1)[0]?.stack || []);

  const doc = createDoc(state.seed.W, state.seed.H, { name: state.seed.name || 'bloom' });
  // The document seed is what shop's stack runner derives every effect's own
  // seed from, so it has to be the string the worker rendered this tile with or
  // the noise lands somewhere else and the picture that opens is not quite the
  // picture that was clicked.
  //
  // The STACK goes over untouched, and that is the whole point: it is authored
  // at the document's real resolution and the worker divided its lengths down
  // to preview it at 168px (core/scale.js). Hand over what the tile rendered
  // and shop would show you a fourteenth of the effect you clicked on.
  doc.seed = `bloom/${state.selected}`;
  const layer = makeLayer({
    kind: 'raster', name: state.seed.name || 'seed',
    W: state.seed.W, H: state.seed.H, pixels: makeRGBA(state.seed.W, state.seed.H),
  });
  layer.fx = stack;
  addLayer(doc, layer);

  const recipe = encodeRecipe(doc);
  let url;
  if (state.seed.url) {
    url = `/shop/?u=${encodeURIComponent(state.seed.url)}#r=${recipe}`;
  } else if (state.seedKey) {
    url = `/shop/?seed=${encodeURIComponent(state.seedKey)}#r=${recipe}`;
  } else {
    throw new Error(state.seedError
      ? `this browser would not hold the picture (${state.seedError}) — save it and open /shop directly`
      : 'the picture is still being put aside; try again in a moment');
  }
  location.href = url;
}

function status(text) { $('stat').textContent = text; }

// ────────────────────────────────────────────────────────────── booting ──

$('open').onclick = openInShop;
// Zoom without a way back is a trap: two fingers can put you a long way from
// anything, and unlike a map there is no horizon to steer by.
$('refit').onclick = fit;

// ── keep every branch ──
$('retain').onclick = () => {
  state.retain = !state.retain;
  $('retain').classList.toggle('on', state.retain);
  $('retain').textContent = state.retain ? 'keeping all' : 'keep all';
  if (state.retain) {
    relayout();
    status('every branch you open now stays open — the graph is laid out to keep tiles apart');
  } else {
    // Folding back is a real collapse, not a hide: the branches you left go,
    // and their addresses still rebuild them if you walk back.
    expand(state.tree, parsePath(state.selected || ''), { retain: false });
    status('back to one open branch at a time');
  }
  fit();
  requestTiles();
};

// ── steer the next fan ──
$('steer').onchange = () => {
  state.steer = $('steer').value || null;
  status(state.steer
    ? `the next fan you open will be drawn from ${state.steer} — reroll to redraw this one`
    : 'fans draw from all fifty-seven again');
};

// ── cycles ──
$('bridge').onclick = () => {
  if (!state.seed) return;
  if (state.bridge) {
    state.bridge = null;
    $('bridge').classList.remove('on');
    status('arc cleared');
    draw();
    return;
  }
  state.bridgeFrom = parsePath(state.selected || '');
  $('bridge').classList.add('on');
  status(`bridging from ${state.selected ? `#${state.selected}` : 'the seed'} — now tap the other end`);
};

/**
 * Six different children for the node you are looking at.
 *
 * The variant rides on the CHILDREN's path elements, so the node you rerolled
 * keeps its own picture and its own address — and the new children get new
 * addresses, which is what lets a rerolled branch be shared at all. Anything
 * below them goes: it was a fold through a stack that no longer exists.
 */
$('reroll').onclick = () => {
  if (!state.seed) return;
  const path = parsePath(state.selected || '');
  const at = pathToText(path);
  const next = (state.fans[at] || 0) + 1;
  state.fans[at] = next;
  reroll(state.tree, path, next, { steer: state.steer, retain: state.retain });
  relayout();
  requestTiles();
  fit();
  status(`a different six from ${at ? `#${at}` : 'the seed'} — reroll again for six more`);
};
$('regrow').onclick = () => {
  if (!state.seed) return;
  // A different web from the same picture: change the root key, keep the seed.
  state.root = `${state.root}+`;
  state.tree = createTree();
  state.tiles.clear(); state.pending.clear(); state.salts = {}; state.fans = {};
  state.worker.postMessage({ type: 'seed', pixels: state.seed.px.buffer.slice(0), W: state.seed.W, H: state.seed.H, root: state.root });
  expand(state.tree, []);
  select([]);
  fit();
  requestTiles();
};
$('browse').onclick = () => $('file').click();
$('file').onchange = async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const seed = await seedFromBlob(f, f.name.replace(/\.[a-z]+$/i, ''));
  seed.blob = f;
  startFrom(seed);
};
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  const seed = await seedFromBlob(f, f.name.replace(/\.[a-z]+$/i, ''));
  seed.blob = f;
  startFrom(seed);
});

// Two ways a picture arrives without anyone touching the file input.
//
// `?u=` — a link, which is how /explore's lightbox opens one here.
// `?seed=` — a picture that exists only in another tab of this browser, handed
//   over through IndexedDB. /shop uses it to send its composite: what is on
//   screen, flattened, because bloom grows a web from ONE picture and has
//   nowhere to put a layer stack.
(async () => {
  const params = new URLSearchParams(location.search);
  const key = params.get('seed');
  if (key) {
    try {
      const blob = await peek(key);
      if (!blob) throw new Error('hand-offs last half an hour, and only in the browser that made one');
      const seed = await seedFromBlob(blob, 'from /shop');
      seed.blob = blob;
      startFrom(seed);
    } catch (err) {
      $('veil-err').hidden = false;
      $('veil-err').textContent = `could not pick that picture up — ${err.message}`;
    }
    return;
  }
  const u = params.get('u');
  if (!u) return;
  const proxied = /(^https?:)?\/\/[^/]*bsky\.app\//.test(u) ? `/api/img?u=${encodeURIComponent(u)}` : u;
  try {
    const blob = await (await fetch(proxied)).blob();
    const seed = await seedFromBlob(blob, 'linked picture');
    seed.blob = blob;
    seed.url = u;
    startFrom(seed);
  } catch (err) {
    $('veil-err').hidden = false;
    $('veil-err').textContent = `could not load that picture — ${err.message}`;
  }
})();
