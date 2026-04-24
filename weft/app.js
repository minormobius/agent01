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
  drag: null,          // { startX, startY, viewX, viewY }
  hover: null,         // hovered node
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

async function fetchThread(atUri) {
  const params = new URLSearchParams({
    uri: atUri,
    depth: '100',
    parentHeight: '100',
  });
  const res = await fetch(`${PUBLIC_API}/xrpc/app.bsky.feed.getPostThread?${params}`);
  if (!res.ok) throw new Error(`getPostThread ${res.status}`);
  const data = await res.json();
  if (!data.thread) throw new Error('no thread returned');
  return data.thread;
}

/** Walk up the parent chain to the true root of the thread. */
function climbToRoot(node) {
  let cur = node;
  while (cur?.parent && cur.parent.$type !== 'app.bsky.feed.defs#notFoundPost' &&
         cur.parent.$type !== 'app.bsky.feed.defs#blockedPost') {
    cur = cur.parent;
  }
  return cur;
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

// ─── Tidy tree layout (Buchheim/Reingold-Tilford variant) ────────

const NODE_W = 260;
const NODE_H = 96;
const H_GAP = 24;   // between siblings
const V_GAP = 44;   // between depth levels

/**
 * Minimal Reingold-Tilford style layout. Each node gets x,y (top-left of box).
 * Walks tree once bottom-up to place children, shifts overlaps by subtree width.
 * Not a fully optimal RT — good enough for ~thousand-node threads.
 */
function layout(root) {
  // Pass 1: compute subtree width (in node units) for each node.
  function measure(n) {
    if (!n.children.length) { n._w = 1; return 1; }
    let total = 0;
    for (const c of n.children) total += measure(c);
    n._w = Math.max(1, total);
    return n._w;
  }
  measure(root);

  // Pass 2: assign positions.
  const unit = NODE_W + H_GAP;
  function place(n, leftUnit, depth) {
    const y = depth * (NODE_H + V_GAP);
    const cx = (leftUnit + n._w / 2) * unit;
    n.x = cx - NODE_W / 2;
    n.y = y;
    let cursor = leftUnit;
    for (const c of n.children) {
      place(c, cursor, depth + 1);
      cursor += c._w;
    }
  }
  place(root, 0, 0);

  // Collect flat list + bounds.
  const flat = [];
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  function flatten(n) {
    flat.push(n);
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + NODE_W);
    maxY = Math.max(maxY, n.y + NODE_H);
    for (const c of n.children) flatten(c);
  }
  flatten(root);
  return { flat, bounds: { minX, maxX, maxY } };
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

  // Edges first (parent -> child curves).
  ctx.strokeStyle = css('--edge');
  ctx.lineWidth = 1.4;
  for (const n of state.flat) {
    for (const c of n.children) {
      const x1 = n.x + NODE_W / 2;
      const y1 = n.y + NODE_H;
      const x2 = c.x + NODE_W / 2;
      const y2 = c.y;
      const midY = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
      ctx.stroke();
    }
  }

  // Nodes.
  for (const n of state.flat) drawNode(n, n === state.hover);

  ctx.restore();
}

