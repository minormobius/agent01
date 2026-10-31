/* Foam⁴ — the page: a toy for seeing 4D Voronoi foam one 3D slice at a time.
   The geometry is ./foam.js (and its exact slices come from ./slice-worker.js,
   off the page's thread); the drawing is ./render.js. This file is the
   controls, the orbit camera, the seeds drawn over the foam, and the
   readouts: what the cell at the centre is, and what happens as the slice
   moves (cells born and dying, faces opening and closing). */
import { SPECIES, frame, nearest } from "./foam.js";
import { Renderer } from "./render.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl"), oc = $("over"), octx = oc.getContext("2d");
let R;
try { R = new Renderer(glc); } catch (e) { $("readout").textContent = "This needs WebGL2: " + (e.message || e); throw e; }

/* ------------------------------------------------------------- state */
const S = {
  species: "a4", jitter: 0.5, w: 0, tilt: [0, 0, 0], box: 1.3, mode: 0, playing: false, speed: 0.12,
  base: [0.37, 0.21, 0.13, 0.0], // where w = 0 is, off the lattices' special points
};
const DIAG = [-30, -35.264, -45]; // tilts that make the slice's normal the long diagonal (1, 1, 1, 1)/2
function sliceNow() {
  const F = frame(...S.tilt.map((d) => (d * Math.PI) / 180)), C = S.base.map((v, i) => v + S.w * F.N[i]);
  return { F, C };
}
const species = () => { const sp = SPECIES[S.species]; if (sp.kind === "random") sp.jitter = S.jitter; return sp; };

/* ------------------------------------------------------------- the camera: orbiting the box */
let yaw = 0.7, pitch = 0.45, dist = 5.2;
function camera() {
  const aspect = Math.max(0.3, glc.clientWidth / Math.max(1, glc.clientHeight)), D = dist * Math.max(1, 0.95 / aspect); // a tall screen sees less across: stand back
  const pos = [D * Math.cos(pitch) * Math.sin(yaw), -D * Math.cos(pitch) * Math.cos(yaw), D * Math.sin(pitch)];
  let F = pos.map((v) => -v); const n = Math.hypot(...F); F = F.map((v) => v / n);
  let Rr = [F[1], -F[0], 0]; const m = Math.hypot(...Rr) || 1; Rr = Rr.map((v) => v / m);
  const U = [Rr[1] * F[2] - Rr[2] * F[1], Rr[2] * F[0] - Rr[0] * F[2], Rr[0] * F[1] - Rr[1] * F[0]];
  return { pos, R: Rr, U, F, tan: 0.5 };
}
function project(q, cam) {
  const rel = [q[0] - cam.pos[0], q[1] - cam.pos[1], q[2] - cam.pos[2]], z = rel[0] * cam.F[0] + rel[1] * cam.F[1] + rel[2] * cam.F[2];
  if (z < 0.05) return null;
  const x = rel[0] * cam.R[0] + rel[1] * cam.R[1] + rel[2] * cam.R[2], y = rel[0] * cam.U[0] + rel[1] * cam.U[1] + rel[2] * cam.U[2], H = oc.clientHeight, f = H / 2 / cam.tan;
  return { x: oc.clientWidth / 2 + (x / z) * f, y: H / 2 - (y / z) * f, z };
}

