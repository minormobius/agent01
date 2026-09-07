// atlas-map.js — the county-map renderer. Canvas 2D, no dependencies.
//
// THE ARCHITECTURE, AND WHY:
//
// Three thousand counties is enough that the naive loop (project → build path →
// fill, every frame) drops to single-digit frames while you drag. So the work is
// split by how often it changes:
//
//   once per PROJECTION   project every arc point into a flat Float32Array
//   once per GEOMETRY     build one Path2D per unit from those points
//   every FRAME           set a canvas transform and fill the cached paths
//
// Panning and zooming therefore touch no coordinates at all — they are a
// `setTransform` — and recolouring the map (the thing you do constantly when you
// are hunting for an axis) is a fill loop over paths that already exist.
//
// BORDERS ARE DRAWN FROM ARCS, NOT FROM POLYGONS. Because the topology stores a
// shared border once, the renderer can ask a question polygons cannot answer:
// how many units own this arc, and are they in the same group? That gives, from
// one geometry file and with no seams:
//   · interior county borders — hairline
//   · borders between groups (states, or your superstates) — heavier
//   · the outer edge — heaviest
// and when you redraw the superstates, the borders follow instantly, because
// they were never stored anywhere.

/* global globalThis */
(function (root) {
  'use strict';

  const DPR = () => (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

  class AtlasMap {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} opts
     *   topology   unpacked container from ATLAS_CODEC.unpack
     *   projection a projection from ATLAS_PROJ
     *   background CSS colour behind the map
     */
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      // A GL canvas underneath paints the fills and the background, so the 2D
      // canvas has to be see-through. Without WebGL2 it goes back to opaque and
      // paints everything itself.
      this.gl = this._initGL(canvas, opts);
      this.ctx = canvas.getContext('2d', { alpha: !!this.gl });
      this.layers = [];                    // [{ topo, id, kind }]
      this.projection = opts.projection || null;
      this.background = opts.background || '#fcfcfb';
      this.theme = opts.theme || 'light';
      this.zoom = 1; this.ox = 0; this.oy = 0;
      this.width = 0; this.height = 0;
      this.hover = null;
      this.selected = new Set();
      this.interacting = false;      // true while dragging or wheeling
      this.lodZoom = opts.lodZoom == null ? 2.2 : opts.lodZoom;
      this._idle = 0;
      this.meshWorkerUrl = opts.meshWorker || null;
      this._worker = null;
      this._meshSeq = 0;
      this._meshPending = new Map();
      this.onmesh = opts.onmesh || null;
      this.onhover = opts.onhover || null;
      this.onclick = opts.onclick || null;
      this._raf = 0;
      this._colorSerial = 1;
      this._bindEvents();
    }

    // ------------------------------------------------------------ layers --

    /**
     * @param {object} topo   unpacked container
     * @param {object} spec   { id, kind: 'fill'|'outline', groupOf, fillOf, visible }
     */
    addLayer(topo, spec = {}) {
      const L = {
        topo, id: spec.id || topo.layer, kind: spec.kind || 'fill',
        groupOf: spec.groupOf || null, fillOf: spec.fillOf || null,
        visible: spec.visible !== false, order: spec.order ?? this.layers.length,
        interactive: spec.interactive !== false && (spec.kind || 'fill') === 'fill',
        px: null, arcOff: null, paths: null, bboxes: null, arcOwners: null, arcClass: null,
      };
      this.layers.push(L);
      this.layers.sort((a, b) => a.order - b.order);
      this._prepare(L);
      return L;
    }

    layer(id) { return this.layers.find((l) => l.id === id); }

    // ------------------------------------------------- one-off precompute --

    _prepare(L) {
      const t = L.topo;
      // Every one of these caches hangs off the TOPOLOGY, not the layer,
      // because the app throws its layers away and rebuilds them whenever you
      // click County / State / Superstate — and none of this depends on which
      // of those is selected. Recomputing it was 200 ms of frozen interface on
      // every click, which is what the map actually felt like.
      if (t.__prep) { L.arcOwners = t.__prep.owners; L.unitOfArc = t.__prep.unitOfArc; return; }
      // arc → owning unit indices. Only needed once per layer, and it is what
      // every border class below is derived from.
      const owners = new Map();
      for (let u = 0; u < t.ids.length; u++) {
        for (let r = t.polyStart[u]; r < t.polyStart[u + 1]; r++) {
          for (let k = t.ringStart[r]; k < t.ringStart[r + 1]; k++) {
            const a = t.refs[k] < 0 ? ~t.refs[k] : t.refs[k];
            let s = owners.get(a);
            if (!s) owners.set(a, s = []);
            if (s[0] !== u && s[1] !== u) s.push(u);
          }
        }
      }
      L.arcOwners = owners;
      L.unitOfArc = new Int32Array(t.arcs.length).fill(-1);
      for (const [a, us] of owners) L.unitOfArc[a] = us[0];
      t.__prep = { owners, unitOfArc: L.unitOfArc };
    }

    /**
     * A signature for "which projection, fitted how, at what size".
     *
     * The app builds a fresh projection object on every rebuild, so there is no
     * identity to compare. Push three fixed points through it instead: any
     * change of type, rotation, parallels, scale or translate moves at least one
     * of them, and an unchanged projection gives byte-identical output.
     */
    _projKey() {
      const p = this.projection;
      if (!p) return 'none';
      let k = '';
      for (const ll of [[-100, 40], [-80, 30], [-120, 50]]) {
        let q;
        try { q = p(ll[0], ll[1], null); } catch (e) { q = null; }
        k += q ? Math.round(q[0] * 64) + ',' + Math.round(q[1] * 64) + ';' : 'x;';
      }
      return k + Math.round(this.width) + 'x' + Math.round(this.height);
    }

    // ------------------------------------------------------- projection ----

    setProjection(proj) { this.projection = proj; for (const L of this.layers) this._invalidate(L); this.draw(); }

    _project(L) {
      const t = L.topo, proj = this.projection;
      const ck = this._projKey();
      if (t.__px && t.__px.key === ck) { L.px = t.__px.px; L.arcOff = t.__px.arcOff; return; }
      const [sx, sy] = t.transform.scale, [dx, dy] = t.transform.translate;
      let total = 0;
      for (const a of t.arcs) total += a.length / 2;
      const px = new Float32Array(total * 2);
      const off = new Int32Array(t.arcs.length + 1);
      const composite = !!proj.composite;
      let p = 0;
      for (let i = 0; i < t.arcs.length; i++) {
        off[i] = p;
        const arc = t.arcs[i];
        // A composite projection routes by unit identity, and every unit that
        // owns a given arc is necessarily in the same block — two counties
        // cannot share a border across the Alaska inset.
        const region = composite ? proj.regionOf(t.ids[L.unitOfArc[i]] || '') : null;
        for (let j = 0; j < arc.length; j += 2) {
          const q = proj(dx + arc[j] * sx, dy + arc[j + 1] * sy, region);
          px[p * 2] = q[0]; px[p * 2 + 1] = q[1]; p++;
        }
      }
      off[t.arcs.length] = p;
      L.px = px; L.arcOff = off;
      t.__px = { key: ck, px, arcOff: off };
    }

    _buildPaths(L) {
      if (!L.px) this._project(L);
      const t = L.topo, px = L.px, off = L.arcOff;
      const ck = this._projKey();
      if (t.__paths && t.__paths.key === ck) {
        L.paths = t.__paths.paths; L.bboxes = t.__paths.bboxes; L.grid = t.__paths.grid;
        L.borderPaths = null;      // these DO depend on the grouping, so rebuild
        return;
      }
      const paths = new Array(t.ids.length);
      const bboxes = new Float32Array(t.ids.length * 4);
      for (let u = 0; u < t.ids.length; u++) {
        const path = new Path2D();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let r = t.polyStart[u]; r < t.polyStart[u + 1]; r++) {
          let started = false;
          for (let k = t.ringStart[r]; k < t.ringStart[r + 1]; k++) {
            const ref = t.refs[k], rev = ref < 0, a = rev ? ~ref : ref;
            const s = off[a], e = off[a + 1];
            for (let n = 0; n < e - s; n++) {
              const i = rev ? e - 1 - n : s + n;
              const X = px[i * 2], Y = px[i * 2 + 1];
              // consecutive arcs in a ring share their junction point, so
              // every arc after the first contributes from its second point on
              if (n === 0 && !started) { path.moveTo(X, Y); started = true; }
              else if (n > 0) path.lineTo(X, Y);
              if (X < x0) x0 = X; if (X > x1) x1 = X;
              if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
            }
          }
          path.closePath();
        }
        paths[u] = path;
        bboxes.set([x0, y0, x1, y1], u * 4);
      }
      L.paths = paths; L.bboxes = bboxes;
      L.borderPaths = null;
      this._buildGrid(L);
      t.__paths = { key: ck, paths, bboxes, grid: L.grid };
    }

    /** Uniform bucket grid over screen space, so hit-testing looks at ~2 units. */
    _buildGrid(L) {
      const N = 64;
      const b = L.bboxes;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < b.length; i += 4) {
        if (b[i] < x0) x0 = b[i]; if (b[i + 2] > x1) x1 = b[i + 2];
        if (b[i + 1] < y0) y0 = b[i + 1]; if (b[i + 3] > y1) y1 = b[i + 3];
      }
      const cells = Array.from({ length: N * N }, () => []);
      const gx = (v) => Math.max(0, Math.min(N - 1, Math.floor((v - x0) / (x1 - x0 || 1) * N)));
      const gy = (v) => Math.max(0, Math.min(N - 1, Math.floor((v - y0) / (y1 - y0 || 1) * N)));
      for (let u = 0; u < L.paths.length; u++) {
        for (let i = gx(b[u * 4]); i <= gx(b[u * 4 + 2]); i++) {
          for (let j = gy(b[u * 4 + 1]); j <= gy(b[u * 4 + 3]); j++) cells[j * N + i].push(u);
        }
      }
      L.grid = { N, x0, y0, x1, y1, cells, gx, gy };
    }

    /**
     * Classify every arc for a grouping (state, superstate, whatever `groupOf`
     * returns): 0 interior, 1 between groups, 2 outer edge.
     */
    _classifyArcs(L) {
      const t = L.topo, cls = new Uint8Array(t.arcs.length);
      const g = L.groupOf;
      for (const [a, us] of L.arcOwners) {
        if (us.length < 2) { cls[a] = 2; continue; }
        if (!g) { cls[a] = 0; continue; }
        cls[a] = g(t.ids[us[0]]) === g(t.ids[us[1]]) ? 0 : 1;
      }
      L.arcClass = cls;
      L.arcClassKey = L.groupKey;
      L.borderPaths = null;
      return cls;
    }

    /**
     * Build one Path2D per border class, ONCE.
     *
     * THIS IS THE FRAME BUDGET. The border geometry is 200,000 points in fixed
     * screen space; pan and zoom are a canvas transform and do not move a
     * single one of them. Re-issuing those moveTo/lineTo calls every frame —
     * three times over, once per class — measured 183 ms per frame, which is
     * five frames a second and the entire reason this map felt like treacle.
     * Stroking three cached Path2D objects instead measures 1.6 ms.
     *
     * One pass, not three: each arc is appended to whichever path its class
     * calls for, so building the cache costs the same as a single traversal.
     */
    _buildBorderPaths(L) {
      const t = L.topo, px = L.px, off = L.arcOff;
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      for (let a = 0; a < t.arcs.length; a++) {
        const s = off[a], e = off[a + 1];
        if (e - s < 2) continue;
        const P = paths[L.arcClass[a]];
        P.moveTo(px[s * 2], px[s * 2 + 1]);
        for (let i = s + 1; i < e; i++) P.lineTo(px[i * 2], px[i * 2 + 1]);
      }
      L.borderPaths = paths;
    }

    /**
     * LEVEL OF DETAIL.
     *
     * What costs a frame here is not the JavaScript, it is the browser
     * rasterising the polygons: filling 3,225 counties at full resolution
     * measured 237 ms per frame, and the same counties at the coarse tier
     * measured 77 ms. Nothing about that is fixable by making the JavaScript
     * faster — it is pixels, and the only levers are fewer points and fewer
     * polygons.
     *
     * So layers can be paired. Two layers sharing a `lodGroup` are the same
     * geography at two resolutions; the coarse one is drawn while the view is
     * moving or zoomed out, the fine one when it settles above `lodZoom`. At
     * continent scale the coarse tier is 21 points per county, which is more
     * than a county gets on screen anyway, so the swap is invisible and the
     * frame is three times cheaper.
     */
    _pickLod() {
      let groups = null;
      for (const L of this.layers) {
        if (!L.lodGroup) continue;
        (groups || (groups = new Map()));
        let g = groups.get(L.lodGroup);
        if (!g) groups.set(L.lodGroup, g = []);
        g.push(L);
      }
      if (!groups) return;
      const wantFine = !this.interacting && this.zoom >= this.lodZoom;
      for (const g of groups.values()) {
        const fine = g.find((L) => L.tier === 'hi');
        const coarse = g.find((L) => L.tier === 'lo');
        const use = (wantFine && fine) ? fine : (coarse || fine);
        for (const L of g) L.visible = (L === use);
      }
    }

    /** The visible rectangle in un-zoomed canvas coordinates, with a margin. */
    _viewRect() {
      const m = 40 / this.zoom;
      return [
        -this.ox / this.zoom - m, -this.oy / this.zoom - m,
        (this.width - this.ox) / this.zoom + m, (this.height - this.oy) / this.zoom + m,
      ];
    }

    // ------------------------------------------------------------ layout ---

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const d = DPR();
      this.width = r.width; this.height = r.height;
      this.canvas.width = Math.round(r.width * d);
      this.canvas.height = Math.round(r.height * d);
      if (this.gl) this.gl.resize(r.width, r.height, d);
      for (const L of this.layers) this._invalidate(L);
      this.draw();
    }

    /**
     * Put a WebGL2 canvas directly under the 2D one, matching it exactly.
     *
     * Returns null when WebGL2 is missing, and everything downstream checks for
     * that: the Canvas2D fill path is kept intact as the fallback rather than
     * being replaced, so an old browser gets the map it got before.
     */
    _initGL(canvas, opts) {
      if (opts.gl === false || typeof document === 'undefined') return null;
      // ?gl=0 forces the Canvas2D path, ?gl=1 forces GL even on a software
      // renderer. Both exist so the two can be compared on one machine.
      let force = null;
      try {
        const q = new URLSearchParams(location.search).get('gl');
        if (q === '0') return null;
        if (q === '1') force = true;
      } catch (e) { /* no location, e.g. a test harness */ }
      this._forceGL = force;
      if (!canvas.parentNode) return null;
      try {
        const c = document.createElement('canvas');
        c.className = 'atlas-gl';
        const cs = canvas.style;
        c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;' +
          'pointer-events:none;' + (cs.zIndex ? '' : '');
        canvas.parentNode.insertBefore(c, canvas);   // earlier sibling = underneath
        const gl = root.ATLAS_GL && root.ATLAS_GL.GLFill.create(c, force);
        if (!gl) { c.remove(); return null; }
        this.glCanvas = c;
        return gl;
      } catch (e) { return null; }
    }

    /**
     * Ask the worker for this layer's triangles. Fire and forget: the map keeps
     * drawing on the CPU path until the mesh lands, so there is never a frame
     * waiting on the triangulator.
     */
    _meshKey(L) {
      // Keyed to the TOPOLOGY, not the layer. The app rebuilds its layers on
      // every level and theme change, always from the same handful of decoded
      // topologies; keying by layer id would re-triangulate and re-upload a
      // megabyte of buffers each time somebody clicked "State".
      if (L.topo.__mid == null) L.topo.__mid = ++AtlasMap._mid;
      return 'm' + L.topo.__mid;
    }

    _requestMesh(L) {
      if (!this.gl || !this.meshWorkerUrl || L.meshState) return;
      const cached = L.topo.__mesh;
      if (cached) {
        L.mesh = cached;
        L.meshState = 'ready';
        L.glPosStale = true;
        return;
      }
      if (!L.px) this._project(L);
      L.meshState = 'pending';
      try {
        if (!this._worker) {
          this._worker = new Worker(this.meshWorkerUrl);
          this._worker.onmessage = (e) => this._onMesh(e.data);
          this._worker.onerror = () => { this._worker = null; };
        }
      } catch (e) { L.meshState = 'failed'; return; }

      const id = ++this._meshSeq;
      this._meshPending.set(id, L);
      const t = L.topo;
      const px = L.px.slice();          // transferred away; the layer keeps its own
      const arcOff = L.arcOff.slice();
      this._worker.postMessage({
        id, count: t.ids.length,
        refs: t.refs, ringStart: t.ringStart, polyStart: t.polyStart,
        px, arcOff,
      }, [px.buffer, arcOff.buffer]);
    }

    _onMesh(msg) {
      const L = this._meshPending.get(msg.id);
      this._meshPending.delete(msg.id);
      if (!L) return;
      if (!msg.ok || !this.gl) { L.meshState = 'failed'; return; }
      L.mesh = msg.mesh;
      L.topo.__mesh = msg.mesh;
      L.meshState = 'ready';
      L.meshMs = msg.ms;
      L.glPosStale = true;
      if (this.onmesh) this.onmesh(L);
      this.draw();
    }

    /** Push this layer's current fill colours into its GPU colour texture. */
    _syncGLColors(L, key) {
      if (L.glColorSerial === this._colorSerial) return;
      L.glColorSerial = this._colorSerial;
      const t = L.topo;
      this.gl.setColors(key, (u) => (L.fillOf ? (L.fillOf(t.ids[u], u) || 'transparent') : '#dfe3e6'));
    }

    /**
     * Say that the fill callbacks now return different colours.
     *
     * The renderer cannot see this for itself — `fillOf` closes over the app's
     * palette — so recolouring without this call leaves the GPU showing the old
     * measure. Cheap: it bumps a counter, and the ~24 KB texture upload happens
     * on the next frame.
     */
    invalidateColors() { this._colorSerial++; this.draw(); }

    /** Everything downstream of the projected coordinates. */
    _invalidate(L) {
      // Only the layer's references go. The caches on the topology stay and are
      // re-checked against the projection signature, so a resize back to a size
      // already seen costs nothing.
      L.px = null; L.paths = null; L.borderPaths = null; L.grid = null;
      // The mesh survives: a resize or refit changes the projection only by an
      // affine factor, and an affine map cannot invalidate a triangulation. Only
      // the positions need re-gathering, which _draw does when it sees this.
      L.glPosStale = true;
    }

    /** Reset pan/zoom and refit the projection to the viewport. */
    fit(bbox) {
      this.zoom = 1; this.ox = 0; this.oy = 0;
      if (this.projection && this.projection.fit) this.projection.fit(bbox, this.width, this.height);
      for (const L of this.layers) this._invalidate(L);
      this.draw();
    }

    /** Zoom to a unit's screen bbox with padding, animated by the caller. */
    zoomTo(bbox, pad = 40) {
      const [x0, y0, x1, y1] = bbox;
      const z = Math.min(this.width / (x1 - x0 + pad * 2), this.height / (y1 - y0 + pad * 2), 40);
      this.zoom = z;
      this.ox = this.width / 2 - z * (x0 + x1) / 2;
      this.oy = this.height / 2 - z * (y0 + y1) / 2;
      this.draw();
    }

    unitBBox(layerId, id) {
      const L = this.layer(layerId); if (!L) return null;
      if (!L.paths) this._buildPaths(L);
      const u = L.topo.index[id]; if (u === undefined) return null;
      return [L.bboxes[u * 4], L.bboxes[u * 4 + 1], L.bboxes[u * 4 + 2], L.bboxes[u * 4 + 3]];
    }

    // ------------------------------------------------------------- draw ----

    draw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
    }

    _draw() {
      const ctx = this.ctx, d = DPR();
      if (!this.width) this.resize();
      this._pickLod();

      const visible = this.layers.filter((L) => L.visible !== false);

      // ---------------------------------------------------------- GPU pass --
      // One drawElements for every fill on the map. Everything the CPU still
      // does below is lines and text, which is cheap and which WebGL draws
      // badly.
      let glKeys = null;
      if (this.gl) {
        glKeys = [];
        for (const L of visible) {
          if (L.kind !== 'fill') continue;
          if (!L.meshState) this._requestMesh(L);
          if (L.meshState !== 'ready') continue;
          const key = this._meshKey(L);
          if (L.glPosStale || !this.gl.has(key)) {
            if (!L.px) this._project(L);
            const pos = root.ATLAS_MESH.meshPositions(L.mesh, L.px);
            if (this.gl.has(key)) this.gl.setPositions(key, pos);
            else this.gl.setMesh(key, L.mesh, pos);
            L.glPosStale = false;
            L.glColorSerial = 0;        // a fresh batch has an empty colour texture
          }
          this._syncGLColors(L, key);
          glKeys.push(key);
        }
        this.gl.resize(this.width, this.height, d);
        this.gl.draw(glKeys, {
          zoom: this.zoom, ox: this.ox, oy: this.oy, dpr: d, background: this.background,
        });
      }

      // ------------------------------------------------------- 2D overlay --
      this.canvas.width = Math.round(this.width * d);
      this.canvas.height = Math.round(this.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (this.gl) ctx.clearRect(0, 0, this.width, this.height);
      else { ctx.fillStyle = this.background; ctx.fillRect(0, 0, this.width, this.height); }
      ctx.setTransform(d * this.zoom, 0, 0, d * this.zoom, d * this.ox, d * this.oy);
      const inv = 1 / this.zoom;

      for (const L of visible) {
        if (!L.paths) this._buildPaths(L);
        const t = L.topo;
        const onGPU = glKeys ? glKeys.indexOf(this._meshKey(L)) >= 0 : false;

        if (L.kind === 'fill') {
          ctx.lineJoin = 'round';
          if (!onGPU) {
            // Cull by screen bounding box. At zoom 1 this rejects nothing, which
            // is correct — the whole country is on screen. Zoomed into a state it
            // rejects most of the country, and that is where a full-detail fill
            // would otherwise be at its most expensive.
            const [vx0, vy0, vx1, vy1] = this._viewRect();
            const bb = L.bboxes;
            for (let u = 0; u < t.ids.length; u++) {
              const o = u * 4;
              if (bb[o + 2] < vx0 || bb[o] > vx1 || bb[o + 3] < vy0 || bb[o + 1] > vy1) continue;
              ctx.fillStyle = L.fillOf ? (L.fillOf(t.ids[u], u) || 'transparent') : '#dfe3e6';
              ctx.fill(L.paths[u]);
            }
          }
          this._strokeBorders(L, inv);
        } else {
          ctx.strokeStyle = L.stroke || 'rgba(11,11,11,0.25)';
          ctx.lineWidth = (L.strokeWidth || 0.8) * inv;
          for (let u = 0; u < t.ids.length; u++) ctx.stroke(L.paths[u]);
        }

        // selection and hover sit above everything in the layer
        if (L.interactive) {
          ctx.lineJoin = 'round';
          if (this.selected.size) {
            ctx.strokeStyle = this.theme === 'dark' ? '#ffffff' : '#0b0b0b';
            ctx.lineWidth = 1.6 * inv;
            for (const id of this.selected) { const u = t.index[id]; if (u !== undefined) ctx.stroke(L.paths[u]); }
          }
          if (this.hover && t.index[this.hover] !== undefined) {
            ctx.strokeStyle = this.theme === 'dark' ? '#ffffff' : '#0b0b0b';
            ctx.lineWidth = 2 * inv;
            ctx.stroke(L.paths[t.index[this.hover]]);
          }
        }
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (this.overlay) this.overlay(ctx, this);
    }

    _strokeBorders(L, inv) {
      const ctx = this.ctx;
      if (!L.arcClass || L.arcClassKey !== L.groupKey) this._classifyArcs(L);
      if (!L.borderPaths) this._buildBorderPaths(L);
      const S = L.borderStyle || {};
      // Widths are divided by the zoom so a hairline stays a hairline as you
      // zoom in. A border that thickens with the zoom is what makes a county
      // map go muddy at scale.
      const draw = (i, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width * inv;
        ctx.stroke(L.borderPaths[i]);
      };
      // The county mesh is 11,000 hairlines and costs about 12 ms a frame. It
      // is also the least legible thing on screen while the map is moving, so
      // it is dropped during a drag and comes back when the view settles.
      // (Merging the fills into one path per colour class was tried here and
      // measured SLOWER — 36 ms against 27 — so the fills stay individual.)
      if (S.interior !== false && !this.interacting) draw(0, S.interiorColor || 'rgba(11,11,11,0.13)', S.interiorWidth || 0.55);
      if (S.group !== false)    draw(1, S.groupColor || 'rgba(11,11,11,0.55)', S.groupWidth || 1.3);
      if (S.outer !== false)    draw(2, S.outerColor || 'rgba(11,11,11,0.75)', S.outerWidth || 1.1);
    }

    // ------------------------------------------------------ interaction ----

    at(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const x = (clientX - r.left - this.ox) / this.zoom;
      const y = (clientY - r.top - this.oy) / this.zoom;
      for (let i = this.layers.length - 1; i >= 0; i--) {
        const L = this.layers[i];
        if (!L.visible || !L.interactive || !L.grid) continue;
        const g = L.grid;
        if (x < g.x0 || x > g.x1 || y < g.y0 || y > g.y1) continue;
        const cell = g.cells[g.gy(y) * g.N + g.gx(x)];
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const u of cell) {
          const b = L.bboxes;
          if (x < b[u * 4] || x > b[u * 4 + 2] || y < b[u * 4 + 1] || y > b[u * 4 + 3]) continue;
          if (ctx.isPointInPath(L.paths[u], x, y)) return { layer: L.id, id: L.topo.ids[u], index: u };
        }
      }
      return null;
    }

    _bindEvents() {
      const c = this.canvas;
      let drag = null;
      c.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: 0 };
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      });
      c.addEventListener('pointermove', (e) => {
        if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
          this.ox = drag.ox + dx; this.oy = drag.oy + dy;
          if (drag.moved > 3) this.interacting = true;
          this.draw();
          return;
        }
        const hit = this.at(e.clientX, e.clientY);
        const id = hit ? hit.id : null;
        if (id !== this.hover) { this.hover = id; this.draw(); if (this.onhover) this.onhover(hit, e); }
        else if (this.onhover && hit) this.onhover(hit, e);
      });
      const settle = () => {
        // One full-detail repaint once the view stops moving. Without it the
        // map would stay on the coarse tier after every drag.
        clearTimeout(this._idle);
        this._idle = setTimeout(() => { this.interacting = false; this.draw(); }, 90);
      };
      const end = (e) => {
        if (drag && drag.moved < 4 && this.onclick) {
          const hit = this.at(e.clientX, e.clientY);
          this.onclick(hit, e);
        }
        drag = null;
        settle();
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', () => { drag = null; settle(); });
      c.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.draw(); if (this.onhover) this.onhover(null); } });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
        const z = Math.max(0.6, Math.min(60, this.zoom * k));
        const f = z / this.zoom;
        this.ox = mx - (mx - this.ox) * f;
        this.oy = my - (my - this.oy) * f;
        this.zoom = z;
        this.interacting = true;
        settle();
        this.draw();
      }, { passive: false });
    }
  }
  AtlasMap._mid = 0;

  const API = { AtlasMap };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_MAP = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
