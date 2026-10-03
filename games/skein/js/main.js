/* Skein — the page.

   Two ways to hold the ball, as in /strand/:
     ✎ trace (default)  one finger on a letter traces; letting go submits.
     ✥ turn             one finger turns; taps pick letters one by one,
                        and tapping the last letter again submits.
   In both: a finger that lands off the globe (or on a spent tile) turns
   it, two fingers turn and zoom, the corner map turns to where you tap,
   and tracing near the globe's rim rolls the sphere under your finger.

   Puzzles are made in the page from a seed (gen.js proves each has one
   answer, in milliseconds), so the daily ball is the date and a link is
   the puzzle: ?s=c180&t=4&seed=… */
(function () {
  "use strict";
  var K = window.SKEIN, $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new K.View(cv), game = null, dirty = true, dict = null, pid = null, daily = true;
  function load_(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save_(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  var locked = load_("skein-lock", true);
  view.mode = load_("skein-view", "globe") === "whole" ? "whole" : "globe";

  /* --------------------------------------------------------------- puzzles */
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function dayNumber() { var d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function dailyTheme() { return (dayNumber() * 7) % K.THEMES.length; } // 7 is coprime with the pack size, so every theme comes round
  function randomSeed() { return Math.random().toString(36).slice(2, 8); }

  function open(sphere, t, seed, isDaily) {
    var board = null, s2 = seed;
    for (var k = 0; k < 6 && !board; k++) { board = K.generate(K.THEMES[t], sphere, s2); if (!board) s2 = seed + "'".repeat(k + 1); }
    if (!board) { $("note").textContent = "couldn't wind that one — try another"; return; }
    daily = !!isDaily;
    game = new K.Game(board, dict); view.game = game;
    pid = sphere + "." + t + "." + seed;
    game.restore(load_("skein:" + pid, null));
    try { history.replaceState(null, "", isDaily ? "?s=" + sphere : "?s=" + sphere + "&t=" + t + "&seed=" + encodeURIComponent(seed)); } catch (e) { /* file:// */ }
    save_("skein-sphere", sphere);
    $("sphere").value = sphere;
    // a torus opens on the flat map (no back to hide half a word on); the donut is a tap away. Remembered per kind
    view.mode = game.s.torus ? (load_("skein-tview", "whole") === "globe" ? "globe" : "whole") : (load_("skein-view", "globe") === "whole" ? "whole" : "globe");
    view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.zoom = 1;
    if (game.s.torus) view.toward(view.centreOf(board.poles[0]), 1);
    else { view.face(view.centreOf(board.poles[0])); view.drag(0, -view.radius() * 0.5); }
    $("over").hidden = true;
    note(game.done() ? "wound — every word found" : game.s.torus ? "trace a word · the span runs between the ringed tiles, half way round" : "trace a word · the span runs pole to pole", "");
    hud(); dirty = true;
    if (game.done()) finish(true);
  }

  /* ------------------------------------------------------------------ hud */
  function note(text, cls) { var n = $("note"); n.textContent = text; n.className = cls || ""; }
  function hud() {
    if (!game) return;
    $("daily").classList.toggle("on", daily); $("new").classList.toggle("on", !daily);
    $("clue-text").textContent = game.board.clue;
    var sp = game.words.findIndex(function (w) { return w.span; });
    $("found").textContent = game.found.size; $("total").textContent = game.words.length;
    var got = game.found.has(sp);
    $("span-state").textContent = got ? "span: " + game.words[sp].w : "span hidden";
    $("span-state").classList.toggle("got", got);
    $("word").textContent = game.word() || " ";
    var left = game.hintsLeft(), can = left > 0 && !game.done() && (game.hint < 0 || game.hintLevel === 1);
    $("hint").disabled = !can && !(left <= 0);
    $("hint").classList.toggle("ready", can);
    $("hint-label").textContent = left > 0 ? "hint ×" + left : "hint";
    var on = left > 0 ? 3 : game.towardHint();
    Array.prototype.forEach.call($("hint-meter").children, function (u, i) { u.classList.toggle("on", i < on); });
    $("enter").disabled = game.sel.length < 4;
    $("lock").textContent = locked ? "✎ trace" : "✥ turn"; $("lock").setAttribute("aria-pressed", String(locked));
    $("lock").classList.toggle("on", !locked);
    var tor = game.s.torus;
    $("viewmode").textContent = view.mode === "whole" ? (tor ? "▭ flat" : "◯ whole") : (tor ? "◎ donut" : "◐ globe"); $("viewmode").classList.toggle("on", view.mode === "whole");
    $("foot").textContent = locked ? "drag across letters to trace · two fingers turn and zoom · tap the corner map to look there"
      : "one finger turns · tap letters, tap the last again to enter · two fingers zoom";
    dirty = true;
  }
  function persist() { if (pid) save_("skein:" + pid, game.save()); }

  var MSG = {
    found: ["", "good"], span: ["the span! ", "gold"], "wrong-place": ["right word — wrong place", "warn"], again: ["already found", ""],
    extra: ["", "good"], "extra-again": ["already counted", ""], short: ["four letters or more", ""], unknown: ["not in the word list", "warn"], unchecked: ["word list still loading", ""]
  };
  function submit() {
    if (!game || !game.sel.length) return;
    var cells = game.sel.slice(), r = game.submit(), m = MSG[r.kind];
    if (r.kind === "found") note(r.word + " ✓", "good");
    else if (r.kind === "span") note("the span: " + r.word, "gold");
    else if (r.kind === "extra") note(r.word + " · " + (game.towardHint() === 0 ? "hint earned" : game.towardHint() + "/3 toward a hint"), "good");
    else note((r.word.length ? r.word + " · " : "") + m[0], m[1]);
    var col = r.kind === "found" ? [126, 186, 255] : r.kind === "span" ? [255, 206, 104] : r.kind === "extra" ? [126, 186, 255] : [255, 110, 90];
    if (r.kind !== "found" && r.kind !== "span") view.flash = { cells: new Set(cells), color: col, until: Date.now() + 450 };
    persist(); hud();
    if (game.done()) finish(false);
  }
  function finish(quiet) {
    var sp = game.words.find(function (w) { return w.span; }), h = game.hintsUsed;
    $("over-title").textContent = sp.w;
    var on = game.s.torus ? "a " + game.s.mesh.rows + "×" + game.s.mesh.cols + " torus" : game.s.name.toUpperCase();
    $("over-body").innerHTML = "<b>" + game.board.clue + "</b> — " + game.words.length + " words, " + game.s.n + " letters on " + on + ".<br>" +
      (h === 0 ? "<b>No hints.</b> " : "<b>" + h + "</b> hint" + (h > 1 ? "s" : "") + ". ") + "<b>" + game.extras.size + "</b> word" + (game.extras.size === 1 ? "" : "s") + " of your own along the way." +
      (daily ? "<br>Today's " + (game.s.torus ? "torus" : game.s.name.toUpperCase()) + " is wound. A new " + (game.s.torus ? "one" : "ball") + " tomorrow." : "");
    if (!quiet) setTimeout(function () { $("over").hidden = false; }, 700);
  }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), two = null, last = null, pointer = null, turnTo = null;
  var drawing = false, turning = false, moved = false, lastPick = -1, wasLast = false, downCell = -1, downAt = null;
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pair() { var a = Array.from(ptrs.values()); return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    if (!game) return;
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { drawing = false; turning = false; var p2 = pair(); two = { d: p2.d, z: view.zoom, x: p2.x, y: p2.y }; return; }
    if (ptrs.size > 2) return;
    var p = local(e); pointer = p; last = { x: e.clientX, y: e.clientY }; moved = false; downAt = p;
    if (view.inInset(p.x, p.y)) { var m = view.insetPoint(p.x, p.y); if (m) turnTo = { p: m, left: 20 }; downCell = -1; return; }
    var c = view.pick(p.x, p.y); downCell = c;
    var n = game.sel.length; wasLast = n > 0 && game.sel[n - 1] === c;
    if (locked && c >= 0 && game.free(c)) {
      drawing = true; lastPick = c;
      if (!wasLast) game.step(c);
      hud();
    } else turning = true;
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (two && ptrs.size === 2) {
      var q = pair();
      view.zoom = Math.max(0.7, Math.min(3.2, two.z * q.d / two.d));
      view.drag(q.x - two.x, q.y - two.y); two.x = q.x; two.y = q.y; dirty = true; return;
    }
    pointer = local(e);
    if (downAt && Math.hypot(pointer.x - downAt.x, pointer.y - downAt.y) > 8) moved = true;
    if (drawing) { follow(); return; }
    if (turning && moved) { view.drag(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; dirty = true; }
    else if (turning) last = { x: e.clientX, y: e.clientY };
  });
  function follow() {
    var c = view.pick(pointer.x, pointer.y, 0.3);
    if (c < 0 || c === lastPick) return;
    lastPick = c;
    if (game.free(c) && game.step(c)) hud();
  }
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) two = null;
    if (ptrs.size) return;
    if (drawing) {
      drawing = false;
      if (moved && game.sel.length >= 2) submit();
      else if (!moved && wasLast) submit();
    } else if (turning && !moved && downCell >= 0 && game.free(downCell)) { // a tap: pick a letter
      if (wasLast) submit(); else { game.step(downCell); hud(); }
    }
    turning = false; pointer = null; downAt = null;
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(3.2, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
  document.addEventListener("keydown", function (e) {
    if (!game) return;
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") { game.clear(); hud(); }
    else if (e.key === "Backspace") { game.sel.pop(); hud(); }
    else if (e.key === "l") $("lock").click();
    else if (e.key === "v") $("viewmode").click();
    else if (e.key.indexOf("Arrow") === 0) {
      var d = 0.15 * view.radius(), k = e.key.slice(5);
      view.drag(k === "Left" ? -d : k === "Right" ? d : 0, k === "Up" ? -d : k === "Down" ? d : 0); dirty = true; e.preventDefault();
    }
  });

  $("enter").onclick = submit;
  $("clear").onclick = function () { game.clear(); note("", ""); hud(); };
  $("hint").onclick = function () {
    if (!game) return;
    if (game.hintsLeft() <= 0) { note("find " + (3 - game.towardHint()) + " more word" + (3 - game.towardHint() === 1 ? "" : "s") + " of your own (4+ letters) to earn a hint", ""); return; }
    if (game.useHint()) {
      var W = game.words[game.hint]; turnTo = { p: view.centreOf(W.cells[0]), left: 24 };
      note(game.hintLevel === 2 ? "numbered: trace it in order" : "ringed: a theme word" + (W.span ? " — the span" : "") + " · hint again to number it", "good");
      persist(); hud();
    }
  };
  $("lock").onclick = function () { locked = !locked; save_("skein-lock", locked); hud(); };
  $("viewmode").onclick = function () { view.mode = view.mode === "whole" ? "globe" : "whole"; save_(game && game.s.torus ? "skein-tview" : "skein-view", view.mode); hud(); };
  $("daily").onclick = function () { open($("sphere").value, dailyTheme(), "daily-" + today(), true); };
  function fresh() { var t; do { t = Math.floor(Math.random() * K.THEMES.length); } while (game && K.THEMES[t].clue === game.board.clue && K.THEMES.length > 1); open($("sphere").value, t, randomSeed(), false); }
  $("new").onclick = fresh;
  $("again").onclick = fresh;
  $("look").onclick = function () { $("over").hidden = true; };
  $("sphere").onchange = function () { if (daily) open(this.value, dailyTheme(), "daily-" + today(), true); else fresh(); };
  $("start-btn").onclick = function () { $("start").hidden = true; save_("skein-seen", true); };

  /* ----------------------------------------------------------------- loop */
  function frame() {
    if (turnTo) { view.toward(turnTo.p, 0.2); dirty = true; if (--turnTo.left <= 0) turnTo = null; }
    if (drawing && pointer && view.mode === "globe") { // tracing near the rim rolls the sphere toward you
      // (the donut is wider than the ball: there, only near the screen's edge)
      var dx = view.w / 2 - pointer.x, dy = view.h / 2 - pointer.y, r = game.s.torus ? Math.min(view.w, view.h) * 0.5 : view.radius(), d = Math.hypot(dx, dy), r0 = game.s.torus ? 0.85 : 0.7;
      if (d > r * r0) { var k = Math.min(1, (d - r * r0) / (r * (1 - r0))) * 3.5 / d; view.drag(dx * k, dy * k); dirty = true; follow(); }
    }
    if (view.flash) { dirty = true; if (view.flash.until < Date.now()) view.flash = null; }
    if (dirty) { view.draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  function fit() { view.resize(); dirty = true; }
  window.addEventListener("resize", fit);
  K._debug = { game: function () { return game; }, view: view, open: open, submit: submit };

  // the word list arrives after the first paint; until then extras can't be checked
  fetch("dict/words.txt").then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); }).then(function (txt) {
    dict = new Set(txt.split("\n")); if (game) game.dict = dict;
  }).catch(function () { /* hints just never accrue */ });

  var q = new URLSearchParams(location.search), sph = q.get("s") || load_("skein-sphere", "c80");
  if (!/^(c(80|180|240)|t(32|72|128))$/.test(sph)) sph = "c80";
  if (load_("skein-seen", false) || q.get("seed")) $("start").hidden = true;
  fit();
  if (q.get("seed") && q.get("t") != null && K.THEMES[+q.get("t")]) open(sph, +q.get("t"), q.get("seed"), false);
  else open(sph, dailyTheme(), "daily-" + today(), true);
  requestAnimationFrame(frame);
})();