/* ------------------------------------------------------------- the exact slice, from the worker */
const worker = new Worker(new URL("./slice-worker.js", import.meta.url), { type: "module" });
let asked = 0, busy = false, pending = false, last = null, lastSig = "";
const tally = { births: 0, deaths: 0, opened: 0, closed: 0 }, log = [];
let lastAsk = 0;
function want() { if (busy) { pending = true; return; } busy = true; pending = false; lastAsk = performance.now(); const { F, C } = sliceNow(); worker.postMessage({ id: ++asked, species: S.species, jitter: S.jitter, C, F, B: S.box, w: S.w }); }
worker.onmessage = (e) => {
  busy = false;
  const r = e.data, pairs = new Set(r.pairs), sig = [S.species, S.jitter, S.tilt.join(), S.box].join("|");
  if (last && sig === lastSig) { // the same foam and the same tilt: only w moved, so what changed happened in 4D
    const P = new Map(last.cells.map((c) => [c.key, c])), N = new Map(r.cells.map((c) => [c.key, c]));
    const born = r.cells.filter((c) => c.inside && !P.has(c.key)), died = last.cells.filter((c) => c.inside && !N.has(c.key));
    const both = (k) => k.split("|").every((x) => P.get(x) && N.get(x) && P.get(x).inside && N.get(x).inside);
    const opened = r.pairs.filter((k) => !last.pairs.has(k) && both(k)), closed = [...last.pairs].filter((k) => !pairs.has(k) && both(k));
    tally.births += born.length; tally.deaths += died.length; tally.opened += opened.length; tally.closed += closed.length;
    const wv = S.w.toFixed(3);
    for (const c of born) note(`w ${wv} · a cell is born, a little tetrahedron where four cells met`);
    for (const c of died) note(`w ${wv} · a cell shrinks to nothing and dies`);
    for (const k of opened) note(`w ${wv} · flip: an edge opens into a face between two cells`);
    for (const k of closed) note(`w ${wv} · flip: a face closes to an edge, three cells round it`);
  }
  last = { cells: r.cells, pairs, focusKey: r.focusKey }; lastSig = sig; dirty = true;
  readout();
  if (pending) want();
};
function note(s) { log.unshift(s); if (log.length > 7) log.pop(); }
function resetTally() { Object.keys(tally).forEach((k) => (tally[k] = 0)); log.length = 0; readout(); }

/* ------------------------------------------------------------- readouts */
const NAMES = { 3: "triangles", 4: "quadrilaterals", 5: "pentagons", 6: "hexagons", 7: "heptagons", 8: "octagons" };
/* the readout is built once in the page; only its text changes. A sweep updates it many times a second, and
   Safari on a phone cancels a tap if it sees new elements appear just after it, which is what rebuilding
   the readout used to do */
const put = (id, v) => { const el = $(id), t = String(v); if (el.textContent !== t) el.textContent = t; };
function readout() {
  if (!last) return;
  const inside = last.cells.filter((c) => c.inside), f = last.cells.find((c) => c.key === last.focusKey);
  put("r-cells", last.cells.length); put("r-in", inside.length); put("r-pairs", last.pairs.size);
  put("r-mean", inside.length ? (inside.reduce((s, c) => s + c.faces, 0) / inside.length).toFixed(1) : "—");
  if (f) {
    const kinds = Object.entries(f.kinds).sort((a, b) => a[0] - b[0]).map(([n, k]) => `${k} ${k === 1 ? (NAMES[n] || n + "-gons").replace(/s$/, "") : NAMES[n] || n + "-gons"}`).join(", ");
    put("r-fcut", f.inside ? "" : " (cut by the box)"); put("r-ff", f.faces); put("r-fk", kinds || "—"); put("r-fv", f.verts); put("r-fh", f.h.toFixed(2));
  }
  put("r-b", tally.births); put("r-d", tally.deaths); put("r-f", tally.opened + tally.closed); put("r-o", tally.opened); put("r-c", tally.closed);
  [...$("log").children].forEach((el, i) => { const t = log[i] || ""; if (el.textContent !== t) el.textContent = t; });
}
$("zero").onclick = () => resetTally();

/* taps: a finger lifted on the button it went down on, without moving far, presses it at once. Safari can
   swallow the click that would follow when the page is changing as fast as a sweep makes it, so the click
   isn't waited for (and if it does come, it's ignored, so nothing is pressed twice) */
const downs = new Map(); let tappedAt = 0;
document.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; const b = e.target.closest && e.target.closest("button"); if (b) downs.set(e.pointerId, { b, x: e.clientX, y: e.clientY }); }, true);
document.addEventListener("pointercancel", (e) => downs.delete(e.pointerId), true);
document.addEventListener("pointerup", (e) => {
  const d = downs.get(e.pointerId); downs.delete(e.pointerId);
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
  tappedAt = performance.now(); d.b.click();
}, true);
document.addEventListener("click", (e) => { if (e.isTrusted && performance.now() - tappedAt < 700 && e.target.closest && e.target.closest("button")) { e.stopPropagation(); e.preventDefault(); } }, true);

