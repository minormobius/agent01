// wormhole — SERPENT, the second marginalia engine.
//
// The margin as the Garden after the fall: a branch of the forbidden tree
// climbs the page, heavy with fruit, and serpents wind round it — in front of
// the bark, behind it, in front again — until each one leaves the branch and
// leans toward the text with its tongue out. The paper is the fruit.
//
// The emphasis is the SKIN. Scales are tiled on a diamond lattice in body
// coordinates (u along the spine, v across it), mapped onto the body with a
// round foreshortening (sin(v·π/2)), coloured by a PATTERN function of (u, v)
// — diamondback, tricolour bands, reticulated net, saddles, stripes, dorsal
// zigzag, eyespots, iridescence — and shaded per scale for a lit, glossy,
// round body; a specular streak rides the light side. Scales of one colour in
// one body chunk share a single <path>, so a long snake is a few hundred
// elements, not thousands.
//
// Same contract as flora.js: genome(seed, biome, overrides) → describe(g) →
// grow(g, {width, height, box}, opts) → { svg, tiles, items, counts, ... }.
// Nothing enters the text box. Pure, deterministic, DOM-free. Needs flora.js
// loaded first (it borrows flora's geometry core).

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.WORMHOLE_FLORA && NS.WORMHOLE_FLORA.core;
  if (!C) throw new Error("serpent.js needs flora.js loaded first");
  var Rand = C.Rand, xmur3 = C.xmur3, n1 = C.n1, pt = C.pt, smooth = C.smooth, blob = C.blob, blade = C.blade, PROFILES = C.PROFILES;
  var Z = NS.WORMHOLE_SERPENT = NS.WORMHOLE_SERPENT || {};
  var DEG = 180 / Math.PI;

  // ---------- colour ----------
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c) { return "#" + c.map(function (x) { var v = Math.max(0, Math.min(255, Math.round(x))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }

  // ---------- the skins ----------
  // c: [base, dark mark, light mark, accent]; gap: the skin between scales
  var SKINS = [
    { id: "emerald", name: "Emerald", genus: "Smaragdophis", c: ["#1f8a4c", "#0d4a2a", "#eaf6d2", "#8fd04a"], gap: "#082414", iris: "#f0c43a" },
    { id: "coral", name: "Coral", genus: "Corallophis", c: ["#c8281e", "#141012", "#f2c419", "#e8602a"], gap: "#2a0806", iris: "#f0d040" },
    { id: "obsidian", name: "Obsidian", genus: "Obsidianus", c: ["#1a1722", "#0a090e", "#7a5ae0", "#2ab8d0"], gap: "#040306", iris: "#e8b020", irid: true },
    { id: "gold", name: "Golden python", genus: "Chrysopython", c: ["#e6c472", "#5a3010", "#f7ecd0", "#b8822a"], gap: "#2e1c0a", iris: "#d89020" },
    { id: "sand", name: "Sand viper", genus: "Psammovipera", c: ["#caa878", "#5a3a22", "#efe0c4", "#8a5a34"], gap: "#33241a", iris: "#e8a030" },
    { id: "rose", name: "Rose", genus: "Rhodophis", c: ["#e0789a", "#1c0a14", "#fbd6e2", "#a8184e"], gap: "#36081a", iris: "#f2c848" },
    { id: "midnight", name: "Midnight", genus: "Nyctophis", c: ["#1c2656", "#080c22", "#c8d2e8", "#4a72e0"], gap: "#04060f", iris: "#e0c060", irid: true },
    { id: "jade", name: "Jade & gold", genus: "Jadeophis", c: ["#2a8a7a", "#0c3632", "#e2c048", "#8ad6c4"], gap: "#06201c", iris: "#f2c238" },
  ];
  var PATTERNS = {
    diamond: { epithet: "rhombifer", label: "diamondback" },
    bands: { epithet: "annulatus", label: "tricolour bands" },
    net: { epithet: "reticulatus", label: "reticulated net" },
    saddle: { epithet: "sellatus", label: "saddled" },
    stripe: { epithet: "lineatus", label: "striped" },
    zigzag: { epithet: "sinuatus", label: "dorsal zigzag" },
    ocelli: { epithet: "ocellatus", label: "eyespotted" },
    irid: { epithet: "fulgens", label: "iridescent" },
  };
  var FRUITS = {
    apple: { label: "apples", c: ["#7a0c14", "#c8202a", "#f26a5a"] },
    golden: { label: "golden apples", c: ["#8a5a08", "#e0a820", "#fbe48a"] },
    pomegranate: { label: "pomegranates", c: ["#5a0818", "#a8142e", "#e8606a"] },
    fig: { label: "figs", c: ["#2a1438", "#6a3a6a", "#b88aa8"] },
  };
  var HABITS = {
    entwined: { label: "entwined", epithet: "" },
    coiled: { label: "coiled", epithet: " var. spiralis" },
    slither: { label: "slithering", epithet: " var. errans" },
  };

  // ---------- 1. GENOME ----------
  function genome(seed, biomeSeed, overrides) {
    seed = String(seed == null ? "1" : seed);
    var biome = String(biomeSeed == null ? seed : biomeSeed);
    var b = Rand("serpent-biome:" + biome), r = Rand("serpent-specimen:" + seed);
    var skin = b.pick(SKINS);
    var pattern = r.pickw([["diamond", 16], ["bands", 12], ["net", 14], ["saddle", 12], ["stripe", 9], ["zigzag", 11], ["ocelli", 9], ["irid", skin.irid ? 22 : 7]]);
    var g = {
      kind: "serpent",
      seed: seed, biome: biome,
      skin: skin,
      pattern: pattern,
      rows: r.pick([7, 9, 9]),
      viper: r.chance(0.45),
      habit: r.pickw([["entwined", 62], ["coiled", 22], ["slither", 16]]),
      fruit: b.pick(Object.keys(FRUITS)),
      leaf: b.pick([["#1d4a24", "#3f7a34", "#cfe0a8"], ["#2a4018", "#6a8a2a", "#e0e8b0"], ["#173a32", "#3a7a5a", "#c8e4d0"], ["#3a3a14", "#7a7a28", "#e8e2b0"]]),
      bark: b.pick(["#4a3424", "#3a2e28", "#5a4030", "#2e2a26"]),
      sheen: r.range(0.75, 1.15),
      girth: r.range(0.85, 1.2),
      density: r.range(0.8, 1.2),
      blossom: r.chance(0.5),
    };
    if (overrides) {
      var os = overrides.skin && SKINS.filter(function (s) { return s.id === overrides.skin; })[0];
      if (os) g.skin = os;
      if (overrides.pattern && PATTERNS[overrides.pattern]) g.pattern = overrides.pattern;
      if (overrides.habit && HABITS[overrides.habit]) g.habit = overrides.habit;
    }
    g.name = g.skin.genus + " " + PATTERNS[g.pattern].epithet + HABITS[g.habit].epithet;
    return g;
  }
  function describe(g) {
    return {
      kind: "serpent",
      name: g.name,
      palette: g.skin.name,
      habit: HABITS[g.habit].label + " · " + (g.viper ? "viper-headed" : "slender-headed"),
      pattern: PATTERNS[g.pattern].label,
      species: [PATTERNS[g.pattern].label + " serpents", FRUITS[g.fruit].label].concat(g.blossom ? ["blossom"] : []),
      leaves: ["the tree's own"],
      fauna: ["serpents"],
      line: g.skin.name + " · " + PATTERNS[g.pattern].label + " · " + HABITS[g.habit].label + " on the tree, with " + FRUITS[g.fruit].label,
    };
  }

  // ---------- skin patterns: (u px along, v ∈ [-1,1] across) → [palette index, lightness] ----------
  function hash2(i, j, s) { var h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function frac(x) { return x - Math.floor(x); }
  function makePattern(g, P, salt) {
    var p = g.pattern;
    return function (u, v) {
      var f = frac(u / P), av = Math.abs(v);
      switch (p) {
        case "diamond": {
          var d = Math.abs(f * 2 - 1) + av * 0.95;
          if (d < 0.5) return [1, 0];
          if (d < 0.68) return [3, 0.1];
          if (av > 0.74 && frac(f + 0.5) < 0.22) return [1, -0.05];
          return [0, 0];
        }
        case "bands": {
          if (f < 0.44) return [0, hash2(Math.round(u), Math.round(v * 9), salt) < 0.15 ? -0.25 : 0];
          if (f < 0.54) return [1, 0];
          if (f < 0.66) return [2, 0];
          if (f < 0.76) return [1, 0];
          return [0, 0];
        }
        case "net": {
          var X = u / P * 1.7, Y = v * 1.3, gx = Math.floor(X), gy = Math.floor(Y), d1 = 9, d2 = 9;
          for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
            var cx = gx + i + hash2(gx + i, gy + j, salt), cy = gy + j + hash2(gy + j, gx + i, salt + 7);
            var d = Math.hypot(X - cx, Y - cy);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          if (d2 - d1 < 0.13) return [1, 0];
          if (d1 < 0.16) return [1, 0.15];
          if (d1 < 0.3) return [2, 0];
          return [0, d1 * 0.2];
        }
        case "saddle": {
          if (av < 0.66 && f < 0.36) return (av > 0.54 || f < 0.05 || f > 0.31) ? [3, 0] : [1, 0];
          if (av > 0.8 && frac(f + 0.5) < 0.18) return [1, 0];
          return [0, 0];
        }
        case "stripe": {
          if (av < 0.16 || (av > 0.48 && av < 0.62)) return [2, 0];
          if (av > 0.22 && av < 0.42 && frac(u / P * 2 + (v > 0 ? 0.5 : 0)) < 0.32) return [1, 0];
          return [0, 0];
        }
        case "zigzag": {
          var zz = 0.42 * (Math.abs(f * 2 - 1) * 2 - 1);
          var dz = Math.abs(v - zz);
          if (dz < 0.15) return [1, 0];
          if (dz < 0.25) return [2, 0];
          return [0, av > 0.8 ? -0.05 : 0];
        }
        case "ocelli": {
          var k = Math.floor(u / P), cv = (k % 2 ? 0.45 : -0.45), du = (f - 0.5) * 1.15, d3 = Math.hypot(du, (v - cv) * 0.8);
          if (d3 < 0.11) return [1, 0];
          if (d3 < 0.2) return [2, 0];
          if (d3 < 0.27) return [1, 0];
          return [0, 0];
        }
        case "irid": {
          var w = Math.sin(u / (P * 0.75) + v * 2.6 + Math.sin(u / (P * 2.3)) * 1.4);
          return [w > 0.35 ? 2 : w < -0.35 ? 3 : 0, (hash2(Math.round(u * 3), Math.round(v * 11), salt) - 0.5) * 0.25];
        }
      }
      return [0, 0];
    };
  }

  // ---------- 2–3. LAYOUT + PAINT ----------
  function grow(g, page, opts) {
    if (typeof g !== "object") g = genome(g);
    opts = opts || {};
    var W = page.width, H = page.height, box = page.box, gap = page.gap == null ? 6 : page.gap;
    var pfx = (opts.idPrefix || "sp") + xmur3("serpent|" + g.seed + "|" + g.biome)().toString(36).slice(0, 5);
    var r = Rand("serpent-layout:" + g.seed + ":" + Math.round(W) + "x" + Math.round(H));
    var K = g.skin;
    var mL = box.x0, mR = W - box.x1, mT = box.y0, mB = H - box.y1, mSide = Math.min(mL, mR);
    var S = Math.max(0.32, Math.min(1.15, mSide / 96));
    var animated = opts.animate !== false;
    var items = [], counts = {}, defs = [];

    function inText(x, y, rad) {
      var dx = Math.max(box.x0 - gap - x, 0, x - box.x1 - gap), dy = Math.max(box.y0 - gap - y, 0, y - box.y1 - gap);
      return Math.hypot(dx, dy) < rad;
    }
    function offPage(x, y, rad) { return x - rad < 1 || y - rad < 1 || x + rad > W - 1 || y + rad > H - 1; }
    function fits(x, y, rad) { return !inText(x, y, rad) && !offPage(x, y, rad); }
    function tf(x, y, deg, s) {
      return 'transform="translate(' + n1(x) + " " + n1(y) + ")" + (deg ? " rotate(" + n1(deg) + ")" : "") + (s && s !== 1 ? " scale(" + (Math.round(s * 1000) / 1000) + ")" : "") + '"';
    }

    // bands → layers → tiles (same scheme as flora)
    var BAND = 140, LAYERS = ["back", "snakeBack", "tree", "leaves", "fruit", "snake", "heads", "glint"];
    var bands = {}; LAYERS.forEach(function (l) { bands[l] = {}; });
    function add(layer, y, svg) { var b = Math.max(0, Math.floor(y / BAND)); (bands[layer][b] = bands[layer][b] || []).push(svg); }

    // coverage grid
    var CELL = 9, gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL), cov = new Uint8Array(gw * gh), marginCells = [];
    for (var cy = 0; cy < gh; cy++) for (var cx = 0; cx < gw; cx++) if (!inText((cx + 0.5) * CELL, (cy + 0.5) * CELL, CELL * 0.5)) marginCells.push(cy * gw + cx);
    function mark(x, y, rad) {
      var rr = rad * 0.72, x0 = Math.max(0, Math.floor((x - rr) / CELL)), x1 = Math.min(gw - 1, Math.floor((x + rr) / CELL));
      var y0 = Math.max(0, Math.floor((y - rr) / CELL)), y1 = Math.min(gh - 1, Math.floor((y + rr) / CELL));
      for (var j = y0; j <= y1; j++) for (var i = x0; i <= x1; i++) if (Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - y) <= rr + CELL * 0.5) cov[j * gw + i] = 1;
    }
    function coverage() { var c = 0; for (var i = 0; i < marginCells.length; i++) c += cov[marginCells[i]]; return marginCells.length ? c / marginCells.length : 1; }
    var byKind = {};
    function place(x, y, rad, kind, solid) {
      var it = { x: x, y: y, r: rad, kind: kind }; items.push(it); (byKind[kind] = byKind[kind] || []).push(it);
      counts[kind] = (counts[kind] || 0) + 1; mark(x, y, rad * (solid == null ? 1 : solid));
    }
    function crowdedK(x, y, rad, kinds, slack) {
      for (var k = 0; k < kinds.length; k++) { var L = byKind[kinds[k]] || []; for (var i = 0; i < L.length; i++) if (Math.hypot(L[i].x - x, L[i].y - y) < (L[i].r + rad) * (slack || 1)) return true; }
      return false;
    }

    // ---- prototypes (leaves, fruit, blossoms) instanced by <use> ----
    var LIB = {}, libR = Rand("serpent-lib:" + g.seed + ":" + g.biome), U = 20;
    function lib(kind, nVar, build) {
      var key = kind + "#" + r.int(0, nVar - 1);
      if (!LIB[key]) { var save = r; r = libR; var svg = build(); r = save; var id = pfx + "k" + Object.keys(LIB).length; defs.push('<g id="' + id + '">' + svg + "</g>"); LIB[key] = id; }
      return LIB[key];
    }
    function use(id, x, y, deg, s) { return '<use href="#' + id + '" ' + tf(x, y, deg, s) + "/>"; }
    function lin(id, a, b, c, vertical) {
      defs.push('<linearGradient id="' + pfx + id + '" x1="0" y1="0" x2="' + (vertical ? 0 : 1) + '" y2="' + (vertical ? 1 : 0) + '"><stop offset="0" stop-color="' + a + '"/><stop offset=".55" stop-color="' + b + '"/><stop offset="1" stop-color="' + c + '"/></linearGradient>');
      return "url(#" + pfx + id + ")";
    }
    function rad(id, a, b, c) {
      defs.push('<radialGradient id="' + pfx + id + '" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="' + c + '"/><stop offset=".45" stop-color="' + b + '"/><stop offset="1" stop-color="' + a + '"/></radialGradient>');
      return "url(#" + pfx + id + ")";
    }
    var LG = lin("lf", g.leaf[0], g.leaf[1], g.leaf[2]), FR = FRUITS[g.fruit].c, FG = rad("fr", FR[0], FR[1], FR[2]);
    var IRIS = rad("ir", mix(K.iris, "#000", 0.45), K.iris, mix(K.iris, "#fff", 0.5));

    function leafProto() {
      var L = U, Wd = U * r.range(0.36, 0.5), pts = blade(r, L, Wd, PROFILES[r.pick(["lanceolate", "ovate", "ovate"])], 0.4, 9);
      return '<path d="' + blob(pts) + '" fill="' + LG + '" fill-opacity=".93" stroke="' + g.leaf[0] + '" stroke-width=".5" stroke-opacity=".5"/>' +
        '<path d="' + blob(C.scalePts(pts, 0.62, 0.4, L * 0.18)) + '" fill="' + g.leaf[2] + '" fill-opacity=".28"/>' +
        '<path d="M0,0Q' + n1(L * 0.5) + "," + n1(r.range(-1, 1)) + " " + n1(L * 0.92) + ',0" fill="none" stroke="' + g.leaf[2] + '" stroke-width=".45" stroke-opacity=".6"/>';
    }
    function fruitProto() {
      var R = U * 0.5, s = "";
      // hangs from (0,0) downward-ish along +x: stem then fruit
      s += '<path d="M0,0Q' + n1(R * 0.5) + "," + n1(-R * 0.15) + " " + n1(R * 0.9) + ',0" fill="none" stroke="' + g.bark + '" stroke-width="1.1"/>';
      var cx = R * 0.9 + R, body;
      if (g.fruit === "fig") body = '<path d="' + blob(blade(r, R * 2.2, R * 1.7, PROFILES.ovate, 0.2, 10).map(function (q) { return [q[0] + R * 0.8, q[1]]; })) + '" fill="' + FG + '"/>';
      else {
        // apple-ish: a circle with a dimple at the stem
        var pts = [];
        for (var i = 0; i < 16; i++) { var a = i / 16 * Math.PI * 2, rr = R * (1 - 0.13 * Math.pow(Math.max(0, Math.cos(a + Math.PI)), 6)) * r.range(0.97, 1.03); pts.push([cx + Math.cos(a) * rr * 1.04, Math.sin(a) * rr]); }
        body = '<path d="' + blob(pts) + '" fill="' + FG + '"/>';
      }
      s += body;
      s += '<path d="' + blob(blade(r, R * 2.2, R * 1.6, PROFILES.ovate, 0, 8).map(function (q) { return [q[0] + R * 0.85, q[1]]; })) + '" fill="none" stroke="' + FR[0] + '" stroke-width=".6" stroke-opacity=".5"/>';
      if (g.fruit === "pomegranate") {
        for (var k = 0; k < 5; k++) { var aa = (k - 2) * 0.32; s += '<path d="M' + n1(cx + R * 0.95) + "," + n1(Math.sin(aa) * R * 0.25) + " l" + n1(R * 0.32) + "," + n1(Math.sin(aa) * R * 0.3 - 0.8) + " l0,1.6z" + '" fill="' + FR[0] + '"/>'; }
        if (r.chance(0.6)) { s += '<path d="M' + n1(cx - R * 0.1) + "," + n1(-R * 0.35) + " q" + n1(R * 0.5) + "," + n1(R * 0.35) + " 0," + n1(R * 0.75) + " q" + n1(-R * 0.25) + "," + n1(-R * 0.37) + " 0," + n1(-R * 0.75) + 'z" fill="#f4d8c8"/>'; for (var q = 0; q < 6; q++) s += '<circle cx="' + n1(cx + r.range(0, R * 0.25)) + '" cy="' + n1(r.range(-R * 0.28, R * 0.28)) + '" r="' + n1(R * 0.09) + '" fill="#c8102e"/>'; }
      }
      s += '<ellipse cx="' + n1(cx - R * 0.15) + '" cy="' + n1(-R * 0.4) + '" rx="' + n1(R * 0.28) + '" ry="' + n1(R * 0.14) + '" transform="rotate(-25 ' + n1(cx - R * 0.15) + " " + n1(-R * 0.4) + ')" fill="#fff" fill-opacity=".7"/>';
      // its leaf
      var lp = blade(r, R * 1.4, R * 0.6, PROFILES.ovate, 0.2, 7);
      s += '<path transform="translate(' + n1(R * 0.6) + ' 0) rotate(-60)" d="' + blob(lp) + '" fill="' + LG + '"/>';
      return s;
    }
    function blossomProto() {
      var s = "", n = 5, col = r.chance(0.6) ? "#fbeef0" : "#f6c8d4";
      for (var i = 0; i < n; i++) {
        var pts = blade(r, U * 0.5, U * 0.42, PROFILES.petalBroad, 0.3, 8);
        s += '<path transform="rotate(' + n1(i * 72 + r.range(-6, 6)) + ')" d="' + blob(pts) + '" fill="' + col + '" stroke="#d48aa0" stroke-width=".4" stroke-opacity=".7"/>';
      }
      for (var k = 0; k < 7; k++) { var a = r.f() * 6.28; s += '<circle cx="' + n1(Math.cos(a) * U * 0.1) + '" cy="' + n1(Math.sin(a) * U * 0.1) + '" r=".7" fill="#d8a020"/>'; }
      return s;
    }
    function sparkle(x, y, size, col) {
      var q = size * 0.12;
      return '<path d="M' + n1(x) + "," + n1(y - size) + "Q" + n1(x + q) + "," + n1(y - q) + " " + n1(x + size) + "," + n1(y) + "Q" + n1(x + q) + "," + n1(y + q) + " " + n1(x) + "," + n1(y + size) +
        "Q" + n1(x - q) + "," + n1(y + q) + " " + n1(x - size) + "," + n1(y) + "Q" + n1(x - q) + "," + n1(y - q) + " " + n1(x) + "," + n1(y - size) + 'Z" fill="' + col + '" fill-opacity=".85"/>';
    }
    var SOLID = { leaf: 0.6, fruit: 0.95, blossom: 0.8 };
    function put(kind, x, y, deg, size, layer, label) {
      var reachR = size * (kind === "fruit" ? 1.0 : kind === "blossom" ? 0.5 : 0.52), a = deg / DEG;
      var fx = kind === "blossom" ? x : x + Math.cos(a) * reachR * 0.95, fy = kind === "blossom" ? y : y + Math.sin(a) * reachR * 0.95;
      for (var k = 0; k < 3; k++) {
        if (fits(fx, fy, reachR) && !inText(x, y, 1)) {
          var id = lib(kind, kind === "leaf" ? 8 : 5, kind === "leaf" ? leafProto : kind === "fruit" ? fruitProto : blossomProto);
          add(layer || (kind === "leaf" ? "leaves" : "fruit"), y, use(id, x, y, deg, size / U));
          place(fx, fy, reachR, label || kind, SOLID[kind]);
          return true;
        }
        size *= 0.75; reachR *= 0.75;
        fx = kind === "blossom" ? x : x + Math.cos(a) * reachR * 0.95; fy = kind === "blossom" ? y : y + Math.sin(a) * reachR * 0.95;
      }
      return false;
    }

    // serpent sizing first: the trunks must leave room for a coil's swing
    var W0 = Math.max(3, 11 * S * g.girth);          // half-width of the body
    var LH = W0 * 2.7, TONGUE = W0 * 2;              // head length, tongue reach

    // ---- the tree: gnarled branches up the side margins ----
    function dense(pts, step) {
      // resample a polyline / control set into samples with s + ang
      var ctrl = C.resample(pts, step);
      return ctrl;
    }
    var trunks = [];
    var barkW = Math.max(2.2, W0 * 1.15); // a branch about as thick as the serpent: what a snake actually climbs
    function trunk(side) {
      var mW = side < 0 ? mL : mR, cx0 = side < 0 ? mL * r.range(0.4, 0.6) : box.x1 + mR * r.range(0.4, 0.6);
      var amp = mW * 0.18, wl = r.range(260, 420), ph = r.range(0, 6.28), ctrl = [];
      for (var y = H + 10; y > -10; y -= wl / 5) ctrl.push([cx0 + Math.sin(y / wl * 6.28 + ph) * amp + r.range(-amp, amp) * 0.3, y]);
      // keep a coil's swing + a body's width clear of the text and the page edge,
      // or the helix flattens into a seam against them
      var room = g.habit !== "slither" ? barkW * 0.5 + W0 * 2 + 3 : barkW + 2;
      ctrl = ctrl.map(function (p) {
        var lo, hi;
        if (side < 0) { lo = room * 0.8; hi = box.x0 - gap - room; } else { lo = box.x1 + gap + room; hi = W - room * 0.8; }
        if (lo > hi) lo = hi = (lo + hi) / 2;
        return [Math.max(lo, Math.min(hi, p[0])), p[1]];
      });
      return dense(ctrl, 10);
    }
    function barkPath(sm, w0, w1, y) {
      add("tree", y, '<path d="' + C.ribbon(sm, w0, w1) + '" fill="' + g.bark + '"/>');
      // fissures and a highlight: bark, not a tube
      add("tree", y, '<path d="' + smooth(sm.filter(function (_, i) { return i % 2 === 0; }).map(function (q) { return [q.x + Math.sin(q.ang) * w0 * 0.22, q.y - Math.cos(q.ang) * w0 * 0.22]; }), false) + '" fill="none" stroke="' + mix(g.bark, "#000", 0.45) + '" stroke-width="' + n1(Math.max(0.4, w0 * 0.1)) + '" stroke-dasharray="' + n1(w0 * 1.6) + " " + n1(w0 * 0.7) + '"/>');
      add("tree", y, '<path d="' + smooth(sm.filter(function (_, i) { return i % 2 === 0; }).map(function (q) { return [q.x - Math.sin(q.ang) * w0 * 0.28, q.y + Math.cos(q.ang) * w0 * 0.28]; }), false) + '" fill="none" stroke="' + mix(g.bark, "#fff", 0.35) + '" stroke-opacity=".5" stroke-width="' + n1(Math.max(0.4, w0 * 0.14)) + '"/>');
    }
    if (g.habit !== "slither" || r.chance(0.5)) {
      [-1, 1].forEach(function (side) {
        if ((side < 0 ? mL : mR) < 20) return;
        var t = trunk(side); trunks.push({ side: side, sm: t });
        barkPath(t, barkW, barkW * 0.7, 0);
        t.forEach(function (q, i) { if (i % 2 === 0) place(q.x, q.y, barkW * 0.5, "stem"); });
      });
    }
    // twigs: off the trunk, carrying leaves and hanging fruit
    function twig(x, y, deg, len, depth) {
      var a = deg / DEG, bend = r.range(-0.4, 0.4), ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      var mx = x + Math.cos(a + bend) * len * 0.55, my = y + Math.sin(a + bend) * len * 0.55;
      if (!fits(ex, ey, 2) || !fits(mx, my, 2)) return;
      add("tree", y, '<path d="M' + n1(x) + "," + n1(y) + "Q" + n1(mx) + "," + n1(my) + " " + n1(ex) + "," + n1(ey) + '" fill="none" stroke="' + g.bark + '" stroke-width="' + n1(Math.max(0.6, barkW * (depth ? 0.22 : 0.38))) + '" stroke-linecap="round"/>');
      place(mx, my, 1, "stem"); place(ex, ey, 1, "stem");
      var nl = r.int(2, 4);
      for (var i = 0; i < nl; i++) {
        var t = r.range(0.3, 1), qx = (1 - t) * (1 - t) * x + 2 * t * (1 - t) * mx + t * t * ex, qy = (1 - t) * (1 - t) * y + 2 * t * (1 - t) * my + t * t * ey;
        put("leaf", qx, qy, deg + r.sign() * r.range(30, 70), r.range(18, 34) * S);
      }
      if (r.chance(0.55)) put("fruit", ex, ey, 90 + r.range(-25, 25), r.range(18, 28) * S);
      else if (g.blossom && r.chance(0.5)) put("blossom", ex, ey, r.range(0, 360), r.range(14, 22) * S);
      else put("leaf", ex, ey, deg + bend * DEG, r.range(20, 34) * S);
      if (depth < 1 && r.chance(0.4)) twig(ex, ey, deg + r.sign() * r.range(25, 50), len * 0.6, depth + 1);
    }
    trunks.forEach(function (tr) {
      var total = tr.sm[tr.sm.length - 1].s, k = 0;
      for (var s = r.range(10, 40); s < total; s += r.range(26, 52) / g.density) {
        while (k < tr.sm.length - 1 && tr.sm[k].s < s) k++;
        var q = tr.sm[k], tdeg = q.ang * DEG, side = r.sign();
        if (r.chance(0.55)) twig(q.x, q.y, tdeg + side * r.range(35, 75), r.range(26, 70) * S, 0);
        else put("leaf", q.x, q.y, tdeg + side * r.range(30, 70), r.range(22, 40) * S);
      }
    });

    // ================= the serpents =================
    // A serpent is a SKELETON first and a picture second. Each one is a chain of
    // vertebrae (particles ~0.8 body-widths apart) simulated in 3D with
    // position-based dynamics: fixed segment lengths, a minimum bend radius and
    // a little bending stiffness (the spine), gravity (weight), the trunk as a
    // solid cylinder with friction on contact (the tree), grip muscles that pull
    // the coils onto the bark, a travelling curvature wave (serpentine
    // locomotion), a neck controller that holds the head up and toward the text,
    // and no passing through itself. Only then is the skin laid over the bones —
    // z sorts the body chunks in front of and behind the bark and itself, and the
    // spine's 3D pose says which way the back faces, so a body turning round
    // the branch shows its flank and the pale plates of its belly.
    var P = W0 * r.range(2.2, 3.2);                  // pattern period along the body
    var L3 = norm3([-0.45, -0.62, 0.65]);            // light: upper left, toward the viewer
    var H3 = norm3([L3[0], L3[1], L3[2] + 1]);       // half-vector for the specular
    var DS = W0 * 0.8;                               // vertebra spacing
    var RB = barkW * 0.45;                           // trunk radius
    var snakeCount = 0;
    function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    function widthAt(t) { var tail = Math.min(1, Math.pow(t / 0.3, 0.75)), neck = t > 0.94 ? 1 - 0.32 * (t - 0.94) / 0.06 : 1; return W0 * Math.max(0.07, tail * neck); }

    // nearest point on a trunk's axis (z = 0). Each trunk carries a per-row index of
    // its nearest segment (built once), so a lookup checks three segments, not a search.
    function trunkIndex(tr) {
      if (tr.rows) return tr.rows;
      var sm = tr.sm, rows = new Int32Array(Math.ceil(H) + 2), j = 0;
      for (var y = 0; y < rows.length; y++) {
        // segments run with y falling; find the one whose y-span holds this row
        var best = 0, bd = 1e18;
        for (var i = 0; i < sm.length - 1; i++) { var my = (sm[i].y + sm[i + 1].y) / 2, d = Math.abs(my - y); if (d < bd) { bd = d; best = i; } }
        rows[y] = best;
      }
      tr.rows = rows;
      return rows;
    }
    function onTrunk(tr, x, y) {
      var sm = tr.sm, rows = tr.rows || trunkIndex(tr), yi = Math.max(0, Math.min(rows.length - 1, Math.round(y))), c = rows[yi];
      var best = null, bd = 1e18;
      for (var i = Math.max(0, c - 2); i <= Math.min(sm.length - 2, c + 2); i++) {
        var a = sm[i], b = sm[i + 1], ex = b.x - a.x, ey = b.y - a.y, L2 = ex * ex + ey * ey || 1;
        var t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / L2)), px = a.x + ex * t, py = a.y + ey * t, d = (x - px) * (x - px) + (y - py) * (y - py);
        if (d < bd) { bd = d; var l = Math.sqrt(L2); best = { x: px, y: py, tx: ex / l, ty: ey / l }; }
      }
      return best;
    }
    // smallest on-page move that takes (x, y) with radius w out of the text
    function pushOut(p, w) {
      var m = w * 0.6 + 1;
      p[0] = Math.max(m, Math.min(W - m, p[0])); p[1] = Math.max(m, Math.min(H - m, p[1]));
      if (!inText(p[0], p[1], w + 1)) return;
      var c = [[box.x0 - gap - w - 1.5, p[1]], [box.x1 + gap + w + 1.5, p[1]], [p[0], box.y0 - gap - w - 1.5], [p[0], box.y1 + gap + w + 1.5]]
        .filter(function (q) { return q[0] >= m && q[0] <= W - m && q[1] >= m && q[1] <= H - m; })
        .sort(function (A, B) { return Math.hypot(A[0] - p[0], A[1] - p[1]) - Math.hypot(B[0] - p[0], B[1] - p[1]); });
      if (c.length) { p[0] = c[0][0]; p[1] = c[0][1]; }
    }

    // ---- the simulation ----
    // cfg: { pose: [[x,y,z]…] (initial, tail → head, ~DS apart), trunk, grip(i,N), plane (z or null),
    //        wave {amp, lam, ph} or null, head {x,y,z,dx,dy}, gravity }
    function simulate(cfg) {
      var N = cfg.pose.length, X = new Float64Array(N * 3), PX = new Float64Array(N * 3), wv = new Float64Array(N), gr = new Float64Array(N), contact = new Uint8Array(N);
      for (var i = 0; i < N; i++) { X[i * 3] = PX[i * 3] = cfg.pose[i][0]; X[i * 3 + 1] = PX[i * 3 + 1] = cfg.pose[i][1]; X[i * 3 + 2] = PX[i * 3 + 2] = cfg.pose[i][2]; wv[i] = widthAt(i / (N - 1)); gr[i] = cfg.grip ? cfg.grip(i, N) : 0; }
      var HT = new Int32Array(4096), NX = new Int32Array(N);
      function hcell(a, b, c) { return ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) & 4095; }
      var STEPS = 120, ITERS = 5, damp = 0.94, gy = cfg.gravity == null ? 0.2 * S : cfg.gravity;
      var dmin = DS * 2 * Math.cos(Math.PI / 2 - Math.asin(Math.min(0.95, DS / (2 * W0 * 1.25)))); // min bend radius ≈ 1.25 body widths
      var cell = W0 * 2.2, tmp = [0, 0];
      var hd = cfg.head, hdl = hd ? Math.hypot(hd.dx, hd.dy) || 1 : 1;
      for (var st = 0; st < STEPS; st++) {
        // integrate: velocity with damping; friction where the body grips the bark
        for (i = 0; i < N; i++) {
          var k = i * 3, f = contact[i] ? 0.2 : damp;
          var vx = (X[k] - PX[k]) * f, vy = (X[k + 1] - PX[k + 1]) * f, vz = (X[k + 2] - PX[k + 2]) * f;
          PX[k] = X[k]; PX[k + 1] = X[k + 1]; PX[k + 2] = X[k + 2];
          X[k] += vx; X[k + 1] += vy + (contact[i] ? gy * 0.15 : gy); X[k + 2] += vz;
        }
        for (var it = 0; it < ITERS; it++) {
          // vertebrae: fixed spacing
          for (i = 0; i < N - 1; i++) {
            var a = i * 3, b = a + 3, dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, c = (L - DS) / L * 0.5;
            X[a] += dx * c; X[a + 1] += dy * c; X[a + 2] += dz * c; X[b] -= dx * c; X[b + 1] -= dy * c; X[b + 2] -= dz * c;
          }
          // the spine can't fold tighter than its bend radius, and it is a little stiff
          for (i = 1; i < N - 1; i++) {
            var p0 = (i - 1) * 3, p1 = i * 3, p2 = (i + 1) * 3;
            var ex = X[p2] - X[p0], ey = X[p2 + 1] - X[p0 + 1], ez = X[p2 + 2] - X[p0 + 2], el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
            if (el < dmin) { var cc = (dmin - el) / el * 0.25; X[p0] -= ex * cc; X[p0 + 1] -= ey * cc; X[p0 + 2] -= ez * cc; X[p2] += ex * cc; X[p2 + 1] += ey * cc; X[p2 + 2] += ez * cc; }
            var ks = cfg.stiff == null ? 0.04 : cfg.stiff; // straightening; free serpents hold their muscular shape instead
            X[p1] += ((X[p0] + X[p2]) / 2 - X[p1]) * ks; X[p1 + 1] += ((X[p0 + 1] + X[p2 + 1]) / 2 - X[p1 + 1]) * ks; X[p1 + 2] += ((X[p0 + 2] + X[p2 + 2]) / 2 - X[p1 + 2]) * ks;
          }
          // muscles: a travelling wave of curvature (serpentine), in the page plane
          if (cfg.wave) {
            for (i = 1; i < N - 4; i++) {
              var q0 = (i - 1) * 3, q1 = i * 3, q2 = (i + 1) * 3, t = i / (N - 1);
              var th = cfg.wave.amp * Math.sin(i * DS / cfg.wave.lam * 6.2832 + cfg.wave.ph) * Math.min(1, t / 0.25) * Math.min(1, (1 - t) / 0.2);
              var hx = X[q1] - X[q0], hy = X[q1 + 1] - X[q0 + 1], hl = Math.hypot(hx, hy) || 1, cs = Math.cos(th), sn = Math.sin(th);
              var tx2 = X[q1] + (hx * cs - hy * sn) / hl * DS, ty2 = X[q1 + 1] + (hx * sn + hy * cs) / hl * DS;
              X[q2] += (tx2 - X[q2]) * 0.1; X[q2 + 1] += (ty2 - X[q2 + 1]) * 0.1;
            }
          }
          // the tree: a solid cylinder; grip muscles hug it
          if (cfg.trunk) {
            for (i = 0; i < N; i++) {
              var kk = i * 3, A = onTrunk(cfg.trunk, X[kk], X[kk + 1]);
              if (!A) continue;
              var ox = X[kk] - A.x, oy = X[kk + 1] - A.y, oz = X[kk + 2], along = ox * A.tx + oy * A.ty;
              ox -= along * A.tx; oy -= along * A.ty;
              var ro = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1e-6, want = RB + wv[i];
              contact[i] = 0;
              if (ro < want) { var push = (want - ro) / ro; X[kk] += ox * push; X[kk + 1] += oy * push; X[kk + 2] += oz * push; contact[i] = 1; }
              else if (gr[i] > 0 && ro < want + wv[i] * 7) { var pull = -(ro - want) / ro * gr[i]; X[kk] += ox * pull; X[kk + 1] += oy * pull; X[kk + 2] += oz * pull; if (ro < want + 2) contact[i] = 1; }
            }
          }
          // no passing through itself (a typed-array spatial hash: head/next lists)
          if (it % 2 === 0) {
            HT.fill(-1);
            for (i = 0; i < N; i++) { var hk = hcell(Math.floor(X[i * 3] / cell), Math.floor(X[i * 3 + 1] / cell), Math.floor(X[i * 3 + 2] / cell)); NX[i] = HT[hk]; HT[hk] = i; }
            for (i = 0; i < N; i++) {
              var gx = Math.floor(X[i * 3] / cell), gy2 = Math.floor(X[i * 3 + 1] / cell), gz = Math.floor(X[i * 3 + 2] / cell);
              for (var ax = -1; ax <= 1; ax++) for (var ay = -1; ay <= 1; ay++) for (var az = -1; az <= 1; az++) {
                for (var j = HT[hcell(gx + ax, gy2 + ay, gz + az)]; j >= 0; j = NX[j]) {
                  if (j <= i + 3) continue;
                  var u1 = i * 3, u2 = j * 3, sx = X[u2] - X[u1], sy = X[u2 + 1] - X[u1 + 1], sz = X[u2 + 2] - X[u1 + 2], sl2 = sx * sx + sy * sy + sz * sz, need = (wv[i] + wv[j]) * 0.92;
                  if (sl2 < need * need) { var sl = Math.sqrt(sl2) || 1e-6, sc2 = (need - sl) / sl * 0.5; X[u1] -= sx * sc2; X[u1 + 1] -= sy * sc2; X[u1 + 2] -= sz * sc2; X[u2] += sx * sc2; X[u2 + 1] += sy * sc2; X[u2 + 2] += sz * sc2; }
                }
              }
            }
          }
          // a resting coil's muscles draw the rings in about their centre
          if (cfg.center) for (i = 0; i < cfg.center.n; i++) { X[i * 3] += (cfg.center.x - X[i * 3]) * cfg.center.k; X[i * 3 + 1] += (cfg.center.y - X[i * 3 + 1]) * cfg.center.k; }
          // lying flat on the page, if it is
          if (cfg.plane != null) for (i = 0; i < N - (hd ? 6 : 0); i++) X[i * 3 + 2] += (cfg.plane - X[i * 3 + 2]) * 0.5;
          // the neck: hold the head up, beside the text, looking in
          if (hd) {
            var pins = [[N - 1, 0, 0.7], [N - 2, 1, 0.6], [N - 3, 2, 0.35], [N - 4, 3, 0.15]];
            for (var pi = 0; pi < pins.length; pi++) {
              var pk = pins[pi][0] * 3, back = pins[pi][1] * DS, kp = pins[pi][2];
              X[pk] += (hd.x - hd.dx / hdl * back - X[pk]) * kp; X[pk + 1] += (hd.y - hd.dy / hdl * back - X[pk + 1]) * kp; X[pk + 2] += (hd.z - X[pk + 2]) * kp;
            }
          }
          // the prose and the page edge are walls
          for (i = 0; i < N; i++) { var px0 = X[i * 3], py0 = X[i * 3 + 1], ww = wv[i]; if (px0 > ww && py0 > ww && px0 < W - ww && py0 < H - ww && !inText(px0, py0, ww + 1)) continue; tmp[0] = px0; tmp[1] = py0; pushOut(tmp, ww); X[i * 3] = tmp[0]; X[i * 3 + 1] = tmp[1]; }
        }
      }
      var out = [];
      for (i = 0; i < N; i++) out.push([X[i * 3], X[i * 3 + 1], X[i * 3 + 2]]);
      return out;
    }

    // ---- from bones to a dense spine with depth and the back's facing ----
    function catmull3(P, step) {
      var out = [];
      for (var i = 0; i < P.length - 1; i++) {
        var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        var n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / step));
        for (var j = 0; j < n; j++) {
          var t = j / n, t2 = t * t, t3 = t2 * t, o = [];
          for (var d = 0; d < 3; d++) o.push(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3));
          out.push(o);
        }
      }
      out.push(P[P.length - 1].slice());
      return out;
    }
    function body(bones, trunk) {
      var D = catmull3(bones, 3), smp = [], s = 0, i;
      for (i = 0; i < D.length; i++) { if (i) s += Math.hypot(D[i][0] - D[i - 1][0], D[i][1] - D[i - 1][1]); smp.push({ x: D[i][0], y: D[i][1], z: D[i][2], s: s }); }
      var Ltot = s;
      if (Ltot < W0 * 12) return false;
      for (i = 0; i < smp.length; i++) {
        var a = smp[Math.max(0, i - 2)], c = smp[Math.min(smp.length - 1, i + 2)], q = smp[i];
        q.ang = Math.atan2(c.y - a.y, c.x - a.x);
        q.w = widthAt(q.s / Ltot);
        // which way does the back face? away from the bark where it grips, toward the viewer where it's free
        var t3 = norm3([c.x - a.x, c.y - a.y, c.z - a.z]), V = [0, 0, 1];
        var df = norm3([V[0] - t3[2] * t3[0], V[1] - t3[2] * t3[1], V[2] - t3[2] * t3[2]]), dd = df;
        if (trunk) {
          var A = onTrunk(trunk, q.x, q.y);
          if (A) {
            var ox = q.x - A.x, oy = q.y - A.y, al = ox * A.tx + oy * A.ty; ox -= al * A.tx; oy -= al * A.ty;
            var o = [ox, oy, q.z], ro = Math.hypot(o[0], o[1], o[2]), wgt = Math.max(0, Math.min(1, 1 - (ro - RB - q.w) / (q.w * 2)));
            if (wgt > 0) {
              var od = o[0] * t3[0] + o[1] * t3[1] + o[2] * t3[2], dc = norm3([o[0] - od * t3[0], o[1] - od * t3[1], o[2] - od * t3[2]]);
              dd = norm3([df[0] * (1 - wgt) + dc[0] * wgt, df[1] * (1 - wgt) + dc[1] * wgt, df[2] * (1 - wgt) + dc[2] * wgt]);
            }
          }
        }
        var nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
        q.bc = dd[2]; q.bs = dd[0] * nx + dd[1] * ny; // the back's direction in the (viewer, screen-normal) plane
      }
      // smooth the facing along the body so the pattern rolls, never jumps
      for (var pass = 0; pass < 3; pass++) {
        var cs = smp.map(function (q) { return [q.bc, q.bs]; });
        for (i = 0; i < smp.length; i++) {
          var sc = 0, ss = 0;
          for (var k = -4; k <= 4; k++) { var e = cs[Math.max(0, Math.min(smp.length - 1, i + k))]; sc += e[0]; ss += e[1]; }
          smp[i].bc = sc; smp[i].bs = ss;
        }
      }
      for (i = 0; i < smp.length; i++) smp[i].beta = Math.atan2(smp[i].bs, smp[i].bc);
      // final guarantee for the prose
      var tp = [0, 0];
      for (i = 0; i < smp.length; i++) { tp[0] = smp[i].x; tp[1] = smp[i].y; pushOut(tp, smp[i].w); smp[i].x = tp[0]; smp[i].y = tp[1]; }
      return { smp: smp, L: Ltot };
    }
    function at(B, u) {
      var smp = B.smp, lo = 0, hi = smp.length - 1;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (smp[m].s < u) lo = m; else hi = m; }
      var A = smp[lo], Bq = smp[hi], t = Bq.s > A.s ? Math.max(0, Math.min(1, (u - A.s) / (Bq.s - A.s))) : 0;
      var nx0 = -Math.sin(A.ang), ny0 = Math.cos(A.ang), nx1 = -Math.sin(Bq.ang), ny1 = Math.cos(Bq.ang);
      var nx = nx0 + (nx1 - nx0) * t, ny = ny0 + (ny1 - ny0) * t, nl = Math.hypot(nx, ny) || 1;
      var bc = Math.cos(A.beta) * (1 - t) + Math.cos(Bq.beta) * t, bs = Math.sin(A.beta) * (1 - t) + Math.sin(Bq.beta) * t;
      return { x: A.x + (Bq.x - A.x) * t, y: A.y + (Bq.y - A.y) * t, z: A.z + (Bq.z - A.z) * t, nx: nx / nl, ny: ny / nl, w: A.w + (Bq.w - A.w) * t, beta: Math.atan2(bs, bc) };
    }
    function wpt(q, v) { var o = Math.sin(Math.max(-1, Math.min(1, v)) * Math.PI / 2) * q.w; return [q.x + q.nx * o, q.y + q.ny * o]; }

    var shadeCache = {};
    function shade(i, lvl) {
      var key = i + ":" + lvl;
      if (!shadeCache[key]) {
        var base = i === 4 ? BELLY : K.c[i], l = (lvl - 4) / 4;
        shadeCache[key] = l < 0 ? mix(base, K.gap, -l * 0.85) : mix(base, "#ffffff", l * 0.5);
      }
      return shadeCache[key];
    }
    var BELLY = mix(K.c[2], "#f2e6cc", 0.55);

    function drawSnake(B, salt) {
      var pat = makePattern(g, P, salt);
      var R = g.rows, rowV = 2 / R, du = (2 * W0 / R) * 1.6, half = du / 2;
      var smp = B.smp, Ltot = B.L, chunks = [];
      // chunks ~40px, cut where the body crosses the bark's plane, sorted by depth
      var cuts = [0];
      for (var i = 1; i < smp.length; i++) {
        if ((smp[i].z > 0) !== (smp[i - 1].z > 0) || smp[i].s - smp[cuts[cuts.length - 1]].s > 40) cuts.push(i);
      }
      cuts.push(smp.length - 1);
      for (var c = 0; c < cuts.length - 1; c++) {
        var a = smp[cuts[c]], b = smp[cuts[c + 1]], u0 = a.s, u1 = b.s;
        if (u1 - u0 < 0.5) continue;
        var zMean = 0, nz = 0;
        for (var zi = cuts[c]; zi <= cuts[c + 1]; zi++) { zMean += smp[zi].z; nz++; }
        zMean /= nz;
        var out = "", Lp = [], Rp = [];
        for (var u = Math.max(0, u0 - 1.5); u <= Math.min(Ltot, u1 + 1.5); u += 3) { var q = at(B, u); Lp.push([q.x + q.nx * q.w, q.y + q.ny * q.w]); Rp.push([q.x - q.nx * q.w, q.y - q.ny * q.w]); }
        if (Lp.length < 2) continue;
        var tube = smooth(Lp.concat(Rp.slice().reverse()), true);
        out += '<path d="' + tube + '" fill="' + K.gap + '" stroke="' + K.gap + '" stroke-width="1.2"/>';
        var buckets = {};
        for (var iu = Math.ceil(u0 / half); iu <= Math.floor(u1 / half); iu++) {
          var uc = iu * half, q0 = at(B, uc);
          if (q0.w < 0.6) continue;
          var bn = q0.beta / (Math.PI / 2), du2 = half * 0.86, qa = at(B, uc - du2), qb = at(B, uc + du2);
          var nrm = [q0.nx, q0.ny];
          for (var j = 0; j < 2 * R; j++) {
            var vp = -2 + (j + 0.5) * rowV;            // body coordinate: 0 the spine of the back, ±2 the belly line
            var v = vp + bn; v = ((v + 2) % 4 + 4) % 4 - 2;   // where that row shows on screen
            if (Math.abs(v) >= 1) continue;
            var belly = Math.abs(vp) > 1.12;
            if (!belly && (iu + j) % 2) continue;
            if (belly && iu % 2) continue;
            // light from the 3D normal of this point on the round body
            var al = v * Math.PI / 2, N3 = [Math.sin(al) * nrm[0], Math.sin(al) * nrm[1], Math.cos(al)];
            var dif = Math.max(0, N3[0] * L3[0] + N3[1] * L3[1] + N3[2] * L3[2]);
            var pc = belly ? [4, 0] : pat(uc, vp);
            var lit = 0.3 + 0.95 * dif + pc[1] - (zMean < 0 ? 0.22 : 0);
            var lvl = Math.max(0, Math.min(7, Math.round(lit * 4)));
            var p1, p2, p3, p4;
            if (belly) { // ventral plates: wide, transverse, overlapping into one band
              var qa2 = at(B, uc - du * 0.44), qb2 = at(B, uc + du * 0.44);
              p1 = wpt(qa2, v - rowV * 0.55); p2 = wpt(qb2, v - rowV * 0.55); p3 = wpt(qb2, v + rowV * 0.55); p4 = wpt(qa2, v + rowV * 0.55);
            } else {
              var dv = rowV * 0.86;
              p1 = wpt(qa, v); p2 = wpt(q0, v - dv); p3 = wpt(qb, v); p4 = wpt(q0, v + dv);
            }
            var key = pc[0] + ":" + lvl;
            (buckets[key] = buckets[key] || []).push("M" + pt(p1) + "l" + n1(p2[0] - p1[0]) + "," + n1(p2[1] - p1[1]) + "l" + n1(p3[0] - p2[0]) + "," + n1(p3[1] - p2[1]) + "l" + n1(p4[0] - p3[0]) + "," + n1(p4[1] - p3[1]) + "z");
          }
        }
        Object.keys(buckets).forEach(function (key) {
          var kk = key.split(":"), col = shade(+kk[0], +kk[1]);
          out += '<path d="' + buckets[key].join("") + '" fill="' + col + '" stroke="' + col + '" stroke-width=".35" stroke-linejoin="round"/>';
        });
        // the specular streak, where the round body mirrors the light
        var sh = [];
        for (var u2 = u0; u2 <= u1; u2 += 4) { var qq = at(B, u2), hs = H3[0] * qq.nx + H3[1] * qq.ny; sh.push(wpt(qq, Math.atan2(hs, H3[2]) / (Math.PI / 2))); }
        if (sh.length > 1) {
          var wm = at(B, (u0 + u1) / 2).w, so = zMean < 0 ? 0.5 : 1;
          out += '<path d="' + smooth(sh, false) + '" fill="none" stroke="#fff" stroke-opacity="' + n1(0.14 * g.sheen * so) + '" stroke-width="' + n1(Math.max(0.6, wm * 0.5)) + '" stroke-linecap="round"/>';
          out += '<path d="' + smooth(sh, false) + '" fill="none" stroke="#fff" stroke-opacity="' + n1(0.5 * g.sheen * so) + '" stroke-width="' + n1(Math.max(0.4, wm * 0.12)) + '" stroke-linecap="round"/>';
        }
        out += '<path d="' + smooth(Lp, false) + smooth(Rp, false) + '" fill="none" stroke="' + K.gap + '" stroke-width=".8" stroke-opacity=".9"/>';
        chunks.push({ z: zMean, svg: out });
      }
      var head = drawHead(B);
      chunks.push({ z: 1e9, svg: head });
      // painter's algorithm: behind the bark → its own layer, in front → over the leaves; each by depth
      chunks.sort(function (A2, B2) { return A2.z - B2.z; });
      var y0 = Math.min.apply(null, smp.map(function (q) { return q.y; }));
      var back = chunks.filter(function (k) { return k.z < 0; }).map(function (k) { return k.svg; }).join("");
      var front = chunks.filter(function (k) { return k.z >= 0; }).map(function (k) { return k.svg; }).join("");
      if (back) add("snakeBack", y0, back);
      add("snake", y0, front);
      for (var k2 = 0; k2 < smp.length; k2 += 2) place(smp[k2].x, smp[k2].y, smp[k2].w, "serpent", 1);
      snakeCount++;
    }

    function drawHead(B) {
      var q = at(B, B.L), pq = at(B, Math.max(0, B.L - DS * 1.5));
      var ang = Math.atan2(q.y - pq.y, q.x - pq.x) * DEG;
      // foreshorten when the head tips toward or away from the viewer
      var flat = Math.hypot(q.x - pq.x, q.y - pq.y) / (Math.hypot(q.x - pq.x, q.y - pq.y, q.z - pq.z) || 1), fs = Math.max(0.6, flat);
      var hw = W0 * (g.viper ? 1.3 : 1.0), s = "";
      var pts = g.viper
        ? [[-W0 * 0.4, W0 * 0.66], [LH * 0.1, hw * 0.92], [LH * 0.3, hw], [LH * 0.55, hw * 0.8], [LH * 0.82, hw * 0.42], [LH, hw * 0.12], [LH, -hw * 0.12], [LH * 0.82, -hw * 0.42], [LH * 0.55, -hw * 0.8], [LH * 0.3, -hw], [LH * 0.1, -hw * 0.92], [-W0 * 0.4, -W0 * 0.66]]
        : [[-W0 * 0.4, W0 * 0.68], [LH * 0.16, hw * 0.84], [LH * 0.42, hw * 0.92], [LH * 0.72, hw * 0.74], [LH * 0.93, hw * 0.38], [LH, 0], [LH * 0.93, -hw * 0.38], [LH * 0.72, -hw * 0.74], [LH * 0.42, -hw * 0.92], [LH * 0.16, -hw * 0.84], [-W0 * 0.4, -W0 * 0.68]];
      var headFill = lin("hd" + snakeCount, mix(K.c[0], K.gap, 0.35), K.c[0], mix(K.c[0], "#fff", 0.25), true);
      s += '<path d="' + smooth(pts, true) + '" fill="' + headFill + '" stroke="' + K.gap + '" stroke-width=".9"/>';
      s += '<path d="M' + n1(LH * 0.02) + "," + n1(-hw * 0.62) + " L" + n1(LH * 0.5) + ",0 L" + n1(LH * 0.02) + "," + n1(hw * 0.62) + " L" + n1(LH * 0.16) + ',0z" fill="' + K.c[1] + '" fill-opacity=".85"/>';
      s += '<path d="M' + n1(LH * 0.5) + ",0 L" + n1(LH * 0.9) + ',0" stroke="' + K.gap + '" stroke-width=".45" stroke-opacity=".5"/>';
      s += '<ellipse cx="' + n1(LH * 0.45) + '" cy="' + n1(-hw * 0.32) + '" rx="' + n1(LH * 0.24) + '" ry="' + n1(hw * 0.12) + '" fill="#fff" fill-opacity="' + n1(0.35 * g.sheen) + '"/>';
      [-1, 1].forEach(function (sd) {
        var ex = LH * 0.62, ey = sd * hw * 0.6, er = W0 * 0.26;
        s += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(er * 1.18) + '" fill="' + K.gap + '"/>';
        s += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(er) + '" fill="' + IRIS + '"/>';
        s += '<ellipse cx="' + n1(ex) + '" cy="' + n1(ey) + '" rx="' + n1(er * 0.16) + '" ry="' + n1(er * 0.82) + '" fill="#050505"/>';
        s += '<circle cx="' + n1(ex - er * 0.35) + '" cy="' + n1(ey - er * 0.35) + '" r="' + n1(er * 0.22) + '" fill="#fff" fill-opacity=".9"/>';
        s += '<path d="M' + n1(ex - er * 1.3) + "," + n1(ey - sd * er * 0.2) + "Q" + n1(ex) + "," + n1(ey - sd * er * 1.5) + " " + n1(ex + er * 1.3) + "," + n1(ey - sd * er * 0.4) + '" fill="none" stroke="' + K.gap + '" stroke-width="' + n1(Math.max(0.6, W0 * 0.16)) + '" stroke-linecap="round"/>';
        s += '<circle cx="' + n1(LH * 0.93) + '" cy="' + n1(sd * hw * 0.18) + '" r="' + n1(Math.max(0.4, W0 * 0.07)) + '" fill="' + K.gap + '"/>';
      });
      var T = TONGUE;
      var tongue = '<g class="tongue" style="--d:' + n1(r.range(0, 4)) + 's"><path d="M' + n1(LH * 0.96) + ",0 L" + n1(LH + T * 0.62) + ",0 M" + n1(LH + T * 0.62) + ",0 l" + n1(T * 0.38) + "," + n1(-T * 0.2) + " M" + n1(LH + T * 0.62) + ",0 l" + n1(T * 0.38) + "," + n1(T * 0.2) +
        '" fill="none" stroke="#b8102c" stroke-width="' + n1(Math.max(0.5, W0 * 0.13)) + '" stroke-linecap="round"/></g>';
      var a = ang / DEG, reachH = LH * fs;
      place(q.x + Math.cos(a) * reachH * 0.5, q.y + Math.sin(a) * reachH * 0.5, Math.max(reachH * 0.62, hw * 1.05), "head", 1);
      place(q.x + Math.cos(a) * (reachH + T * 0.6 * fs), q.y + Math.sin(a) * (reachH + T * 0.6 * fs), T * 0.55, "tongue", 0.2);
      return '<g transform="translate(' + n1(q.x) + " " + n1(q.y) + ") rotate(" + n1(ang) + ")" + (fs < 0.99 ? " scale(" + n1(fs) + " 1)" : "") + '">' + tongue + s + "</g>";
    }

    // where a head comes to rest: just off the text edge (side ±1) or below it (side 0)
    function headTarget(side, yNear, xNear) {
      var reach = LH + TONGUE + 4;
      if (side === 0) return { x: xNear, y: box.y1 + gap + reach, z: W0 * 2.5, dx: 0, dy: -1 };
      var x = side < 0 ? box.x0 - gap - reach : box.x1 + gap + reach;
      var y = Math.max(mT * 0.5 + W0 * 2, Math.min(H - mB * 0.5 - W0 * 2, yNear));
      x = Math.max(W0 * 2, Math.min(W - W0 * 2, x));
      return { x: x, y: y, z: W0 * 2.5, dx: side < 0 ? 1 : -1, dy: r.range(-0.25, 0.1) };
    }
    // lay a polyline of 3D points out as vertebrae DS apart
    function vertebrae(poly) {
      var out = [poly[0].slice()], acc = 0;
      for (var i = 1; i < poly.length; i++) {
        var a = poly[i - 1], b = poly[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), t = 0;
        while (acc + L - t >= DS) {
          t += DS - acc; acc = 0;
          var f = t / L; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
        }
        acc += L - t;
      }
      return out;
    }
    // a rough first pose; the simulation does the rest
    function approach(from, hd) {
      var pts = [], mid = [(from[0] + hd.x) / 2 - hd.dx * W0 * 3, (from[1] + hd.y) / 2 - W0 * 4, (from[2] + hd.z) / 2 + W0];
      for (var i = 1; i <= 24; i++) {
        var t = i / 24, u = 1 - t;
        pts.push([u * u * from[0] + 2 * u * t * mid[0] + t * t * hd.x, u * u * from[1] + 2 * u * t * mid[1] + t * t * hd.y, u * u * from[2] + 2 * u * t * mid[2] + t * t * hd.z]);
      }
      return pts;
    }

    // entwined / coiled: wound round a stretch of trunk, tail hanging, neck reaching for the text
    function onTree(tr, s0, s1, tight) {
      var sm = tr.sm, pose = [], lam0 = W0 * (tight ? r.range(2.3, 2.8) : r.range(3.8, 6)), ph = r.range(0, 6.28), ph2 = r.range(0, 6.28), rad = RB + W0, k = 0, phase = ph;
      // the tail first: hanging free below the coils
      var A0 = sm[0], kk0 = 0;
      while (kk0 < sm.length - 1 && sm[kk0].s < s0) kk0++;
      A0 = sm[kk0];
      var nx0 = -Math.sin(A0.ang), ny0 = Math.cos(A0.ang), tl = W0 * r.range(7, 12), out0 = r.sign();
      for (var tt = 1; tt >= 0; tt -= 0.1) pose.push([A0.x + nx0 * rad * out0 * 1.2 + tt * W0 * 2 * out0, A0.y + tt * tl, rad * 0.6]);
      // the coils: a helix of varying pitch about the trunk axis
      for (var s = s0; s <= s1; s += 3) {
        while (k < sm.length - 1 && sm[k + 1].s < s) k++;
        var a = sm[k], b = sm[Math.min(sm.length - 1, k + 1)], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
        var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, nx = -Math.sin(a.ang), ny = Math.cos(a.ang);
        phase += 3 / (lam0 * (1 + 0.35 * Math.sin(s / lam0 * 1.3 + ph2))) * 6.2832;
        pose.push([x + nx * rad * Math.sin(phase), y + ny * rad * Math.sin(phase), rad * Math.cos(phase)]);
      }
      var e = pose[pose.length - 1], hd = headTarget(tr.side, e[1] - r.range(W0 * 3, W0 * 8));
      return { pose: vertebrae(pose.concat(approach(e, hd))), head: hd, trunk: tr, nTail: Math.round(tl / DS) + 1, nTree: Math.round(Math.hypot(s1 - s0, 1) / DS) };
    }
    function treeSnake(tr, s0, s1, tight) {
      var o = onTree(tr, s0, s1, tight), nT = o.nTail, nC = o.pose.length;
      var bones = simulate({
        pose: o.pose, trunk: tr, head: o.head,
        grip: function (i, N) { return i < nT ? 0 : i > N - 14 ? 0 : (tight ? 0.5 : 0.28); },
      });
      var B = body(bones, tr);
      if (B) drawSnake(B, salt++);
    }
    // slither: the serpenoid curve (Hirose) — heading θ(s) = θ0 + a·sin(2πs/λ), the
    // shape real snakes make in lateral undulation — laid up the margin, then relaxed
    // by the skeleton so the neck can carry the head to the text
    function slitherSnake(side, yA, yB) {
      var mW = side < 0 ? mL : mR, cx0 = side < 0 ? mL * 0.5 : box.x1 + mR * 0.5;
      var zf = trunks.length ? RB + W0 + 2 : 0, lam = W0 * r.range(13, 18);
      var a = Math.min(0.85, (mW * 0.5 - W0 * 1.3) * 2 * Math.PI / lam), Ls = W0 * r.range(42, 60);
      if (a < 0.2) a = 0.2;
      var yStart = Math.min(yB, yA + Ls * 0.8), x = cx0, y = yStart, pose = [[x, y, zf]], ph = r.range(0, 6.28);
      for (var sArc = 0; sArc < Ls; sArc += 3) {
        var t = sArc / Ls, th = -Math.PI / 2 + a * Math.sin(sArc / lam * 6.2832 + ph) * Math.min(1, t / 0.15 + 0.3);
        x += Math.cos(th) * 3; y += Math.sin(th) * 3; pose.push([x, y, zf]);
      }
      var hd = headTarget(side, Math.min(y - W0 * 2, yA + W0 * 4));
      var bones = simulate({ pose: vertebrae(pose.concat(approach(pose[pose.length - 1], hd))), plane: zf, head: hd, gravity: 0, stiff: 0 });
      var B = body(bones, null);
      if (B) drawSnake(B, salt++);
    }
    // a resting coil on the page: concentric, touching, the head lifting off it
    function restingCoil(cx, cy, R0, hd) {
      var pose = [], R1 = W0 * 1.4, turns = Math.max(1.3, Math.min(3, (R0 - R1) / (W0 * 2))), dir = r.sign(), a0 = r.range(0, 6.28), n = Math.round(turns * 6.28 * R0 / 3);
      for (var i = 0; i <= n; i++) { var t = i / n, th = a0 + dir * t * turns * 6.28, rr = R0 - (R0 - R1) * t; pose.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.7, t * W0 * 0.8]); }
      var vb = vertebrae(pose), nCoil = vb.length;
      var bones = simulate({ pose: vertebrae(pose.concat(approach(pose[pose.length - 1], hd))), head: hd, gravity: 0, plane: null, stiff: 0.01, center: { x: cx, y: cy, k: 0.01, n: Math.max(0, nCoil - 4) } });
      var B = body(bones, null);
      if (B) drawSnake(B, salt++);
    }

    var salt = 1;
    if (g.habit !== "slither" && trunks.length) {
      var tight = g.habit === "coiled";
      trunks.forEach(function (tr) {
        var total = tr.sm[tr.sm.length - 1].s, n = Math.max(1, Math.round(H / (tight ? 900 : 1100))), seg = total / n;
        for (var i = 0; i < n; i++) {
          var len = Math.min(seg * 0.7, (tight ? r.range(7, 11) : r.range(20, 32)) * W0), s0 = total - seg * (i + 1) + r.range(W0 * 6, Math.max(W0 * 6, seg - len - W0 * 10));
          treeSnake(tr, Math.max(W0 * 4, s0), Math.min(total - W0 * 4, s0 + len), tight);
        }
      });
    } else {
      [-1, 1].forEach(function (side) {
        if ((side < 0 ? mL : mR) < 24) return;
        var n = Math.max(1, Math.round(H / 1300));
        for (var i = 0; i < n; i++) slitherSnake(side, H * i / n + H / n * 0.15, H * (i + 1) / n - H / n * 0.05);
      });
    }
    // the serpent at the root: a resting coil in a deep foot margin, rising to the text
    if (mB > W0 * 9) {
      var fcx = r.range(box.x0 + W0 * 8, box.x1 - W0 * 8);
      restingCoil(fcx, box.y1 + mB * 0.62, Math.min(mB * 0.32, W0 * 5.5), headTarget(0, 0, fcx + r.range(-W0 * 4, W0 * 4)));
    }

    // ---- the fill: leaves, fruit, blossom into what's left ----
    var target = Math.min(0.78, 0.5 + 0.18 * g.density);
    var order2 = marginCells.slice();
    for (var oi = order2.length - 1; oi > 0; oi--) { var oj = Math.floor(r.f() * (oi + 1)), tmp = order2[oi]; order2[oi] = order2[oj]; order2[oj] = tmp; }
    var covered = coverage() * marginCells.length, want = target * marginCells.length;
    for (var ci = 0; ci < order2.length && covered < want; ci++) {
      var cell = order2[ci];
      if (cov[cell]) continue;
      if (ci % 40 === 0) covered = coverage() * marginCells.length;
      var fx = (cell % gw + r.f()) * CELL, fy = (Math.floor(cell / gw) + r.f()) * CELL, dg = r.range(0, 360);
      var kind = r.pickw([["leaf", 6], ["fruit", 1.6], ["blossom", g.blossom ? 1.4 : 0]]);
      var sz = (kind === "leaf" ? r.range(16, 32) : r.range(14, 24)) * Math.max(0.6, S);
      if (!put(kind, fx - Math.cos(dg / DEG) * sz * 0.4, fy - Math.sin(dg / DEG) * sz * 0.4, kind === "fruit" ? 90 + r.range(-40, 40) : dg, sz, null, "fill")) cov[cell] = 1;
    }
    // gilt sparkles, sparing: the snakes are the jewels
    var ns = Math.round(marginCells.length * CELL * CELL / 5000);
    for (var k3 = 0; k3 < ns; k3++) {
      var c3 = marginCells[r.int(0, marginCells.length - 1)], sx = (c3 % gw + r.f()) * CELL, sy = (Math.floor(c3 / gw) + r.f()) * CELL, ss = r.range(1.4, 3.8) * Math.max(0.6, S);
      if (fits(sx, sy, ss)) add("glint", sy, sparkle(sx, sy, ss, "#c9a24a"));
    }

    // ---- assemble ----
    var OFF = { back: 0, snakeBack: 0.02, tree: 0, leaves: 0.03, fruit: 0.05, snake: 0.07, heads: 0.1, glint: 0.1 };
    function layerSvg(name, y0, y1) {
      var keys = Object.keys(bands[name]).map(Number).sort(function (a, b) { return a - b; }), inner = "";
      keys.forEach(function (b) {
        if (b * BAND < y0 || b * BAND >= y1) return;
        var body = bands[name][b].join("");
        inner += animated ? '<g class="fb" style="--o:' + Math.min(1, b * BAND / H + OFF[name]).toFixed(3) + '">' + body + "</g>" : body;
      });
      return inner ? '<g class="s-' + name + '">' + inner + "</g>" : "";
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="flora serpent" viewBox="0 0 ' + n1(W) + " " + n1(H) + '" width="' + n1(W) + '" height="' + n1(H) + '" aria-hidden="true"><defs>' + defs.join("") + "</defs>" +
      LAYERS.map(function (l) { return layerSvg(l, -1e9, 1e9); }).join("") + "</svg>";
    var tiles = null;
    if (opts.tile) {
      var T = Math.max(BAND, Math.round(opts.tile / BAND) * BAND), nT = Math.ceil(H / T);
      tiles = [];
      for (var ti = 0; ti < nT; ti++) {
        var ty = ti * T, th = Math.min(T, H - ty);
        tiles.push({ y: ty, h: th, svg: '<svg xmlns="http://www.w3.org/2000/svg" class="flora serpent tile" viewBox="0 ' + n1(ty) + " " + n1(W) + " " + n1(th) + '" width="' + n1(W) + '" height="' + n1(th) + '" overflow="visible" style="top:' + n1(ty) + 'px" aria-hidden="true">' +
          (ti === 0 ? "<defs>" + defs.join("") + "</defs>" : "") + LAYERS.map(function (l) { return layerSvg(l, ty, ty + T); }).join("") + "</svg>" });
      }
    }
    return { svg: svg, tiles: tiles, items: items, counts: counts, genome: g, scale: S, coverage: coverage(), serpents: snakeCount };
  }

  Z.kind = "serpent";
  Z.SKINS = SKINS;
  Z.PATTERNS = PATTERNS;
  Z.FRUITS = FRUITS;
  Z.HABITS = HABITS;
  Z.genome = genome;
  Z.describe = describe;
  Z.grow = grow;
})();
