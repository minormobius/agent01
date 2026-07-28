// board/engine.js — the pure core of the infinite canvas.
//
// Everything in this file is a plain function over plain data: no DOM, no
// fetch, no clock, no randomness that isn't seeded by an explicit argument.
// That is deliberate — the interesting parts of this app (nesting a selection
// into a child board, re-pointing the edges that used to cross the boundary,
// unpacking it again without losing them) are exactly the parts that are
// impossible to eyeball in a browser and easy to assert in a test. See
// engine.selftest.mjs; `node board/engine.selftest.mjs` runs it.
//
// Vocabulary
//   doc     one board, in memory: { rkey, uri, title, camera, items, edges, … }
//   item    one thing on the canvas: a box (x,y,w,h) + a `kind` + payload
//   edge    a connector between two item ids in the SAME doc
//   portal  an item whose payload is another board's at-uri
//   camera  { x, y, zoom } — x/y is the world point at the viewport's top-left
//
// The wire format (com.minomobi.board.canvas) nests the payload under a
// `content` union and rounds coordinates to integers; toRecord/fromRecord at
// the bottom of this file are the only place that shape is known.

// ---------------------------------------------------------------- constants --

export const COLLECTION = 'com.minomobi.board.canvas';
export const LEX_DEFS = 'com.minomobi.board.defs';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export const TINTS = ['slate', 'amber', 'rose', 'violet', 'teal', 'lime'];

/** Default box per kind, in world units. A world unit is one CSS pixel at 100%. */
export const DEFAULT_SIZE = {
  text: { w: 260, h: 140 },
  image: { w: 320, h: 240 },
  audio: { w: 300, h: 96 },
  weblink: { w: 300, h: 132 },
  file: { w: 240, h: 96 },
  portal: { w: 260, h: 168 },
  frame: { w: 640, h: 440 },
  ink: { w: 320, h: 240 },
  embed: { w: 320, h: 180 },
};

export const KINDS = Object.keys(DEFAULT_SIZE);

/** Union member NSID <-> in-memory kind. */
const KIND_TO_TYPE = Object.fromEntries(KINDS.map((k) => [k, `${LEX_DEFS}#${k}`]));
const TYPE_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_TYPE).map(([k, v]) => [v, k]));

/** A board record is capped at 2000 items by the lexicon, but the PDS caps the
 *  record itself near 1 MB. These are the thresholds the UI nags at — and the
 *  reason nesting is the primary organising gesture rather than a nicety. */
export const SIZE_WARN = 600 * 1024;
export const SIZE_LIMIT = 900 * 1024;

// ------------------------------------------------------------------- ids ----

// Ids only need to be unique within one board, and they need to be stable
// across a save/load round-trip. A counter seeded from the document's existing
// ids gives both without a clock or a PRNG, which keeps this file pure.

const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** Deterministic id from a numeric seed. `mint(0)` === 'i2', `mint(1)` === 'i3'. */
export function mint(n) {
  let s = '';
  let v = Math.max(0, Math.floor(n));
  do {
    s = ID_ALPHABET[v % ID_ALPHABET.length] + s;
    v = Math.floor(v / ID_ALPHABET.length);
  } while (v > 0);
  return `i${s}`;
}

/** An id-minting counter that will never collide with anything already in `doc`. */
export function idFactory(doc) {
  const taken = new Set([
    ...(doc?.items || []).map((i) => i.id),
    ...(doc?.edges || []).map((e) => e.id),
  ]);
  let n = taken.size;
  return () => {
    let id = mint(n++);
    while (taken.has(id)) id = mint(n++);
    taken.add(id);
    return id;
  };
}

// ------------------------------------------------------------ documents ----

/** A new, empty board. `rkey` is minted by the caller (a TID) so a board has a
 *  stable identity from birth — before it has ever been written to a PDS. That
 *  is what lets a portal point at a child that has not been saved yet. */