function drawNode(n, isHover) {
  const x = n.x, y = n.y, w = NODE_W, h = NODE_H;
  const isRoot = n.parentId === null;

  // Card background.
  ctx.fillStyle = css('--node');
  ctx.strokeStyle = isHover ? css('--accent') : (isRoot ? css('--node-root') : css('--node-stroke'));
  ctx.lineWidth = isHover ? 2 : (isRoot ? 2 : 1);
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();

  // Avatar circle (top-left).
  const ax = x + 14, ay = y + 14, ar = 14;
  const img = state.avatars.get(n.author.did);
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, ax, ay, ar * 2, ar * 2);
  } else {
    // Placeholder: colored dot seeded by DID.
    ctx.fillStyle = seededColor(n.author.did || n.author.handle);
    ctx.fillRect(ax, ay, ar * 2, ar * 2);
  }
  ctx.restore();
  ctx.strokeStyle = css('--node-stroke');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2);
  ctx.stroke();

  // Handle.
  ctx.fillStyle = isRoot ? css('--node-root') : css('--text');
  ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'top';
  const handle = '@' + (n.author.handle || 'unknown');
  ctx.fillText(truncateToWidth(ctx, handle, w - 60), x + 48, y + 12);

  // Display name (small, below handle).
  if (n.author.displayName) {
    ctx.fillStyle = css('--muted');
    ctx.font = 'italic 11px ui-serif, Georgia, serif';
    ctx.fillText(truncateToWidth(ctx, n.author.displayName, w - 60), x + 48, y + 28);
  }

  // Post text (3 lines, wrapped).
  ctx.fillStyle = css('--text');
  ctx.font = '12.5px ui-serif, Georgia, serif';
  const lines = wrapText(ctx, n.text || '(no text)', w - 28, 3);
  let ty = y + 48;
  for (const line of lines) {
    ctx.fillText(line, x + 14, ty);
    ty += 15;
  }

  // Engagement row (bottom).
  ctx.fillStyle = css('--muted');
  ctx.font = '10.5px ui-monospace, Menlo, monospace';
  const eng = `♥ ${n.engagement.likes}   ↻ ${n.engagement.reposts}   ↳ ${n.engagement.replies}`;
  ctx.fillText(eng, x + 14, y + h - 16);
}

// ─── Drawing helpers ─────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  if (!text) return [];
  const words = text.replace(/\s+/g, ' ').split(' ');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      if (lines.length === maxLines - 1) {
        const rest = words.slice(i).join(' ');
        lines.push(truncateToWidth(ctx, rest, maxWidth));
        return lines;
      }
      line = word;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

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
    img.crossOrigin = 'anonymous';
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
  for (const n of state.flat) {
    if (x >= n.x && x <= n.x + NODE_W && y >= n.y && y <= n.y + NODE_H) {
      return n;
    }
  }
  return null;
}

canvas.addEventListener('mousedown', (e) => {
  state.drag = {
    startX: e.clientX, startY: e.clientY,
    viewX: state.view.x, viewY: state.view.y,
  };
  canvas.classList.add('dragging');
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

  if (state.drag) {
    state.view.x = state.drag.viewX + (e.clientX - state.drag.startX);
    state.view.y = state.drag.viewY + (e.clientY - state.drag.startY);
    hideTooltip();
    render();
    return;
  }

  const n = hitTest(sx, sy);
  if (n !== state.hover) {
    state.hover = n;
    render();
  }
  if (n) showTooltip(n, e.clientX, e.clientY);
  else hideTooltip();
});

window.addEventListener('mouseup', () => {
  state.drag = null;
  canvas.classList.remove('dragging');
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const { x: wx, y: wy } = screenToWorld(sx, sy);

  const factor = Math.exp(-e.deltaY * 0.0015);
  const newScale = Math.max(0.15, Math.min(3, state.view.scale * factor));
  state.view.scale = newScale;
  state.view.x = sx - wx * newScale;
  state.view.y = sy - wy * newScale;
  hideTooltip();
  render();
}, { passive: false });

function showTooltip(n, clientX, clientY) {
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

  // Position, clamped to viewport.
  const pad = 14;
  const ttW = tooltip.offsetWidth, ttH = tooltip.offsetHeight;
  let tx = clientX + pad, ty = clientY + pad;
  if (tx + ttW > window.innerWidth - 8) tx = clientX - ttW - pad;
  if (ty + ttH > window.innerHeight - 8) ty = clientY - ttH - pad;
  tooltip.style.left = Math.max(8, tx) + 'px';
  tooltip.style.top = Math.max(8, ty) + 'px';
}

function hideTooltip() {
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
    const raw = await fetchThread(atUri);
    const rootRaw = climbToRoot(raw);
    const tree = normalize(rootRaw);
    if (!tree) throw new Error('thread root is unavailable (blocked or deleted)');

    const { flat, bounds } = layout(tree);
    state.tree = tree;
    state.flat = flat;

    // Center view on root.
    const rootCx = tree.x + NODE_W / 2;
    state.view.scale = 1;
    state.view.x = canvas.clientWidth / 2 - rootCx;
    state.view.y = 60;

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
