/* WIRE⁴: the wake of a 4D wire, drawn from computed fields (data/*.bin, made by export4.py).
   A field is U0, V0 and, per harmonic k along the wire, u_k, v_k, b_k on a regular (x, r) grid:
     u = U0 + a Σ u_k cos(kβw)   v = V0 + a Σ v_k cos(kβw)   b = a Σ b_k sin(kβw)
   a is the slider for a linear mode (its size is not determined by a linear calculation) and 1 for a computed flow. */
const SETS = [["mode-200", "the unstable mode, Re 200 (linear: you set its size)"], ["flow-200", "computed, Re 200"], ["flow-210", "computed, Re 210"], ["flow-220", "computed, Re 220"]];
const $ = (id) => document.getElementById(id), S = { D: null, amp: 0.15, w: 0, y: 0, play: false, t: 0 };
const c1 = $("c1"), c2 = $("c2"), g1 = c1.getContext("2d"), g2 = c2.getContext("2d");
async function load(name) { const m = await (await fetch(`data/${name}.json`)).json(), buf = new Float32Array(await (await fetch(`data/${name}.bin`)).arrayBuffer()), n = m.nx * m.nr, f = (i) => buf.subarray(i * n, (i + 1) * n);
  return { ...m, n, U0: f(0), V0: f(1), H: m.ks.map((k, j) => ({ k, u: f(2 + 3 * j), v: f(3 + 3 * j), b: f(4 + 3 * j) })), u: new Float32Array(n), v: new Float32Array(n), wave: (2 * Math.PI) / m.beta }; }
const amp = () => (S.D.kind === "mode" ? S.amp : 1);
/* the cross-wire fields at the current place along the wire */
function frame() { const D = S.D, a = amp(), ph = D.beta * S.w * D.wave; D.u.set(D.U0); D.v.set(D.V0); for (const h of D.H) { const c = a * Math.cos(h.k * ph); for (let i = 0; i < D.n; i++) { D.u[i] += c * h.u[i]; D.v[i] += c * h.v[i]; } } }
const bil = (D, A, x, r) => { const fx = Math.min(D.nx - 1.001, Math.max(0, (x - D.x0) / D.h)), fr = Math.min(D.nr - 1.001, Math.max(0, r / D.h)), i = fx | 0, j = fr | 0, tx = fx - i, tr = fr - j, p = j * D.nx + i; return (A[p] * (1 - tx) + A[p + 1] * tx) * (1 - tr) + (A[p + D.nx] * (1 - tx) + A[p + D.nx + 1] * tx) * tr; };
/* velocity along the wire's slice: u and b at (x, y, w) */
function along(D, x, y, w) { const a = amp(), ph = D.beta * w; let u = bil(D, D.U0, x, y), b = 0; for (const h of D.H) { u += a * Math.cos(h.k * ph) * bil(D, h.u, x, y); b += a * Math.sin(h.k * ph) * bil(D, h.b, x, y); } return [u, b]; }
function colour(px, o, u, solid) { if (solid) { px[o] = 38; px[o + 1] = 40; px[o + 2] = 51; } else if (u < 0) { const s = Math.min(1, -u / 0.25); px[o] = 60 + 195 * s; px[o + 1] = 20 + 114 * s; px[o + 2] = 50 + 148 * s; } else { const s = Math.min(1, u / 1.15); px[o] = 8 + 103 * s * s; px[o + 1] = 12 + 212 * s; px[o + 2] = 20 + 235 * s; } px[o + 3] = 255; }
const edge = (px, o) => { px[o] = 255; px[o + 1] = 210; px[o + 2] = 122; };
const off1 = document.createElement("canvas"), off2 = document.createElement("canvas"); let im1, im2, P1 = [], P2 = [];
function setup() { const D = S.D; off1.width = D.nx; off1.height = 2 * D.nr - 1; off2.width = D.nx; off2.height = Math.round((2 * D.wave) / D.h); im1 = off1.getContext("2d").createImageData(off1.width, off1.height); im2 = off2.getContext("2d").createImageData(off2.width, off2.height);
  for (const [c, o] of [[c1, off1], [c2, off2]]) { c.width = o.width * 2; c.height = o.height * 2; }
  const X = () => D.x0 + Math.random() * (D.nx - 1) * D.h; P1 = Array.from({ length: 420 }, () => ({ x: X(), y: (Math.random() * 2 - 1) * (D.nr - 1) * D.h, age: Math.random() * 200 })); P2 = Array.from({ length: 420 }, () => ({ x: X(), y: Math.random() * 2 * D.wave, age: Math.random() * 200 }));
  $("ampL").style.display = D.kind === "mode" ? "" : "none";
  $("what").innerHTML = D.kind === "mode" ? `<b>What you are looking at:</b> the steady wake at a Reynolds number of ${D.Re}, plus its one unstable mode (it grows by a factor e every ${(1 / D.growth).toFixed(0)} flow times). A linear calculation gives the ripple's shape and not its size, so the size is the slider.` : `<b>What you are looking at:</b> the full equations stepped forward at a Reynolds number of ${D.Re} until time ${D.t.toFixed(0)}, in the family of flows that stay symmetric round the stream's axis. The bubble behind the wire is ${D.bubble[0].toFixed(2)} diameters long at its fattest and ${D.bubble[1].toFixed(2)} at its thinnest.`; }
