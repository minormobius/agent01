// app.mjs — lay 39,554 words out as an orb web and draw them.
//
// The layout is two independent axes and nothing else:
//
//   ANGLE  = topic wedge, and position within the wedge by similarity to the
//            next wedge along, so boundaries are blends rather than seams.
//   RADIUS = log frequency. Hub-side is thousands of uses; the rim is hapax.
//
// Both are precomputed once into flat arrays. The draw loop then batches by
// quantised colour so 39k marks go down in a handful of fill() calls — one
// path per mark would be a hundred times slower for a picture nobody could tell
// apart at 1.5 px.

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const WORLD = 1100;
const CX = WORLD / 2, CY = WORLD / 2;
const R_HUB_IN = 15, R_HUB_OUT = 104;
const R_IN = 120, R_OUT = 508;

const data = await (await fetch('./data.json')).json();
const N = data.cols.w.length;

// ─── palette ────────────────────────────────────────────────────────────────

const SECTOR_HUE = [205, 34, 168, 12, 265, 96, 320, 52, 188, 145, 285, 72];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// cool → neutral → warm, for anything that is a date
const TIME_RAMP = [[58, 122, 158], [168, 178, 190], [226, 150, 68]];
function timeColour(t) {
  return t < 0.5 ? mix(TIME_RAMP[0], TIME_RAMP[1], t * 2) : mix(TIME_RAMP[1], TIME_RAMP[2], (t - 0.5) * 2);
}
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// ─── layout ─────────────────────────────────────────────────────────────────

const { w: W, c: CNT, d: DF, f: FIRST, m: MEAN, s: SEC, i: IDX } = data.cols;
const X = new Float32Array(N);
const Y = new Float32Array(N);
const SZ = new Float32Array(N);
const ANG = new Float32Array(N);
const RAD = new Float32Array(N);
const isHub = new Uint8Array(N);

const ring = data.order.filter((k) => k !== data.general);   // the eleven topical wedges
const typesOf = new Map(data.sectors.map((s) => [s.k, s.types]));
const totalRingTypes = ring.reduce((a, k) => a + typesOf.get(k), 0);

// wedge extents, in ring order, starting at the top and going clockwise
const wedge = new Map();
{
  let a = -Math.PI / 2;
  for (const k of ring) {
    const span = TAU * (typesOf.get(k) / totalRingTypes);
    wedge.set(k, { a0: a, a1: a + span, span });
    a += span;
  }
}

// The rim is not a circle. Each wedge's frame vertex sits further out the deeper
// that wedge's tail runs, so the outline is a portrait of range rather than a
// decoration — a topic with four thousand words reaches the edge, one with
// eight hundred falls short of it.
const tMin = Math.min(...ring.map((k) => typesOf.get(k)));
const tMax = Math.max(...ring.map((k) => typesOf.get(k)));
const vertexR = new Map(ring.map((k) => {
  const u = tMax > tMin ? (typesOf.get(k) - tMin) / (tMax - tMin) : 1;
  return [k, R_OUT * (0.83 + 0.17 * u)];
}));

function rimAt(angle) {
  // linear blend between the two wedge vertices either side of this bearing
  let a = ((angle + Math.PI / 2) % TAU + TAU) % TAU;
  const n = ring.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const k = ring[i];
    const span = wedge.get(k).span;
    if (a <= acc + span || i === n - 1) {
      const t = span > 0 ? (a - acc) / span : 0;
      return lerp(vertexR.get(k), vertexR.get(ring[(i + 1) % n]), Math.min(1, Math.max(0, t)));
    }
    acc += span;
  }
  return R_OUT;
}

let CMAX = 1;
for (let i = 0; i < N; i++) if (SEC[i] !== data.general && CNT[i] > CMAX) CMAX = CNT[i];
const LOGMAX = Math.log(CMAX);
const freqU = (c) => Math.min(1, Math.log(c) / LOGMAX);      // 1 = most used, 0 = hapax

