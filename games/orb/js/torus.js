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
  var TAU = 2 * Math.PI, ASPECT = 4 / Math.sqrt(3), KLEIN_A = 2.2, KLEIN_ASPECT; // set below, from the figure-8's own lengths

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
  function buildTorus(seed, n, relax, klein) {
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
    var mesh = { topology: "torus", surface: klein ? "klein" : "torus", glide: !!klein, kind: "voronoi", n: n, W: W, H: H, sites: P, verts: vor.verts, polys: vor.polys, nbrs: vor.nbrs, seed: seed, relax: relax };
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
  function buildKlein(seed, n, relax) { return buildTorus(seed, n, relax, true); }

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
  TorusCam.prototype.sweet = function () { // flat point under the cursor
    var m = this.mesh;
    return [wrap(m.W * -0.25 - this.ou, m.W), wrap(m.H * this.tilt / TAU - this.ov, m.H)];
  };
  /* Move the skin so flat point (u, v) heads for the cursor, by fraction t. */
  TorusCam.prototype.toward = function (u, v, t) {
    var m = this.mesh, s = this.sweet(), d = delta(m, s[0], s[1], u, v);
    this.ou -= d[0] * (t == null ? 1 : t); this.ov -= d[1] * (t == null ? 1 : t);
  };
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
  TorusCam.prototype.scale = function (w, h) {
    var a = this.tilt, ext = (this.R + this.r) * Math.sin(a) + this.r * Math.cos(a);
    return Math.min(w / (2 * (this.R + this.r)), h / (2 * ext)) * 0.94 * this.zoom;
  };
  /* Where the donut's centre goes on screen, relative to the view's centre.
     At zoom 1 the donut is centred; zooming in grows it round the cursor
     and brings the cursor toward the middle of the screen. */
  TorusCam.prototype.origin = function (w, h) {
    var k = this.scale(w, h), k1 = k / this.zoom, s = this.sweet(), e = this.embed(s[0], s[1]);
    return [(k1 / this.zoom - k) * e.X, -(k1 / this.zoom - k) * e.Y];
  };
  TorusCam.prototype.cellR = function (k) { var m = this.mesh; return k * Math.sqrt(m.W * m.H / m.n) * 0.55 * (this.r / m.H * TAU); };
  TorusCam.prototype.drag = function (dx, dy, mode, w, h) {
    var m = this.mesh;
    if (mode === "flat") { var d = flatDrag(this, dx, dy, w, h); this.ou += d[0]; this.ov += d[1]; return; }
    var k = this.scale(w, h);
    this.ou += dx / (k * (this.R + this.r * Math.cos(this.tilt))) * m.W / TAU;
    this.ov -= dy / (k * this.r) * m.H / TAU * 0.6;
  };

  /* THE KLEIN BOTTLE CAMERA. A Klein bottle can't sit in space without
     passing through itself, so it is shown as the FIGURE-8 IMMERSION: a
     figure-eight cross-section swept round a circle with a half twist, so
     that going once round turns the eight over (exactly the glide: (u + W,
     v) ~ (u, −v)). It crosses itself along one circle. You turn it in your
     hand like the sphere (a rotation R), and the cursor is the middle of
     the screen. Surfaces are two-sided here (there is no outside), so a
     cell faces you whichever way round it is; painter's order does the
     hiding, and picking takes the front-most cell under the finger.
     On the flat map the cursor is a point (su, sv) of the covering plane,
     so panning across the flipped edge is continuous: what lies beyond it
     is drawn mirrored, because it is. */
  function KleinCam(mesh) {
    this.mesh = mesh; this.zoom = 1; this.kind = "klein"; this.rigid = true;
    this.R = [1, 0, 0, 0, 0.5, -0.866, 0, 0.866, 0.5]; // tipped toward you, so the twist shows
    this.su = mesh.W * 0.1; this.sv = mesh.H * 0.25;
    var A = 0, N = 64; // mean cell size, from the immersion's own area
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var u = (i + 0.5) / N * mesh.W, v = (j + 0.5) / N * mesh.H, du = mesh.W / N, dv = mesh.H / N;
      var p = fig8(mesh, u, v), pu = fig8(mesh, u + du, v), pv = fig8(mesh, u, v + dv);
      var a = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], b = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
      A += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    }
    this.area = A;
  }
  function fig8(mesh, u, v) {
    var th = TAU * u / mesh.W, ph = TAU * v / mesh.H, c = Math.cos(th / 2), s = Math.sin(th / 2);
    var rr = KLEIN_A + c * Math.sin(ph) - s * Math.sin(2 * ph);
    return [rr * Math.cos(th), rr * Math.sin(th), s * Math.sin(ph) + c * Math.sin(2 * ph)];
  }
  KleinCam.prototype.flatLayout = flatLayout;
  KleinCam.prototype.sweet = function () { return [this.su, this.sv]; };
  KleinCam.prototype.embed = function (u, v) {
    var m = this.mesh, e = 1e-4, p = fig8(m, u, v), pu = fig8(m, u + e * m.W, v), pv = fig8(m, u, v + e * m.H), R = this.R;
    var a = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], b = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
    var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    var X = R[0] * p[0] + R[1] * p[1] + R[2] * p[2], Y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2], Z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2];
    var nv = [R[0] * n[0] + R[1] * n[1] + R[2] * n[2], R[3] * n[0] + R[4] * n[1] + R[5] * n[2], R[6] * n[0] + R[7] * n[1] + R[8] * n[2]];
    if (nv[2] < 0) nv = [-nv[0], -nv[1], -nv[2]]; // two-sided: light the side you see
    // lighting is in view space here, so hand it back as if the camera were the torus's
    return { X: X, Y: Y, D: Z, face: nv[2], n: [nv[0], -nv[2] * 0.64 + nv[1] * 0.77, nv[2] * 0.77 + nv[1] * 0.64], p: p };
  };
  KleinCam.prototype.hidden = function () { return false; };
  KleinCam.prototype.scale = function (w, h) { return Math.min(w, h) / (2 * (KLEIN_A + 1.7)) * 0.98 * this.zoom; };
  KleinCam.prototype.origin = function () { return [0, 0]; };
  KleinCam.prototype.cellR = function (k) { return k * Math.sqrt(this.area / this.mesh.n) * 0.55; };
  KleinCam.prototype.drag = function (dx, dy, mode, w, h) {
    if (mode === "flat") { var d = flatDrag(this, dx, dy, w, h); this.su -= d[0]; this.sv -= d[1]; return; }
    var r = this.scale(w, h) * KLEIN_A, a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mat(this.R, [ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb]);
  };
  /* Bring flat point (u, v) toward the cursor, by fraction t: on the map,
     slide to its nearest image; in 3D, turn it to face you. */
  KleinCam.prototype.toward = function (u, v, t) {
    t = t == null ? 1 : t;
    var d = delta(this.mesh, this.su, this.sv, u, v); this.su += d[0] * t; this.sv += d[1] * t;
    var e = this.embed(u, v), X = e.X, Y = e.Y, Z = e.D, s = Math.hypot(X, Y);
    if (s < 1e-9) return;
    var ang = Math.atan2(s, Math.abs(Z) + 1) * t, ax = [Y / s, -X / s, 0];
    this.R = mat(this.R, rotAxis(ax, ang));
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
  Frame.prototype.ring = function (i) {
    var self = this;
    if (this.mode === "donut") { if (this.P[i][4] < -0.15) return null; return this.mesh.polys[i].map(function (v) { return self.Vp[v]; }); }
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
    for (var q = this.order.length - 1; q >= 0; q--) {
      var i = this.order[q], ring = this.ring(i);
      if (!ring || this.P[i][4] < 0.02) continue;
      if (inPoly(ring, x, y)) return i;
    }
    return -1;
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

  /* The flat domain's proportions for the Klein bottle: the length of a
     circle of u (at the twist's mean radius) over the length of the
     figure-eight cross-section, so cells come out roughly round. */
  (function () {
    var L = 0, N = 720;
    for (var i = 0; i < N; i++) { var p = (i + 0.5) / N * TAU; L += Math.hypot(Math.cos(p), 2 * Math.cos(2 * p)) * TAU / N; }
    KLEIN_ASPECT = TAU * KLEIN_A / L;
  })();

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
