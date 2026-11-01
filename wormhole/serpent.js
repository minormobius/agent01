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
    function swing(mW) { return Math.min(W0 * 1.8, mW * 0.3); }

    // ---- the tree: gnarled branches up the side margins ----
    function dense(pts, step) {
      // resample a polyline / control set into samples with s + ang
      var ctrl = C.resample(pts, step);
      return ctrl;
    }
    var trunks = [];
    var barkW = Math.max(2.2, 9 * S);
    function trunk(side) {
      var mW = side < 0 ? mL : mR, cx0 = side < 0 ? mL * r.range(0.4, 0.6) : box.x1 + mR * r.range(0.4, 0.6);
      var amp = mW * 0.18, wl = r.range(260, 420), ph = r.range(0, 6.28), ctrl = [];
      for (var y = H + 10; y > -10; y -= wl / 5) ctrl.push([cx0 + Math.sin(y / wl * 6.28 + ph) * amp + r.range(-amp, amp) * 0.3, y]);
      // keep a coil's swing + a body's width clear of the text and the page edge,
      // or the helix flattens into a seam against them
      var room = g.habit === "entwined" ? swing(mW) + W0 + 2 : barkW + 2;
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
    var P = W0 * r.range(2.2, 3.2);                  // pattern period along the body
    var L_ = [-0.55, -0.83];                         // light from the upper left
    var snakeCount = 0;

    function body(spine, depthOf) {
      // spine: dense [{x,y}] tail → head. Rebuild arc length, angles, widths.
      var smp = [], s = 0, i;
      for (i = 0; i < spine.length; i++) { if (i) s += Math.hypot(spine[i].x - spine[i - 1].x, spine[i].y - spine[i - 1].y); smp.push({ x: spine[i].x, y: spine[i].y, s: s, d: spine[i].d == null ? 1 : spine[i].d }); }
      var Ltot = s;
      if (Ltot < W0 * 12) return false;
      for (i = 0; i < smp.length; i++) {
        var a = smp[Math.max(0, i - 2)], c = smp[Math.min(smp.length - 1, i + 2)];
        smp[i].ang = Math.atan2(c.y - a.y, c.x - a.x);
        var t = smp[i].s / Ltot;
        var tail = Math.min(1, Math.pow(t / 0.3, 0.75)), neck = t > 0.94 ? 1 - 0.32 * (t - 0.94) / 0.06 : 1;
        smp[i].w = W0 * Math.max(0.07, tail * neck);
      }
      // the prose is sacred: push any sample that crowds the text back out,
      // by the smallest move that still lands on the page
      for (i = 0; i < smp.length; i++) {
        var q = smp[i], m = q.w * 0.6 + 1;
        q.x = Math.max(m, Math.min(W - m, q.x)); q.y = Math.max(m, Math.min(H - m, q.y));
        if (!inText(q.x, q.y, q.w + 1)) continue;
        var cand = [[box.x0 - gap - q.w - 1.5, q.y], [box.x1 + gap + q.w + 1.5, q.y], [q.x, box.y0 - gap - q.w - 1.5], [q.x, box.y1 + gap + q.w + 1.5]]
          .filter(function (c) { return c[0] >= m && c[0] <= W - m && c[1] >= m && c[1] <= H - m; })
          .sort(function (A, Bc) { return Math.hypot(A[0] - q.x, A[1] - q.y) - Math.hypot(Bc[0] - q.x, Bc[1] - q.y); });
        if (cand.length) { q.x = cand[0][0]; q.y = cand[0][1]; } else q.w = 0.01; // nowhere to go: it vanishes rather than trespass
      }
      return { smp: smp, L: Ltot };
    }
    function at(B, u) {
      var smp = B.smp, lo = 0, hi = smp.length - 1;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (smp[m].s < u) lo = m; else hi = m; }
      var A = smp[lo], Bq = smp[hi], t = Bq.s > A.s ? (u - A.s) / (Bq.s - A.s) : 0;
      t = Math.max(0, Math.min(1, t));
      var nx0 = -Math.sin(A.ang), ny0 = Math.cos(A.ang), nx1 = -Math.sin(Bq.ang), ny1 = Math.cos(Bq.ang);
      var nx = nx0 + (nx1 - nx0) * t, ny = ny0 + (ny1 - ny0) * t, nl = Math.hypot(nx, ny) || 1;
      return { x: A.x + (Bq.x - A.x) * t, y: A.y + (Bq.y - A.y) * t, nx: nx / nl, ny: ny / nl, w: A.w + (Bq.w - A.w) * t, d: t < 0.5 ? A.d : Bq.d };
    }
    function wpt(q, v) { var o = Math.sin(v * Math.PI / 2) * q.w; return [q.x + q.nx * o, q.y + q.ny * o]; }

    var shadeCache = {};
    function shade(i, lvl) {
      var key = i + ":" + lvl;
      if (!shadeCache[key]) {
        var base = K.c[i], l = (lvl - 4) / 4; // -1 … +0.75
        shadeCache[key] = l < 0 ? mix(base, K.gap, -l * 0.8) : mix(base, "#ffffff", l * 0.45);
      }
      return shadeCache[key];
    }

    function drawSnake(B, salt) {
      var pat = makePattern(g, P, salt);
      var R = g.rows, du = (2 * W0 / R) * 1.6, half = du / 2; // dorsal scales run longer than wide
      var smp = B.smp, Ltot = B.L;
      // chunks: break where the depth flips (front/behind the branch) or every ~70px
      var cuts = [0];
      for (var i = 1; i < smp.length; i++) {
        if (smp[i].d !== smp[i - 1].d || smp[i].s - smp[cuts[cuts.length - 1]].s > 70) cuts.push(i);
      }
      cuts.push(smp.length - 1);
      for (var c = 0; c < cuts.length - 1; c++) {
        var a = smp[cuts[c]], b = smp[cuts[c + 1]], u0 = a.s, u1 = b.s;
        if (u1 - u0 < 0.5) continue;
        var front = a.d > 0, layer = front ? "snake" : "snakeBack";
        var y0 = Math.min(a.y, b.y), out = "";
        // the body under the scales: the dark skin that shows between them
        var Lp = [], Rp = [];
        for (var u = Math.max(0, u0 - 1.5); u <= Math.min(Ltot, u1 + 1.5); u += 3) { var q = at(B, u); Lp.push([q.x + q.nx * q.w, q.y + q.ny * q.w]); Rp.push([q.x - q.nx * q.w, q.y - q.ny * q.w]); }
        if (Lp.length < 2) continue;
        var tube = smooth(Lp.concat(Rp.reverse()), true);
        out += '<path d="' + tube + '" fill="' + K.gap + '" stroke="' + K.gap + '" stroke-width="1.2"/>';
        // scales on the diamond lattice, batched by colour
        var buckets = {};
        var iu0 = Math.ceil(u0 / half), iu1 = Math.floor(u1 / half);
        for (var iu = iu0; iu <= iu1; iu++) {
          var uc = iu * half, q0 = at(B, uc);
          if (q0.w < 0.6) continue;
          var ndl = q0.nx * L_[0] + q0.ny * L_[1], vh = 0.5 * ndl;
          for (var j = 0; j < R; j++) {
            if ((iu + j) % 2) continue;
            var vc = -1 + (2 * j + 1) / R, dv = 2 / R * 0.86, du2 = half * 0.86;
            var pc = pat(uc, vc);
            var lit = 1 - 0.62 * Math.pow(Math.abs(vc), 1.7) + 0.42 * g.sheen * Math.exp(-Math.pow((vc - vh) / 0.24, 2)) + 0.12 * vc * ndl + pc[1];
            var lvl = Math.max(0, Math.min(7, Math.round(lit * 4)));
            var qa = at(B, uc - du2), qb = at(B, uc + du2);
            var p1 = wpt(qa, vc), p2 = wpt(q0, Math.max(-1, vc - dv)), p3 = wpt(qb, vc), p4 = wpt(q0, Math.min(1, vc + dv));
            var key = pc[0] + ":" + lvl;
            (buckets[key] = buckets[key] || []).push("M" + pt(p1) + "l" + n1(p2[0] - p1[0]) + "," + n1(p2[1] - p1[1]) + "l" + n1(p3[0] - p2[0]) + "," + n1(p3[1] - p2[1]) + "l" + n1(p4[0] - p3[0]) + "," + n1(p4[1] - p3[1]) + "z");
          }
        }
        Object.keys(buckets).forEach(function (key) {
          var kk = key.split(":"), col = shade(+kk[0], +kk[1]);
          out += '<path d="' + buckets[key].join("") + '" fill="' + col + '" stroke="' + col + '" stroke-width=".35" stroke-linejoin="round"/>';
        });
        // the gloss: a wet specular streak on the lit side
        var sh = [], sh2 = [];
        for (var u2 = u0; u2 <= u1; u2 += 4) {
          var qq = at(B, u2), nd = qq.nx * L_[0] + qq.ny * L_[1];
          sh.push(wpt(qq, 0.5 * nd)); sh2.push(wpt(qq, 0.5 * nd + 0.08));
        }
        if (sh.length > 1) {
          var wm = at(B, (u0 + u1) / 2).w;
          out += '<path d="' + smooth(sh, false) + '" fill="none" stroke="#fff" stroke-opacity="' + n1(0.16 * g.sheen) + '" stroke-width="' + n1(Math.max(0.6, wm * 0.55)) + '" stroke-linecap="round"/>';
          out += '<path d="' + smooth(sh2, false) + '" fill="none" stroke="#fff" stroke-opacity="' + n1(0.5 * g.sheen) + '" stroke-width="' + n1(Math.max(0.4, wm * 0.13)) + '" stroke-linecap="round"/>';
        }
        // behind the branch: in its shadow
        if (!front) out += '<path d="' + tube + '" fill="#000" fill-opacity=".3"/>';
        // a hairline down both flanks (not across the ends: that would seam the body) so crossings read
        out += '<path d="' + smooth(Lp, false) + smooth(Rp, false).replace(/^M/, "M") + '" fill="none" stroke="' + K.gap + '" stroke-width=".8" stroke-opacity=".9"/>';
        add(layer, y0, out);
      }
      // footprint along the body
      for (var k2 = 0; k2 < smp.length; k2 += 2) place(smp[k2].x, smp[k2].y, smp[k2].w, "serpent", 1);
      drawHead(B);
      snakeCount++;
    }

    function drawHead(B) {
      var q = at(B, B.L), ang = Math.atan2(-q.nx, q.ny) * DEG; // forward = the tangent (n rotated back a quarter turn)
      var hw = W0 * (g.viper ? 1.3 : 1.0), s = "";
      // outline: neck → jaw → snout (top-down)
      var pts = g.viper
        ? [[-W0 * 0.4, W0 * 0.66], [LH * 0.1, hw * 0.92], [LH * 0.3, hw], [LH * 0.55, hw * 0.8], [LH * 0.82, hw * 0.42], [LH, hw * 0.12], [LH, -hw * 0.12], [LH * 0.82, -hw * 0.42], [LH * 0.55, -hw * 0.8], [LH * 0.3, -hw], [LH * 0.1, -hw * 0.92], [-W0 * 0.4, -W0 * 0.66]]
        : [[-W0 * 0.4, W0 * 0.68], [LH * 0.16, hw * 0.84], [LH * 0.42, hw * 0.92], [LH * 0.72, hw * 0.74], [LH * 0.93, hw * 0.38], [LH, 0], [LH * 0.93, -hw * 0.38], [LH * 0.72, -hw * 0.74], [LH * 0.42, -hw * 0.92], [LH * 0.16, -hw * 0.84], [-W0 * 0.4, -W0 * 0.68]];
      var headFill = lin("hd" + snakeCount, mix(K.c[0], K.gap, 0.35), K.c[0], mix(K.c[0], "#fff", 0.25), true);
      s += '<path d="' + smooth(pts, true) + '" fill="' + headFill + '" stroke="' + K.gap + '" stroke-width=".9"/>';
      // head plates + the pattern's mark (a chevron) on the crown
      // the crown mark: an arrowhead from between the eyes back to the nape, in the skin's dark ink
      s += '<path d="M' + n1(LH * 0.02) + "," + n1(-hw * 0.62) + " L" + n1(LH * 0.5) + ",0 L" + n1(LH * 0.02) + "," + n1(hw * 0.62) + " L" + n1(LH * 0.16) + ',0z" fill="' + K.c[1] + '" fill-opacity=".85"/>';
      s += '<path d="M' + n1(LH * 0.5) + ",0 L" + n1(LH * 0.9) + ',0" stroke="' + K.gap + '" stroke-width=".45" stroke-opacity=".5"/>';
      // gloss on the crown
      s += '<ellipse cx="' + n1(LH * 0.45) + '" cy="' + n1(-hw * 0.32) + '" rx="' + n1(LH * 0.24) + '" ry="' + n1(hw * 0.12) + '" fill="#fff" fill-opacity="' + n1(0.35 * g.sheen) + '"/>';
      // eyes: gold iris, vertical slit, a glint; a brow ridge for menace
      [-1, 1].forEach(function (sd) {
        var ex = LH * 0.62, ey = sd * hw * 0.6, er = W0 * 0.26;
        s += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(er * 1.18) + '" fill="' + K.gap + '"/>';
        s += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(er) + '" fill="' + IRIS + '"/>';
        s += '<ellipse cx="' + n1(ex) + '" cy="' + n1(ey) + '" rx="' + n1(er * 0.16) + '" ry="' + n1(er * 0.82) + '" fill="#050505"/>';
        s += '<circle cx="' + n1(ex - er * 0.35) + '" cy="' + n1(ey - er * 0.35) + '" r="' + n1(er * 0.22) + '" fill="#fff" fill-opacity=".9"/>';
        s += '<path d="M' + n1(ex - er * 1.3) + "," + n1(ey - sd * er * 0.2) + "Q" + n1(ex) + "," + n1(ey - sd * er * 1.5) + " " + n1(ex + er * 1.3) + "," + n1(ey - sd * er * 0.4) + '" fill="none" stroke="' + K.gap + '" stroke-width="' + n1(Math.max(0.6, W0 * 0.16)) + '" stroke-linecap="round"/>';
        s += '<circle cx="' + n1(LH * 0.93) + '" cy="' + n1(sd * hw * 0.18) + '" r="' + n1(Math.max(0.4, W0 * 0.07)) + '" fill="' + K.gap + '"/>';
      });
      // the tongue, forked, flicking toward the text
      var T = TONGUE;
      var tongue = '<g class="tongue" style="--d:' + n1(r.range(0, 4)) + 's"><path d="M' + n1(LH * 0.96) + ",0 L" + n1(LH + T * 0.62) + ",0 M" + n1(LH + T * 0.62) + ",0 l" + n1(T * 0.38) + "," + n1(-T * 0.2) + " M" + n1(LH + T * 0.62) + ",0 l" + n1(T * 0.38) + "," + n1(T * 0.2) +
        '" fill="none" stroke="#b8102c" stroke-width="' + n1(Math.max(0.5, W0 * 0.13)) + '" stroke-linecap="round"/></g>';
      add("heads", q.y, "<g " + tf(q.x, q.y, ang) + ">" + tongue + s + "</g>");
      var a = ang / DEG;
      place(q.x + Math.cos(a) * LH * 0.5, q.y + Math.sin(a) * LH * 0.5, Math.max(LH * 0.62, hw * 1.05), "head", 1);
      place(q.x + Math.cos(a) * (LH + T * 0.6), q.y + Math.sin(a) * (LH + T * 0.6), T * 0.55, "tongue", 0.2);
    }

    // the head's resting place: just off the text edge, pointing at it
    function headTarget(side, yNear) {
      var reach = LH + TONGUE + 4;
      var x = side < 0 ? box.x0 - gap - reach : box.x1 + gap + reach;
      var y = Math.max(mT * 0.5 + W0 * 2, Math.min(H - mB * 0.5 - W0 * 2, yNear));
      if (side < 0 && x < W0 * 2) x = W0 * 2; if (side > 0 && x > W - W0 * 2) x = W - W0 * 2;
      return [x, y];
    }
    function exitPath(spine, side, yNear, tgtUp) {
      // from the end of the spine, an S-curve to rest the head beside the text
      // (side ±1, heading sideways into it) or below it (side 0, heading up)
      var e = spine[spine.length - 1], tgt = tgtUp || headTarget(side, yNear);
      // leave along the body's own heading, so the neck flows instead of hairpinning
      var p0 = spine[Math.max(0, spine.length - 6)], hx = e.x - p0.x, hy = e.y - p0.y, hl = Math.hypot(hx, hy) || 1;
      var lead = Math.min(W0 * 5, Math.hypot(tgt[0] - e.x, tgt[1] - e.y) * 0.45);
      var c1 = [e.x + hx / hl * lead, e.y + hy / hl * lead];
      var c2 = side === 0 ? [tgt[0] + r.range(-W0, W0), tgt[1] + W0 * 3.5] : [tgt[0] - (side < 0 ? 1 : -1) * W0 * 3, tgt[1] + W0 * r.range(-2, 2)];
      var ctl = [[e.x, e.y], c1, c2, tgt];
      var d = C.resample(ctl, 3);
      for (var i = 1; i < d.length; i++) spine.push({ x: d[i].x, y: d[i].y, d: 1 });
      return spine;
    }

    // entwined: a helix round a stretch of trunk
    function entwine(tr, s0, s1) {
      var sm = tr.sm, spine = [], lam = W0 * r.range(6, 8.5), ph = r.range(0, 6.28), A = swing(tr.side < 0 ? mL : mR);
      var k = 0;
      for (var s = s0; s <= s1; s += 3) {
        while (k < sm.length - 1 && sm[k + 1].s < s) k++;
        var a = sm[k], b = sm[Math.min(sm.length - 1, k + 1)], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
        var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, ang = a.ang, nx = -Math.sin(ang), ny = Math.cos(ang);
        var phase = (s - s0) / lam * 6.28 + ph;
        spine.push({ x: x + nx * A * Math.sin(phase), y: y + ny * A * Math.sin(phase), d: Math.cos(phase) > 0 ? 1 : -1 });
      }
      return spine;
    }
    // a coil: spiral inward, then the head rises out across it
    function coil(cx, cy, R0, side) {
      var R1 = W0 * 1.5, turns = Math.max(1.3, Math.min(2.6, (R0 - R1) / (W0 * 1.9))), spine = [], n = Math.round(turns * 2 * Math.PI * R0 / 3), dir = r.sign(), a0 = r.range(0, 6.28);
      for (var i = 0; i <= n; i++) {
        var t = i / n, th = a0 + dir * t * turns * 6.28, rr = R0 - (R0 - R1) * t;
        spine.push({ x: cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr * 0.62, d: 1 });
      }
      return side === 0 ? exitPath(spine, 0, null, [cx + r.range(-R0, R0), box.y1 + gap + LH + TONGUE + 4]) : exitPath(spine, side, cy - R0 * 0.2);
    }
    // slither: a free S-curve down a margin
    function slither(side, yA, yB) {
      var mW = side < 0 ? mL : mR, cx0 = side < 0 ? mL * 0.5 : box.x1 + mR * 0.5, amp = mW * 0.3, ctl = [];
      for (var y = yB, i = 0; y > yA; y -= W0 * r.range(7, 10), i++) ctl.push([cx0 + (i % 2 ? 1 : -1) * amp * r.range(0.7, 1), y]);
      if (ctl.length < 3) return null;
      var spine = C.resample(ctl, 3).map(function (q) { return { x: q.x, y: q.y, d: 1 }; });
      return exitPath(spine, side, yA);
    }

    var salt = 1;
    function addSnake(spine) { if (!spine) return; var B = body(spine); if (B) drawSnake(B, salt++); }

    if (g.habit === "entwined" && trunks.length) {
      trunks.forEach(function (tr) {
        var total = tr.sm[tr.sm.length - 1].s, n = Math.max(1, Math.round(H / 1500)), seg = total / n;
        for (var i = 0; i < n; i++) {
          var len = seg * r.range(0.55, 0.8), s0 = total - seg * (i + 1) + r.range(0, seg - len);
          var sp = entwine(tr, Math.max(0, s0), Math.min(total, s0 + len));
          var e = sp[sp.length - 1];
          addSnake(exitPath(sp, tr.side, e.y - r.range(W0 * 4, W0 * 9)));
        }
      });
    } else if (g.habit === "slither" || !trunks.length) {
      [-1, 1].forEach(function (side) {
        if ((side < 0 ? mL : mR) < 24) return;
        var n = Math.max(1, Math.round(H / 1400));
        for (var i = 0; i < n; i++) addSnake(slither(side, H * i / n + H / n * 0.1, H * (i + 1) / n - H / n * 0.05));
      });
    } else {
      // coiled: coils sitting in the side margins, one per ~900px
      [-1, 1].forEach(function (side) {
        var mW = side < 0 ? mL : mR;
        if (mW < 30) return;
        var n = Math.max(1, Math.round(H / 900)), R0 = Math.min(mW * 0.46, W0 * 6.5);
        for (var i = 0; i < n; i++) {
          var cx = side < 0 ? mL * 0.5 : box.x1 + mR * 0.5, cy = H * (i + 0.6) / n;
          addSnake(coil(cx, cy, R0, side));
        }
      });
    }
    // a coil in the foot margin when it's deep enough — the serpent at the root
    if (mB > W0 * 9) addSnake(coil(r.range(box.x0 + W0 * 8, box.x1 - W0 * 8), box.y1 + mB * 0.6, Math.min(mB * 0.6, W0 * 7), 0));

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