const hash01 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 8) / 0xffffff;
};

// ── RADIUS IS RANK, PLACED FOR EQUAL AREA ───────────────────────────────────
//
// The obvious mapping — radius ∝ log frequency — is unusable on a real
// vocabulary, and it took drawing it to see why. Zipf puts 19,320 of these
// 39,554 words at exactly one use, and log(1) = 0, so half the lexicon lands on
// a single hairline circle at the rim while the whole interior sits empty.
// Widening the band does not fix it: log-frequency gives the count-1 shell 9%
// of the radius for 48% of the words.
//
// So radius carries RANK, and carries it so that every word gets the same area:
//
//     r(p) = √( r_in² + (r_rim² − r_in²) · p ),   p = rank / N
//
// Density is then flat across the whole disc — which is the only way a picture
// of a Zipf distribution can be looked at — and frequency is still perfectly
// legible, because rank is monotone in count and the rings below are drawn at
// the ranks where the count actually crosses 2×, 5×, 10×, 100×.
//
// Ties in count are broken by hash rather than by the alphabet. They arrive
// alphabetically, and an alphabetical gradient in radius is a lie the eye reads
// as structure.
const rankP = new Float32Array(N);
{
  const ringIdx = [];
  for (let i = 0; i < N; i++) if (SEC[i] !== data.general) ringIdx.push(i);
  ringIdx.sort((a, b) => CNT[b] - CNT[a] || hash01(W[a]) - hash01(W[b]));
  ringIdx.forEach((i, j) => { rankP[i] = (j + 0.5) / ringIdx.length; });
}
const radiusForP = (p, rim) => Math.sqrt(R_IN * R_IN + (rim * rim - R_IN * R_IN) * p);

// the rank at which a given use-count begins, for the contour rings
function pForCount(c) {
  let lo = 0, hi = N - 1, best = 1;
  const ringIdx = [];
  for (let i = 0; i < N; i++) if (SEC[i] !== data.general && CNT[i] >= c) ringIdx.push(i);
  return ringIdx.length / Math.max(1, N - (data.sectors.find((s) => s.k === data.general)?.types || 0));
}

{
  // hub: a phyllotaxis disc, most-used at the centre
  const hubIdx = [];
  for (let i = 0; i < N; i++) if (SEC[i] === data.general) hubIdx.push(i);
  hubIdx.sort((a, b) => CNT[b] - CNT[a]);
  hubIdx.forEach((i, j) => {
    const r = R_HUB_IN + (R_HUB_OUT - R_HUB_IN) * Math.sqrt((j + 0.5) / hubIdx.length);
    const a = j * GOLDEN;
    ANG[i] = a; RAD[i] = r; isHub[i] = 1;
    X[i] = CX + Math.cos(a) * r;
    Y[i] = CY + Math.sin(a) * r;
    SZ[i] = 1.0 + 2.2 * Math.pow(freqU(CNT[i]), 1.4);
  });

  const counts = data.sectorCounts;
  for (let i = 0; i < N; i++) {
    if (isHub[i]) continue;
    const k = SEC[i];
    const wd = wedge.get(k);
    const n = counts[k] || 1;
    // 4% inset each side so wedges read as separate without a drawn gap
    const t = (IDX[i] + 0.5) / n;
    const a = wd.a0 + wd.span * (0.04 + 0.92 * t);
    const r = radiusForP(rankP[i], rimAt(a));
    ANG[i] = a; RAD[i] = r;
    X[i] = CX + Math.cos(a) * r;
    Y[i] = CY + Math.sin(a) * r;
    SZ[i] = 1.15 + 2.4 * Math.pow(freqU(CNT[i]), 1.6);
  }
}

// ─── colour ─────────────────────────────────────────────────────────────────

const BUCKETS = 28;
const bucket = new Uint8Array(N);
let bucketColour = [];

