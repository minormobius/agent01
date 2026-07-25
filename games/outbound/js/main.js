/* Outbound — UI, input and animation.
 *
 * Two rules dominate this file.
 *
 * 1. **The haul is silent.** The solver knows, after every single choice,
 *    whether the haul can still be finished — and it says nothing until the
 *    haul is over. Surfacing it live would announce the moment you erred, and
 *    the gap between erring and finding out is the entire game. Inherited from
 *    The Ratchet, and non-negotiable.
 *
 * 2. **Everything the player spends has a name.** The Ratchet said "SPEND
 *    ROPE"; this says "SEND MIRA VESK". The mechanic underneath is identical —
 *    which is the point. The difference between a spreadsheet and a journey is
 *    almost entirely in what the buttons say and whether anything is written
 *    down afterwards.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = window;
  var O = NS.OUTBOUND;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    leg: $("leg-value"), fuel: $("fuel-value"), fill: $("fuel-fill"), left: $("left-value"),
    chart: $("chart"), ship: $("ship"), crew: $("crew"), actions: $("actions"),
    log: $("log"), readout: $("readout"), fx: $("fx"),
    start: $("start"), startBtn: $("start-btn"), startSeed: $("start-seed"),
    over: $("over"), overTitle: $("over-title"), overHead: $("over-head"),
    overBody: $("over-body"), overStats: $("over-stats"), overRoll: $("over-roll"),
    overSeed: $("over-seed"), overBest: $("over-best"),
    again: $("again"), replay: $("replay"), onward: $("onward"),
  };

  var state = null, legStart = null, memo = null, busy = false;
  var reduced = NS.matchMedia && NS.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var haul = { legs: 0, sent: 0, burned: 0, rested: 0, buried: [] };
  var D = { move: reduced ? 0 : 360, fly: reduced ? 0 : 340, beat: reduced ? 0 : 120 };

  function wait(ms) { return ms ? new Promise(function (r) { setTimeout(r, ms); }) : Promise.resolve(); }

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

  // ------------------------------------------------------------------ haul --

  function newHaul(seed) {
    state = O.newGame(seed || O.randomSeed());
    setUrlSeed(state.seed);
    haul = { legs: 0, sent: 0, burned: 0, rested: 0, buried: [] };
    busy = false;
    el.over.hidden = true;
    el.log.innerHTML = '<div class="empty">The log is empty. Nothing has happened yet.</div>';
    beginLeg();
    setReadout("", "The whole run is charted. Nothing out there is hidden — " +
      "the only pressure is that <b>the people you have are the people you have</b>.");
  }

  function beginLeg() {
    legStart = O.cloneState(state);
    memo = O.newMemo();     // valid for this leg only
    buildChart();
    paint(false);
  }

  // ----------------------------------------------------------------- chart --

  /* Which disciplines aboard could meet a given kind of trouble. Recomputed on
     every paint, because the crew changes underneath it. */
  function whoCanHandle(kind) {
    var aboard = {};
    O.alive(state).forEach(function (c) { aboard[c.role] = true; });
    return O.HAZARDS[kind].needs.filter(function (r) { return aboard[r]; });
  }

  function buildChart() {
    Array.prototype.slice.call(el.chart.querySelectorAll(".sys")).forEach(function (n) { n.remove(); });
    state.stages.forEach(function (st, i) {
      var haz = O.HAZARDS[st.kind];
      var row = document.createElement("div");
      row.className = "sys";
      row.id = "sys-" + i;

      var idx = document.createElement("span");
      idx.className = "idx"; idx.textContent = i + 1;

      var body = document.createElement("div");
      body.className = "body";
      var place = document.createElement("div");
      place.className = "place"; place.textContent = st.place;
      var hazLine = document.createElement("div");
      hazLine.className = "haz";
      body.appendChild(place); body.appendChild(hazLine);

      /* The prose is only shown for the system you are actually at. All of it at
         once is a wall of text; one line at the place you are standing is a
         ship's log. */
      var prose = document.createElement("div");
      prose.className = "prose";
      prose.textContent = st.prose;
      body.appendChild(prose);

      if (st.reward) {
        var f = document.createElement("div");
        f.className = "find";
        f.textContent = st.reward.kind === "fuel"
          ? "salvage here — handle it and take " + st.reward.amount + " fuel"
          : st.reward.name + " is here, looking for a berth — handle it and they sign on";
        body.appendChild(f);
      }

      var toll = document.createElement("span");
      toll.className = "toll"; toll.textContent = "−" + st.toll;

      row.appendChild(idx); row.appendChild(body); row.appendChild(toll);
      el.chart.appendChild(row);
    });
  }

  function moveShip(animate) {
    var i = Math.min(state.at, state.stages.length - 1);
    var row = $("sys-" + i);
    if (!row) return;
    if (!animate) el.chart.classList.add("no-anim");
    el.ship.style.transform = "translateY(" + (row.offsetTop + row.offsetHeight / 2 - 10) + "px)";
    if (!animate) { void el.chart.offsetWidth; el.chart.classList.remove("no-anim"); }
  }

  // ----------------------------------------------------------------- paint --

  function paint(animateShip) {
    if (!state) return;
    el.leg.textContent = state.leg;
    el.fuel.textContent = state.fuel + "/" + state.maxFuel;
    var frac = state.maxFuel ? state.fuel / state.maxFuel : 0;
    el.fill.style.width = (frac * 100).toFixed(1) + "%";
    var low = state.fuel <= 3;
    el.fill.classList.toggle("low", low);
    el.fuel.classList.toggle("low", low);
    el.left.textContent = Math.max(0, state.stages.length - state.at) + "/" + state.stages.length;

    // How each system behind you was passed — and whether it cost someone.
    var passed = {}, costly = {};
    state.history.forEach(function (h) { if (h.action !== "rest") passed[h.at] = h.action; });
    state.crew.forEach(function (c) { if (!c.alive && c.lostAt !== null) costly[c.lostAt] = true; });

    state.stages.forEach(function (st, i) {
      var row = $("sys-" + i);
      if (!row) return;
      var cls = i < state.at ? "done " + (passed[i] === "send" ? "handled" : "burned")
        : i === state.at ? "here" : "ahead";
      if (i < state.at && costly[i]) cls += " cost";
      var who = whoCanHandle(st.kind);
      if (!who.length && i >= state.at) cls += " blind";
      row.className = "sys " + cls;

      var haz = O.HAZARDS[st.kind];
      row.querySelector(".haz").innerHTML = haz.name + " · " + (who.length
        ? 'needs <span class="req">' + who.join(" or ") + "</span>"
        : '<span class="none">nobody aboard is trained for this</span>');
      var prose = row.querySelector(".prose");
      if (prose) prose.style.display = (i === state.at && state.phase === "travel") ? "" : "none";
    });

    el.ship.classList.toggle("stranded", state.phase === "lost");
    moveShip(!!animateShip);

    renderCrew();
    renderActions();
  }

  function renderCrew() {
    el.crew.innerHTML = "";
    var usable = {};
    if (state.phase === "travel") {
      O.HAZARDS[O.stageAt(state).kind].needs.forEach(function (r) { usable[r] = true; });
    }
    state.crew.forEach(function (c) {
      var cond = c.alive ? O.condition(c) : "gone";
      var card = document.createElement("div");
      card.className = "hand " + cond + (c.alive && usable[c.role] ? " usable" : "");
      card.id = "hand-" + c.id;
      card.setAttribute("data-crew", String(c.id));

      var face = document.createElement("div");
      face.className = "face"; face.textContent = O.ROLES[c.role].glyph;

      var who = document.createElement("div");
      who.className = "who";
      var nm = document.createElement("div");
      nm.className = "nm"; nm.textContent = c.name;
      var rl = document.createElement("div");
      rl.className = "rl"; rl.textContent = O.ROLES[c.role].name;
      var cd = document.createElement("div");
      cd.className = "cond";
      cd.textContent = c.alive ? cond : "lost at " + (state.stages[c.lostAt] ? state.stages[c.lostAt].place : "sea");
      who.appendChild(nm); who.appendChild(rl); who.appendChild(cd);

      var pips = document.createElement("div");
      pips.className = "pips";
      for (var k = 0; k < O.MAX_STRAIN; k++) {
        var p = document.createElement("span");
        p.className = "pip" + (k < c.strain ? " on" : "");
        pips.appendChild(p);
      }

      card.appendChild(face); card.appendChild(who); card.appendChild(pips);
      el.crew.appendChild(card);
    });
  }

  function renderActions() {
    el.actions.innerHTML = "";
    if (state.phase !== "travel") return;
    O.legalActions(state).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act " + a.type;
      b.disabled = busy;
      var what = document.createElement("span");
      what.className = "what";
      var cost = document.createElement("span");
      cost.className = "cost";

      if (a.type === "send") {
        var c = O.crewById(state, a.crew);
        var fatal = c.strain + 1 >= O.MAX_STRAIN;
        if (fatal) b.className += " risky";
        what.textContent = "SEND " + c.name.toUpperCase();
        /* The warning is about the PERSON, not the position — it is information
           the player already has (their condition is on their card), stated
           plainly so nobody loses someone to a misread. Saying it spoils
           nothing: what it costs the haul later is still hidden.

           Derived from the condition ladder rather than written out, because
           hard-coding the wording made every send read "they will be failing
           after this" the moment maxStrain moved from 3 to 2 — which was simply
           untrue, a fresh hand comes back tired. */
        cost.textContent = fatal
          ? "they will not come back"
          : "they will be " + O.condition({ strain: c.strain + 1 }) + " after this";
      } else if (a.type === "burn") {
        what.textContent = "BURN THROUGH";
        cost.textContent = "−" + O.tollAt(state) + " fuel";
      } else {
        var m = O.crewById(state, a.crew);
        what.textContent = "LAY OVER · " + m.name.toUpperCase();
        cost.textContent = "−" + O.REST_COST + " fuel · they recover · you stay here";
      }
      b.appendChild(what); b.appendChild(cost);
      b.addEventListener("click", function () { choose(a); });
      el.actions.appendChild(b);
    });
  }

  function setReadout(cls, html) { el.readout.className = cls; el.readout.innerHTML = html; }

  /* The log. This is the single biggest reason the game reads as a journey — a
     run you can scroll back through is a story, a final score is a result. */
  function pushLog(text, cls) {
    var empty = el.log.querySelector(".empty");
    if (empty) empty.remove();
    var line = document.createElement("div");
    line.className = "line" + (cls ? " " + cls : "");
    line.textContent = text;
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
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

  /* Send the person across from the roster to the system they are handling. The
     point is that you watch which of your people just went out there. */
  function flyHand(id, targetNode) {
    if (reduced) return;
    var card = el.crew.querySelector('.hand[data-crew="' + id + '"]');
    if (!card || !targetNode) return;
    card.classList.add("working");
    var c = O.crewById(state, id);
    var from = card.getBoundingClientRect(), to = targetNode.getBoundingClientRect();
    var f = document.createElement("div");
    f.className = "flyer";
    f.textContent = O.ROLES[c.role].glyph;
    f.style.left = (from.left + 15) + "px";
    f.style.top = (from.top + from.height / 2 - 8) + "px";
    el.fx.appendChild(f);
    requestAnimationFrame(function () {
      f.style.transform = "translate(" +
        (to.left + to.width / 2 - from.left - 15) + "px," +
        (to.top + to.height / 2 - from.top - from.height / 2) + "px)";
      f.style.opacity = "0.2";
    });
    setTimeout(function () { f.remove(); }, D.fly + 80);
  }

  // ---------------------------------------------------------------- choose --

  function choose(a) {
    if (busy || state.phase !== "travel") return;
    busy = true;
    renderActions();

    var sysNode = $("sys-" + state.at);
    var beforeFuel = state.fuel;
    var logFrom = state.log.length;
    state.events.length = 0;

    if (a.type === "send") { flyHand(a.crew, sysNode); haul.sent++; }
    if (a.type === "burn") haul.burned++;
    if (a.type === "rest") {
      haul.rested++;
      var rc = el.crew.querySelector('.hand[data-crew="' + a.crew + '"]');
      if (rc) rc.classList.add("resting");
    }

    wait(a.type === "send" ? D.fly : 0).then(function () {
      O.applyAction(state, a);

      // Everything the rules wrote about this move, into the log verbatim.
      state.log.slice(logFrom).forEach(function (l) {
        var lost = state.events.some(function (e) { return e.type === "lost"; });
        pushLog(l.text, lost ? "loss" : a.type === "burn" ? "fuel" : "");
      });

      if (a.type === "burn") floatAt(sysNode, "−" + (beforeFuel - Math.max(0, state.fuel)), "cost");
      if (a.type === "rest") floatAt(el.fill.parentNode, "−" + O.REST_COST, "cost");

      state.events.forEach(function (e) {
        if (e.type === "lost") {
          haul.buried.push({ name: e.crew.name, role: e.crew.role, place: state.stages[e.at].place, leg: state.leg });
          var card = el.crew.querySelector('.hand[data-crew="' + e.crew.id + '"]');
          if (card) card.classList.add("dying");
          floatAt(card || sysNode, "lost", "cost");
        }
        if (e.type === "salvage") {
          floatAt(el.fill.parentNode, "+" + e.amount, "gain");
          pushLog("Stripped " + e.amount + " units of fuel out of the wreckage.", "fuel");
        }
        if (e.type === "joined") {
          pushLog(e.crew.name + " signed on as " + O.ROLES[e.crew.role].name.toLowerCase() + ".", "good");
        }
      });

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
      if (state.phase === "lost") { finishHaul(); return; }
      paint(false);
    });
  }

  // --------------------------------------------------------------- endings --

  function crewLine() {
    var live = O.alive(state);
    if (!live.length) return "There is nobody left aboard.";
    return live.map(function (c) { return c.name + " (" + O.condition(c) + ")"; }).join(", ") + ".";
  }

  function finishLeg() {
    haul.legs++;
    saveBest(haul.legs);
    var narrow = narrowestOnLeg();
    el.overTitle.textContent = "MADE PORT";
    el.overHead.textContent = "leg " + state.leg + " · " + state.stages.length + " systems behind you";
    el.overBody.innerHTML =
      "You come in with <b>" + state.fuel + "</b> fuel and <b>" + O.alive(state).length + "</b> aboard.<br />" +
      crewLine() +
      (narrow ? "<br /><br />Your narrowest moment was <b>" + state.stages[narrow.at].place + "</b> — " +
        narrow.viable + " of " + narrow.legal + " options there kept the haul alive." : "");
    el.overStats.innerHTML = "";
    el.overRoll.innerHTML = "";
    el.overSeed.textContent = state.seed;
    el.overBest.textContent = best();
    el.onward.hidden = false;
    el.over.hidden = false;
    el.onward.focus();
  }

  /* Replay the leg the player actually flew and find the point where the fewest
     options kept it alive. Only ever shown after the leg is over. */
  function narrowestOnLeg() {
    var s = O.cloneState(legStart), found = null;
    for (var i = 0; i < state.history.length; i++) {
      var h = state.history[i];
      if (s.phase !== "travel") break;
      var a = O.analyseChoice(s, memo);
      if (a.legal > 1 && (!found || a.viable / a.legal < found.viable / found.legal)) {
        found = { at: s.at, viable: a.viable, legal: a.legal };
      }
      O.applyAction(s, h.action === "burn" ? { type: "burn" } : { type: h.action, crew: h.crew });
    }
    return found;
  }

  /* The whole reason this game exists. */
  function finishHaul() {
    saveBest(haul.legs);
    var pm = O.postMortem(legStart, state.history, memo);
    el.overTitle.textContent = "STRANDED";
    el.overHead.textContent = "leg " + state.leg + " · " + state.stages[Math.min(state.at, state.stages.length - 1)].place;

    var body;
    if (!pm) {
      // Viable at every step and still lost — only reachable if the haul was
      // already dead on arrival, which the generator is supposed to prevent.
      body = "There was no way on from where you sat.";
    } else if (pm.stage === state.at) {
      body = "You ran out of road and fuel in the same moment.";
    } else {
      var gap = state.at - pm.stage;
      var where = state.stages[pm.stage].place;
      var what = pm.action.action === "send"
        ? "sent " + nameOf(pm.action.crew)
        : pm.action.action === "rest" ? "laid over with " + nameOf(pm.action.crew) : "burned through";
      body =
        "You did not lose here. You lost <b class='fatal'>" + gap + " system" + (gap > 1 ? "s" : "") +
        " back</b>, at <b>" + where + "</b>, when you " + what + ".<br /><br />" +
        "<b>" + pm.survivingOptions + " of the " + pm.legalOptions + "</b> options in front of you at that moment " +
        "would have kept the haul alive. You have been flying a dead run ever since.";
    }
    el.overBody.innerHTML = body;

    var rows = [
      ["ports made", haul.legs],
      ["systems crossed", haul.sent + haul.burned],
      ["people sent out", haul.sent],
      ["layovers bought", haul.rested],
    ];
    el.overStats.innerHTML = "";
    rows.forEach(function (r) {
      var d = document.createElement("div"); d.className = "stat";
      var a = document.createElement("span"); a.textContent = r[0];
      var b = document.createElement("span"); b.textContent = r[1];
      d.appendChild(a); d.appendChild(b); el.overStats.appendChild(d);
    });

    /* The roll of the dead. The one thing on this screen worth reading twice,
       and the reason the resource is people and not rope. */
    if (haul.buried.length) {
      el.overRoll.innerHTML = "<b>lost on this haul</b><br />" + haul.buried.map(function (b) {
        return '<span class="nm">' + b.name + "</span> · " + O.ROLES[b.role].name.toLowerCase() +
          " · " + b.place + ", leg " + b.leg;
      }).join("<br />");
    } else {
      el.overRoll.innerHTML = "You did not lose anybody. You just could not go on.";
    }

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
    beginLeg();
    pushLog("— made port. Tanks topped to " + state.fuel + ". Leg " + state.leg + " begins. —", "good");
    setReadout("", "Leg " + state.leg + ". <b>" + state.stages.length + "</b> systems, <b>" +
      O.alive(state).length + "</b> aboard, <b>" + state.fuel + "</b> fuel. " +
      "The port sold you fuel. It could not sell you people.");
  }

  // ------------------------------------------------------------------ wire --

  el.startBtn.addEventListener("click", function () { el.start.hidden = true; });
  el.again.addEventListener("click", function () { newHaul(); });
  el.replay.addEventListener("click", function () { newHaul(state.seed); });
  el.onward.addEventListener("click", onward);
  NS.addEventListener("resize", function () { if (state) moveShip(false); });

  document.addEventListener("keydown", function (e) {
    if (!el.start.hidden) { if (e.key === "Enter" || e.key === " ") { el.start.hidden = true; e.preventDefault(); } return; }
    if (!el.over.hidden) {
      if (e.key === "Enter") { (el.onward.hidden ? el.again : el.onward).click(); e.preventDefault(); }
      return;
    }
    if (busy) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var btns = el.actions.querySelectorAll(".act");
      if (btns[n - 1]) btns[n - 1].click();
    }
  });

  /* Deliberate handles for the browser smoke test and the console. */
  O.currentState = function () { return state; };
  O.uiBusy = function () { return busy; };
  O.uiChoose = choose;

  newHaul(urlSeed());
  el.startSeed.textContent = state.seed;
})();
