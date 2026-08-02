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
  TILE, bounds, createTree, edges, expand, hitTest, nodeAt, pathToText, revealPath,
} from './tree.js';
import { describeStep, lineage, parsePath } from './mutate.js';
import { createDoc, addLayer, makeLayer, encodeRecipe } from '../../shop/js/core/doc.js';
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

  $('veil').hidden = true;
  $('stage').hidden = false;

  state.worker?.terminate();
  state.worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  state.worker.onmessage = onTile;
  state.worker.postMessage({ type: 'seed', pixels: px.buffer.slice(0), W, H, root: state.root }, []);

  const wanted = parsePath(new URLSearchParams(location.search).get('p'));
  revealPath(state.tree, wanted);
  expand(state.tree, wanted.length ? wanted : []);
  select(wanted);
  fit();
  requestTiles();
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
  const k = THUMB / Math.max(bmp.width, bmp.height);
  const W = Math.max(1, Math.round(bmp.width * k));
  const H = Math.max(1, Math.round(bmp.height * k));
  const c = new OffscreenCanvas(W, H);
  const cc = c.getContext('2d', { willReadFrequently: true });
  cc.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  return { px: new Uint8ClampedArray(cc.getImageData(0, 0, W, H).data), W, H, name };
}

// ─────────────────────────────────────────────────────────────── the web ──

function onTile(ev) {
  const m = ev.data;
  if (m.type === 'ready') return;
  if (m.type !== 'tile') return;
  const px = new Uint8ClampedArray(m.pixels);
  if (m.salt) state.salts[m.id] = m.salt;
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
    .filter((p) => !state.tiles.has(p.join('.')) && !state.pending.has(p.join('.')))
    .sort((a, b) => a.length - b.length);
  if (!want.length) return;
  for (const p of want) state.pending.add(p.join('.'));
  state.worker.postMessage({ type: 'render', paths: want });
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

  const size = TILE * zoom;
  for (const node of state.tree.nodes.values()) {
    const id = node.path.join('.');
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
      if (!node.open && node.path.length) {
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

/** Centre and scale on everything currently placed, never magnifying past 1:1
 *  — a first ring blown up to fill a desktop looks like an error, not a fan. */
function fit() {
  const b = bounds(state.tree, TILE * 0.7);
  const cssW = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
  const zoom = Math.min(1, cssW / b.w, cssH / b.h);
  state.view = { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: Math.max(0.15, zoom) };
  draw();
}

function screenToWorld(sx, sy) {
  const r = canvas.getBoundingClientRect();
  const { x, y, zoom } = state.view;
  return [(sx - r.left - r.width / 2) / zoom + x, (sy - r.top - r.height / 2) / zoom + y];
}

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  drag = { x: ev.clientX, y: ev.clientY, vx: state.view.x, vy: state.view.y, moved: false };
});
canvas.addEventListener('pointermove', (ev) => {
  if (drag) {
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    state.view.x = drag.vx - dx / state.view.zoom;
    state.view.y = drag.vy - dy / state.view.zoom;
    draw();
    return;
  }
  const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);
  const hit = hitTest(state.tree, wx, wy, TILE * 0.6);
  const id = hit ? hit.path.join('.') : null;
  if (id !== state.hover) { state.hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; draw(); }
});
canvas.addEventListener('pointerup', (ev) => {
  const wasDrag = drag?.moved;
  drag = null;
  if (wasDrag) return;
  const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);
  const hit = hitTest(state.tree, wx, wy, TILE * 0.6);
  if (!hit) return;
  select(hit.path);
  expand(state.tree, hit.path);
  // The tree just changed shape — a fan opened and the branches beside it
  // folded — so re-frame rather than leaving the reader looking at where the
  // old one used to be.
  fit();
  requestTiles();
});
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);
  const next = Math.min(3, Math.max(0.15, state.view.zoom * Math.exp(-ev.deltaY * 0.0015)));
  // keep the point under the cursor fixed
  state.view.x = wx - (wx - state.view.x) * (state.view.zoom / next);
  state.view.y = wy - (wy - state.view.y) * (state.view.zoom / next);
  state.view.zoom = next;
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

  const steps = lineage(state.root, path, { salts: state.salts });
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
async function openInShop() {
  if (!state.seed || state.selected === null) return;
  const path = parsePath(state.selected);
  const steps = lineage(state.root, path, { salts: state.salts });
  const stack = steps.length ? steps[steps.length - 1].stack : [];

  const doc = createDoc(state.seed.W, state.seed.H, { name: state.seed.name || 'bloom' });
  // The document seed is what shop's stack runner derives every effect's own
  // seed from, so it has to be the string the worker rendered this tile with or
  // the noise lands somewhere else and the picture that opens is not quite the
  // picture that was clicked. (The rest of the gap is unavoidable and worth
  // saying out loud: the tile was 168px and the editor opens at up to 2400, so
  // anything measured in pixels — a blur radius, a halftone cell — is
  // proportionally smaller there. The recipe is faithful; the scale is not.)
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
  } else {
    const key = await putSeed(state.seed.blob);
    url = `/shop/?seed=${encodeURIComponent(key)}#r=${recipe}`;
  }
  location.href = url;
}

function status(text) { $('stat').textContent = text; }

// ────────────────────────────────────────────────────────────── booting ──

$('open').onclick = openInShop;
$('regrow').onclick = () => {
  if (!state.seed) return;
  // A different web from the same picture: change the root key, keep the seed.
  state.root = `${state.root}+`;
  state.tree = createTree();
  state.tiles.clear(); state.pending.clear(); state.salts = {};
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