function recolour(mode) {
  const days = Math.max(1, data.days);
  let vals = new Float32Array(N);
  if (mode === 'sector') {
    for (let i = 0; i < N; i++) bucket[i] = ring.indexOf(SEC[i]) + 1;
    bucketColour = [hsl(0, 0, 0.72)].concat(ring.map((k, i) => hsl(SECTOR_HUE[i % 12], 0.46, 0.62)));
    $('colourlegend').textContent = 'which wedge — the hub is grey';
    return;
  }
  if (mode === 'burst') {
    for (let i = 0; i < N; i++) vals[i] = Math.min(1, (CNT[i] / DF[i] - 1) / 1.4);
    $('colourlegend').textContent = 'repeats within a post — pale means said once and moved on, warm means said again and again in the same breath';
  } else {
    const src = mode === 'first' ? FIRST : MEAN;
    for (let i = 0; i < N; i++) vals[i] = Math.min(1, Math.max(0, src[i] / days));
    $('colourlegend').textContent = mode === 'first'
      ? `when the word first appeared — ${data.span[0]} is cool, ${data.span[1]} is warm`
      : `the average date of every use — ${data.span[0]} is cool, ${data.span[1]} is warm`;
  }
  for (let i = 0; i < N; i++) bucket[i] = Math.min(BUCKETS - 1, (vals[i] * BUCKETS) | 0);
  bucketColour = [];
  for (let b = 0; b < BUCKETS; b++) bucketColour.push(timeColour((b + 0.5) / BUCKETS));
}

// ─── canvas ─────────────────────────────────────────────────────────────────

const cv = $('web');
const ctx = cv.getContext('2d');
let S = 1;

function size() {
  const w = cv.parentElement.clientWidth;
  if (!w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(w * dpr);
  cv.style.height = w + 'px';
  S = cv.width / WORLD;
  draw();
}

const state = {
  mode: 'mean',
  labels: 150,
  minc: 1,
  weblines: 0.55,
  hidden: new Set(),
  hit: -1,
  found: -1,
};

// ── the web itself ──────────────────────────────────────────────────────────
//
// Drawn from the same numbers as the marks, so the structure is a reading aid
// rather than a backdrop: every ring is a frequency contour you can name, and
// every spoke is a wedge boundary or a subdivision of one.

const SHELLS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
const SHELL_P = SHELLS.map(pForCount);      // where each count begins, as a rank fraction

function drawStructure(alpha) {
  if (alpha <= 0.001) return;
  ctx.lineCap = 'round';

  // the capture spiral: one continuous curve threading every contour, outside in
  ctx.beginPath();
  const turns = SHELLS.length - 1;
  const STEP = 0.02;
  for (let t = 0; t <= turns; t += STEP) {
    const seg = Math.min(turns - 1, Math.floor(t));
    const f = t - seg;
    const a = -Math.PI / 2 + t * TAU;
    const rim = rimAt(a);
    const r = lerp(radiusForP(SHELL_P[seg], rim), radiusForP(SHELL_P[seg + 1], rim), f);
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(226,240,252,${0.13 * alpha})`;
  ctx.lineWidth = 0.9 / S;
  ctx.stroke();

  // spokes: every wedge boundary, then subdivisions to ~44 in total
  ctx.beginPath();
  for (const k of ring) {
    const wd = wedge.get(k);
    const subs = Math.max(1, Math.round(44 * (wd.span / TAU)));
    for (let j = 0; j < subs; j++) {
      const a = wd.a0 + (wd.span * j) / subs;
      const rim = rimAt(a);
      ctx.moveTo(CX + Math.cos(a) * R_IN, CY + Math.sin(a) * R_IN);
      ctx.lineTo(CX + Math.cos(a) * rim, CY + Math.sin(a) * rim);
    }
  }
  ctx.strokeStyle = `rgba(176,192,208,${0.16 * alpha})`;
  ctx.lineWidth = 0.8 / S;
  ctx.stroke();

  // frame: the rim polygon, brighter, and the wedge boundaries doubled
  ctx.beginPath();
  for (let j = 0; j <= 360; j++) {
    const a = -Math.PI / 2 + (j / 360) * TAU;
    const r = rimAt(a);
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
    if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(214,192,154,${0.62 * alpha + 0.18})`;
  ctx.lineWidth = 1.6 / S;
  ctx.stroke();

  ctx.beginPath();
  for (const k of ring) {
    const a = wedge.get(k).a0;
    ctx.moveTo(CX + Math.cos(a) * R_HUB_OUT, CY + Math.sin(a) * R_HUB_OUT);
    ctx.lineTo(CX + Math.cos(a) * rimAt(a), CY + Math.sin(a) * rimAt(a));
  }
  ctx.strokeStyle = `rgba(214,192,154,${0.30 * alpha + 0.10})`;
  ctx.lineWidth = 1.0 / S;
  ctx.stroke();

  // the free zone
  for (const r of [R_HUB_OUT, R_IN]) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, TAU);
    ctx.strokeStyle = `rgba(206,218,230,${0.22 * alpha + 0.06})`;
    ctx.lineWidth = 0.9 / S;
    ctx.stroke();
  }
}

