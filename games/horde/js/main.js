/* Hold the Line — loop, input and chrome.
 *
 * Owns the three things the sim refuses to know about: real time, the pointer,
 * and the DOM.
 *
 * The loop runs a fixed timestep with an accumulator. That is not pedantry —
 * the sim is the thing the balance bot measures, and if frame rate leaked into
 * it then a 144Hz desktop would be playing a different game from a 60Hz phone,
 * and neither would match the bot.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = window;
  var H = NS.HORDE;
  var DT = H.CONFIG.dt;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    canvas: $("arena"),
    wave: $("wave-value"), kills: $("kills-value"), wall: $("wall-value"),
    wallFill: $("wall-fill"),
    grenade: $("grenade"), gcool: $("g-cool"), glabel: $("g-label"),
    mute: $("mute"),
    start: $("start"), startBtn: $("start-btn"), startSeed: $("start-seed"),
    gate: $("gate"), cards: $("cards"), gateFill: $("gate-timer-fill"), gateWave: $("gate-wave"),
    dead: $("dead"), deadStats: $("dead-stats"), deadPath: $("dead-path"),
    deadWave: $("dead-wave"), deadSeed: $("dead-seed"), deadBest: $("dead-best"),
    again: $("again"), replay: $("replay"),
  };

  var renderer = H.createRenderer(el.canvas);
  var sfx = H.createSfx();
  var run = null;
  var started = false;
  var lastPhase = null;
  var gateBuilt = false;

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
    } catch (e) { /* file:// and friends — harmless */ }
  }

  function bestWave() {
    try { return parseInt(NS.localStorage.getItem("horde.best") || "0", 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(w) {
    try { if (w > bestWave()) NS.localStorage.setItem("horde.best", String(w)); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------- run --

  function newRun(seed) {
    run = H.newRun(seed || H.randomSeed());
    setUrlSeed(run.seed);
    lastPhase = null;
    gateBuilt = false;
    el.gate.hidden = true;
    el.dead.hidden = true;
    renderer.resize();
  }

  // ------------------------------------------------------------------ sound --
  // Runs over the event queue *before* the renderer drains it.

  function playSounds() {
    for (var i = 0; i < run.events.length; i++) {
      var e = run.events[i];
      if (e.type === "kill") { if (e.kind === "brute") sfx.brute(); else sfx.kill(); }
      else if (e.type === "leak") sfx.leak();
      else if (e.type === "jam") sfx.jam();
      else if (e.type === "grenade") sfx.grenade();
      else if (e.type === "wave") sfx.wave();
      else if (e.type === "gate") sfx.gate();
      else if (e.type === "timeout") sfx.timeout();
      else if (e.type === "death") sfx.death();
    }
    if (run.phase === "wave" && run.arcs[run.focus].jam <= 0 && run.zombies.length) {
      sfx.shot(run.t, 1 - run.mods.droop * run.arcs[run.focus].heat);
    }
  }

  // -------------------------------------------------------------------- hud --

  function syncHud() {
    el.wave.textContent = run.wave || "—";
    el.kills.textContent = run.stats.kills;
    el.wall.textContent = run.wall.hp + "/" + run.wall.max;
    var frac = Math.max(0, run.wall.hp / run.wall.max);
    el.wallFill.style.width = (frac * 100).toFixed(1) + "%";
    var low = frac < 0.34;
    el.wallFill.classList.toggle("low", low);
    el.wall.classList.toggle("hurt", low);

    var ready = H.grenadeReady(run);
    el.grenade.disabled = !ready;
    el.grenade.classList.toggle("ready", ready);
    var cd = run.grenade.cd / run.mods.grenadeCd;
    el.gcool.style.height = (Math.max(0, Math.min(1, cd)) * 100).toFixed(1) + "%";
    // Between waves the cooldown is zero but there is nothing to throw at, so
    // showing "0.0s" would read as a bug. Say why it is unavailable instead.
    el.glabel.textContent = ready ? "THROW"
      : run.grenade.cd > 0 ? run.grenade.cd.toFixed(1) + "s"
      : "—";
  }

  // ------------------------------------------------------------------- gate --

  function buildGate() {
    el.gateWave.textContent = "WAVE " + run.wave + " CLEARED";
    el.cards.innerHTML = "";
    run.gate.offers.forEach(function (u, i) {
      var b = document.createElement("button");
      b.className = "card" + (u.risky ? " risky" : "");
      b.type = "button";
      b.innerHTML =
        '<span class="card-key">' + (i + 1) + "</span>" +
        '<div class="card-name"></div><div class="card-blurb"></div>';
      b.querySelector(".card-name").textContent = u.name;
      b.querySelector(".card-blurb").textContent = u.blurb;
      b.addEventListener("click", function () { choose(i); });
      el.cards.appendChild(b);
    });
    el.gate.hidden = false;
    // Focus the first card so a keyboard/switch user can act without hunting.
    var first = el.cards.querySelector(".card");
    if (first) first.focus();
  }

  function choose(i) {
    if (run.phase !== "gate") return;
    if (H.pickGate(run, i)) {
      sfx.pick();
      el.gate.hidden = true;
      gateBuilt = false;
    }
  }

  function syncGate() {
    if (run.phase !== "gate") return;
    var k = Math.max(0, run.gate.timeLeft / H.CONFIG.gateTime);
    el.gateFill.style.width = (k * 100).toFixed(1) + "%";
    el.gateFill.classList.toggle("urgent", run.gate.timeLeft < 2);
  }

  // ------------------------------------------------------------------ death --

  function showDeath() {
    saveBest(run.wave);
    el.deadWave.textContent = "WAVE " + run.wave;
    el.deadSeed.textContent = run.seed;
    el.deadBest.textContent = bestWave();

    var rows = [
      ["waves cleared", run.stats.wavesCleared],
      ["kills", run.stats.kills],
      ["leaks", run.stats.leaks],
      ["time held", Math.round(run.t) + "s"],
      ["final damage", Math.round(run.mods.dps) + "/s"],
      ["cards taken", run.taken.length],
    ];
    el.deadStats.innerHTML = "";
    rows.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "stat";
      var a = document.createElement("span"); a.textContent = r[0];
      var b = document.createElement("span"); b.textContent = r[1];
      d.appendChild(a); d.appendChild(b);
      el.deadStats.appendChild(d);
    });

    // The build you ended up with, in order. Half the appeal of the genre is
    // retelling your own run, and you cannot do that without the list.
    var byId = {};
    H.UPGRADES.forEach(function (u) { byId[u.id] = u; });
    var counts = {}, order = [];
    run.taken.forEach(function (id) {
      if (!counts[id]) { counts[id] = 0; order.push(id); }
      counts[id]++;
    });
    el.deadPath.innerHTML = order.length
      ? order.map(function (id) {
          var n = counts[id];
          return "<b>" + (byId[id] ? byId[id].name : id) + (n > 1 ? " ×" + n : "") + "</b>";
        }).join(" · ")
      : "no upgrades taken";

    el.dead.hidden = false;
    el.again.focus();
  }

  // ------------------------------------------------------------------- loop --

  var acc = 0, last = 0;

  function frame(now) {
    var dtReal = last ? (now - last) / 1000 : 0;
    last = now;

    if (started) {
      // Clamp so a backgrounded tab resumes where it left off instead of
      // fast-forwarding through the horde it never saw.
      acc += Math.min(0.25, dtReal);
      var steps = 0;
      while (acc >= DT && steps++ < 600) { H.step(run, DT); acc -= DT; }

      playSounds();

      if (run.phase !== lastPhase) {
        if (run.phase === "dead") showDeath();
        lastPhase = run.phase;
      }
      if (run.phase === "gate" && !gateBuilt) { buildGate(); gateBuilt = true; }
      syncGate();
      syncHud();
    }

    renderer.draw(run, dtReal);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ input --

  function aimAt(e) {
    if (!started || run.phase === "dead") return;
    var arc = renderer.arcAt(e.clientX, e.clientY);
    if (arc >= 0) H.setFocus(run, arc);
  }

  var aiming = false;
  el.canvas.addEventListener("pointerdown", function (e) {
    aiming = true;
    el.canvas.setPointerCapture(e.pointerId);
    aimAt(e);
    e.preventDefault();
  });
  el.canvas.addEventListener("pointermove", function (e) { if (aiming) aimAt(e); });
  el.canvas.addEventListener("pointerup", function () { aiming = false; });
  el.canvas.addEventListener("pointercancel", function () { aiming = false; });

  el.grenade.addEventListener("click", function () {
    if (started) H.throwGrenade(run);
  });

  document.addEventListener("keydown", function (e) {
    if (!started) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); start(); }
      return;
    }
    // Digits mean "pick this card" at a gate and "look this way" otherwise.
    if (e.key >= "1" && e.key <= "6") {
      var n = parseInt(e.key, 10) - 1;
      if (run.phase === "gate") choose(n);
      else H.setFocus(run, n);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "a") {
      H.setFocus(run, (run.focus + H.CONFIG.ARCS - 1) % H.CONFIG.ARCS);
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "d") {
      H.setFocus(run, (run.focus + 1) % H.CONFIG.ARCS);
      e.preventDefault();
    } else if (e.key === " " || e.key === "g") {
      if (run.phase === "dead") { newRun(); }
      else H.throwGrenade(run);
      e.preventDefault();
    } else if (e.key === "m") {
      el.mute.textContent = sfx.toggle() ? "🔇" : "🔊";
    } else if (e.key === "r" && run.phase === "dead") {
      newRun(run.seed);
    }
  });

  el.mute.addEventListener("click", function () {
    el.mute.textContent = sfx.toggle() ? "🔇" : "🔊";
  });

  el.again.addEventListener("click", function () { newRun(); });
  el.replay.addEventListener("click", function () { newRun(run.seed); });

  NS.addEventListener("resize", function () { renderer.resize(); });
  NS.addEventListener("orientationchange", function () { setTimeout(function () { renderer.resize(); }, 120); });

  // ------------------------------------------------------------------ start --

  function start() {
    if (started) return;
    started = true;
    el.start.hidden = true;
    sfx.resume();          // must happen inside the gesture
    acc = 0;
    last = 0;
  }

  el.startBtn.addEventListener("click", start);

  /* A deliberate handle on the live run, for the browser smoke test and for
     poking at a run from the console. Read-only by convention; the sim is
     driven through H.setFocus / H.throwGrenade / H.pickGate. */
  H.currentRun = function () { return run; };
  H.forceStart = start;

  newRun(urlSeed());
  el.startSeed.textContent = run.seed;
  el.mute.textContent = sfx.muted() ? "🔇" : "🔊";
  requestAnimationFrame(frame);
})();
