/* The Ludographer — board diagrams. One stylised SVG per topology, drawn
   deterministically from the seed so a game's board looks the same forever.
   Decorative, not a play surface (this is the spec-only showcase) — but it
   reads the topology params the engine rolled, so the picture is honest about
   the substrate the rules sit on. Attaches to LUDO.board(g) -> svg string. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  var W = 520, H = 360;
  function svg(inner, pal) {
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" class="board-svg" role="img">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="' + (pal.board || "#efe7d4") + '"/>' +
      inner + '</svg>';
  }
  function lerpAlpha(hex, a) { return hex; } // palette colors already chosen; alpha via fill-opacity

  function squareBoard(g, r, pal) {
    var cols = g.params.cols || 7, rows = g.params.rows || 7;
    var pad = 26, cw = (W - pad * 2) / cols, ch = (H - pad * 2) / rows;
    var s = "";
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var fill = (x + y) % 2 ? pal.accent : pal.accent2;
      var op = r.f() < 0.30 ? (0.18 + r.f() * 0.6) : 0.10;
      s += '<rect x="' + (pad + x * cw + 1) + '" y="' + (pad + y * ch + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="3" fill="' + fill + '" fill-opacity="' + op.toFixed(2) + '"/>';
    }
    // a few pieces
    for (var i = 0; i < 7; i++) {
      var px = pad + r.int(0, cols - 1) * cw + cw / 2, py = pad + r.int(0, rows - 1) * ch + ch / 2;
      s += piece(px, py, Math.min(cw, ch) * 0.28, i % 2 ? pal.accent : pal.accent2);
    }
    return s;
  }

  function hexBoard(g, r, pal) {
    var rad = Math.min(3, (g.params.radius || 4));
    var size = 26, cx = W / 2, cy = H / 2;
    var s = "";
    for (var q = -rad; q <= rad; q++) {
      for (var rr = Math.max(-rad, -q - rad); rr <= Math.min(rad, -q + rad); rr++) {
        var x = cx + size * 1.5 * q;
        var y = cy + size * Math.sqrt(3) * (rr + q / 2);
        var op = r.f() < 0.32 ? (0.2 + r.f() * 0.55) : 0.1;
        s += hexPath(x, y, size - 2, (q + rr) % 2 ? pal.accent : pal.accent2, op);
      }
    }
    for (var i = 0; i < 6; i++) s += piece(cx + r.int(-2, 2) * size * 1.5, cy + r.int(-2, 2) * size * 1.3, 8, i % 2 ? pal.accent : pal.accent2);
    return s;
  }
  function hexPath(x, y, s, fill, op) {
    var pts = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i); pts.push((x + s * Math.cos(a)).toFixed(1) + "," + (y + s * Math.sin(a)).toFixed(1)); }
    return '<polygon points="' + pts.join(" ") + '" fill="' + fill + '" fill-opacity="' + op.toFixed(2) + '" stroke="' + fill + '" stroke-opacity="0.5"/>';
  }

  function graphBoard(g, r, pal) {
    var n = Math.min(14, g.params.nodes || 11);
    var nodes = [];
    for (var i = 0; i < n; i++) nodes.push({ x: 50 + r.f() * (W - 100), y: 40 + r.f() * (H - 80) });
    var s = "";
    // edges: connect each node to nearest 1-2 others
    for (var i = 0; i < n; i++) {
      var d = nodes.map(function (m, j) { return { j: j, d: (m.x - nodes[i].x) * (m.x - nodes[i].x) + (m.y - nodes[i].y) * (m.y - nodes[i].y) }; })
        .filter(function (o) { return o.j !== i; }).sort(function (a, b) { return a.d - b.d; });
      var k = 1 + (r.f() < 0.5 ? 1 : 0);
      for (var e = 0; e < k && e < d.length; e++) {
        var m = nodes[d[e].j];
        s += '<line x1="' + nodes[i].x.toFixed(0) + '" y1="' + nodes[i].y.toFixed(0) + '" x2="' + m.x.toFixed(0) + '" y2="' + m.y.toFixed(0) + '" stroke="' + pal.accent2 + '" stroke-opacity="0.5" stroke-width="' + (r.f() < 0.3 ? 4 : 2) + '"/>';
      }
    }
    for (var i = 0; i < n; i++) s += '<circle cx="' + nodes[i].x.toFixed(0) + '" cy="' + nodes[i].y.toFixed(0) + '" r="' + (6 + r.int(0, 5)) + '" fill="' + (i % 3 ? pal.accent : pal.accent2) + '" stroke="#fff" stroke-opacity="0.6"/>';
    return s;
  }

  function trackBoard(g, r, pal) {
    var spaces = Math.min(40, g.params.spaces || 32);
    var s = "", cx = W / 2, cy = H / 2, rx = W / 2 - 50, ry = H / 2 - 36;
    for (var i = 0; i < spaces; i++) {
      var a = (i / spaces) * Math.PI * 2 - Math.PI / 2;
      var x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      var fill = i % 5 === 0 ? pal.accent : pal.accent2;
      s += '<rect x="' + (x - 7) + '" y="' + (y - 7) + '" width="14" height="14" rx="3" transform="rotate(' + (a * 180 / Math.PI + 90) + ' ' + x + ' ' + y + ')" fill="' + fill + '" fill-opacity="' + (i % 5 === 0 ? 0.85 : 0.4) + '"/>';
    }
    // a few racers near the start
    for (var i = 0; i < 4; i++) { var a = (-2 - i) / spaces * Math.PI * 2 - Math.PI / 2; s += piece(cx + rx * Math.cos(a), cy + ry * Math.sin(a), 7, [pal.accent, pal.accent2][i % 2]); }
    return s;
  }

  function modularBoard(g, r, pal) {
    var s = "";
    for (var i = 0; i < 16; i++) {
      var tw = 60, th = 60, x = 30 + (i % 5) * (tw + 8) + r.int(-4, 4), y = 30 + Math.floor(i / 5) * (th + 8) + r.int(-4, 4);
      if (r.f() < 0.22) continue; // unplaced gaps
      s += '<g transform="rotate(' + r.pick([0, 90, 180, 270]) + ' ' + (x + tw / 2) + ' ' + (y + th / 2) + ')">' +
        '<rect x="' + x + '" y="' + y + '" width="' + tw + '" height="' + th + '" rx="4" fill="' + (i % 2 ? pal.accent : pal.accent2) + '" fill-opacity="' + (0.2 + r.f() * 0.4).toFixed(2) + '" stroke="' + pal.accent2 + '" stroke-opacity="0.4"/>' +
        '<path d="M' + (x + tw / 2) + ' ' + y + ' V' + (y + th) + ' M' + x + ' ' + (y + th / 2) + ' H' + (x + tw) + '" stroke="' + pal.accent2 + '" stroke-opacity="0.25"/></g>';
    }
    return s;
  }

  function tableauBoard(g, r, pal) {
    var s = "", n = Math.min(6, g.params.rowSize || 5);
    s += '<text x="30" y="46" fill="' + pal.accent2 + '" font-size="13" opacity="0.7">market row</text>';
    for (var i = 0; i < n; i++) s += card(30 + i * 76, 56, 64, 92, pal.accent, r);
    s += '<text x="30" y="190" fill="' + pal.accent2 + '" font-size="13" opacity="0.7">your tableau</text>';
    for (var i = 0; i < 8; i++) s += card(30 + (i % 4) * 76 + (Math.floor(i / 4) * 12), 200 + Math.floor(i / 4) * 14, 60, 78, i % 2 ? pal.accent2 : pal.accent, r);
    return s;
  }
  function card(x, y, w, h, fill, r) {
    return '<g><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" fill="' + fill + '" fill-opacity="' + (0.18 + r.f() * 0.35).toFixed(2) + '" stroke="' + fill + '" stroke-opacity="0.6"/>' +
      '<rect x="' + (x + 7) + '" y="' + (y + 8) + '" width="' + (w - 14) + '" height="14" rx="3" fill="' + fill + '" fill-opacity="0.5"/></g>';
  }

  function rondelBoard(g, r, pal) {
    var wedges = Math.min(10, g.params.wedges || 8), cx = W / 2, cy = H / 2, R = 140;
    var s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + pal.accent2 + '" stroke-opacity="0.4"/>';
    for (var i = 0; i < wedges; i++) {
      var a0 = (i / wedges) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / wedges) * Math.PI * 2 - Math.PI / 2;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      s += '<path d="M' + cx + ' ' + cy + ' L' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Z" fill="' + (i % 2 ? pal.accent : pal.accent2) + '" fill-opacity="' + (0.18 + (i % 3) * 0.12).toFixed(2) + '" stroke="#fff" stroke-opacity="0.5"/>';
    }
    var ai = r.int(0, wedges - 1), am = (ai / wedges) * Math.PI * 2 - Math.PI / 2 + Math.PI / wedges;
    s += piece(cx + (R - 22) * Math.cos(am), cy + (R - 22) * Math.sin(am), 9, pal.accent);
    return s;
  }

  function regionsBoard(g, r, pal) {
    var n = Math.min(9, g.params.regions || 6), s = "";
    // crude region blobs on a jittered grid
    var cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    var cw = (W - 40) / cols, ch = (H - 40) / rows, k = 0;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols && k < n; x++, k++) {
      var bx = 20 + x * cw, by = 20 + y * ch;
      s += '<rect x="' + (bx + 4) + '" y="' + (by + 4) + '" width="' + (cw - 8) + '" height="' + (ch - 8) + '" rx="14" fill="' + (k % 2 ? pal.accent : pal.accent2) + '" fill-opacity="' + (0.16 + r.f() * 0.3).toFixed(2) + '" stroke="' + pal.accent2 + '" stroke-opacity="0.4"/>';
      var pc = r.int(1, 4);
      for (var p = 0; p < pc; p++) s += piece(bx + 18 + r.f() * (cw - 36), by + 18 + r.f() * (ch - 36), 7, [pal.accent, pal.accent2][p % 2]);
    }
    return s;
  }

  function piece(x, y, r0, fill) {
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r0.toFixed(1) + '" fill="' + fill + '" stroke="#fff" stroke-opacity="0.7" stroke-width="1.5"/>';
  }

  var DRAW = { square: squareBoard, hex: hexBoard, graph: graphBoard, track: trackBoard, modular: modularBoard, tableau: tableauBoard, rondel: rondelBoard, regions: regionsBoard };

  L.board = function (g) {
    var pal = g.theme.pal;
    var r = (L.prng).Rand("ludo::board::" + g.seed);
    var fn = DRAW[g.topology.id] || squareBoard;
    return svg(fn(g, r, pal), pal);
  };
})();
