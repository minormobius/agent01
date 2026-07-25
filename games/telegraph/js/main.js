/* Telegraph — UI and glue.
 *
 * Renders the board as DOM, routes taps, and — the part that matters — runs the
 * solver over the board as it stood at the start of each turn so it can tell
 * you, afterwards, how many of your options were actually right.
 *
 * The count is shown *after* you commit, never before. Shown before, it would
 * be a hint and you would brute-force it; shown after, it is the game telling
 * you what your decision was worth.
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

  var state = null;        // live board
  var turnStart = null;    // snapshot for UNDO and for the solver
  var selected = null;     // unit id
  var mode = "move";       // move | ability
  var runStats = null;

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
    runStats = { turns: 0, clean: 0, flawless: 0, missed: 0, forced: 0, kills: 0, levels: 0 };
    beginTurn();
    el.over.hidden = true;
    el.inter.hidden = true;
    setReadout("", "Pick a unit. Every red tile is an attack landing at the end of this turn.");
  }

  function beginTurn() {
    turnStart = T.cloneState(state);
    selected = null;
    mode = "move";
    render();
  }

  // ------------------------------------------------------------------ view --

  function threatMap() {
    var f = T.forecast(state), m = {};
    for (var i = 0; i < f.length; i++) {
      var k = f[i].x + "," + f[i].y;
      if (!m[k]) m[k] = { n: 0, dmg: 0, kind: "none" };
      m[k].n++;
      m[k].dmg += f[i].dmg;
      // Worst outcome on the tile wins the colour.
      if (f[i].hitsNode) m[k].kind = "node";
      else if (f[i].hitsUnit && m[k].kind !== "node") m[k].kind = "unit";
      else if (f[i].hitsEnemy && m[k].kind === "none") m[k].kind = "enemy";
    }
    return m;
  }

  function render() {
    if (!state) return;
    el.level.textContent = state.level;
    el.turn.textContent = state.turn + "/" + state.maxTurns;
    el.integrity.textContent = state.integrity + "/" + state.maxIntegrity;
    el.integrity.classList.toggle("low", state.integrity <= 3);

    var threats = threatMap();
    var sel = selected ? T.getUnit(state, selected) : null;
    var moveSet = {}, targetSet = {};
    if (sel && sel.alive) {
      var i, spots = mode === "move" ? T.reachable(state, sel) : [];
      for (i = 0; i < spots.length; i++) moveSet[spots[i].x + "," + spots[i].y] = true;
      var tg = mode === "ability" ? T.abilityTargets(state, sel) : [];
      for (i = 0; i < tg.length; i++) targetSet[tg[i].x + "," + tg[i].y] = true;
    }

    el.board.innerHTML = "";
    for (var y = 0; y < state.h; y++) {
      for (var x = 0; x < state.w; x++) {
        el.board.appendChild(tileEl(x, y, threats, sel, moveSet, targetSet));
      }
    }
    renderUnits();
    renderModes(sel);
    el.undo.disabled = !dirty();
    el.endTurn.disabled = state.phase !== "plan";
  }

  function tileEl(x, y, threats, sel, moveSet, targetSet) {
    var key = x + "," + y;
    var terrain = state.tiles[y * state.w + x];
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tile " + terrain;
    b.setAttribute("data-x", x);
    b.setAttribute("data-y", y);

    var u = T.unitAt(state, x, y), e = T.enemyAt(state, x, y);
    var label = [terrain === "node" ? "node" : terrain === "rock" ? "rock" : "floor"];

    var th = threats[key];
    if (th) {
      b.classList.add("threat", "threat-" + th.kind);
      // Only number the hits that will actually cost something. A "1" floating
      // over a shot landing on bare rock reads as a threat when it is the
      // opposite — it is a shot you have already wasted.
      if (th.kind !== "none") {
        var c = document.createElement("span");
        c.className = "threat-count";
        c.textContent = th.dmg;
        b.appendChild(c);
      }
      label.push(th.kind === "none" ? "incoming, hits nothing"
        : "incoming " + th.dmg + " damage to " + (th.kind === "node" ? "a node" : th.kind === "unit" ? "your unit" : "an enemy"));
    }

    if (u || e) {
      var ent = u || e;
      var spec = u ? T.UNITS[u.kind] : T.ENEMIES[e.kind];
      b.classList.add(u ? "unit" : "enemy", ent.kind);
      var g = document.createElement("span");
      g.className = "glyph";
      g.textContent = spec.glyph;
      b.appendChild(g);
      label.push((u ? spec.name : spec.name) + " " + ent.hp + " of " + ent.maxHp + " health");

      var pips = document.createElement("span");
      pips.className = "pips";
      for (var p = 0; p < ent.maxHp; p++) {
        var dot = document.createElement("span");
        dot.className = "pip" + (p < ent.hp ? "" : " gone");
        pips.appendChild(dot);
      }
      b.appendChild(pips);

      if (e) {
        var arrow = document.createElement("span");
        arrow.className = "facing " + T.DIR_NAME[e.dir];
        arrow.textContent = ["▲", "▶", "▼", "◀"][e.dir];
        b.appendChild(arrow);
        label.push("facing " + T.DIR_NAME[e.dir]);
      }
      if (u && u.alive && !u.acted) b.classList.add("actor");
      if (sel && u && u.id === sel.id) b.classList.add("selected");
    }

    if (moveSet[key]) { b.classList.add("hl-move"); label.push("move here"); }
    if (targetSet[key]) { b.classList.add("hl-target"); label.push("target here"); }

    b.setAttribute("aria-label", (x + 1) + "," + (y + 1) + ": " + label.join(", "));
    b.addEventListener("click", function () { onTile(x, y); });
    return b;
  }

  function renderUnits() {
    el.units.innerHTML = "";
    for (var i = 0; i < state.units.length; i++) {
      (function (u) {
        var spec = T.UNITS[u.kind];
        var b = document.createElement("button");
        b.type = "button";
        b.className = "unit-chip" + (selected === u.id ? " active" : "");
        b.disabled = !u.alive || (u.moved && u.acted);
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
    var spec = T.UNITS[sel.kind];
    mkMode("MOVE", "move", !sel.moved);
    mkMode(sel.kind === "ram" ? "SHOVE" : "STRIKE", "ability",
      !sel.acted && T.abilityTargets(state, sel).length > 0);

    var hint = document.createElement("div");
    hint.className = "mode-btn";
    hint.style.cssText = "flex:2;border:none;text-align:left;font-weight:400;letter-spacing:0;color:var(--dim);padding-left:0";
    hint.textContent = spec.blurb;
    el.modes.appendChild(hint);
  }

  function mkMode(label, m, enabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mode-btn" + (mode === m ? " on" : "");
    b.textContent = label;
    b.disabled = !enabled;
    b.addEventListener("click", function () { mode = m; render(); });
    el.modes.appendChild(b);
  }

  // ----------------------------------------------------------------- input --

  function selectUnit(id) {
    var u = T.getUnit(state, id);
    if (!u || !u.alive) return;
    selected = id;
    mode = u.moved ? "ability" : "move";
    render();
  }

  function onTile(x, y) {
    if (state.phase !== "plan") return;
    var u = T.unitAt(state, x, y);
    if (u && u.alive && (!selected || selected !== u.id)) { selectUnit(u.id); return; }
    if (!selected) return;
    var sel = T.getUnit(state, selected);
    if (!sel || !sel.alive) return;

    if (mode === "move") {
      if (T.moveUnit(state, sel.id, x, y)) {
        // Moving usually means you now want to aim, so offer that next.
        mode = T.abilityTargets(state, sel).length ? "ability" : "move";
        render();
      }
      return;
    }
    if (T.useAbility(state, sel.id, x, y)) {
      selected = null;
      mode = "move";
      render();
    }
  }

  function dirty() {
    return state && turnStart && T.keyOf(state) !== T.keyOf(turnStart);
  }

  function undo() {
    if (!dirty()) return;
    state = T.cloneState(turnStart);
    selected = null; mode = "move";
    render();
    setReadout("", "Turn reset.");
  }

  // -------------------------------------------------------------- end turn --

  function setReadout(cls, html) {
    el.readout.className = cls;
    el.readout.innerHTML = html;
  }

  function endTurn() {
    if (state.phase !== "plan") return;

    // What was actually available at the start of this turn, and what the
    // player is about to settle for.
    var analysis = T.analyseTurn(turnStart);
    var actual = T.costOf(state);
    var grade = T.gradeTurn(analysis, actual);

    state = T.endTurn(state);
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
    setReadout(grade, msg);

    if (state.phase === "lost") { showOver(); return; }
    if (state.phase === "won") { showCleared(); return; }
    beginTurn();
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
    if (e.key === "Enter") { endTurn(); e.preventDefault(); }
    else if (e.key === "u" || e.key === "z") { undo(); }
    else if (e.key === "1" || e.key === "2") {
      var u = state.units[parseInt(e.key, 10) - 1];
      if (u) selectUnit(u.id);
    } else if (e.key === "Tab" && state) {
      // Cycle units without leaving the board.
      var live = state.units.filter(function (x) { return x.alive; });
      if (live.length) {
        var i = live.findIndex(function (x) { return x.id === selected; });
        selectUnit(live[(i + 1) % live.length].id);
        e.preventDefault();
      }
    }
  });

  /* Deliberate handle for the browser smoke test and the console. */
  T.currentState = function () { return state; };
  T.uiEndTurn = endTurn;

  newRun(urlSeed());
  el.startSeed.textContent = state.seed;
})();
