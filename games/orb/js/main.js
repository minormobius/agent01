/* Orb — the controller.

   Input on a sphere has one more job than on a grid: the same finger both
   turns the world and plays it. A press that moves more than a few pixels is
   a turn; one that doesn't is a move. Hold (or right-click, or flag mode)
   to flag. Press an open number to see exactly which cells it counts — on an
   irregular mesh that is worth showing rather than making you squint.

   The readout is what makes this one of the /pressure/ family: every board
   is proved guess-free before you see it, so at every moment some cell is
   certain. The game checks each move you make against that and counts the
   ones that weren't — a clear with zero guesses is the real win. */
(function () {
  "use strict";
  var O = window.ORB;
  var SIZES = { s: { n: 160, m: 22, label: "small" }, m: { n: 320, m: 50, label: "medium" }, l: { n: 600, m: 100, label: "large" } };

  var $ = function (id) { return document.getElementById(id); };
  var cv = $("orb"), view = new O.View(cv);
  // Controls: TAP FLAGS, HOLD DIGS. Digging is the move that can end the game,
  // so it gets the deliberate gesture; a stray tap costs a flag you can take
  // back. Tapping an open number still chords. The mode button swaps the two.
  // The first tap of a game always digs: there is nothing to flag yet.
  var game = null, tapDigs = false, dirty = true, spin = { x: 0, y: 0 }, idle = 0;

  function params() {
    var q = new URLSearchParams(location.search);
    return { seed: q.get("seed") || O.randomSeed(), size: SIZES[q.get("size")] ? q.get("size") : "m" };
  }
  function setURL(seed, size) {
    // keep a sign-in token the auth worker just handed back: js/board.js
    // (a module, so it runs after this) still has to read it out of the URL
    var q = new URLSearchParams(location.search), tok = q.get("__auth_session");
    var url = "?seed=" + encodeURIComponent(seed) + "&size=" + size + (tok ? "&__auth_session=" + encodeURIComponent(tok) : "");
    try { history.replaceState(null, "", url + location.hash); } catch (e) { /* file:// */ }
  }

  function newGame(seed, size) {
    var cfg = SIZES[size];
    var mesh = O.buildMesh(seed, cfg.n, 2);
    var s = O.newState(mesh, cfg.m);
    game = { seed: seed, size: size, s: s, guesses: 0, hints: 0, gen: null };
    view.state = s; view.anim = {}; view.mark = null; view.hl = null;
    setURL(seed, size);
    $("seed").textContent = seed;
    $("size").value = size;
    $("over").hidden = true; $("post").hidden = true;
    $("note").textContent = "tap any cell — the first is always clear";
    hud(); dirty = true;
  }

  function hud() {
    var s = game.s;
    $("mines").textContent = String(s.nMines - s.flags);
    $("guesses").textContent = String(game.guesses);
    $("time").textContent = clock(s.phase === "play" ? Date.now() - s.t0 : s.t1 ? s.t1 - s.t0 : 0);
    $("mode").textContent = tapDigs ? "tap: ⛏ dig" : "tap: ⚑ flag";
    $("mode").classList.toggle("on", tapDigs);
  }
  function clock(ms) { var t = Math.floor(ms / 1000); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }

  function ripple(cells) {
    var now = performance.now();
    for (var k = 0; k < cells.length; k++) view.anim[cells[k]] = now + Math.min(k, 120) * 7;
  }

  /* ---------------------------------------------------------------- moves */
  function dig(i) {
    var s = game.s;
    if (s.phase === "won" || s.phase === "lost" || s.flag[i]) return;
    if (s.phase === "ready") {
      var t = performance.now();
      game.gen = O.generate(s.mesh, s.nMines, i, game.seed);
      game.genMs = performance.now() - t;
      O.plant(s, game.gen.mines); s.phase = "play"; s.t0 = Date.now(); s.first = i;
      ripple(O.reveal(s, i));
      $("note").textContent = "proved guess-free: " + game.gen.deals + " deal" + (game.gen.deals > 1 ? "s" : "") +
        (game.gen.repairs ? ", " + game.gen.repairs + " repair" + (game.gen.repairs > 1 ? "s" : "") : "") + " · " + game.genMs.toFixed(0) + " ms";
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
    if (cert.partial) safe = { has: function () { return true; } }; // solver out of budget: give the benefit of the doubt
    for (k = 0; k < nb.length; k++) if (!s.open[nb[k]] && !s.flag[nb[k]] && !safe.has(nb[k])) gamble = true;
    if (gamble) game.guesses++;
    view.mark = null;
    var opened = O.chord(s, i);
    if (!opened.length) return;
    ripple(opened);
    after(cert, s.boom, !gamble);
  }

  function flag(i) {
    if (O.toggleFlag(game.s, i)) { hud(); dirty = true; }
  }

  function hint() {
    var s = game.s;
    if (s.phase !== "play") return;
    var cert = O.certainties(s);
    if (!cert.safe.length) return;
    // the certain cell nearest the middle of the screen
    var R = view.R, P = s.mesh.sites, best = -9, bi = cert.safe[0];
    cert.safe.forEach(function (c) { var z = R[6] * P[3 * c] + R[7] * P[3 * c + 1] + R[8] * P[3 * c + 2]; if (z > best) { best = z; bi = c; } });
    game.hints++;
    view.mark = new Set([bi]);
    if (best < 0.6) turnTo(bi);
    $("note").textContent = "that one is certain — " + cert.safe.length + " cell" + (cert.safe.length > 1 ? "s are" : " is") + " right now";
    dirty = true;
  }

  var turning = null;
  function turnTo(c) {
    var P = game.s.mesh.sites;
    turning = { p: [P[3 * c], P[3 * c + 1], P[3 * c + 2]], left: 18 };
  }

  /* Say what the reticle's cell sees: its number, flags around it, and how
     many neighbours are still hidden. Counting those by eye on an irregular
     mesh is the chore the reticle exists to remove. */
  var lastFocus = -2, focusMsg = "";
  function focusNote() {
    var s = game && game.s, c = view.focusCell;
    if (!s || s.phase !== "play" || c < 0) { lastFocus = c; return; }
    var nb = s.mesh.nbrs[c], f = 0, hid = 0;
    for (var k = 0; k < nb.length; k++) { if (s.flag[nb[k]]) f++; else if (!s.open[nb[k]]) hid++; }
    var msg = !s.open[c] ? (s.flag[c] ? "⊕ flagged" : "⊕ hidden") + " · " + nb.length + " neighbours"
      : "⊕ " + s.count[c] + " · ⚑ " + f + " · " + hid + " hidden" + (s.count[c] === f && hid ? " · tap to clear" : s.count[c] - f === hid && hid ? " · all mines" : "");
    if (c === lastFocus && msg === focusMsg) return;
    lastFocus = c; focusMsg = msg;
    $("focus").textContent = msg;
  }

  function flash(cells) { view.hl = new Set(cells); dirty = true; setTimeout(function () { view.hl = null; dirty = true; }, 450); }

  function after(cert, cell, certain) {
    var s = game.s;
    if (s.phase === "lost") {
      var proof = new Set(cert ? cert.safe : []);
      view.mark = proof;
      var wasMine = cert && cert.mine.indexOf(cell) >= 0;
      $("over-title").textContent = "BOOM";
      $("note").textContent = wasMine ? "that one was provably a mine" : proof.size + " certain cell" + (proof.size === 1 ? "" : "s") + " pulsing";
      $("over-body").innerHTML = wasMine
        ? "That cell was <b>provably a mine</b> — the numbers around it said so."
        : "That was a guess, and this board never needed one: <b>" + proof.size + " cell" + (proof.size === 1 ? " was" : "s were") +
          "</b> certain when you clicked. They're pulsing.";
      end();
    } else if (s.phase === "won") {
      var key = "orb-best-" + game.size, best = null, ms = s.t1 - s.t0, clean = game.guesses === 0;
      try { best = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { /* private mode */ }
      var isBest = clean && (!best || ms < best);
      if (isBest) try { localStorage.setItem(key, JSON.stringify(ms)); } catch (e) { /* ignore */ }
      $("over-title").textContent = clean ? "CLEARED — PURE" : "CLEARED";
      // the board takes pure, unassisted clears only
      var postable = clean && !game.hints && O.board;
      $("post").hidden = !postable;
      $("post").textContent = "POST TIME TO THE BOARD";
      $("post").disabled = false;
      game.result = postable ? { size: game.size, ms: ms, seed: game.seed, first: s.first, at: Date.now() } : null;
      $("note").textContent = "cleared · " + game.guesses + " guess" + (game.guesses === 1 ? "" : "es");
      $("over-body").innerHTML = (clean
        ? "Every move was certain when you made it. That is the whole game."
        : "<b>" + game.guesses + "</b> of your moves " + (game.guesses === 1 ? "was a guess" : "were guesses") +
          " — each time, something else was certain. A pure clear has none.") +
        "<br>" + clock(ms) + (game.hints ? " · " + game.hints + " hint" + (game.hints > 1 ? "s" : "") : "") +
        (isBest ? " · <b>best pure clear</b>" : best ? " · best pure " + clock(best) : "");
      end();
    } else if (cert && !certain) {
      $("note").textContent = "lucky — that wasn't certain (guesses: " + game.guesses + ")";
    } else {
      $("note").textContent = s.nMines - s.flags + " mines left";
    }
    hud(); dirty = true;
  }
  function end() { setTimeout(function () { $("over").hidden = false; }, 700); }

  /* ---------------------------------------------------------------- input */
  var ptrs = new Map(), press = null, pinch = null, last = null;

  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    spin.x = spin.y = 0; turning = null; idle = 0;
    if (ptrs.size === 2) { press = null; clearTimeout(holdTimer); var a = Array.from(ptrs.values()); pinch = { d: dist(a[0], a[1]), z: view.zoom }; return; }
    var p = local(e), cell = view.pick(p.x, p.y);
    press = { x: e.clientX, y: e.clientY, cell: cell, moved: false, right: e.button === 2, held: false };
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (cell >= 0 && game.s.open[cell] && game.s.count[cell] > 0) { view.hl = new Set(game.s.mesh.nbrs[cell]); dirty = true; }
    clearTimeout(holdTimer);
    if (cell >= 0 && !press.right && game.s.phase === "play" && !game.s.open[cell]) holdTimer = setTimeout(function () {
      if (!press || press.moved) return;
      press.held = true;
      if (navigator.vibrate) navigator.vibrate(tapDigs ? 12 : 25);
      if (tapDigs) flag(cell); else dig(cell);
    }, 360);
  });
  var holdTimer = 0;
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    var prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      view.zoom = clamp(pinch.z * dist(a[0], a[1]) / pinch.d, 0.7, 3.2); dirty = true; return;
    }
    if (!press) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 7) { press.moved = true; clearTimeout(holdTimer); view.hl = null; }
    if (press.moved) {
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y, now = performance.now(), dt = Math.max(8, now - last.t);
      view.drag(dx, dy);
      spin.x = dx * 16 / dt; spin.y = dy * 16 / dt; last = { x: e.clientX, y: e.clientY, t: now };
      dirty = true;
    }
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    clearTimeout(holdTimer);
    if (ptrs.size < 2) pinch = null;
    if (view.hl) { view.hl = null; dirty = true; }
    if (!press) return;
    var pr = press; press = null;
    if (pr.moved) { if (performance.now() - last.t > 60) spin.x = spin.y = 0; return; }
    spin.x = spin.y = 0;
    if (pr.held || pr.cell < 0 || e.type === "pointercancel") return;
    var s = game.s;
    if (s.phase === "ready" || s.open[pr.cell]) return dig(pr.cell); // first move / chord
    var digs = pr.right ? !tapDigs : tapDigs; // right-click is the other action
    if (digs) dig(pr.cell); else flag(pr.cell);
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) {
    e.preventDefault(); view.zoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 0.7, 3.2); dirty = true;
  }, { passive: false });

  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  document.addEventListener("keydown", function (e) {
    if (e.key === "f" || e.key === " ") { tapDigs = !tapDigs; hud(); e.preventDefault(); }
    else if (e.key === "h" || e.key === "?") hint();
    else if (e.key === "n") newGame(O.randomSeed(), game.size);
    else if (e.key.indexOf("Arrow") === 0) {
      var d = 0.12 * view.radius(), k = e.key.slice(5);
      view.drag(k === "Left" ? -d : k === "Right" ? d : 0, k === "Up" ? -d : k === "Down" ? d : 0); dirty = true; e.preventDefault();
    }
  });

  $("mode").onclick = function () { tapDigs = !tapDigs; hud(); };
  $("hint").onclick = hint;
  $("new").onclick = function () { newGame(O.randomSeed(), game.size); };
  $("size").onchange = function () { newGame(O.randomSeed(), this.value); };
  $("again").onclick = function () { newGame(O.randomSeed(), game.size); };
  $("replay").onclick = function () { newGame(game.seed, game.size); };
  $("look").onclick = function () { $("over").hidden = true; };
  $("post").onclick = function () {
    if (!game.result) return;
    this.disabled = true; this.textContent = "POSTING…";
    $("over").hidden = true;
    O.board.offer(game.result); game.result = null;
  };
  $("board-btn").onclick = function () { if (O.board) O.board.open(game.size); };
  $("start-btn").onclick = function () { $("start").hidden = true; };

  /* ----------------------------------------------------------------- loop */
  function frame(now) {
    if (turning) { // ease the hinted cell round to face you
      view.face(turning.p, 0.18); dirty = true;
      if (--turning.left <= 0) turning = null;
    }
    if (Math.abs(spin.x) + Math.abs(spin.y) > 0.05 && !press) {
      view.drag(spin.x, spin.y); spin.x *= 0.94; spin.y *= 0.94; dirty = true;
    } else if (!press && game && game.s.phase === "ready" && $("start").hidden) {
      if (++idle > 90) { view.drag(0.25, 0.04); dirty = true; } // a slow drift until the first move
    }
    if (dirty) { dirty = !!view.draw(now) || false; focusNote(); }
    requestAnimationFrame(frame);
  }
  setInterval(function () { if (game && game.s.phase === "play") hud(); }, 500);

  function fit() { view.resize(); dirty = true; }
  window.addEventListener("resize", fit);

  O._debug = { game: function () { return game; }, view: view }; // for the browser playtest

  var p = params();
  fit();
  newGame(p.seed, p.size);
  requestAnimationFrame(frame);
})();