// ── marks ───────────────────────────────────────────────────────────────────

function drawMarks() {
  const paths = Array.from({ length: bucketColour.length }, () => new Path2D());
  const dim = state.hidden.size > 0;
  const dimPath = new Path2D();
  for (let i = 0; i < N; i++) {
    if (CNT[i] < state.minc) continue;
    const s = SZ[i] / S * 1.35;
    const hid = dim && state.hidden.has(SEC[i]);
    (hid ? dimPath : paths[bucket[i]]).rect(X[i] - s / 2, Y[i] - s / 2, s, s);
  }
  if (dim) { ctx.fillStyle = 'rgba(120,132,148,0.10)'; ctx.fill(dimPath); }
  for (let b = 0; b < paths.length; b++) {
    ctx.fillStyle = rgb(bucketColour[b]);
    ctx.fill(paths[b]);
  }
}

// ── labels ──────────────────────────────────────────────────────────────────
//
// Greedy, biggest first, against a coarse occupancy grid. A word that cannot
// find room is simply not drawn — there is no honest way to fit thirty-nine
// thousand labels and pretending otherwise is how these charts turn to mud.

function drawLabels() {
  if (state.labels <= 0) return;
  const CELL = 13;
  const gw = Math.ceil(cv.width / CELL), gh = Math.ceil(cv.height / CELL);
  const grid = new Uint8Array(gw * gh);

  // STRATIFY BY FREQUENCY BAND, WITH AN EQUAL SHARE EACH.
  //
  // Two failed versions are worth recording. Straight count-descending order
  // spends the whole budget failing to place labels in the crowded hub and then
  // prints whatever fits out in the hapax fog. Weighting the bands by how many
  // words they hold is no better, because the count-1 band holds 19,320 of the
  // 39,554 and swallows the budget again. Both produced the same output: a
  // parade of `aaaaalll`, `abbots`, `abby` — the alphabet, because ties in
  // count arrive alphabetically and nothing was breaking them.
  //
  // Equal share per shell, ties broken by hash. Every ring gets named, each
  // ring shows its most-used members, and no ring gets to shout.
  const bands = SHELLS.map(() => []);
  for (let i = 0; i < N; i++) {
    if (CNT[i] < state.minc) continue;
    if (state.hidden.size && state.hidden.has(SEC[i])) continue;
    let b = 0;
    while (b < SHELLS.length - 1 && CNT[i] >= SHELLS[b + 1]) b++;
    bands[b].push(i);
  }
  for (const b of bands) b.sort((x, y) => CNT[y] - CNT[x] || DF[y] - DF[x] || hash01(W[x]) - hash01(W[y]));
  const order = [];
  {
    const per = Math.ceil((state.labels * 2.2) / bands.length);
    const heads = bands.map(() => 0);
    let more = true;
    while (more) {
      more = false;
      for (let b = bands.length - 1; b >= 0; b--) {
        if (heads[b] < Math.min(per, bands[b].length)) { order.push(bands[b][heads[b]++]); more = true; }
      }
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'middle';
  let placed = 0;
  for (const i of order) {
    if (placed >= state.labels) break;
    const px = X[i] * S, py = Y[i] * S;
    const fs = Math.max(10, Math.min(17, 9 + 7 * freqU(CNT[i]))) * (cv.width / 1000);
    ctx.font = `${fs.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tw = ctx.measureText(W[i]).width;

    // push the label outward along its own bearing so it never sits on its dot
    const ox = Math.cos(ANG[i]) * (SZ[i] + 4) * S;
    const oy = Math.sin(ANG[i]) * (SZ[i] + 4) * S;
    const anchorLeft = Math.cos(ANG[i]) >= 0;
    const lx = px + ox + (anchorLeft ? 0 : -tw);
    const ly = py + oy;
    if (lx < 2 || lx + tw > cv.width - 2 || ly < fs || ly > cv.height - fs) continue;

    const c0 = Math.floor(lx / CELL), c1 = Math.floor((lx + tw) / CELL);
    const r0 = Math.floor((ly - fs * 0.55) / CELL), r1 = Math.floor((ly + fs * 0.55) / CELL);
    let free = true;
    for (let r = r0; r <= r1 && free; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || c < 0 || r >= gh || c >= gw || grid[r * gw + c]) { free = false; break; }
      }
    }
    if (!free) continue;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * gw + c] = 1;

    ctx.fillStyle = 'rgba(4,6,10,0.72)';
    ctx.fillText(W[i], lx + 1, ly + 1);
    ctx.fillStyle = isHub[i] ? '#f0e6d2' : '#e8f0f7';
    ctx.fillText(W[i], lx, ly);
    placed++;
  }
  ctx.setTransform(S, 0, 0, S, 0, 0);
}

// ── highlights ──────────────────────────────────────────────────────────────

function drawMarker(i, colour) {
  if (i < 0) return;
  ctx.beginPath();
  ctx.arc(X[i], Y[i], Math.max(4, SZ[i] * 2.4) / S * 1.6, 0, TAU);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6 / S;
  ctx.stroke();
}

// The control bindings below call draw() as they initialise, which happens
// before the first recolour() — without this guard the very first paint indexes
// an empty palette and the page dies on load.
let ready = false;

function draw() {
  if (!ready) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#080a0e';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawStructure(state.weblines);
  drawMarks();
  drawMarker(state.found, 'rgba(216,164,69,0.95)');
  drawMarker(state.hit, 'rgba(255,255,255,0.85)');
  drawLabels();
}

// ─── hover ──────────────────────────────────────────────────────────────────

const CELL = 9;
const GW = Math.ceil(WORLD / CELL);
const hashGrid = new Map();
for (let i = 0; i < N; i++) {
  const key = ((Y[i] / CELL) | 0) * GW + ((X[i] / CELL) | 0);
  let a = hashGrid.get(key);
  if (!a) { a = []; hashGrid.set(key, a); }
  a.push(i);
}

function pick(wx, wy) {
  const gx = (wx / CELL) | 0, gy = (wy / CELL) | 0;
  let best = -1, bd = 64;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const a = hashGrid.get((gy + dy) * GW + (gx + dx));
      if (!a) continue;
      for (const i of a) {
        if (CNT[i] < state.minc) continue;
        if (state.hidden.size && state.hidden.has(SEC[i])) continue;
        const d = (X[i] - wx) ** 2 + (Y[i] - wy) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
  }
  return best;
}

const dayToDate = (d) => {
  const t = Date.parse(data.span[0] + 'T00:00:00Z') + d * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};
const labelOf = (k) => (data.sectors.find((s) => s.k === k)?.label || []).slice(0, 3).join(' ');

cv.addEventListener('mousemove', (e) => {
  const b = cv.getBoundingClientRect();
  const wx = ((e.clientX - b.left) / b.width) * WORLD;
  const wy = ((e.clientY - b.top) / b.height) * WORLD;
  const i = pick(wx, wy);
  if (i !== state.hit) { state.hit = i; draw(); }
  const tip = $('tip');
  if (i < 0) { tip.hidden = true; return; }
  tip.hidden = false;
  const rank = i + 1;
  tip.innerHTML =
    `<b>${W[i]}</b> <i>#${rank.toLocaleString()}</i><br>` +
    `${CNT[i].toLocaleString()}× in ${DF[i].toLocaleString()} post${DF[i] === 1 ? '' : 's'}<br>` +
    `<i>first</i> ${dayToDate(FIRST[i])}<br>` +
    `<i>${isHub[i] ? 'the hub' : labelOf(SEC[i])}</i>`;
  const pad = 14;
  let lx = e.clientX - b.left + pad, ly = e.clientY - b.top + pad;
  if (lx + 210 > b.width) lx = e.clientX - b.left - 210;
  if (ly + 90 > b.height) ly = e.clientY - b.top - 90;
  tip.style.left = lx + 'px';
  tip.style.top = ly + 'px';
});
cv.addEventListener('mouseleave', () => { $('tip').hidden = true; state.hit = -1; draw(); });

// ─── controls ───────────────────────────────────────────────────────────────

$('mode').onchange = () => { state.mode = $('mode').value; recolour(state.mode); draw(); };
const bindRange = (id, key, fmt, scale = 1) => {
  const el = $(id);
  const out = $(id + 'v');
  const upd = () => {
    state[key] = +el.value * scale;
    out.textContent = fmt(+el.value);
    draw();
  };
  el.addEventListener('input', upd);
  upd();
};
bindRange('labels', 'labels', (v) => v);
bindRange('minc', 'minc', (v) => (v === 1 ? 'all' : v + '×'));
bindRange('weblines', 'weblines', (v) => v + '%', 0.01);

$('find').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  state.found = -1;
  if (q) {
    let exact = -1, pre = -1;
    for (let i = 0; i < N; i++) {
      if (W[i] === q) { exact = i; break; }
      if (pre < 0 && W[i].startsWith(q)) pre = i;
    }
    state.found = exact >= 0 ? exact : pre;
  }
  const o = $('findout');
  if (state.found >= 0) {
    const i = state.found;
    o.textContent = `${W[i]} — ${CNT[i]}× · rank ${(i + 1).toLocaleString()} · first ${dayToDate(FIRST[i])} · ${isHub[i] ? 'hub' : labelOf(SEC[i])}`;
  } else o.textContent = q ? 'not in this vocabulary' : '';
  draw();
});