export function createBoard({ rkey = null, did = null, title = 'Untitled board', parent = null, createdAt = null } = {}) {
  return {
    rkey,
    did,
    uri: rkey && did ? atUri(did, rkey) : null,
    title,
    parent,
    createdAt,
    updatedAt: createdAt,
    background: 'dots',
    camera: { x: -600, y: -400, zoom: 1 },
    items: [],
    edges: [],
    tags: [],
  };
}

export function atUri(did, rkey, collection = COLLECTION) {
  return `at://${did}/${collection}/${rkey}`;
}

/** Split an at-uri into its parts. Returns null if it isn't one. */
export function parseAtUri(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)/.exec(String(uri || ''));
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

/** A new item. `kind` picks the default box; anything in `props` wins. */
export function createItem(kind, props = {}) {
  if (!DEFAULT_SIZE[kind]) throw new Error(`unknown item kind: ${kind}`);
  const size = DEFAULT_SIZE[kind];
  return {
    id: props.id || 'tmp',
    kind,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    z: 0,
    rotation: 0,
    tint: null,
    label: '',
    createdAt: null,
    ...props,
  };
}

export function createEdge(from, to, props = {}) {
  return {
    id: props.id || 'tmp',
    from,
    to,
    fromSide: 'auto',
    toSide: 'auto',
    style: 'arrow',
    tint: null,
    label: '',
    bend: 0,
    ...props,
  };
}

// ------------------------------------------------------------- geometry ----

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function itemBounds(item) {
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}

