/**
 * weft — bluesky thread analysis
 *
 * Tidy-tree canvas view of any Bluesky thread. Paste a bsky.app URL or
 * at:// URI, fetch the full thread (ancestors + replies), render as a
 * maximalist node tree with hover tooltips.
 *
 * Planned follow-ons: contributor Voronoi (secondary canvas), YAML export,
 * LLM-ready blog generation.
 */

import { resolveHandle } from '../packages/atproto/pds.js';

const PUBLIC_API = 'https://public.api.bsky.app';

// ─── State ────────────────────────────────────────────────────────

const state = {
  tree: null,          // normalized nested root node
  flat: [],            // flat list of laid-out nodes (for hit testing + render)
  view: { x: 0, y: 0, scale: 1 },
  drag: null,          // { startX, startY, viewX, viewY, moved }
  hover: null,         // hovered node (for stroke highlight only)
  selected: null,      // click-pinned node whose post is shown in the panel
  avatars: new Map(),  // did -> HTMLImageElement (once loaded)
};

const canvas = document.getElementById('tree-canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const statusEl = document.getElementById('status');
const urlInput = document.getElementById('url-input');
const loadBtn = document.getElementById('load-btn');
const exportBtn = document.getElementById('export-btn');

// ─── URL parsing ──────────────────────────────────────────────────

/** Accepts at://did/...post/rkey  OR  https://bsky.app/profile/{handle|did}/post/{rkey} */
async function urlToAtUri(input) {
  const raw = input.trim();
  if (!raw) throw new Error('empty input');

  if (raw.startsWith('at://')) return raw;

  const m = raw.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
  if (!m) throw new Error('not a recognizable bsky.app URL or at:// URI');

  let [, actor, rkey] = m;
  let did = actor;
  if (!actor.startsWith('did:')) {
    did = await resolveHandle(actor);
  }
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

// ─── Thread fetch + normalization ─────────────────────────────────

/**
 * Fetch a thread anchored on a specific URI. parentHeight/depth bound the
 * walk in each direction.
 */
async function fetchPostThread(atUri, depth = 0, parentHeight = 0) {
  const params = new URLSearchParams({
    uri: atUri,
    depth: String(depth),
    parentHeight: String(parentHeight),
  });
  const res = await fetch(`${PUBLIC_API}/xrpc/app.bsky.feed.getPostThread?${params}`);
  if (!res.ok) throw new Error(`getPostThread ${res.status}`);
  const data = await res.json();
  if (!data.thread) throw new Error('no thread returned');
  return data.thread;
}

/**
 * Resolve the root URI of the thread, then fetch the full subtree from there —
 * chasing ALL truncated branches until the whole thread is loaded.
 *
 * The public Bluesky API caps depth at ~6-10 levels per getPostThread call.
 * Threads hundreds of posts deep need multiple fetches. Strategy (borrowed
 * from photo/thread): after the initial fetch, walk the tree looking for
 * nodes whose replyCount > 0 but whose replies array is empty — those are
 * truncations. Re-fetch anchored on each truncated node and graft the
 * returned replies in place. Repeat until no truncations remain.
 *
 * We chase ALL branches (not just the OP chain) because weft visualizes the
 * whole conversation. Fetches run in parallel batches for speed.
 */
const API_DEPTH = 10;
const CHASE_BATCH = 6;
const MAX_CHASES = 80;  // safety cap — ~800 posts beyond the initial fetch

async function fetchThread(atUri, onProgress) {
  // Step 1: probe to find the true root URI.
  const probe = await fetchPostThread(atUri, 0, 0);
  const rootUri = probe?.post?.record?.reply?.root?.uri || atUri;

  // Step 2: anchor on root and grab as deep as the API will give us.
  const root = await fetchPostThread(rootUri, API_DEPTH, 0);
  if (onProgress) onProgress({ fetched: 1 });

  // Step 3: chase truncated branches until exhausted.
  let chases = 0;
  while (chases < MAX_CHASES) {
    const truncated = findTruncated(root).slice(0, CHASE_BATCH);
    if (!truncated.length) break;

    const results = await Promise.all(
      truncated.map(n => fetchPostThread(n.post.uri, API_DEPTH, 0).catch(() => null))
    );
    for (let i = 0; i < truncated.length; i++) {
      const node = truncated[i];
      const deeper = results[i];
      if (deeper?.$type === 'app.bsky.feed.defs#threadViewPost' && deeper.replies?.length) {
        node.replies = deeper.replies;
      } else {
        // replyCount claimed children but the API returned none — blocked,
        // deleted, or just stale. Mark so we don't retry.
        node._chased = true;
      }
    }
    chases += truncated.length;
    if (onProgress) onProgress({ fetched: 1 + chases });
  }

  return root;
}

/** Find all nodes that expect more replies than we have loaded. */
function findTruncated(root) {
  const out = [];
  function walk(node) {
    if (!node || node.$type !== 'app.bsky.feed.defs#threadViewPost') return;
    if (node._chased) return;
    const replies = node.replies || [];
    const expects = (node.post?.replyCount ?? 0) > 0;
    if (expects && replies.length === 0) {
      out.push(node);
      return; // will be re-fetched; its own children are unknown yet
    }
    for (const r of replies) walk(r);
  }
  walk(root);
  return out;
}

/** Turn a raw thread node into our normalized shape. Recurses children. */
function normalize(node, parentId = null, depth = 0) {
  if (!node || node.$type === 'app.bsky.feed.defs#notFoundPost' ||
      node.$type === 'app.bsky.feed.defs#blockedPost') {
    return null;
  }
  const post = node.post;
  if (!post) return null;

  const normalized = {
    id: post.uri,
    uri: post.uri,
    cid: post.cid,
    author: {
      did: post.author?.did || '',
      handle: post.author?.handle || '',
      displayName: post.author?.displayName || '',
      avatar: post.author?.avatar || '',
    },
    text: post.record?.text || '',
    createdAt: post.record?.createdAt || post.indexedAt || '',
    engagement: {
      likes: post.likeCount ?? 0,
      reposts: post.repostCount ?? 0,
      replies: post.replyCount ?? 0,
      quotes: post.quoteCount ?? 0,
    },
    embedType: post.embed?.$type || null,
    parentId,
    depth,
    children: [],
  };

  for (const reply of node.replies || []) {
    const child = normalize(reply, normalized.id, depth + 1);
    if (child) normalized.children.push(child);
  }

  // Newest-first reads oddly for threads; keep API order (roughly ranked).
  return normalized;
}

// ─── Recursive bud layout ─────────────────────────────────────────

const PFP_R = 22;                   // avatar circle radius
const CHILD_PAD = 1.0;              // angular-slot padding (1.0 = siblings tangent)
const ROOT_ARC = 2 * Math.PI;       // root has no grandparent — children form a FULL circle
const CHILD_ARC = Math.PI;          // non-root: 180° outward hemisphere (axis = grandparent→parent)

/**
 * Recursive bud-circle layout. Each internal node becomes the center of a
 * circle on which its children sit; each child, in turn, buds its own
 * circle of grandchildren, oriented outward along the grandparent→parent
 * axis. Top-level replies form a full circle around root.
 *
 * Tightest-possible packing. For k children of radius r on an arc of θ:
 *
 *     bud = max( r / sin(θ / 2k),      (siblings mutually tangent)
 *                2 r )                 (child circle tangent to parent circle)
 *
 * For k ≤ 3 on a hemisphere, or k ≤ 6 on a full circle, the floor dominates
 * and bud collapses to exactly 1 diameter. Sibling subtrees may interleave
 * below — organic overlap is the look.
 *
 * Each node gets `cx, cy, bud, depth`. Bounds come from placed positions.
 */
function layout(root) {
  function computeBud(n) {
    if (!n.children.length) { n.bud = 0; return; }
    for (const c of n.children) computeBud(c);
    const arc = n.parentId === null ? ROOT_ARC : CHILD_ARC;
    const k = n.children.length;
    // Exact tangent packing: siblings' circles mutually tangent requires
    //   bud · sin(arc / 2k) ≥ r
    // With k=1 there's no sibling to pack against, so only the geom floor
    // applies; we also cap the half-slot at π/2 so the formula behaves on
    // a full-circle arc.
    const halfSlot = Math.min(arc / (2 * k), Math.PI / 2);
    const packed = k <= 1 ? 0 : (CHILD_PAD * PFP_R) / Math.sin(halfSlot);
    const geom = 2 * PFP_R;  // parent and child circles tangent, no gap
    n.bud = Math.max(packed, geom);
  }
  computeBud(root);

  function place(n, cx, cy, outwardAngle, depth) {
    n.cx = cx; n.cy = cy; n.depth = depth;
    if (!n.children.length) return;
    const arc = n.parentId === null ? ROOT_ARC : CHILD_ARC;
    const k = n.children.length;
    const slot = arc / k;
    let cursor = outwardAngle - arc / 2;
    for (const c of n.children) {
      const childAngle = cursor + slot / 2;
      const childX = cx + n.bud * Math.cos(childAngle);
      const childY = cy + n.bud * Math.sin(childAngle);
      place(c, childX, childY, childAngle, depth + 1);
      cursor += slot;
    }
  }
  // Root's outward axis: down. With ROOT_ARC = 2π this only affects where
  // the first child lands, not the overall shape (they still wrap 360°).
  place(root, 0, 0, Math.PI / 2, 0);

  const flat = [];
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  function flatten(n) {
    flat.push(n);
    if (n.cx - PFP_R < minX) minX = n.cx - PFP_R;
    if (n.cx + PFP_R > maxX) maxX = n.cx + PFP_R;
    if (n.cy - PFP_R < minY) minY = n.cy - PFP_R;
    if (n.cy + PFP_R > maxY) maxY = n.cy + PFP_R;
    for (const c of n.children) flatten(c);
  }
  flatten(root);
  return { flat, bounds: { minX, maxX, minY, maxY } };
}

// ─── Rendering ────────────────────────────────────────────────────

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const { clientWidth, clientHeight } = canvas;
  canvas.width = clientWidth * dpr;
  canvas.height = clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function render() {
  if (!state.tree) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const { clientWidth: W, clientHeight: H } = canvas;
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.translate(state.view.x, state.view.y);
  ctx.scale(state.view.scale, state.view.scale);

  // Edges: straight lines from parent center to child center. In the
  // bud-circle layout children sit on the parent's circle, so a straight
  // radial spoke is the honest visual — no arcing across other children.
  ctx.strokeStyle = css('--edge');
  ctx.lineWidth = 1;
  for (const n of state.flat) {
    for (const c of n.children) {
      ctx.beginPath();
      ctx.moveTo(n.cx, n.cy);
      ctx.lineTo(c.cx, c.cy);
      ctx.stroke();
    }
  }

  // Nodes (circles).
  for (const n of state.flat) drawNode(n, n === state.hover, n === state.selected);

  ctx.restore();
}

function drawNode(n, isHover, isSelected) {
  const isRoot = n.parentId === null;
  const r = PFP_R;

  // Avatar fill, clipped to circle.
  const img = state.avatars.get(n.author.did);
  ctx.save();
  ctx.beginPath();
  ctx.arc(n.cx, n.cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, n.cx - r, n.cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = seededColor(n.author.did || n.author.handle);
    ctx.fillRect(n.cx - r, n.cy - r, r * 2, r * 2);
  }
  ctx.restore();

  // Stroke: hover/selected/root take precedence over the default thin ring.
  let strokeCol, strokeW;
  if (isSelected)   { strokeCol = css('--accent');     strokeW = 3; }
  else if (isHover) { strokeCol = css('--accent');     strokeW = 2; }
  else if (isRoot)  { strokeCol = css('--node-root');  strokeW = 2; }
  else              { strokeCol = css('--node-stroke');strokeW = 1; }
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.arc(n.cx, n.cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

// ─── Drawing helpers ─────────────────────────────────────────────

function seededColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 40%, 60%)`;
}

// ─── Avatar loading ──────────────────────────────────────────────

function loadAvatars(nodes) {
  const seen = new Set();
  for (const n of nodes) {
    const did = n.author.did;
    if (!did || seen.has(did) || !n.author.avatar) continue;
    seen.add(did);
    const img = new Image();
    // No crossOrigin: Bluesky's avatar CDN doesn't serve CORS headers,
    // so setting it would block the load. We only drawImage, never
    // getImageData, so a tainted canvas is fine.
    img.onload = () => { state.avatars.set(did, img); render(); };
    img.onerror = () => {};
    img.src = n.author.avatar;
  }
}

// ─── Interaction: pan, zoom, hover ───────────────────────────────

function screenToWorld(sx, sy) {
  return {
    x: (sx - state.view.x) / state.view.scale,
    y: (sy - state.view.y) / state.view.scale,
  };
}

function hitTest(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  // Walk back-to-front so deeper-drawn nodes win when circles overlap.
  for (let i = state.flat.length - 1; i >= 0; i--) {
    const n = state.flat[i];
    if (Math.hypot(x - n.cx, y - n.cy) <= PFP_R) return n;
  }
  return null;
}

const DRAG_THRESHOLD = 5; // px (forgiving enough for touch)
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

const pointers = new Map(); // pointerId -> { x, y }

function zoomAt(sx, sy, newScale) {
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  const { x: wx, y: wy } = screenToWorld(sx, sy);
  state.view.scale = clamped;
  state.view.x = sx - wx * clamped;
  state.view.y = sy - wy * clamped;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    state.drag = {
      startX: e.clientX, startY: e.clientY,
      viewX: state.view.x, viewY: state.view.y,
      moved: false, pointerId: e.pointerId,
    };
  } else if (pointers.size === 2) {
    const rect = canvas.getBoundingClientRect();
    const [a, b] = [...pointers.values()];
    const cx = (a.x + b.x) / 2 - rect.left;
    const cy = (a.y + b.y) / 2 - rect.top;
    state.pinch = {
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startScale: state.view.scale,
      // World point under the finger midpoint at pinch start — stays pinned
      // to the midpoint as fingers translate/spread.
      worldX: (cx - state.view.x) / state.view.scale,
      worldY: (cy - state.view.y) / state.view.scale,
    };
    state.drag = null; // cancel single-pointer drag when second finger lands
    canvas.classList.remove('dragging');
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) {
    // Bare hover (mouse without button pressed). Still want the cursor affordance.
    const rect = canvas.getBoundingClientRect();
    const n = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (n !== state.hover) {
      state.hover = n;
      canvas.style.cursor = n ? 'pointer' : 'grab';
      render();
    }
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Two-finger pinch + translate: the world point that was under the finger
  // midpoint at pinch start stays pinned to the current midpoint.
  if (pointers.size === 2 && state.pinch) {
    const rect = canvas.getBoundingClientRect();
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const cx = (a.x + b.x) / 2 - rect.left;
    const cy = (a.y + b.y) / 2 - rect.top;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
      state.pinch.startScale * (dist / state.pinch.startDist)));
    state.view.scale = newScale;
    state.view.x = cx - state.pinch.worldX * newScale;
    state.view.y = cy - state.pinch.worldY * newScale;
    render();
    if (state.selected) positionPanel(state.selected);
    return;
  }

  // Single-pointer drag (with click-vs-drag threshold).
  if (state.drag && e.pointerId === state.drag.pointerId) {
    const dx = e.clientX - state.drag.startX;
    const dy = e.clientY - state.drag.startY;
    if (!state.drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      state.drag.moved = true;
      canvas.classList.add('dragging');
    }
    if (state.drag.moved) {
      state.view.x = state.drag.viewX + dx;
      state.view.y = state.drag.viewY + dy;
      render();
      if (state.selected) positionPanel(state.selected);
    }
  }
});

function endPointer(e) {
  const hadPointer = pointers.delete(e.pointerId);
  if (pointers.size < 2) state.pinch = null;

  if (!hadPointer || !state.drag || e.pointerId !== state.drag.pointerId) return;

  const wasClick = !state.drag.moved;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  state.drag = null;
  canvas.classList.remove('dragging');

  if (wasClick && pointers.size === 0) {
    const n = hitTest(sx, sy);
    if (n) {
      state.selected = (state.selected === n) ? null : n;
      if (state.selected) showPanel(state.selected);
      else hidePanel();
    } else {
      state.selected = null;
      hidePanel();
    }
    render();
  }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoomAt(sx, sy, state.view.scale * factor);
  render();
  if (state.selected) positionPanel(state.selected);
}, { passive: false });

function showPanel(n) {
  const eng = n.engagement;
  const when = n.createdAt ? new Date(n.createdAt).toLocaleString() : '';
  tooltip.innerHTML = '';

  const author = document.createElement('div');
  author.className = 't-author';
  author.textContent = '@' + n.author.handle + (n.author.displayName ? ` · ${n.author.displayName}` : '');

  const body = document.createElement('div');
  body.className = 't-body';
  body.textContent = n.text || '(no text)';

  const meta = document.createElement('div');
  meta.className = 't-meta';
  meta.innerHTML =
    `<span>♥ ${eng.likes}</span>` +
    `<span>↻ ${eng.reposts}</span>` +
    `<span>↳ ${eng.replies}</span>` +
    (when ? `<span>${when}</span>` : '');

  tooltip.append(author, body, meta);
  tooltip.classList.remove('hidden');
  positionPanel(n);
}

function positionPanel(n) {
  // Pin to the right of the selected circle; flip left if it overflows.
  const rect = canvas.getBoundingClientRect();
  const screenCx = state.view.x + n.cx * state.view.scale;
  const screenCy = state.view.y + n.cy * state.view.scale;
  const screenR  = PFP_R * state.view.scale;
  const pad = 12;
  const ttW = tooltip.offsetWidth, ttH = tooltip.offsetHeight;
  let cx = rect.left + screenCx + screenR + pad;
  let cy = rect.top + screenCy - ttH / 2;
  if (cx + ttW > window.innerWidth - 8) {
    cx = rect.left + screenCx - screenR - ttW - pad;
  }
  if (cy < 8) cy = 8;
  if (cy + ttH > window.innerHeight - 8) cy = window.innerHeight - ttH - 8;
  tooltip.style.left = Math.max(8, cx) + 'px';
  tooltip.style.top = cy + 'px';
}

function hidePanel() {
  tooltip.classList.add('hidden');
}

// ─── Load flow ───────────────────────────────────────────────────

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

async function loadFromInput(input) {
  setStatus('resolving…');
  exportBtn.disabled = true;
  try {
    const atUri = await urlToAtUri(input);
    setStatus('fetching thread…');
    const rootRaw = await fetchThread(atUri, ({ fetched }) => {
      setStatus(`chasing thread… (${fetched} fetch${fetched === 1 ? '' : 'es'})`);
    });
    const tree = normalize(rootRaw);
    if (!tree) throw new Error('thread root is unavailable (blocked or deleted)');

    const { flat, bounds } = layout(tree);
    state.tree = tree;
    state.flat = flat;
    state.selected = null;
    state.hover = null;
    hidePanel();

    // Fit the bud to the canvas and center it. Root is at world origin, but
    // the tree grows in all directions; use the full bounds box for fitting.
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const pad = 24;
    const wantW = (bounds.maxX - bounds.minX) + pad * 2;
    const wantH = (bounds.maxY - bounds.minY) + pad * 2;
    const MIN_FIT_SCALE = 0.35;
    state.view.scale = Math.max(MIN_FIT_SCALE, Math.min(1, W / wantW, H / wantH));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    state.view.x = W / 2 - cx * state.view.scale;
    state.view.y = H / 2 - cy * state.view.scale;

    render();
    loadAvatars(flat);

    const count = flat.length;
    setStatus(`loaded ${count} post${count === 1 ? '' : 's'} · ${tree.author.handle ? '@' + tree.author.handle : 'root'}`);
    exportBtn.disabled = false;

    // Reflect in URL for shareability.
    const qp = new URLSearchParams(window.location.search);
    qp.set('uri', atUri);
    history.replaceState(null, '', '?' + qp.toString());
  } catch (err) {
    console.error(err);
    setStatus('error: ' + err.message, true);
  }
}

// ─── Wire up ─────────────────────────────────────────────────────

loadBtn.addEventListener('click', () => loadFromInput(urlInput.value));
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadFromInput(urlInput.value);
});

exportBtn.addEventListener('click', () => {
  // Placeholder — YAML export lands in the next increment.
  setStatus('yaml export coming in the next commit');
});

window.addEventListener('resize', resize);
resize();

// Query params: ?uri=at://... or ?url=https://bsky.app/...
const qp = new URLSearchParams(window.location.search);
const seed = qp.get('uri') || qp.get('url');
if (seed) {
  urlInput.value = seed;
  loadFromInput(seed);
}
