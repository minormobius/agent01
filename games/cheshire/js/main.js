/* The cat lab's page: the controls, the camera, and the line that says what of the cat is in your slice.
   ?w=0.12&zw=90 (any of xw zw yw xz, degrees) opens it there; &yaw=, &pitch= (degrees), &dist= and &at=x,y,z (metres) place the
   camera; &shot draws one still frame (t = &t, default 0) and stops, for screenshots and slow software GL;
   &gait=<plan>&phase=<n> opens the balance panel there. */
import { makeLab } from "./lab.js";
import { makeGaitPanel } from "./gaitui.js";

const $ = (id) => document.getElementById(id), canvas = $("view");
let lab;
try { lab = makeLab(canvas); } catch (e) { $("say").innerHTML = `<b>${e.message}</b>`; throw e; }
const st = lab.st, D2R = Math.PI / 180;
const q = new URLSearchParams(location.search);
if (q.has("w")) st.W = +q.get("w") || 0;
for (const p of ["xw", "zw", "yw", "xz"]) if (q.has(p)) st.angles[p] = (+q.get(p) || 0) * D2R;
if (q.has("at")) st.target = q.get("at").split(",").map(Number); if (q.has("yaw")) st.yaw = +q.get("yaw") * D2R; if (q.has("pitch")) st.pitch = +q.get("pitch") * D2R; if (q.has("dist")) st.dist = +q.get("dist");
let plane = "zw", sweep = false, turnAnim = null;

function syncW() { $("w").value = st.W; $("wOut").textContent = `w = ${(st.W * 100).toFixed(1)} cm`; }
function syncAng() { const d = Math.round(st.angles[plane] / D2R); $("ang").value = ((d + 540) % 360) - 180; $("angOut").textContent = `${$("ang").value}°`; }
syncW(); syncAng();

$("w").addEventListener("input", () => { st.W = +$("w").value; sweep = false; $("sweep").classList.remove("on"); syncW(); });
$("sweep").addEventListener("click", () => { sweep = !sweep; $("sweep").classList.toggle("on", sweep); });
for (const b of $("planes").querySelectorAll("button")) b.addEventListener("click", () => { plane = b.dataset.p; for (const c of $("planes").children) c.classList.toggle("on", c === b); syncAng(); });
$("ang").addEventListener("input", () => { st.angles[plane] = +$("ang").value * D2R; turnAnim = null; syncAng(); });
$("quarter").addEventListener("click", () => { turnAnim = { plane, from: st.angles[plane], to: st.angles[plane] + Math.PI / 2, t0: performance.now() }; });
$("reset").addEventListener("click", () => { for (const p in st.angles) st.angles[p] = 0; st.W = 0; sweep = false; $("sweep").classList.remove("on"); turnAnim = null; syncW(); syncAng(); });
$("idle").addEventListener("click", () => { st.idle = !st.idle; $("idle").classList.toggle("on", st.idle); });
$("feet").addEventListener("click", () => { st.feet = !st.feet; $("feet").classList.toggle("on", st.feet); });
$("infoBtn").addEventListener("click", () => { $("info").hidden = !$("info").hidden; });
const gait = makeGaitPanel(lab, $("gait"));
const gaitShown = () => { const on = !$("gait").hidden; $("gaitBtn").classList.toggle("on", on); document.body.classList.toggle("gait", on); };
$("gaitBtn").addEventListener("click", () => { gait.toggle(); gaitShown(); $("info").hidden = true; });
$("gait").addEventListener("click", (e) => { if (e.target.closest(".x")) gaitShown(); });
// the caption sits just above the controls, however many rows they wrap to
const fit = () => document.documentElement.style.setProperty("--ph", `${$("panel").offsetHeight}px`);
addEventListener("resize", fit); fit();
if (q.has("gait")) { gait.open(); gait.choose(q.get("gait")); gait.setPhase(+(q.get("phase") || 0), true); gaitShown(); }

// the camera: drag to look round, pinch or scroll to come closer
const ptrs = new Map(); let pinch0 = 0, dist0 = st.dist;
canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = st.dist; } $("info").hidden = true; });
canvas.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const [x0, y0] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { st.yaw -= (e.clientX - x0) * 0.008; st.pitch = Math.min(1.45, Math.max(-0.15, st.pitch + (e.clientY - y0) * 0.006)); }
  else if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; st.dist = Math.min(4, Math.max(0.45, (dist0 * pinch0) / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])))); }
});
const up = (e) => { ptrs.delete(e.pointerId); pinch0 = 0; };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); st.dist = Math.min(4, Math.max(0.45, st.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

// what of it is in your slice, said plainly
function say(groups) {
  const has = (g) => groups.includes(g), turnedZW = Math.abs(Math.sin(st.angles.zw)) > 0.95 && !st.angles.xw && !st.angles.yw;
  let s;
  if (!groups.length) s = "<b>Nothing of it is in your slice.</b> It's right here, a few centimetres off in w.";
  else if (groups.length === 1 && has("grin")) s = "<b>Only the grin is left.</b> The rest of the cat is beside you, off in w.";
  else if (has("grin") && !has("head")) s = `<b>The grin, without the face.</b> In your slice: ${groups.filter((g) => g !== "grin").join(", ")}.`;
  else if (turnedZW && !has("eyes")) s = "<b>A quarter turn through w took its eyes out of your slice,</b> brought its other ears in, and turned its grin across your space.";
  else if (groups.length === 8) s = "<b>The whole cat is in your slice,</b> standing on the two feet you can see and the two rings you can't.";
  else s = `In your slice: ${groups.join(", ")}. <b>Missing:</b> ${["body", "head", "eyes", "ears", "front legs", "hind legs", "tail", "grin"].filter((g) => !has(g)).join(", ")}.`;
  if ($("say").innerHTML !== s) $("say").innerHTML = s;
}

// with the balance panel open: what holds it up
function sayBalance(sup) {
  const n = sup.feet.length, s = sup.dim < 3
    ? `<b>${n} feet down, all in one plane of the 3D floor.</b> Nothing stops it tipping across it: it falls unless it moves.`
    : sup.ok ? `<b>${n} feet down, spanning a solid of the floor;</b> its centre of mass is ${(sup.margin * 100).toFixed(1)} cm inside. The gold is that solid where your slice cuts it.`
    : `<b>${n} feet down, but its centre of mass is outside them</b> (${(-sup.margin * 100).toFixed(1)} cm): it tips.`;
  if ($("say").innerHTML !== s) $("say").innerHTML = s;
}
const t0 = performance.now();
if (q.has("shot")) { st.scale = +(q.get("scale") || 1); if (q.has("gait")) st.idle = false; const { groups, sup } = lab.draw(+(q.get("t") || 0), true); if (sup) sayBalance(sup); else say(groups); gait.draw(); document.body.dataset.ready = "1"; }
else requestAnimationFrame(frame);
function frame(now) {
  const t = (now - t0) / 1000;
  if (sweep) { st.W = 0.29 * Math.sin((2 * Math.PI * t) / 11); syncW(); }
  if (turnAnim) {
    const u = Math.min(1, (now - turnAnim.t0) / 1400), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2;
    st.angles[turnAnim.plane] = turnAnim.from + (turnAnim.to - turnAnim.from) * e;
    if (turnAnim.plane === plane) syncAng();
    if (u >= 1) turnAnim = null;
  }
  const { groups, sup } = lab.draw(t);
  if (sup) sayBalance(sup); else say(groups);
  requestAnimationFrame(frame);
}
