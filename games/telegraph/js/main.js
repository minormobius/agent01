/* Telegraph — UI and glue.
 *
 * Owns input, the chrome, and the animation *sequencing*. The board view (see
 * js/view.js) owns the DOM and the individual effects; this file decides what
 * order things happen in and how long the player is made to wait.
 *
 * Animation here is driven entirely off the sim's event log, not off guesses
 * about what probably happened. `rules.js` already emits push / damage / down /
 * hit / ability events for its own reasons, so the timeline is a replay of what
 * actually resolved — which means the animation cannot drift from the rules.
 *
 * It also runs the solver over the board as it stood at the start of each turn,
 * so it can tell you afterwards how many of your options were right. The count
 * is shown after you commit, never before: before, it would be a hint and you
 * would brute-force it.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = window;
  var T = NS.TELEGRAPH;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    board: $("board"), level: $("level-value"), turn: $("turn-value"),
    integrity: $("integrity-value"),
    units: $("units"), modes: $("modes"), readout: $("readout"),
    endTurn: $("end-turn"), undo: $("undo"),
    start: $("start"), startBtn: $("start-btn"), startSeed: $("start-seed"),
    inter: $("inter"), interTitle: $("inter-title"), interBody: $("inter-body"), interBtn: $("inter-btn"),
    over: $("over"), overStats: $("run-stats"), overSeed: $("over-seed"),
    overBest: $("over-best"), again: $("again"), replay: $("replay"),
  };

  var view = T.createBoardView(el.board);
  var state = null;
  var turnStart = null;
  var selected = null;
  var mode = "move";
  var runStats = null;
  var busy = false;        // true while an animation is playing

  // ------------------------------------------------------------------ seed --

  function urlSeed() {
    var m = /[?&]seed=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setUrlSeed(seed) {
    try {
      var u = new URL(location.href);
      u.searchParams.set("seed", seed);
      history.replaceState(null, "", u.toString());
    } catch (e) { /* file:// — harmless */ }
  }
  function best() {
    try { return parseInt(NS.localStorage.getItem("telegraph.best") || "0", 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(n) {
    try { if (n > best()) NS.localStorage.setItem("telegraph.best", String(n)); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------- run --

  function newRun(seed) {
    state = T.newGame(seed || T.randomSeed());
    setUrlSeed(state.seed);
    runStats = { turns: 0, clean: 0, flawless: 0, missed: 0, forced: 0, levels: 0 };
    busy = false;
    view.mount(state, onTile);
    beginTurn();
    el.over.hidden = true;
    el.inter.hidden = true;
    setReadout("", "Pick a unit. Every red tile is an attack landing at the end of this turn.");
  }

  function beginTurn() {
    turnStart = T.cloneState(state);
    selected = null;
    mode = "move";
    state.events.length = 0;
    paint();
  }

  // ------------------------------------------------------------------ view --

  function paint() {
    if (!state) return;
    el.level.textContent = state.level;
    el.turn.textContent = state.turn + "/" + state.maxTurns;
    el.integrity.textContent = state.integrity + "/" + state.maxIntegrity;
    el.integrity.classList.toggle("low", state.integrity <= 3);

    var sel = selected ? T.getUnit(state, selected) : null;
    var moveSet = {}, targetSet = {}, i;
    if (sel && sel.alive && !busy) {
      var spots = mode === "move" ? T.reachable(state, sel) : [];
      for (i = 0; i < spots.length; i++) moveSet[spots[i].x + "," + spots[i].y] = true;
      var tg = mode === "ability" ? T.abilityTargets(state, sel) : [];
      for (i = 0; i < tg.length; i++) targetSet[tg[i].x + "," + tg[i].y] = true;
    }

    view.paint(state, { selected: selected, mode: mode, moveSet: moveSet, targetSet: targetSet });
    renderUnits();
    renderModes(sel);
    el.undo.disabled = busy || !dirty();
    el.endTurn.disabled = busy || state.phase !== "plan";
  }

  function renderUnits() {
    el.units.innerHTML = "";
    for (var i = 0; i < state.units.length; i++) {
      (function (u) {
        var spec = T.UNITS[u.kind];
        var b = document.createElement("button");
        b.type = "button";
        b.className = "unit-chip" + (selected === u.id ? " active" : "");
        b.disabled = busy || !u.alive || (u.moved && u.acted);
        var name = document.createElement("span");
        name.className = "name";
        name.textContent = spec.glyph + " " + spec.name + "  " + u.hp + "♥";
        var st = document.createElement("span");
        st.className = "state" + (u.acted ? " done" : "");
        st.textContent = !u.alive ? "down"
          : u.acted ? "acted"
          : u.moved ? "moved — can still act"
          : "ready";
        b.appendChild(name); b.appendChild(st);
        b.addEventListener("click", function () { selectUnit(u.id); });
        el.units.appendChild(b);
      })(state.units[i]);
    }
  }

  function renderModes(sel) {
    el.modes.innerHTML = "";
    if (!sel || !sel.alive) return;
    mkMode("MOVE", "move", !sel.moved && !busy);
    mkMode(sel.kind === "ram" ? "SHOVE" : "STRIKE", "ability",
      !sel.acted && !busy && T.abilityTargets(state, sel).length > 0);
    var hint = document.createElement("div");
    hint.className = "mode-hint";
    hint.textContent = T.UNITS[sel.kind].blurb;
    el.modes.appendChild(hint);
  }

  function mkMode(label, m, enabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mode-btn" + (mode === m ? " on" : "");
    b.textContent = label;
    b.disabled = !enabled;
    b.addEventListener("click", function () { mode = m; paint(); });
    el.modes.appendChild(b);
  }

  // ----------------------------------------------------------------- input --

  function selectUnit(id) {
    if (busy) return;
    var u = T.getUnit(state, id);
    if (!u || !u.alive) return;
    selected = id;
    mode = u.moved ? "ability" : "move";
    paint();
  }

  function onTile(x, y) {
    if (busy || state.phase !== "plan") return;
    var u = T.unitAt(state, x, y);
    if (u && u.alive && (!selected || selected !== u.id)) { selectUnit(u.id); return; }
    if (!selected) return;
    var sel = T.getUnit(state, selected);
    if (!sel || !sel.alive) return;

    if (mode === "move") {
      if (!T.moveUnit(state, sel.id, x, y)) return;
      mode = T.abilityTargets(state, sel).length ? "ability" : "move";
      run(animateMove());
      return;
    }

    var from = { x: sel.x, y: sel.y, kind: sel.kind, id: sel.id };
    state.events.length = 0;
    if (!T.useAbility(state, sel.id, x, y)) return;
    var events = state.events.slice();
    selected = null;
    mode = "move";
    run(animateAbility(from, x, y, events));
  }

  /* Every animation runs inside this: input is locked, the board is repainted so
     the new telegraphs show immediately, and the lock is always released even if
     something throws. */
  function run(promise) {
    busy = true;
    paint();
    return promise.then(function () {
      busy = false;
      paint();
    }, function (err) {
      busy = false;
      paint();
      throw err;
    });
  }

  function dirTo(x0, y0, x1, y1) {
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) return x1 >= x0 ? 1 : 3;
    return y1 >= y0 ? 2 : 0;
  }

  function ids(events, type) {
    return events.filter(function (e) { return e.type === type; }).map(function (e) { return e.id; });
  }

  // ------------------------------------------------------- animation: you --

  function animateMove() {
    view.sync(state, true);
    return view.wait(view.d("move"));
  }

  /* RAM leans into its target and something flashes; MORTAR lobs a shell that
     lands and shoves. Both then let sync() slide whatever got pushed. */
  function animateAbility(from, tx, ty, events) {
    var hurt = ids(events, "damage"), down = ids(events, "down");
    var isRam = from.kind === "ram";

    if (isRam) {
      view.lunge(from.id, dirTo(from.x, from.y, tx, ty));
      return view.wait(view.d("lunge")).then(function () {
        view.fx("slash", tx, ty);
        view.flash(hurt);
        view.sync(state, true);
        return view.wait(view.d("strike"));
      }).then(function () { return finishDeaths(down); });
    }

    view.shot(from.x, from.y, tx, ty, "shell");
    return view.wait(view.d("shot")).then(function () {
      view.fx("blast", tx, ty);
      view.shake();
      view.flash(hurt);
      view.sync(state, true);
      return view.wait(view.d("strike"));
    }).then(function () { return finishDeaths(down); });
  }

  function finishDeaths(down) {
    if (!down.length) { view.prune(state); return Promise.resolve(); }
    view.markDying(down);
    return view.wait(view.d("death")).then(function () { view.prune(state); });
  }

  // ------------------------------------------------- animation: the horde --

  /* The end-of-turn timeline. Deliberately staged rather than simultaneous:
     shots fly, then they land, then bodies drop, then the horde closes in. All
     at once would be honest to the rules — resolution IS simultaneous — but
     unreadable, and the whole appeal of this game is being able to read it. */
  function animateResolution(events) {
    var hits = events.filter(function (e) { return e.type === "hit"; });
    var hurt = ids(events, "damage"), down = ids(events, "down");

    hits.forEach(function (h) {
      view.lunge(h.from, dirTo(h.fx, h.fy, h.x, h.y));
      view.shot(h.fx, h.fy, h.x, h.y, h.node ? "bad" : h.miss ? "dud" : "blk");
    });

    return view.wait(view.d("shot")).then(function () {
      var costly = false;
      hits.forEach(function (h) {
        if (h.miss) { view.fx("dud", h.x, h.y); return; }
        view.fx(h.node ? "strike-node" : "strike", h.x, h.y);
        if (h.node) { view.float(h.x, h.y, "−" + h.dmg, "bad"); costly = true; }
      });
      if (costly) view.shake();
      view.flash(hurt);
      return view.wait(view.d("strike"));
    }).then(function () {
      return finishDeaths(down);
    }).then(function () {
      // Survivors advance and re-aim; reinforcements pop in.
      view.sync(state, true);
      return view.wait(view.d("advance"));
    });
  }

  function dirty() {
    return state && turnStart && T.keyOf(state) !== T.keyOf(turnStart);
  }

  function undo() {
    if (busy || !dirty()) return;
    state = T.cloneState(turnStart);
    selected = null; mode = "move";
    run(Promise.resolve().then(function () {
      view.sync(state, true);
      view.prune(state);
      return view.wait(view.d("move"));
    }));
    setReadout("", "Turn reset.");
  }

  // -------------------------------------------------------------- end turn --

  function setReadout(cls, html) {
    el.readout.className = cls;
    el.readout.innerHTML = html;
  }

  function endTurn() {
    if (busy || state.phase !== "plan") return;

    var analysis = T.analyseTurn(turnStart);
    var actual = T.costOf(state);
    var grade = T.gradeTurn(analysis, actual);

    state.events.length = 0;
    state = T.endTurn(state);
    var events = state.events.slice();

    runStats.turns++;
    runStats[grade === "flawless" ? "flawless" : grade === "clean" ? "clean" : grade === "forced" ? "forced" : "missed"]++;

    var n = analysis.total.toLocaleString();
    var c = analysis.clean.toLocaleString();
    var capped = analysis.capped ? " (at least)" : "";
    var msg;
    if (grade === "flawless") {
      msg = "<b>FLAWLESS.</b> " + analysis.flawless.toLocaleString() + " of " + n +
        " positions took nothing at all" + capped + ". You found one.";
    } else if (grade === "clean") {
      msg = "<b>CLEAN.</b> " + c + " of " + n + " positions saved every node" + capped +
        ". You found one — at the cost of " + actual.unitDmg + " damage to your units.";
    } else if (grade === "forced") {
      msg = "<b>FORCED.</b> Not one of " + n + " positions saved every node. " +
        "You lost " + actual.integrity + " integrity because there was no way not to.";
    } else {
      msg = "<b>MISSED.</b> " + c + " of " + n + " positions saved every node" + capped +
        ". You lost " + actual.integrity + " integrity.";
    }

    run(animateResolution(events).then(function () {
      setReadout(grade, msg);
      if (state.phase === "lost") { showOver(); return; }
      if (state.phase === "won") { showCleared(); return; }
      beginTurn();
    }));
  }

  // ------------------------------------------------------------- overlays --

  function showCleared() {
    runStats.levels++;
    saveBest(state.level);
    el.interTitle.textContent = "SECTOR " + state.level + " HELD";
    el.interBody.innerHTML =
      "Integrity <b>" + state.integrity + "/" + state.maxIntegrity + "</b>" +
      (state.integrity < state.maxIntegrity ? " — one point patched." : ".") +
      "<br />" + runStats.clean + " clean · " + runStats.flawless + " flawless · " +
      runStats.missed + " missed · " + runStats.forced + " forced";
    el.inter.hidden = false;
    el.interBtn.focus();
  }

  function advance() {
    state = T.nextEncounter(state);
    el.inter.hidden = true;
    view.mount(state, onTile);
    beginTurn();
    setReadout("", "Sector " + state.level + ". " + state.enemies.length + " hostiles, " + state.maxTurns + " turns.");
  }

  function showOver() {
    saveBest(state.level - 1);
    var rows = [
      ["sectors held", Math.max(0, state.level - 1)],
      ["turns played", runStats.turns],
      ["flawless", runStats.flawless],
      ["clean", runStats.clean],
      ["missed", runStats.missed],
      ["forced", runStats.forced],
    ];
    el.overStats.innerHTML = "";
    rows.forEach(function (r) {
      var d = document.createElement("div"); d.className = "stat";
      var a = document.createElement("span"); a.textContent = r[0];
      var b = document.createElement("span"); b.textContent = r[1];
      d.appendChild(a); d.appendChild(b); el.overStats.appendChild(d);
    });
    el.overSeed.textContent = state.seed;
    el.overBest.textContent = best();
    el.over.hidden = false;
    el.again.focus();
  }

  // ------------------------------------------------------------------ wire --

  el.endTurn.addEventListener("click", endTurn);
  el.undo.addEventListener("click", undo);
  el.interBtn.addEventListener("click", advance);
  el.again.addEventListener("click", function () { newRun(); });
  el.replay.addEventListener("click", function () { newRun(state.seed); });
  el.startBtn.addEventListener("click", function () { el.start.hidden = true; });

  document.addEventListener("keydown", function (e) {
    if (!el.start.hidden) { if (e.key === "Enter" || e.key === " ") { el.start.hidden = true; e.preventDefault(); } return; }
    if (!el.inter.hidden) { if (e.key === "Enter" || e.key === " ") { advance(); e.preventDefault(); } return; }
    if (busy) return;
    if (e.key === "Enter") { endTurn(); e.preventDefault(); }
    else if (e.key === "u" || e.key === "z") { undo(); }
    else if (e.key === "1" || e.key === "2") {
      var u = state.units[parseInt(e.key, 10) - 1];
      if (u) selectUnit(u.id);
    } else if (e.key === "Tab" && state) {
      var live = state.units.filter(function (x) { return x.alive; });
      if (live.length) {
        var i = live.findIndex(function (x) { return x.id === selected; });
        selectUnit(live[(i + 1) % live.length].id);
        e.preventDefault();
      }
    }
  });

  /* Pieces are positioned in pixels, so a resize has to reposition them — with
     the transition suppressed, or every rotation looks like a move. */
  function onResize() {
    if (!state) return;
    view.measure();
    view.sync(state, false);
  }
  NS.addEventListener("resize", onResize);
  NS.addEventListener("orientationchange", function () { setTimeout(onResize, 120); });
  if (NS.ResizeObserver) new NS.ResizeObserver(onResize).observe($("tiles"));

  /* Deliberate handles for the browser smoke test and the console. */
  T.currentState = function () { return state; };
  T.uiEndTurn = endTurn;
  T.uiBusy = function () { return busy; };

  newRun(urlSeed());
  el.startSeed.textContent = state.seed;
})();
