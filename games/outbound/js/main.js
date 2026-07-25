/* Outbound — UI, input and animation.
 *
 * Three rules dominate this file.
 *
 * 1. **The run is silent.** The solver knows, after every single choice,
 *    whether the run can still be finished — and it says nothing until the run
 *    is over. Surfacing it live would announce the moment you erred, and the
 *    gap between erring and finding out is the entire game. Inherited from The
 *    Ratchet, and non-negotiable.
 *
 * 2. **You spend things by dragging them.** This file used to render a list of
 *    "SEND X / BURN THROUGH / LAY OVER" buttons under a vertical stack of
 *    identical bordered rows, and it read as a spreadsheet no matter what the
 *    rows said — because it was one. The verbs are now gestures:
 *
 *        drag a name    → onto the ice  = send them out
 *        drag the gauge → onto the ice  = run the cells hot
 *        drag a name    → into the core = lay up
 *
 *    Three targets, three actions, and spending a person becomes a physical
 *    movement with a direction rather than a row picked from a menu. Tap and
 *    keyboard paths exist for all of it and route through the same
 *    `actionFor()`, so they cannot drift apart from the gesture.
 *
 * 3. **Show the work.** The solver computes a great deal the player never saw.
 *    Two places it is visible now: dead reckoning fogs the horizon during play
 *    (the crew's own estimate, deliberately NOT the solver — see `O.reckon`),
 *    and the ways-through chart draws the real ceiling falling, crossing by
 *    crossing, once the run is over and it is safe to show.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = window;
  var O = NS.OUTBOUND;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    leg: $("leg-value"), fuel: $("fuel-value"), fill: $("fuel-fill"), left: $("left-value"),
    gauge: $("gauge"), grip: $("gauge-grip"),
    horizon: $("horizon"), track: $("horizon-track"), fog: $("fogline"), reckon: $("reckon-line"),
    crossing: $("crossing"), glyph: $("cross-glyph"), place: $("cross-place"),
    haz: $("cross-haz"), prose: $("cross-prose"), need: $("cross-need"),
    tollLine: $("cross-toll"), find: $("cross-find"),
    preview: $("preview"), core: $("core"), coreCost: $("core-cost"),
    crew: $("crew"), readout: $("readout"), log: $("log"), fx: $("fx"), peek: $("peek"),
    start: $("start"), startBtn: $("start-btn"), startSeed: $("start-seed"),
    over: $("over"), overTitle: $("over-title"), overHead: $("over-head"),
    overBody: $("over-body"), overStats: $("over-stats"), overRoll: $("over-roll"),
    overSeed: $("over-seed"), overBest: $("over-best"),
    ceiling: $("ceiling"), ceilingKey: $("ceiling-key"), ceilingWrap: $("ceiling-wrap"),
    again: $("again"), replay: $("replay"), onward: $("onward"),
  };

  var state = null, legStart = null, memo = null, busy = false;
  var reduced = NS.matchMedia && NS.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var haul = { legs: 0, sent: 0, burned: 0, rested: 0, buried: [] };
  var D = { move: reduced ? 0 : 440, beat: reduced ? 0 : 130 };

  /* What is currently in the player's hand: null, {kind:"crew", id} or
     {kind:"fuel"}. Set by a drag OR by a tap — nothing downstream cares which,
     which is what keeps the two input paths honest. */
  var held = null, ghost = null, dragging = false, hoverTarget = null;

  function wait(ms) { return ms ? new Promise(function (r) { setTimeout(r, ms); }) : Promise.resolve(); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  // ------------------------------------------------------------------ seed --
  function urlSeed() {
    var m = /[?&]seed=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setUrlSeed(s) {
    try { var u = new URL(location.href); u.searchParams.set("seed", s); history.replaceState(null, "", u.toString()); }
    catch (e) { /* file:// */ }
  }
  function best() { try { return parseInt(NS.localStorage.getItem("outbound.best") || "0", 10) || 0; } catch (e) { return 0; } }
  function saveBest(n) { try { if (n > best()) NS.localStorage.setItem("outbound.best", String(n)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------- run --

  function newRun(seed) {
    state = O.newGame(seed || O.randomSeed());
    setUrlSeed(state.seed);
    haul = { legs: 0, sent: 0, burned: 0, rested: 0, buried: [] };
    busy = false; held = null;
    el.over.hidden = true;
    el.log.innerHTML = '<div class="empty">The log is empty. Nothing has happened yet.</div>';
    beginLeg(false);
    setReadout("Drag a name onto the ice to send them out. Drag the gauge onto the ice to run " +
      "the cells hot. <b>The people you have are the people you have.</b>");
  }

  function beginLeg(animate) {
    legStart = O.cloneState(state);
    memo = O.newMemo();     // valid for this leg only
    buildHorizon();
    paint(!!animate);
  }

  // ---------------------------------------------------------------- helpers --

  function whoCanHandle(kind) {
    var aboard = {};
    O.alive(state).forEach(function (c) { aboard[c.role] = true; });
    return O.HAZARDS[kind].needs.filter(function (r) { return aboard[r]; });
  }
  function legal() { return state.phase === "travel" ? O.legalActions(state) : []; }
  function canSend(id) { return legal().some(function (a) { return a.type === "send" && a.crew === id; }); }
  function canRest(id) { return legal().some(function (a) { return a.type === "rest" && a.crew === id; }); }
  function canBurn() { return state.phase === "travel"; }

  // -------------------------------------------------------------- horizon --

  function buildHorizon() {
    el.track.innerHTML = "";
    state.stages.forEach(function (st, i) {
      var w = document.createElement("div");
      w.className = "wp";
      w.id = "wp-" + i;
      w.setAttribute("data-at", String(i));
      w.innerHTML = '<span class="salv"></span><span class="mark"></span><span class="tick"></span><span class="num"></span>';
      w.querySelector(".mark").textContent = O.HAZARDS[st.kind].glyph;
      w.querySelector(".num").textContent = i + 1;
      w.querySelector(".salv").textContent = st.reward ? (st.reward.kind === "fuel" ? "▣" : "＋") : "";
      w.addEventListener("click", function () { showPeek(i); });
      el.track.appendChild(w);
    });
  }

  /* Slide the world so the convoy marker stays put. The route moving past a
     fixed ship is what makes this read as travel rather than a repaint. */
  function placeHorizon(animate) {
    var here = $("wp-" + Math.min(state.at, state.stages.length - 1));
    if (!here) return;
    if (!animate) el.horizon.classList.add("no-anim");
    el.track.style.transform = "translateX(" + (-here.offsetLeft) + "px)";

    // The fog bank sits where dead reckoning runs out.
    var r = state.phase === "travel" ? O.reckon(state) : { at: state.at, arrived: false };
    var stop = $("wp-" + Math.min(r.at, state.stages.length - 1));
    var fogAt = r.arrived ? 100000 : (stop ? stop.offsetLeft - here.offsetLeft + 30 : 100000);
    el.fog.style.transform = "translateX(" + fogAt + "px)";
    el.fog.style.opacity = r.arrived ? "0" : "1";

    state.stages.forEach(function (st, i) {
      var w = $("wp-" + i);
      if (w) w.classList.toggle("fog", !r.arrived && i >= r.at && i > state.at);
    });

    if (state.phase !== "travel") {
      el.reckon.className = ""; el.reckon.textContent = "";
    } else if (r.arrived) {
      el.reckon.className = "clear";
      el.reckon.innerHTML = "dead reckoning: <b>the crew think we make it</b>";
    } else {
      var left = Math.max(0, r.at - state.at);
      el.reckon.className = "";
      el.reckon.innerHTML = "dead reckoning: <b>" +
        (left === 0 ? "we stop here" : "about " + plural(left, "crossing") + " more") +
        "</b> — the fog is where their guess runs out";
    }
    if (!animate) { void el.horizon.offsetWidth; el.horizon.classList.remove("no-anim"); }
  }

  // ----------------------------------------------------------------- paint --

  function paint(animate) {
    if (!state) return;
    el.leg.textContent = state.leg;
    el.fuel.textContent = state.fuel + "/" + state.maxFuel;
    el.fill.style.width = (state.maxFuel ? (state.fuel / state.maxFuel) * 100 : 0).toFixed(1) + "%";
    var low = state.fuel <= 3;
    el.fill.classList.toggle("low", low);
    el.fuel.classList.toggle("low", low);
    el.left.textContent = Math.max(0, state.stages.length - state.at) + "/" + state.stages.length;

    var passed = {}, costly = {};
    state.history.forEach(function (h) { if (h.action !== "rest") passed[h.at] = h.action; });
    state.crew.forEach(function (c) { if (!c.alive && c.lostAt !== null) costly[c.lostAt] = true; });

    state.stages.forEach(function (st, i) {
      var w = $("wp-" + i);
      if (!w) return;
      var d = i - state.at;
      var cls = "wp";
      if (d < 0) cls += " past " + (passed[i] === "send" ? "handled" : "burned") + (costly[i] ? " cost" : "");
      else if (d <= 4) cls += " d" + d;
      else cls += " far";
      if (d >= 0 && !whoCanHandle(st.kind).length) cls += " blind";
      w.className = cls;
    });

    paintCrossing();
    placeHorizon(!!animate);
    renderCrew();
    el.gauge.classList.toggle("spent", !canBurn());
    el.grip.innerHTML = canBurn()
      ? "<span>⇡</span> drag onto the ice to burn"
      : "<span>—</span> nothing to spend";
    el.core.classList.toggle("gone", state.phase !== "travel");
    el.coreCost.textContent = "−" + plural(O.REST_COST, "cell");
    armTargets();
  }

  function paintCrossing() {
    if (state.phase !== "travel") {
      el.crossing.className = "";
      el.glyph.textContent = state.phase === "arrived" ? "◎" : "✖";
      el.place.textContent = state.phase === "arrived" ? "the depot" : "stopped";
      el.haz.textContent = ""; el.prose.textContent = ""; el.need.textContent = "";
      el.tollLine.textContent = ""; el.find.textContent = "";
      return;
    }
    var st = O.stageAt(state);
    var hz = O.HAZARDS[st.kind];
    var who = whoCanHandle(st.kind);
    el.crossing.className = who.length ? "" : "blind";
    el.glyph.textContent = hz.glyph;
    el.place.textContent = st.place;
    el.haz.textContent = hz.name;
    el.prose.textContent = st.prose;
    el.need.className = who.length ? "" : "none";
    el.need.textContent = who.length
      ? "a " + who.join(" or a ") + " could handle this"
      : "nobody aboard is trained for this";
    el.tollLine.innerHTML = "<b>" + O.tollAt(state) + "</b> " +
      (O.tollAt(state) === 1 ? "cell" : "cells") + " to run past it";
    el.find.textContent = !st.reward ? ""
      : st.reward.kind === "fuel"
        ? "a stripped vehicle here — handle it and take " + plural(st.reward.amount, "cell")
        : st.reward.name + " is here, walking out — handle it and they come aboard";
  }

  function renderCrew() {
    el.crew.innerHTML = "";
    state.crew.forEach(function (c) {
      var cond = c.alive ? O.condition(c) : "gone";
      var card = document.createElement("div");
      card.className = "hand " + cond
        + (c.alive && canSend(c.id) ? " usable" : "")
        + (held && held.kind === "crew" && held.id === c.id ? (dragging ? " lifted" : " selected") : "");
      card.id = "hand-" + c.id;
      card.setAttribute("data-crew", String(c.id));
      card.innerHTML = '<div class="face"></div><div class="nm"></div><div class="rl"></div>' +
        '<div class="pips"></div><div class="cond"></div>';
      card.querySelector(".face").textContent = O.ROLES[c.role].glyph;
      card.querySelector(".nm").textContent = c.name;
      card.querySelector(".rl").textContent = O.ROLES[c.role].name;
      card.querySelector(".cond").textContent = c.alive ? cond
        : "lost at " + (state.stages[c.lostAt] ? state.stages[c.lostAt].place : "the crossing");
      var pips = card.querySelector(".pips");
      for (var k = 0; k < O.MAX_STRAIN; k++) {
        var p = document.createElement("span");
        p.className = "pip" + (k < c.strain ? " on" : "");
        pips.appendChild(p);
      }
      if (c.alive && state.phase === "travel") attachDragSource(card, { kind: "crew", id: c.id });
      el.crew.appendChild(card);
    });
  }

  function setReadout(html) { el.readout.innerHTML = html; }

  function pushLog(text, cls) {
    var empty = el.log.querySelector(".empty");
    if (empty) empty.remove();
    var line = document.createElement("div");
    line.className = "line" + (cls ? " " + cls : "");
    line.textContent = text;
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
  }

  // -------------------------------------------------------------- the peek --
  /* Perfect information is the thesis, so any waypoint can still be read in
     full. It is just no longer all shouted at once, which is what made it a
     table in the first place. */
  function showPeek(i) {
    var st = state.stages[i];
    if (!st) return;
    var hz = O.HAZARDS[st.kind];
    var who = whoCanHandle(st.kind);
    el.peek.innerHTML =
      '<div class="pk-top"><span class="pk-glyph"></span><div><div class="pk-place"></div>' +
      '<div class="pk-haz"></div></div></div><div class="pk-prose"></div><div class="pk-facts"></div>';
    el.peek.querySelector(".pk-glyph").textContent = hz.glyph;
    el.peek.querySelector(".pk-place").textContent = (i + 1) + ". " + st.place;
    el.peek.querySelector(".pk-haz").textContent = hz.name;
    el.peek.querySelector(".pk-prose").textContent = st.prose;
    el.peek.querySelector(".pk-facts").innerHTML =
      (who.length ? "needs " + who.join(" or ") : '<span class="none">nobody aboard is trained for this</span>') +
      ' · <span class="toll">' + st.toll + (st.toll === 1 ? " cell" : " cells") + " to burn past</span>" +
      (st.reward ? " · " + (st.reward.kind === "fuel" ? "salvage " + st.reward.amount : st.reward.name + " waiting") : "");
    el.peek.hidden = false;
  }
  function hidePeek() { el.peek.hidden = true; }

  // ------------------------------------------------------------ drag & drop --

  function attachDragSource(node, what) {
    node.addEventListener("pointerdown", function (ev) {
      if (busy || state.phase !== "travel") return;
      if (what.kind === "crew" && !canSend(what.id) && !canRest(what.id)) {
        held = null; armTargets(); flashCrossing();   // nothing this person can do here
        return;
      }
      ev.preventDefault();
      startDrag(what, node, ev);
    });
  }

  function startDrag(what, node, ev) {
    held = what; dragging = true; hoverTarget = null;
    document.body.classList.add("dragging");
    node.classList.add("lifted");

    ghost = document.createElement("div");
    ghost.id = "ghost";
    if (what.kind === "fuel") ghost.className = "fuelly";
    ghost.innerHTML = '<div class="g-face"></div><div class="g-nm"></div>';
    if (what.kind === "fuel") {
      ghost.querySelector(".g-face").textContent = "▮";
      ghost.querySelector(".g-nm").textContent = O.tollAt(state) + (O.tollAt(state) === 1 ? " CELL" : " CELLS");
    } else {
      var c = O.crewById(state, what.id);
      ghost.querySelector(".g-face").textContent = O.ROLES[c.role].glyph;
      ghost.querySelector(".g-nm").textContent = c.name;
    }
    document.body.appendChild(ghost);
    moveGhost(ev.clientX, ev.clientY);
    armTargets();

    try { node.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    function onMove(e) { moveGhost(e.clientX, e.clientY); updateHover(e.clientX, e.clientY); }
    function onUp(e) {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onUp);
      node.classList.remove("lifted");
      endDrag(e.clientX, e.clientY);
    }
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
    node.addEventListener("pointercancel", onUp);
  }

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.left = x + "px";
    ghost.style.top = (y - 34) + "px";
  }

  function targetAt(x, y) {
    var n = document.elementFromPoint(x, y);
    while (n && n !== document.body) {
      if (n.id === "crossing") return "crossing";
      if (n.id === "core") return "core";
      n = n.parentNode;
    }
    return null;
  }

  function updateHover(x, y) {
    var t = targetAt(x, y);
    if (t === hoverTarget) return;
    hoverTarget = t;
    el.crossing.classList.toggle("over", t === "crossing" && actionFor("crossing") !== null);
    el.core.classList.toggle("over", t === "core" && actionFor("core") !== null);
    el.crossing.classList.toggle("lethal", t === "crossing" && isLethal());
    showPreview(t);
  }

  /* What dropping the held thing on a given target would DO. One function, so
     the drag path, the tap path, the keyboard path and the forecast can never
     disagree about what is legal. */
  function actionFor(target) {
    if (!held || state.phase !== "travel") return null;
    if (target === "crossing") {
      if (held.kind === "fuel") return canBurn() ? { type: "burn" } : null;
      return canSend(held.id) ? { type: "send", crew: held.id } : null;
    }
    if (target === "core") {
      if (held.kind === "fuel") return null;
      return canRest(held.id) ? { type: "rest", crew: held.id } : null;
    }
    return null;
  }

  function isLethal() {
    if (!held || held.kind !== "crew") return false;
    var c = O.crewById(state, held.id);
    return !!c && c.strain + 1 >= O.MAX_STRAIN;
  }

  /* The forecast shown while you are carrying something over the ice.
     Deliberately the crew's arithmetic and NOT the solver: what this costs, who
     it costs, and where dead reckoning then stops. It never says whether the
     move is correct — that stays silent until the run is over. */
  function showPreview(target) {
    var a = actionFor(target);
    if (!a) { el.preview.className = ""; el.preview.innerHTML = ""; return; }
    var n = O.cloneState(state);
    if (!O.applyAction(n, a)) { el.preview.className = ""; return; }
    var bits = [];
    if (a.type === "send") {
      var c = O.crewById(n, held.id);
      bits.push(c.alive
        ? "<b>" + c.name + "</b> comes back <b>" + O.condition(c) + "</b>"
        : '<span class="bad"><b>' + c.name + "</b> does not come back</span>");
    } else if (a.type === "burn") {
      bits.push(n.phase === "lost"
        ? '<span class="bad">the cells will not carry it</span>'
        : "cells <b>" + state.fuel + " → " + n.fuel + "</b>");
    } else {
      var m = O.crewById(n, held.id);
      bits.push("<b>" + m.name + "</b> recovers to <b>" + O.condition(m) + "</b>, cells <b>" +
        state.fuel + " → " + n.fuel + "</b>, you do not move");
    }
    if (n.phase === "travel") {
      var r = O.reckon(n);
      bits.push(r.arrived ? '<span class="good">reckoning then clears to the depot</span>'
        : "reckoning then reaches <b>" + plural(Math.max(0, r.at - n.at), "more crossing") + "</b>");
    }
    el.preview.className = "on";
    el.preview.innerHTML = bits.join(" · ");
  }

  function armTargets() {
    el.crossing.classList.toggle("armed", !!actionFor("crossing"));
    el.crossing.classList.toggle("fuelly", !!held && held.kind === "fuel");
    el.core.classList.toggle("armed", !!actionFor("core"));
    if (!held) {
      el.crossing.classList.remove("over", "lethal");
      el.core.classList.remove("over");
      el.preview.className = ""; el.preview.innerHTML = "";
    }
  }

  function endDrag(x, y) {
    dragging = false;
    document.body.classList.remove("dragging");
    if (ghost) { ghost.remove(); ghost = null; }
    var a = actionFor(targetAt(x, y));
    var wasHeld = held;
    held = null; hoverTarget = null;
    el.crossing.classList.remove("over", "armed", "lethal", "fuelly");
    el.core.classList.remove("over", "armed");
    el.gauge.classList.remove("lifted");
    el.preview.className = ""; el.preview.innerHTML = "";
    if (a) commit(a);
    else { renderCrew(); if (wasHeld) flashCrossing(); }
  }

  function flashCrossing() {
    if (reduced) return;
    el.crossing.classList.remove("shake");
    void el.crossing.offsetWidth;
    el.crossing.classList.add("shake");
  }

  /* Tap path: first tap picks something up, second tap on a target commits.
     Routed through the same `actionFor`, so it cannot diverge from the drag. */
  function tapPick(what) {
    if (busy || state.phase !== "travel") return;
    held = (held && held.kind === what.kind && held.id === what.id) ? null : what;
    armTargets();
    renderCrew();
    el.gauge.classList.toggle("lifted", !!held && held.kind === "fuel");
    if (held) showPreview("crossing");
  }

  function tapTarget(target) {
    if (!held) return;
    var a = actionFor(target);
    el.gauge.classList.remove("lifted");
    if (a) { held = null; commit(a); } else { flashCrossing(); }
  }

  // ---------------------------------------------------------------- commit --

  function commit(a) {
    if (busy || state.phase !== "travel") return;
    busy = true;
    hidePeek();
    el.gauge.classList.remove("lifted");

    var beforeFuel = state.fuel;
    var logFrom = state.log.length;
    state.events.length = 0;

    if (a.type === "send") haul.sent++;
    if (a.type === "burn") haul.burned++;
    if (a.type === "rest") {
      haul.rested++;
      var rc = el.crew.querySelector('.hand[data-crew="' + a.crew + '"]');
      if (rc) rc.classList.add("resting");
    }

    O.applyAction(state, a);

    state.log.slice(logFrom).forEach(function (l) {
      var lost = state.events.some(function (e) { return e.type === "lost"; });
      pushLog(l.text, lost ? "loss" : a.type === "burn" ? "fuel" : "");
    });

    if (a.type === "burn") floatAt(el.crossing, "−" + (beforeFuel - Math.max(0, state.fuel)), "cost");
    if (a.type === "rest") floatAt(el.core, "−" + O.REST_COST, "cost");

    state.events.forEach(function (e) {
      if (e.type === "lost") {
        haul.buried.push({ name: e.crew.name, role: e.crew.role, place: state.stages[e.at].place, leg: state.leg });
        var card = el.crew.querySelector('.hand[data-crew="' + e.crew.id + '"]');
        if (card) card.classList.add("dying");
        floatAt(card || el.crossing, "lost", "cost");
      }
      if (e.type === "salvage") {
        floatAt(el.gauge, "+" + e.amount, "gain");
        pushLog("Stripped " + plural(e.amount, "cell") + " out of the wreck.", "fuel");
      }
      if (e.type === "joined") {
        pushLog(e.crew.name + " came aboard as " + O.ROLES[e.crew.role].name.toLowerCase() + ".", "good");
      }
    });

    wait(D.beat).then(function () {
      paint(true);
      var joined = state.events.filter(function (e) { return e.type === "joined"; })[0];
      if (joined) {
        var nc = el.crew.querySelector('.hand[data-crew="' + joined.crew.id + '"]');
        if (nc) nc.classList.add("fresh");
      }
      return wait(D.move);
    }).then(function () {
      busy = false;
      if (state.phase === "arrived") { finishLeg(); return; }
      if (state.phase === "lost") { finishRun(); return; }
      paint(false);
    });
  }

  // ------------------------------------------------------------ animation --

  function floatAt(node, text, cls) {
    if (reduced || !node) return;
    var r = node.getBoundingClientRect();
    var f = document.createElement("div");
    f.className = "float " + (cls || "");
    f.textContent = text;
    f.style.left = (r.left + r.width / 2 - 20) + "px";
    f.style.top = (r.top + r.height / 2 - 10) + "px";
    el.fx.appendChild(f);
    setTimeout(function () { f.remove(); }, 1050);
  }

  // --------------------------------------------------------------- endings --

  function crewLine() {
    var live = O.alive(state);
    if (!live.length) return "There is nobody left aboard.";
    return live.map(function (c) { return c.name + " (" + O.condition(c) + ")"; }).join(", ") + ".";
  }

  /* The ways-through chart — the solver's work, drawn. At each decision, how
     many of the options in front of the player kept the run alive. It can only
     fall, so the shape of it IS the run. Only ever built once a leg is over. */
  function drawCeiling(series, fatalIndex) {
    el.ceiling.innerHTML = "";
    if (!series.length) { el.ceilingWrap.hidden = true; return; }
    el.ceilingWrap.hidden = false;
    var max = series.reduce(function (m, p) { return Math.max(m, p.legal); }, 1);
    series.forEach(function (p, i) {
      var bar = document.createElement("div");
      bar.className = "cbar"
        + (p.viable === 0 ? " dead" : p.viable / p.legal <= 0.5 ? " tight" : "")
        + (fatalIndex !== null && i === fatalIndex ? " last fatal" : "");
      bar.title = (p.at + 1) + ". " + p.place + " — " + p.viable + " of " + p.legal + " options kept it alive";
      var h = p.viable === 0 ? 4 : Math.max(6, Math.round((p.viable / max) * 100));
      bar.innerHTML = '<i style="height:' + h + '%"></i>';
      el.ceiling.appendChild(bar);
    });
    var opened = series[0] ? series[0].viable : 0;
    el.ceilingKey.innerHTML = fatalIndex !== null
      ? "you set out with <b>" + opened + "</b> ways through. the dashed line is where the " +
        '<span class="bad">last one closed</span> — everything right of it was already over.'
      : "you set out with <b>" + opened + "</b> ways through and never ran out of them.";
  }

  function finishLeg() {
    haul.legs++;
    saveBest(haul.legs);
    var series = O.ceilingSeries(legStart, state.history, memo);
    var narrow = series.filter(function (p) { return p.legal > 1; })
      .sort(function (a, b) { return a.viable / a.legal - b.viable / b.legal; })[0];
    drawCeiling(series, null);
    el.overTitle.textContent = "MADE THE DEPOT";
    el.overHead.textContent = "leg " + state.leg + " · " + state.stages.length + " crossings behind you";
    el.overBody.innerHTML =
      "You roll in with <b>" + plural(state.fuel, "cell") + "</b> and <b>" + O.alive(state).length + "</b> aboard.<br />" +
      crewLine() +
      (narrow ? "<br /><br />Your narrowest moment was <b>" + narrow.place + "</b> — " +
        narrow.viable + " of " + narrow.legal + " options there kept the run alive." : "");
    el.overStats.innerHTML = "";
    el.overRoll.innerHTML = "";
    el.overSeed.textContent = state.seed;
    el.overBest.textContent = best();
    el.onward.hidden = false;
    el.over.hidden = false;
    el.onward.focus();
  }

  /* The whole reason this game exists. */
  function finishRun() {
    saveBest(haul.legs);
    var pm = O.postMortem(legStart, state.history, memo);
    var series = O.ceilingSeries(legStart, state.history, memo);
    drawCeiling(series, pm ? pm.index : null);

    el.overTitle.textContent = "STRANDED";
    el.overHead.textContent = "leg " + state.leg + " · " +
      state.stages[Math.min(state.at, state.stages.length - 1)].place;

    var body;
    if (!pm) {
      body = "There was no way on from where you sat.";
    } else if (pm.stage === state.at) {
      body = "You ran out of route and cells in the same moment.";
    } else {
      var gap = state.at - pm.stage;
      var what = pm.action.action === "send"
        ? "sent " + nameOf(pm.action.crew) + " out"
        : pm.action.action === "rest" ? "laid up for " + nameOf(pm.action.crew) : "ran the cells hot";
      body =
        "You did not lose here. You lost <b class='fatal'>" + plural(gap, "crossing") +
        " back</b>, at <b>" + state.stages[pm.stage].place + "</b>, when you " + what + ".<br /><br />" +
        "<b>" + pm.survivingOptions + " of the " + pm.legalOptions + "</b> options in front of you at that " +
        "moment would have kept the run alive. You have been driving a dead route ever since.";
    }
    el.overBody.innerHTML = body;

    var rows = [
      ["depots made", haul.legs],
      ["crossings driven", haul.sent + haul.burned],
      ["people sent out", haul.sent],
      ["lay-ups bought", haul.rested],
    ];
    el.overStats.innerHTML = "";
    rows.forEach(function (r) {
      var d = document.createElement("div"); d.className = "stat";
      var a = document.createElement("span"); a.textContent = r[0];
      var b = document.createElement("span"); b.textContent = r[1];
      d.appendChild(a); d.appendChild(b); el.overStats.appendChild(d);
    });

    el.overRoll.innerHTML = haul.buried.length
      ? "<b>lost on this run</b><br />" + haul.buried.map(function (b) {
          return '<span class="nm">' + b.name + "</span> · " + O.ROLES[b.role].name.toLowerCase() +
            " · " + b.place + ", leg " + b.leg;
        }).join("<br />")
      : "You did not lose anybody. You just could not go on.";

    el.overSeed.textContent = state.seed;
    el.overBest.textContent = best();
    el.onward.hidden = true;
    el.over.hidden = false;
    el.again.focus();
  }

  function nameOf(id) {
    var c = O.crewById(state, id);
    return c ? c.name : "someone";
  }

  function onward() {
    state = O.nextLeg(state);
    el.over.hidden = true;
    beginLeg(false);
    pushLog("— made the depot. Cells to " + state.fuel + ". Leg " + state.leg + " begins. —", "good");
    setReadout("Leg <b>" + state.leg + "</b>. <b>" + state.stages.length + "</b> crossings, <b>" +
      O.alive(state).length + "</b> aboard, <b>" + plural(state.fuel, "cell") + "</b>. " +
      "The depot sold you cells. It could not sell you people.");
  }

  // ------------------------------------------------------------------ wire --

  attachDragSource(el.gauge, { kind: "fuel" });
  el.gauge.addEventListener("click", function () { if (!dragging) tapPick({ kind: "fuel" }); });
  el.crossing.addEventListener("click", function () { if (!dragging) tapTarget("crossing"); });
  el.core.addEventListener("click", function () { if (!dragging) tapTarget("core"); });
  el.crew.addEventListener("click", function (e) {
    if (dragging) return;
    var card = e.target.closest ? e.target.closest(".hand") : null;
    if (!card) return;
    var id = parseInt(card.getAttribute("data-crew"), 10);
    var c = O.crewById(state, id);
    if (c && c.alive) tapPick({ kind: "crew", id: id });
  });

  document.addEventListener("click", function (e) {
    if (el.peek.hidden) return;
    if (!el.peek.contains(e.target) && !(e.target.closest && e.target.closest(".wp"))) hidePeek();
  });

  el.startBtn.addEventListener("click", function () { el.start.hidden = true; });
  el.again.addEventListener("click", function () { newRun(); });
  el.replay.addEventListener("click", function () { newRun(state.seed); });
  el.onward.addEventListener("click", onward);
  NS.addEventListener("resize", function () { if (state) placeHorizon(false); });

  document.addEventListener("keydown", function (e) {
    if (!el.start.hidden) { if (e.key === "Enter" || e.key === " ") { el.start.hidden = true; e.preventDefault(); } return; }
    if (!el.over.hidden) {
      if (e.key === "Enter") { (el.onward.hidden ? el.again : el.onward).click(); e.preventDefault(); }
      return;
    }
    if (e.key === "Escape") { held = null; hidePeek(); armTargets(); renderCrew(); return; }
    if (busy || !state || state.phase !== "travel") return;
    /* Everything the gestures do, from a keyboard: 1-9 picks up a crew member,
       B picks up the cells, Enter drops what you are holding on the ice, L lays
       the held person up in the core. */
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var live = O.alive(state);
      if (live[n - 1]) tapPick({ kind: "crew", id: live[n - 1].id });
      return;
    }
    if (e.key === "b" || e.key === "B") { tapPick({ kind: "fuel" }); return; }
    if (e.key === "Enter") { tapTarget("crossing"); return; }
    if (e.key === "l" || e.key === "L") { tapTarget("core"); return; }
  });

  /* Deliberate handles for the browser smoke test and the console. */
  O.currentState = function () { return state; };
  O.uiBusy = function () { return busy; };
  O.uiCommit = commit;
  O.uiLegal = legal;

  newRun(urlSeed());
  el.startSeed.textContent = state.seed;
})();