export function itemCenter(item) {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

/** Axis-aligned bounding box of a list of items. Null for an empty list. */
export function itemsBounds(items) {
  if (!items.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const it of items) {
    x0 = Math.min(x0, it.x);
    y0 = Math.min(y0, it.y);
    x1 = Math.max(x1, it.x + it.w);
    y1 = Math.max(y1, it.y + it.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h;
}

export function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Normalise a drag (which may run right-to-left) into a positive rect. */
export function normalizeRect(ax, ay, bx, by) {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

// ------------------------------------------------------------- camera -----

export function screenToWorld(camera, sx, sy) {
  return { x: sx / camera.zoom + camera.x, y: sy / camera.zoom + camera.y };
}

export function worldToScreen(camera, wx, wy) {
  return { x: (wx - camera.x) * camera.zoom, y: (wy - camera.y) * camera.zoom };
}

/** Zoom by `factor` while keeping the world point under (sx,sy) pinned. */
export function zoomAt(camera, sx, sy, factor) {
  const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (zoom === camera.zoom) return { ...camera };
  const w = screenToWorld(camera, sx, sy);
  return { x: w.x - sx / zoom, y: w.y - sy / zoom, zoom };
}

export function panBy(camera, dxScreen, dyScreen) {
  return { ...camera, x: camera.x - dxScreen / camera.zoom, y: camera.y - dyScreen / camera.zoom };
}

/** A camera that frames `bounds` inside a viewport, with padding in screen px. */
export function cameraFor(bounds, vw, vh, pad = 80) {
  if (!bounds || vw <= 0 || vh <= 0) return { x: -vw / 2, y: -vh / 2, zoom: 1 };
  const zoom = clamp(
    Math.min((vw - pad * 2) / Math.max(bounds.w, 1), (vh - pad * 2) / Math.max(bounds.h, 1)),
    MIN_ZOOM,
    1.5,
  );
  return {
    zoom,
    x: bounds.x + bounds.w / 2 - vw / 2 / zoom,
    y: bounds.y + bounds.h / 2 - vh / 2 / zoom,
  };
}

/** The world rect currently visible — used to skip rendering off-screen items. */
export function viewportRect(camera, vw, vh, margin = 200) {
  const tl = screenToWorld(camera, -margin, -margin);
  const br = screenToWorld(camera, vw + margin, vh + margin);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

// ---------------------------------------------------------- hit testing ---

/** Paint order: z, then array order. Frames are forced to the back so they
 *  behave like stationery rather than like a lid over their contents. */
export function paintOrder(items) {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const fa = a.it.kind === 'frame' ? 0 : 1;
      const fb = b.it.kind === 'frame' ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if ((a.it.z || 0) !== (b.it.z || 0)) return (a.it.z || 0) - (b.it.z || 0);
      return a.i - b.i;
    })
    .map((e) => e.it);
}

/** Topmost item under a world point, or null. A frame only answers on its
 *  border (12 world units) — clicking a frame's middle should select what is
 *  sitting in it, not the frame. */
export function hitTest(items, p, framePad = 12) {
  const ordered = paintOrder(items);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const it = ordered[i];
    if (!pointInRect(p, itemBounds(it))) continue;
    if (it.kind === 'frame') {
      const inner = { x: it.x + framePad, y: it.y + framePad, w: it.w - framePad * 2, h: it.h - framePad * 2 };
      if (inner.w > 0 && inner.h > 0 && pointInRect(p, inner)) continue;
    }
    return it;
  }
  return null;
}

/** Ids inside a marquee. `touch` selects anything the rect grazes; otherwise
 *  only items fully enclosed — the difference between a lasso and a net. */
export function marqueeSelect(items, rect, touch = false) {
  return items
    .filter((it) => (touch ? rectsOverlap(rect, itemBounds(it)) : rectContains(rect, itemBounds(it))))
    .map((it) => it.id);
}

/** The items a frame visually contains — what a frame-drag should carry. */
export function itemsInFrame(items, frame) {
  const r = itemBounds(frame);
  return items.filter((it) => it.id !== frame.id && rectContains(r, itemBounds(it))).map((it) => it.id);
}

// ------------------------------------------------------- edge geometry ---

const SIDES = { n: [0.5, 0], e: [1, 0.5], s: [0.5, 1], w: [0, 0.5] };

/** Which side of `item` faces `toward`. Compares the delta against the box's
 *  own aspect so a wide card connects from its short sides, not its corners. */
export function autoSide(item, toward) {
  const c = itemCenter(item);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const hx = Math.max(item.w, 1) / 2;
  const hy = Math.max(item.h, 1) / 2;
  if (Math.abs(dx) / hx >= Math.abs(dy) / hy) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

export function anchorPoint(item, side) {
  const [fx, fy] = SIDES[side] || SIDES.e;
  return { x: item.x + item.w * fx, y: item.y + item.h * fy };
}

const NORMAL = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/**
 * Where an edge starts, ends, and how it curves.
 * Returns { from, to, fromSide, toSide, path, mid, angle } — `path` is an SVG
 * `d` string, `angle` the arrowhead's heading in degrees at the `to` end.
 */
export function edgeGeometry(edge, a, b) {
  const fromSide = edge.fromSide && edge.fromSide !== 'auto' ? edge.fromSide : autoSide(a, itemCenter(b));
  const toSide = edge.toSide && edge.toSide !== 'auto' ? edge.toSide : autoSide(b, itemCenter(a));
  const p0 = anchorPoint(a, fromSide);
  const p1 = anchorPoint(b, toSide);

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const chord = Math.hypot(dx, dy) || 1;
  // Control points ride out along each anchor's normal, so a connector always
  // leaves its card perpendicular — the thing that makes arrow diagrams read.
  const reach = clamp(chord * 0.4, 24, 220);
  const [nx0, ny0] = NORMAL[fromSide];
  const [nx1, ny1] = NORMAL[toSide];
  // `bend` slides both control points sideways along the chord's perpendicular.
  const bend = (edge.bend || 0) / 100;
  const px = (-dy / chord) * chord * bend * 0.5;
  const py = (dx / chord) * chord * bend * 0.5;

  const c0 = { x: p0.x + nx0 * reach + px, y: p0.y + ny0 * reach + py };
  const c1 = { x: p1.x + nx1 * reach + px, y: p1.y + ny1 * reach + py };

  const path = `M ${r2(p0.x)} ${r2(p0.y)} C ${r2(c0.x)} ${r2(c0.y)}, ${r2(c1.x)} ${r2(c1.y)}, ${r2(p1.x)} ${r2(p1.y)}`;
  const mid = cubicAt(p0, c0, c1, p1, 0.5);
  const near = cubicAt(p0, c0, c1, p1, 0.92);
  const angle = (Math.atan2(p1.y - near.y, p1.x - near.x) * 180) / Math.PI;
  return { from: p0, to: p1, fromSide, toSide, path, mid, angle };
}

const r2 = (n) => Math.round(n * 100) / 100;

function cubicAt(p0, c0, c1, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y,
  };
}

/** Edges whose endpoints both still exist. Anything else is dropped on load —
 *  a dangling connector is worse than no connector. */
export function liveEdges(doc) {
  const ids = new Set(doc.items.map((i) => i.id));
  return doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
}

/** Collapse duplicate connectors between the same ordered pair, keeping the
 *  first. Nesting can produce these when several inner items pointed at one
 *  outer item and all of them collapse onto the portal. */
export function dedupeEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    const key = `${e.from} ${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------- mutations -----

/** Move items by a world delta. Returns a new doc. */
export function moveItems(doc, ids, dx, dy) {
  const set = new Set(ids);
  return {
    ...doc,
    items: doc.items.map((it) => (set.has(it.id) ? { ...it, x: it.x + dx, y: it.y + dy } : it)),
  };
}

/** Delete items and every edge that touched them. */
export function deleteItems(doc, ids) {
  const set = new Set(ids);
  return {
    ...doc,
    items: doc.items.filter((it) => !set.has(it.id)),
    edges: doc.edges.filter((e) => !set.has(e.from) && !set.has(e.to)),
  };
}

/** Raise items above everything else, preserving their relative order. */
export function bringToFront(doc, ids) {
  const set = new Set(ids);
  const top = doc.items.reduce((m, it) => Math.max(m, it.z || 0), 0);
  let n = 1;
  return { ...doc, items: doc.items.map((it) => (set.has(it.id) ? { ...it, z: top + n++ } : it)) };
}

export function sendToBack(doc, ids) {
  const set = new Set(ids);
  const bottom = doc.items.reduce((m, it) => Math.min(m, it.z || 0), 0);
  let n = 1;
  return { ...doc, items: doc.items.map((it) => (set.has(it.id) ? { ...it, z: bottom - n++ } : it)) };
}

/** Grid-align a selection. `axis` is 'x' (left edges) or 'y' (top edges). */
export function alignItems(doc, ids, edge) {
  const set = new Set(ids);
  const sel = doc.items.filter((it) => set.has(it.id));
  if (sel.length < 2) return doc;
  const bb = itemsBounds(sel);
  const place = (it) => {
    switch (edge) {
      case 'left': return { x: bb.x };
      case 'right': return { x: bb.x + bb.w - it.w };
      case 'top': return { y: bb.y };
      case 'bottom': return { y: bb.y + bb.h - it.h };
      case 'hcenter': return { x: bb.x + bb.w / 2 - it.w / 2 };
      case 'vcenter': return { y: bb.y + bb.h / 2 - it.h / 2 };
      default: return {};
    }
  };
  return { ...doc, items: doc.items.map((it) => (set.has(it.id) ? { ...it, ...place(it) } : it)) };
}

/** Lay a selection out on a row/column grid, in their current reading order. */
export function tidyItems(doc, ids, gap = 32) {
  const set = new Set(ids);
  const sel = doc.items.filter((it) => set.has(it.id));
  if (sel.length < 2) return doc;
  const bb = itemsBounds(sel);
  const ordered = [...sel].sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.id.localeCompare(b.id));
  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const colW = Math.max(...sel.map((i) => i.w)) + gap;
  const rowH = Math.max(...sel.map((i) => i.h)) + gap;
  const pos = new Map();
  ordered.forEach((it, n) => {
    pos.set(it.id, { x: bb.x + (n % cols) * colW, y: bb.y + Math.floor(n / cols) * rowH });
  });
  return { ...doc, items: doc.items.map((it) => (pos.has(it.id) ? { ...it, ...pos.get(it.id) } : it)) };
}

// ------------------------------------------------------------- nesting ----

/** How far a portal's box is from the selection's centre when it replaces it. */
function portalBox(center) {
  const { w, h } = DEFAULT_SIZE.portal;
  return { x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2), w, h };
}

/**
 * Nest a selection into a NEW child board.
 *
 * This is the load-bearing gesture of the whole app, so it is worth being
 * explicit about what happens to the three kinds of edge:
 *
 *   both endpoints inside   → moves into the child unchanged
 *   both endpoints outside  → stays in the parent unchanged
 *   exactly one inside      → stays in the parent, re-pointed at the portal
 *
 * The third rule is the one that matters. An edge is a claim about a
 * relationship; nesting should abstract that claim ("these three notes relate
 * to that one") rather than silently delete it. Duplicates that result from
 * several inner items sharing an outer neighbour are collapsed.
 *
 * Child items are re-centred on the origin, so the child opens looking at its
 * own contents rather than at wherever they happened to sit in the parent.
 *
 * @param {object} doc      parent board
 * @param {string[]} ids    selection
 * @param {object} child    { rkey, did, title, createdAt } for the board to mint
 * @returns {{parent: object, child: object, portalId: string}|null}
 */
export function nest(doc, ids, child) {
  const set = new Set(ids.filter((id) => doc.items.some((it) => it.id === id)));
  if (!set.size) return null;

  const moving = doc.items.filter((it) => set.has(it.id));
  const bb = itemsBounds(moving);
  const center = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };

  const nextId = idFactory(doc);
  const portal = createItem('portal', {
    id: nextId(),
    ...portalBox(center),
    board: child.rkey && child.did ? atUri(child.did, child.rkey) : null,
    rkey: child.rkey || null,
    title: child.title || 'Nested board',
    count: moving.length,
    createdAt: child.createdAt || null,
    z: Math.max(0, ...doc.items.map((i) => i.z || 0)) + 1,
  });

  const kept = doc.items.filter((it) => !set.has(it.id));
  const inside = (id) => set.has(id);

  const parentEdges = dedupeEdges(
    doc.edges
      .filter((e) => !(inside(e.from) && inside(e.to)))
      .map((e) => (inside(e.from) || inside(e.to)
        ? { ...e, from: inside(e.from) ? portal.id : e.from, to: inside(e.to) ? portal.id : e.to }
        : e)),
  );

  const childBoard = {
    ...createBoard({
      rkey: child.rkey,
      did: child.did,
      title: child.title || 'Nested board',
      parent: doc.uri || null,
      createdAt: child.createdAt || null,
    }),
    items: moving.map((it) => ({ ...it, x: it.x - center.x, y: it.y - center.y })),
    edges: doc.edges.filter((e) => inside(e.from) && inside(e.to)).map((e) => ({ ...e })),
  };

  return {
    parent: { ...doc, items: [...kept, portal], edges: parentEdges },
    child: childBoard,
    portalId: portal.id,
  };
}

/**
 * Absorb a selection into an EXISTING child board — the drag-onto-a-portal
 * gesture. Same edge rules as `nest`, except edges that were already pointing
 * at the portal survive untouched, and the incoming group is parked to the
 * right of whatever the child already holds instead of on top of it.
 *
 * @returns {{parent: object, child: object}|null}
 */
export function absorb(doc, ids, childDoc, portalId, gap = 80) {
  const portal = doc.items.find((it) => it.id === portalId && it.kind === 'portal');
  if (!portal) return null;
  const set = new Set(ids.filter((id) => id !== portalId && doc.items.some((it) => it.id === id)));
  if (!set.size) return null;

  const moving = doc.items.filter((it) => set.has(it.id));
  const bb = itemsBounds(moving);

  const existing = itemsBounds(childDoc.items) || { x: 0, y: 0, w: 0, h: 0 };
  const dx = existing.x + existing.w + gap - bb.x;
  const dy = existing.y - bb.y;

  // Ids are only unique per board, so anything that collides gets re-minted —
  // and its edges re-pointed with it.
  const nextChildId = idFactory(childDoc);
  const taken = new Set(childDoc.items.map((i) => i.id));
  const remap = new Map();
  for (const it of moving) remap.set(it.id, taken.has(it.id) ? nextChildId() : it.id);

  const inside = (id) => set.has(id);
  const incomingEdges = doc.edges
    .filter((e) => inside(e.from) && inside(e.to))
    .map((e) => ({ ...e, id: nextChildId(), from: remap.get(e.from), to: remap.get(e.to) }));

  const parentEdges = dedupeEdges(
    doc.edges
      .filter((e) => !(inside(e.from) && inside(e.to)))
      .map((e) => (inside(e.from) || inside(e.to)
        ? { ...e, from: inside(e.from) ? portalId : e.from, to: inside(e.to) ? portalId : e.to }
        : e)),
  );

  const childItems = [
    ...childDoc.items,
    ...moving.map((it) => ({ ...it, id: remap.get(it.id), x: it.x + dx, y: it.y + dy })),
  ];

  return {
    parent: {
      ...doc,
      items: doc.items
        .filter((it) => !set.has(it.id))
        .map((it) => (it.id === portalId ? { ...it, count: childItems.length } : it)),
      edges: parentEdges,
    },
    child: { ...childDoc, items: childItems, edges: [...childDoc.edges, ...incomingEdges] },
  };
}

/**
 * Unpack a portal back into its parent — the inverse of `nest`.
 *
 * The child's items land centred on where the portal sat. Edges that pointed
 * at the portal cannot be un-collapsed (the information about which inner item
 * they meant was destroyed when they merged), so each is re-attached to the
 * restored item nearest its other endpoint. Deterministic, and usually right:
 * proximity is what the layout was expressing in the first place.
 *
 * @returns {object|null} new parent doc
 */
export function unnest(doc, portalId, childDoc) {
  const portal = doc.items.find((it) => it.id === portalId);
  if (!portal || !childDoc) return null;
  const center = itemCenter(portal);

  const nextId = idFactory(doc);
  const taken = new Set(doc.items.map((i) => i.id));
  const remap = new Map();
  for (const it of childDoc.items) remap.set(it.id, taken.has(it.id) ? nextId() : it.id);

  const zTop = Math.max(0, ...doc.items.map((i) => i.z || 0));
  const restored = childDoc.items.map((it) => ({
    ...it,
    id: remap.get(it.id),
    x: it.x + center.x,
    y: it.y + center.y,
    z: (it.z || 0) + zTop,
  }));

  const restoredEdges = childDoc.edges
    .filter((e) => remap.has(e.from) && remap.has(e.to))
    .map((e) => ({ ...e, id: nextId(), from: remap.get(e.from), to: remap.get(e.to) }));

  // Re-attach the portal's own edges to the nearest restored item.
  const byId = new Map(doc.items.map((it) => [it.id, it]));
  const nearest = (other) => {
    if (!restored.length) return null;
    const oc = other ? itemCenter(other) : center;
    let best = restored[0];
    let bestD = Infinity;
    for (const it of restored) {
      const c = itemCenter(it);
      const d = (c.x - oc.x) ** 2 + (c.y - oc.y) ** 2;
      if (d < bestD || (d === bestD && it.id < best.id)) { best = it; bestD = d; }
    }
    return best.id;
  };

  const rewired = [];
  for (const e of doc.edges) {
    const fromPortal = e.from === portalId;
    const toPortal = e.to === portalId;
    if (!fromPortal && !toPortal) { rewired.push(e); continue; }
    if (fromPortal && toPortal) continue;
    const anchor = nearest(byId.get(fromPortal ? e.to : e.from));
    if (!anchor) continue;
    rewired.push({ ...e, from: fromPortal ? anchor : e.from, to: toPortal ? anchor : e.to });
  }

  return {
    ...doc,
    items: [...doc.items.filter((it) => it.id !== portalId), ...restored],
    edges: dedupeEdges([...rewired, ...restoredEdges]),
  };
}

/**
 * Stamp a repo identity onto a board that was created signed-out.
 *
 * Boards mint their own rkey at birth, so a local board already has a stable
 * identity and its portals already know which rkey they point at — they just
 * have no `at://` to say it with. Signing in fills those in, which is the
 * whole of "promote my local drafts to my PDS".
 */
export function withIdentity(doc, did) {
  if (!did || !doc?.rkey) return doc;
  return {
    ...doc,
    did,
    uri: atUri(did, doc.rkey),
    items: doc.items.map((it) => (it.kind === 'portal' && !it.board && it.rkey
      ? { ...it, board: atUri(did, it.rkey) }
      : it)),
  };
}

/** Every board an at-uri away from this one: portals out, parent back. */
export function boardLinks(doc) {
  const out = doc.items
    .filter((it) => it.kind === 'portal' && it.board)
    .map((it) => ({ uri: it.board, title: it.title, itemId: it.id }));
  return { parent: doc.parent || null, children: out };
}

// -------------------------------------------------------- serialisation ---

const int = (n) => Math.round(Number(n) || 0);
const clean = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === '' ) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out;
};

