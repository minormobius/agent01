/* The Ratchet — UI, input and animation.
 *
 * One design rule dominates this file: **the run is silent.** The solver knows,
 * after every single choice, whether the route is still completable — and it
 * says nothing until the run is over. Surfacing it live would announce the
 * moment you erred, and the gap between erring and finding out is the entire
 * game. Telegraph can afford to grade you every turn because its turn is over;
 * here the consequence is still in the future, so the grading waits.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = window;
  var R = NS.RATCHET;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    route: $("route-value"), supply: $("supply-value"), fill: $("supply-fill"),
    left: $("left-value"),
    track: $("track"), walker: $("walker"), kit: $("kit"), actions: $("actions"),
    readout: $("readout"), fx: $("fx"),
    start: $("start"), startBtn: $("start-btn"), startSeed: $("start-seed"),
    over: $("over"), overTitle: $("over-title"), overHead: $("over-head"),
    overBody: $("over-body"), overStats: $("over-stats"), overSeed: $("over-seed"),
    overBest: $("over-best"), again: $("again"), replay: $("replay"), onward: $("onward"),
  };

  var state = null, routeStart = null, memo = null, busy = false;
  var reduced = NS.matchMedia && NS.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var run = { routes: 0, spent: 0, walked: 0, scrapped: 0 };
  var D = { walk: reduced ? 0 : 340, fly: reduced ? 0 : 330, beat: reduced ? 0 : 120 };

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
  function best() { try { return parseInt(NS.localStorage.getItem("ratchet.best") || "0", 10) || 0; } catch (e) { return 0; } }
  function saveBest(n) { try { if (n > best()) NS.localStorage.setItem("ratchet.best", String(n)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------- run --

  function newRun(seed) {
    state = R.newGame(seed || R.randomSeed());
    setUrlSeed(state.seed);
    run = { routes: 0, spent: 0, walked: 0, scrapped: 0 };
    busy = false;
    el.over.hidden = true;
    beginRoute();
    setReadout("", "The whole road is in front of you. Every tool is single use.");
  }

  function beginRoute() {
    routeStart = R.cloneState(state);
    memo = R.newMemo();     // valid for this route only
    buildTrack();
    paint(false);
  }

  // ----------------------------------------------------------------- track --

  function buildTrack() {
    // Rebuilt per route (terrain is fixed for a route); the walker survives.
    Array.prototype.slice.call(el.track.querySelectorAll(".stage")).forEach(function (n) { n.remove(); });
    state.stages.forEach(function (st, i) {
      var obs = R.OBSTACLES[st.kind];
      var row = document.createElement("div");
      row.className = "stage";
      row.id = "stage-" + i;

      var idx = document.createElement("span");
      idx.className = "idx"; idx.textContent = i + 1;

      var body = document.createElement("div");
      body.className = "body";
      var name = document.createElement("div");
      name.className = "name"; name.textContent = obs.name;
      var sub = document.createElement("div");
      sub.className = "sub";
      // `req`, not `tool` — the kit chips own `.tool`, and sharing the class
      // gave every one of these inline names a chip's border and padding,
      // tripling the height of every row.
      sub.innerHTML = "pass with " + obs.accepts.map(function (t) {
        return '<span class="req">' + R.TOOLS[t].glyph + " " + R.TOOLS[t].name + "</span>";
      }).join(" · ");
      body.appendChild(name); body.appendChild(sub);
      if (st.reward) {
        var c = document.createElement("div");
        c.className = "cache";
        c.textContent = "cache — solve it and take a " + R.TOOLS[st.reward].name;
        body.appendChild(c);
      }

      var toll = document.createElement("span");
      toll.className = "toll"; toll.textContent = "−" + st.toll;

      row.appendChild(idx); row.appendChild(body); row.appendChild(toll);
      el.track.appendChild(row);
    });
  }

  function moveWalker(animate) {
    var i = Math.min(state.at, state.stages.length - 1);
    var row = $("stage-" + i);
    if (!row) return;
    if (!animate) el.track.classList.add("no-anim");
    el.walker.style.transform = "translateY(" + (row.offsetTop + row.offsetHeight / 2 - 10) + "px)";
    if (!animate) { void el.track.offsetWidth; el.track.classList.remove("no-anim"); }
  }

  // ----------------------------------------------------------------- paint --

  function paint(animateWalker) {
    if (!state) return;
    el.route.textContent = state.route;
    el.supply.textContent = state.supply + "/" + state.maxSupply;
    var frac = state.supply / state.maxSupply;
    el.fill.style.width = (frac * 100).toFixed(1) + "%";
    var low = state.supply <= 2;
    el.fill.classList.toggle("low", low);
    el.supply.classList.toggle("low", low);
    el.left.textContent = Math.max(0, state.stages.length - state.at) + "/" + state.stages.length;

    // Stage rows: behind / here / ahead, plus how each passed one was passed.
    var passed = {};
    state.history.forEach(function (h) { if (h.action !== "scrap") passed[h.at] = h.action; });
    state.stages.forEach(function (st, i) {
      var row = $("stage-" + i);
      if (!row) return;
      row.className = "stage " + (i < state.at ? "done " + (passed[i] === "use" ? "solved" : "walked")
        : i === state.at ? "here" : "ahead");
    });
    el.walker.classList.toggle("stranded", state.phase === "lost");
    moveWalker(!!animateWalker);

    renderKit();
    renderActions();
  }

  function renderKit() {
    el.kit.innerHTML = "";
    var carried = R.kitList(state.kit);
    if (!carried.length) {
      var e = document.createElement("div");
      e.className = "kit-empty";
      e.textContent = "nothing left to spend";
      el.kit.appendChild(e);
      return;
    }
    var usable = {};
    if (state.phase === "travel") {
      R.OBSTACLES[R.stageAt(state).kind].accepts.forEach(function (t) { usable[t] = true; });
    }
    carried.forEach(function (t, n) {
      var spec = R.TOOLS[t];
      var chip = document.createElement("div");
      chip.className = "tool" + (usable[t] ? " usable" : "");
      chip.id = "tool-" + t + "-" + n;
      chip.setAttribute("data-tool", t);
      chip.innerHTML = '<span class="g"></span><span class="n"></span>';
      chip.querySelector(".g").textContent = spec.glyph;
      chip.querySelector(".n").textContent = spec.name;
      el.kit.appendChild(chip);
    });
  }

  function renderActions() {
    el.actions.innerHTML = "";
    if (state.phase !== "travel") return;
    R.legalActions(state).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "act " + a.type;
      b.disabled = busy;
      var what = document.createElement("span");
      what.className = "what";
      var cost = document.createElement("span");
      cost.className = "cost";
      if (a.type === "use") {
        what.textContent = "SPEND " + R.TOOLS[a.tool].name;
        cost.textContent = "cross · keep your supply";
      } else if (a.type === "pay") {
        what.textContent = "PUSH THROUGH";
        cost.textContent = "−" + R.stageAt(state).toll + " supply";
      } else {
        what.textContent = "SCRAP " + R.TOOLS[a.tool].name;
        cost.textContent = "+" + R.SCRAP_VALUE + " supply · stay here";
      }
      b.appendChild(what); b.appendChild(cost);
      b.addEventListener("click", function () { choose(a); });
      el.actions.appendChild(b);
    });
  }

  function setReadout(cls, html) { el.readout.className = cls; el.readout.innerHTML = html; }

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
    setTimeout(function () { f.remove(); }, 1000);
  }

  /* Send the tool from the kit to the stage it is being spent on. The point is
     that you can see which of your things just left you. */
  function flyTool(tool, targetNode) {
    if (reduced) return;
    var chip = el.kit.querySelector('.tool[data-tool="' + tool + '"]');
    if (!chip || !targetNode) return;
    chip.classList.add("spending");
    var from = chip.getBoundingClientRect(), to = targetNode.getBoundingClientRect();
    var f = document.createElement("div");
    f.className = "flyer";
    f.textContent = R.TOOLS[tool].glyph;
    f.style.left = (from.left + from.width / 2) + "px";
    f.style.top = (from.top + from.height / 2 - 8) + "px";
    el.fx.appendChild(f);
    requestAnimationFrame(function () {
      f.style.transform = "translate(" +
        (to.left + to.width / 2 - from.left - from.width / 2) + "px," +
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

    var stageNode = $("stage-" + state.at);
    var before = state.supply;
    state.events.length = 0;

    if (a.type === "use") { flyTool(a.tool, stageNode); run.spent++; }
    if (a.type === "scrap") {
      var chip = el.kit.querySelector('.tool[data-tool="' + a.tool + '"]');
      if (chip) chip.classList.add("spending");
      run.scrapped++;
    }
    if (a.type === "pay") run.walked++;

    wait(a.type === "pay" ? 0 : D.fly).then(function () {
      R.applyAction(state, a);
      if (a.type === "pay") floatAt(stageNode, "−" + (before - Math.max(0, state.supply)), "cost");
      if (a.type === "scrap") floatAt(el.fill.parentNode, "+" + (state.supply - before), "gain");
      var reward = state.events.filter(function (e) { return e.type === "reward"; })[0];
      paint(true);
      if (reward) floatAt(el.kit, "+ " + R.TOOLS[reward.tool].name, "good");
      return wait(D.walk);
    }).then(function () {
      busy = false;
      if (state.phase === "won") { finishRoute(); return; }
      if (state.phase === "lost") { finishRun(); return; }
      paint(false);
    });
  }

  // --------------------------------------------------------------- endings --

  function finishRoute() {
    run.routes++;
    saveBest(run.routes);
    // On a completed route the tightest moment is safe to reveal: it is over,
    // and it teaches without having spoiled anything.
    var narrow = narrowestOnRoute();
    el.overTitle.textContent = "ROUTE " + state.route + " CROSSED";
    el.overHead.textContent = "the road ends";
    el.overBody.innerHTML =
      "You arrive with <b>" + state.supply + "</b> supply" +
      (R.kitTotal(state.kit) ? " and " + R.kitTotal(state.kit) + " unspent tool" + (R.kitTotal(state.kit) > 1 ? "s" : "") : ", carrying nothing") +
      ".<br />" + (narrow
        ? "Your narrowest moment was stage <b>" + (narrow.at + 1) + "</b> — " +
          narrow.viable + " of " + narrow.legal + " options there kept the road open."
        : "");
    el.overStats.innerHTML = "";
    el.overSeed.textContent = state.seed;
    el.overBest.textContent = best();
    el.onward.hidden = false;
    el.again.textContent = "NEW ROAD";
    el.over.hidden = false;
    el.onward.focus();
  }

  /* Replay the route the player actually walked and find the point where the
     fewest options kept it alive. Only ever shown after the route is over. */
  function narrowestOnRoute() {
    var s = R.cloneState(routeStart), best = null;
    for (var i = 0; i < state.history.length; i++) {
      var h = state.history[i];
      if (s.phase !== "travel") break;
      var a = R.analyseChoice(s, memo);
      if (a.legal > 1 && (!best || a.viable / a.legal < best.viable / best.legal)) {
        best = { at: s.at, viable: a.viable, legal: a.legal };
      }
      R.applyAction(s, h.action === "pay" ? { type: "pay" } : { type: h.action, tool: h.tool });
    }
    return best;
  }

  /* The whole reason this game exists. */
  function finishRun() {
    saveBest(run.routes);
    var pm = R.postMortem(routeStart, state.history, memo);
    el.overTitle.textContent = "STRANDED";
    el.overHead.textContent = "route " + state.route + ", stage " + (state.at + 1);

    var body;
    if (!pm) {
      // Viable at every step and still lost — only reachable if the route was
      // already lost on arrival, which the generator is supposed to prevent.
      body = "There was no way through from where you stood.";
    } else if (pm.stage === state.at) {
      body = "You ran out of road and supply in the same moment.";
    } else {
      var gap = state.at - pm.stage;
      var what = pm.action.action === "use" ? "spent your " + R.TOOLS[pm.action.tool].name
        : pm.action.action === "scrap" ? "scrapped your " + R.TOOLS[pm.action.tool].name
        : "pushed through";
      body =
        "You did not lose here. You lost <b class='fatal'>" + gap + " stage" + (gap > 1 ? "s" : "") +
        " ago</b>, at stage <b>" + (pm.stage + 1) + "</b>, when you " + what + ".<br /><br />" +
        "<b>" + pm.survivingOptions + " of the " + pm.legalOptions + "</b> options in front of you at that moment " +
        "would have kept the road open. You have been walking a dead route ever since.";
    }
    el.overBody.innerHTML = body;

    var rows = [
      ["routes crossed", run.routes],
      ["stages walked", run.walked],
      ["tools spent", run.spent],
      ["tools scrapped", run.scrapped],
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
    el.onward.hidden = true;
    el.again.textContent = "NEW ROAD";
    el.over.hidden = false;
    el.again.focus();
  }

  function onward() {
    state = R.nextRoute(state);
    el.over.hidden = true;
    beginRoute();
    setReadout("", "Route " + state.route + ". " + state.stages.length + " stages, " +
      R.kitTotal(state.kit) + " tools, " + state.supply + " supply.");
  }

  // ------------------------------------------------------------------ wire --

  el.startBtn.addEventListener("click", function () { el.start.hidden = true; });
  el.again.addEventListener("click", function () { newRun(); });
  el.replay.addEventListener("click", function () { newRun(state.seed); });
  el.onward.addEventListener("click", onward);
  NS.addEventListener("resize", function () { if (state) moveWalker(false); });

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
  R.currentState = function () { return state; };
  R.uiBusy = function () { return busy; };
  R.uiChoose = choose;

  newRun(urlSeed());
  el.startSeed.textContent = state.seed;
})();