// ─── the side panels ────────────────────────────────────────────────────────

{
  const ul = $('sectors');
  const rows = [{ k: data.general, hub: true }].concat(ring.map((k) => ({ k, hub: false })));
  ul.innerHTML = rows.map(({ k, hub }) => {
    const s = data.sectors.find((x) => x.k === k);
    const hue = hub ? null : SECTOR_HUE[ring.indexOf(k) % 12];
    const sw = hub ? 'background:#8794a3' : `background:${rgb(hsl(hue, 0.46, 0.62))}`;
    return `<li data-k="${k}"><span class="sw" style="${sw}"></span>` +
      `<span class="wds">${hub ? '<b>the hub</b> · ' : ''}${s.label.slice(0, 4).join(' ')}</span>` +
      `<span class="n">${s.types.toLocaleString()}</span></li>`;
  }).join('');
  ul.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const k = +li.dataset.k;
    if (state.hidden.has(k)) state.hidden.delete(k); else state.hidden.add(k);
    li.classList.toggle('off', state.hidden.has(k));
    draw();
  });
}

{
  const rows = [];
  const push = (a, b, sep) => rows.push(`<tr${sep ? ' class="sep"' : ''}><td>${a}</td><td>${b}</td></tr>`);
  push('handle', data.handle);
  push('posts', data.posts.toLocaleString());
  push('  of which replies', data.replies.toLocaleString());
  push('  with a content word', (data.postsWithWords ?? data.posts).toLocaleString());
  push('span', `${data.span[0]} → ${data.span[1]}`);
  push('sessions', data.sessions.toLocaleString(), true);
  push('content tokens', data.tokens.toLocaleString());
  push('word types', data.types.toLocaleString());
  push('used exactly once', `${data.hapax.toLocaleString()} (${(100 * data.hapax / data.types).toFixed(0)}%)`);
  push('type-token ratio', (data.types / data.tokens).toFixed(4), true);
  push('built', data.built);
  $('stats').innerHTML = rows.join('');

  $('tagsub').innerHTML =
    `— all <b>${data.types.toLocaleString()}</b> of them — from <b>${data.posts.toLocaleString()}</b> posts by ` +
    `<b>${data.handle}</b>, ${data.span[0]} to ${data.span[1]}. Angle is topic, radius is how often, ` +
    `colour is when. The hub is the words that belong to no topic at all.`;
  $('hapaxn').textContent = data.hapax.toLocaleString();
  $('genn').textContent = (data.sectors.find((s) => s.k === data.general)?.types || 0).toLocaleString();
}