/**
 * In-memory item payload → the lexicon's `content` union member.
 *
 * Returns null when a required field is missing — notably the blob on an item
 * whose bytes have not been uploaded yet (dropped while signed out, or an
 * upload still in flight). toRecord drops those items rather than writing an
 * invalid record: a half-written item on someone's PDS is worse than an item
 * that appears one save later.
 */
function contentOf(it) {
  switch (it.kind) {
    case 'text':
      return clean({ $type: KIND_TO_TYPE.text, text: it.text || '', size: it.size, align: it.align });
    case 'image':
      if (!it.image) return null;
      return clean({ $type: KIND_TO_TYPE.image, image: it.image, alt: it.alt, aspectRatio: it.aspectRatio });
    case 'audio':
      if (!it.audio) return null;
      return clean({
        $type: KIND_TO_TYPE.audio,
        audio: it.audio,
        durationMs: it.durationMs != null ? int(it.durationMs) : undefined,
        peaks: it.peaks,
        transcript: it.transcript,
      });
    case 'weblink':
      return clean({ $type: KIND_TO_TYPE.weblink, uri: it.uri, title: it.title, description: it.description, thumb: it.thumb });
    case 'file':
      if (!it.file) return null;
      return clean({ $type: KIND_TO_TYPE.file, file: it.file, name: it.name || 'file', size: it.size != null ? int(it.size) : undefined });
    case 'portal':
      if (!it.board) return null;
      return clean({ $type: KIND_TO_TYPE.portal, board: it.board, title: it.title, count: it.count != null ? int(it.count) : undefined, thumb: it.thumb });
    case 'frame':
      return clean({ $type: KIND_TO_TYPE.frame, title: it.title });
    case 'ink':
      return clean({ $type: KIND_TO_TYPE.ink, strokes: (it.strokes || []).map((s) => clean({ points: s.points.map(int), width: s.width, tint: s.tint })) });
    case 'embed':
      return clean({ $type: KIND_TO_TYPE.embed, record: it.record, snapshot: it.snapshot });
    default:
      return null;
  }
}

