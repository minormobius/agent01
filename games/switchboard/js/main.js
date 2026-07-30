/* Switchboard — UI, input and the fixed-timestep loop.
 *
 * The loop runs a fixed 1/120s step with an accumulator, for the same reason
 * Hold the Line does — but here it matters far more. The solver schedules on
 * that exact grid, so if frame rate leaked into the sim the "optimum" the
 * player is graded against would drift from what their machine can actually
 * execute. A 144Hz desktop and a 60Hz phone compute the identical shift.
 *
 * Like The Ratchet, the run itself is silent: the solver knows what every
 * commitment is costing, and it waits until the board clears to say so.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = window;
  var S = NS.SWITCHBOARD;
  var DT = S.CONFIG.dt;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    shift: $("shift-value"), score: $("score-value"), clock: $("clock-value"),
    timeline: $("timeline"), now: $("tl-now"), lines: $("lines"),
    hint: $("hint"), fx: $("fx"),
    start: $("start"), startBtn: $("start-btn"), startSeed: $("start-seed"),
    over: $("over"), overTitle: $("over-title"), overHead: $("over-head"),
    gap: $("gap"), overSeed: $("over-seed"), overBest: $("over-best"),
    onward: $("onward"), again: $("again"), replay: $("replay"),
  };

  var state = null, shiftStart = null, running = false, raf = null;
  var acc = 0, last = 0, totals = { shifts: 0, score: 0, optimum: 0 };
  var reduced = NS.matchMedia && NS.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rows = [];   // one persistent element per line

  // ------------------------------------------------------------------ seed --
  function urlSeed() {
    var m = /[?&]seed=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setUrlSeed(sd) {
    try { var u = new URL(location.href); u.searchParams.set("seed", sd); history.replaceState(null, "", u.toString()); }
    catch (e) { /* file:// */ }
  }
  function best() { try { return parseInt(NS.localStorage.getItem("switchboard.best") || "0", 10) || 0; } catch (e) { return 0; } }
  function saveBest(n) { try { if (n > best()) NS.localStorage.setItem("switchboard.best", String(n)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------- run --

  function newRun(seed) {
    state = S.newGame(seed || S.randomSeed());
    setUrlSeed(state.seed);
    totals = { shifts: 0, score: 0, optimum: 0 };
    el.over.hidden = true;
    beginShift();
  }

  function beginShift() {
    shiftStart = S.cloneState(state);
    buildBoard();
    running = true;
    acc = 0; last = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    setHint("The whole shift is on the strip above. <b>Hold a line to work it</b> — you can only hold one, and letting go loses the work.");
  }

  // ----------------------------------------------------------------- board --

  function buildBoard() {
    // The timeline: the entire shift, visible before it starts.
    el.timeline.innerHTML = "";
    el.timeline.appendChild(el.now);
    var span = S.closesAt(state);
    state.jobs.forEach(function (j) {
      var b = document.createElement("div");
      b.className = "tl-call" + (j.dur > 3 ? " long" : "");
      b.id = "tl-" + j.id;
      b.style.left = (j.at / span * 100) + "%";
      b.style.width = Math.max(1.2, (j.due - j.at) / span * 100) + "%";
      el.timeline.appendChild(b);
    });

    el.lines.innerHTML = "";
    rows = [];
    for (var i = 0; i < S.CONFIG.LINES; i++) {
      (function (line) {
        var d = document.createElement("div");
        d.className = "line empty";
        d.innerHTML =
          '<div class="drain"></div><div class="work"></div>' +
          '<span class="lno"></span>' +
          '<div class="lbody"><div class="lname"></div><div class="lsub"></div></div>' +
          '<span class="lval"></span>';
        d.querySelector(".lno").textContent = line + 1;
        // Hold to work. Pointer capture so a finger sliding off does not
        // silently drop the line.
        d.addEventListener("pointerdown", function (e) {
          var j = currentOn(line);
          if (j) { S.hold(state, j.id); d.setPointerCapture(e.pointerId); e.preventDefault(); }
        });
        var up = function () { if (state && state.holding !== null) S.release(state); };
        d.addEventListener("pointerup", up);
        d.addEventListener("pointercancel", up);
        d.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") up(); });
        el.lines.appendChild(d);
        rows.push(d);
      })(i);
    }
  }

  function currentOn(line) {
    var live = S.liveJobs(state).filter(function (j) { return j.line === line; });
    return live.length ? live[0] : null;
  }

  // ----------------------------------------------------------------- paint --

  function paint() {
    el.shift.textContent = state.shift;
    el.score.textContent = state.score;
    el.clock.textContent = state.t.toFixed(1) + "s";
    el.now.style.left = Math.min(100, state.t / S.closesAt(state) * 100) + "%";

    for (var line = 0; line < rows.length; line++) {
      var d = rows[line];
      var j = currentOn(line);
      if (!j) {
        if (d.className.indexOf("empty") === -1) d.className = "line empty";
        d.querySelector(".lname").textContent = "";
        d.querySelector(".lsub").textContent = "";
        d.querySelector(".lval").textContent = "";
        d.querySelector(".drain").style.width = "0%";
        d.querySelector(".work").style.width = "0%";
        continue;
      }
      var held = state.holding === j.id;
      var dead = S.doomed(j, state.t);
      d.className = "line live" + (held ? " held" : "") + (dead ? " doomed" : "") +
        (j.kind === "urgent" ? " urgent" : "");
      d.querySelector(".lname").textContent = S.KINDS[j.kind].name;
      d.querySelector(".lsub").textContent =
        dead ? "lost — " + j.value + " pts gone"
          : (j.dur - j.progress).toFixed(1) + "s of work · " + Math.max(0, j.due - state.t).toFixed(1) + "s left";
      d.querySelector(".lval").textContent = j.value;
      // Time remaining relative to the window this call had.
      d.querySelector(".drain").style.width =
        Math.max(0, Math.min(1, (j.due - state.t) / (j.due - j.at))) * 100 + "%";
      d.querySelector(".work").style.width = (j.progress / j.dur) * 100 + "%";
    }
  }

  function setHint(html) { el.hint.innerHTML = html; }

  function floatAt(node, text, cls) {
    if (reduced || !node) return;
    var r = node.getBoundingClientRect();
    var f = document.createElement("div");
    f.className = "float " + cls;
    f.textContent = text;
    f.style.left = (r.right - 60) + "px";
    f.style.top = (r.top + 12) + "px";
    el.fx.appendChild(f);
    setTimeout(function () { f.remove(); }, 950);
  }

  function drainEvents() {
    for (var i = 0; i < state.events.length; i++) {
      var e = state.events[i];
      var row = rows[e.line];
      var tl = $("tl-" + e.id);
      if (e.type === "served") {
        if (tl) tl.className = tl.className.replace(" served", "") + " served";
        floatAt(row, "+" + e.value, "good");
        if (row && !reduced) { row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); }
      } else if (e.type === "missed") {
        if (tl) tl.className = tl.className.replace(" missed", "") + " missed";
        floatAt(row, "−" + e.value, "bad");
        if (row && !reduced) { row.classList.remove("flash-bad"); void row.offsetWidth; row.classList.add("flash-bad"); }
      } else if (e.type === "drop") {
        floatAt(row, "dropped", "bad");
      }
    }
    state.events.length = 0;
  }

  // ------------------------------------------------------------------ loop --

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dtReal = last ? (now - last) / 1000 : 0;
    last = now;
    if (!running) return;

    // Clamp so a backgrounded tab resumes rather than fast-forwarding through a
    // shift the player never saw.
    acc += Math.min(0.25, dtReal);
    var steps = 0;
    while (acc >= DT && steps++ < 600) { S.step(state, DT); acc -= DT; }

    drainEvents();
    paint();

    if (state.phase === "done") {
      running = false;
      cancelAnimationFrame(raf); raf = null;
      finishShift();
    }
  }

  // --------------------------------------------------------------- endings --

  /* The readout. Same shape as The Ratchet's post-mortem, but denominated in
     points rather than in whether a future existed — this is the one game here
     where "how much worse than perfect" is literally a number. */
  function finishShift() {
    var pm = S.postShift(shiftStart, state.history);
    totals.shifts++;
    totals.score += pm.achieved;
    totals.optimum += pm.optimum;
    saveBest(totals.score);

    var perfect = pm.lost <= 1e-9;
    el.overHead.textContent = "shift " + state.shift + " · " + state.served + " served, " + state.missed + " lost";
    el.overTitle.textContent = perfect ? "PERFECT SHIFT" : pm.achieved + " OF " + pm.optimum;
    el.gap.className = perfect ? "" : "missed-some";

    var html = perfect
      ? '<span class="big">' + pm.achieved + "</span> / " + pm.optimum +
        "<br />Nothing on that board could have been played better."
      : '<span class="big">−' + pm.lost + "</span> points behind the best possible shift.";

    if (!perfect && pm.losses.length) {
      html += "<ul>";
      pm.losses.slice(0, 3).forEach(function (l) {
        var j = S.jobById(shiftStart, l.id);
        html += "<li>" + (l.action === "drop" ? "let go of" : "took") +
          " <b>line " + (j.line + 1) + "</b> (" + S.KINDS[j.kind].name.toLowerCase() + ", " +
          j.dur.toFixed(1) + "s) at " + l.t.toFixed(1) + "s — " +
          '<span class="cost">cost ' + l.cost + "</span></li>";
      });
      html += "</ul>";
    }
    if (!perfect && pm.idleLoss) {
      html += '<div style="margin-top:6px"><span class="cost">' + pm.idleLoss +
        "</span> lost to standing idle.</div>";
    }
    el.gap.innerHTML = html;

    el.overSeed.textContent = state.seed;
    el.overBest.textContent = best();
    el.onward.hidden = false;
    el.over.hidden = false;
    el.onward.focus();
  }

  function onward() {
    state = S.nextShift(state);
    el.over.hidden = true;
    beginShift();
  }

  // ------------------------------------------------------------------ wire --

  el.startBtn.addEventListener("click", function () { el.start.hidden = true; beginShift(); });
  el.onward.addEventListener("click", onward);
  el.again.addEventListener("click", function () { newRun(); });
  el.replay.addEventListener("click", function () { newRun(state.seed); });

  document.addEventListener("keydown", function (e) {
    if (!el.start.hidden) { if (e.key === "Enter" || e.key === " ") { el.start.hidden = true; beginShift(); e.preventDefault(); } return; }
    if (!el.over.hidden) { if (e.key === "Enter") { onward(); e.preventDefault(); } return; }
    // Keyboard: hold 1-6 to work a line.
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= S.CONFIG.LINES && !e.repeat) {
      var j = currentOn(n - 1);
      if (j) { S.hold(state, j.id); e.preventDefault(); }
    }
  });
  document.addEventListener("keyup", function (e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= S.CONFIG.LINES && state && state.holding !== null) {
      var j = S.jobById(state, state.holding);
      if (j && j.line === n - 1) S.release(state);
    }
  });
  // Letting go anywhere counts as letting go.
  NS.addEventListener("pointerup", function () { if (running && state.holding !== null) S.release(state); });
  NS.addEventListener("blur", function () { if (running && state.holding !== null) S.release(state); });

  /* Deliberate handles for the browser smoke test and the console. */
  S.currentState = function () { return state; };
  S.uiRunning = function () { return running; };

  state = S.newGame(urlSeed() || S.randomSeed());
  setUrlSeed(state.seed);
  el.startSeed.textContent = state.seed;
  buildBoard();
  paint();
})();
