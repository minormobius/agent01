/* Bucky — the page.

   One finger that lands on a part draws: each atom it crosses gets an
   arrow from the last one, and an empty atom becomes a wire. Back over the
   last step undoes it. One finger anywhere else turns the ball; two
   fingers turn and pinch to zoom.
   A tap puts the selected part on an atom (the same part again, or a long
   press, takes it off), flips a source on and off, or turns a bond's
   arrow round (→, ←, none).

   The circuit runs live at TICK per second. Every edit re-runs the level's
   check in full, so the table under the ball is always the truth. */
(function () {
  "use strict";
  var B = window.BUCKY, $ = function (id) { return document.getElementById(id); };
  var TICK = 10, cv = $("ball"), view = new B.View(cv), ball = B.ball();
  var idx = 0, lv = null, term = null, design = null, comp = null, vals = null, src = {}, res = null, wasPass = false;
  var tool = "wire", undo = [], dirty = true;

  function load_(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save_(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  var store = load_("bucky-v1", { designs: {}, best: {} });
  if (!store.designs) store.designs = {}; if (!store.best) store.best = {};

  /* ------------------------------------------------------------ levels */
  function load(i) {
    idx = Math.max(0, Math.min(B.LEVELS.length - 1, i));
    lv = B.LEVELS[idx]; term = B.terminals(lv);
    design = store.designs[lv.id] ? B.decode(lv, store.designs[lv.id]) : B.blank(lv);
    undo = []; src = {}; term.srcs.forEach(function (s) { src[term.at[s]] = 0; });
    if (lv.parts.indexOf(tool) < 0) tool = lv.parts[0];
    view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.zoom = 1; view.term = term;
    var all = term.srcs.concat(term.lamps).map(function (n) { return ball.atoms[term.at[n]]; }), m = [0, 0, 0];
    all.forEach(function (p) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; });
    if (Math.hypot(m[0], m[1], m[2]) > 0.3) view.face(m.map(function (x) { return x / all.length; }), 1);
    try { history.replaceState(null, "", "?level=" + (idx + 1)); } catch (e) { /* file:// */ }
    $("won").hidden = true;
    palette(); changed(true);
  }
  function changed(fresh) {
    comp = B.compile(design); vals = B.zero(comp);
    res = B.check(lv, design);
    view.design = design; view.comp = comp; view.vals = vals;
    store.designs[lv.id] = B.encode(design); save_("bucky-v1", store);
    table(); hud(); dirty = true;
    if (res.pass && !wasPass && !fresh) won();
    wasPass = res.pass;
  }
  function edit(fn) { undo.push(B.encode(design)); if (undo.length > 200) undo.shift(); fn(); changed(false); }

  function won() {
    var p = res.parts, par = B.PAR && B.PAR[lv.id] ? B.PAR[lv.id].parts : null, prev = store.best[lv.id];
    if (!prev || p < prev) store.best[lv.id] = p;
    save_("bucky-v1", store);
    var verdict = par == null ? "" : p < par ? " That's under par: better than anything the router found." : p === par ? " Exactly par." : " Par is " + par + ".";
    $("won-body").textContent = (lv.check === "blink" ? "It blinks. " : lv.check === "seq" ? "It remembers. " : "Every row lights true. ") + p + " part" + (p === 1 ? "" : "s") + "." + verdict;
    $("won-next").hidden = idx === B.LEVELS.length - 1;
    setTimeout(function () { $("won").hidden = false; }, 500);
    hud();
  }

  /* ------------------------------------------------------------ chrome */
  function hud() {
    $("lvl").textContent = (idx + 1) + " · " + lv.title;
    $("brief").textContent = lv.brief;
    $("parts").textContent = res.parts;
    var par = B.PAR && B.PAR[lv.id];
    $("par").textContent = par ? par.parts : "—";
    $("prev").disabled = idx === 0; $("next").disabled = idx === B.LEVELS.length - 1;
    $("undo").disabled = !undo.length;
    $("best").textContent = store.best[lv.id] ? "best " + store.best[lv.id] : "";
  }
  function palette() {
    var el = $("palette"); el.innerHTML = "";
    lv.parts.concat(["erase"]).forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "part" + (p === tool ? " on" : "");
      b.textContent = p === "erase" ? "✕ erase" : p === "wire" ? "• wire" : B.PARTS[p].name;
      if (B.COL[p]) b.style.setProperty("--c", B.COL[p]);
      b.onclick = function () { tool = p; palette(); };
      el.appendChild(b);
    });
  }
  function bits(o, names) { return names.map(function (n) { return o[n]; }).join(""); }
  function table() {
    var el = $("table"); el.innerHTML = "";
    if (lv.check === "blink") {
      var f = res.rows[0].got.flips, d = document.createElement("div");
      d.className = "row1 " + (res.pass ? "ok" : "no");
      d.textContent = "lamp flips " + f + " times in 80 ticks " + (res.pass ? "✓" : "✗ (needs 4)");
      el.appendChild(d); return;
    }
    var head = document.createElement("div"); head.className = "thead";
    head.textContent = term.srcs.join(" ") + " → " + term.lamps.join(" ") + (lv.check === "seq" ? "   (in order, no reset)" : "");
    el.appendChild(head);
    lv.rows.forEach(function (row, i) {
      var r = res.rows[i], b = document.createElement("button");
      b.type = "button"; b.className = "trow " + (r.ok ? "ok" : "no");
      var live = term.srcs.every(function (s) { return (src[term.at[s]] | 0) === row.in[s]; });
      if (live) b.className += " live";
      b.innerHTML = "<span>" + bits(row.in, term.srcs) + "</span>→<b>" + bits(row.want, term.lamps) + "</b>" +
        (r.ok ? " ✓" : " <i>" + bits(r.got, term.lamps) + "</i>");
      b.title = "Set the sources to this row";
      b.onclick = function () { term.srcs.forEach(function (s) { src[term.at[s]] = row.in[s]; }); table(); };
      el.appendChild(b);
    });
  }

  /* ------------------------------------------------------------ the clock */
  var acc = 0, lastT = 0;
  function frame(t) {
    var dt = Math.min(0.25, (t - (lastT || t)) / 1000); lastT = t;
    acc += dt * TICK;
    while (acc >= 1) { acc -= 1; vals = B.step(comp, vals, src); view.vals = vals; dirty = true; }
    if (dirty) { view.draw(); dirty = false; }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------ input */
  var pts = new Map(), gesture = null, press = null;
  function xy(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId);
    var p = xy(e); pts.set(e.pointerId, p);
    if (pts.size === 2) { cancelPress(); if (gesture && gesture.kind === "draw") endDraw(gesture); gesture = { kind: "two", d: span(), c: mid() }; return; }
    if (pts.size > 2) return;
    var a = view.atomAt(p[0], p[1], 0.55);
    gesture = { kind: "tap", start: p, last: p, atom: a, moved: false };
    if (a >= 0) press = setTimeout(function () {
      press = null;
      if (gesture && gesture.kind === "tap" && !gesture.moved && design.role[a] && design.role[a] !== "src" && design.role[a] !== "lamp") {
        edit(function () { B.clear(design, a); }); gesture = { kind: "done" };
        if (navigator.vibrate) navigator.vibrate(15);
      }
    }, 480);
  });
  function cancelPress() { if (press) { clearTimeout(press); press = null; } }
  function span() { var v = Array.from(pts.values()); return Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); }
  function mid() { var v = Array.from(pts.values()); return [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]; }
  cv.addEventListener("pointermove", function (e) {
    if (!pts.has(e.pointerId)) { hover(e); return; }
    var p = xy(e); pts.set(e.pointerId, p);
    if (!gesture) return;
    if (gesture.kind === "two" && pts.size === 2) {
      var c = mid(), s = span();
      view.drag(c[0] - gesture.c[0], c[1] - gesture.c[1]);
      view.zoom = Math.max(0.7, Math.min(2.6, view.zoom * s / Math.max(1, gesture.d)));
      gesture.c = c; gesture.d = s; dirty = true; return;
    }
    if (gesture.kind === "tap") {
      if (Math.hypot(p[0] - gesture.start[0], p[1] - gesture.start[1]) < 8) return;
      cancelPress(); gesture.moved = true;
      var a = gesture.atom, r = a >= 0 ? design.role[a] : "";
      if (r && r !== "lamp") { gesture = { kind: "draw", path: [a], steps: [], before: B.encode(design) }; }
      else gesture = { kind: "turn", last: gesture.last };
    }
    if (gesture.kind === "turn") { view.drag(p[0] - gesture.last[0], p[1] - gesture.last[1]); gesture.last = p; dirty = true; return; }
    if (gesture.kind === "draw") drawTo(p);
  });
  function hover(e) {
    if (e.pointerType !== "mouse") return;
    var p = xy(e), a = view.atomAt(p[0], p[1], 0.55);
    if (a !== view.hot) { view.hot = a; dirty = true; }
  }
  /* Extend the drawn path toward the finger: one bond at a time, through a
     shared neighbour if the finger skipped an atom; back over the last step
     undoes it. */
  function drawTo(p) {
    var g = gesture, a = view.atomAt(p[0], p[1], 0.5);
    if (a < 0) return;
    var tail = g.path[g.path.length - 1];
    if (a === tail) return;
    if (g.path.length > 1 && a === g.path[g.path.length - 2]) { back(); dirty = true; return; }
    if (ball.nbrs[tail].indexOf(a) < 0) {
      var via = ball.nbrs[tail].filter(function (m) { return ball.nbrs[m].indexOf(a) >= 0; })[0];
      if (via === undefined) return;
      if (!stepTo(via)) return;
    }
    stepTo(a); dirty = true;
  }
  function stepTo(a) {
    var g = gesture, tail = g.path[g.path.length - 1], r = design.role[tail];
    if (r === "lamp" || design.role[a] === "src" || g.path.indexOf(a) >= 0 && a !== g.path[0]) return false;
    var k = B.key(tail, a);
    g.steps.push({ k: k, was: design.arrow[k], made: !design.role[a] });
    if (!design.role[a]) design.role[a] = "wire";
    design.arrow[k] = tail; g.path.push(a);
    comp = B.compile(design); view.comp = comp; view.design = design;
    return true;
  }
  function back() {
    var g = gesture, s = g.steps.pop(), a = g.path.pop();
    if (s.was === undefined) delete design.arrow[s.k]; else design.arrow[s.k] = s.was;
    if (s.made) design.role[a] = "";
    comp = B.compile(design); view.comp = comp;
  }
  function endDraw(g) {
    if (g.steps.length) { undo.push(g.before); changed(false); }
  }
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  function end(e) {
    pts.delete(e.pointerId); cancelPress();
    var g = gesture;
    if (!g) return;
    if (g.kind === "two") { if (!pts.size) gesture = null; else { var p0 = Array.from(pts.values())[0]; gesture = { kind: "turn", last: p0 }; } return; }
    if (pts.size) return;
    gesture = null;
    if (g.kind === "draw") { endDraw(g); return; }
    if (g.kind === "tap" && !g.moved) tap(g.start);
  }
  function tap(p) {
    var hit = view.pick(p[0], p[1]);
    if (!hit) return;
    if (hit.bond) {
      var e = hit.bond, k = B.key(e[0], e[1]), f = design.arrow[k];
      if (!design.role[e[0]] || !design.role[e[1]]) { note("put parts on both ends first"); return; }
      edit(function () {
        if (f === undefined) design.arrow[k] = e[0]; else if (f === e[0]) design.arrow[k] = e[1]; else delete design.arrow[k];
      });
      return;
    }
    var a = hit.atom, r = design.role[a];
    if (r === "src") { src[a] = src[a] ? 0 : 1; table(); return; }
    if (r === "lamp") { note(lv.check === "blink" ? "the lamp wants to blink" : "a lamp lights when its one arrow in is on"); return; }
    edit(function () {
      if (tool === "erase" || r === tool) B.clear(design, a);
      else design.role[a] = tool;
    });
  }
  var noteT = 0;
  function note(s) { var el = $("note"); el.textContent = s; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(function () { el.classList.remove("show"); }, 1800); }
  cv.addEventListener("wheel", function (e) { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(2.6, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });

  /* ------------------------------------------------------------ buttons */
  $("undo").onclick = function () { if (!undo.length) return; design = B.decode(lv, undo.pop()); changed(false); };
  $("reset").onclick = function () { edit(function () { design = B.blank(lv); }); };
  $("prev").onclick = function () { load(idx - 1); };
  $("next").onclick = function () { load(idx + 1); };
  $("levels-btn").onclick = function () { levels(); $("levels").hidden = false; };
  $("levels-close").onclick = function () { $("levels").hidden = true; };
  $("start-btn").onclick = function () { $("start").hidden = true; save_("bucky-seen", 1); };
  $("help").onclick = function () { $("start").hidden = false; };
  $("won-next").onclick = function () { load(idx + 1); };
  $("won-stay").onclick = function () { $("won").hidden = true; };
  $("won-par").onclick = function () {
    var par = B.PAR && B.PAR[lv.id]; if (!par) return;
    $("won").hidden = true; wasPass = true; // looking at par is not solving it
    edit(function () { design = B.decode(lv, par.design); });
    note("the router's design: " + par.parts + " parts (undo brings yours back)");
  };
  function levels() {
    var el = $("level-list"); el.innerHTML = "";
    B.LEVELS.forEach(function (l, i) {
      var b = document.createElement("button"), best = store.best[l.id], par = B.PAR && B.PAR[l.id];
      b.type = "button"; b.className = "lv" + (best ? " done" : "") + (i === idx ? " here" : "");
      b.innerHTML = "<b>" + (i + 1) + "</b><span>" + l.title + "</span><em>" + (best ? best + (par ? "/" + par.parts : "") : par ? "par " + par.parts : "") + "</em>";
      b.onclick = function () { $("levels").hidden = true; load(i); };
      el.appendChild(b);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "INPUT") return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); $("undo").click(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= lv.parts.length + 1) { tool = lv.parts.concat(["erase"])[n - 1]; palette(); }
  });

  B.ui = { view: view, load: load, design: function () { return design; }, result: function () { return res; } }; // for tests

  window.addEventListener("resize", function () { view.resize(); dirty = true; });
  if (window.ResizeObserver) new ResizeObserver(function () { view.resize(); dirty = true; }).observe(cv);
  view.resize();
  var q = /[?&]level=(\d+)/.exec(location.search);
  load(q ? +q[1] - 1 : Math.max(0, B.LEVELS.findIndex(function (l) { return !store.best[l.id]; })));
  if (load_("bucky-seen", 0)) $("start").hidden = true;
  requestAnimationFrame(frame);
})();
