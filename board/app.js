// board/app.js — the whiteboard itself: input, tools, navigation, chrome.
//
// The interesting logic lives in engine.js (pure, tested) and store.js (the
// two-tier PDS/local persistence). This file is the part that has to talk to a
// pointer, and it is organised in the order things happen: state → render loop
// → routing → pointer → keyboard → tools → panels.

import {
  createBoard, createItem, createEdge, idFactory, DEFAULT_SIZE, TINTS,
  screenToWorld, zoomAt, panBy, cameraFor, itemsBounds, itemBounds, hitTest,
  marqueeSelect, normalizeRect, itemsInFrame, deleteItems,
  bringToFront, sendToBack, alignItems, tidyItems, nest, absorb, unnest,
  parseAtUri, clamp, MIN_ZOOM, MAX_ZOOM,
} from './engine.js';
import { BoardStore, generateTid } from './store.js';
import { Renderer, atUriToWeb } from './render.js';
import {
  shrinkImage, audioPeaks, kindForFile, VoiceRecorder, looksLikeUrl, unfurl,
  bskyPostUri, fetchPost, describeRepo, resolveHandle, MAX_BLOB, formatBytes,
} from './media.js';

// ------------------------------------------------------------------ dom ---

const $ = (sel) => document.querySelector(sel);
const dom = {
  stage: $('#stage'),
  world: $('#world'),
  wires: $('#wires'),
  overlay: $('#overlay'),
  toolbar: $('#toolbar'),
  inspector: $('#inspector'),
  drawer: $('#drawer'),
  boardList: $('#board-list'),
  title: $('#board-title'),
  crumbs: $('#crumbs'),
  status: $('#save-status'),
  identity: $('#identity'),
  toast: $('#toast'),
  budget: $('#budget'),
  zoomLabel: $('#zoom-label'),
  help: $('#help'),
  recIndicator: $('#rec-indicator'),
};

// ---------------------------------------------------------------- state ---

const store = new BoardStore();
const S = {
  doc: createBoard({ rkey: null, title: 'Untitled board' }),
  selection: new Set(),
  tool: 'select',
  editingId: null,
  marquee: null,
  pendingEdge: null,
  dropTarget: null,
  readonly: false,
  owner: null,          // handle of the repo we are looking at, if not ours
  past: [],
  future: [],
  spaceDown: false,
  drag: null,
};

const renderer = new Renderer(dom, { store });

let frame = 0;
function draw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderer.render({
      doc: S.doc,
      camera: S.doc.camera,
      selection: S.selection,
      editingId: S.editingId,
      marquee: S.marquee,
      pendingEdge: S.pendingEdge,
      dropTarget: S.dropTarget,
    });
    paintChrome();
  });
}

let saveTimer = 0;
function queueSave() {
  if (S.readonly) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.save(S.doc), 350);
}

/** Apply a new doc. `history` false for camera moves and other non-edits. */
function commit(next, { history = true } = {}) {
  if (!next) return;
  if (S.readonly) { toast('This board is read-only — it lives in someone else’s repo.'); return; }
  if (history) {
    S.past.push(snapshot(S.doc));
    if (S.past.length > 80) S.past.shift();
    S.future.length = 0;
  }
  S.doc = next;
  queueSave();
  draw();
}

const snapshot = (doc) => JSON.parse(JSON.stringify({ ...doc, items: doc.items, edges: doc.edges }));

function undo() {
  if (!S.past.length) return;
  S.future.push(snapshot(S.doc));
  S.doc = S.past.pop();
  S.selection = new Set([...S.selection].filter((id) => S.doc.items.some((i) => i.id === id)));
  queueSave();
  draw();
}

function redo() {
  if (!S.future.length) return;
  S.past.push(snapshot(S.doc));
  S.doc = S.future.pop();
  queueSave();
  draw();
}

function toast(message, ms = 3800) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => dom.toast.classList.remove('show'), ms);
}

const nextId = () => idFactory(S.doc)();

// ------------------------------------------------------------- routing ---

