/* Strand — the page.

   One finger lands on an end or a strand: it draws. Anywhere else it turns
   the sphere, unless the VIEW LOCK is on, in which case one finger only
   ever draws. Two fingers always turn (drag) and zoom (pinch), locked or
   not, so the lock costs nothing.

   Seeing the whole sphere: the inset (top right) is the whole sphere in an
   equal-area azimuthal projection, centred where you're looking, with the
   near half ringed; tap it to turn there. The "whole" view puts that
   projection on the main canvas, where you can play on all of it at once.
   While drawing on the globe (unlocked), holding near the rim turns the
   sphere under your finger. A tap without a drag on an end clears its half;
   on a loose piece it deletes the piece. */
(function () {
  "use strict";
  var S = window.STRAND, $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new S.View(cv), game = null, idx = 0, dirty = true;
  var solvedSet = new Set(), locked = false;
  function load_(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save_(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  load_("strand-solved", []).forEach(function (i) { solvedSet.add(i); });
  locked = !!load_("strand-lock", false);
  view.mode = load_("strand-view", "globe") === "whole" ? "whole" : "globe";

  function load(i) {
    idx = Math.max(0, Math.min(S.LEVELS.length - 1, i));
    game = new S.Game(S.LEVELS[idx]);
    view.game = game;
    var p0 = game.level.pairs[0][0], c = game.cellOf[p0];
    view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.zoom = 1; view.cam = null; view.towardCell(c, 1);
    try { history.replaceState(null, "", "?level=" + (idx + 1)); } catch (e) { /* file:// */ }
    $("won").hidden = true;
    hud(); dirty = true;
  }

  function hud() {
    var lv = game.level, b = game.board;
    $("lvl").textContent = (idx + 1) + " · " + lv.title;
    $("kind").textContent = b.name + " · " + lv.pairs.length + " colours" + (lv.walls.length ? " · " + lv.walls.length + " wall" + (lv.walls.length > 1 ? "s" : "") : "") + (lv.bridges.length ? " · " + lv.bridges.length + " bridge" + (lv.bridges.length > 1 ? "s" : "") : "");
    $("joined").textContent = game.joined() + "/" + lv.pairs.length;
    $("painted").textContent = Math.round(100 * game.painted() / game.g.n) + "%";
    $("prev").disabled = idx === 0; $("next").disabled = idx === S.LEVELS.length - 1;
    $("lock").classList.toggle("on", locked); $("lock").setAttribute("aria-pressed", String(locked));
    $("lock").textContent = locked ? "🔒 locked" : "🔓 free";
    var tor = b.topology === "torus";
    $("viewmode").textContent = view.mode === "whole" ? (tor ? "▭ flat" : "◯ whole") : (tor ? "◎ donut" : "◐ globe");
    $("viewmode").classList.toggle("on", view.mode === "whole");
  }

  function check() {
    hud(); dirty = true;
    if (game.solved()) {
      solvedSet.add(idx); save_("strand-solved", Array.from(solvedSet));
      $("won-body").textContent = "Every cell painted, every pair joined, and it was the only way. " + game.moves + " moves.";
      $("won-next").hidden = idx === S.LEVELS.length - 1;
      setTimeout(function () { $("won").hidden = false; }, 400);
    }
  }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), drawing = false, turning = false, two = null, last = null, lastPick = -1, pointer = null;
  var startCell = -1, moved = false, turnTo = null;
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pair() { var a = Array.from(ptrs.values()); return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }

  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {          // second finger: whatever the first was doing becomes turn + zoom
      if (drawing) { game.end(); drawing = false; check(); }
      turning = false; var p2 = pair(); two = { d: p2.d, z: view.zoom, x: p2.x, y: p2.y }; return;
    }
    if (ptrs.size > 2) return;
    var p = local(e);
    pointer = p; last = { x: e.clientX, y: e.clientY }; moved = false;
    if (view.inInset(p.x, p.y)) {   // tap the inset: turn there
      if (view.torus()) { turnTo = { p: view.insetPoint(p.x, p.y), left: 20 }; return; }
      var vp = view.inset(), m = view.unproject(p.x, p.y, vp);
      if (m) turnTo = { p: m, left: 20 };
      return;
    }
    var c = view.pick(p.x, p.y);
    if (c >= 0 && game.begin(c) >= 0) { drawing = true; lastPick = c; startCell = c; check(); }
    else turning = !locked;
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (two && ptrs.size === 2) {
      var q = pair();
      view.zoom = Math.max(0.7, Math.min(3, two.z * q.d / two.d));
      view.drag(q.x - two.x, q.y - two.y); two.x = q.x; two.y = q.y;
      dirty = true; return;
    }
    pointer = local(e);
    if (drawing) { follow(); return; }
    if (turning) { view.drag(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; dirty = true; }
  });
  function follow() {
    var c = view.pick(pointer.x, pointer.y);
    if (c < 0 || c === lastPick) return;
    lastPick = c;
    if (game.extend(c) || game.reach(c, 3)) { moved = true; check(); }
  }
  function up(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) two = null;
    if (ptrs.size) return;
    if (drawing) {
      game.end(); drawing = false;
      if (!moved) game.tap(startCell);
      check();
    }
    turning = false; pointer = null;
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
  document.addEventListener("keydown", function (e) {
    if (e.key === "l") $("lock").click();
    else if (e.key === "v") $("viewmode").click();
    else if (e.key.indexOf("Arrow") === 0) {
      var d = 0.15 * view.radius(), k = e.key.slice(5);
      view.drag(k === "Left" ? -d : k === "Right" ? d : 0, k === "Up" ? -d : k === "Down" ? d : 0); dirty = true; e.preventDefault();
    }
  });

  $("prev").onclick = function () { load(idx - 1); };
  $("next").onclick = function () { load(idx + 1); };
  $("reset").onclick = function () { game.reset(); check(); };
  $("lock").onclick = function () { locked = !locked; save_("strand-lock", locked); hud(); };
  $("viewmode").onclick = function () { view.mode = view.mode === "whole" ? "globe" : "whole"; save_("strand-view", view.mode); hud(); dirty = true; };
  $("won-next").onclick = function () { load(idx + 1); };
  $("won-stay").onclick = function () { $("won").hidden = true; };
  $("levels-btn").onclick = function () { menu(); $("levels").hidden = false; };
  $("levels-close").onclick = function () { $("levels").hidden = true; };
  $("start-btn").onclick = function () { $("start").hidden = true; };

  function menu() {
    var list = $("level-list"); list.innerHTML = "";
    S.LEVELS.forEach(function (lv, i) {
      var bt = document.createElement("button");
      bt.type = "button"; bt.className = "lv" + (solvedSet.has(i) ? " done" : "") + (i === idx ? " here" : "");
      bt.innerHTML = "<b>" + (i + 1) + "</b><span></span>";
      bt.querySelector("span").textContent = lv.title;
      bt.onclick = function () { $("levels").hidden = true; load(i); };
      list.appendChild(bt);
    });
  }

  /* ----------------------------------------------------------------- loop */
  function frame() {
    if (turnTo) { view.towardPoint(turnTo.p, 0.2); dirty = true; if (--turnTo.left <= 0) turnTo = null; }
    // drawing near the globe's rim (unlocked): turn so the finger's point comes round
    if (drawing && pointer && !locked && view.mode === "globe") {
      var dx = view.w / 2 - pointer.x, dy = view.h / 2 - pointer.y, r = view.radius(), d = Math.hypot(dx, dy);
      if (d > r * 0.68) { var k = Math.min(1, (d - r * 0.68) / (r * 0.3)) * 4 / d; view.drag(dx * k, dy * k); dirty = true; follow(); }
    }
    if (dirty) { view.draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  function fit() { view.resize(); dirty = true; }
  window.addEventListener("resize", fit);
  S._debug = { game: function () { return game; }, view: view, load: load };

  var q = new URLSearchParams(location.search), start = parseInt(q.get("level") || "", 10);
  if (!(start >= 1)) { start = 1; while (solvedSet.has(start - 1) && start < S.LEVELS.length) start++; }
  else $("start").hidden = true;
  fit(); load(start - 1);
  requestAnimationFrame(frame);
})();