/* ------------------------------------------------------------- drawing */
/* as sharp as the device keeps up with. The measure is how often the GPU is still busy with the last frame
   when the next one is due: a frame waiting on the fence for a tick or two is normal (the fence's state only
   updates between ticks, and the sweep paces itself), waiting longer means the GPU really is behind. Time
   between frames would be the wrong measure: the pacing alone stretches it, and the sharpness would sink
   for nothing */
let res = 0, lag = 0, resN = 0, waits = 0;
function resolution(w) {
  const dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(2.2e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap;
  lag += (w - lag) * 0.2;
  if (++resN >= 8) {
    resN = 0;
    if (lag > 2.5 && res > 0.6) res = Math.max(0.6, res * 0.85);
    else if (lag < 1.2 && res < cap) res = Math.min(cap, res * 1.1);
  }
  return Math.round(res * 20) / 20;
}
/* never more than one frame on the GPU: a new one is drawn only once the last has finished (a fence),
   so the page never blocks waiting on the GPU, and taps on the panel get through even while sweeping */
let fence = null, lastDraw = performance.now();
let prevT = performance.now(), dirty = true;
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  const dt = Math.min(0.1, (now - prevT) / 1000); prevT = now;
  // sweeping: w moves every frame, but the foam is drawn at most 30 times a second and sliced at most 8, so
  // there's always time left over for a tap on the panel
  if (S.playing) {
    S.w += S.speed * dt; if (S.w > 2) S.w -= 4; $("w").value = S.w; $("wv").textContent = S.w.toFixed(2);
    if (now - lastAsk > 125) want();
    if (now - lastDraw > 33) dirty = true;
  }
  if (!dirty && !dragging) return;
  const gl = R.gl;
  if (fence) { if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) { waits++; return; } gl.deleteSync(fence); fence = null; }
  dirty = false;
  lastDraw = now;
  const { F, C } = sliceNow(), cam = camera(), sp = species();
  const focus = S.mode === 2 ? nearest(sp, C).id : null;
  R.draw({ C, F, cam, box: S.box, mode: S.mode, focus }, resolution(waits)); waits = 0;
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  overlay(cam);
}
function overlay(cam) {
  const W = oc.clientWidth, H = oc.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (oc.width !== Math.round(W * dpr)) { oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  // the box's edges
  const B = S.box, c = []; for (const x of [-B, B]) for (const y of [-B, B]) for (const z of [-B, B]) c.push([x, y, z]);
  octx.strokeStyle = "rgba(200,220,255,0.35)"; octx.lineWidth = 1;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const d = c[i].reduce((s, v, k) => s + (v !== c[j][k] ? 1 : 0), 0); if (d !== 1) continue;
    const a = project(c[i], cam), b = project(c[j], cam); if (!a || !b) continue;
    octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke();
  }
  // the seeds: where each cell's seed lands in the slice, bigger the nearer the slice it is
  if (S.seeds && last) {
    const pts = last.cells.map((cl) => ({ cl, p: project(cl.q, cam) })).filter((o) => o.p && Math.max(...o.cl.q.map(Math.abs)) <= B).sort((a, b) => b.p.z - a.p.z);
    for (const { cl, p } of pts) {
      const r = 1.5 + 4.5 * Math.max(0, 1 - Math.abs(cl.h) / 1.05);
      octx.fillStyle = cl.key === last.focusKey ? "#ffd36b" : "rgba(235,245,255,0.85)";
      octx.beginPath(); octx.arc(p.x, p.y, r, 0, 7); octx.fill();
    }
  }
}
requestAnimationFrame(frameLoop);