async function route() {
  // Drop any query tacked onto the fragment before parsing a route. The OAuth
  // callback used to return to `#/b/<rkey>?__auth_session=…`, and `<rkey>` then
  // swallowed the whole thing — a record key that exists nowhere, so signing in
  // ended on "not on this device or in your repo" and a blank canvas. The
  // worker and the client both handle this properly now; this is the third
  // belt, because a route parser should never be the thing that trusts a URL.
  const raw = location.hash.replace(/^#/, '') || '/';
  const hash = raw.split('?')[0] || '/';
  const own = /^\/b\/([^/?#]+)$/.exec(hash);
  const foreign = /^\/at\/([^/?#]+)\/([^/?#]+)$/.exec(hash);

  await store.flushAll().catch(() => {});
  S.readonly = false;
  S.owner = null;

  try {
    if (foreign) {
      const [, actorRaw, rkey] = foreign;
      const did = actorRaw.startsWith('did:') ? actorRaw : await resolveHandle(actorRaw);
      if (!did) throw new Error(`Could not resolve ${actorRaw}`);
      if (did === store.did) { location.hash = `#/b/${rkey}`; return; }
      const doc = await store.loadForeign(did, rkey);
      S.readonly = true;
      S.owner = (await describeRepo(did)) || did;
      openDoc(doc);
      toast(`Viewing @${S.owner}’s board — read-only.`);
      return;
    }
    if (own) {
      const doc = await store.load(own[1]);
      if (doc) { openDoc(doc); return; }
      toast('That board is not on this device or in your repo.');
    }
  } catch (e) {
    toast(e.message || 'Could not open that board.');
  }

  // No route (or a bad one): last board, else the newest, else a fresh one.
  const last = store.lastOpened();
  if (last) {
    const doc = await store.load(last);
    if (doc) { openDoc(doc); location.replace(`#/b/${doc.rkey}`); return; }
  }
  const index = await store.list();
  if (index.length) { location.hash = `#/b/${index[0].rkey}`; return; }
  newBoard({ navigate: true });
}

function openDoc(doc) {
  S.doc = doc;
  S.selection.clear();
  S.past.length = 0;
  S.future.length = 0;
  S.editingId = null;
  renderer.lastDocRkey = null; // force a clean rebuild
  draw();
  refreshDrawer();
}

function newBoard({ title = 'Untitled board', navigate = true, parent = null } = {}) {
  const doc = createBoard({
    rkey: generateTid(),
    did: store.did,
    title,
    parent,
    createdAt: new Date().toISOString(),
  });
  store.save(doc, { immediate: true });
  if (navigate) { openDoc(doc); location.hash = `#/b/${doc.rkey}`; }
  return doc;
}

// ------------------------------------------------------------- chrome ----

function paintChrome() {
  if (document.activeElement !== dom.title) dom.title.value = S.doc.title || '';
  dom.title.disabled = S.readonly;
  dom.zoomLabel.textContent = `${Math.round(S.doc.camera.zoom * 100)}%`;

  paintBudget();

  paintCrumbs();
  paintInspector();
  document.body.dataset.tool = S.tool;
  document.body.dataset.readonly = S.readonly ? '1' : '';
  for (const b of dom.toolbar.querySelectorAll('[data-tool]')) {
    b.classList.toggle('active', b.dataset.tool === S.tool);
  }
}

// Serialising the whole board to measure it is cheap but not free, and this
// runs inside the render loop — so it is sampled, not computed per frame.
// -Infinity, not 0: performance.now() is still under the throttle window
// during the first paint, so a zero start silently swallows it and the pill
// stays blank until something else happens to trigger a render.
let budgetAt = -Infinity;
function paintBudget() {
  const now = performance.now();
  if (now - budgetAt < 600) return;
  budgetAt = now;
  const { bytes, status } = store.budget(S.doc);
  const n = S.doc.items.length;
  dom.budget.textContent = `${n} item${n === 1 ? '' : 's'} · ${formatBytes(bytes)}`;
  dom.budget.dataset.status = status;
  dom.budget.title = status === 'ok'
    ? 'Size of this board as one PDS record'
    : 'This board is getting big for a single record — nest part of it into a child board (⌘G).';
}

function paintCrumbs() {
  dom.crumbs.replaceChildren();
  if (S.owner) {
    const who = document.createElement('span');
    who.className = 'crumb owner';
    who.textContent = `@${S.owner}`;
    dom.crumbs.append(who);
  }
  // `parent` is an at-uri once the board has been written up; `parentRkey` is
  // the local fallback for a board nested before signing in.
  if (S.doc.parent || S.doc.parentRkey) {
    const up = document.createElement('button');
    up.className = 'crumb';
    up.textContent = '↑ parent board';
    up.onclick = () => (S.doc.parent ? openUri(S.doc.parent) : (location.hash = `#/b/${S.doc.parentRkey}`));
    dom.crumbs.append(up);
  }
}

function paintStatus() {
  const map = {
    local: store.signedIn ? 'saved' : 'on this device',
    saving: 'saving…',
    saved: 'saved to your PDS',
    error: 'not saved',
    readonly: 'read-only',
  };
  dom.status.textContent = S.readonly ? map.readonly : (map[store.status] || '');
  dom.status.dataset.state = S.readonly ? 'readonly' : store.status;
  dom.status.title = store.detail || '';
}

store.addEventListener('status', paintStatus);
store.addEventListener('warn', (e) => toast(e.detail.message));
store.addEventListener('promoted', (e) => {
  const { boards, blobs } = e.detail;
  toast(`Moved ${boards} local board${boards === 1 ? '' : 's'}${blobs ? ` and ${blobs} file${blobs === 1 ? '' : 's'}` : ''} into your repo.`);
  refreshDrawer();
});
store.addEventListener('auth', () => { paintIdentity(); refreshDrawer(); paintStatus(); });

function paintIdentity() {
  dom.identity.replaceChildren();
  const user = store.user;
  if (user) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `@${user.handle}`;
    // What this session may actually do, on hover. Scope is invisible until it
    // is the thing that is broken, and then it is the first thing you want.
    const missing = store.missingMediaScopes();
    who.title = missing.length
      ? `Signed in, but media upload is not authorised (missing ${missing.join(', ')}). Drop a file to re-authorise.`
      : `Signed in with permission to write boards and upload media.\n${user.scope || ''}`;
    if (missing.length) who.dataset.warn = '1';
    const out = document.createElement('button');
    out.className = 'ghost';
    out.textContent = 'sign out';
    out.onclick = () => store.logout();
    dom.identity.append(who, out);
    return;
  }
  const form = document.createElement('form');
  form.className = 'signin';
  const input = document.createElement('input');
  input.placeholder = 'you.bsky.social';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('data-bsky-typeahead', '');
  const go = document.createElement('button');
  go.textContent = 'sign in';
  form.append(input, go);
  // The shared handle typeahead auto-attaches at load; this form does not
  // exist until auth state resolves, so attach it by hand. `attach` wraps the
  // input in a positioning div, which is why it happens after the append.
  window.bskyTypeahead?.attach(input);
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    go.disabled = true;
    try {
      await store.login(input.value.trim());
    } catch (err) {
      toast(err.message || 'Sign-in failed');
      go.disabled = false;
    }
  };
  dom.identity.append(form);
}

// ---------------------------------------------------------- board list ---

async function refreshDrawer() {
  const boards = await store.list();
  dom.boardList.replaceChildren();
  if (!boards.length) {
    dom.boardList.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'No boards yet.' }));
    return;
  }
  for (const b of boards) {
    const row = document.createElement('div');
    row.className = 'board-row';
    if (b.rkey === S.doc.rkey) row.classList.add('current');
    const open = document.createElement('button');
    open.className = 'board-open';
    open.innerHTML = '';
    open.append(Object.assign(document.createElement('span'), { className: 'b-title', textContent: b.title }));
    const meta = `${b.count} item${b.count === 1 ? '' : 's'}${b.parent ? ' · nested' : ''}${b.local ? ' · this device' : ''}`;
    open.append(Object.assign(document.createElement('span'), { className: 'b-meta', textContent: meta }));
    open.onclick = () => { location.hash = `#/b/${b.rkey}`; dom.drawer.classList.remove('open'); };
    const del = document.createElement('button');
    del.className = 'board-del';
    del.textContent = '×';
    del.title = 'Delete this board';
    del.onclick = async () => {
      if (!confirm(`Delete “${b.title}”? Its child boards are not deleted.`)) return;
      await store.remove(b.rkey);
      if (b.rkey === S.doc.rkey) location.hash = '#/';
      refreshDrawer();
    };
    row.append(open, del);
    dom.boardList.append(row);
  }
}

