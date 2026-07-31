// board/render.js — doc → DOM.
//
// The canvas is ordinary DOM inside one transformed <div>, not a <canvas>.
// That is a deliberate trade: it costs some raw pan/zoom performance at very
// high item counts, and it buys native text editing, real <img> decoding,
// working <audio>, selectable text, links that are links, and accessibility
// for free. For a board that holds a few hundred cards it is the right side of
// the trade — and boards are supposed to stay that size, because when they
// don't you nest.
//
// Two coordinate systems, and only two:
//   world    what items store; the transformed layer draws in it directly
//   screen   what the pointer speaks; the overlay (selection, handles,
//            marquee) draws in it, so handles stay one size at every zoom

import {
  itemBounds, itemsBounds, paintOrder, viewportRect, rectsOverlap, worldToScreen,
  edgeGeometry, liveEdges,
} from './engine.js';
import { blobUrl, formatDuration, formatBytes, hostOf } from './media.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export class Renderer {
  /**
   * @param {object} dom   { world, wires, overlay, stage }
   * @param {object} hooks { onEditText, onOpenPortal, store }
   */
  constructor(dom, hooks) {
    this.dom = dom;
    this.hooks = hooks;
    this.nodes = new Map();     // itemId → element
    this.mediaUrls = new Map(); // cacheKey → object/PDS url
    this.edgeNodes = new Map(); // edgeId → <g>
    this.lastDocRkey = null;
  }

  /** Full paint. Cheap enough at these sizes to do on every state change; the
   *  expensive parts (media URLs, waveforms) are cached by content id. */
  render(state) {
    const { doc, camera } = state;
    if (doc.rkey !== this.lastDocRkey) {
      this.nodes.clear();
      this.edgeNodes.clear();
      this.dom.world.replaceChildren();
      this.dom.wires.replaceChildren(this._defs());
      this.lastDocRkey = doc.rkey;
    }
    this._applyCamera(camera);
    this._renderItems(state);
    this._renderEdges(state);
    this._renderOverlay(state);
  }

  _applyCamera(camera) {
    const t = `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;
    this.dom.world.style.transform = t;
    this.dom.wires.style.transform = t;
    this.dom.stage.style.setProperty('--zoom', camera.zoom);
    this.dom.stage.style.backgroundPosition = `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`;
    this.dom.stage.style.backgroundSize = `${32 * camera.zoom}px ${32 * camera.zoom}px`;
  }

  // -------------------------------------------------------------- items ---

  _renderItems(state) {
    const { doc, camera, selection, editingId } = state;
    const vw = this.dom.stage.clientWidth;
    const vh = this.dom.stage.clientHeight;
    const view = viewportRect(camera, vw, vh, 400);
    const visible = new Set();

    for (const item of paintOrder(doc.items)) {
      // Cull far-away items, but never the one being edited (blurring a
      // contenteditable that got recycled loses the keystroke).
      if (item.id !== editingId && !rectsOverlap(view, itemBounds(item))) continue;
      visible.add(item.id);
      let node = this.nodes.get(item.id);
      if (!node || node.dataset.kind !== item.kind) {
        node?.remove();
        node = this._buildItem(item, state);
        this.nodes.set(item.id, node);
        this.dom.world.appendChild(node);
      }
      this._positionItem(node, item);
      this._updateItem(node, item, state);
      node.classList.toggle('selected', selection.has(item.id));
      node.classList.toggle('drop-target', state.dropTarget === item.id);
    }

    for (const [id, node] of this.nodes) {
      if (!visible.has(id)) { node.remove(); this.nodes.delete(id); }
    }
  }

  _positionItem(node, item) {
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.style.width = `${item.w}px`;
    node.style.height = `${item.h}px`;
    node.style.zIndex = String(1000 + (item.z || 0));
    node.style.transform = item.rotation ? `rotate(${item.rotation}deg)` : '';
  }

  _buildItem(item, state) {
    const node = el('div', `item item-${item.kind}`);
    node.dataset.id = item.id;
    node.dataset.kind = item.kind;
    node.append(el('div', 'item-body'));
    node.append(el('div', 'item-caption'));
    // Every item carries its own connector nub; dragging from it starts an edge.
    if (item.kind !== 'frame') {
      const nub = el('div', 'nub');
      nub.dataset.role = 'connect';
      nub.title = 'Drag to connect';
      node.append(nub);
    }
    this._fill(node.firstChild, item, state);
    node.dataset.fill = this._fillKey(item);
    return node;
  }

  _updateItem(node, item, state) {
    const key = this._fillKey(item);
    if (node.dataset.fill !== key) {
      node.firstChild.replaceChildren();
      this._fill(node.firstChild, item, state);
      node.dataset.fill = key;
    }
    node.dataset.tint = item.tint || '';
    const cap = node.querySelector('.item-caption');
    cap.textContent = item.label || '';
    cap.style.display = item.label ? '' : 'none';
  }

  /** What must change for a card's innards to be rebuilt. Keeping this precise
   *  is what stops a re-render from stomping on a half-typed note. */
  _fillKey(item) {
    switch (item.kind) {
      case 'text': return `t:${item.size || 'm'}:${item.align || 'left'}:${item.text || ''}`;
      case 'image': return `i:${item.image?.ref?.$link || item.pending || ''}:${item.alt || ''}`;
      case 'audio': return `a:${item.audio?.ref?.$link || item.pending || ''}:${(item.peaks || []).length}:${item.transcript || ''}`;
      case 'weblink': return `l:${item.uri}:${item.title || ''}:${item.description || ''}:${item.thumb?.ref?.$link || ''}`;
      case 'file': return `f:${item.name}:${item.size || 0}:${item.file?.ref?.$link || item.pending || ''}`;
      case 'portal': return `p:${item.board || item.rkey || ''}:${item.title || ''}:${item.count || 0}`;
      case 'frame': return `r:${item.title || ''}`;
      case 'ink': return `k:${(item.strokes || []).length}:${(item.strokes || []).reduce((n, s) => n + s.points.length, 0)}`;
      case 'embed': return `e:${item.record?.uri || ''}:${item.snapshot || ''}`;
      default: return item.kind;
    }
  }

  _fill(body, item, state) {
    switch (item.kind) {
      case 'text': return this._fillText(body, item);
      case 'image': return this._fillImage(body, item, state);
      case 'audio': return this._fillAudio(body, item, state);
      case 'weblink': return this._fillLink(body, item, state);
      case 'file': return this._fillFile(body, item, state);
      case 'portal': return this._fillPortal(body, item);
      case 'frame': return this._fillFrame(body, item);
      case 'ink': return this._fillInk(body, item);
      case 'embed': return this._fillEmbed(body, item);
      default: return undefined;
    }
  }

  _fillText(body, item) {
    const p = el('div', `prose size-${item.size || 'm'} align-${item.align || 'left'}`);
    p.textContent = item.text || '';
    p.dataset.role = 'text';
    p.setAttribute('spellcheck', 'false');
    body.append(p);
    if (!item.text) body.append(el('div', 'placeholder', 'Double-click to write'));
    return undefined;
  }

  _fillImage(body, item, state) {
    const img = el('img');
    img.alt = item.alt || '';
    img.draggable = false;
    img.loading = 'lazy';
    body.append(img);
    this._resolveMedia(item, state).then((url) => { if (url) img.src = url; });
    return undefined;
  }

  _fillAudio(body, item, state) {
    const row = el('div', 'audio-row');
    const btn = el('button', 'play', '▶');
    btn.dataset.role = 'play';
    btn.setAttribute('aria-label', 'Play voice note');
    const wave = svg('svg', { class: 'wave', viewBox: '0 0 100 32', preserveAspectRatio: 'none' });
    const peaks = item.peaks?.length ? item.peaks : new Array(32).fill(18);
    peaks.forEach((p, i) => {
      const w = 100 / peaks.length;
      const h = Math.max(1.5, (p / 100) * 30);
      wave.append(svg('rect', { x: (i * w + w * 0.15).toFixed(2), y: ((32 - h) / 2).toFixed(2), width: (w * 0.7).toFixed(2), height: h.toFixed(2), rx: 0.6 }));
    });
    const time = el('span', 'dur', formatDuration(item.durationMs));
    row.append(btn, wave, time);
    body.append(row);

    const audio = el('audio');
    audio.preload = 'none';
    audio.dataset.role = 'audio';
    body.append(audio);
    this._resolveMedia(item, state).then((url) => { if (url) audio.src = url; });

    if (item.transcript) body.append(el('div', 'transcript', item.transcript));
    return undefined;
  }

  _fillLink(body, item, state) {
    const a = el('a', 'link-card');
    a.href = item.uri;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (item.thumb) {
      const img = el('img', 'link-thumb');
      img.alt = '';
      img.draggable = false;
      a.append(img);
      this._blobSrc(item.thumb, state).then((url) => { if (url) img.src = url; });
    }
    a.append(el('div', 'link-title', item.title || item.uri));
    if (item.description) a.append(el('div', 'link-desc', item.description));
    a.append(el('div', 'link-host', hostOf(item.uri)));
    body.append(a);
    return undefined;
  }

  _fillFile(body, item, state) {
    const wrap = el('div', 'file-card');
    wrap.append(el('div', 'file-icon', '📎'));
    const meta = el('div', 'file-meta');
    meta.append(el('div', 'file-name', item.name || 'file'));
    meta.append(el('div', 'file-size', formatBytes(item.size)));
    wrap.append(meta);
    body.append(wrap);
    this._resolveMedia(item, state).then((url) => {
      if (!url) return;
      const a = el('a', 'file-dl', 'download');
      a.href = url;
      a.download = item.name || 'file';
      a.target = '_blank';
      a.rel = 'noopener';
      wrap.append(a);
    });
    return undefined;
  }

  _fillPortal(body, item) {
    const card = el('div', 'portal-card');
    card.append(el('div', 'portal-glyph', '⧉'));
    card.append(el('div', 'portal-title', item.title || 'Nested board'));
    card.append(el('div', 'portal-count', `${item.count ?? 0} item${item.count === 1 ? '' : 's'}`));
    const open = el('button', 'portal-open', 'Open →');
    open.dataset.role = 'open-portal';
    card.append(open);
    body.append(card);
    return undefined;
  }

  _fillFrame(body, item) {
    const t = el('div', 'frame-title', item.title || 'Frame');
    t.dataset.role = 'frame-title';
    body.append(t);
    return undefined;
  }

  _fillInk(body, item) {
    const s = svg('svg', { class: 'ink', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' });
    for (const stroke of item.strokes || []) {
      const pts = stroke.points || [];
      if (pts.length < 4) continue;
      let d = `M ${pts[0]} ${pts[1]}`;
      for (let i = 2; i < pts.length - 1; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
      s.append(svg('path', {
        d,
        fill: 'none',
        'stroke-width': String((stroke.width || 4) * 2),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: `ink-stroke tint-${stroke.tint || 'slate'}`,
        vectorEffect: 'non-scaling-stroke',
      }));
    }
    body.append(s);
    return undefined;
  }

  _fillEmbed(body, item) {
    const card = el('div', 'embed-card');
    card.append(el('div', 'embed-kind', 'ATProto record'));
    card.append(el('div', 'embed-text', item.snapshot || item.record?.uri || ''));
    const a = el('a', 'embed-link', 'open');
    a.href = atUriToWeb(item.record?.uri);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    card.append(a);
    body.append(card);
    return undefined;
  }

  /** Blob → URL, cached. Pending (not yet uploaded) media resolves from IDB. */
  async _resolveMedia(item, state) {
    const blob = item.image || item.audio || item.file;
    if (blob) return this._blobSrc(blob, state);
    if (item.pending) {
      const key = `idb:${item.pending}`;
      if (!this.mediaUrls.has(key)) this.mediaUrls.set(key, this.hooks.store.pendingUrl(item.pending));
      return this.mediaUrls.get(key);
    }
    return null;
  }

  async _blobSrc(blob, state) {
    const cid = blob?.ref?.$link;
    if (!cid) return null;
    const key = `cid:${cid}`;
    if (!this.mediaUrls.has(key)) {
      this.mediaUrls.set(key, blobUrl(state.doc.did || this.hooks.store?.did, blob));
    }
    return this.mediaUrls.get(key);
  }

  /** Reuse the object URL we already have for bytes we just uploaded, instead
   *  of round-tripping to the PDS to display a picture that is in memory. */
  seedMedia(blob, url) {
    const cid = blob?.ref?.$link;
    if (cid && url) this.mediaUrls.set(`cid:${cid}`, Promise.resolve(url));
  }

  // -------------------------------------------------------------- edges ---

  _defs() {
    const defs = svg('defs');
    for (const tint of ['default', 'slate', 'amber', 'rose', 'violet', 'teal', 'lime']) {
      const marker = svg('marker', {
        id: `arrow-${tint}`, viewBox: '0 0 10 10', refX: '9', refY: '5',
        markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
      });
      marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: `arrowhead tint-${tint}` }));
      defs.append(marker);
    }
    return defs;
  }

  _renderEdges(state) {
    const { doc, selection } = state;
    if (!this.dom.wires.querySelector('defs')) this.dom.wires.append(this._defs());
    const byId = new Map(doc.items.map((it) => [it.id, it]));
    const edges = liveEdges(doc);
    const seen = new Set();

    for (const edge of edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) continue;
      seen.add(edge.id);
      const geo = edgeGeometry(edge, a, b);
      let g = this.edgeNodes.get(edge.id);
      if (!g) {
        g = svg('g', { class: 'edge' });
        g.dataset.edge = edge.id;
        g.append(svg('path', { class: 'edge-hit' }));
        g.append(svg('path', { class: 'edge-line' }));
        const label = svg('text', { class: 'edge-label', 'text-anchor': 'middle' });
        g.append(label);
        this.edgeNodes.set(edge.id, g);
        this.dom.wires.append(g);
      }
      const tint = edge.tint || 'default';
      const [hit, line, label] = g.childNodes;
      hit.setAttribute('d', geo.path);
      line.setAttribute('d', geo.path);
      line.setAttribute('class', `edge-line style-${edge.style || 'arrow'} tint-${tint}`);
      if (edge.style === 'line') line.removeAttribute('marker-end');
      else line.setAttribute('marker-end', `url(#arrow-${tint})`);
      if (edge.style === 'double') line.setAttribute('marker-start', `url(#arrow-${tint})`);
      else line.removeAttribute('marker-start');
      label.textContent = edge.label || '';
      label.setAttribute('x', geo.mid.x.toFixed(1));
      label.setAttribute('y', (geo.mid.y - 6).toFixed(1));
      g.classList.toggle('selected', selection.has(edge.id));
    }

    for (const [id, g] of this.edgeNodes) {
      if (!seen.has(id)) { g.remove(); this.edgeNodes.delete(id); }
    }

    // The connector being dragged right now.
    let ghost = this.dom.wires.querySelector('.edge-ghost');
    if (state.pendingEdge) {
      if (!ghost) {
        ghost = svg('path', { class: 'edge-ghost' });
        this.dom.wires.append(ghost);
      }
      const from = byId.get(state.pendingEdge.from);
      if (from) {
        const target = state.pendingEdge.toItem ? byId.get(state.pendingEdge.toItem) : null;
        const geo = target
          ? edgeGeometry({ fromSide: 'auto', toSide: 'auto' }, from, target)
          : edgeGeometry({ fromSide: 'auto', toSide: 'auto' }, from, {
            x: state.pendingEdge.x, y: state.pendingEdge.y, w: 1, h: 1,
          });
        ghost.setAttribute('d', geo.path);
      }
    } else if (ghost) {
      ghost.remove();
    }
  }

  // ------------------------------------------------------------ overlay ---
  // Screen space. Selection chrome must not scale with the canvas, or handles
  // become either invisible or enormous at the extremes of zoom.

  _renderOverlay(state) {
    const { doc, camera, selection, marquee } = state;
    const o = this.dom.overlay;
    o.replaceChildren();

    if (marquee) {
      const box = el('div', 'marquee');
      Object.assign(box.style, {
        left: `${marquee.x}px`, top: `${marquee.y}px`,
        width: `${marquee.w}px`, height: `${marquee.h}px`,
      });
      o.append(box);
    }

    const sel = doc.items.filter((it) => selection.has(it.id));
    if (!sel.length) return;

    const bb = itemsBounds(sel);
    const tl = worldToScreen(camera, bb.x, bb.y);
    const br = worldToScreen(camera, bb.x + bb.w, bb.y + bb.h);
    const ring = el('div', 'sel-ring');
    Object.assign(ring.style, {
      left: `${tl.x}px`, top: `${tl.y}px`,
      width: `${br.x - tl.x}px`, height: `${br.y - tl.y}px`,
    });
    o.append(ring);

    // Resize handles only for a single item — a group resize would have to
    // decide what "resize" means for a voice note, and the answer is nothing.
    if (sel.length === 1) {
      for (const h of ['nw', 'ne', 'se', 'sw']) {
        const dot = el('div', `handle handle-${h}`);
        dot.dataset.role = 'resize';
        dot.dataset.corner = h;
        const x = h.includes('w') ? tl.x : br.x;
        const y = h.includes('n') ? tl.y : br.y;
        Object.assign(dot.style, { left: `${x}px`, top: `${y}px` });
        o.append(dot);
      }
    }
  }
}

/** at:// → a web URL, when we know how to make one. */
export function atUriToWeb(uri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)/.exec(uri || '');
  if (m) return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
  return uri ? `https://pdsls.dev/${uri}` : '#';
}
