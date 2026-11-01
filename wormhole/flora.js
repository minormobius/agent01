// wormhole — FLORA, the marginalia engine.
//
// Grows a watercolour garden in the margins of a page. One seed → one margin,
// for ever: the same paper always wears the same flowers. Inspired by the
// tikz-flora idea (flora grown in the margins of LaTeX documents), written
// from scratch as a procedural engine so the space of margins can be explored.
//
// It is a small GRAMMAR of a margin, in three layers:
//
//   1. GENOME   — genome(seed) draws the margin's traits: an ink palette, a
//                 growth HABIT (climbing, meander, twining, frame, scatter),
//                 symmetry, the species that bloom (rosettes, cosmos, bells,
//                 umbels, forget-me-nots, globes, berries, ferns, buds), the
//                 leaf forms, the fauna (birds, butterflies, moths) and the
//                 ornaments (gilt sparkles, dotted guide rules, star plates).
//                 Pass a second "biome" seed and the palette + species are
//                 drawn from it, so papers in one field share a flora while
//                 each paper is its own specimen.
//   2. LAYOUT   — grow(genome, page) lays main stems down the margins, walks
//                 them by arc length emitting leaves, side branches and
//                 blossoms, then fills the free margin with sprigs, fauna and
//                 ornaments. Every placed thing is checked against the TEXT
//                 BOX and kept out of it: the garden never touches the prose.
//   3. PAINT    — everything is drawn as SVG with the watercolour baked into
//                 the geometry (wobbled outlines, gradient washes, darkened
//                 edges, translucent inner streaks), so it is cheap to render,
//                 prints as vectors, and is a pure string — node can test it.
//
// Pure, deterministic, self-contained (no imports, no DOM). Attaches to
// globalThis.WORMHOLE_FLORA like the other wormhole modules.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var F = NS.WORMHOLE_FLORA = NS.WORMHOLE_FLORA || {};

  // ---------- seeded PRNG (same lineage as engine.js) ----------
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function Rand(seed) {
    var next = mulberry32(xmur3(String(seed))());
    var r = {
      f: next,
      range: function (a, b) { return a + (b - a) * next(); },
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      sign: function () { return next() < 0.5 ? -1 : 1; },
      pickw: function (pairs) { // [[value, weight], ...]
        var t = 0, i; for (i = 0; i < pairs.length; i++) t += pairs[i][1];
        var x = next() * t;
        for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
        return pairs[pairs.length - 1][0];
      },
      sample: function (arr, n) {
        var a = arr.slice(), out = [];
        while (out.length < n && a.length) out.push(a.splice(Math.floor(next() * a.length), 1)[0]);
        return out;
      },
    };
    return r;
  }

  // ---------- the inks ----------
  // Each ink is [deep, mid, light]. bloom inks paint flowers/fauna, leaf inks
  // paint foliage; small is the forget-me-not/umbel colour, accent the gilt.
  var PALETTES = [
    { id: "florilegium", name: "Florilegium", genus: "Violacea",
      bloom: [["#4b1d78", "#8a4fd0", "#dccaf6"], ["#7a1650", "#c2408a", "#f4c8de"], ["#0f4f63", "#2a8aa6", "#c2e7f1"]],
      leaf: [["#1e5e3a", "#3f9a5e", "#d2ebcd"], ["#4a5418", "#8a9a30", "#e6edbd"], ["#1d3f8a", "#4a78d0", "#d2def7"]],
      stem: "#6b7468", small: "#3550b8", accent: "#c9a24a" },
    { id: "indigo", name: "Indigo nocturne", genus: "Indigofera",
      bloom: [["#16246e", "#3552c8", "#cbd6f8"], ["#1b3a8a", "#5b82e0", "#e0e9fb"], ["#2a2a7a", "#6e6ed8", "#e2e2fa"]],
      leaf: [["#1b2f6b", "#4565c0", "#cdd8f4"], ["#2b4a8a", "#6a8ccc", "#dde6f5"]],
      stem: "#59616e", small: "#2a44b0", accent: "#c4a050" },
    { id: "autumn", name: "Autumn herbal", genus: "Ferruginea",
      bloom: [["#7a2412", "#c8512a", "#f6d0b8"], ["#7a4a08", "#d89a2a", "#f8e4b4"], ["#4a1838", "#8e3a6a", "#eecbdd"]],
      leaf: [["#4a5214", "#8c9632", "#e8edc2"], ["#6a3a14", "#b0703a", "#f2dbc0"]],
      stem: "#6e5f4a", small: "#a8451f", accent: "#b88a2e" },
    { id: "verdigris", name: "Verdigris", genus: "Aeruginosa",
      bloom: [["#0e4a48", "#2a9a8e", "#c8eee6"], ["#7a3a1a", "#c8743a", "#f5d7be"], ["#7a6420", "#cfae4a", "#f7eec8"]],
      leaf: [["#164a3a", "#3a8c6a", "#d0e9dc"], ["#2a5a5a", "#5a9a96", "#d9edeb"]],
      stem: "#5e6a62", small: "#1e7a72", accent: "#b8963a" },
    { id: "madder", name: "Rose madder", genus: "Rubiacea",
      bloom: [["#7a1030", "#d0406a", "#fbd4df"], ["#8a2a48", "#e07a96", "#fce3ea"], ["#5a1a40", "#a64a80", "#f2d4e6"]],
      leaf: [["#3a5a3e", "#7a9a7a", "#e0eadd"], ["#4a6a2a", "#8aaa4a", "#e6f0cf"]],
      stem: "#6e6a62", small: "#c03a6a", accent: "#c49a52" },
    { id: "sepia", name: "Sepia herbarium", genus: "Sepiacea",
      bloom: [["#3a2414", "#7a5434", "#eadbc8"], ["#4a2e1a", "#96704a", "#f0e4d3"]],
      leaf: [["#3a2c1a", "#7a6444", "#e8dfcc"], ["#2e2a1e", "#66604a", "#e4e0d0"]],
      stem: "#5a4a38", small: "#6a4a2a", accent: "#8a6a3a" },
    { id: "kingfisher", name: "Kingfisher", genus: "Alcedinia",
      bloom: [["#0a4a7a", "#1f8ad0", "#c8e8fb"], ["#8a3a08", "#e8741a", "#fcdfc0"], ["#141e5a", "#3a4aa8", "#d3d9f3"]],
      leaf: [["#1a5a5a", "#3a9a8a", "#d0efe7"], ["#24406a", "#4a78aa", "#d7e4f3"]],
      stem: "#5e6670", small: "#1f6ad0", accent: "#c8963a" },
    { id: "iris", name: "Iris & saffron", genus: "Iridacea",
      bloom: [["#3a1a78", "#6a3ad0", "#ded3fa"], ["#8a6008", "#e8b81a", "#fcf1bd"], ["#2a2a6a", "#5a5ab8", "#dcdcf5"]],
      leaf: [["#2a5a2a", "#5a9a3a", "#dbedc8"], ["#3a5a4a", "#6a9a7a", "#dbede2"]],
      stem: "#646a5e", small: "#5a3ad0", accent: "#c9a23a" },
  ];

  var HABITS = {
    climbing: { epithet: "scandens", label: "climbing" },
    meander:  { epithet: "serpens", label: "meandering" },
    twining:  { epithet: "volubilis", label: "twining" },
    frame:    { epithet: "circumcincta", label: "framing" },
    scatter:  { epithet: "dispersa", label: "scattered" },
  };
  var SPECIES = ["rosette", "cosmos", "bell", "umbel", "forgetmenot", "globe", "berries", "fern", "bud", "tendril"];
  var SPECIES_LABEL = {
    rosette: "rosettes", cosmos: "cosmos", bell: "bells", umbel: "umbels", forgetmenot: "forget-me-nots",
    globe: "globes", berries: "berries", fern: "ferns", bud: "buds", tendril: "tendrils",
  };
  var LEAVES = ["lanceolate", "ovate", "oak", "round", "willow", "serrate"];

  // ---------- 1. GENOME ----------
  // overrides (optional): { palette: <id>, habit: <name> } — the herbarium's
  // dials. Everything else still follows the seed.
  function genome(seed, biomeSeed, overrides) {
    seed = String(seed == null ? "1" : seed);
    var b = Rand("flora-biome:" + String(biomeSeed == null ? seed : biomeSeed));
    var r = Rand("flora-specimen:" + seed);
    var palette = b.pick(PALETTES);
    // the biome fixes the palette and the species pool; the specimen draws
    // from that pool, so one field's papers are cousins, not clones
    var pool = b.sample(SPECIES, b.int(5, 7));
    if (pool.indexOf("rosette") < 0 && pool.indexOf("cosmos") < 0) pool[0] = b.chance(0.6) ? "rosette" : "cosmos";
    var species = r.sample(pool, r.int(3, Math.min(5, pool.length)));
    // guarantee one showy bloom so every margin has a centre of gravity
    if (species.indexOf("rosette") < 0 && species.indexOf("cosmos") < 0) species.unshift(pool.indexOf("rosette") >= 0 ? "rosette" : "cosmos");
    var habit = r.pickw([["climbing", 34], ["meander", 20], ["twining", 16], ["frame", 16], ["scatter", 14]]);
    var leaves = b.sample(LEAVES, b.int(1, 3));
    var g = {
      seed: seed,
      biome: String(biomeSeed == null ? seed : biomeSeed),
      palette: palette,
      habit: habit,
      mirror: r.chance(0.35),
      species: species,
      leaves: leaves,
      density: r.range(0.75, 1.3),
      bloomScale: r.range(0.85, 1.2),
      wave: r.range(0.6, 1.4),
      fauna: {
        bird: r.chance(0.55),
        butterfly: r.chance(0.7),
        moth: r.chance(0.25),
      },
      ornaments: {
        sparkles: r.chance(0.75),
        guide: r.chance(0.5),
        plates: r.chance(0.3),
      },
    };
    if (overrides) {
      var op = overrides.palette && PALETTES.filter(function (p) { return p.id === overrides.palette; })[0];
      if (op) g.palette = palette = op;
      if (overrides.habit && HABITS[overrides.habit]) g.habit = habit = overrides.habit;
    }
    g.name = palette.genus + " " + HABITS[habit].epithet + (g.mirror ? " var. symmetrica" : "");
    return g;
  }

  function describe(g) {
    var fauna = [];
    if (g.fauna.bird) fauna.push("birds");
    if (g.fauna.butterfly) fauna.push("butterflies");
    if (g.fauna.moth) fauna.push("moths");
    return {
      name: g.name,
      palette: g.palette.name,
      habit: HABITS[g.habit].label + (g.mirror ? ", mirrored" : ""),
      species: g.species.map(function (s) { return SPECIES_LABEL[s]; }),
      leaves: g.leaves.slice(),
      fauna: fauna,
      line: g.palette.name + " · " + HABITS[g.habit].label + " habit · " +
        g.species.map(function (s) { return SPECIES_LABEL[s]; }).join(", ") +
        (fauna.length ? " · with " + fauna.join(" & ") : ""),
    };
  }

  // ---------- geometry ----------
  function n1(x) { return Math.round(x * 10) / 10; }
  function pt(p) { return n1(p[0]) + "," + n1(p[1]); }
  // Catmull-Rom → cubic Bézier, open or closed
  function smooth(pts, closed) {
    var n = pts.length;
    if (n < 2) return "";
    var d = "M" + pt(pts[0]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += "C" + pt(c1) + " " + pt(c2) + " " + pt(p2);
    }
    return d + (closed ? "Z" : "");
  }

  // closed organic outline: quadratic through edge midpoints — two numbers per
  // vertex fewer than Catmull-Rom, and a softer brush edge
  function blob(pts) {
    var n = pts.length;
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    var d = "M" + pt(mid(pts[n - 1], pts[0]));
    for (var i = 0; i < n; i++) d += "Q" + pt(pts[i]) + " " + pt(mid(pts[i], pts[(i + 1) % n]));
    return d + "Z";
  }

  // A blade outline in LOCAL coords: base at (0,0), tip at (L,0). profile(t)
  // gives the half-width fraction; the wobble is the watercolour's ragged edge.
  function blade(r, L, Wd, profile, wob, steps) {
    steps = steps || 9;
    var up = [], lo = [];
    for (var i = 1; i < steps; i++) {
      var t = i / steps, w = profile(t) * Wd / 2;
      up.push([t * L + r.range(-wob, wob), w * (1 + r.range(-0.09, 0.09))]);
      lo.push([t * L + r.range(-wob, wob), -w * (1 + r.range(-0.09, 0.09))]);
    }
    return [[0, 0]].concat(up, [[L, 0]], lo.reverse());
  }
  function scalePts(pts, sx, sy, dx) { return pts.map(function (p) { return [p[0] * sx + (dx || 0), p[1] * sy]; }); }

  var PROFILES = {
    lanceolate: function (t) { return Math.pow(Math.sin(Math.PI * t), 0.9) * (1 - 0.3 * t); },
    ovate: function (t) { return Math.sin(Math.PI * Math.pow(t, 0.72)); },
    round: function (t) { return Math.pow(Math.sin(Math.PI * t), 0.55); },
    willow: function (t) { return Math.pow(Math.sin(Math.PI * t), 1.2) * 0.62; },
    oak: function (t) { return Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.78 + 0.26 * Math.sin(t * Math.PI * 7)); },
    serrate: function (t) { return Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.9 + 0.12 * ((Math.floor(t * 16) % 2) ? 1 : -1)); },
    petalBroad: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.75); },
    petalThin: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.6); },
    bell: function (t) { return 0.35 + 0.65 * Math.pow(t, 0.8) * (t < 0.92 ? 1 : (1 - t) / 0.08 * 0.6 + 0.4); },
    wing: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.45)), 0.7); },
    hindwing: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.8); },
  };

  // sample a smooth path through control points every ~step px
  function resample(ctrl, step) {
    // densify via Catmull-Rom evaluation
    var out = [];
    for (var i = 0; i < ctrl.length - 1; i++) {
      var p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      var seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      var k = Math.max(2, Math.ceil(seg / step));
      for (var j = 0; j < k; j++) {
        var t = j / k, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(ctrl[ctrl.length - 1]);
    // attach arc length + tangent angle
    var s = 0;
    return out.map(function (p, i) {
      if (i > 0) s += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]);
      var a = out[Math.max(0, i - 1)], c = out[Math.min(out.length - 1, i + 1)];
      return { x: p[0], y: p[1], s: s, ang: Math.atan2(c[1] - a[1], c[0] - a[0]) };
    });
  }

  // a tapering filled ribbon along sampled points (w0 at start → w1 at end)
  function ribbon(samples, w0, w1) {
    var L = [], R = [], total = samples[samples.length - 1].s || 1;
    for (var i = 0; i < samples.length; i++) {
      var q = samples[i], w = (w0 + (w1 - w0) * (q.s / total)) / 2;
      var nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
      L.push([q.x + nx * w, q.y + ny * w]);
      R.push([q.x - nx * w, q.y - ny * w]);
    }
    return blob(L.concat(R.reverse()));
  }

  // ---------- 2. LAYOUT + 3. PAINT ----------
  function grow(g, page, opts) {
    if (typeof g !== "object") g = genome(g);
    opts = opts || {};
    var W = page.width, H = page.height;
    var box = page.box; // the text block: {x0, y0, x1, y1}
    var gap = page.gap == null ? 6 : page.gap;
    var pfx = (opts.idPrefix || "fl") + xmur3(g.seed + "|" + g.biome)().toString(36).slice(0, 5);
    var r = Rand("flora-layout:" + g.seed + ":" + Math.round(W) + "x" + Math.round(H));
    var P = g.palette;

    var mL = box.x0, mR = W - box.x1, mT = box.y0, mB = H - box.y1;
    var mSide = Math.min(mL, mR);
    // everything scales with how much margin there is to grow in
    var S = Math.max(0.32, Math.min(1.15, mSide / 96)) * g.bloomScale;
    var animated = opts.animate !== false;

    var items = [];        // placed circles {x,y,r,kind}
    var layers = { back: [], stems: [], leaves: [], blooms: [], fauna: [] };
    var counts = {};

    function inText(x, y, rad) {
      // circle vs the text rect grown by the gap
      var dx = Math.max(box.x0 - gap - x, 0, x - box.x1 - gap);
      var dy = Math.max(box.y0 - gap - y, 0, y - box.y1 - gap);
      return Math.hypot(dx, dy) < rad;
    }
    function offPage(x, y, rad) { return x - rad < 1 || y - rad < 1 || x + rad > W - 1 || y + rad > H - 1; }
    function fits(x, y, rad) { return !inText(x, y, rad) && !offPage(x, y, rad); }
    function crowded(x, y, rad, kinds, slack) {
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        if (kinds && kinds.indexOf(it.kind) < 0) continue;
        if (Math.hypot(it.x - x, it.y - y) < (it.r + rad) * (slack || 1)) return true;
      }
      return false;
    }
    function place(x, y, rad, kind) { items.push({ x: x, y: y, r: rad, kind: kind }); counts[kind] = (counts[kind] || 0) + 1; }
    function order(y) { return Math.max(0, Math.min(1, y / H)); }
    function wrap(layer, y, inner, cls) {
      layers[layer].push(animated
        ? '<g class="' + (cls || "fb") + '" style="--o:' + order(y).toFixed(3) + '">' + inner + "</g>"
        : "<g>" + inner + "</g>");
    }
    function tf(x, y, deg, s) {
      return 'transform="translate(' + n1(x) + " " + n1(y) + ")" + (deg ? " rotate(" + n1(deg) + ")" : "") + (s && s !== 1 ? " scale(" + (Math.round(s * 1000) / 1000) + ")" : "") + '"';
    }
    var DEG = 180 / Math.PI;

    // ---- gradient defs ----
    var defs = [];
    function lin(id, stops) {
      defs.push('<linearGradient id="' + pfx + id + '" x1="0" y1="0" x2="1" y2="0">' +
        stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : "") + "/>"; }).join("") +
        "</linearGradient>");
      return "url(#" + pfx + id + ")";
    }
    var gB = P.bloom.map(function (k, i) {
      return {
        ink: k,
        out: lin("b" + i, [[0, k[0]], [0.55, k[1]], [1, k[2]]]),       // deep base → pale tip
        inn: lin("bi" + i, [[0, k[2]], [0.5, k[1]], [1, k[0]]]),       // pale base → deep tip
        two: lin("bt" + i, [[0, k[0]], [0.5, k[1]], [1, P.bloom[(i + 1) % P.bloom.length][1]]]), // two-tone
      };
    });
    var gL = P.leaf.map(function (k, i) {
      return { ink: k, out: lin("l" + i, [[0, k[0]], [0.5, k[1]], [1, k[2]]]), inn: lin("li" + i, [[0, k[1]], [0.6, k[2]], [1, k[1]]]) };
    });

    // ---- the blade library: wobbled prototype outlines, instanced by <use> ----
    // Each (profile, variant) is drawn once at unit size 100×100 into <defs>;
    // a leaf or petal is then a <use> scaled to its length × width. Eight
    // wobbles per form plus rotation and scale keep the hand-made look while
    // cutting the markup by an order of magnitude.
    var pr = Rand("flora-protos:" + g.seed), protos = {}, VARIANTS = 8;
    function proto(form, steps, v) {
      var key = form + (steps || 9) + "_" + v;
      if (!protos[key]) {
        var id = pfx + "p" + Object.keys(protos).length;
        var pts = blade(pr, 100, 100, PROFILES[form], 2.2, steps || 9);
        defs.push('<path id="' + id + '" d="' + blob(pts) + '" vector-effect="non-scaling-stroke"/>');
        var inner = scalePts(pts, 0.62, 0.42, 18);
        defs.push('<path id="' + id + 'i" d="' + blob(inner) + '"/>');
        protos[key] = id;
      }
      return protos[key];
    }
    function sc(v) { return Math.round(v * 1000) / 1000; }
    // a watercolour blade by instance: wash + pooled edge, inner streak, vein
    function blade2(form, L, Wd, fill, ink, o) {
      o = o || {};
      var id = proto(form, o.steps, r.int(0, VARIANTS - 1));
      var t = 'transform="scale(' + sc(L / 100) + " " + sc(Wd / 100) + ')"';
      var s = '<use href="#' + id + '" ' + t + ' fill="' + fill + '" fill-opacity="' + (o.op || 0.86) + '"' +
        (o.edge === 0 ? "" : ' stroke="' + ink[0] + '" stroke-width="' + (o.edge || 0.55) + '" stroke-opacity="0.42"') + "/>";
      if (o.streak !== false && L > 7) s += '<use href="#' + id + 'i" ' + t + ' fill="' + ink[2] + '" fill-opacity="0.32"/>';
      if (o.vein) s += '<path d="M0,0Q' + n1(L * 0.5) + "," + n1(o.bend || 0) + " " + n1(L * 0.9) + ',0" fill="none" stroke="' + ink[2] + '" stroke-width="0.5" stroke-opacity="0.6"/>';
      return s;
    }

    // ---- painters (all return SVG strings in local coords) ----
    // a watercolour blade: wash + pooled edge + inner streak + optional vein
    function wash(pts, fill, ink, o) {
      o = o || {};
      // one element carries wash + pooled edge (fill and stroke together)
      var s = '<path d="' + blob(pts) + '" fill="' + fill + '" fill-opacity="' + (o.op || 0.86) + '" stroke="' + ink[0] + '" stroke-width="' + (o.edge || 0.55) + '" stroke-opacity="0.42"/>';
      if (o.streak !== false && (o.L || 10) > 7) {
        var inner = scalePts(pts, 0.62, 0.42, (o.L || 10) * 0.18);
        s += '<path d="' + blob(inner) + '" fill="' + ink[2] + '" fill-opacity="0.32"/>';
      }
      if (o.vein) s += '<path d="M0,0 Q' + n1(o.L * 0.5) + "," + n1(o.bend || 0) + " " + n1(o.L * 0.9) + ',0" fill="none" stroke="' + ink[2] + '" stroke-width="0.5" stroke-opacity="0.6"/>';
      return s;
    }

    function leaf(x, y, deg, L, form) {
      form = form || r.pick(g.leaves);
      var k = r.pick(gL);
      var Wd = L * (form === "willow" ? 0.34 : form === "round" ? 0.62 : form === "oak" ? 0.58 : 0.42);
      var fill = r.chance(0.75) ? k.out : k.inn;
      return "<g " + tf(x, y, deg) + ">" + blade2(form, L, Wd, fill, k.ink, { steps: form === "oak" || form === "serrate" ? 14 : 9, vein: true, bend: r.range(-1.5, 1.5) }) + "</g>";
    }

    function petalRing(n, L, Wd, profile, kset, mode, spin, wob) {
      var s = "";
      for (var i = 0; i < n; i++) {
        var a = spin + i * 360 / n + r.range(-6, 6);
        var Li = L * r.range(0.88, 1.08);
        var fill = mode === "two" ? kset.two : mode === "inn" ? kset.inn : kset.out;
        s += '<g transform="rotate(' + n1(a) + ')">' + blade2(profile, Li, Wd * r.range(0.9, 1.1), fill, kset.ink, { vein: Li > 9, bend: r.range(-1, 1), op: 0.8 }) + "</g>";
      }
      return s;
    }
    function stamens(rad, n, col, dot) {
      var s = "";
      for (var i = 0; i < n; i++) {
        var a = r.f() * Math.PI * 2, d = rad * Math.sqrt(r.f());
        s += '<circle cx="' + n1(Math.cos(a) * d) + '" cy="' + n1(Math.sin(a) * d) + '" r="' + n1(dot) + '" fill="' + col + '" fill-opacity="0.85"/>';
      }
      return s;
    }

    function rosette(x, y, size) {
      var k = r.pick(gB), n = r.pick([5, 5, 5, 6, 4]);
      var mode = r.pickw([["out", 3], ["two", 2], ["inn", 1]]);
      var s = petalRing(n, size, size * 0.95, "petalBroad", k, mode, r.range(0, 360));
      if (r.chance(0.5)) s += petalRing(n, size * 0.55, size * 0.5, "petalBroad", k, "out", r.range(0, 360));
      s += '<circle r="' + n1(size * 0.16) + '" fill="' + k.ink[2] + '" fill-opacity="0.9"/>';
      s += stamens(size * 0.2, 9, P.accent, Math.max(0.5, size * 0.03));
      s += '<circle r="' + n1(size * 0.06) + '" fill="' + k.ink[0] + '"/>';
      return "<g " + tf(x, y, 0) + ">" + s + "</g>";
    }
    function cosmos(x, y, size) {
      var k = r.pick(gB), n = r.int(8, 13);
      var s = petalRing(n, size, size * 0.38, "petalThin", k, r.chance(0.5) ? "out" : "inn", r.range(0, 360));
      s += '<circle r="' + n1(size * 0.2) + '" fill="' + P.accent + '" fill-opacity="0.8"/>';
      s += stamens(size * 0.18, 12, k.ink[0], Math.max(0.45, size * 0.035));
      return "<g " + tf(x, y, 0) + ">" + s + "</g>";
    }
    function bell(x, y, deg, size) {
      var k = r.pick(gB);
      var pts = blade(r, size, size * 0.9, PROFILES.bell, size * 0.02, 10);
      var s = wash(pts, k.inn, k.ink, { L: size, vein: true });
      // the bell mouth: three little scallops
      var m = size * 0.45;
      s += '<path d="M' + n1(size) + "," + n1(-m) + " q" + n1(size * 0.12) + "," + n1(m / 3) + " 0," + n1(m * 2 / 3) +
        " q" + n1(size * 0.12) + "," + n1(m / 3) + " 0," + n1(m * 2 / 3) + " q" + n1(size * 0.12) + "," + n1(m / 3) + " 0," + n1(m * 2 / 3) +
        '" fill="' + k.ink[1] + '" fill-opacity="0.55" stroke="' + k.ink[0] + '" stroke-width="0.5" stroke-opacity="0.4"/>';
      s += '<path d="M' + n1(-size * 0.15) + ",0 L0,0" + '" stroke="' + P.stem + '" stroke-width="1"/>';
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function bud(x, y, deg, size) {
      var k = r.pick(gB);
      var s = blade2("ovate", size, size * 0.55, k.out, k.ink, {});
      var lk = r.pick(gL);
      s += '<g transform="translate(0 ' + n1(size * 0.12) + ')">' + blade2("lanceolate", size * 0.45, size * 0.22, lk.out, lk.ink, { streak: false, steps: 6 }) + "</g>";
      s += '<g transform="translate(0 ' + n1(-size * 0.12) + ')">' + blade2("lanceolate", size * 0.45, size * 0.22, lk.out, lk.ink, { streak: false, steps: 6 }) + "</g>";
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    // the fan of spokes ending in dots — Queen-Anne's-lace seen side on
    function umbel(x, y, deg, size) {
      var n = r.int(7, 12), spread = r.range(70, 130), s = "";
      var col = r.chance(0.6) ? P.small : r.pick(gB).ink[1];
      for (var i = 0; i < n; i++) {
        var a = (-spread / 2 + spread * i / (n - 1) + r.range(-4, 4)) / DEG;
        var L = size * r.range(0.75, 1.05);
        var ex = Math.cos(a) * L, ey = Math.sin(a) * L;
        s += '<path d="M0,0 Q' + n1(ex * 0.5) + "," + n1(ey * 0.4) + " " + n1(ex) + "," + n1(ey) + '" fill="none" stroke="' + col + '" stroke-width="0.55" stroke-opacity="0.75"/>';
        s += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(Math.max(0.7, size * r.range(0.05, 0.09))) + '" fill="' + col + '" fill-opacity="0.85"/>';
      }
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function tinyFlower(x, y, rad, col, ctr) {
      var s = "";
      for (var i = 0; i < 5; i++) {
        var a = i * Math.PI * 2 / 5 + r.range(-0.2, 0.2);
        s += '<circle cx="' + n1(x + Math.cos(a) * rad) + '" cy="' + n1(y + Math.sin(a) * rad) + '" r="' + n1(rad * 0.85) + '" fill="' + col + '" fill-opacity="0.7"/>';
      }
      return s + '<circle cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + n1(rad * 0.5) + '" fill="' + ctr + '"/>';
    }
    // a curved stalk of forget-me-nots with dot-buds at the tip
    function forgetmenot(x, y, deg, size) {
      var s = "", bend = r.range(-0.5, 0.5) * size;
      var col = P.small, n = r.int(3, 6);
      s += '<path d="M0,0 Q' + n1(size * 0.5) + "," + n1(bend) + " " + n1(size) + "," + n1(bend * 0.6) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.6"/>';
      for (var i = 0; i < n; i++) {
        var t = 0.3 + 0.7 * i / n, px = size * t, py = bend * (2 * t * (1 - t)) + bend * 0.6 * t * t + r.range(-3, 3) * S;
        s += tinyFlower(px, py, Math.max(0.8, size * 0.07) * r.range(0.8, 1.2), col, P.accent);
      }
      for (var j = 0; j < 3; j++) s += '<circle cx="' + n1(size * (1.02 + j * 0.06)) + '" cy="' + n1(bend * 0.6 + r.range(-2, 2)) + '" r="' + n1(Math.max(0.6, size * 0.04)) + '" fill="' + col + '" fill-opacity="0.8"/>';
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function globe(x, y, size) {
      var k = r.pick(gB), s = '<circle r="' + n1(size) + '" fill="' + k.ink[2] + '" fill-opacity="0.45"/>';
      var n = Math.round(14 + size * 1.2);
      for (var i = 0; i < n; i++) {
        var a = r.f() * Math.PI * 2, d = size * Math.sqrt(r.f()) * 0.92;
        var c = d > size * 0.6 ? k.ink[1] : k.ink[0];
        s += '<circle cx="' + n1(Math.cos(a) * d) + '" cy="' + n1(Math.sin(a) * d) + '" r="' + n1(Math.max(0.6, size * r.range(0.1, 0.17))) + '" fill="' + c + '" fill-opacity="0.7"/>';
      }
      s += '<circle cx="' + n1(-size * 0.3) + '" cy="' + n1(-size * 0.35) + '" r="' + n1(size * 0.22) + '" fill="#fff" fill-opacity="0.45"/>';
      return "<g " + tf(x, y, 0) + ">" + s + "</g>";
    }
    function berries(x, y, deg, size) {
      var k = r.pick(gB), s = "", n = r.int(3, 7);
      for (var i = 0; i < n; i++) {
        var bx = size * r.range(0.3, 1), by = r.range(-0.45, 0.45) * size, br = Math.max(1, size * r.range(0.14, 0.22));
        s += '<path d="M0,0 Q' + n1(bx * 0.6) + "," + n1(by * 0.2) + " " + n1(bx) + "," + n1(by) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.5"/>';
        s += '<circle cx="' + n1(bx) + '" cy="' + n1(by) + '" r="' + n1(br) + '" fill="' + k.ink[1] + '" fill-opacity="0.85" stroke="' + k.ink[0] + '" stroke-width="0.4" stroke-opacity="0.5"/>';
        s += '<circle cx="' + n1(bx - br * 0.35) + '" cy="' + n1(by - br * 0.35) + '" r="' + n1(br * 0.3) + '" fill="#fff" fill-opacity="0.55"/>';
      }
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function fern(x, y, deg, size) {
      var k = r.pick(gL), s = "", n = r.int(6, 9), bend = r.range(-0.25, 0.25) * size;
      s += '<path d="M0,0 Q' + n1(size * 0.5) + "," + n1(bend) + " " + n1(size) + "," + n1(bend * 0.3) + '" fill="none" stroke="' + k.ink[0] + '" stroke-width="0.7" stroke-opacity="0.8"/>';
      for (var i = 1; i <= n; i++) {
        var t = i / (n + 1), px = size * t, py = bend * 2 * t * (1 - t) + bend * 0.3 * t * t;
        var L = size * 0.32 * (1 - t * 0.75);
        [1, -1].forEach(function (side) {
          s += '<g transform="translate(' + n1(px) + " " + n1(py) + ") rotate(" + n1(side * r.range(45, 62)) + ')">' + blade2("lanceolate", L, L * 0.38, k.out, k.ink, { steps: 5, streak: false, edge: 0 }) + "</g>";
        });
      }
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function tendril(x, y, deg, size) {
      var pts = [], turns = r.range(1.4, 2.4), dir = r.sign();
      for (var i = 0; i <= 28; i++) {
        var t = i / 28, a = dir * t * turns * Math.PI * 2, rad = size * 0.35 * (1 - t * 0.8);
        pts.push([size * 0.6 * t + Math.sin(a) * rad * t, (1 - Math.cos(a)) * rad * t * dir]);
      }
      return "<g " + tf(x, y, deg) + '><path d="' + smooth(pts, false) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.6" stroke-opacity="0.85"/></g>';
    }

    // ---- fauna ----
    function bird(x, y, facing, size) {
      var k = r.pick(gB), k2 = r.pick(gB);
      var body = blade(r, size, size * 0.52, PROFILES.ovate, size * 0.01, 10).map(function (p) { return [p[0] - size * 0.5, p[1]]; });
      var s = '<g transform="scale(' + facing + ',1)">';
      // tail
      s += '<path d="M' + n1(-size * 0.42) + ",0 L" + n1(-size * 0.95) + "," + n1(-size * 0.12) + " L" + n1(-size * 0.9) + "," + n1(size * 0.08) + 'Z" fill="' + k2.ink[0] + '" fill-opacity="0.8"/>';
      s += '<g transform="scale(-1,1)">' + wash(body.map(function (p) { return [-p[0], p[1]]; }), k.inn, k.ink, { L: size }) + "</g>";
      s += '<circle cx="' + n1(size * 0.42) + '" cy="' + n1(-size * 0.2) + '" r="' + n1(size * 0.2) + '" fill="' + k.ink[1] + '" fill-opacity="0.9"/>';
      // breast blush
      s += '<ellipse cx="' + n1(size * 0.18) + '" cy="' + n1(size * 0.1) + '" rx="' + n1(size * 0.22) + '" ry="' + n1(size * 0.14) + '" fill="' + k.ink[2] + '" fill-opacity="0.7"/>';
      // wing
      var wing = blade(r, size * 0.62, size * 0.3, PROFILES.lanceolate, 0.2, 8);
      s += '<g transform="translate(' + n1(size * 0.22) + "," + n1(-size * 0.06) + ') rotate(186)">' + wash(wing, k2.out, k2.ink, { L: size * 0.62, vein: true }) + "</g>";
      s += '<path d="M' + n1(size * 0.6) + "," + n1(-size * 0.24) + " l" + n1(size * 0.16) + "," + n1(size * 0.05) + " l" + n1(-size * 0.15) + "," + n1(size * 0.05) + 'Z" fill="' + P.accent + '"/>';
      s += '<circle cx="' + n1(size * 0.48) + '" cy="' + n1(-size * 0.25) + '" r="' + n1(Math.max(0.6, size * 0.04)) + '" fill="#111"/>';
      // feet
      s += '<path d="M0,' + n1(size * 0.22) + " l" + n1(-size * 0.04) + "," + n1(size * 0.14) + " M" + n1(size * 0.1) + "," + n1(size * 0.22) + " l0," + n1(size * 0.14) + '" stroke="' + P.stem + '" stroke-width="0.6"/>';
      return "<g " + tf(x, y, 0) + ">" + s + "</g></g>";
    }
    function butterfly(x, y, deg, size, moth) {
      var k = r.pick(gB), k2 = r.pick(gB), s = "";
      var fore = blade(r, size, size * (moth ? 0.5 : 0.62), PROFILES.wing, size * 0.02, 10);
      var hind = blade(r, size * 0.72, size * 0.6, PROFILES.hindwing, size * 0.02, 10);
      var persp = r.range(0.55, 0.9); // a three-quarter view: the far wings foreshortened
      [[1, 1], [-1, persp]].forEach(function (side) {
        var sx = side[0], sc = side[1];
        s += '<g transform="scale(' + n1(sc) + ',1)">';
        s += '<g transform="rotate(' + (sx > 0 ? -38 : -142) + ')">' + wash(fore, moth ? k.inn : k.out, k.ink, { L: size, vein: true }) + "</g>";
        s += '<g transform="rotate(' + (sx > 0 ? 28 : 152) + ')">' + wash(hind, k2.out, k2.ink, { L: size * 0.72, vein: true }) + "</g>";
        s += '<circle cx="' + n1(sx * size * 0.45) + '" cy="' + n1(-size * 0.42) + '" r="' + n1(size * 0.07) + '" fill="' + (moth ? k.ink[0] : "#fff") + '" fill-opacity="0.7"/>';
        s += "</g>";
      });
      s += '<ellipse rx="' + n1(size * 0.06) + '" ry="' + n1(size * 0.42) + '" fill="#2a2430" fill-opacity="0.85"/>';
      s += '<path d="M0,' + n1(-size * 0.38) + " q" + n1(-size * 0.1) + "," + n1(-size * 0.3) + " " + n1(-size * 0.22) + "," + n1(-size * 0.4) +
        " M0," + n1(-size * 0.38) + " q" + n1(size * 0.1) + "," + n1(-size * 0.3) + " " + n1(size * 0.22) + "," + n1(-size * 0.4) + '" fill="none" stroke="#2a2430" stroke-width="0.5"/>';
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }

    // ---- ornaments ----
    function sparkle(x, y, size, col) {
      var q = size * 0.12;
      return '<path d="M' + n1(x) + "," + n1(y - size) + " Q" + n1(x + q) + "," + n1(y - q) + " " + n1(x + size) + "," + n1(y) +
        " Q" + n1(x + q) + "," + n1(y + q) + " " + n1(x) + "," + n1(y + size) + " Q" + n1(x - q) + "," + n1(y + q) + " " + n1(x - size) + "," + n1(y) +
        " Q" + n1(x - q) + "," + n1(y - q) + " " + n1(x) + "," + n1(y - size) + 'Z" fill="' + col + '" fill-opacity="0.85"/>';
    }
    function plate(x, y, w) {
      var h = w * 1.5, k = P.bloom[0];
      var id = "pl" + counts.plate;
      defs.push('<linearGradient id="' + pfx + id + '" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + k[0] + '"/><stop offset="1" stop-color="' + k[1] + '"/></linearGradient>');
      var s = '<rect x="' + n1(x - w / 2) + '" y="' + n1(y - h / 2) + '" width="' + n1(w) + '" height="' + n1(h) + '" rx="1.5" fill="url(#' + pfx + id + ')" stroke="' + P.accent + '" stroke-width="1"/>';
      s += '<rect x="' + n1(x - w / 2 + 2) + '" y="' + n1(y - h / 2 + 2) + '" width="' + n1(w - 4) + '" height="' + n1(h - 4) + '" rx="1" fill="none" stroke="' + P.accent + '" stroke-width="0.4" stroke-opacity="0.8"/>';
      s += sparkle(x, y, w * 0.32, "#fff");
      for (var i = 0; i < 5; i++) s += '<circle cx="' + n1(x + r.range(-w / 2 + 3, w / 2 - 3)) + '" cy="' + n1(y + r.range(-h / 2 + 3, h / 2 - 3)) + '" r="0.5" fill="#fff" fill-opacity="0.8"/>';
      return s;
    }

    // ---- what grows at a branch tip ----
    function bloomAt(x, y, deg, size, sp) {
      switch (sp) {
        case "rosette": return { svg: rosette(x, y, size), r: size * 1.05, layer: "blooms" };
        case "cosmos": return { svg: cosmos(x, y, size * 0.95), r: size, layer: "blooms" };
        case "bell": return { svg: bell(x, y, deg, size * 0.85), r: size * 0.6, layer: "blooms", tip: true };
        case "bud": return { svg: bud(x, y, deg, size * 0.7), r: size * 0.45, layer: "blooms", tip: true };
        case "umbel": return { svg: umbel(x, y, deg, size * 0.9), r: size * 0.7, layer: "blooms", tip: true };
        case "forgetmenot": return { svg: forgetmenot(x, y, deg, size * 1.1), r: size * 0.7, layer: "blooms", tip: true };
        case "globe": return { svg: globe(x, y, size * 0.42), r: size * 0.45, layer: "blooms" };
        case "berries": return { svg: berries(x, y, deg, size * 0.7), r: size * 0.55, layer: "blooms", tip: true };
        case "fern": return { svg: fern(x, y, deg, size * 1.3), r: size * 0.8, layer: "leaves", tip: true };
        // a tendril on its own reads as a scribble: it curls beside a bud
        case "tendril": return { svg: tendril(x, y, deg + r.range(-50, 50), size * 1.1) + bud(x, y, deg, size * 0.6), r: size * 0.55, layer: "blooms", tip: true };
      }
      return null;
    }
    // the radius a tip-anchored thing reaches from its anchor
    function reach(b, x, y, deg, size) {
      if (!b.tip) return { x: x, y: y, r: b.r };
      var a = deg / DEG, d = b.r * 0.9;
      return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: b.r };
    }

    // ---- main stems by habit ----
    var stems = []; // arrays of samples
    var step = 10;
    function sideStem(side, phase, ampMul, x0frac) {
      var mW = side < 0 ? mL : mR;
      var cx = side < 0 ? mL * (x0frac || 0.5) : box.x1 + mR * (1 - (x0frac || 0.5));
      var amp = mW * 0.16 * g.wave * (ampMul || 1);
      var wl = r.range(180, 340) / g.wave;
      var top = r.range(mT * 0.25, mT * 0.8), bot = H - r.range(4, mB * 0.4);
      var ctrl = [], y;
      // base curl: start along the bottom margin, sweeping round into the side
      if (g.habit !== "frame" && r.chance(0.75) && mB > 20) {
        var inward = side < 0 ? 1 : -1;
        var reachX = (box.x1 - box.x0) * r.range(0.12, 0.35);
        var by = H - mB * r.range(0.35, 0.6);
        ctrl.push([cx + inward * (mW * 0.5 + reachX), by + r.range(-4, 4)]);
        ctrl.push([cx + inward * (mW * 0.5 + reachX * 0.45), by + r.range(-3, 3)]);
        ctrl.push([cx + inward * mW * 0.15, by - mB * 0.1]);
      } else {
        ctrl.push([cx, bot]);
      }
      for (y = ctrl[ctrl.length - 1][1] - wl / 4; y > top; y -= wl / 4) {
        var x = cx + Math.sin((y / wl) * Math.PI * 2 + phase) * amp + r.range(-amp, amp) * 0.25;
        ctrl.push([x, y]);
      }
      // the climbing tip nods over toward the text (but not into it)
      ctrl.push([cx + (side < 0 ? 1 : -1) * mW * 0.18, top - r.range(0, mT * 0.2)]);
      // clamp to the margin
      ctrl = ctrl.map(function (p) {
        var lo = 3, hi = W - 3;
        if (p[1] > box.y0 - gap && p[1] < box.y1 + gap) { if (side < 0) hi = box.x0 - gap - 3; else lo = box.x1 + gap + 3; }
        return [Math.max(lo, Math.min(hi, p[0])), p[1]];
      });
      // stems run bottom→top; reverse so samples go base → tip
      return resample(ctrl, step);
    }
    function frameStem() {
      var inset = Math.min(mL, mR, mT, mB) * 0.42, rad = Math.min(mL, mR) * 1.2;
      var x0 = mL * 0.42, x1 = W - mR * 0.42, y0 = mT * 0.45, y1 = H - mB * 0.45, ctrl = [];
      function jig(v) { return v + r.range(-inset, inset) * 0.25; }
      var i, n;
      // left side, bottom → top
      n = Math.max(3, Math.round((y1 - y0) / 180));
      for (i = 0; i <= n; i++) ctrl.push([jig(x0) + Math.sin(i * 1.7) * mL * 0.08 * g.wave, y1 - rad * 0.3 - (y1 - y0 - rad * 0.6) * i / n]);
      // top, left → right
      n = Math.max(3, Math.round((x1 - x0) / 160));
      for (i = 0; i <= n; i++) ctrl.push([x0 + rad * 0.3 + (x1 - x0 - rad * 0.6) * i / n, jig(y0)]);
      // right side, top → bottom
      n = Math.max(3, Math.round((y1 - y0) / 180));
      for (i = 0; i <= n; i++) ctrl.push([jig(x1) + Math.sin(i * 1.3) * mR * 0.08 * g.wave, y0 + rad * 0.3 + (y1 - y0 - rad * 0.6) * i / n]);
      // bottom, right → left
      n = Math.max(3, Math.round((x1 - x0) / 160));
      for (i = 0; i <= n; i++) ctrl.push([x1 - rad * 0.3 - (x1 - x0 - rad * 0.6) * i / n, jig(y1)]);
      ctrl.push(ctrl[0]);
      ctrl = ctrl.map(function (p) {
        var x = p[0], y = p[1];
        if (y > box.y0 - gap && y < box.y1 + gap) { if (x < W / 2) x = Math.min(x, box.x0 - gap - 3); else x = Math.max(x, box.x1 + gap + 3); }
        if (x > box.x0 - gap && x < box.x1 + gap) { if (y < H / 2) y = Math.min(y, box.y0 - gap - 3); else y = Math.max(y, box.y1 + gap + 3); }
        return [Math.max(3, Math.min(W - 3, x)), Math.max(3, Math.min(H - 3, y))];
      });
      return resample(ctrl, step);
    }

    var phase = r.range(0, Math.PI * 2);
    // a frame needs four margins; on a page with no head or foot (the print
    // frame) it climbs instead
    var habit = g.habit === "frame" && (mT < 24 || mB < 24) ? "climbing" : g.habit;
    if (habit === "climbing" || habit === "meander") {
      var amp = habit === "meander" ? 2 : 1;
      stems.push(sideStem(-1, phase, amp));
      stems.push(sideStem(1, g.mirror ? Math.PI - phase : r.range(0, 7), amp));
    } else if (habit === "twining") {
      stems.push(sideStem(-1, phase, 1.4, 0.5));
      stems.push(sideStem(-1, phase + Math.PI, 1.4, 0.5));
      stems.push(sideStem(1, g.mirror ? Math.PI - phase : phase + 1, 1.4, 0.5));
      stems.push(sideStem(1, g.mirror ? -phase : phase + 1 + Math.PI, 1.4, 0.5));
    } else if (habit === "frame") {
      stems.push(frameStem());
    }

    // paint stems + walk them
    var stemW = Math.max(1.1, 3.4 * S) * (g.habit === "twining" ? 0.6 : 1);
    stems.forEach(function (sm, si) {
      var fill = P.stem;
      var w1 = habit === "frame" ? stemW * 0.8 : stemW * 0.35;
      layers.stems.push('<path class="fs" d="' + ribbon(sm, stemW, w1) + '" fill="' + fill + '" fill-opacity="0.82"/>');
      // a pale highlight line down the stem: the wet-edge of the brush
      layers.stems.push('<path class="fs" d="' + smooth(sm.filter(function (_, i) { return i % 2 === 0; }).map(function (q) {
        return [q.x - Math.sin(q.ang) * stemW * 0.18, q.y + Math.cos(q.ang) * stemW * 0.18];
      }), false) + '" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="' + n1(Math.max(0.4, stemW * 0.22)) + '"/>');
      sm.forEach(function (q, i) { if (i % 3 === 0) place(q.x, q.y, stemW, "stem"); });
    });

    var spacing = 24 / g.density / Math.max(0.6, S);
    var showy = g.species.filter(function (s) { return s === "rosette" || s === "cosmos"; });
    var minor = g.species.filter(function (s) { return s !== "rosette" && s !== "cosmos"; });
    if (!minor.length) minor = ["bud"];
    function pickSpecies() { return r.chance(0.18) ? r.pick(showy.length ? showy : minor) : r.pick(minor); }

    stems.forEach(function (sm, si) {
      var total = sm[sm.length - 1].s;
      var sideFlip = r.sign();
      for (var s = r.range(4, spacing); s < total - 6; s += spacing * r.range(0.6, 1.4)) {
        var q = sm[0], k;
        for (k = 0; k < sm.length && sm[k].s < s; k++) q = sm[k];
        sideFlip = -sideFlip;
        var tdeg = q.ang * DEG; // stems run base → tip
        var act = r.pickw([["leaf", 4], ["pair", 2], ["branch", 3.2], ["direct", 0.8]]);
        if (act === "leaf" || act === "pair") {
          var L = r.range(11, 22) * S;
          var sides = act === "pair" ? [1, -1] : [sideFlip];
          sides.forEach(function (sd) {
            var a = tdeg + sd * r.range(35, 70);
            var ex = q.x + Math.cos(a / DEG) * L * 0.6, ey = q.y + Math.sin(a / DEG) * L * 0.6;
            if (!fits(ex, ey, L * 0.45)) { a = tdeg - sd * r.range(35, 70); ex = q.x + Math.cos(a / DEG) * L * 0.6; ey = q.y + Math.sin(a / DEG) * L * 0.6; }
            if (!fits(ex, ey, L * 0.45)) return;
            wrap("leaves", q.y, leaf(q.x, q.y, a, L));
            place(ex, ey, L * 0.4, "leaf");
          });
        } else {
          var sp = act === "direct" ? pickSpecies() : pickSpecies();
          var size = (sp === "rosette" || sp === "cosmos" ? r.range(10, 16) : r.range(9, 15)) * S;
          var blen = act === "direct" ? 0 : r.range(14, 40) * S;
          var tries = [sideFlip, -sideFlip], done = false;
          for (var ti = 0; ti < tries.length && !done; ti++) {
            var bdeg = tdeg + tries[ti] * r.range(30, 70);
            var bx = q.x + Math.cos(bdeg / DEG) * blen, by = q.y + Math.sin(bdeg / DEG) * blen;
            var probe = bloomAt(bx, by, bdeg, size, sp); // consumes rnd, but deterministic either way
            var rc = reach(probe, bx, by, bdeg, size);
            if (!fits(rc.x, rc.y, rc.r) || !fits(bx, by, 2) || crowded(rc.x, rc.y, rc.r, ["bloom", "hero", "fauna"], 0.8)) continue;
            if (blen > 0) {
              var mid = [q.x + Math.cos((bdeg - tries[ti] * 18) / DEG) * blen * 0.5, q.y + Math.sin((bdeg - tries[ti] * 18) / DEG) * blen * 0.5];
              var bs = resample([[q.x, q.y], mid, [bx, by]], 7);
              wrap("stems", q.y, '<path d="' + ribbon(bs, Math.max(0.6, stemW * 0.45), Math.max(0.4, stemW * 0.2)) + '" fill="' + P.stem + '" fill-opacity="0.8"/>');
              if (r.chance(0.55)) {
                var lm = bs[Math.floor(bs.length * 0.5)], la = lm.ang * DEG + r.sign() * r.range(40, 70), LL = r.range(8, 15) * S;
                if (fits(lm.x + Math.cos(la / DEG) * LL * 0.6, lm.y + Math.sin(la / DEG) * LL * 0.6, LL * 0.4)) wrap("leaves", lm.y, leaf(lm.x, lm.y, la, LL));
              }
            }
            wrap(probe.layer, by, probe.svg);
            place(rc.x, rc.y, rc.r, "bloom");
            done = true;
          }
        }
      }
    });

    // ---- heroes: the big showy blossoms, a few per tall margin ----
    function freeSpot(x0, x1, y0, y1, rad, tries, kinds, slack) {
      for (var t = 0; t < (tries || 30); t++) {
        var x = r.range(x0, x1), y = r.range(y0, y1);
        if (fits(x, y, rad) && !crowded(x, y, rad, kinds, slack)) return [x, y];
      }
      return null;
    }
    var heroSp = showy.length ? showy : ["rosette"];
    var heroSize = Math.max(7, Math.min(mSide * 0.4, 46 * S));
    [[0, mL], [box.x1, W]].forEach(function (span, side) {
      if (span[1] - span[0] < 18) return;
      var n = Math.max(1, Math.round(H / 1300 * g.density + r.range(-0.3, 0.6)));
      for (var i = 0; i < n; i++) {
        var band0 = H * i / n, band1 = H * (i + 1) / n;
        var sz = heroSize * r.range(0.82, 1.05), sp = r.pick(heroSp);
        var spot = freeSpot(span[0] + sz * 0.6, span[1] - sz * 0.6, band0 + sz, band1 - sz, sz * 1.02, 40, ["hero", "fauna"], 1.2);
        if (!spot) continue;
        wrap("blooms", spot[1], sp === "cosmos" ? cosmos(spot[0], spot[1], sz) : rosette(spot[0], spot[1], sz));
        place(spot[0], spot[1], sz, "hero");
        // a leaf or two tucked behind the hero
        for (var j = 0; j < 2; j++) {
          var a = r.range(0, 360), L = sz * r.range(0.8, 1.1);
          var lx = spot[0] + Math.cos(a / DEG) * L * 0.55, ly = spot[1] + Math.sin(a / DEG) * L * 0.55;
          if (fits(lx, ly, L * 0.35)) layers.leaves.push((animated ? '<g class="fb" style="--o:' + order(spot[1]).toFixed(3) + '">' : "<g>") + leaf(spot[0], spot[1], a, L) + "</g>");
        }
      }
    });

    // ---- sprigs: free-standing little plants (all of scatter; edges of the rest) ----
    var lush = g.habit === "scatter"; // with no main stem the sprigs carry the page
    function sprig(x, y, deg) {
      var len = r.range(18, 44) * S * (lush ? 1.25 : 1);
      var sp = lush && r.chance(0.3) && showy.length ? r.pick(showy) : pickSpecies();
      var size = r.range(8, 13) * S * (lush ? 1.25 : 1);
      var a = deg / DEG, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      var b = bloomAt(ex, ey, deg, size, sp), rc = reach(b, ex, ey, deg, size);
      if (!fits(x, y, 2) || !fits(ex, ey, 2) || !fits(rc.x, rc.y, rc.r) || crowded(rc.x, rc.y, rc.r, ["bloom", "hero", "fauna", "sprig"], 0.9)) return false;
      var mid = [x + Math.cos(a + r.range(-0.4, 0.4)) * len * 0.5, y + Math.sin(a + r.range(-0.4, 0.4)) * len * 0.5];
      var bs = resample([[x, y], mid, [ex, ey]], 7);
      var s = '<path d="' + ribbon(bs, Math.max(0.7, (lush ? 2.2 : 1.6) * S), 0.5) + '" fill="' + P.stem + '" fill-opacity="0.8"/>';
      var nl = lush ? r.int(1, 3) : 1;
      for (var li = 0; li < nl; li++) {
        var lm = bs[Math.floor(bs.length * (0.25 + 0.5 * li / nl))], la = lm.ang * DEG + (li % 2 ? -1 : 1) * r.range(35, 65), LL = r.range(8, 14) * S * (lush ? 1.2 : 1);
        if (fits(lm.x + Math.cos(la / DEG) * LL * 0.6, lm.y + Math.sin(la / DEG) * LL * 0.6, LL * 0.4)) s += leaf(lm.x, lm.y, la, LL);
      }
      wrap("leaves", y, s);
      wrap(b.layer, ey, b.svg);
      place(rc.x, rc.y, rc.r, "sprig");
      return true;
    }
    var regions = [
      { x0: 0, x1: mL, y0: 0, y1: H, dir: function () { return -90 + r.range(-40, 40); } },
      { x0: box.x1, x1: W, y0: 0, y1: H, dir: function () { return -90 + r.range(-40, 40); } },
      { x0: mL, x1: box.x1, y0: 0, y1: mT, dir: function () { return r.chance(0.5) ? r.range(-20, 20) : 180 + r.range(-20, 20); } },
      { x0: mL, x1: box.x1, y0: box.y1, y1: H, dir: function () { return -90 + r.range(-50, 50); } },
    ];
    regions.forEach(function (rg) {
      var area = Math.max(0, rg.x1 - rg.x0) * Math.max(0, rg.y1 - rg.y0);
      var want = g.habit === "scatter" ? area / (1500 / g.density) / Math.max(0.5, S * S) : area / 9000 * g.density;
      if (rg.y1 - rg.y0 < 14 || rg.x1 - rg.x0 < 14) return;
      for (var i = 0, got = 0; i < want * 3 && got < want; i++) {
        var x = r.range(rg.x0, rg.x1), y = r.range(rg.y0, rg.y1);
        if (sprig(x, y, rg.dir())) got++;
      }
    });

    // ---- forget-me-not dust + sparkles in the gaps ----
    var dust = Math.round((2 * H * Math.max(mL, 10) + 2 * W * Math.max(mT, 10)) / 2600 * g.density);
    for (var di = 0, dg = 0; di < dust * 3 && dg < dust; di++) {
      var spt = freeSpot(0, W, 0, H, 3 * S, 1, ["bloom", "hero", "fauna", "dust", "sprig"], 1);
      if (!spt) continue;
      var dot = Math.max(0.9, 2.1 * S);
      wrap("blooms", spt[1], tinyFlower(spt[0], spt[1], dot, P.small, P.accent));
      place(spt[0], spt[1], dot * 2, "dust"); dg++;
    }

    // ---- fauna ----
    function faunaCount(per) { return Math.max(1, Math.round(H / per)); }
    if (g.fauna.bird && mSide > 26) {
      var nb = faunaCount(1700), placedB = 0;
      for (var bi = 0; bi < 60 && placedB < nb; bi++) {
        var sm = stems.length ? r.pick(stems) : null, bx, by;
        if (sm) { var qq = sm[r.int(0, sm.length - 1)]; bx = qq.x; by = qq.y - 9 * S; }
        else { var fs = freeSpot(0, W, 0, H, 14 * S, 1); if (!fs) continue; bx = fs[0]; by = fs[1]; }
        var bsz = Math.min(26 * S, mSide * 0.42);
        if (!fits(bx, by, bsz * 0.7) || crowded(bx, by, bsz * 0.8, ["hero", "fauna"], 1)) continue;
        wrap("fauna", by, bird(bx, by, (bx < W / 2) ? 1 : -1, bsz));
        place(bx, by, bsz * 0.8, "fauna"); placedB++;
      }
    }
    [["butterfly", 1100, false], ["moth", 2200, true]].forEach(function (f) {
      if (!g.fauna[f[0]] || mSide < 22) return;
      var nf = faunaCount(f[1]), got = 0;
      for (var i = 0; i < 80 && got < nf; i++) {
        var fsz = Math.min(15 * S, mSide * 0.25) * r.range(0.8, 1.15);
        var sp2 = freeSpot(0, W, 0, H, fsz * 1.1, 1, ["hero", "fauna", "bloom"], 1);
        if (!sp2) continue;
        wrap("fauna", sp2[1], butterfly(sp2[0], sp2[1], r.range(-35, 35), fsz, f[2]));
        place(sp2[0], sp2[1], fsz * 1.1, "fauna"); got++;
      }
    });

    // ---- ornaments ----
    if (g.ornaments.guide && mSide > 30) {
      [3.5, W - 3.5].forEach(function (gx) {
        layers.back.push('<line x1="' + gx + '" y1="' + n1(mT * 0.6) + '" x2="' + gx + '" y2="' + n1(H - mB * 0.6) + '" stroke="' + P.accent + '" stroke-width="0.5" stroke-dasharray="1 3" stroke-opacity="0.8"/>');
        for (var y = mT + r.range(40, 140); y < H - mB; y += r.range(120, 260)) {
          layers.back.push(r.chance(0.5)
            ? '<path d="M' + gx + "," + n1(y - 5) + " L" + n1(gx + 2.6) + "," + n1(y) + " L" + gx + "," + n1(y + 5) + " L" + n1(gx - 2.6) + "," + n1(y) + 'Z" fill="none" stroke="' + P.accent + '" stroke-width="0.7"/>'
            : '<path d="M' + gx + "," + n1(y - 5) + " L" + gx + "," + n1(y + 5) + " M" + n1(gx - 2.5) + "," + n1(y - 1.5) + " L" + n1(gx + 2.5) + "," + n1(y - 1.5) + '" stroke="' + P.accent + '" stroke-width="0.6"/>');
        }
      });
    }
    if (g.ornaments.sparkles) {
      var ns = Math.round(H / 60 * g.density);
      for (var si2 = 0; si2 < ns * 2; si2++) {
        var ss = r.range(1.6, 4.2) * Math.max(0.6, S);
        var sp3 = freeSpot(0, W, 0, H, ss, 1, ["hero", "fauna", "bloom"], 1);
        if (!sp3) continue;
        layers.back.push(sparkle(sp3[0], sp3[1], ss, P.accent));
        if (si2 > ns) break;
      }
    }
    if (g.ornaments.plates && mSide > 34) {
      counts.plate = 0;
      var npl = Math.max(1, Math.round(H / 2600));
      for (var pi = 0; pi < 40 && counts.plate < npl * 2; pi++) {
        var pw = Math.min(22 * S, mSide * 0.3);
        var spp = freeSpot(0, W, 0, H, pw, 1, ["hero", "fauna", "bloom", "plate"], 1.2);
        if (!spp) continue;
        layers.fauna.push(plate(spp[0], spp[1], pw));
        place(spp[0], spp[1], pw, "plate");
      }
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="flora" viewBox="0 0 ' + n1(W) + " " + n1(H) + '" width="' + n1(W) + '" height="' + n1(H) + '" aria-hidden="true">' +
      "<defs>" + defs.join("") + "</defs>" +
      '<g class="f-back">' + layers.back.join("") + "</g>" +
      '<g class="f-stems">' + layers.stems.join("") + "</g>" +
      '<g class="f-leaves">' + layers.leaves.join("") + "</g>" +
      '<g class="f-blooms">' + layers.blooms.join("") + "</g>" +
      '<g class="f-fauna">' + layers.fauna.join("") + "</g>" +
      "</svg>";
    return { svg: svg, items: items, counts: counts, genome: g, scale: S };
  }

  F.PALETTES = PALETTES;
  F.HABITS = HABITS;
  F.SPECIES = SPECIES;
  F.genome = genome;
  F.describe = describe;
  F.grow = grow;
})();