// -------------------------------------------------------------- pointer --
// One handler for every drag, because every drag is the same shape: decide
// what was grabbed on pointerdown, update on pointermove, finish on pointerup.

dom.stage.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  const roleEl = e.target.closest('[data-role]');
  const role = roleEl?.dataset.role;
  const itemEl = e.target.closest('.item');
  const edgeEl = e.target.closest('.edge');
  const item = itemEl ? S.doc.items.find((i) => i.id === itemEl.dataset.id) : null;
  const world = pointerWorld(e);

  if (role === 'play') { togglePlay(itemEl); return; }
  if (role === 'open-portal') { openPortal(item); return; }
  if (S.editingId && (!item || item.id !== S.editingId)) stopEditing();

  dom.stage.setPointerCapture(e.pointerId);

  // Pan: middle button, space held, or the pan tool.
  if (e.button === 1 || S.spaceDown || S.tool === 'pan') {
    S.drag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
    return;
  }

  if (S.tool === 'pen' && !S.readonly) {
    S.drag = { kind: 'pen', points: [world], tint: 'slate' };
    return;
  }

  if (S.tool === 'frame' && !S.readonly) {
    S.drag = { kind: 'draw-frame', start: world, rect: null };
    return;
  }

  if (S.tool === 'text' && !S.readonly && !item) {
    addText(world);
    setTool('select');
    return;
  }

  if (role === 'resize' && !S.readonly) {
    const target = S.doc.items.find((i) => S.selection.has(i.id));
    S.drag = { kind: 'resize', corner: roleEl.dataset.corner, id: target.id, start: world, box: itemBounds(target) };
    return;
  }

  if (role === 'connect' && item && !S.readonly) {
    S.pendingEdge = { from: item.id, x: world.x, y: world.y, toItem: null };
    S.drag = { kind: 'connect' };
    draw();
    return;
  }

  if (edgeEl) {
    selectOnly(edgeEl.dataset.edge, e.shiftKey);
    S.drag = { kind: 'none' };
    draw();
    return;
  }

  if (item) {
    if (S.tool === 'connect' && !S.readonly) {
      if (S.pendingEdge) { finishEdge(item.id); } else { S.pendingEdge = { from: item.id, x: world.x, y: world.y, toItem: null }; }
      S.drag = { kind: 'none' };
      draw();
      return;
    }
    if (!S.selection.has(item.id)) selectOnly(item.id, e.shiftKey);
    else if (e.shiftKey) { S.selection.delete(item.id); draw(); return; }

    // Dragging a frame carries whatever is sitting inside it.
    const ids = new Set(S.selection);
    for (const id of [...ids]) {
      const it = S.doc.items.find((i) => i.id === id);
      if (it?.kind === 'frame') for (const inner of itemsInFrame(S.doc.items, it)) ids.add(inner);
    }
    S.drag = {
      kind: 'move',
      ids: [...ids],
      start: world,
      origin: new Map([...ids].map((id) => {
        const it = S.doc.items.find((i) => i.id === id);
        return [id, { x: it.x, y: it.y }];
      })),
      moved: false,
    };
    return;
  }

  // Empty canvas.
  if (!e.shiftKey) { S.selection.clear(); }
  S.drag = { kind: 'marquee', start: { sx: e.clientX, sy: e.clientY }, add: e.shiftKey };
  draw();
});

dom.stage.addEventListener('pointermove', (e) => {
  const d = S.drag;
  if (!d) {
    if (S.pendingEdge && S.tool === 'connect') {
      const w = pointerWorld(e);
      S.pendingEdge.x = w.x;
      S.pendingEdge.y = w.y;
      draw();
    }
    return;
  }
  const world = pointerWorld(e);

  switch (d.kind) {
    case 'pan': {
      S.doc.camera = panBy(S.doc.camera, e.clientX - d.lastX, e.clientY - d.lastY);
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      draw();
      break;
    }
    case 'move': {
      const dx = world.x - d.start.x;
      const dy = world.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
      const snap = e.altKey ? 1 : 8;
      for (const id of d.ids) {
        const it = S.doc.items.find((i) => i.id === id);
        const o = d.origin.get(id);
        it.x = Math.round((o.x + dx) / snap) * snap;
        it.y = Math.round((o.y + dy) / snap) * snap;
      }
      // Hovering a portal that is not itself being dragged = "drop it in here".
      const under = hitTest(S.doc.items.filter((i) => !d.ids.includes(i.id)), world);
      S.dropTarget = under?.kind === 'portal' ? under.id : null;
      draw();
      break;
    }
    case 'resize': {
      const it = S.doc.items.find((i) => i.id === d.id);
      const b = d.box;
      const east = d.corner.includes('e');
      const south = d.corner.includes('s');
      const minW = 60;
      const minH = 40;
      if (east) it.w = Math.max(minW, Math.round(world.x - b.x));
      else { const right = b.x + b.w; it.x = Math.min(right - minW, Math.round(world.x)); it.w = right - it.x; }
      if (south) it.h = Math.max(minH, Math.round(world.y - b.y));
      else { const bottom = b.y + b.h; it.y = Math.min(bottom - minH, Math.round(world.y)); it.h = bottom - it.y; }
      draw();
      break;
    }
    case 'marquee': {
      const r = normalizeRect(d.start.sx, d.start.sy, e.clientX, e.clientY);
      const stageBox = dom.stage.getBoundingClientRect();
      S.marquee = { x: r.x - stageBox.left, y: r.y - stageBox.top, w: r.w, h: r.h };
      const tl = screenToWorld(S.doc.camera, S.marquee.x, S.marquee.y);
      const br = screenToWorld(S.doc.camera, S.marquee.x + r.w, S.marquee.y + r.h);
      const hits = marqueeSelect(S.doc.items, { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }, e.altKey);
      if (!d.add) S.selection = new Set(hits);
      else hits.forEach((id) => S.selection.add(id));
      draw();
      break;
    }
    case 'connect': {
      S.pendingEdge.x = world.x;
      S.pendingEdge.y = world.y;
      const over = hitTest(S.doc.items.filter((i) => i.id !== S.pendingEdge.from), world);
      S.pendingEdge.toItem = over?.id || null;
      draw();
      break;
    }
    case 'pen': {
      d.points.push(world);
      drawPenPreview(d.points);
      break;
    }
    case 'draw-frame': {
      d.rect = normalizeRect(d.start.x, d.start.y, world.x, world.y);
      drawFramePreview(d.rect);
      break;
    }
    default: break;
  }
});