// ─── the flat charts ────────────────────────────────────────────────────────

function svg(w, h, body) {
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}
const AX = 'stroke:#232c37;stroke-width:1';
const fit = (xs, ys) => {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) { n++; sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { b, a: (sy - b * sx) / n };
};

{ // Zipf
  const w = 420, h = 260, m = { l: 34, r: 8, t: 8, b: 26 };
  const pts = [];
  for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 900))) pts.push([Math.log10(i + 1), Math.log10(CNT[i])]);
  const xmax = Math.log10(N), ymax = Math.log10(CNT[0]);
  const px = (x) => m.l + (x / xmax) * (w - m.l - m.r);
  const py = (y) => h - m.b - (y / ymax) * (h - m.t - m.b);
  const f = fit(pts.map((p) => p[0]), pts.map((p) => p[1]));
  let body = `<line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" style="${AX}"/>` +
             `<line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" style="${AX}"/>`;
  body += `<polyline fill="none" stroke="#56a0ac" stroke-width="1.4" points="${pts.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ')}"/>`;
  // clip the fitted line to the box — extrapolated back to rank 1 it leaves the
  // plot entirely, which reads as a drawing error rather than a fit
  const x0 = Math.max(0, (ymax - f.a) / f.b);
  body += `<line x1="${px(x0)}" y1="${py(Math.min(ymax, f.a + f.b * x0))}" x2="${px(xmax)}" y2="${py(Math.max(0, f.a + f.b * xmax))}" stroke="#d8a445" stroke-width="1" stroke-dasharray="4 4"/>`;
  for (const d of [0, 1, 2, 3, 4]) if (d <= xmax) body += `<text x="${px(d)}" y="${h - m.b + 14}" text-anchor="middle">10^${d}</text>`;
  for (const d of [0, 1, 2, 3]) if (d <= ymax) body += `<text x="${m.l - 6}" y="${py(d) + 3}" text-anchor="end">10^${d}</text>`;
  $('zipf').innerHTML = svg(w, h, body);
  $('cap-zipf').innerHTML = `<b>Zipf</b>rank against uses, log–log. The dashed line is the fitted slope, <b style="display:inline">${f.b.toFixed(2)}</b>. A straight line here is why the web cannot put radius on frequency at all: half the vocabulary sits at the far right of this plot, on one value. The web puts radius on <em>rank</em>, spaced for equal area, and draws the counts back on as rings.`;
}

