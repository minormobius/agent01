// wormhole — the incestuous-web renderer.
//
// A dependency-free force-directed graph (Fruchterman-Reingold-ish) on a 2D
// canvas, in the same lineage as read/<tale>/app.js's character web. Labs are
// circles (sized by headcount), theories are diamonds. Edges carry the field's
// gossip: who espouses what, who refutes whom, who poached whose postdoc.
//
// Deterministic layout: node start positions are seeded off the dossier seed so
// the same field always lays out the same way (a permalink should look stable).
//
// Exposes WORMHOLE_GRAPH.render(canvas, web, opts) → returns a controller with
// .stop(). Re-render replaces the previous sim.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var G = NS.WORMHOLE_GRAPH = NS.WORMHOLE_GRAPH || {};

  var CAMP_COLOR = {
    formalist: "#c9a227", empiricist: "#4f9d69", revisionist: "#c65d3b",
    structuralist: "#5b7fb4", materialist: "#8a6d3b", computational: "#6b8f9c",
    phenomenological: "#9a6ab0", traditionalist: "#a8894f"
  };
  function campColor(c) { return CAMP_COLOR[c] || "#8a7a5c"; }

  // small seeded rng so layout is stable per field
  function rngFrom(seedStr) {
    var h = 1779033703 ^ String(seedStr).length;
    for (var i = 0; i < String(seedStr).length; i++) {
      h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    var a = (h ^= h >>> 16) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  G.campColor = campColor;
  G.CAMP_COLOR = CAMP_COLOR;

  G.render = function (canvas, web, opts) {
    opts = opts || {};
    var seed = opts.seed || "1";
    var rand = rngFrom("layout::" + seed);
    var raf = null, running = true;

    var dpr = Math.max(1, Math.min(2, (NS.devicePixelRatio || 1)));
    function size() {
      var rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(300, rect.width) * dpr;
      canvas.height = Math.max(300, rect.height) * dpr;
    }
    size();
    var ctx = canvas.getContext("2d");

    var W = canvas.width / dpr, H = canvas.height / dpr;

    // build nodes
    var nodes = [], byId = {};
    web.labs.forEach(function (l) {
      var nd = { id: l.id, kind: "lab", label: l.name, sub: "PI " + l.pi, camp: l.camp,
                 r: 7 + Math.sqrt(l.members) * 3, data: l };
      nodes.push(nd); byId[l.id] = nd;
    });
    web.theories.forEach(function (t) {
      var nd = { id: t.id, kind: "theory", label: t.name, sub: t.claim, camp: t.camp, r: 9, data: t };
      nodes.push(nd); byId[t.id] = nd;
    });
    nodes.forEach(function (n, i) {
      var ang = (i / nodes.length) * Math.PI * 2;
      n.x = W / 2 + Math.cos(ang) * (60 + rand() * 90);
      n.y = H / 2 + Math.sin(ang) * (60 + rand() * 90);
      n.vx = 0; n.vy = 0;
    });
    var edges = web.edges.filter(function (e) { return byId[e.from] && byId[e.to]; })
      .map(function (e) { return { s: byId[e.from], t: byId[e.to], type: e.type, label: e.label }; });

    // interaction
    var view = { x: 0, y: 0, k: 1 };
    var drag = null, hover = null, panning = null;

    function toWorld(px, py) {
      return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
    }
    function nodeAt(px, py) {
      var w = toWorld(px, py);
      for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i], dx = n.x - w.x, dy = n.y - w.y;
        if (dx * dx + dy * dy <= (n.r + 6) * (n.r + 6)) return n;
      }
      return null;
    }
    function evtPos(e) {
      var rect = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    function onDown(e) {
      var p = evtPos(e);
      var n = nodeAt(p.x, p.y);
      if (n) { drag = n; n.fixed = true; }
      else { panning = { x: p.x - view.x, y: p.y - view.y }; }
    }
    function onMove(e) {
      var p = evtPos(e);
      if (drag) {
        var w = toWorld(p.x, p.y); drag.x = w.x; drag.y = w.y; drag.vx = 0; drag.vy = 0;
        e.preventDefault && e.preventDefault();
      } else if (panning) {
        view.x = p.x - panning.x; view.y = p.y - panning.y;
      } else {
        var h = nodeAt(p.x, p.y);
        if (h !== hover) { hover = h; canvas.style.cursor = h ? "pointer" : "grab"; }
      }
    }
    function onUp() {
      if (drag) drag.fixed = false;
      drag = null; panning = null;
    }
    function onWheel(e) {
      e.preventDefault();
      var p = evtPos(e);
      var f = Math.exp(-e.deltaY * 0.0015);
      var nk = Math.max(0.35, Math.min(3, view.k * f));
      view.x = p.x - (p.x - view.x) * (nk / view.k);
      view.y = p.y - (p.y - view.y) * (nk / view.k);
      view.k = nk;
    }
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    NS.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);
    canvas.style.cursor = "grab";

    // physics
    var K = 74; // ideal spring length
    function step() {
      W = canvas.width / dpr; H = canvas.height / dpr;
      var cx = W / 2, cy = H / 2;
      // repulsion
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy + 0.01;
          var d = Math.sqrt(d2);
          var force = (K * K) / d2 * 12;
          var fx = (dx / d) * force, fy = (dy / d) * force;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // springs
      edges.forEach(function (e) {
        var dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
        var d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        var force = (d - K) * 0.02;
        var fx = (dx / d) * force, fy = (dy / d) * force;
        e.s.vx += fx; e.s.vy += fy; e.t.vx -= fx; e.t.vy -= fy;
      });
      // gravity to center + integrate
      nodes.forEach(function (n) {
        n.vx += (cx - n.x) * 0.006;
        n.vy += (cy - n.y) * 0.006;
        if (!n.fixed) {
          n.vx *= 0.86; n.vy *= 0.86;
          n.x += Math.max(-12, Math.min(12, n.vx));
          n.y += Math.max(-12, Math.min(12, n.vy));
        } else { n.vx = 0; n.vy = 0; }
      });
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.k, view.k);

      // edges
      edges.forEach(function (e) {
        var espouses = e.type === "espouses";
        var refute = e.label === "refutes" || e.label === "won't cite" || e.label === "rivalry with";
        ctx.strokeStyle = refute ? "rgba(198,93,59,0.5)" : espouses ? "rgba(120,110,80,0.35)" : "rgba(90,127,180,0.4)";
        ctx.lineWidth = espouses ? 1 : 1.6;
        if (refute) ctx.setLineDash([4, 3]); else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(e.s.x, e.s.y);
        ctx.lineTo(e.t.x, e.t.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // edge label on hover of either endpoint
        if (hover && (e.s === hover || e.t === hover)) {
          var mx = (e.s.x + e.t.x) / 2, my = (e.s.y + e.t.y) / 2;
          ctx.font = "9px ui-sans-serif, system-ui";
          ctx.fillStyle = "rgba(60,50,35,0.85)";
          ctx.textAlign = "center";
          ctx.fillText(e.label, mx, my - 2);
        }
      });

      // nodes
      nodes.forEach(function (n) {
        var col = campColor(n.camp);
        var isHover = n === hover;
        ctx.lineWidth = isHover ? 2.5 : 1.2;
        ctx.strokeStyle = "rgba(40,32,20,0.7)";
        if (n.kind === "lab") {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill(); ctx.stroke();
        } else {
          // diamond for theories
          var s = n.r + 2;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x + s, n.y);
          ctx.lineTo(n.x, n.y + s); ctx.lineTo(n.x - s, n.y);
          ctx.closePath();
          ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        }
        if (isHover || n.kind === "theory" || view.k > 1.1) {
          ctx.font = (isHover ? "bold " : "") + "10px ui-sans-serif, system-ui";
          ctx.fillStyle = "#2c241a";
          ctx.textAlign = "center";
          var lbl = n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label;
          ctx.fillText(lbl, n.x, n.y - n.r - 4);
        }
      });
      ctx.restore();
    }

    function loop() {
      if (!running) return;
      step(); draw();
      raf = NS.requestAnimationFrame(loop);
    }
    loop();

    var onResize = function () { size(); };
    NS.addEventListener("resize", onResize);

    return {
      stop: function () {
        running = false;
        if (raf) NS.cancelAnimationFrame(raf);
        canvas.removeEventListener("mousedown", onDown);
        canvas.removeEventListener("mousemove", onMove);
        NS.removeEventListener("mouseup", onUp);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("touchstart", onDown);
        canvas.removeEventListener("touchmove", onMove);
        canvas.removeEventListener("touchend", onUp);
        NS.removeEventListener("resize", onResize);
      },
      hovered: function () { return hover; }
    };
  };
})();