dom.stage.addEventListener('pointerup', (e) => {
  const d = S.drag;
  S.drag = null;
  dom.stage.releasePointerCapture?.(e.pointerId);
  if (!d) return;

  switch (d.kind) {
    case 'pan':
      queueSave();
      break;
    case 'move': {
      if (!d.moved) break;
      if (S.dropTarget) {
        absorbInto(S.dropTarget, d.ids.filter((id) => id !== S.dropTarget));
        S.dropTarget = null;
        break;
      }
      // The positions were mutated in place for smoothness; record the move as
      // one history step by rewinding to the origin and re-applying it.
      const moved = S.doc;
      const before = { ...moved, items: moved.items.map((it) => (d.origin.has(it.id) ? { ...it, ...d.origin.get(it.id) } : it)) };
      S.doc = before;
      commit(moved);
      break;
    }
    case 'resize': {
      const after = S.doc;
      const it = after.items.find((i) => i.id === d.id);
      const before = { ...after, items: after.items.map((x) => (x.id === d.id ? { ...x, ...d.box } : x)) };
      S.doc = before;
      commit({ ...after, items: after.items.map((x) => (x.id === d.id ? { ...it } : x)) });
      break;
    }
    case 'marquee':
      S.marquee = null;
      draw();
      break;
    case 'connect':
      if (S.pendingEdge?.toItem) finishEdge(S.pendingEdge.toItem);
      else { S.pendingEdge = null; draw(); }
      break;
    case 'pen':
      commitPen(d.points);
      break;
    case 'draw-frame':
      if (d.rect && d.rect.w > 40 && d.rect.h > 40) addFrame(d.rect);
      clearPreview();
      setTool('select');
      break;
    default:
      draw();
  }
  S.dropTarget = null;
});

dom.stage.addEventListener('dblclick', (e) => {
  const itemEl = e.target.closest('.item');
  if (!itemEl) {
    if (!S.readonly) addText(pointerWorld(e));
    return;
  }
  const item = S.doc.items.find((i) => i.id === itemEl.dataset.id);
  if (!item) return;
  if (item.kind === 'portal') { openPortal(item); return; }
  if (item.kind === 'text' && !S.readonly) startEditing(item);
  if (item.kind === 'frame' && !S.readonly) {
    const title = prompt('Frame title', item.title || '');
    if (title != null) patchItem(item.id, { title });
  }
});

dom.stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const box = dom.stage.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) {
    S.doc.camera = zoomAt(S.doc.camera, e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * 0.002));
  } else {
    S.doc.camera = panBy(S.doc.camera, -e.deltaX, -e.deltaY);
  }
  queueSave();
  draw();
}, { passive: false });

dom.stage.addEventListener('contextmenu', (e) => e.preventDefault());

function pointerWorld(e) {
  const box = dom.stage.getBoundingClientRect();
  return screenToWorld(S.doc.camera, e.clientX - box.left, e.clientY - box.top);
}

function selectOnly(id, additive) {
  if (!additive) S.selection.clear();
  S.selection.add(id);
  draw();
}

// ------------------------------------------------------------- previews --
// Pen and frame drags paint into a scratch SVG rather than into the doc, so a
// cancelled gesture leaves no trace and no history entry.

function previewLayer() {
  let p = dom.wires.querySelector('.preview');
  if (!p) {
    p = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    p.setAttribute('class', 'preview');
    dom.wires.append(p);
  }
  return p;
}

function clearPreview() { previewLayer().replaceChildren(); }

function drawPenPreview(points) {
  const p = previewLayer();
  p.replaceChildren();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', points.map((pt, i) => `${i ? 'L' : 'M'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' '));
  path.setAttribute('class', 'pen-preview');
  p.append(path);
}

function drawFramePreview(rect) {
  const p = previewLayer();
  p.replaceChildren();
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('x', rect.x);
  r.setAttribute('y', rect.y);
  r.setAttribute('width', rect.w);
  r.setAttribute('height', rect.h);
  r.setAttribute('class', 'frame-preview');
  p.append(r);
}

// ------------------------------------------------------- item authoring --

function place(item) {
  commit({ ...S.doc, items: [...S.doc.items, item] });
  return item;
}

function addText(world, text = '') {
  const item = createItem('text', {
    id: nextId(),
    x: Math.round(world.x - DEFAULT_SIZE.text.w / 2),
    y: Math.round(world.y - DEFAULT_SIZE.text.h / 2),
    text,
    createdAt: new Date().toISOString(),
  });
  place(item);
  S.selection = new Set([item.id]);
  draw();
  requestAnimationFrame(() => startEditing(item));
  return item;
}

function addFrame(rect) {
  const item = createItem('frame', {
    id: nextId(),
    x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h),
    title: 'Frame',
    createdAt: new Date().toISOString(),
  });
  place(item);
  S.selection = new Set([item.id]);
  draw();
}