/** The lexicon's `content` union member → in-memory item payload. */
function payloadOf(content) {
  const kind = TYPE_TO_KIND[content?.$type];
  if (!kind) return null;
  const { $type, ...rest } = content;
  return { kind, ...rest };
}

/**
 * doc → a com.minomobi.board.canvas record. Coordinates are rounded to
 * integers here and nowhere else: sub-pixel drift in a record that gets
 * rewritten on every drag would produce an endless stream of no-op writes.
 */
export function toRecord(doc, now) {
  const stamp = now || doc.updatedAt || doc.createdAt || '1970-01-01T00:00:00.000Z';
  return clean({
    $type: COLLECTION,
    title: doc.title || 'Untitled board',
    createdAt: doc.createdAt || stamp,
    updatedAt: stamp,
    parent: doc.parent || undefined,
    background: doc.background && doc.background !== 'dots' ? doc.background : undefined,
    camera: doc.camera
      ? { x: int(doc.camera.x), y: int(doc.camera.y), zoom: clamp(int(doc.camera.zoom * 1000), 1, MAX_ZOOM * 1000) }
      : undefined,
    tags: doc.tags,
    items: doc.items.map((it) => clean({
      id: it.id,
      x: int(it.x),
      y: int(it.y),
      w: int(it.w) || undefined,
      h: int(it.h) || undefined,
      z: it.z ? int(it.z) : undefined,
      rotation: it.rotation ? clamp(int(it.rotation), -180, 180) : undefined,
      tint: it.tint || undefined,
      label: it.label || undefined,
      createdAt: it.createdAt || undefined,
      content: contentOf(it),
    })).filter((it) => it.content),
    edges: liveEdges(doc).map((e) => clean({
      id: e.id,
      from: e.from,
      to: e.to,
      fromSide: e.fromSide && e.fromSide !== 'auto' ? e.fromSide : undefined,
      toSide: e.toSide && e.toSide !== 'auto' ? e.toSide : undefined,
      style: e.style && e.style !== 'arrow' ? e.style : undefined,
      tint: e.tint || undefined,
      label: e.label || undefined,
      bend: e.bend ? clamp(int(e.bend), -100, 100) : undefined,
    })),
  });
}