/* ------------------------------------------------------------- controls */
function setSpecies(k) {
  S.species = k; R.setSpecies(species());
  document.querySelectorAll("[data-species]").forEach((b) => b.classList.toggle("on", b.dataset.species === k));
  $("jitter-row").hidden = k !== "random";
  $("about-species").innerHTML = ABOUT[k];
  last = null; resetTally(); want(); dirty = true;
}
const ABOUT = {
  a4: "<b>A₄*</b>: the 4D Kelvin foam. Its cell is the permutohedron: 30 facets, 10 truncated octahedra (Kelvin's foam cell, one dimension down) and 20 hexagonal prisms. Five cells meet at every corner, as in a real foam.",
  d4: "<b>D₄</b>: the densest lattice packing in 4D. Its cell is the 24-cell, a regular polytope with no 3D counterpart: 24 octahedral facets. Many cells crowd each corner: a crystal, not a foam.",
  z4: "<b>Z⁴</b>: the tesseract foam, every cell a 4D cube with 8 cubic facets. Sliced square to w it's just cubes; tilt the slice and the cubes' corners come through.",
  random: "<b>random</b>: one seed per unit of 4D, jittered (up to half a cell, where its 80 surrounding seeds are exactly its possible neighbours). Generic: three cells round every face, four round every edge, five at every corner. Every slice is a foam obeying Plateau's laws topologically. Jitter 0 is the tesseract foam; move it up and the crystal melts.",
};
document.querySelectorAll("[data-species]").forEach((b) => (b.onclick = () => setSpecies(b.dataset.species)));
document.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { S.mode = +b.dataset.mode; document.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b)); dirty = true; }));
const slider = (id, set, fmt) => { const el = $(id), out = $(id + "v"); const f = () => { set(+el.value); if (out) out.textContent = fmt(+el.value); want(); dirty = true; }; el.oninput = f; return f; };
slider("w", (v) => (S.w = v), (v) => v.toFixed(2));
slider("jitter", (v) => { S.jitter = v; R.setSpecies(species()); last = null; resetTally(); }, (v) => v.toFixed(2));
slider("box", (v) => { S.box = v; last = null; }, (v) => v.toFixed(1));
slider("speed", (v) => (S.speed = v), (v) => v.toFixed(2));
["ta", "tb", "tc"].forEach((id, i) => slider(id, (v) => { S.tilt[i] = v; last = null; resetTally(); }, (v) => Math.round(v) + "°"));
function setTilt(t) { S.tilt = t.slice(); ["ta", "tb", "tc"].forEach((id, i) => { $(id).value = t[i]; $(id + "v").textContent = Math.round(t[i]) + "°"; }); last = null; resetTally(); want(); dirty = true; }
$("square").onclick = () => setTilt([0, 0, 0]);
$("diag").onclick = () => setTilt(DIAG);
$("play").onclick = () => { S.playing = !S.playing; $("play").textContent = S.playing ? "❚❚ pause" : "▶ sweep w"; };
$("seeds").onchange = (e) => { S.seeds = e.target.checked; dirty = true; };
// orbit: drag, wheel, pinch
let dragging = false, px0 = 0, py0 = 0, pinch = 0;
const pts = new Map();
glc.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } dragging = true; px0 = e.clientX; py0 = e.clientY; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
glc.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) dist = Math.max(2.2, Math.min(12, dist * pinch / d)); pinch = d; dirty = true; return; }
  yaw += (e.clientX - px0) * 0.008; pitch = Math.max(-1.45, Math.min(1.45, pitch + (e.clientY - py0) * 0.008)); px0 = e.clientX; py0 = e.clientY; dirty = true;
});
const up = (e) => { pts.delete(e.pointerId); if (!pts.size) { dragging = false; pinch = 0; } };
glc.addEventListener("pointerup", up); glc.addEventListener("pointercancel", up);
glc.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.max(2.2, Math.min(12, dist * Math.exp(e.deltaY * 0.001))); dirty = true; }, { passive: false });
addEventListener("resize", () => (dirty = true));
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  if (e.key === " ") { e.preventDefault(); $("play").click(); }
});

S.seeds = $("seeds").checked;
setSpecies(new URLSearchParams(location.search).get("species") in SPECIES ? new URLSearchParams(location.search).get("species") : "a4");
window.FOAM4 = { S, get last() { return last; }, tally, setSpecies, setTilt, want, look: (y, p, d) => { yaw = y; pitch = p; if (d) dist = d; dirty = true; } };
