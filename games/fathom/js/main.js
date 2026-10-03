/* Fathom — the controller.

   Orb's controls (../orb/js/main.js), one dimension up. One finger turns the
   sea about its centre; a press that doesn't move is a move: tap flags,
   hold digs (the mode button swaps them; the first tap always digs). Two
   fingers pinch through the shells: spread to dive, pinch to rise. The
   wheel, ▲ ▼ and w / s do the same.

   Two goals. DIVE: open any cell of the innermost shell and you've reached
   the core. CLEAR: every safe cell. Either way every sea is proved
   clearable by deduction from the first tap, and the readout counts the
   moves that weren't certain when you made them. */
(function () {
  "use strict";
  var O = window.ORB, F = window.FATHOM, SIZES = F.SIZES;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new F.View(cv);
  var game = null, tapDigs = false, dirty = true, spin = { x: 0, y: 0 }, idle = 0, goal = "dive", depthTo = null, turning = null;
  try { goal = localStorage.getItem("fathom-goal") === "clear" ? "clear" : "dive"; } catch (e) { /* private mode */ }

  function params() {
    var q = new URLSearchParams(location.search);
    if (q.get("goal") === "clear" || q.get("goal") === "dive") goal = q.get("goal");
    return { seed: q.get("seed") || O.randomSeed(), size: SIZES[q.get("size")] ? q.get("size") : "deep" };
  }
  function setURL() { try { history.replaceState(null, "", "?seed=" + encodeURIComponent(game.seed) + "&size=" + game.size + "&goal=" + goal); } catch (e) { /* file:// */ } }

  function newGame(seed, size) {
    var c = SIZES[size], mesh = F.build(size, seed), s = O.newState(mesh, c.m);
    game = { seed: seed, size: size, s: s, guesses: 0, hints: 0, deepest: 0 };
    view.state = s; view.anim = {}; view.mark = null; view.hl = null; view.depth = 0; depthTo = null;
    setURL(); $("seed").textContent = seed; $("size").value = size; $("over").hidden = true;
    $("note").textContent = "tap any cell — the first is always clear";
    gauge(); hud(); dirty = true;
  }
  function hud() {
    var s = game.s;
    $("mines").textContent = String(s.nMines - s.flags);
    $("guesses").textContent = String(game.guesses);
    $("time").textContent = clock(s.phase === "play" ? Date.now() - s.t0 : s.t1 ? s.t1 - s.t0 : 0);
    $("depth").textContent = (Math.round(view.depth) + 1) + "/" + s.mesh.K;
    $("mode").textContent = tapDigs ? "tap: ⛏ dig" : "tap: ⚑ flag"; $("mode").classList.toggle("on", tapDigs);
    $("goal").textContent = goal === "dive" ? "DIVE" : "CLEAR"; $("goal").classList.toggle("on", goal === "clear");
  }
  function clock(ms) { var t = Math.floor(ms / 1000); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  /* The depth gauge: a dot per shell (where you are, how deep you've opened) and the core. */
  function gauge() {
    var m = game.s.mesh, el = $("gauge"), html = "";
    for (var k = 0; k < m.K; k++) html += '<i class="' + (k <= game.deepest && game.s.phase !== "ready" ? "reached " : "") + (k === Math.round(view.depth) ? "here" : "") + '"></i>';
    html += '<i class="core' + (game.s.phase === "won" && goal === "dive" ? " reached" : "") + '"></i>';
    el.innerHTML = html;
  }
  function ripple(cells) { var now = performance.now(); for (var k = 0; k < cells.length; k++) view.anim[cells[k]] = now + Math.min(k, 100) * 7; }

  /* ---------------------------------------------------------------- moves */
  function dig(i) {
    var s = game.s;
    if (s.phase === "won" || s.phase === "lost" || s.flag[i]) return;
    if (s.phase === "ready") {
      var t = performance.now();
      game.gen = O.generate(s.mesh, s.nMines, i, game.seed);
      O.plant(s, game.gen.mines); s.phase = "play"; s.t0 = Date.now(); s.first = i;
      ripple(O.reveal(s, i));
      $("note").textContent = "proved guess-free · " + (performance.now() - t).toFixed(0) + " ms · pinch or ▼ to dive";
      return after();
    }
    if (s.open[i]) return chord(i);
    var cert = O.certainties(s), certain = cert.partial || cert.safe.indexOf(i) >= 0;
    if (!certain) game.guesses++;
    view.mark = null;
    ripple(O.reveal(s, i));
    after(cert, i, certain);
  }
  function chord(i) {
    var s = game.s, nb = s.mesh.nbrs[i], f = 0, k;
    for (k = 0; k < nb.length; k++) f += s.flag[nb[k]];
    if (f !== s.count[i]) { flash(nb); return; }
    var cert = O.certainties(s), safe = new Set(cert.safe), gamble = false;
    if (cert.partial) safe = { has: function () { return true; } };
    for (k = 0; k < nb.length; k++) if (!s.open[nb[k]] && !s.flag[nb[k]] && !safe.has(nb[k])) gamble = true;
    if (gamble) game.guesses++;
    view.mark = null;
    var opened = O.chord(s, i); if (!opened.length) return;
    ripple(opened); after(cert, s.boom, !gamble);
  }
  function flag(i) { if (O.toggleFlag(game.s, i)) { hud(); dirty = true; } }
  function flash(cells) { view.hl = new Set(cells); dirty = true; setTimeout(function () { view.hl = null; dirty = true; }, 450); }
  function hint() {
    var s = game.s; if (s.phase !== "play") return;
    var cert = O.certainties(s); if (!cert.safe.length) return;
    var best = -9, bi = cert.safe[0];
    cert.safe.forEach(function (c) { var z = view.inView(c); if (z > best) { best = z; bi = c; } });
    game.hints++; view.mark = new Set([bi]); turning = { cell: bi, left: 22 };
    $("note").textContent = "that one is certain — " + cert.safe.length + " cell" + (cert.safe.length > 1 ? "s are" : " is") + " right now";
    dirty = true;
  }
  function after(cert, cell, certain) {
    var s = game.s, m = s.mesh;
    for (var i = 0; i < m.n; i++) if (s.open[i] && !s.mine[i]) game.deepest = Math.max(game.deepest, F.shellOf(m, i));
    if (s.phase === "play" && goal === "dive" && game.deepest === m.K - 1) { s.phase = "won"; s.t1 = Date.now(); }
    if (s.phase === "lost") {
      var proof = new Set(cert ? cert.safe : []), wasMine = cert && cert.mine.indexOf(cell) >= 0;
      view.mark = proof;
      $("over-title").textContent = "BOOM";
      $("over-body").innerHTML = wasMine ? "That cell was <b>provably a mine</b> — the numbers around it, above or below, said so."
        : "That was a guess, and this sea never needed one: <b>" + proof.size + " cell" + (proof.size === 1 ? " was" : "s were") + "</b> certain. They're pulsing.";
      $("note").textContent = "shell " + (F.shellOf(m, cell) + 1) + " of " + m.K;
      end();
    } else if (s.phase === "won") {
      var ms = s.t1 - s.t0, clean = game.guesses === 0, key = "fathom-best-" + game.size + "-" + goal, best = null;
      try { best = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { /* ignore */ }
      var isBest = clean && !game.hints && (!best || ms < best);
      if (isBest) try { localStorage.setItem(key, JSON.stringify(ms)); } catch (e) { /* ignore */ }
      $("over-title").textContent = (goal === "dive" ? "THE CORE" : "CLEARED") + (clean ? " — PURE" : "");
      $("over-body").innerHTML = (goal === "dive" ? "You reached the core through " + m.K + " shells. " : "Every safe cell in " + m.K + " shells. ") +
        (clean ? "Every move was certain when you made it." : "<b>" + game.guesses + "</b> of your moves " + (game.guesses === 1 ? "was a guess" : "were guesses") + ".") +
        "<br>" + clock(ms) + (game.hints ? " · " + game.hints + " hint" + (game.hints > 1 ? "s" : "") : "") + (isBest ? " · <b>best pure</b>" : best ? " · best pure " + clock(best) : "");
      $("note").textContent = goal === "dive" ? "the core · " + game.guesses + " guesses" : "cleared · " + game.guesses + " guesses";
      end();
    } else if (cert && !certain) $("note").textContent = "lucky — that wasn't certain (guesses: " + game.guesses + ")";
    else $("note").textContent = s.nMines - s.flags + " mines left · deepest shell " + (game.deepest + 1) + " of " + m.K;
    gauge(); hud(); dirty = true;
  }
  function end() { setTimeout(function () { $("over").hidden = false; }, 700); }

  /* Say what the reticle's cell sees, split by shell. */
  var lastFocus = -2, focusMsg = "";
  function focusNote() {
    var s = game && game.s, c = view.focusCell;
    if (!s || s.phase !== "play" || c < 0) { if (lastFocus !== c) $("focus").textContent = ""; lastFocus = c; return; }
    var m = s.mesh, nb = m.nbrs[c], kc = F.shellOf(m, c), f = 0, hid = [0, 0, 0];
    nb.forEach(function (j) { if (s.flag[j]) f++; else if (!s.open[j]) hid[F.shellOf(m, j) - kc + 1]++; });
    var where = (hid[1] ? hid[1] + " around" : "") + (hid[2] ? (hid[1] ? " · " : "") + hid[2] + " below" : "") + (hid[0] ? (hid[1] || hid[2] ? " · " : "") + hid[0] + " above" : "");
    var tot = hid[0] + hid[1] + hid[2];
    var msg = !s.open[c] ? (s.flag[c] ? "⊕ flagged" : "⊕ hidden") + " · shell " + (kc + 1) + " · " + nb.length + " neighbours"
      : "⊕ " + s.count[c] + " · ⚑ " + f + " · " + (where || "0 hidden") + (s.count[c] === f && tot ? " · tap to clear" : s.count[c] - f === tot && tot ? " · all mines" : "");
    if (c === lastFocus && msg === focusMsg) return;
    lastFocus = c; focusMsg = msg; $("focus").textContent = msg;
  }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), press = null, pinch = null, last = null, holdTimer = 0;
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    spin.x = spin.y = 0; turning = null; idle = 0;
    if (ptrs.size === 2) { press = null; clearTimeout(holdTimer); var a = Array.from(ptrs.values()); pinch = { d: dist(a[0], a[1]), depth: view.depth }; depthTo = null; return; }
    var p = local(e), cell = view.pick(p.x, p.y);
    press = { x: e.clientX, y: e.clientY, cell: cell, moved: false, right: e.button === 2, held: false };
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (cell >= 0 && game.s.open[cell] && game.s.count[cell] > 0) { view.hl = new Set(game.s.mesh.nbrs[cell]); dirty = true; }
    clearTimeout(holdTimer);
    if (cell >= 0 && !press.right && game.s.phase === "play" && !game.s.open[cell]) holdTimer = setTimeout(function () {
      if (!press || press.moved) return;
      press.held = true; if (navigator.vibrate) navigator.vibrate(tapDigs ? 12 : 25);
      if (tapDigs) flag(cell); else dig(cell);
    }, 360);
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    var prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { // spread to dive, pinch to rise: a doubling of the spread is one shell
      var a = Array.from(ptrs.values());
      view.depth = clamp(pinch.depth + Math.log2(dist(a[0], a[1]) / pinch.d), 0, game.s.mesh.K - 1); hud(); gauge(); dirty = true; return;
    }
    if (!press) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 7) { press.moved = true; clearTimeout(holdTimer); view.hl = null; }
    if (press.moved) {
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y, now = performance.now(), dt = Math.max(8, now - last.t);
      view.drag(dx, dy); spin.x = dx * 16 / dt; spin.y = dy * 16 / dt; last = { x: e.clientX, y: e.clientY, t: now }; dirty = true;
    }
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); clearTimeout(holdTimer);
    if (ptrs.size < 2 && pinch) { pinch = null; depthTo = Math.round(view.depth); }
    if (view.hl) { view.hl = null; dirty = true; }
    if (!press) return;
    var pr = press; press = null;
    if (pr.moved) { if (performance.now() - last.t > 60) spin.x = spin.y = 0; return; }
    spin.x = spin.y = 0;
    if (pr.held || pr.cell < 0 || e.type === "pointercancel") return;
    var s = game.s;
    if (s.phase === "ready" || s.open[pr.cell]) return dig(pr.cell);
    var digs = pr.right ? !tapDigs : tapDigs;
    if (digs) dig(pr.cell); else flag(pr.cell);
  }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.depth = clamp(view.depth + e.deltaY * 0.004, 0, game.s.mesh.K - 1); depthTo = null; clearTimeout(wheelEnd); wheelEnd = setTimeout(function () { depthTo = Math.round(view.depth); }, 220); hud(); gauge(); dirty = true; }, { passive: false });
  var wheelEnd = 0;
  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function shell(d) { depthTo = clamp(Math.round(view.depth) + d, 0, game.s.mesh.K - 1); }

  document.addEventListener("keydown", function (e) {
    if (e.key === "f" || e.key === " ") { tapDigs = !tapDigs; hud(); e.preventDefault(); }
    else if (e.key === "h" || e.key === "?") hint();
    else if (e.key === "n") newGame(O.randomSeed(), game.size);
    else if (e.key === "w" || e.key === "PageUp") shell(-1);
    else if (e.key === "s" || e.key === "PageDown") shell(1);
    else if (e.key === "g") $("goal").click();
    else if (e.key.indexOf("Arrow") === 0) { var d = 40, k = e.key.slice(5); view.drag(k === "Left" ? -d : k === "Right" ? d : 0, k === "Up" ? -d : k === "Down" ? d : 0); dirty = true; e.preventDefault(); }
  });
  $("mode").onclick = function () { tapDigs = !tapDigs; hud(); };
  $("hint").onclick = hint;
  $("up").onclick = function () { shell(-1); };
  $("down").onclick = function () { shell(1); };
  $("new").onclick = function () { newGame(O.randomSeed(), game.size); };
  $("size").onchange = function () { newGame(O.randomSeed(), this.value); };
  $("goal").onclick = function () {
    goal = goal === "dive" ? "clear" : "dive";
    try { localStorage.setItem("fathom-goal", goal); } catch (e) { /* ignore */ }
    newGame(game.seed, game.size);
  };
  $("again").onclick = function () { newGame(O.randomSeed(), game.size); };
  $("replay").onclick = function () { newGame(game.seed, game.size); };
  $("look").onclick = function () { $("over").hidden = true; };
  $("start-btn").onclick = function () { $("start").hidden = true; try { localStorage.setItem("fathom-seen", "1"); } catch (e) { /* ignore */ } };
  try { if (localStorage.getItem("fathom-seen")) $("start").hidden = true; } catch (e) { /* ignore */ }

  /* ----------------------------------------------------------------- loop */
  function frame(now) {
    if (turning) { view.toward(turning.cell, 0.18); dirty = true; if (--turning.left <= 0) { turning = null; depthTo = Math.round(view.depth); } hud(); gauge(); }
    if (depthTo != null) { var dd = depthTo - view.depth; view.depth += dd * 0.22; if (Math.abs(dd) < 0.004) { view.depth = depthTo; depthTo = null; } dirty = true; hud(); gauge(); }
    if (Math.abs(spin.x) + Math.abs(spin.y) > 0.05 && !press) { view.drag(spin.x, spin.y); spin.x *= 0.94; spin.y *= 0.94; dirty = true; }
    else if (!press && game && game.s.phase === "ready" && $("start").hidden) { if (++idle > 90) { view.drag(0.25, 0.04); dirty = true; } }
    if (dirty) { dirty = !!view.draw(now) || false; focusNote(); }
    requestAnimationFrame(frame);
  }
  setInterval(function () { if (game && game.s.phase === "play") hud(); }, 500);
  function fit() { view.resize(); dirty = true; }
  window.addEventListener("resize", fit);
  F._debug = { game: function () { return game; }, view: view, newGame: newGame };

  var p = params();
  fit(); newGame(p.seed, p.size);
  requestAnimationFrame(frame);
})();
