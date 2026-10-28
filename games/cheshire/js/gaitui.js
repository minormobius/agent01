/* The balance panel: leg plans on a 3D floor, judged by js/gait.js, with the cat acting out its own two (its four feet,
   and its tail planted as a fifth). A small view draws the floor itself, a 3D space (x, z, w): the feet, the solid they
   span, the centre of mass and your slice through it. The main view shows the same support cut by your slice. */
import * as G from "./gait.js";
import { pose, paws, pawNames, mass, swayFor, TAIL_FOOT } from "./cat.js";

const fl = (p) => [p[0], p[2], p[3]], cm = (x) => `${(x * 100).toFixed(1)} cm`;

export function makeGaitPanel(lab, el) {
  const st = lab.st, P0 = pose(0, { idle: false });
  const PT = pose(0, { idle: false, tailFoot: true });
  const cat = { feet: paws(P0).map(fl), labels: pawNames(P0), com: fl(mass(P0).c), comTail: fl(mass(PT).c), tailFoot: TAIL_FOOT };
  const PLANS = G.plans(cat), ACTS = new Set(["cat", "tail"]); // the plans the cat itself can act out
  let plan = PLANS[0], A = G.analyse(plan), phase = 0, rows = [], play = null;
  const tw = { from: [0, 0, 0], to: [0, 0, 0], t0: 0, lift: null }; // the body's sway, eased, then the lift

  el.innerHTML = `
    <div class="ghead"><b>Balance on a 3D floor</b><button class="x" aria-label="Close">×</button></div>
    <p class="gsub">Gravity pulls down, so the floor is a 3D space. Feet hold a body up only while its centre of mass is over the solid they span, and they span one only if they aren't all in a plane: four at least.</p>
    <div class="chips gplans">${PLANS.map((p) => `<button data-id="${p.id}">${p.name} <small>${p.legs}</small></button>`).join("")}</div>
    <canvas class="gview"></canvas>
    <p class="gverdict"></p>
    <div class="gphases"></div>
    <div class="gbtns"><button class="gplay">▶ creep</button><span class="gnote"></span></div>
    <h4>The tail</h4>
    <p class="gsub">Tipping is always a turn that includes up (forward, across z, across w). A tail swung pushes back in the plane of where it points and where it moves. Raise it and see which tippings it can catch:</p>
    <div class="row grow"><label>raised</label><input class="gpitch" type="range" min="0" max="90" step="1" value="35"><output class="gpo">35°</output></div>
    <div class="gbars"></div>
    <p class="gsub gtail"></p>`;
  const $ = (s) => el.querySelector(s), cv = $(".gview"), ctx = cv.getContext("2d");
  $(".x").addEventListener("click", () => close());
  for (const b of el.querySelectorAll(".gplans button")) b.addEventListener("click", () => choose(b.dataset.id));
  $(".gplay").addEventListener("click", () => { if (play) stop(); else { play = { t: performance.now() }; $(".gplay").textContent = "■ stop"; if (phase === 0) setPhase(1); } });
  $(".gpitch").addEventListener("input", tail);

  // the small view: drag to turn it
  const view = { yaw: -0.65, pitch: 0.42 }; let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; view.yaw += (e.clientX - drag[0]) * 0.01; view.pitch = Math.max(-1.2, Math.min(1.4, view.pitch + (e.clientY - drag[1]) * 0.01)); drag = [e.clientX, e.clientY]; });
  cv.addEventListener("pointerup", () => (drag = null));

  function choose(id) {
    plan = PLANS.find((p) => p.id === id); A = G.analyse(plan); stop();
    for (const b of el.querySelectorAll(".gplans button")) b.classList.toggle("on", b.dataset.id === id);
    st.body = { tailFoot: id === "tail" }; tw.from = tw.to = [0, 0, 0]; tw.lift = null;
    rows = [{ label: "stand on all", j: A.stand, lift: [] }, ...A.creep.map((c) => ({ label: c.label, j: c, lift: c.lift })), ...A.halves.map((h) => ({ label: h.label, j: h, lift: plan.feet.map((_, k) => k).filter((k) => !h.down.includes(k)) }))];
    const v = [];
    v.push(A.canStand ? `<b>Stands</b>, its centre of mass ${cm(A.stand.margin)} inside.` : `<b>Can't stand:</b> its feet ${A.stand.dim < 3 ? "lie in a plane of the floor, so it tips across it" : "don't surround its centre of mass"}.`);
    if (A.canStand) v.push(A.canCreep ? `<b>Creeps:</b> every foot can be lifted alone with the rest still a solid, the body swaying at most ${cm(A.swayMax)} first.` : `<b>Can't creep:</b> ${A.creep.some((c) => c.dim < 3) ? `lifting ${A.creep.filter((c) => c.dim < 3).map((c) => c.label.replace("lift ", "")).join(", ")} leaves feet in a plane` : "some lift leaves the body outside the rest"}; it has to fall and catch itself, as we walk.`);
    if (A.halves.length) v.push(A.halvesStatic ? `<b>${plan.halves.name}</b> is static: each half alone is a solid stance.` : `<b>${plan.halves.name}</b> is dynamic: each half alone is ${["a point", "a line", "a triangle"][A.halves[0].dim] || "flat"}, leaving ${A.halves[0].free} way${A.halves[0].free > 1 ? "s" : ""} to tip.`);
    $(".gverdict").innerHTML = `<i>${plan.about}.</i> ` + v.join(" ");
    $(".gphases").innerHTML = rows.map((r, i) => `<button data-i="${i}"><span>${r.label}</span><em class="${r.j.ok ? "ok" : "no"}">${desc(r.j)}</em></button>`).join("");
    for (const b of el.querySelectorAll(".gphases button")) b.addEventListener("click", () => { stop(); setPhase(+b.dataset.i); });
    $(".gnote").textContent = ACTS.has(id) ? "the cat acts it out" : "drawn here only: the cat has four legs";
    $(".gplay").disabled = !ACTS.has(id);
    setPhase(0);
  }
  const desc = (j) => (j.dim < 3 ? `${["a point", "a line", "flat", ""][j.dim]}: ${j.free} way${j.free > 1 ? "s" : ""} to tip` : j.ok ? (j.sway && j.sway.d > 1e-4 ? `solid · sway ${cm(j.sway.d)}` : "solid") : "solid, but it's outside");
  function setPhase(i, instant = false) {
    phase = i; const r = rows[i];
    for (const b of el.querySelectorAll(".gphases button")) b.classList.toggle("on", +b.dataset.i === i);
    if (!ACTS.has(plan.id)) return;
    // ease the body over to where this phase needs the centre of mass, then lift
    const target = r.j.sway ? swayFor(r.j.sway.p, { tailFoot: plan.id === "tail", lift: r.lift }) : [0, 0, 0];
    tw.from = st.body.sway || [0, 0, 0]; tw.to = target; tw.t0 = performance.now(); tw.lift = r.lift; st.body.lift = null;
    if (instant) { tw.from = target; tw.t0 = -1e9; st.body.sway = target; st.body.lift = r.lift; }
  }
  function stop() { play = null; $(".gplay").textContent = "▶ creep"; }

  function tail() {
    const deg = +$(".gpitch").value, R = G.tailReach((deg * Math.PI) / 180), names = ["tip forward (xy)", "tip across z (zy)", "tip across w (wy)"];
    $(".gpo").textContent = `${deg}°`;
    $(".gbars").innerHTML = R.reach.map((x, k) => `<div class="gbar"><span>${names[k]}</span><i style="width:${(100 * x).toFixed(0)}%"></i><em>${x.toFixed(2)}</em></div>`).join("");
    $(".gtail").innerHTML = R.rank === 3 ? `<b>All three.</b> Raised ${deg}°, one tail can push against tipping either way sideways, at ${(R.reach[1] * 100).toFixed(0)}% of its pull on forward tipping: the higher, the more. So balance needs one tail, held up, as our cats hold theirs on a ledge. A tail that's a foot can't do this.` : `<b>Only forward and back.</b> Held level, a swung tail turns in planes that hold its own line, and none of those is a sideways tipping. Raise it.`;
    $(".gtail").innerHTML += ` <span class="dim">In the air it's another matter: righting a fall can need a turn in two planes at once (a double rotation), and one swing only ever turns one plane. Two tails, or a body that twists, would do it.</span>`;
  }

  /* the floor view: x across, z into the page, w up (the direction you can't see, so it gets the axis you can) */
  function draw() {
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), S = Math.min(w, h) * 1.9;
    const pr = ([x, z, ww]) => { const X = x * cy - z * sy, Z = x * sy + z * cy, Y = ww * cp - Z * sp; return [w / 2 + S * X, h / 2 - S * Y]; };
    const line = (a, b, c, wd = 1) => { const p = pr(a), q = pr(b); ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
    const L = 0.2, ax = [["x", [L, 0, 0], "#9a91ad"], ["z", [0, L, 0], "#9a91ad"], ["w", [0, 0, L], "#c9b3ff"]];
    for (const [n, e, c] of ax) { line(e.map((x) => -x), e, c + "66"); const p = pr(e); ctx.fillStyle = c; ctx.font = "600 11px ui-monospace, monospace"; ctx.fillText(n, p[0] + 3, p[1] - 3); }
    // your slice: the floor points at your w, a plane in this space
    const W = st.W, sq = [[-0.25, -0.18, W], [0.25, -0.18, W], [0.25, 0.18, W], [-0.25, 0.18, W]].map(pr);
    ctx.fillStyle = "#3ff2df10"; ctx.strokeStyle = "#3ff2df55"; ctx.beginPath(); sq.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill(); ctx.stroke();
    const r = rows[phase] || rows[0], down = plan.feet.map((_, k) => !r.lift.includes(k)), sup = plan.feet.filter((_, k) => down[k]), hh = G.hull(sup);
    // the support's edges: pairs of feet that share two faces (a solid), or the flat outline
    if (hh.dim === 3) { for (let a = 0; a < sup.length; a++) for (let b = a + 1; b < sup.length; b++) { const on = (p) => hh.faces.filter((f) => Math.abs(f.n[0] * p[0] + f.n[1] * p[1] + f.n[2] * p[2] - f.c) < 1e-9); const fa = on(sup[a]), fb = on(sup[b]); if (fa.filter((f) => fb.includes(f)).length >= 2) line(sup[a], sup[b], "#f2b84ccc", 1.6); } }
    else for (let a = 0; a < sup.length; a++) for (let b = a + 1; b < sup.length; b++) line(sup[a], sup[b], "#ff5a4a99", 1.2);
    plan.feet.forEach((f, k) => { const p = pr(f); ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 7); if (down[k]) { ctx.fillStyle = "#f2b84c"; ctx.fill(); } else { ctx.strokeStyle = "#9a91ad"; ctx.lineWidth = 1.3; ctx.stroke(); } });
    const com = ACTS.has(plan.id) ? fl(mass(pose(0, { idle: false, ...st.body })).c) : r.j.sway ? r.j.sway.p : plan.com, ok = G.margin(hh, com) >= G.NEED - 1e-6, pc = pr(com);
    ctx.fillStyle = ok ? "#ffd166" : "#ff4a3a"; ctx.beginPath(); ctx.arc(pc[0], pc[1], 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#9a91ad"; ctx.font = "11px ui-monospace, monospace"; ctx.fillText("● down  ○ lifted  ● centre of mass  ▭ your slice", 8, h - 8);
  }

  function frame(now) {
    if (!el.hidden) {
      // the body: ease the sway, then lift
      const u = Math.min(1, (now - tw.t0) / 700), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2;
      if (ACTS.has(plan.id)) { st.body.sway = tw.from.map((x, k) => x + (tw.to[k] - x) * e); if (u >= 1 && tw.lift) st.body.lift = tw.lift; }
      if (play && now - play.t > 1900) { play.t = now; const n = 1 + A.creep.length; setPhase(phase + 1 < n ? phase + 1 : 1); }
      draw();
    }
    requestAnimationFrame(frame);
  }
  function open() { el.hidden = false; st.support = true; choose(plan.id); tail(); }
  function close() { el.hidden = true; st.support = false; stop(); st.body = {}; }
  requestAnimationFrame(frame);
  return { open, close, toggle: () => (el.hidden ? open() : close()), choose, setPhase, draw, get rows() { return rows; } };
}