function draw() { const D = S.D; if (!D) return; frame();
  { const px = im1.data, W = off1.width, Hh = off1.height, mid = D.nr - 1; for (let j = 0; j < Hh; j++) { const jr = Math.abs(j - mid); for (let i = 0; i < W; i++) { const p = jr * D.nx + i, x = D.x0 + i * D.h, r = jr * D.h, o = 4 * (j * W + i), u = D.u[p]; colour(px, o, u, x * x + r * r < 0.25); if (x * x + r * r > 0.27 && i + 1 < W && (u < 0) !== (D.u[p + 1] < 0)) edge(px, o); } }
    off1.getContext("2d").putImageData(im1, 0, 0); g1.imageSmoothingEnabled = true; g1.drawImage(off1, 0, 0, c1.width, c1.height);
    const yy = (mid - S.y / D.h) * 2; g1.strokeStyle = "rgba(255,210,122,.35)"; g1.setLineDash([6, 6]); g1.beginPath(); g1.moveTo(0, yy); g1.lineTo(c1.width, yy); g1.stroke(); g1.setLineDash([]); }
  { const px = im2.data, W = off2.width, Hh = off2.height, a = amp(), jr = Math.round(S.y / D.h), row = jr * D.nx, half = Math.sqrt(Math.max(0, 0.25 - S.y * S.y)); const cs = D.H.map((h) => new Float32Array(Hh)); for (let j = 0; j < Hh; j++) D.H.forEach((h, q) => (cs[q][j] = a * Math.cos(h.k * D.beta * (Hh - 1 - j) * D.h)));
    for (let j = 0; j < Hh; j++) { let prev = 0; for (let i = 0; i < W; i++) { let u = D.U0[row + i]; for (let q = 0; q < D.H.length; q++) u += cs[q][j] * D.H[q].u[row + i]; const x = D.x0 + i * D.h, o = 4 * (j * W + i), solid = Math.abs(x) < half; colour(px, o, u, solid); if (i && !solid && Math.abs(x) > half + 0.05 && (u < 0) !== (prev < 0)) edge(px, o); prev = u; } }
    off2.getContext("2d").putImageData(im2, 0, 0); g2.drawImage(off2, 0, 0, c2.width, c2.height);
    for (const k of [0, 1]) { const wy = c2.height - ((((S.w % 1) + 1) % 1) + k) * D.wave / D.h * 2; g2.strokeStyle = "rgba(255,210,122,.35)"; g2.setLineDash([6, 6]); g2.beginPath(); g2.moveTo(0, wy); g2.lineTo(c2.width, wy); g2.stroke(); g2.setLineDash([]); } }
  /* tracers: carried by the part of the velocity that lies in each slice */
  const dt = 0.035, sx = 2 / D.h, xmax = D.x0 + (D.nx - 1) * D.h, rmax = (D.nr - 1) * D.h; g1.strokeStyle = g2.strokeStyle = "rgba(233,228,218,.75)"; g1.lineWidth = g2.lineWidth = 1.3;
  g1.beginPath(); for (const p of P1) { const r = Math.abs(p.y), u = bil(D, D.u, p.x, r), v = bil(D, D.v, p.x, r) * Math.sign(p.y || 1), X0 = (p.x - D.x0) * sx, Y0 = (rmax - p.y) * sx; p.x += u * dt; p.y += v * dt; p.age++; g1.moveTo(X0, Y0); g1.lineTo(X0 + u * dt * sx * 3, Y0 - v * dt * sx * 3);
    if (p.x > xmax || p.x < D.x0 || Math.abs(p.y) > rmax || p.x * p.x + p.y * p.y < 0.26 || p.age > 600) { p.age = 0; const back = Math.random() < 0.3; p.x = back ? 0.6 + Math.random() * 2 : D.x0 + Math.random() * 0.3; p.y = (Math.random() * 2 - 1) * (back ? 0.6 : rmax); } } g1.stroke();
  g2.beginPath(); for (const p of P2) { const [u, b] = along(D, p.x, S.y, p.y), X0 = (p.x - D.x0) * sx, Y0 = c2.height - p.y * sx; p.x += u * dt; p.y += b * dt; p.age++; g2.moveTo(X0, Y0); g2.lineTo(X0 + u * dt * sx * 3, Y0 - b * dt * sx * 3);
    if (p.y < 0) p.y += 2 * D.wave; if (p.y > 2 * D.wave) p.y -= 2 * D.wave; const half = Math.sqrt(Math.max(0, 0.25 - S.y * S.y));
    if (p.x > xmax || p.x < D.x0 || Math.abs(p.x) < half + 0.02 || p.age > 600) { p.age = 0; const back = Math.random() < 0.3; p.x = back ? 0.6 + Math.random() * 2 : D.x0 + Math.random() * 0.3; p.y = Math.random() * 2 * D.wave; } } g2.stroke();
  /* the bubble's length at this place: where the flow on the axis turns forward again */
  let L = 0; for (let i = D.nx - 2; i > 0; i--) { const x = D.x0 + i * D.h; if (x < 0.5) break; if (D.u[i] < 0) { L = x + (D.h * -D.u[i]) / (D.u[i + 1] - D.u[i]) - 0.5; break; } }
  $("r1").innerHTML = `bubble behind the wire here: <b>${L.toFixed(2)}</b> diameters long`; $("wV").textContent = (((S.w % 1) + 1) % 1 * D.wave).toFixed(2); $("ampV").textContent = S.amp.toFixed(2); $("yV").textContent = S.y.toFixed(2); }
function loop() { if (S.play) { S.w = (S.w + 0.0025) % 1; $("w").value = S.w; } draw(); requestAnimationFrame(loop); }
async function pick(name) { try { S.D = await load(name); setup(); } catch (e) { $("what").textContent = "That flow is not computed yet."; } }
(async () => { const sel = $("set"); for (const [v, label] of SETS) { const ok = await fetch(`data/${v}.json`, { method: "HEAD" }).then((r) => r.ok).catch(() => false); if (ok) sel.add(new Option(label, v)); }
  sel.onchange = () => pick(sel.value); $("amp").oninput = (e) => (S.amp = +e.target.value); $("w").oninput = (e) => (S.w = +e.target.value); $("y").oninput = (e) => (S.y = +e.target.value); $("play").onclick = () => { S.play = !S.play; $("play").textContent = S.play ? "hold still" : "slide along it"; };
  await pick(sel.value); window.WIRE4 = S; loop(); })();