function commitPen(points) {
  clearPreview();
  if (!points || points.length < 3) return;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = 12;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const w = Math.max(24, Math.max(...xs) - x + pad);
  const h = Math.max(24, Math.max(...ys) - y + pad);
  // Per-mille of the item box, so the stroke scales with a resize.
  const flat = [];
  for (const p of points) {
    flat.push(Math.round(((p.x - x) / w) * 1000), Math.round(((p.y - y) / h) * 1000));
  }
  place(createItem('ink', {
    id: nextId(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    strokes: [{ points: flat, width: 3, tint: 'slate' }],
    createdAt: new Date().toISOString(),
  }));
}

/** Remove whatever is selected — items (and their connectors) and any
 *  connectors selected in their own right. */
function deleteSelection() {
  if (S.readonly || !S.selection.size) return;
  const pruned = deleteItems(S.doc, [...S.selection]);
  commit({ ...pruned, edges: pruned.edges.filter((e) => !S.selection.has(e.id)) });
  S.selection.clear();
  draw();
}

function patchItem(id, patch) {
  commit({ ...S.doc, items: S.doc.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
}

function patchEdge(id, patch) {
  commit({ ...S.doc, edges: S.doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
}

function finishEdge(toId) {
  const from = S.pendingEdge?.from;
  S.pendingEdge = null;
  if (!from || from === toId) { draw(); return; }
  if (S.doc.edges.some((e) => e.from === from && e.to === toId)) { draw(); return; }
  commit({ ...S.doc, edges: [...S.doc.edges, createEdge(from, toId, { id: nextId() })] });
}

// --------------------------------------------------------- text editing --

function startEditing(item) {
  const node = renderer.nodes.get(item.id);
  const prose = node?.querySelector('[data-role="text"]');
  if (!prose) return;
  S.editingId = item.id;
  node.classList.add('editing');
  prose.contentEditable = 'true';
  prose.focus();
  const range = document.createRange();
  range.selectNodeContents(prose);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const finish = () => {
    prose.removeEventListener('blur', finish);
    const text = prose.innerText.replace(/ /g, ' ').trimEnd();
    prose.contentEditable = 'false';
    node.classList.remove('editing');
    S.editingId = null;
    if (text !== (item.text || '')) patchItem(item.id, { text });
    else draw();
  };
  prose.addEventListener('blur', finish);
  prose.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); prose.blur(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); prose.blur(); }
  });
}

function stopEditing() {
  const node = renderer.nodes.get(S.editingId);
  node?.querySelector('[data-role="text"]')?.blur();
  S.editingId = null;
}

function togglePlay(itemEl) {
  const audio = itemEl.querySelector('[data-role="audio"]');
  const btn = itemEl.querySelector('[data-role="play"]');
  if (!audio) return;
  if (audio.paused) {
    document.querySelectorAll('audio').forEach((a) => { if (a !== audio) a.pause(); });
    audio.play().then(() => { btn.textContent = '❚❚'; }).catch(() => toast('Could not play that clip.'));
    audio.onended = () => { btn.textContent = '▶'; };
    audio.onpause = () => { btn.textContent = '▶'; };
  } else {
    audio.pause();
  }
}

// ------------------------------------------------------------- nesting ---

/** The headline gesture: fold a selection into a board of its own. */
function nestSelection() {
  if (S.readonly) return;
  const ids = [...S.selection].filter((id) => S.doc.items.some((i) => i.id === id));
  if (ids.length < 1) { toast('Select something to nest first.'); return; }

  const suggested = suggestTitle(ids);
  const title = prompt('Name the nested board', suggested);
  if (title == null) return;

  const rkey = generateTid();
  const res = nest(S.doc, ids, {
    rkey,
    did: store.did,
    title: title.trim() || suggested,
    createdAt: new Date().toISOString(),
  });
  if (!res) return;

  store.save(res.child, { immediate: true });
  commit(res.parent);
  S.selection = new Set([res.portalId]);
  draw();
  refreshDrawer();
  toast(`Nested ${ids.length} item${ids.length === 1 ? '' : 's'} into “${res.child.title}”. Double-click the portal to go in.`);
}

/** A first guess at a child board's name, taken from what is in the selection. */
function suggestTitle(ids) {
  const items = S.doc.items.filter((i) => ids.includes(i.id));
  const frame = items.find((i) => i.kind === 'frame' && i.title);
  if (frame) return frame.title;
  const text = items.find((i) => i.kind === 'text' && i.text?.trim());
  if (text) return text.text.trim().split('\n')[0].slice(0, 60);
  const link = items.find((i) => i.kind === 'weblink' && i.title);
  if (link) return link.title.slice(0, 60);
  return `${items.length} items`;
}

async function unnestSelection() {
  if (S.readonly) return;
  const portal = S.doc.items.find((i) => S.selection.has(i.id) && i.kind === 'portal');
  if (!portal) { toast('Select a nested board to unpack it.'); return; }
  const child = await loadPortalDoc(portal);
  if (!child) { toast('Could not load that nested board.'); return; }
  const merged = unnest(S.doc, portal.id, child);
  if (!merged) return;
  commit(merged);
  S.selection = new Set(child.items.map((i) => i.id).filter((id) => merged.items.some((m) => m.id === id)));
  draw();
  toast(`Unpacked “${child.title}” back into this board. The child record is still in your repo.`);
}

async function absorbInto(portalId, ids) {
  const portal = S.doc.items.find((i) => i.id === portalId);
  const child = await loadPortalDoc(portal);
  if (!child) { toast('Could not open that nested board.'); draw(); return; }
  const res = absorb(S.doc, ids, child, portalId);
  if (!res) { draw(); return; }
  store.save(res.child, { immediate: true });
  commit(res.parent);
  S.selection = new Set([portalId]);
  draw();
  toast(`Moved ${ids.length} item${ids.length === 1 ? '' : 's'} into “${child.title}”.`);
}

function loadPortalDoc(portal) {
  if (!portal) return Promise.resolve(null);
  if (portal.board) return store.loadUri(portal.board).catch(() => null);
  if (portal.rkey) return store.load(portal.rkey).catch(() => null);
  return Promise.resolve(null);
}

function openPortal(portal) {
  if (!portal) return;
  const uri = portal.board;
  if (uri) { openUri(uri); return; }
  if (portal.rkey) location.hash = `#/b/${portal.rkey}`;
}

function openUri(uri) {
  const parts = parseAtUri(uri);
  if (!parts) return;
  location.hash = (store.did && parts.did === store.did) ? `#/b/${parts.rkey}` : `#/at/${parts.did}/${parts.rkey}`;
}

// ------------------------------------------------------------ keyboard ---

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !isTyping(e)) { S.spaceDown = true; document.body.classList.add('panning'); }
  if (isTyping(e)) return;
  const mod = e.metaKey || e.ctrlKey;

  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); S.selection = new Set(S.doc.items.map((i) => i.id)); draw(); return; }
  if (mod && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    if (e.shiftKey) unnestSelection(); else nestSelection();
    return;
  }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
  if (mod && e.key === 'Enter') { e.preventDefault(); openSelectedPortal(); return; }

  switch (e.key) {
    case 'Backspace': case 'Delete':
      if (S.selection.size && !S.readonly) { e.preventDefault(); deleteSelection(); }
      break;
    case 'Escape':
      if (S.pendingEdge) { S.pendingEdge = null; }
      else if (S.selection.size) S.selection.clear();
      else setTool('select');
      draw();
      break;
    case 'v': setTool('select'); break;
    case 'h': setTool('pan'); break;
    case 't': setTool('text'); break;
    case 'f': setTool('frame'); break;
    case 'p': setTool('pen'); break;
    case 'c': setTool('connect'); break;
    case 'r': if (!S.readonly) toggleRecording(); break;
    case '?': dom.help.classList.toggle('open'); break;
    case '0': fitToContent(); break;
    case '1': setZoom(1); break;
    case '+': case '=': setZoom(S.doc.camera.zoom * 1.25); break;
    case '-': setZoom(S.doc.camera.zoom / 1.25); break;
    default: break;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') { S.spaceDown = false; document.body.classList.remove('panning'); }
});

