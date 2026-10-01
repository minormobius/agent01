/* Strand — the page.

   One finger does two jobs, decided by where it lands. On an end or a
   strand it draws; anywhere else it turns the sphere. While drawing, holding
   near the rim turns the sphere under your finger, so a strand can be
   carried round to the far side without letting go. Pinch or wheel zooms.
   Progress (which levels are solved) lives in localStorage. */
(function () {
  "use strict";
  var S = window.STRAND, $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new S.View(cv), game = null, idx = 0, dirty = true;
  var solvedSet = new Set();
  try { (JSON.parse(localStorage.getItem("strand-solved") || "[]")).forEach(function (i) { solvedSet.add(i); }); } catch (e) { /* private mode */ }
  function save() { try { localStorage.setItem("strand-solved", JSON.stringify(Array.from(solvedSet))); } catch (e) { /* ignore */ } }

  function load(i) {
    idx = Math.max(0, Math.min(S.LEVELS.length - 1, i));
    game = new S.Game(S.LEVELS[idx]);
    view.game = game;
    var p0 = game.level.pairs[0][0], P = game.board.pos, c = game.cellOf[p0];
    view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.face([P[3 * c], P[3 * c + 1], P[3 * c + 2]]); view.zoom = 1;
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
  }

  function check() {
    hud(); dirty = true;
    if (game.solved()) {
      solvedSet.add(idx); save();
      $("won-body").textContent = "Every cell painted, every pair joined, and it was the only way. " + game.moves + " moves.";
      $("won-next").hidden = idx === S.LEVELS.length - 1;
      setTimeout(function () { $("won").hidden = false; }, 400);
    }
  }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), drawing = false, turning = false, pinch = null, last = null, lastPick = -1, pointer = null;
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      if (drawing) { game.end(); drawing = false; check(); }
      var a = Array.from(ptrs.values()); pinch = { d: dist(a[0], a[1]), z: view.zoom }; turning = false; return;
    }
    var p = local(e), c = view.pick(p.x, p.y);
    pointer = p; last = { x: e.clientX, y: e.clientY };
    if (c >= 0 && game.begin(c) >= 0) { drawing = true; lastPick = c; check(); }
    else turning = true;
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { var a = Array.from(ptrs.values()); view.zoom = Math.max(0.7, Math.min(3, pinch.z * dist(a[0], a[1]) / pinch.d)); dirty = true; return; }
    pointer = local(e);
    if (drawing) { follow(); return; }
    if (turning) { view.drag(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; dirty = true; }
  });
  function follow() {
    var c = view.pick(pointer.x, pointer.y);
    if (c < 0 || c === lastPick) return;
    lastPick = c;
    if (game.extend(c) || game.reach(c, 3)) check();
  }
  function up(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size) return;
    if (drawing) { game.end(); drawing = false; check(); }
    turning = false; pointer = null;
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });

  $("prev").onclick = function () { load(idx - 1); };
  $("next").onclick = function () { load(idx + 1); };
  $("reset").onclick = function () { game.reset(); check(); };
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
    // drawing near the rim: turn the sphere so the finger's point comes round
    if (drawing && pointer) {
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
