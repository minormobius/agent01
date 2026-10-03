/* One Side — the controller. Swipe (or arrows / WASD) to steer; the turn is
   remembered until there's a way to take it. Space or P pauses. The
   simulation runs in fixed steps of 1/120 s, so a seed plays the same. */
(function () {
  "use strict";
  var M = window.ONESIDE, $ = function (id) { return document.getElementById(id); };
  var cv = $("game"), view = new M.View(cv), G = null, paused = false, acc = 0, last = 0, best = 0, flashMsg = "", flashT = 0;
  try { best = +localStorage.getItem("oneside-best") || 0; view.showBand = localStorage.getItem("oneside-band") !== "0"; } catch (e) { /* private mode */ }

  function start(seed) {
    G = new M.Game(seed || Math.random().toString(36).slice(2, 8)); view.game = G; view.camX = G.pac.x;
    try { history.replaceState(null, "", "?seed=" + encodeURIComponent(G.seed)); } catch (e) { /* file:// */ }
    $("over").hidden = true; paused = false; say("swipe to move"); hud();
  }
  function say(m) { flashMsg = m; flashT = performance.now(); $("note").textContent = m; }
  function hud() {
    $("score").textContent = G.score; $("best").textContent = Math.max(best, G.score);
    $("lives").textContent = "●".repeat(Math.max(0, G.lives)); $("level").textContent = G.level;
    $("band").classList.toggle("on", view.showBand);
  }
  function dir(d) { if (!G || paused) return; G.input(d); }

  /* ---------------------------------------------------------------- input */
  var DIRS = { ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3 };
  document.addEventListener("keydown", function (e) {
    if (e.code in DIRS) { dir(DIRS[e.code]); e.preventDefault(); }
    else if (e.code === "Space" || e.code === "KeyP") { paused = !paused; say(paused ? "paused" : ""); e.preventDefault(); }
    else if (e.code === "KeyB") $("band").click();
    else if (e.code === "Enter" && G && G.state === "over") start();
  });
  var sw = null;
  cv.addEventListener("pointerdown", function (e) { sw = { x: e.clientX, y: e.clientY, done: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", function (e) {
    if (!sw) return;
    var ddx = e.clientX - sw.x, ddy = e.clientY - sw.y;
    if (Math.hypot(ddx, ddy) < 16) return;
    dir(Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 1 : 3) : (ddy < 0 ? 0 : 2));
    sw = { x: e.clientX, y: e.clientY }; // keep swiping without lifting
  });
  cv.addEventListener("pointerup", function () { sw = null; });
  cv.addEventListener("pointercancel", function () { sw = null; });
  document.addEventListener("visibilitychange", function () { if (document.hidden) paused = true; });

  $("band").onclick = function () { view.showBand = !view.showBand; try { localStorage.setItem("oneside-band", view.showBand ? "1" : "0"); } catch (e) { /* ignore */ } hud(); };
  $("pause").onclick = function () { paused = !paused; say(paused ? "paused" : ""); };
  $("again").onclick = function () { start(); };
  $("start-btn").onclick = function () { $("start").hidden = true; try { localStorage.setItem("oneside-seen", "1"); } catch (e) { /* ignore */ } };
  try { if (localStorage.getItem("oneside-seen")) $("start").hidden = true; } catch (e) { /* ignore */ }

  /* ----------------------------------------------------------------- loop */
  function frame(now) {
    var dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (G && !paused && $("start").hidden) {
      acc += dt;
      while (acc >= 1 / 120) {
        G.step(1 / 120); acc -= 1 / 120;
        G.events.forEach(function (e) {
          if (e.kind === "die") say("caught — through the paper");
          else if (e.kind === "power") say("for a moment there's only one side: eat them");
          else if (e.kind === "eat") say("+" + e.pts);
          else if (e.kind === "clear") say("both faces clean — level " + (G.level + 1));
          else if (e.kind === "life") say("an extra life");
        });
      }
      if (G.state === "over" && $("over").hidden) {
        if (G.score > best) { best = G.score; try { localStorage.setItem("oneside-best", String(best)); } catch (e) { /* ignore */ } }
        $("over-body").innerHTML = "<b>" + G.score + "</b> points · level " + G.level + (G.score >= best ? " · <b>best</b>" : " · best " + best);
        setTimeout(function () { $("over").hidden = false; }, 600);
      }
      hud();
    }
    if (G && G.state === "ready" && !paused) $("note").textContent = G.lives < 4 || G.level > 1 ? "swipe to go on" : "swipe to move";
    view.draw(now);
    requestAnimationFrame(frame);
  }
  function fit() { view.resize(); }
  window.addEventListener("resize", fit);
  M._debug = { game: function () { return G; }, view: view, start: start };
  fit(); start(new URLSearchParams(location.search).get("seed")); requestAnimationFrame(frame);
})();