function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement
    && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

function setTool(tool) {
  S.tool = tool;
  if (tool !== 'connect') S.pendingEdge = null;
  draw();
}

function setZoom(z) {
  const box = dom.stage.getBoundingClientRect();
  S.doc.camera = zoomAt(S.doc.camera, box.width / 2, box.height / 2, clamp(z, MIN_ZOOM, MAX_ZOOM) / S.doc.camera.zoom);
  queueSave();
  draw();
}

function fitToContent() {
  const bb = itemsBounds(S.doc.items);
  if (!bb) return;
  S.doc.camera = cameraFor(bb, dom.stage.clientWidth, dom.stage.clientHeight);
  queueSave();
  draw();
}

function duplicate() {
  if (S.readonly || !S.selection.size) return;
  const mint = idFactory(S.doc);
  const remap = new Map();
  const copies = S.doc.items.filter((i) => S.selection.has(i.id)).map((it) => {
    const id = mint();
    remap.set(it.id, id);
    return { ...it, id, x: it.x + 24, y: it.y + 24 };
  });
  const edges = S.doc.edges
    .filter((e) => remap.has(e.from) && remap.has(e.to))
    .map((e) => ({ ...e, id: mint(), from: remap.get(e.from), to: remap.get(e.to) }));
  commit({ ...S.doc, items: [...S.doc.items, ...copies], edges: [...S.doc.edges, ...edges] });
  S.selection = new Set(copies.map((c) => c.id));
  draw();
}

function openSelectedPortal() {
  const portal = S.doc.items.find((i) => S.selection.has(i.id) && i.kind === 'portal');
  if (portal) openPortal(portal);
}

// ------------------------------------------------------- files & paste ---

dom.stage.addEventListener('dragover', (e) => { e.preventDefault(); dom.stage.classList.add('drop'); });
dom.stage.addEventListener('dragleave', () => dom.stage.classList.remove('drop'));
dom.stage.addEventListener('drop', async (e) => {
  e.preventDefault();
  dom.stage.classList.remove('drop');
  if (S.readonly) { toast('This board is read-only.'); return; }
  const world = pointerWorld(e);
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) { await intakeFiles(files, world); return; }
  const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
  if (text) await intakeText(text, world);
});

window.addEventListener('paste', async (e) => {
  if (isTyping(e) || S.readonly) return;
  const box = dom.stage.getBoundingClientRect();
  const world = screenToWorld(S.doc.camera, box.width / 2, box.height / 2);
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); await intakeFiles(files, world); return; }
  const text = e.clipboardData?.getData('text/plain');
  if (text) { e.preventDefault(); await intakeText(text, world); }
});

async function intakeFiles(files, world) {
  // Check authorisation before touching the files. Escalating scope means a
  // redirect to the consent screen, which throws away whatever was dropped —
  // so ask first and let the user drop again, rather than shredding their file
  // halfway through an upload.
  const missing = store.missingMediaScopes();
  if (missing.length) {
    toast('This sign-in cannot upload media yet — asking Bluesky for permission…');
    await store.requestMediaScope();
    return;
  }

  let offset = 0;
  for (const file of files) {
    if (file.size > MAX_BLOB) { toast(`${file.name} is ${formatBytes(file.size)} — too big for a PDS blob.`); continue; }
    const at = { x: world.x + offset, y: world.y + offset };
    offset += 28;
    try {
      await intakeFile(file, at);
    } catch (err) {
      toast(`Could not add ${file.name}: ${err.message}`);
    }
  }
}

async function intakeFile(file, world) {
  const kind = kindForFile(file);
  if (kind === 'image') {
    const { data, mimeType, width, height } = await shrinkImage(file);
    const media = await store.putMedia(data, mimeType);
    renderer.seedMedia(media.blob, media.url);
    const ratio = width && height ? width / height : 4 / 3;
    const w = DEFAULT_SIZE.image.w;
    place(createItem('image', {
      id: nextId(),
      x: Math.round(world.x - w / 2), y: Math.round(world.y - w / ratio / 2),
      w, h: Math.round(w / ratio),
      image: media.blob, pending: media.pending,
      alt: file.name.replace(/\.[a-z0-9]+$/i, ''),
      aspectRatio: width && height ? { width, height } : undefined,
      createdAt: new Date().toISOString(),
    }));
    return;
  }
  const buf = await file.arrayBuffer();
  const media = await store.putMedia(new Uint8Array(buf), file.type || 'application/octet-stream');
  renderer.seedMedia(media.blob, media.url);
  if (kind === 'audio') {
    const { peaks, durationMs } = await audioPeaks(buf);
    place(createItem('audio', {
      id: nextId(), x: Math.round(world.x - 150), y: Math.round(world.y - 48),
      audio: media.blob, pending: media.pending, peaks, durationMs,
      label: file.name, createdAt: new Date().toISOString(),
    }));
    return;
  }
  place(createItem('file', {
    id: nextId(), x: Math.round(world.x - 120), y: Math.round(world.y - 48),
    file: media.blob, pending: media.pending, name: file.name, size: file.size,
    createdAt: new Date().toISOString(),
  }));
}