{ // Heaps
  const w = 420, h = 260, m = { l: 42, r: 8, t: 8, b: 26 };
  const pts = data.heaps.filter(([n]) => n > 200);
  const xmax = Math.max(...pts.map((p) => p[0])), ymax = Math.max(...pts.map((p) => p[1]));
  const px = (x) => m.l + (x / xmax) * (w - m.l - m.r);
  const py = (y) => h - m.b - (y / ymax) * (h - m.t - m.b);
  const f = fit(pts.map((p) => Math.log(p[0])), pts.map((p) => Math.log(p[1])));
  let body = `<line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" style="${AX}"/>` +
             `<line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" style="${AX}"/>`;
  body += `<polyline fill="none" stroke="#56a0ac" stroke-width="1.6" points="${pts.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ')}"/>`;
  const K = Math.exp(f.a);
  const proj = [];
  for (let x = 200; x <= xmax; x += xmax / 60) proj.push(`${px(x).toFixed(1)},${py(K * Math.pow(x, f.b)).toFixed(1)}`);
  body += `<polyline fill="none" stroke="#d8a445" stroke-width="1" stroke-dasharray="4 4" points="${proj.join(' ')}"/>`;
  body += `<text x="${px(xmax)}" y="${h - m.b + 14}" text-anchor="end">${(xmax / 1000).toFixed(0)}k tokens</text>`;
  body += `<text x="${m.l - 6}" y="${py(ymax) + 3}" text-anchor="end">${(ymax / 1000).toFixed(0)}k</text>`;
  body += `<text x="${m.l - 6}" y="${py(0) + 3}" text-anchor="end">0</text>`;
  $('heaps').innerHTML = svg(w, h, body);
  $('cap-heaps').innerHTML = `<b>Heaps</b>new word types against tokens read. Fitted <b style="display:inline">V = ${K.toFixed(1)}·N^${f.b.toFixed(3)}</b> — still climbing, and it always will. Double this corpus and the model says about <b style="display:inline">${Math.round(K * Math.pow(data.tokens * 2, f.b) / 1000)}k</b> types, not ${Math.round(data.types / 1000)}k×2.`;
}

