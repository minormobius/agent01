/* Twelve — the page.

   Swipe across the ball: the drain furthest that way glows, an arrow runs
   to it, and letting go pours every tile toward it. Tap a drain to pour
   toward that one (the only way to choose the drain dead centre).
   A finger that lands off the globe turns it; two fingers turn and zoom;
   the corner map turns to where you tap. ✥ turn mode makes one finger
   turn and leaves drains to taps. After each pour the ball rolls to put
   that drain in the middle, so the pile is always in plain view. */
(function () {
  "use strict";
  var T = window.TWELVE, $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new T.View(cv), game = null, dirty = true, prevBest = 0;
  function load_(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save_(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  var turnMode = !!load_("twelve-turn", false);
  view.mode = load_("twelve-view", "whole") === "globe" ? "globe" : "whole";
  function randomSeed() { return Math.random().toString(36).slice(2, 8); }

  function start(mode, seed, restore) {
    game = (restore && T.Game.restore(restore)) || new T.Game(mode, seed);
    view.game = game; view.anim = null; view.aim = -1;
    $("mode").value = game.key; save_("twelve-mode", game.key);
    view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.zoom = 1;
    var D = game.env.drains[0]; view.face(view.centreOf(D.p)); view.drag(view.radius() * 0.35, -view.radius() * 0.25);
    prevBest = game.best();
    $("over").hidden = true;
    note(game.canMove() ? "swipe toward a drain · or tap one" : "", "");
    persist(); hud(); dirty = true;
    if (!game.canMove()) finish();
  }
  function persist() { save_("twelve-game-" + game.key, game.save()); }
  function bestScore() { return load_("twelve-best-" + game.key, 0); }
  function note(t, cls) { var n = $("note"); n.textContent = t; n.className = cls || ""; }
  function hud() {
    $("score").textContent = game.score; $("best").textContent = Math.max(bestScore(), game.score);
    $("top").textContent = game.best(); $("moves").textContent = game.moves;
    $("turn").textContent = turnMode ? "✥ turn" : "↘ pour"; $("turn").classList.toggle("on", turnMode);
    $("viewmode").textContent = view.mode === "whole" ? "◯ whole" : "◐ globe"; $("viewmode").classList.toggle("on", view.mode === "whole");
    $("foot").textContent = turnMode ? "one finger turns · tap a drain to pour · two fingers zoom"
      : "swipe toward a drain to pour · tap a drain · drag off the ball or use two fingers to turn";
    dirty = true;
  }
  function pour(w) {
    if (w < 0 || !game || view.busy()) return;
    var before = game.g.slice(), r = game.move(w);
    if (!r) { note("nothing moves that way", "warn"); return; }
    var merged = new Set(); r.trails.forEach(function (t) { if (t.merge) merged.add(t.path[t.path.length - 1]); });
    view.anim = { before: before, trails: r.trails, merged: merged, spawned: new Set(r.spawned), t0: Date.now() };
    // once the tiles land, roll the ball so the drain they piled on comes to the centre:
    // the pile is always where the projection is truest, and the next swipe reads from there
    turnTo = { p: view.centreOf(game.env.drains[w].p), left: 22, wait: view.SLIDE + view.POP };
    if (game.score > bestScore()) save_("twelve-best-" + game.key, game.score);
    var top = game.best();
    if (top >= 2048 && prevBest < 2048) note("2048! keep pouring", "gold");
    else if (top > prevBest && top >= 128) note("new high tile: " + top, "good");
    else note(r.score ? "+" + r.score : "", "good");
    prevBest = Math.max(prevBest, top);
    persist(); hud();
    if (!game.canMove()) setTimeout(finish, view.SLIDE + view.POP + 300);
  }
  function finish() {
    $("over-title").textContent = game.best();
    var b = bestScore();
    $("over-body").innerHTML = "<b>" + game.score + "</b> points in <b>" + game.moves + "</b> moves on " + game.s.name.toUpperCase() + ". Every drain is blocked." +
      (game.score >= b ? "<br><b>best on " + game.s.name.toUpperCase() + "</b>" : "<br>best: " + b);
    $("over").hidden = false;
  }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), two = null, last = null, start0 = null, turning = false, swiping = false, moved = false, turnTo = null;
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pair() { var a = Array.from(ptrs.values()); return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    if (!game) return;
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { swiping = false; turning = false; view.aim = -1; view.preview = null; view.swipe = null; var p2 = pair(); two = { d: p2.d, z: view.zoom, x: p2.x, y: p2.y }; dirty = true; return; }
    if (ptrs.size > 2) return;
    var p = local(e); start0 = p; last = { x: e.clientX, y: e.clientY }; moved = false;
    if (view.inInset(p.x, p.y)) { var m = view.unproject(p.x, p.y, view.inset()); if (m) turnTo = { p: m, left: 20 }; start0 = null; return; }
    var onBall = !!view.unproject(p.x, p.y);
    swiping = onBall && !turnMode; turning = !swiping;
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (two && ptrs.size === 2) { var q = pair(); view.zoom = Math.max(0.7, Math.min(3, two.z * q.d / two.d)); view.drag(q.x - two.x, q.y - two.y); two.x = q.x; two.y = q.y; dirty = true; return; }
    if (!start0) return;
    var p = local(e);
    if (Math.hypot(p.x - start0.x, p.y - start0.y) > 14) moved = true;
    if (swiping && moved) {
      var aim = view.drainToward(p.x - start0.x, p.y - start0.y);
      if (aim !== view.aim) { view.aim = aim; view.preview = aim >= 0 ? game.preview(aim) : null; }
      view.swipe = { x0: start0.x, y0: start0.y }; dirty = true;
    }
    else if (turning && moved) { view.drag(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; dirty = true; }
    else if (turning) last = { x: e.clientX, y: e.clientY };
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) two = null;
    if (ptrs.size) return;
    if (start0 && !moved) pour(view.drainAt(start0.x, start0.y));      // a tap: on a drain, pour there
    else if (swiping && view.aim >= 0) pour(view.aim);
    swiping = turning = false; view.aim = -1; view.preview = null; view.swipe = null; start0 = null; dirty = true;
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
  document.addEventListener("keydown", function (e) {
    if (e.key === "v") $("viewmode").click();
    else if (e.key === "t") $("turn").click();
    else if (e.key.indexOf("Arrow") === 0) { // arrows pour, shift+arrows turn
      var k = e.key.slice(5), dx = k === "Left" ? -1 : k === "Right" ? 1 : 0, dy = k === "Up" ? -1 : k === "Down" ? 1 : 0;
      if (e.shiftKey) { var d = 0.15 * view.radius(); view.drag(dx * d, dy * d); dirty = true; } else pour(view.drainToward(dx, dy));
      e.preventDefault();
    }
  });

  $("turn").onclick = function () { turnMode = !turnMode; save_("twelve-turn", turnMode); hud(); };
  $("viewmode").onclick = function () { view.mode = view.mode === "whole" ? "globe" : "whole"; save_("twelve-view", view.mode); hud(); };
  $("new").onclick = function () { start($("mode").value, randomSeed()); };
  $("again").onclick = function () { start(game.key, randomSeed()); };
  $("look").onclick = function () { $("over").hidden = true; };
  $("mode").onchange = function () { var k = this.value; start(k, randomSeed(), load_("twelve-game-" + k, null)); };
  $("start-btn").onclick = function () { $("start").hidden = true; save_("twelve-seen", true); };

  function frame() {
    if (turnTo && turnTo.wait && view.anim && Date.now() - view.anim.t0 < turnTo.wait) { /* let the pour land first */ }
    else if (turnTo) { view.face(turnTo.p, 0.18); dirty = true; if (--turnTo.left <= 0) turnTo = null; }
    if (view.anim) { dirty = true; if (!view.busy()) view.anim = null; }
    if (dirty) { view.draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  function fit() { view.resize(); dirty = true; }
  window.addEventListener("resize", fit);
  T._debug = { game: function () { return game; }, view: view, pour: pour, start: start };

  var q = new URLSearchParams(location.search), mode = q.get("m") || load_("twelve-mode", "c60");
  if (!T.MODES[mode]) mode = "c60";
  if (load_("twelve-seen", false) || q.get("seed")) $("start").hidden = true;
  fit();
  if (q.get("seed")) start(mode, q.get("seed"));
  else start(mode, randomSeed(), load_("twelve-game-" + mode, null));
  requestAnimationFrame(frame);
})();
