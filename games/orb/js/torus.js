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
  var TAU = 2 * Math.PI, ASPECT = 4 / Math.sqrt(3), KLEIN_ASPECT; // set below, from the bottle's own shape

  function wrap(x, L) { x %= L; return x < 0 ? x + L : x; }
  /* b − a, the short way round. On a Klein bottle (mesh.glide) going once
     round in u flips v: the images of b are (b.u + a·W, ±b.v + k·H), the
     sign flipping with every crossing. Points may be anywhere in the plane
     that covers the surface; the answer is the shortest step to any image. */
  function delta(mesh, ax, ay, bx, by) {
    var W = mesh.W, H = mesh.H, dx, dy;
    if (!mesh.glide) { dx = bx - ax; dy = by - ay; dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H); return [dx, dy]; }
    var a0 = Math.round((ax - bx) / W), best = null, bd = Infinity;
    for (var a = a0 - 1; a <= a0 + 1; a++) {
      dx = bx + a * W - ax; dy = ((a & 1) ? -by : by) - ay; dy -= H * Math.round(dy / H);
      var d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [dx, dy]; }
    }
    return best;
  }
  /* A point of the covering plane, brought into the fundamental rectangle. */
  function wrapPt(mesh, x, y) {
    var a = Math.floor(x / mesh.W); x -= a * mesh.W;
    if (mesh.glide && (a & 1)) y = -y;
    return [x, wrap(y, mesh.H)];
  }
  /* The image of flat point (u, v) nearest cover point (su, sv): [U, V, s],
     s = −1 when that image is a mirrored copy (Klein bottle, odd crossings). */
  function imageNear(mesh, u, v, su, sv) {
    var a = Math.round((su - u) / mesh.W), sg = mesh.glide && (a & 1) ? -1 : 1, V = sg * v;
    return [u + a * mesh.W, V + mesh.H * Math.round((sv - V) / mesh.H), sg];
  }
  function siteDelta(mesh, i, j) { var S = mesh.sites; return delta(mesh, S[2 * i], S[2 * i + 1], S[2 * j], S[2 * j + 1]); }

  /* Shared vertices: dedupe corners by canonical position (with a
     tolerance, checked against neighbouring hash bins). */
  function Verts(W, H, tol, glide) {
    this.W = W; this.H = H; this.tol = tol; this.xy = []; this.bins = new Map(); this.g = tol * 8; this.glide = !!glide;
  }
  Verts.prototype.id = function (x, y) {
    var c = wrapPt(this, x, y); x = c[0]; y = c[1];
    var g = this.g, bx = Math.floor(x / g), by = Math.floor(y / g), nbx = Math.ceil(this.W / g), nby = Math.ceil(this.H / g);
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      var list = this.bins.get(((bx + dx + nbx) % nbx) + "," + ((by + dy + nby) % nby));
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var v = list[k], dd = delta(this, x, y, this.xy[2 * v], this.xy[2 * v + 1]);
        if (Math.abs(dd[0]) < this.tol && Math.abs(dd[1]) < this.tol) return v;
      }
    }
    // a corner on the glide seam can canonicalise to either edge: look across it too
    if (this.glide && (x < this.g * 2 || x > this.W - this.g * 2)) {
      for (var q = 0; q < this.xy.length / 2; q++) {
        var e = delta(this, x, y, this.xy[2 * q], this.xy[2 * q + 1]);
        if (Math.abs(e[0]) < this.tol && Math.abs(e[1]) < this.tol) return q;
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
      if (c.j === i && c.self) continue;
      // keep points nearer site i than image (qx, qy): (x − mid)·(q − p) ≤ 0
      var qx = c.x, qy = c.y, nx = qx - px, ny = qy - py, mx = (px + qx) / 2, my = (py + qy) / 2;
      var out = [], L = poly.length;
      for (var k = 0; k < L; k++) {
        var A = poly[k], B = poly[(k + 1) % L];
        var da = (A[0] - mx) * nx + (A[1] - my) * ny, db = (B[0] - mx) * nx + (B[1] - my) * ny;
        if (da <= 0) out.push(A);
        if ((da <= 0) !== (db <= 0)) {
          var t = da / (da - db), X = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), -1, 0, 0];
          // the new corner starts the edge along the bisector when we're leaving the kept side (and remembers the image it faces)
          if (da <= 0) { X[2] = c.j; X[3] = qx; X[4] = qy; } else { X[2] = A[2]; X[3] = A[3]; X[4] = A[4]; }
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
  function ImageGrid(P, n, W, H, glide) {
    var g = Math.sqrt(W * H / n) * 1.5;
    this.g = g; this.b = new Map(); this.P = P;
    for (var j = 0; j < n; j++) for (var a = -1; a <= 1; a++) for (var b = -1; b <= 2; b++) {
      var flip = glide && (a & 1), x = P[2 * j] + a * W, y = (flip ? -P[2 * j + 1] : P[2 * j + 1]) + b * H, key = Math.floor(x / g) + "," + Math.floor(y / g);
      if (!this.b.has(key)) this.b.set(key, []);
      this.b.get(key).push({ j: j, self: a === 0 && b === 0, x: x, y: y });
    }
  }
  ImageGrid.prototype.near = function (px, py) {
    var g = this.g, bx = Math.floor(px / g), by = Math.floor(py / g), out = [];
    for (var a = -3; a <= 3; a++) for (var b = -3; b <= 3; b++) {
      var list = this.b.get((bx + a) + "," + (by + b)); if (!list) continue;
      for (var k = 0; k < list.length; k++) { var c = list[k]; out.push({ j: c.j, self: c.self, x: c.x, y: c.y, d2: (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py) }); }
    }
    return out.sort(function (u, v) { return u.d2 - v.d2; });
  };

  function voronoiTorus(P, n, W, H, glide) {
    var grid = new ImageGrid(P, n, W, H, glide), V = new Verts(W, H, 1e-7 * W, glide), polys = [], nbrs = [], cells = [];
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
  function buildTorus(seed, n, relax, klein, even) {
    if (relax == null) relax = 2;
    var W = klein ? KLEIN_ASPECT : ASPECT, H = 1, rng = O.rngFor(seed, klein ? "klein" : "torus", n), P = new Float64Array(2 * n), surf = { W: W, H: H, glide: !!klein };
    for (var i = 0; i < n; i++) { P[2 * i] = rng.next() * W; P[2 * i + 1] = rng.next() * H; }
    var vor = voronoiTorus(P, n, W, H, klein);
    for (var it = 0; it < relax; it++) {
      for (i = 0; i < n; i++) { // area-weighted centroid of the (unwrapped) cell
        var poly = vor.cells[i], A = 0, cx = 0, cy = 0;
        for (var k = 0; k < poly.length; k++) {
          var a = poly[k], b = poly[(k + 1) % poly.length], cr = a[0] * b[1] - b[0] * a[1];
          A += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr;
        }
        if (Math.abs(A) > 1e-15) { var w2 = wrapPt(surf, cx / (3 * A), cy / (3 * A)); P[2 * i] = w2[0]; P[2 * i + 1] = w2[1]; }
      }
      vor = voronoiTorus(P, n, W, H, klein);
    }
    var walls = even ? O.evenWalls(function () { // each cell's walls, in the covering plane round its own site
      return vor.cells.map(function (poly, i) {
        var out = [];
        for (var k = 0; k < poly.length; k++) {
          var A = poly[k], B = poly[(k + 1) % poly.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
          if (A[2] >= 0 && len > 1e-9 * W) out.push({ j: A[2], len: len, x: A[3] - P[2 * i], y: A[4] - P[2 * i + 1] });
        }
        return out;
      });
    }, function (mv) {
      for (var i = 0; i < n; i++) { var w3 = wrapPt(surf, P[2 * i] + mv[i][0], P[2 * i + 1] + mv[i][1]); P[2 * i] = w3[0]; P[2 * i + 1] = w3[1]; }
      vor = voronoiTorus(P, n, W, H, klein);
    }) : null;
    var mesh = { topology: "torus", surface: klein ? "klein" : "torus", glide: !!klein, kind: "voronoi", n: n, W: W, H: H, sites: P, verts: vor.verts, polys: vor.polys, nbrs: vor.nbrs, seed: seed, relax: relax, walls: walls };
    var vx = function (v) { return [mesh.verts[2 * v], mesh.verts[2 * v + 1]]; }, sx = function (v) { return [P[2 * v], P[2 * v + 1]]; };
    // symmetrise (a cell sees j iff j sees it) and put both rings in the same rotational order
    for (i = 0; i < n; i++) mesh.nbrs[i].forEach(function (j) { if (mesh.nbrs[j].indexOf(i) < 0) mesh.nbrs[j].push(i); });
    for (i = 0; i < n; i++) { mesh.polys[i] = orderRing(mesh, i, mesh.polys[i], vx); mesh.nbrs[i] = orderRing(mesh, i, mesh.nbrs[i], sx); }
    return mesh;
  }

  /* The Klein bottle: the same rectangle, but one pair of edges glued with a
     flip. Walk off the right edge and you come back on the left, upside
     down. A Voronoi diagram of it is built exactly like the torus's, the
     neighbouring images just include mirrored ones. */
  function buildKlein(seed, n, relax, even) { return buildTorus(seed, n, relax, true, even); }

  /* The cell at flat point (u, v) (anywhere in the covering plane): the
     nearest site, the short way round — exact for Voronoi, and for the
     honeycomb (the hex grid is its own sites' Voronoi diagram). */
  function torusCellAt(mesh, u, v) {
    var S = mesh.sites, best = Infinity, bi = -1;
    if (!mesh.glide) { u = wrap(u, mesh.W); v = wrap(v, mesh.H); }
    for (var i = 0; i < mesh.n; i++) {
      var d = delta(mesh, u, v, S[2 * i], S[2 * i + 1]), dd = d[0] * d[0] + d[1] * d[1];
      if (dd < best) { best = dd; bi = i; }
    }
    return bi;
  }
  /* A cell's corners unwrapped round its own site (flat coordinates). */
  function cellRing(mesh, i) {
    var S = mesh.sites, cx = S[2 * i], cy = S[2 * i + 1];
    return mesh.polys[i].map(function (v) { var d = delta(mesh, cx, cy, mesh.verts[2 * v], mesh.verts[2 * v + 1]); return [cx + d[0], cy + d[1]]; });
  }

  /* ------------------------------------------------------------ the views */

  /* Shared by both cameras: the flat map's orientation and scale. The
     surface is wide, so on a portrait screen the map is turned a quarter:
     the long way runs down the screen. Screen offset = k·M·(du, dv),
       landscape  u → right, v → up         M = [1, 0, 0, −1]
       portrait   u → up, v → left          M = [0, −1, −1, 0]
     Scale: the whole rectangle if that leaves cells big enough to tap
     (about 34 px), else bigger and panned, at most one screen of surface.
     The mini map is always landscape and always all of it. */
  function flatLayout(w, h, mini) {
    var m = this.mesh, portrait = !mini && h > w * 1.05;
    var Lw = portrait ? m.H : m.W, Lh = portrait ? m.W : m.H, fit = Math.min(w / Lw, h / Lh) * 0.98;
    var k = mini ? fit : Math.min(Math.max(fit, 34 / Math.sqrt(m.W * m.H / m.n)), Math.max(w / Lw, h / Lh)) * this.zoom;
    return { k: k, M: portrait ? [0, -1, -1, 0] : [1, 0, 0, -1], portrait: portrait };
  }
  function flatDrag(cam, dx, dy, w, h) { // the map follows the finger: returns the step of the cursor, (du, dv)
    var L = cam.flatLayout(w, h), M = L.M, det = M[0] * M[3] - M[1] * M[2], ex = dx / L.k, ey = dy / L.k;
    return [(M[3] * ex - M[1] * ey) / det, (-M[2] * ex + M[0] * ey) / det];
  }

  /* THE TORUS CAMERA. Fixed, looking down at `tilt` from the front:
     right = (1,0,0), up = (0, sin a, cos a), toward the viewer d = (0, −cos a, sin a).
     The skin's offset (ou, ov), in flat units, is what moves; both the donut
     and the flat map read it, so switching views keeps your place. The SWEET
     SPOT is the point of the donut that faces you squarely: θ = −90° (the
     front), φ = the tilt. It is the cursor: the reticle sits on it and the
     zoom grows round it. */
  function TorusCam(mesh) {
    this.mesh = mesh; this.ou = 0; this.ov = 0; this.tilt = 50 * Math.PI / 180; this.zoom = 1; this.kind = "torus";
    this.R = 1; this.r = mesh.H / mesh.W; // tube radius: cells true-shaped along the tube's top
  }
  TorusCam.prototype.flatLayout = flatLayout;
  TorusCam.prototype.sweetD = function () { // flat point under the cursor
    var m = this.mesh;
    return [wrap(m.W * -0.25 - this.ou, m.W), wrap(m.H * this.tilt / TAU - this.ov, m.H)];
  };
  /* Move the skin so flat point (u, v) heads for the cursor, by fraction t. */
  TorusCam.prototype.toward = function (u, v, t) {
    var m = this.mesh, s = this.sweet(), d = delta(m, s[0], s[1], u, v);
    this.ou -= d[0] * (t == null ? 1 : t); this.ov -= d[1] * (t == null ? 1 : t);
  };
  TorusCam.prototype.embedD = function (u, v) {
    var m = this.mesh, th = TAU * (u + this.ou) / m.W, ph = TAU * (v + this.ov) / m.H;
    var R = this.R, r = this.r, cp = Math.cos(ph), sp = Math.sin(ph), ct = Math.cos(th), st = Math.sin(th);
    var x = (R + r * cp) * ct, y = (R + r * cp) * st, z = r * sp, nx = cp * ct, ny = cp * st, nz = sp;
    var a = this.tilt, ca = Math.cos(a), sa = Math.sin(a);
    return { X: x, Y: y * sa + z * ca, D: -y * ca + z * sa, face: -ny * ca + nz * sa, n: [nx, ny, nz], p: [x, y, z] };
  };
  /* Is this point of the surface hidden by another part of it? March
     toward the viewer and see whether the ray enters the solid torus. */
  TorusCam.prototype.hiddenD = function (p) {
    var a = this.tilt, dx = 0, dy = -Math.cos(a), dz = Math.sin(a), R = this.R, r = this.r, r2 = r * r * 0.995;
    var step = r / 5, tmax = 2 * (R + r) + r;
    for (var t = step * 0.6; t < tmax; t += step) {
      var x = p[0] + dx * t, y = p[1] + dy * t, z = p[2] + dz * t, q = Math.hypot(x, y) - R;
      if (q * q + z * z < r2) return true;
    }
    return false;
  };
  TorusCam.prototype.scaleD = function (w, h) {
    var a = this.tilt, ext = (this.R + this.r) * Math.sin(a) + this.r * Math.cos(a);
    return Math.min(w / (2 * (this.R + this.r)), h / (2 * ext)) * 0.94 * this.zoom;
  };
  /* Where the donut's centre goes on screen, relative to the view's centre.
     At zoom 1 the donut is centred; zooming in grows it round the cursor
     and brings the cursor toward the middle of the screen. */
  TorusCam.prototype.originD = function (w, h) {
    var k = this.scale(w, h), k1 = k / this.zoom, s = this.sweet(), e = this.embed(s[0], s[1]);
    return [(k1 / this.zoom - k) * e.X, -(k1 / this.zoom - k) * e.Y];
  };
  TorusCam.prototype.cellRD = function (k) { var m = this.mesh; return k * Math.sqrt(m.W * m.H / m.n) * 0.55 * (this.r / m.H * TAU); };
  TorusCam.prototype.dragD = function (dx, dy, mode, w, h) {
    var m = this.mesh;
    if (mode === "flat") { var d = flatDrag(this, dx, dy, w, h); this.ou += d[0]; this.ov += d[1]; return; }
    var k = this.scale(w, h);
    this.ou += dx / (k * (this.R + this.r * Math.cos(this.tilt))) * m.W / TAU;
    this.ov -= dy / (k * this.r) * m.H / TAU * 0.6;
  };

  /* THE CLIFFORD TORUS: the flat torus as it really sits, in 4D.
     (a cos θ, a sin θ, b cos φ, b sin φ) with a : b = W : H lies on the unit
     3-sphere and is EXACTLY our flat rectangle, every cell the same size and
     shape. To see it, tilt it a little in 4D (a turn by β in the x–w plane),
     then project it into 3D stereographically from the pole w = 1, as a
     globe is projected onto a map from one pole. Stereographic projection
     keeps angles, so every cell stays round; only sizes change. Unlike the
     donut, sliding the skin here is a true rigid motion: the θ and φ slides
     are 4D rotations, and the surface turns through itself in 4D, its cells
     swelling as they come round the outside and shrinking through the hole.
     With the tilt the 3D shadow is a Dupin cyclide (a lopsided donut).
     Occlusion is exact: a 3D point lifts back to the 3-sphere, and the
     torus splits the 3-sphere into two solid tori; inside is the one the
     projection pole isn't in. */
  TorusCam.prototype.cliffordSetup = function () {
    var m = this.mesh, h = Math.hypot(m.W, m.H);
    this.ca4 = m.W / h; this.cb4 = m.H / h; this.beta = this.beta == null ? 0.3 : this.beta;
    var cb = Math.cos(this.beta), sb = Math.sin(this.beta), a = this.ca4;
    this.poleSide = (sb * sb - a * a) > 0 ? 1 : -1; // which solid torus the projection pole (0,0,0,1) lies in
    // the normal's sign: outward at the outermost point of the shadow
    this.nsign = 1;
    var best = -1, bu = 0, bv = 0;
    for (var i = 0; i < 24; i++) for (var j = 0; j < 24; j++) { var q = this.cliffP(m.W * i / 24, m.H * j / 24, 0, 0); var rr = q[0] * q[0] + q[1] * q[1]; if (rr > best) { best = rr; bu = m.W * i / 24; bv = m.H * j / 24; } }
    var e0 = this.cliffE(bu, bv, 0, 0); if (e0.n[0] * e0.p[0] + e0.n[1] * e0.p[1] < 0) this.nsign = -1;
    // the cursor's spot: the nearest point that faces the camera squarely
    var bd = -1e9; this.cuf = 0; this.cvf = 0;
    for (i = 0; i < 72; i++) for (j = 0; j < 48; j++) {
      var uu = m.W * i / 72, vv = m.H * j / 48, e = this.cliffE(uu, vv, 0, 0);
      if (e.face > 0.75 && e.D > bd && !this.hiddenC(e.p)) { bd = e.D; this.cuf = uu; this.cvf = vv; }
    }
    // framing: the shadow's extent on screen (unslid; sliding only moves cells round the same shape)
    var bb = [1e9, -1e9, 1e9, -1e9];
    for (i = 0; i < 64; i++) for (j = 0; j < 32; j++) { var f = this.cliffE(m.W * i / 64, m.H * j / 32, 0, 0); bb[0] = Math.min(bb[0], f.X); bb[1] = Math.max(bb[1], f.X); bb[2] = Math.min(bb[2], f.Y); bb[3] = Math.max(bb[3], f.Y); }
    this.cbb = bb; this.cliffKey = this.beta;
  };
  TorusCam.prototype.cliffP = function (u, v, ou, ov) {
    var m = this.mesh, th = TAU * (u + ou) / m.W, ph = TAU * (v + ov) / m.H, a = this.ca4, b = this.cb4;
    var x = a * Math.cos(th), y = a * Math.sin(th), z = b * Math.cos(ph), w = b * Math.sin(ph), cb = Math.cos(this.beta), sb = Math.sin(this.beta);
    var x2 = x * cb - w * sb, w2 = x * sb + w * cb, s = 1 / (1 - w2);
    return [x2 * s, y * s, z * s];
  };
  TorusCam.prototype.cliffE = function (u, v, ou, ov) {
    var m = this.mesh, e = 1e-4, p = this.cliffP(u, v, ou, ov), pu = this.cliffP(u + e * m.W, v, ou, ov), pv = this.cliffP(u, v + e * m.H, ou, ov);
    var A = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], B = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
    var n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]], l = (Math.hypot(n[0], n[1], n[2]) || 1) * (this.nsign || 1);
    n = [n[0] / l, n[1] / l, n[2] / l];
    var ta = this.tilt, ca = Math.cos(ta), sa = Math.sin(ta);
    return { X: p[0], Y: p[1] * sa + p[2] * ca, D: -p[1] * ca + p[2] * sa, face: -n[1] * ca + n[2] * sa, n: n, p: p };
  };
  TorusCam.prototype.hiddenC = function (p) {
    var ta = this.tilt, dy = -Math.cos(ta), dz = Math.sin(ta), a2 = this.ca4 * this.ca4, cb = Math.cos(this.beta), sb = Math.sin(this.beta);
    var reach = Math.max(4, Math.hypot(p[0], p[1], p[2]) * 2);
    for (var t = 0.02; t < reach; t += 0.035) {
      var X = p[0], Y = p[1] + dy * t, Z = p[2] + dz * t, r2 = X * X + Y * Y + Z * Z, d = 1 / (r2 + 1);
      var q0 = 2 * X * d, q1 = 2 * Y * d, q3 = (r2 - 1) * d, x = q0 * cb + q3 * sb; // back to the 3-sphere, un-tilted
      if (((x * x + q1 * q1 - a2) > 0 ? 1 : -1) !== this.poleSide) return true;
    }
    return false;
  };
  /* Position only (no normal): [X, Y, D]. For drawing cell edges as curves. */
  TorusCam.prototype.proj3 = function (u, v) {
    var m = this.mesh, ta = this.tilt, ca = Math.cos(ta), sa = Math.sin(ta), p;
    if (this.clifford) { this.cliffReady(); p = this.cliffP(u, v, this.ou, this.ov); }
    else {
      var th = TAU * (u + this.ou) / m.W, ph = TAU * (v + this.ov) / m.H, cp = Math.cos(ph);
      p = [(this.R + this.r * cp) * Math.cos(th), (this.R + this.r * cp) * Math.sin(th), this.r * Math.sin(ph)];
    }
    return [p[0], p[1] * sa + p[2] * ca, -p[1] * ca + p[2] * sa];
  };
  TorusCam.prototype.cliffReady = function () { if (this.beta == null) this.beta = 0.3; if (this.cliffKey !== this.beta) this.cliffordSetup(); };

  // dispatch: the donut, or the Clifford torus
  TorusCam.prototype.sweet = function () {
    if (!this.clifford) return this.sweetD();
    this.cliffReady(); var m = this.mesh;
    return [wrap(this.cuf - this.ou, m.W), wrap(this.cvf - this.ov, m.H)];
  };
  TorusCam.prototype.embed = function (u, v) { if (!this.clifford) return this.embedD(u, v); this.cliffReady(); return this.cliffE(u, v, this.ou, this.ov); };
  TorusCam.prototype.hidden = function (p) { if (!this.clifford) return this.hiddenD(p); return this.hiddenC(p); };
  TorusCam.prototype.scale = function (w, h) {
    if (!this.clifford) return this.scaleD(w, h);
    this.cliffReady(); var bb = this.cbb;
    return Math.min(w / ((bb[1] - bb[0]) * 1.08), h / ((bb[3] - bb[2]) * 1.08)) * this.zoom;
  };
  TorusCam.prototype.origin = function (w, h) { // centred at zoom 1, growing round the cursor
    if (!this.clifford) return this.originD(w, h);
    var k = this.scale(w, h), z = this.zoom, k1 = k / z, bb = this.cbb, e = this.cliffE(this.cuf, this.cvf, 0, 0);
    var cX = (bb[0] + bb[1]) / 2, cY = (bb[2] + bb[3]) / 2;
    return [k1 * (e.X - cX) / z - k * e.X, -(k1 * (e.Y - cY) / z - k * e.Y)];
  };
  TorusCam.prototype.cliffJ = function () { // screen per flat unit at the cursor (k = 1)
    var h = 1e-4, m = this.mesh, A = this.cliffE(this.cuf, this.cvf, 0, 0), Bu = this.cliffE(this.cuf + h, this.cvf, 0, 0), Bv = this.cliffE(this.cuf, this.cvf + h, 0, 0);
    return [(Bu.X - A.X) / h, (Bv.X - A.X) / h, -(Bu.Y - A.Y) / h, -(Bv.Y - A.Y) / h];
  };
  TorusCam.prototype.cellR = function (k) {
    if (!this.clifford) return this.cellRD(k);
    this.cliffReady(); var J = this.cliffJ(), m = this.mesh;
    return k * Math.sqrt(Math.abs(J[0] * J[3] - J[1] * J[2])) * Math.sqrt(m.W * m.H / m.n) * 0.55;
  };
  TorusCam.prototype.drag = function (dx, dy, mode, w, h) {
    if (!this.clifford || mode === "flat") return this.dragD(dx, dy, mode, w, h);
    // glued to the finger: the cursor moves through the inverse Jacobian at its spot
    this.cliffReady(); var J = this.cliffJ(), k = this.scale(w, h), det = (J[0] * J[3] - J[1] * J[2]) * k;
    this.ou += (J[3] * dx - J[1] * dy) / det; this.ov += (-J[2] * dx + J[0] * dy) / det;
  };
  Object.defineProperty(TorusCam.prototype, "occludes", { get: function () { return !!this.clifford; } });

  /* THE KLEIN BOTTLE CAMERA: the classic bottle, and a skin that slides.

     The bottle is the standard immersion (the body, a neck that bends over
     and passes back in through the wall, flaring into the base from
     inside), parameterised by U ∈ [0, π), V ∈ [0, 2π) with p(0, V) =
     p(π, π − V): exactly our flat gluing once V = 2πv/H + π/2.

     Three cheats keep the work front and centre and round:
     1. CELLS ROUND WHERE YOU WORK. Flat u runs along the bottle unevenly:
        dU/du ∝ C(U)^α / S(U), C the cross-section's girth, S the speed
        along it, scaled so cells are exactly round on the body. α = ½ is a
        compromise: α = 1 is round everywhere but makes the neck 12× smaller
        and the board 10× longer than it is round; α = 0 is even spacing
        with the neck's cells squashed thin. Here neck cells are about a
        third the size and three times as long, and nobody works there.
     2. THE CURSOR NEVER MOVES. It is parked on the fattest part of the body,
        facing the camera, and a drag slides the skin under it, as on the
        torus. Sliding along the bottle is free. Sliding round it is the
        catch: the gluing flips v, so turning the whole skin is only
        consistent by 0 or half a turn. So the turn is full at the cursor
        and fades to that allowed value half a lap away, (u, v) ↦
        (u + ou, v + k·H/2 + ε·cos π(u − su)/W): consistent with the flip,
        and its shear is zero at the cursor. The twist lives in the neck and
        round the back, where nobody is looking.
     3. TEXT FITS ITS CELL: numbers shrink with the cell they sit in (the
        view's job), so the neck's small cells stay legible enough.
     Two-sided (a Klein bottle has no outside); painter's order hides, and
     picking takes the front-most cell. On the flat map the cursor is the
     same covering-plane point, so both views agree on where you are. */
  function bottleP(U, V) {
    var cu = Math.cos(U), su = Math.sin(U), cv = Math.cos(V), sv = Math.sin(V), c2 = cu * cu, c4 = c2 * c2, c6 = c4 * c2;
    return [-2 / 15 * cu * (3 * cv - 30 * su + 90 * c4 * su - 60 * c6 * su + 5 * cu * cv * su),
      -1 / 15 * su * (3 * cv - 3 * c2 * cv - 48 * c4 * cv + 48 * c6 * cv - 60 * su + 5 * cu * cv * su - 5 * c2 * cu * cv * su - 80 * c4 * cu * cv * su + 80 * c6 * cu * cv * su),
      2 / 15 * (3 + 5 * cu * su) * sv];
  }
  var BOTTLE = (function () { // the warp table: flat u ↔ bottle U, and the domain's proportions (H = 1)
    var N = 400, M = 48, ALPHA = 0.5, S = [], Cg = [], dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    for (var i = 0; i <= N; i++) {
      var U = Math.PI * i / N, c = 0, sp = 0;
      for (var j = 0; j < M; j++) { var V = TAU * j / M; c += dist(bottleP(U, V), bottleP(U, V + TAU / M)); sp += dist(bottleP(U + 1e-4, V), bottleP(U, V)) / 1e-4; }
      S.push(sp / M); Cg.push(c);
    }
    var Cmax = Math.max.apply(null, Cg), body = Cg.indexOf(Cmax), u = [0];
    for (i = 0; i < N; i++) { var f = function (k) { return S[k] / (Math.pow(Cg[k], ALPHA) * Math.pow(Cmax, 1 - ALPHA)); }; u.push(u[i] + (f(i) + f(i + 1)) / 2 * Math.PI / N); }
    return { N: N, u: u, W: u[N], bodyU: Math.PI * body / N, bodyu: u[body] };
  })();
  KLEIN_ASPECT = BOTTLE.W;
  var KLEIN_VIEW = [1.2, -0.12, 0]; // the camera's turns (see KleinCam.place)
  function warpU(u0) { // flat u in [0, W] → bottle U
    var T = BOTTLE, lo = 0, hi = T.N;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (T.u[mid] <= u0) lo = mid; else hi = mid; }
    var f = (u0 - T.u[lo]) / ((T.u[hi] - T.u[lo]) || 1);
    return Math.PI * (lo + Math.max(0, Math.min(1, f))) / T.N;
  }
  function bottleAt(mesh, u, v) { // a point of the covering plane → the bottle
    var a = Math.floor(u / mesh.W), u0 = u - a * mesh.W, v0 = (a & 1) ? -v : v;
    return bottleP(warpU(u0), TAU * v0 / mesh.H + Math.PI / 2);
  }
  function KleinCam(mesh) {
    this.mesh = mesh; this.zoom = 1; this.kind = "klein"; this.occludes = true;
    this.place(KLEIN_VIEW[0], KLEIN_VIEW[1], KLEIN_VIEW[2]);
  }
  /* Set the camera (turns about the screen's vertical, horizontal and
     viewing axes) and everything that depends on it: the parking spot,
     the drag Jacobian, the framing. */
  KleinCam.prototype.place = function (ay, ax, az) {
    var mesh = this.mesh, cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az);
    this.Rc = mat(mat([cz, -sz, 0, sz, cz, 0, 0, 0, 1], [cy, 0, sy, 0, 1, 0, -sy, 0, cy]), [1, 0, 0, 0, cx, -sx, 0, sx, cx]);
    // the parking spot: the body's fattest ring, at the angle that faces the camera
    // (the NEAR side: two-sided, the inside of the far wall faces you too, behind the near one)
    var uf = BOTTLE.bodyu * mesh.W / BOTTLE.W, best = -1e9, vf = 0;
    for (var j = 0; j < 144; j++) { var vv = mesh.H * j / 144, e = this.raw(uf, vv); if (e.nz > 0.5 && e.D > best) { best = e.D; vf = vv; } }
    this.uf = uf; this.vf = vf; this.su = uf; this.sv = vf;
    // the screen Jacobian at the parking spot, per flat unit (k = 1), for dragging the skin under the finger
    var h = 1e-4, A = this.raw(uf, vf), Bu = this.raw(uf + h, vf), Bv = this.raw(uf, vf + h);
    this.J = [(Bu.X - A.X) / h, (Bv.X - A.X) / h, -(Bu.Y - A.Y) / h, -(Bv.Y - A.Y) / h];
    this.Lf = Math.sqrt(Math.abs(this.J[0] * this.J[3] - this.J[1] * this.J[2]));
    this.Xf = [A.X, A.Y];
    var bb = [1e9, -1e9, 1e9, -1e9];
    for (var i = 0; i <= 60; i++) for (j = 0; j < 24; j++) { var q = this.raw(mesh.W * i / 60, mesh.H * j / 24); bb[0] = Math.min(bb[0], q.X); bb[1] = Math.max(bb[1], q.X); bb[2] = Math.min(bb[2], q.Y); bb[3] = Math.max(bb[3], q.Y); }
    this.bb = bb;
  };
  /* The bottle as placed, before any sliding: view-space position and normal. */
  KleinCam.prototype.raw = function (u, v) {
    var m = this.mesh, h = 1e-4, p = bottleAt(m, u, v), pu = bottleAt(m, u + h * m.W, v), pv = bottleAt(m, u, v + h * m.H), R = this.Rc;
    var a = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], b = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
    var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    var nv = [(R[0] * n[0] + R[1] * n[1] + R[2] * n[2]) / l, (R[3] * n[0] + R[4] * n[1] + R[5] * n[2]) / l, (R[6] * n[0] + R[7] * n[1] + R[8] * n[2]) / l];
    if (nv[2] < 0) nv = [-nv[0], -nv[1], -nv[2]]; // two-sided: light the side you see
    return { X: R[0] * p[0] + R[1] * p[1] + R[2] * p[2], Y: R[3] * p[0] + R[4] * p[1] + R[5] * p[2], D: R[6] * p[0] + R[7] * p[1] + R[8] * p[2], nz: nv[2], nv: nv, p: p };
  };
  /* The skin's slide: cover point (u, v) → where it sits on the placed bottle. */
  KleinCam.prototype.slide = function (u, v) {
    var H = this.mesh.H, d = this.vf - this.sv, k = Math.round(d / (H / 2)), eps = d - k * H / 2;
    return [u + this.uf - this.su, v + k * H / 2 + eps * Math.cos(Math.PI * (u - this.su) / this.mesh.W)];
  };
  KleinCam.prototype.flatLayout = flatLayout;
  KleinCam.prototype.sweet = function () { return [this.su, this.sv]; };
  KleinCam.prototype.embed = function (u, v) {
    var q = this.slide(u, v), e = this.raw(q[0], q[1]), nv = e.nv;
    // lighting is in view space here; hand it back as if the camera were the torus's
    return { X: e.X, Y: e.Y, D: e.D, face: e.nz, n: [nv[0], -nv[2] * 0.64 + nv[1] * 0.77, nv[2] * 0.77 + nv[1] * 0.64], p: e.p };
  };
  KleinCam.prototype.hidden = function () { return false; };
  KleinCam.prototype.proj3 = function (u, v) {
    var q = this.slide(u, v), p = bottleAt(this.mesh, q[0], q[1]), R = this.Rc;
    return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
  };
  KleinCam.prototype.scale = function (w, h) { var bb = this.bb; return Math.min(w / ((bb[1] - bb[0]) * 1.06), h / ((bb[3] - bb[2]) * 1.06)) * this.zoom; };
  /* At zoom 1 the bottle is centred; zooming grows it round the cursor and
     brings the cursor toward the middle of the screen. */
  KleinCam.prototype.origin = function (w, h) {
    var k = this.scale(w, h), k1 = k / this.zoom, bb = this.bb, cX = (bb[0] + bb[1]) / 2, cY = (bb[2] + bb[3]) / 2, z = this.zoom;
    var tx = k1 * (this.Xf[0] - cX) / z, ty = k1 * (this.Xf[1] - cY) / z; // where the cursor goes (math coords, from the view's centre)
    return [tx - k * this.Xf[0], -(ty - k * this.Xf[1])];
  };
  KleinCam.prototype.cellR = function (k) { var m = this.mesh; return k * this.Lf * Math.sqrt(m.W * m.H / m.n) * 0.55; };
  KleinCam.prototype.drag = function (dx, dy, mode, w, h) {
    if (mode === "flat") { var d = flatDrag(this, dx, dy, w, h); this.su -= d[0]; this.sv -= d[1]; return; }
    // the point under the finger follows it: the cursor moves the other way, through the inverse Jacobian
    var k = this.scale(w, h), J = this.J, det = (J[0] * J[3] - J[1] * J[2]) * k;
    this.su -= (J[3] * dx - J[1] * dy) / det; this.sv -= (-J[2] * dx + J[0] * dy) / det;
  };
  KleinCam.prototype.toward = function (u, v, t) {
    t = t == null ? 1 : t;
    var d = delta(this.mesh, this.su, this.sv, u, v); this.su += d[0] * t; this.sv += d[1] * t;
  };
  function mat(R, M) { // M · R, re-orthonormalised
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[3 * i + j] = M[3 * i] * R[j] + M[3 * i + 1] * R[3 + j] + M[3 * i + 2] * R[6 + j];
    var a = [C[0], C[1], C[2]], l = Math.hypot(a[0], a[1], a[2]); a = [a[0] / l, a[1] / l, a[2] / l];
    var b = [C[3], C[4], C[5]], d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    b = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]; l = Math.hypot(b[0], b[1], b[2]); b = [b[0] / l, b[1] / l, b[2] / l];
    return [a[0], a[1], a[2], b[0], b[1], b[2], a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function rotAxis(u, t) {
    var c = Math.cos(t), s = Math.sin(t), C = 1 - c, x = u[0], y = u[1], z = u[2];
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  /* The right camera for a mesh. */
  function camFor(mesh) { return mesh.glide ? new KleinCam(mesh) : new TorusCam(mesh); }

  /* A projection of the whole mesh for one frame, in either view. Gives
     every consumer the same questions to ask:
       cell(i)    [x, y, depth, visible, facing] of the cell's centre
       ring(i)    the cell's corners on screen, or null if not drawn
       near(j, i) where j is drawn as seen from i (the same as cell(j) in 3D;
                  on the flat map, the image of j next to i)
       corner(v, i)  vertex v as seen from cell i
       order      cells to draw, back to front
       tiles      on the flat map, the affine maps [a, b, c, d, e, f] (for
                  ctx.transform) that repeat the drawing so the wrap fills
                  the screen: translations on a torus; on a Klein bottle
                  every other column is a mirror image
       ox, oy     where the surface's centre sits, relative to the view's
     and pick(x, y) → the cell under a screen point. */
  function Frame(cam, vp, mode, mesh) {
    this.cam = cam; this.vp = vp; this.mode = mode; var m = mesh || cam.mesh; this.mesh = m;
    var n = m.n, S = m.sites;
    if (mode === "donut") {
      var k = cam.scale(vp.w, vp.h), o = cam.origin(vp.w, vp.h), cx = vp.cx + o[0], cy = vp.cy + o[1];
      this.k = k; this.ox = o[0]; this.oy = o[1];
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
      this.cellR = cam.cellR(k);
      this.tiles = [[1, 0, 0, 1, 0, 0]];
      if (cam.rigid) this.ringsOwn = true; // a cell's ring is its own corners, moved with it (see ring)
    } else {
      // the flat map: the cursor at the centre of the view; every cell drawn at its image nearest the cursor
      var L = cam.flatLayout(vp.w, vp.h, vp.mini), sc = L.k, M = L.M, sw = cam.sweet();
      this.k = sc; this.M = M; this.cellR = sc * Math.sqrt(m.W * m.H / n) * 0.55; this.sw = sw; this.ox = 0; this.oy = 0;
      P = new Array(n); var par = new Int8Array(n);
      for (i = 0; i < n; i++) {
        var im = imageNear(m, S[2 * i], S[2 * i + 1], sw[0], sw[1]), du = im[0] - sw[0], dv = im[1] - sw[1];
        P[i] = [vp.cx + sc * (M[0] * du + M[1] * dv), vp.cy + sc * (M[2] * du + M[3] * dv), 0, true, 1]; par[i] = im[2];
      }
      this.P = P; this.par = par; this.order = []; for (i = 0; i < n; i++) this.order.push(i);
      // copies of the window: the image of the drawing under each gluing (a, b): d → (du + aW, s·dv + (s − 1)·sv + bH)
      var det = M[0] * M[3] - M[1] * M[2], Mi = [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det];
      var ext = Math.abs(sc * M[0] * m.W) + Math.abs(sc * M[1] * m.H), eyt = Math.abs(sc * M[2] * m.W) + Math.abs(sc * M[3] * m.H);
      this.tiles = [];
      for (var a = -3; a <= 3; a++) for (var b2 = -3; b2 <= 3; b2++) {
        var sg = m.glide && (a & 1) ? -1 : 1, e0 = a * m.W, e1 = (sg - 1) * sw[1] + b2 * m.H;
        var tx = sc * (M[0] * e0 + M[1] * e1), ty = sc * (M[2] * e0 + M[3] * e1);
        if (vp.mini) { if (a || b2) continue; }
        else if (vp.cx + tx + ext * 0.55 < 0 || vp.cx + tx - ext * 0.55 > vp.w || vp.cy + ty + eyt * 0.55 < 0 || vp.cy + ty - eyt * 0.55 > vp.h) continue;
        // A = M·S·M⁻¹ with S = diag(1, sg); screen' = A·(screen − C) + C + (tx, ty)
        var A0 = M[0] * Mi[0] + M[1] * sg * Mi[2], A1 = M[0] * Mi[1] + M[1] * sg * Mi[3], A2 = M[2] * Mi[0] + M[3] * sg * Mi[2], A3 = M[2] * Mi[1] + M[3] * sg * Mi[3];
        this.tiles.push([A0, A2, A1, A3, vp.cx + tx - A0 * vp.cx - A1 * vp.cy, vp.cy + ty - A2 * vp.cx - A3 * vp.cy]);
      }
      this.box = [vp.cx - ext / 2, vp.cy - eyt / 2, ext, eyt];
    }
  }
  Frame.prototype.cell = function (i) { return this.P[i]; };
  /* Flat displacement d, seen from cell i's image (mirrored on a flipped copy), to screen. */
  Frame.prototype.off = function (i, d) {
    var M = this.M, k = this.k, A = this.P[i], s = this.par[i], dv = s * d[1];
    return [A[0] + k * (M[0] * d[0] + M[1] * dv), A[1] + k * (M[2] * d[0] + M[3] * dv), 0, true, 1];
  };
  Frame.prototype.near = function (j, i) {
    if (this.mode === "donut") return this.P[j];
    return this.off(i, siteDelta(this.mesh, i, j));
  };
  Frame.prototype.corner = function (v, i) {
    if (this.mode === "donut") return this.Vp[v];
    var m = this.mesh;
    return this.off(i, delta(m, m.sites[2 * i], m.sites[2 * i + 1], m.verts[2 * v], m.verts[2 * v + 1]));
  };
  /* A cell's outline. In 3D its edges are sampled along the surface (the
     flat edge between two corners, embedded), not drawn as chords: on a
     coarse mesh the surface bulges past the chords at the silhouette, and a
     cell's own centre could otherwise fall outside its drawn shape. */
  var EDGE_STEPS = 4;
  Frame.prototype.ring = function (i) {
    var self = this;
    if (!this.mesh.polys[i]) return null; // a mesh of points (Strand's nanotorus atoms) has no cells to outline
    if (this.mode === "donut") {
      if (this.P[i][4] < -0.15) return null;
      if (!this.rings) this.rings = {};
      if (this.rings[i]) return this.rings[i];
      if (!this.cam.proj3) return this.mesh.polys[i].map(function (v) { return self.Vp[v]; });
      var C = cellRing(this.mesh, i), out = [], cam = this.cam, k = this.k, cx = this.vp.cx + this.ox, cy = this.vp.cy + this.oy;
      for (var q = 0; q < C.length; q++) {
        var A = C[q], B = C[(q + 1) % C.length];
        for (var t = 0; t < EDGE_STEPS; t++) {
          var f = t / EDGE_STEPS, p = cam.proj3(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f);
          out.push([cx + k * p[0], cy - k * p[1], p[2], 1]);
        }
      }
      this.rings[i] = out;
      return out;
    }
    return this.mesh.polys[i].map(function (v) { return self.corner(v, i); });
  };
  /* Cover point under a screen point (flat map). */
  Frame.prototype.flatAt = function (x, y) {
    var M = this.M, k = this.k, dx = (x - this.vp.cx) / k, dy = (y - this.vp.cy) / k, det = M[0] * M[3] - M[1] * M[2];
    return [this.sw[0] + (M[3] * dx - M[1] * dy) / det, this.sw[1] + (-M[2] * dx + M[0] * dy) / det];
  };
  /* The cell under a screen point (or -1). */
  Frame.prototype.pick = function (x, y) {
    var m = this.mesh;
    if (this.mode === "flat") { var f = this.flatAt(x, y); return torusCellAt(m, f[0], f[1]); }
    if (m.polys.length) for (var q = this.order.length - 1; q >= 0; q--) {
      var i = this.order[q], ring = this.ring(i);
      if (!ring || this.P[i][4] < 0.02) continue;
      if (inPoly(ring, x, y)) return i;
    }
    // points with no cells (Strand's nanotorus atoms), or a gap between drawn outlines (they bend at grazing
    // angles, so a cell's own centre can fall just outside): the nearest centre facing you, within reach
    var best = -1, bd = Math.pow(Math.max(8, this.cellR * (m.polys.length ? 0.8 : 1.1)), 2);
    for (var a = 0; a < m.n; a++) { var P = this.P[a]; if (!P[3] || P[4] < 0.05) continue; var d = (P[0] - x) * (P[0] - x) + (P[1] - y) * (P[1] - y); if (d < bd) { bd = d; best = a; } }
    return best;
  };
  /* Is cell i the front-most thing at its own centre? (3D: whether marks
     drawn after the cells would land on top of something nearer.) */
  Frame.prototype.onTop = function (i) {
    if (this.mode !== "donut") return true;
    var P = this.P[i]; return P[3] && this.pick(P[0], P[1]) === i;
  };
  function inPoly(ring, x, y) {
    var c = false;
    for (var a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      var A = ring[a], B = ring[b];
      if (((A[1] > y) !== (B[1] > y)) && x < (B[0] - A[0]) * (y - A[1]) / (B[1] - A[1]) + A[0]) c = !c;
    }
    return c;
  }

  O.buildTorus = buildTorus;
  O.buildHexTorus = buildHexTorus;
  O.torusCellAt = torusCellAt;
  O.torusDelta = siteDelta;
  O.torusRing = cellRing;
  O.TorusCam = TorusCam;
  O.KleinCam = KleinCam;
  O.surfaceCam = camFor;
  O.buildKlein = buildKlein;
  O.torusWrap = wrapPt;
  O.TorusFrame = Frame;
  O.TORUS_ASPECT = ASPECT;
})();