/**
 * A record (plus where it was found) → doc. Unknown union members are dropped
 * rather than rendered as a mystery box: a board written by a future client
 * should still open, minus the parts this one cannot draw.
 */
export function fromRecord(record, { did = null, rkey = null, cid = null } = {}) {
  const doc = createBoard({
    rkey,
    did,
    title: record?.title || 'Untitled board',
    parent: record?.parent || null,
    createdAt: record?.createdAt || null,
  });
  doc.cid = cid || null;
  doc.updatedAt = record?.updatedAt || record?.createdAt || null;
  doc.background = record?.background || 'dots';
  doc.tags = Array.isArray(record?.tags) ? record.tags.slice() : [];
  if (record?.camera) {
    doc.camera = {
      x: Number(record.camera.x) || 0,
      y: Number(record.camera.y) || 0,
      zoom: clamp((Number(record.camera.zoom) || 1000) / 1000, MIN_ZOOM, MAX_ZOOM),
    };
  }
  doc.items = (Array.isArray(record?.items) ? record.items : [])
    .map((raw) => {
      const payload = payloadOf(raw?.content);
      if (!payload || !raw?.id) return null;
      const size = DEFAULT_SIZE[payload.kind];
      // A portal's rkey is implied by its at-uri; unpack it once here so the
      // rest of the app never has to re-parse.
      if (payload.kind === 'portal' && payload.board) payload.rkey = parseAtUri(payload.board)?.rkey || null;
      return {
        id: String(raw.id),
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        w: Number(raw.w) || size.w,
        h: Number(raw.h) || size.h,
        z: Number(raw.z) || 0,
        rotation: Number(raw.rotation) || 0,
        tint: raw.tint || null,
        label: raw.label || '',
        createdAt: raw.createdAt || null,
        ...payload,
      };
    })
    .filter(Boolean);
  doc.edges = (Array.isArray(record?.edges) ? record.edges : [])
    .filter((e) => e?.id && e?.from && e?.to)
    .map((e) => createEdge(String(e.from), String(e.to), {
      id: String(e.id),
      fromSide: e.fromSide || 'auto',
      toSide: e.toSide || 'auto',
      style: e.style || 'arrow',
      tint: e.tint || null,
      label: e.label || '',
      bend: Number(e.bend) || 0,
    }));
  doc.edges = dedupeEdges(liveEdges(doc));
  return doc;
}

/** Serialised size of a board's record, in bytes. */
export function recordSize(doc, now) {
  return new TextEncoder().encode(JSON.stringify(toRecord(doc, now))).length;
}

/** 'ok' | 'warn' | 'over' — drives the nag that points you at nesting. */
export function sizeStatus(bytes) {
  if (bytes >= SIZE_LIMIT) return 'over';
  if (bytes >= SIZE_WARN) return 'warn';
  return 'ok';
}
