// projection.js — map projections for the atlas, dependency-free.
//
// Spherical forms throughout: the ellipsoidal correction is far below a pixel
// at any display scale, and the difference between a good projection and a bad
// one on a national map is not the ellipsoid — it is whether the areas you are
// asking the reader to compare are actually comparable.
//
// THE ONE RULE: a CHOROPLETH MUST USE AN EQUAL-AREA PROJECTION. A choropleth
// asks the eye to add up coloured area, so a projection that inflates area with
// latitude (Mercator, and every default web map) makes northern counties shout
// and southern ones whisper — before the data says anything. Everything here is
// equal-area except `mercator`, which exists only for tile alignment and is
// documented as not for choropleths.
//
// API: a projection is a function (lon, lat) → [x, y] in screen pixels, with
//   .fit(bbox|width,height)   set scale/translate to frame a lon/lat box
//   .regionOf(id)             for composites, which sub-projection an id uses
//   .invert([x,y])            → [lon, lat] (used for the scale bar and probes)

/* global globalThis */
(function (root) {
  'use strict';

  const D = Math.PI / 180, EPS = 1e-6;

  // ------------------------------------------------------------ raw forms --

  /** Albers / Lambert conic equal-area, spherical. λ,φ in radians. */
  function conicEqualAreaRaw(phi0, phi1) {
    const sy0 = Math.sin(phi0);
    const n = (sy0 + Math.sin(phi1)) / 2;
    if (Math.abs(n) < EPS) {                       // degenerates to cylindrical
      const c = Math.cos(phi0);
      const raw = (x, y) => [x * c, Math.sin(y) / c];
      raw.invert = (x, y) => [x / c, Math.asin(Math.max(-1, Math.min(1, y * c)))];
      return raw;
    }
    const c = 1 + sy0 * (2 * n - sy0), r0 = Math.sqrt(c) / n;
    const raw = (x, y) => {
      const r = Math.sqrt(c - 2 * n * Math.sin(y)) / n;
      return [r * Math.sin(x * n), r0 - r * Math.cos(x * n)];
    };
    raw.invert = (x, y) => {
      const r0y = r0 - y;
      const r = Math.hypot(x, r0y);
      const l = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y);
      return [l / n, Math.asin(Math.max(-1, Math.min(1, (c - r * r * n * n) / (2 * n))))];
    };
    return raw;
  }

  /** Spherical Mercator. NOT equal-area — never use it for a choropleth. */
  function mercatorRaw(x, y) {
    return [x, Math.log(Math.tan(Math.PI / 4 + y / 2))];
  }
  mercatorRaw.invert = (x, y) => [x, 2 * Math.atan(Math.exp(y)) - Math.PI / 2];

  // ---------------------------------------------------------- the wrapper --

  /**
   * Wrap a raw projection with a rotation (longitude only — every projection
   * here is conic or cylindrical about the pole), a scale and a translate.
   */
  function make(raw, { rotate = 0, center = [0, 0], scale = 1000, translate = [0, 0] } = {}) {
    let k = scale, tx = translate[0], ty = translate[1], dl = rotate;
    let cx = 0, cy = 0;

    // `center` is given in ROTATED coordinates, as d3 does it: the rotation is
    // applied first, so a lower-48 projection rotated 96° west takes center
    // [-0.6, 38.7], i.e. 96.6°W. Adding the rotation again here was the bug
    // that threw Hawai'i a thousand pixels off the left edge — invisible on a
    // single projection, because `fit` absorbs a constant offset, and fatal on
    // a composite, where the parts must share one origin.
    const recenter = () => {
      const p = raw(center[0] * D, center[1] * D);
      cx = p[0]; cy = p[1];
    };
    recenter();

    const proj = (lon, lat) => {
      let l = (lon + dl) * D;
      if (l > Math.PI) l -= 2 * Math.PI; else if (l < -Math.PI) l += 2 * Math.PI;
      const p = raw(l, lat * D);
      return [tx + k * (p[0] - cx), ty - k * (p[1] - cy)];
    };

    proj.invert = (x, y) => {
      if (!raw.invert) return null;
      const p = raw.invert((x - tx) / k + cx, cy - (y - ty) / k);
      return [p[0] / D - dl, p[1] / D];
    };
    proj.scale = (v) => (v === undefined ? k : (k = v, proj));
    proj.translate = (v) => (v === undefined ? [tx, ty] : (tx = v[0], ty = v[1], proj));
    proj.center = (v) => (v === undefined ? center : (center = v, recenter(), proj));
    proj.rotate = (v) => (v === undefined ? dl : (dl = v, recenter(), proj));
    proj.raw = raw;

    /** Scale + translate so `bbox` [w,s,e,n] fills width×height with padding. */
    proj.fit = (bbox, width, height, pad = 8) => {
      k = 1; tx = 0; ty = 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const N = 24;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const p = proj(bbox[0] + (bbox[2] - bbox[0]) * i / N, bbox[1] + (bbox[3] - bbox[1]) * j / N);
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      }
      k = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
      tx = (width - k * (x0 + x1)) / 2;
      ty = (height - k * (y0 + y1)) / 2;
      return proj;
    };
    return proj;
  }

  // ------------------------------------------------------- the projections --

  /** Albers equal-area conic tuned for the contiguous United States. */
  const albersLower48 = () => make(conicEqualAreaRaw(29.5 * D, 45.5 * D), { rotate: 96, center: [-0.6, 38.7], scale: 1070 });

  /** Albers equal-area conic for the whole of North America. */
  const albersNorthAmerica = () => make(conicEqualAreaRaw(20 * D, 60 * D), { rotate: 100, center: [0, 45], scale: 700 });

  /** Lambert azimuthal-ish framing for the Caribbean basin (still conic, tight parallels). */
  const albersCaribbean = () => make(conicEqualAreaRaw(14 * D, 24 * D), { rotate: 73, center: [0, 19], scale: 2600 });

  /** Spherical Mercator. For tiles and for nothing else. */
  const mercator = () => make(mercatorRaw, { rotate: 0, center: [0, 0], scale: 160 });

  /**
   * The composite "Albers USA": the lower 48 at full size, with Alaska and
   * Hawaii moved into the empty sea off the southwest and scaled so their AREA
   * is comparable rather than their latitude. Puerto Rico and the U.S. Virgin
   * Islands get the same treatment off Florida, because a national county map
   * that silently drops 3.2 million people is a political statement, not a
   * cartographic one.
   *
   * Insets are honest only if they are labelled and the scale change is stated;
   * `.insets` exposes exactly that for the renderer to draw.
   */
  function albersUsa() {
    const lower = make(conicEqualAreaRaw(29.5 * D, 45.5 * D), { rotate: 96, center: [-0.6, 38.7] });
    const alaska = make(conicEqualAreaRaw(55 * D, 65 * D), { rotate: 154, center: [-2, 58.5] });
    const hawaii = make(conicEqualAreaRaw(8 * D, 18 * D), { rotate: 157, center: [-3, 19.9] });
    const rico   = make(conicEqualAreaRaw(17.5 * D, 19 * D), { rotate: 66, center: [-0.5, 18.2] });

    let k = 1070, tx = 480, ty = 250;

    // Alaska is drawn at 0.35x and Puerto Rico at 1x; those factors and the
    // offsets below place each block in sea, not on land.
    const parts = [
      { id: 'lower48', p: lower, k: 1,    dx:  0.000, dy:  0.000 },
      { id: 'alaska',  p: alaska, k: 0.35, dx: -0.307, dy:  0.201 },
      { id: 'hawaii',  p: hawaii, k: 1,    dx: -0.205, dy:  0.212 },
      { id: 'rico',    p: rico,   k: 1,    dx:  0.285, dy:  0.229 },
    ];
    const sync = () => {
      for (const s of parts) { s.p.scale(k * s.k); s.p.translate([tx + k * s.dx, ty + k * s.dy]); }
    };
    sync();

    /**
     * Route by IDENTITY, not by coordinate. A point-in-box test misfiles the
     * Aleutians (which cross the antimeridian) and any county whose centroid
     * sits near a seam; the atlas always knows which unit it is drawing.
     */
    const regionOf = (id) => {
      if (typeof id !== 'string') return 'lower48';
      if (id.startsWith('US:')) {
        const st = id.slice(3, 5);
        if (st === '02') return 'alaska';
        if (st === '15') return 'hawaii';
        if (st === '72' || st === '78') return 'rico';
        return 'lower48';
      }
      return 'lower48';
    };
    const byId = Object.fromEntries(parts.map((s) => [s.id, s]));

    const proj = (lon, lat, region) => byId[region || 'lower48'].p(lon, lat);
    proj.regionOf = regionOf;
    proj.composite = true;
    proj.parts = parts;
    proj.scale = (v) => (v === undefined ? k : (k = v, sync(), proj));
    proj.translate = (v) => (v === undefined ? [tx, ty] : (tx = v[0], ty = v[1], sync(), proj));
    proj.invert = (xy) => lower.invert(xy[0], xy[1]);
    proj.fit = (bbox, width, height, pad = 10) => {
      // Two passes. The first sizes k off the conterminous states; the second
      // measures where every part actually landed — insets included — and
      // shrinks and re-centres until the whole composite is inside the frame.
      // Sizing on the lower 48 alone is what puts Alaska in the sea instead of
      // half off the canvas at wide aspect ratios.
      const probe = (part, B) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
          const q = part.p(B[0] + (B[2] - B[0]) * i / 16, B[1] + (B[3] - B[1]) * j / 16);
          if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
          if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
        }
        return [x0, y0, x1, y1];
      };
      const BOXES = [
        [byId.lower48, [-124.8, 24.4, -66.9, 49.4]],
        [byId.alaska,  [-179.9, 51.0, -129.9, 71.5]],
        [byId.hawaii,  [-160.5, 18.7, -154.6, 22.3]],
        [byId.rico,    [-67.4, 17.6, -64.5, 18.6]],
      ];

      k = 1; tx = 0; ty = 0; sync();
      const l = probe(byId.lower48, BOXES[0][1]);
      k = Math.min((width - 2 * pad) / (l[2] - l[0]), (height - 2 * pad) / (l[3] - l[1]));

      for (let pass = 0; pass < 3; pass++) {
        tx = 0; ty = 0; sync();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [part, B] of BOXES) {
          const b = probe(part, B);
          if (b[0] < x0) x0 = b[0]; if (b[2] > x1) x1 = b[2];
          if (b[1] < y0) y0 = b[1]; if (b[3] > y1) y1 = b[3];
        }
        const fit = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
        if (fit >= 0.999) { tx = (width - (x0 + x1)) / 2; ty = (height - (y0 + y1)) / 2; sync(); break; }
        k *= fit;
        if (pass === 2) { tx = (width - (x0 + x1) * fit) / 2; ty = (height - (y0 + y1) * fit) / 2; sync(); }
      }
      return proj;
    };

    /** Label boxes for the inset frames, in screen pixels. */
    proj.insets = () => [
      { id: 'alaska', label: 'Alaska', note: '0.35×', bbox: [-179.9, 51, -129.9, 71.5] },
      { id: 'hawaii', label: 'Hawai‘i', note: '1×',   bbox: [-160.5, 18.7, -154.6, 22.3] },
      { id: 'rico',   label: 'Puerto Rico & U.S.V.I.', note: '1×', bbox: [-67.4, 17.6, -64.5, 18.6] },
    ].map((b) => {
      const s = byId[b.id];
      const c = [s.p(b.bbox[0], b.bbox[1]), s.p(b.bbox[2], b.bbox[3])];
      return { ...b, x0: Math.min(c[0][0], c[1][0]), y0: Math.min(c[0][1], c[1][1]),
                     x1: Math.max(c[0][0], c[1][0]), y1: Math.max(c[0][1], c[1][1]) };
    });
    return proj;
  }

  const PROJECTIONS = {
    albersUsa:          { label: 'Albers USA (composite)', equalArea: true,  make: albersUsa },
    albersLower48:      { label: 'Albers, lower 48',       equalArea: true,  make: albersLower48 },
    albersNorthAmerica: { label: 'Albers, North America',  equalArea: true,  make: albersNorthAmerica },
    albersCaribbean:    { label: 'Albers, Caribbean',      equalArea: true,  make: albersCaribbean },
    mercator:           { label: 'Mercator (not equal-area)', equalArea: false, make: mercator },
  };

  const API = { make, conicEqualAreaRaw, mercatorRaw, albersUsa, albersLower48, albersNorthAmerica, albersCaribbean, mercator, PROJECTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_PROJ = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
