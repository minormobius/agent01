/* Orb & Strand — the torus.

   A torus is a rectangle whose opposite edges are glued: the FLAT torus, a
   W × H domain where walking off the right edge brings you in on the left
   and off the top in at the bottom. Its geometry is exactly flat, so unlike
   the sphere it has a perfect map: the rectangle itself, wrapping both ways.
   Euler characteristic 0, so the average cell has exactly six neighbours,
   with no pentagons or other defects needed (the sphere needs twelve).

   Two meshes:
     hex      a honeycomb of rows × cols regular hexagons (rows even, so the
              offset rows close up), every cell with exactly six
              neighbours. Its corners, three bonds each, are a carbon
              NANOTORUS: graphene rolled up and closed on itself.
     voronoi  random sites in the rectangle, the Voronoi diagram of the flat
              torus (each site against its neighbours' images in the eight
              surrounding copies), Lloyd-relaxed like Orb's sphere.

   W/H = 4/√3, the proportion at which hexes of a cols = 2·rows honeycomb
   are regular. Drawn as a donut with tube radius r = R·H/W, cells are
   true-shaped along the tube's top and bottom, stretched on the outside and
   squeezed on the inside, as on any real torus (all its circles round the
   hole have different lengths).

   A mesh: { topology: "torus", kind, n, W, H, sites (2n: u, v), verts
   (2·nv, canonical in [0,W) × [0,H)), polys (vertex ids, counter-
   clockwise), nbrs (in the same rotational order), seed }.
   Every geometric question (where is j from i?) goes through delta(), the
   shortest wrap-around difference.

   Then the two ways to look at it, shared by the games' views:
     Donut    a fixed camera above and in front of a donut; dragging slides
              the SKIN round the ring and the tube, so any cell can be
              brought to the front. Painter's order, back faces dropped, and
              a ray-march to know which points the near tube hides.
     Flat     the rectangle itself, panned with the skin, tiled to fill the
              screen; nothing is distorted and everything is in view. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};
  var TAU = 2 * Math.PI, ASPECT = 4 / Math.sqrt(3);

  function wrap(x, L) { x %= L; return x < 0 ? x + L : x; }
  function delta(mesh, ax, ay, bx, by) { // b − a, the short way round
    var dx = bx - ax, dy = by - ay, W = mesh.W, H = mesh.H;
    dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
    return [dx, dy];
  }
  function siteDelta(mesh, i, j) { var S = mesh.sites; return delta(mesh, S[2 * i], S[2 * i + 1], S[2 * j], S[2 * j + 1]); }

  /* Shared vertices: dedupe corners by canonical position (with a
     tolerance, checked against neighbouring hash bins). */
  function Verts(W, H, tol) {
    this.W = W; this.H = H; this.tol = tol; this.xy = []; this.bins = new Map(); this.g = tol * 8;
  }
  Verts.prototype.id = function (x, y) {
    x = wrap(x, this.W); y = wrap(y, this.H);
    var g = this.g, bx = Math.floor(x / g), by = Math.floor(y / g), nbx = Math.ceil(this.W / g), nby = Math.ceil(this.H / g);
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      var list = this.bins.get(((bx + dx + nbx) % nbx) + "," + ((by + dy + nby) % nby));
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var v = list[k], ddx = this.xy[2 * v] - x, ddy = this.xy[2 * v + 1] - y;
        ddx -= this.W * Math.round(ddx / this.W); ddy -= this.H * Math.round(ddy / this.H);
        if (Math.abs(ddx) < this.tol && Math.abs(ddy) < this.tol) return v;
      }
    }
    var id = this.xy.length / 2; this.xy.push(x, y);
    var key = bx + "," + by; if (!this.bins.has(key)) this.bins.set(key, []); this.bins.get(key).push(id);
    return id;
  };

  /* Sort each cell's neighbours (and corners) by angle round it. */
  function orderRing(mesh, i, ids, xy) {
    var S = mesh.sites, cx = S[2 * i], cy = S[2 * i + 1];
    return ids.slice().sort(function (a, b) {
      var da = delta(mesh, cx, cy, xy(a)[0], xy(a)[1]), db = delta(mesh, cx, cy, xy(b)[0], xy(b)[1]);
      return Math.atan2(da[1], da[0]) - Math.atan2(db[1], db[0]);
    });
  }

  /* The honeycomb torus: pointy-top hexes, odd rows shifted half a hex. */
  function buildHexTorus(rows, cols) {
    if (rows % 2) throw new Error("hex torus needs an even number of rows");
    var s = 1, w = Math.sqrt(3) * s, h = 1.5 * s, W = cols * w, H = rows * h, n = rows * cols;
    var sites = new Float64Array(2 * n), V = new Verts(W, H, 1e-6), polys = [], nbrs = [];
    var id = function (i, j) { return ((j % rows) + rows) % rows * cols + ((i % cols) + cols) % cols; };
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var c = id(i, j), cx = (i + 0.5 * (j & 1)) * w + w / 2, cy = j * h + h / 2;
      sites[2 * c] = cx; sites[2 * c + 1] = cy;
      var ring = [];
      for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; ring.push(V.id(cx + s * Math.cos(a), cy + s * Math.sin(a))); }
      polys[c] = ring;
      nbrs[c] = (j & 1)
        ? [id(i - 1, j), id(i + 1, j), id(i, j - 1), id(i + 1, j - 1), id(i, j + 1), id(i + 1, j + 1)]
        : [id(i - 1, j), id(i + 1, j), id(i - 1, j - 1), id(i, j - 1), id(i - 1, j + 1), id(i, j + 1)];
    }
    var mesh = { topology: "torus", kind: "hex", n: n, W: W, H: H, sites: sites, verts: Float64Array.from(V.xy), polys: polys, nbrs: nbrs, rows: rows, cols: cols };
    var vx = function (v) { return [mesh.verts[2 * v], mesh.verts[2 * v + 1]]; }, sx = function (v) { return [sites[2 * v], sites[2 * v + 1]]; };
    for (c = 0; c < n; c++) { mesh.polys[c] = orderRing(mesh, c, polys[c], vx); mesh.nbrs[c] = orderRing(mesh, c, nbrs[c], sx); }
    return mesh;
  }

  /* One Voronoi cell of the flat torus: clip a box round site i by the
     bisector with every nearby image of every other site, nearest first,
     until no farther site could cut it. Returns its corners (unwrapped,
     round the site) and, per edge, the site across it. */
  function cellOf(P, n, W, H, i, grid) {
    var px = P[2 * i], py = P[2 * i + 1];
    var poly = [[px - W, py - H, -1], [px + W, py - H, -1], [px + W, py + H, -1], [px - W, py + H, -1]]; // [x, y, site across the edge that starts here]
    var cands = grid.near(px, py);
    for (var q = 0; q < cands.length; q++) {
      var c = cands[q];
      if (c.d2 > 4 * maxR2(poly, px, py) + 1e-12) break;
      if (c.j === i && c.ox === 0 && c.oy === 0) continue;
      // keep points nearer site i than image (qx, qy): (x − mid)·(q − p) ≤ 0
      var qx = P[2 * c.j] + c.ox, qy = P[2 * c.j + 1] + c.oy, nx = qx - px, ny = qy - py, mx = (px + qx) / 2, my = (py + qy) / 2;
      var out = [], L = poly.length;
      for (var k = 0; k < L; k++) {
        var A = poly[k], B = poly[(k + 1) % L];
        var da = (A[0] - mx) * nx + (A[1] - my) * ny, db = (B[0] - mx) * nx + (B[1] - my) * ny;
        if (da <= 0) out.push(A);
        if ((da <= 0) !== (db <= 0)) {
          var t = da / (da - db), X = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), -1];
          // the new corner starts the edge along the bisector when we're leaving the kept side
          X[2] = da <= 0 ? c.j : A[2];
          out.push(X);
        }
      }
      poly = out;
    }
    return poly;
  }
  function maxR2(poly, px, py) { var m = 0; for (var k = 0; k < poly.length; k++) { var d = (poly[k][0] - px) * (poly[k][0] - px) + (poly[k][1] - py) * (poly[k][1] - py); if (d > m) m = d; } return m; }

  /* Every site and its 8 images, bucketed, so each cell clips against its
     neighbourhood only. near() returns them nearest first. */
  function ImageGrid(P, n, W, H) {
    var g = Math.sqrt(W * H / n) * 1.5;
    this.g = g; this.b = new Map(); this.P = P;
    for (var j = 0; j < n; j++) for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
      var x = P[2 * j] + a * W, y = P[2 * j + 1] + b * H, key = Math.floor(x / g) + "," + Math.floor(y / g);
      if (!this.b.has(key)) this.b.set(key, []);
      this.b.get(key).push({ j: j, ox: a * W, oy: b * H, x: x, y: y });
    }
  }
  ImageGrid.prototype.near = function (px, py) {
    var g = this.g, bx = Math.floor(px / g), by = Math.floor(py / g), out = [];
    for (var a = -3; a <= 3; a++) for (var b = -3; b <= 3; b++) {
      var list = this.b.get((bx + a) + "," + (by + b)); if (!list) continue;
      for (var k = 0; k < list.length; k++) { var c = list[k]; out.push({ j: c.j, ox: c.ox, oy: c.oy, d2: (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py) }); }
    }
    return out.sort(function (u, v) { return u.d2 - v.d2; });
  };

  function voronoiTorus(P, n, W, H) {
    var grid = new ImageGrid(P, n, W, H), V = new Verts(W, H, 1e-7 * W), polys = [], nbrs = [], cells = [];
    for (var i = 0; i < n; i++) {
      var poly = cellOf(P, n, W, H, i, grid), ring = [], ns = [];
      // drop the near-duplicate corners floating point can leave
      for (var k = 0; k < poly.length; k++) {
        var A = poly[k], B = poly[(k + 1) % poly.length];
        if (Math.hypot(A[0] - B[0], A[1] - B[1]) < 1e-9 * W) continue;
        ring.push(V.id(A[0], A[1])); if (A[2] >= 0 && ns.indexOf(A[2]) < 0) ns.push(A[2]);
      }
      polys.push(ring); nbrs.push(ns); cells.push(poly);
    }
    return { polys: polys, nbrs: nbrs, verts: Float64Array.from(V.xy), cells: cells };
  }

  /* The torus Voronoi mesh: n random sites, `relax` rounds of Lloyd. */
  function buildTorus(seed, n, relax) {
    if (relax == null) relax = 2;
    var W = ASPECT, H = 1, rng = O.rngFor(seed, "torus", n), P = new Float64Array(2 * n);
    for (var i = 0; i < n; i++) { P[2 * i] = rng.next() * W; P[2 * i + 1] = rng.next() * H; }
    var vor = voronoiTorus(P, n, W, H);
    for (var it = 0; it < relax; it++) {
      for (i = 0; i < n; i++) { // area-weighted centroid of the (unwrapped) cell
        var poly = vor.cells[i], A = 0, cx = 0, cy = 0;
        for (var k = 0; k < poly.length; k++) {
          var a = poly[k], b = poly[(k + 1) % poly.length], cr = a[0] * b[1] - b[0] * a[1];
          A += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr;
        }
        if (Math.abs(A) > 1e-15) { P[2 * i] = wrap(cx / (3 * A), W); P[2 * i + 1] = wrap(cy / (3 * A), H); }
      }
      vor = voronoiTorus(P, n, W, H);
    }
    var mesh = { topology: "torus", kind: "voronoi", n: n, W: W, H: H, sites: P, verts: vor.verts, polys: vor.polys, nbrs: vor.nbrs, seed: seed, relax: relax };
    var vx = function (v) { return [mesh.verts[2 * v], mesh.verts[2 * v + 1]]; }, sx = function (v) { return [P[2 * v], P[2 * v + 1]]; };
    // symmetrise (a cell sees j iff j sees it) and put both rings in the same rotational order
    for (i = 0; i < n; i++) mesh.nbrs[i].forEach(function (j) { if (mesh.nbrs[j].indexOf(i) < 0) mesh.nbrs[j].push(i); });
    for (i = 0; i < n; i++) { mesh.polys[i] = orderRing(mesh, i, mesh.polys[i], vx); mesh.nbrs[i] = orderRing(mesh, i, mesh.nbrs[i], sx); }
    return mesh;
  }

  /* The cell at flat point (u, v): the nearest site, the short way round —
     exact for Voronoi, and for the honeycomb (the hex grid is its own
     sites' Voronoi diagram). */
  function torusCellAt(mesh, u, v) {
    var S = mesh.sites, best = Infinity, bi = -1, W = mesh.W, H = mesh.H;
    u = wrap(u, W); v = wrap(v, H);
    for (var i = 0; i < mesh.n; i++) {
      var dx = S[2 * i] - u, dy = S[2 * i + 1] - v;
      dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
      var d = dx * dx + dy * dy; if (d < best) { best = d; bi = i; }
    }
    return bi;
  }
  /* A cell's corners unwrapped round its own site (flat coordinates). */
  function cellRing(mesh, i) {
    var S = mesh.sites, cx = S[2 * i], cy = S[2 * i + 1];
    return mesh.polys[i].map(function (v) { var d = delta(mesh, cx, cy, mesh.verts[2 * v], mesh.verts[2 * v + 1]); return [cx + d[0], cy + d[1]]; });
  }

  /* ------------------------------------------------------------ the views */

  /* The shared state of a torus view: the skin's offset (ou, ov) in flat
     units, which both the donut and the flat map read, so switching views
     keeps your place. The SWEET SPOT is the point of the donut that faces
     the camera squarely: θ = −90° (the front), φ = the camera's tilt. */
  function TorusCam(mesh) {
    this.mesh = mesh; this.ou = 0; this.ov = 0; this.tilt = 50 * Math.PI / 180; this.zoom = 1;
    this.R = 1; this.r = mesh.H / mesh.W; // tube radius: cells true-shaped along the tube's top
  }
  TorusCam.prototype.sweet = function () { // flat point under the sweet spot
    var m = this.mesh;
    return [wrap(m.W * -0.25 - this.ou, m.W), wrap(m.H * this.tilt / TAU - this.ov, m.H)];
  };
  /* Move the skin so flat point (u, v) heads for the sweet spot, by fraction t. */
  TorusCam.prototype.toward = function (u, v, t) {
    var m = this.mesh, s = this.sweet(), d = delta(m, s[0], s[1], u, v);
    this.ou -= d[0] * (t == null ? 1 : t); this.ov -= d[1] * (t == null ? 1 : t);
  };

  /* The donut: orthographic, camera looking down at `tilt` from the front.
     right = (1,0,0), up = (0, sin a, cos a), toward the viewer d = (0, −cos a, sin a). */
  TorusCam.prototype.embed = function (u, v) {
    var m = this.mesh, th = TAU * (u + this.ou) / m.W, ph = TAU * (v + this.ov) / m.H;
    var R = this.R, r = this.r, cp = Math.cos(ph), sp = Math.sin(ph), ct = Math.cos(th), st = Math.sin(th);
    var x = (R + r * cp) * ct, y = (R + r * cp) * st, z = r * sp, nx = cp * ct, ny = cp * st, nz = sp;
    var a = this.tilt, ca = Math.cos(a), sa = Math.sin(a);
    return { X: x, Y: y * sa + z * ca, D: -y * ca + z * sa, face: -ny * ca + nz * sa, n: [nx, ny, nz], p: [x, y, z] };
  };
  /* Is this point of the surface hidden by another part of it? March
     toward the viewer and see whether the ray enters the solid torus. */
  TorusCam.prototype.hidden = function (p) {
    var a = this.tilt, dx = 0, dy = -Math.cos(a), dz = Math.sin(a), R = this.R, r = this.r, r2 = r * r * 0.995;
    var step = r / 5, tmax = 2 * (R + r) + r;
    for (var t = step * 0.6; t < tmax; t += step) {
      var x = p[0] + dx * t, y = p[1] + dy * t, z = p[2] + dz * t, q = Math.hypot(x, y) - R;
      if (q * q + z * z < r2) return true;
    }
    return false;
  };
  /* The flat map's orientation and scale. The torus is wide (W/H = 4/√3),
     so on a portrait screen the map is turned a quarter: the long way runs
     down the screen. Screen offset = k·M·(du, dv), M one of
       landscape  u → right, v → up         [1, 0, 0, −1]
       portrait   u → up, v → left          [0, −1, −1, 0]
     Scale: the whole rectangle if that leaves cells big enough to tap
     (about 34 px), else bigger and panned, at most one screen of torus.
     The mini map is always landscape and always all of it. */
  TorusCam.prototype.flatLayout = function (w, h, mini) {
    var m = this.mesh, portrait = !mini && h > w * 1.05;
    var Lw = portrait ? m.H : m.W, Lh = portrait ? m.W : m.H, fit = Math.min(w / Lw, h / Lh) * 0.98;
    var k = mini ? fit : Math.min(Math.max(fit, 34 / Math.sqrt(m.W * m.H / m.n)), Math.max(w / Lw, h / Lh)) * this.zoom;
    return { k: k, M: portrait ? [0, -1, -1, 0] : [1, 0, 0, -1], portrait: portrait };
  };
  TorusCam.prototype.scale = function (w, h) {
    var a = this.tilt, ext = (this.R + this.r) * Math.sin(a) + this.r * Math.cos(a);
    return Math.min(w / (2 * (this.R + this.r)), h / (2 * ext)) * 0.94 * this.zoom;
  };

  /* A projection of the whole mesh for one frame, in either view. Gives
     every consumer the same questions to ask:
       cell(i)    [x, y, depth, visible, facing] of the cell's centre
       ring(i)    the cell's corners on screen, or null if not drawn
       near(j, i) where j is drawn as seen from i (the same as cell(j) on
                  the donut; on the flat map, the copy of j next to i)
       corner(v, i)  vertex v as seen from cell i
       order      cells to draw, back to front
       tiles      on the flat map, the offsets to repeat the drawing at so
                  the wrap fills the screen
     and pick(x, y) → the cell under a screen point. */
  function Frame(cam, vp, mode, mesh) {
    this.cam = cam; this.vp = vp; this.mode = mode; var m = mesh || cam.mesh; this.mesh = m;
    var n = m.n, S = m.sites, self = this;
    if (mode === "donut") {
      var k = cam.scale(vp.w, vp.h), cx = vp.cx, cy = vp.cy;
      this.k = k;
      var P = new Array(n), Vp = new Array(m.verts.length / 2);
      for (var i = 0; i < n; i++) {
        var e = cam.embed(S[2 * i], S[2 * i + 1]);
        P[i] = [cx + k * e.X, cy - k * e.Y, e.D, e.face > 0.02 && !cam.hidden(e.p), e.face];
      }
      for (var v = 0; v < Vp.length; v++) { var f = cam.embed(m.verts[2 * v], m.verts[2 * v + 1]); Vp[v] = [cx + k * f.X, cy - k * f.Y, f.D, f.face]; }
      this.P = P; this.Vp = Vp;
      this.order = [];
      for (i = 0; i < n; i++) if (P[i][4] > -0.15) this.order.push(i);
      this.order.sort(function (a, b) { return P[a][2] - P[b][2]; });
      this.cellR = k * Math.sqrt(m.W * m.H / n) * 0.55 * (cam.r / m.H * TAU);
      this.tiles = [[0, 0]];
    } else {
      // the flat map: the sweet spot at the centre of the view
      var L = cam.flatLayout(vp.w, vp.h, vp.mini), sc = L.k, M = L.M, sw = cam.sweet();
      this.k = sc; this.M = M; this.cellR = sc * Math.sqrt(m.W * m.H / n) * 0.55;
      var at = function (u, v) { // the copy of flat (u, v) within half a period of the sweet spot
        var du = wrap(u - sw[0] + m.W / 2, m.W) - m.W / 2, dv = wrap(v - sw[1] + m.H / 2, m.H) - m.H / 2;
        return [vp.cx + sc * (M[0] * du + M[1] * dv), vp.cy + sc * (M[2] * du + M[3] * dv)];
      };
      this.at = at; this.sw = sw;
      P = new Array(n);
      for (i = 0; i < n; i++) { var q = at(S[2 * i], S[2 * i + 1]); P[i] = [q[0], q[1], 0, true, 1]; }
      this.P = P; this.order = []; for (i = 0; i < n; i++) this.order.push(i);
      // the periods on screen, and the copies of the window that reach into the view
      var U = [sc * M[0] * m.W, sc * M[2] * m.W], V = [sc * M[1] * m.H, sc * M[3] * m.H];
      this.U = U; this.V = V; this.tiles = [];
      var ext = Math.abs(U[0]) + Math.abs(V[0]), eyt = Math.abs(U[1]) + Math.abs(V[1]);
      if (vp.mini) this.tiles.push([0, 0]);
      else for (var a = -3; a <= 3; a++) for (var b2 = -3; b2 <= 3; b2++) {
        var ox = a * U[0] + b2 * V[0], oy = a * U[1] + b2 * V[1], x0 = vp.cx + ox, y0 = vp.cy + oy;
        if (x0 + ext / 2 * 1.1 < 0 || x0 - ext / 2 * 1.1 > vp.w || y0 + eyt / 2 * 1.1 < 0 || y0 - eyt / 2 * 1.1 > vp.h) continue;
        this.tiles.push([ox, oy]);
      }
      // the window (one whole torus) as a screen rectangle, for outlining
      this.box = [vp.cx - ext / 2, vp.cy - eyt / 2, ext, eyt];
    }
  }
  Frame.prototype.cell = function (i) { return this.P[i]; };
  Frame.prototype.off = function (A, d) { var M = this.M, k = this.k; return [A[0] + k * (M[0] * d[0] + M[1] * d[1]), A[1] + k * (M[2] * d[0] + M[3] * d[1]), 0, true, 1]; };
  Frame.prototype.near = function (j, i) {
    if (this.mode === "donut") return this.P[j];
    return this.off(this.P[i], siteDelta(this.mesh, i, j));
  };
  Frame.prototype.corner = function (v, i) {
    if (this.mode === "donut") return this.Vp[v];
    var m = this.mesh;
    return this.off(this.P[i], delta(m, m.sites[2 * i], m.sites[2 * i + 1], m.verts[2 * v], m.verts[2 * v + 1]));
  };
  /* Flat point under a screen point (flat map). */
  Frame.prototype.flatAt = function (x, y) {
    var M = this.M, k = this.k, dx = (x - this.vp.cx) / k, dy = (y - this.vp.cy) / k, det = M[0] * M[3] - M[1] * M[2];
    var du = (M[3] * dx - M[1] * dy) / det, dv = (-M[2] * dx + M[0] * dy) / det;
    return [this.sw[0] + du, this.sw[1] + dv];
  };
  Frame.prototype.ring = function (i) {
    var self = this;
    if (this.mode === "donut") { if (this.P[i][4] < -0.15) return null; return this.mesh.polys[i].map(function (v) { return self.Vp[v]; }); }
    return this.mesh.polys[i].map(function (v) { return self.corner(v, i); });
  };
  /* The cell under a screen point (or -1). */
  Frame.prototype.pick = function (x, y) {
    var m = this.mesh;
    if (this.mode === "flat") { var f = this.flatAt(x, y); return torusCellAt(m, f[0], f[1]); } // any copy: a whole period away is the same point
    for (var q = this.order.length - 1; q >= 0; q--) {
      var i = this.order[q], ring = this.ring(i);
      if (!ring || this.P[i][4] < 0.02) continue;
      if (inPoly(ring, x, y)) return i;
    }
    return -1;
  };
  function inPoly(ring, x, y) {
    var c = false;
    for (var a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      var A = ring[a], B = ring[b];
      if (((A[1] > y) !== (B[1] > y)) && x < (B[0] - A[0]) * (y - A[1]) / (B[1] - A[1]) + A[0]) c = !c;
    }
    return c;
  }
  /* Slide the skin by a screen drag: on the donut, sideways turns it round
     its axis and up/down rolls the skin over the tube; on the flat map the
     map follows the finger. */
  TorusCam.prototype.drag = function (dx, dy, mode, w, h) {
    var m = this.mesh;
    if (mode === "flat") { // the map follows the finger
      var L = this.flatLayout(w, h), M = L.M, det = M[0] * M[3] - M[1] * M[2], ex = dx / L.k, ey = dy / L.k;
      this.ou += (M[3] * ex - M[1] * ey) / det; this.ov += (-M[2] * ex + M[0] * ey) / det; return;
    }
    var k = this.scale(w, h);
    this.ou += dx / (k * (this.R + this.r * Math.cos(this.tilt))) * m.W / TAU;
    this.ov -= dy / (k * this.r) * m.H / TAU * 0.6;
  };

  O.buildTorus = buildTorus;
  O.buildHexTorus = buildHexTorus;
  O.torusCellAt = torusCellAt;
  O.torusDelta = siteDelta;
  O.torusRing = cellRing;
  O.TorusCam = TorusCam;
  O.TorusFrame = Frame;
  O.TORUS_ASPECT = ASPECT;
})();