async function intakeText(text, world) {
  const trimmed = text.trim();
  if (!looksLikeUrl(trimmed)) { addText(world, trimmed); return; }

  const post = bskyPostUri(trimmed);
  if (post) {
    const rec = await fetchPost(post.actor, post.rkey);
    if (rec) {
      place(createItem('embed', {
        id: nextId(), x: Math.round(world.x - 160), y: Math.round(world.y - 90),
        record: { uri: rec.uri, cid: rec.cid },
        snapshot: `@${rec.actor}: ${rec.text}`.slice(0, 900),
        createdAt: new Date().toISOString(),
      }));
      return;
    }
  }

  const card = await unfurl(trimmed);
  const item = place(createItem('weblink', {
    id: nextId(), x: Math.round(world.x - 150), y: Math.round(world.y - 66),
    uri: card.uri, title: card.title, description: card.description,
    createdAt: new Date().toISOString(),
  }));

  // Pull the card's thumbnail into a blob of our own, so the card survives the
  // source going away — the same reason the title is captured at drop time.
  if (card.imageUrl) {
    try {
      const res = await fetch(card.imageUrl);
      const blob = await res.blob();
      if (blob.size && blob.size < 2 * 1024 * 1024) {
        const shrunk = await shrinkImage(new File([blob], 'thumb', { type: blob.type }), 800);
        const media = await store.putMedia(shrunk.data, shrunk.mimeType);
        if (media.blob) patchItem(item.id, { thumb: media.blob });
      }
    } catch { /* a link card without a picture is still a link card */ }
  }
}

// ---------------------------------------------------------- voice notes --

const recorder = new VoiceRecorder();
let recording = false;
let recTimer = 0;