{ // monthly
  const w = 420, h = 260, m = { l: 34, r: 30, t: 8, b: 30 };
  const ms = data.months;
  const pmax = Math.max(...ms.map((x) => x[1]));
  const fmax = Math.max(...ms.map((x) => x[3]));
  const bw = (w - m.l - m.r) / ms.length;
  let body = `<line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" style="${AX}"/>`;
  ms.forEach((x, i) => {
    const bh = (x[1] / pmax) * (h - m.t - m.b);
    body += `<rect x="${(m.l + i * bw + 0.6).toFixed(1)}" y="${(h - m.b - bh).toFixed(1)}" width="${Math.max(1, bw - 1.2).toFixed(1)}" height="${bh.toFixed(1)}" fill="#2c4450"/>`;
  });
  const line = ms.map((x, i) => `${(m.l + i * bw + bw / 2).toFixed(1)},${(h - m.b - (x[3] / fmax) * (h - m.t - m.b)).toFixed(1)}`);
  body += `<polyline fill="none" stroke="#d8a445" stroke-width="1.6" points="${line.join(' ')}"/>`;
  body += `<text x="${m.l}" y="${h - m.b + 14}">${ms[0][0]}</text>`;
  body += `<text x="${w - m.r}" y="${h - m.b + 14}" text-anchor="end">${ms[ms.length - 1][0]}</text>`;
  body += `<text x="${m.l - 6}" y="${m.t + 8}" text-anchor="end" fill="#d8a445">${fmax}</text>`;
  $('months').innerHTML = svg(w, h, body);
  const firstYear = ms.slice(0, 12).reduce((a, x) => a + x[3], 0);
  $('cap-months').innerHTML = `<b>Acquisition</b>posts a month (bars) against words used for the first time that month (gold). <b style="display:inline">${firstYear.toLocaleString()}</b> of the ${data.types.toLocaleString()} types arrived in the first twelve months. The gold line falling while the bars hold up is the whole reason the web's hub is small and its rim is huge.`;
}

// ─── go ─────────────────────────────────────────────────────────────────────

recolour(state.mode);
ready = true;
window.addEventListener('resize', size);
size();
