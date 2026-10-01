/* One Coast — the page.

   EXPEDITION: drag turns the world. Pick a tile from your hand; tap an
   empty cell beside the map and it appears there as a ghost, turned to make
   the fewest cliffs; tap the same cell again for the next turning; LAY
   places it. Teal dots mark every cell where the picked tile fits with no
   cliffs at all.

   ATELIER: one finger paints (land or sea brush), two fingers turn and
   zoom. "mappa" opens the world in the mappa engine; "play" turns any
   painted world into an expedition, with that world's coastline count as
   the par to match (one coastline is the perfect world, as ever). */
(function () {
  "use strict";
  var C = window.COAST, $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new C.View(cv), dirty = true;
  var mode = "expedition", ex = null, at = null, sel = 0, ghost = null, brush = 1, revealed = false;
  // mappa reads ?coast= once its own surface is redeployed with the landmask
  // hook (mappa/lib/coast-mask.js). Until then the live mappa would ignore the
  // coast and show some other world, so the button stays hidden.
  var MAPPA_READY = false;
  var SPHERE_LABEL = { c60: "C60 · 20 tiles", c80: "C80 · 30 tiles", c180: "C180 · 80 tiles", c240: "C240 · 110 tiles" };
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function recall(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function randomSeed() { var A = ["fuller", "geo", "dyma", "tensile", "octet", "dome", "synergy", "ephemeral"]; return A[Math.floor(Math.random() * A.length)] + "-" + Math.floor(100 + Math.random() * 900); }
  view.mode = recall("coast-view", "globe");

  /* ------------------------------------------------------------- the art */
  var artCache = new Map();
  function artFor(s, i, edges, centre) {
    var key = s.name + ":" + i + ":" + edges.join("") + centre;
    if (!artCache.has(key)) artCache.set(key, C.cellArt(s, i, edges, centre));
    return artCache.get(key);
  }
  function cliffSegments(s, placed) {
    var out = [];
    for (var i = 0; i < s.n; i++) {
      if (!placed[i]) continue;
      s.nbrs[i].forEach(function (j, side) {
        if (j < i || !placed[j]) return;
        if (placed[i].edges[side] === placed[j].edges[C.sideTo(s, j, i)]) return;
        var a = s.polys[i][side], b = s.polys[i][(side + 1) % s.polys[i].length];
        out.push([[s.verts[3 * a], s.verts[3 * a + 1], s.verts[3 * a + 2]], [s.verts[3 * b], s.verts[3 * b + 1], s.verts[3 * b + 2]]]);
      });
    }
    return out;
  }
  function scene() {
    if (mode === "expedition") {
      var s = ex.s, src = revealed ? ex.world : null;
      var art = s.polys.map(function (_, i) {
        if (src) return artFor(s, i, src.edges[i], src.centre[i]);
        var p = ex.placed[i]; return p ? artFor(s, i, p.edges, p.centre) : null;
      });
      view.st = { s: s, art: art, frontier: revealed ? null : ex.frontier(), cliffs: revealed ? [] : cliffSegments(s, ex.placed), ghost: revealed ? null : ghost, hints: (!revealed && ex.hand.length) ? ex.perfectSpots(sel) : null };
    } else {
      var w = at.world, s2 = at.s;
      view.st = { s: s2, art: s2.polys.map(function (_, i) { return artFor(s2, i, w.edges[i], w.centre[i]); }), cliffs: [] };
    }
    dirty = true;
  }

  /* ---------------------------------------------------------- expedition */
  var par = null; // set when an expedition comes from a painted world
  function newExpedition(sphere, seed, world, parCoasts) {
    mode = "expedition"; revealed = false; ghost = null; sel = 0;
    ex = new C.Expedition(sphere, seed, world ? { world: world } : null);
    par = parCoasts == null ? null : parCoasts;
    try { history.replaceState(null, "", "?mode=expedition&s=" + sphere + "&seed=" + encodeURIComponent(seed)); } catch (e) { /* file:// */ }
    store("coast-sphere", sphere);
    var P = ex.s.pos, p0 = 0; for (var i = 0; i < ex.s.n; i++) if (ex.s.pent[i]) { p0 = i; break; }
    view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.face([P[3 * p0], P[3 * p0 + 1], P[3 * p0 + 2]]);
    $("over").hidden = true;
    $("note").textContent = "pick a tile, tap a cell beside the map";
    ui(); scene();
  }
  function hand() {
    var box = $("hand"); box.innerHTML = "";
    ex.hand.forEach(function (key, h) {
      var c = document.createElement("canvas"), t = C.tileFromKey(key), dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = 72 * dpr; c.height = 72 * dpr; c.className = "tile" + (h === sel ? " sel" : "");
      var x = c.getContext("2d"); x.scale(dpr, dpr);
      C.drawFlat(x, 36, 36, 30, t.e, t.c, { selected: h === sel });
      c.onclick = function () { sel = h; ghost = null; ui(); scene(); };
      c.setAttribute("aria-label", "tile " + (h + 1)); c.setAttribute("role", "button");
      box.appendChild(c);
    });
  }
  function tapExpedition(cell) {
    if (revealed || !ex.hand.length || cell < 0) return;
    if (!ex.frontier().has(cell)) { $("note").textContent = cell >= 0 && ex.placed[cell] ? "that cell is built" : "lay tiles beside the map"; return; }
    var rots = ex.rotations(cell, sel);
    if (ghost && ghost.cell === cell) ghost.k = (ghost.k + 1) % rots.length; else ghost = { cell: cell, k: 0 };
    var r = rots[ghost.k], t = C.tileFromKey(ex.hand[sel]), edges = C.placedEdges(t, r.rot, t.e.length);
    ghost.rot = r.rot; ghost.cliffs = r.cliffs; ghost.art = C.cellArt(ex.s, cell, edges, t.c);
    $("note").textContent = r.cliffs.length ? r.cliffs.length + " cliff" + (r.cliffs.length > 1 ? "s" : "") + " · tap again to turn · LAY to place" : "fits clean · tap again to turn · LAY to place";
    ui(); scene();
  }
  function lay() {
    if (!ghost) return;
    var cl = ghost.cliffs.length;
    ex.place(sel, ghost.cell, ghost.rot);
    ghost = null; sel = Math.min(sel, Math.max(0, ex.hand.length - 1));
    var st = ex.status();
    var sealed = (st.sealedLand - (st.land === st.sealedLand ? 1 : 0)) + (st.sealedSea - (st.sea === st.sealedSea ? 1 : 0));
    $("note").textContent = cl ? cl + " cliff" + (cl > 1 ? "s" : "") + " — they join nothing" : sealed > 0 ? "something is sealed off: an island or a lake for good" : "laid";
    ui(); scene();
    if (ex.done()) finish();
  }
  function finish() {
    var st = ex.status(), perfect = st.coasts === 1 && st.cliffs === 0;
    var parLine = par == null ? "" : "<br>par for this painted world: <b>" + par + "</b> coastline" + (par > 1 ? "s" : "") + (st.coasts < par ? " — you beat it" : st.coasts === par && !st.cliffs ? " — matched, no cliffs" : st.coasts === par ? " — matched" : "");
    var key = "coast-best-" + ex.s.name, best = recall(key, null), score = st.coasts * 100 + st.cliffs;
    var isBest = !best || score < best; if (isBest) store(key, score);
    $("over-title").textContent = perfect ? "ONE COAST" : st.coasts === 1 ? "ONE COAST, SCARRED" : st.coasts + " COASTLINES";
    $("over-body").innerHTML = (perfect ? "One continent, one ocean, not a cliff on it. The world Fuller would have drawn."
      : "<b>" + st.land + "</b> land mass" + (st.land > 1 ? "es" : "") + ", <b>" + st.sea + "</b> sea" + (st.sea > 1 ? "s" : "") + " — so <b>" + st.coasts + "</b> coastline" + (st.coasts > 1 ? "s" : "") + ", and <b>" + st.cliffs + "</b> cliff" + (st.cliffs === 1 ? "" : "s") + "." + (par == null ? " A perfect world was in the bag from the start." : "")) + parLine +
      (isBest ? "<br><b>best on " + ex.s.name.toUpperCase() + "</b>" : "");
    setTimeout(function () { $("over").hidden = false; }, 600);
  }

  /* ------------------------------------------------------------- atelier */
  function newAtelier(sphere, seed, token) {
    mode = "atelier";
    at = new C.Atelier(sphere, seed, token);
    saveAtelier();
    $("over").hidden = true; ghost = null;
    $("note").textContent = "paint land or sea · two fingers turn";
    ui(); scene();
  }
  function saveAtelier() {
    var tok = at.token();
    try { history.replaceState(null, "", "?mode=atelier&w=" + tok); } catch (e) { /* file:// */ }
    store("coast-atelier", tok);
  }
  function paintAt(px, py) {
    var c = view.pick(px, py);
    if (c >= 0 && at.paint(c, brush)) {
      saveAtelier(); ui(); scene();
      var cs = at.census(); // say what the stroke did to the world's topology
      $("note").textContent = cs.coasts === 1 ? "one coastline — a perfect world" : cs.coasts + " coastlines: " + (cs.land > 1 ? (cs.land - 1) + " extra island" + (cs.land > 2 ? "s" : "") : "") + (cs.land > 1 && cs.sea > 1 ? ", " : "") + (cs.sea > 1 ? (cs.sea - 1) + " lake" + (cs.sea > 2 ? "s" : "") : "") + " · play it anyway: that's the par";
    }
  }

  /* ------------------------------------------------------------------ hud */
  function ui() {
    var exp = mode === "expedition";
    $("tab-ex").classList.toggle("on", exp); $("tab-at").classList.toggle("on", !exp);
    $("tray-ex").hidden = !exp; $("tray-at").hidden = exp;
    var s = exp ? ex.s : at.s;
    $("sphere").value = s.name;
    $("viewmode").textContent = view.mode === "whole" ? "◯ whole" : "◐ globe";
    if (exp) {
      var st = ex.status();
      $("stat").innerHTML = "<span><b>" + ex.left() + "</b> left</span><span><b>" + st.land + "</b> land</span><span><b>" + st.sea + "</b> sea</span><span><b>" + st.cliffs + "</b> cliffs</span>";
      hand();
      $("lay").disabled = !ghost; $("reveal").hidden = !ex.done();
      $("reveal").textContent = revealed ? "your world" : "Fuller's world";
    } else {
      var cs = at.census();
      $("stat").innerHTML = "<span><b>" + cs.land + "</b> land</span><span><b>" + cs.sea + "</b> sea</span><span><b>" + cs.coasts + "</b> coast" + (cs.coasts === 1 ? "" : "s") + "</span>";
      $("brush-land").classList.toggle("on", brush === 1); $("brush-sea").classList.toggle("on", brush === 0);
      $("play").disabled = false;
      $("play").textContent = cs.coasts === 1 ? "play it" : "play it · par " + cs.coasts;
      $("mappa").href = "https://mappa.mino.mobi/?coast=" + at.token();
      $("mappa").hidden = !MAPPA_READY;
    }
  }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), two = null, last = null, down = null, moved = false, turnTo = null;
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pair() { var a = Array.from(ptrs.values()); return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { var p2 = pair(); two = { d: p2.d, z: view.zoom, x: p2.x, y: p2.y }; down = null; return; }
    var p = local(e); last = { x: e.clientX, y: e.clientY }; moved = false; down = p;
    if (view.inInset(p.x, p.y)) { var m = view.unproject(p.x, p.y, view.inset()); if (m) turnTo = { p: m, left: 20 }; down = null; return; }
    if (mode === "atelier" && e.button !== 2) paintAt(p.x, p.y);
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (two && ptrs.size === 2) { var q = pair(); view.zoom = Math.max(0.7, Math.min(3, two.z * q.d / two.d)); view.drag(q.x - two.x, q.y - two.y); two.x = q.x; two.y = q.y; dirty = true; return; }
    if (!down) return;
    var p = local(e);
    if (Math.hypot(p.x - down.x, p.y - down.y) > 7) moved = true;
    if (mode === "atelier" && e.buttons !== 2) { paintAt(p.x, p.y); return; }
    if (moved) { view.drag(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; dirty = true; }
  });
  function up(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) two = null;
    if (ptrs.size) return;
    if (down && !moved && mode === "expedition") tapExpedition(view.pick(down.x, down.y));
    down = null;
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") lay();
    else if (e.key === "v") $("viewmode").click();
    else if (e.key >= "1" && e.key <= "3" && mode === "expedition" && ex.hand[+e.key - 1]) { sel = +e.key - 1; ghost = null; ui(); scene(); }
    else if (e.key.indexOf("Arrow") === 0) { var d = 0.15 * view.radius(), k = e.key.slice(5); view.drag(k === "Left" ? -d : k === "Right" ? d : 0, k === "Up" ? -d : k === "Down" ? d : 0); dirty = true; e.preventDefault(); }
  });

  $("tab-ex").onclick = function () { if (mode !== "expedition") newExpedition(recall("coast-sphere", "c80"), randomSeed()); };
  $("tab-at").onclick = function () { if (mode !== "atelier") { var tok = recall("coast-atelier", null); newAtelier(recall("coast-sphere", "c80"), randomSeed(), tok); } };
  $("sphere").onchange = function () { store("coast-sphere", this.value); if (mode === "expedition") newExpedition(this.value, randomSeed()); else newAtelier(this.value, randomSeed()); };
  $("viewmode").onclick = function () { view.mode = view.mode === "whole" ? "globe" : "whole"; store("coast-view", view.mode); ui(); dirty = true; };
  $("lay").onclick = lay;
  $("new").onclick = function () { newExpedition(ex.s.name, randomSeed()); };
  $("reveal").onclick = function () { revealed = !revealed; $("note").textContent = revealed ? "the perfect world that was in the bag" : "your world"; ui(); scene(); };
  $("again").onclick = function () { newExpedition(ex.s.name, randomSeed()); };
  $("look").onclick = function () { $("over").hidden = true; };
  $("brush-land").onclick = function () { brush = 1; ui(); };
  $("brush-sea").onclick = function () { brush = 0; ui(); };
  $("fresh").onclick = function () { newAtelier(at.s.name, randomSeed()); };
  $("play").onclick = function () { newExpedition(at.s.name, "atelier-" + at.token().slice(-8), JSON.parse(JSON.stringify(at.world)), at.census().coasts); };
  $("start-btn").onclick = function () { $("start").hidden = true; };

  function frame() {
    if (turnTo) { view.face(turnTo.p, 0.2); dirty = true; if (--turnTo.left <= 0) turnTo = null; }
    if (dirty) { view.draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  function fit() { view.resize(); dirty = true; }
  window.addEventListener("resize", fit);
  C._debug = { ex: function () { return ex; }, at: function () { return at; }, view: view, tap: tapExpedition, lay: lay, ghost: function () { return ghost; }, newExpedition: newExpedition };

  var q = new URLSearchParams(location.search);
  fit();
  if (q.get("mode") === "atelier" || q.get("w")) { $("start").hidden = true; newAtelier(recall("coast-sphere", "c80"), randomSeed(), q.get("w") || recall("coast-atelier", null)); }
  else {
    if (q.get("seed")) $("start").hidden = true;
    var sp = C.SPHERES.indexOf(q.get("s")) >= 0 ? q.get("s") : recall("coast-sphere", "c80");
    newExpedition(sp, q.get("seed") || randomSeed());
  }
  requestAnimationFrame(frame);
})();