async function toggleRecording() {
  if (!VoiceRecorder.supported) { toast('This browser will not record audio.'); return; }
  if (!recording && store.missingMediaScopes().length) {
    toast('This sign-in cannot upload audio yet — asking Bluesky for permission…');
    await store.requestMediaScope();
    return;
  }
  if (recording) {
    recording = false;
    clearInterval(recTimer);
    dom.recIndicator.classList.remove('on');
    const clip = await recorder.stop();
    if (!clip || !clip.data.length) return;
    const media = await store.putMedia(clip.data, clip.mimeType);
    renderer.seedMedia(media.blob, media.url);
    const box = dom.stage.getBoundingClientRect();
    const world = screenToWorld(S.doc.camera, box.width / 2, box.height / 2);
    place(createItem('audio', {
      id: nextId(), x: Math.round(world.x - 150), y: Math.round(world.y - 48),
      audio: media.blob, pending: media.pending,
      peaks: clip.peaks, durationMs: clip.durationMs,
      label: `Voice note · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: new Date().toISOString(),
    }));
    toast('Voice note added.');
    return;
  }
  try {
    await recorder.start();
  } catch {
    toast('Microphone permission denied.');
    return;
  }
  recording = true;
  dom.recIndicator.classList.add('on');
  recTimer = setInterval(() => {
    const s = Math.floor(recorder.elapsedMs / 1000);
    dom.recIndicator.textContent = `● recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} — press R to stop`;
  }, 200);
}

// ----------------------------------------------------------- inspector ---

function paintInspector() {
  const panel = dom.inspector;
  const selItems = S.doc.items.filter((i) => S.selection.has(i.id));
  const selEdges = S.doc.edges.filter((e) => S.selection.has(e.id));
  if (!selItems.length && !selEdges.length) {
    panel.classList.remove('open');
    panel.replaceChildren();
    panel.dataset.sig = '';
    return;
  }
  // Rebuilt only when the selection itself changes. Otherwise a render
  // triggered by anything else (a drag, an autosave) would yank the focus out
  // of whatever field is being typed into, or reset a slider mid-drag.
  const sig = `${[...S.selection].sort().join(',')}|${S.readonly ? 'ro' : 'rw'}|${selItems.map((i) => i.kind).join(',')}`;
  if (panel.dataset.sig === sig) return;
  panel.dataset.sig = sig;
  panel.classList.add('open');
  panel.replaceChildren();

  const head = document.createElement('div');
  head.className = 'insp-head';
  head.textContent = selItems.length + selEdges.length === 1
    ? (selItems[0]?.kind || 'connector')
    : `${selItems.length + selEdges.length} selected`;
  panel.append(head);

  if (S.readonly) {
    panel.append(Object.assign(document.createElement('p'), { className: 'insp-note', textContent: 'Read-only — this board lives in another repo.' }));
    return;
  }

  // Tint applies to items and connectors alike.
  const tints = document.createElement('div');
  tints.className = 'tints';
  for (const t of [null, ...TINTS]) {
    const b = document.createElement('button');
    b.className = `tint-dot tint-${t || 'none'}`;
    b.title = t || 'no tint';
    b.onclick = () => {
      selItems.forEach((it) => patchItem(it.id, { tint: t }));
      selEdges.forEach((e) => patchEdge(e.id, { tint: t }));
    };
    tints.append(b);
  }
  panel.append(tints);

  if (selItems.length === 1) paintItemFields(panel, selItems[0]);
  if (selEdges.length === 1) paintEdgeFields(panel, selEdges[0]);

  const acts = document.createElement('div');
  acts.className = 'insp-actions';
  const act = (label, fn, title) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title || '';
    b.onclick = fn;
    acts.append(b);
    return b;
  };
  if (selItems.length) {
    act('Nest into a board  ⌘G', nestSelection, 'Move these items into a child whiteboard and leave a portal behind');
    if (selItems.some((i) => i.kind === 'portal')) act('Unpack  ⇧⌘G', unnestSelection, 'Bring a nested board’s contents back in here');
    if (selItems.length > 1) {
      act('Tidy', () => commit(tidyItems(S.doc, [...S.selection])));
      act('Align left', () => commit(alignItems(S.doc, [...S.selection], 'left')));
      act('Align top', () => commit(alignItems(S.doc, [...S.selection], 'top')));
    }
    act('Front', () => commit(bringToFront(S.doc, [...S.selection])));
    act('Back', () => commit(sendToBack(S.doc, [...S.selection])));
    act('Duplicate  ⌘D', duplicate);
  }
  act('Delete', deleteSelection).classList.add('danger');
  panel.append(acts);
}

function field(panel, label, value, onChange, { multiline = false } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.append(Object.assign(document.createElement('span'), { textContent: label }));
  const input = document.createElement(multiline ? 'textarea' : 'input');
  input.value = value || '';
  input.rows = multiline ? 3 : undefined;
  input.onchange = () => onChange(input.value);
  wrap.append(input);
  panel.append(wrap);
  return input;
}

function paintItemFields(panel, item) {
  field(panel, 'Caption', item.label, (v) => patchItem(item.id, { label: v }));
  switch (item.kind) {
    case 'text':
      field(panel, 'Text', item.text, (v) => patchItem(item.id, { text: v }), { multiline: true });
      choice(panel, 'Size', ['s', 'm', 'l', 'xl'], item.size || 'm', (v) => patchItem(item.id, { size: v }));
      break;
    case 'image':
      field(panel, 'Alt text', item.alt, (v) => patchItem(item.id, { alt: v }));
      break;
    case 'audio':
      field(panel, 'Transcript', item.transcript, (v) => patchItem(item.id, { transcript: v }), { multiline: true });
      break;
    case 'weblink':
      field(panel, 'Title', item.title, (v) => patchItem(item.id, { title: v }));
      field(panel, 'URL', item.uri, (v) => patchItem(item.id, { uri: v }));
      break;
    case 'frame':
      field(panel, 'Title', item.title, (v) => patchItem(item.id, { title: v }));
      break;
    case 'portal': {
      field(panel, 'Title', item.title, (v) => patchItem(item.id, { title: v }));
      const open = document.createElement('button');
      open.className = 'insp-open';
      open.textContent = 'Open this board →';
      open.onclick = () => openPortal(item);
      panel.append(open);
      break;
    }
    case 'embed': {
      const a = document.createElement('a');
      a.className = 'insp-link';
      a.href = atUriToWeb(item.record?.uri);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.record?.uri || '';
      panel.append(a);
      break;
    }
    default: break;
  }
}

function paintEdgeFields(panel, edge) {
  field(panel, 'Label', edge.label, (v) => patchEdge(edge.id, { label: v }));
  choice(panel, 'Style', ['arrow', 'line', 'dashed', 'double'], edge.style || 'arrow', (v) => patchEdge(edge.id, { style: v }));
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.append(Object.assign(document.createElement('span'), { textContent: 'Curve' }));
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '-100';
  range.max = '100';
  range.value = String(edge.bend || 0);
  range.oninput = () => patchEdge(edge.id, { bend: Number(range.value) });
  wrap.append(range);
  panel.append(wrap);
}

function choice(panel, label, options, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.append(Object.assign(document.createElement('span'), { textContent: label }));
  const sel = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    if (o === value) opt.selected = true;
    sel.append(opt);
  }
  sel.onchange = () => onChange(sel.value);
  wrap.append(sel);
  panel.append(wrap);
}

// -------------------------------------------------------------- toolbar --

dom.toolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.tool) { setTool(btn.dataset.tool); return; }
  switch (btn.dataset.action) {
    case 'upload': pickFiles(); break;
    case 'record': toggleRecording(); break;
    case 'nest': nestSelection(); break;
    case 'fit': fitToContent(); break;
    default: break;
  }
});

function pickFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = async () => {
    const box = dom.stage.getBoundingClientRect();
    const world = screenToWorld(S.doc.camera, box.width / 2, box.height / 2);
    await intakeFiles([...input.files], world);
  };
  input.click();
}

$('#btn-boards').onclick = () => { dom.drawer.classList.toggle('open'); refreshDrawer(); };
$('#btn-new').onclick = () => newBoard({});
$('#btn-help').onclick = () => dom.help.classList.toggle('open');
$('#help-close').onclick = () => dom.help.classList.remove('open');
$('#btn-share').onclick = async () => {
  if (!S.doc.uri && !store.did) { toast('Sign in to get a shareable link — a board needs a repo to live in.'); return; }
  const did = S.doc.did || store.did;
  const url = `${location.origin}${location.pathname}#/at/${did}/${S.doc.rkey}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Public link copied. Anyone can read this board straight off your PDS.');
  } catch {
    prompt('Public link to this board', url);
  }
};

dom.title.addEventListener('change', () => {
  if (S.readonly) return;
  commit({ ...S.doc, title: dom.title.value.trim() || 'Untitled board' });
  refreshDrawer();
});

$('#zoom-in').onclick = () => setZoom(S.doc.camera.zoom * 1.25);
$('#zoom-out').onclick = () => setZoom(S.doc.camera.zoom / 1.25);
$('#zoom-fit').onclick = fitToContent;

window.addEventListener('hashchange', route);
window.addEventListener('resize', draw);
window.addEventListener('pagehide', () => { store.flushAll(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) store.flushAll(); });

// ---------------------------------------------------------------- boot ---

(async function boot() {
  paintIdentity();
  paintStatus();
  try {
    await store.init();
  } catch { /* offline start is fine */ }
  paintIdentity();
  await route();
  refreshDrawer();
  draw();
  if (!localStorage.getItem('board.seen-help')) {
    dom.help.classList.add('open');
    localStorage.setItem('board.seen-help', '1');
  }
}());
