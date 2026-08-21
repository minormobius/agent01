// app.mjs — lay a vocabulary out as an orb web and draw it.
//
// The layout is two independent axes and nothing else:
//
//   ANGLE  = topic wedge, and position within the wedge by similarity to the
//            next wedge along, so boundaries are blends rather than seams.
//   RADIUS = rank, spaced for equal area. See the long note at radiusForP.
//
// Everything is a function of one `data` object, because the page now has two
// sources for it: the committed data.json, and whatever a visitor's own repo
// produces in the Web Worker. Nothing below may assume which.

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// A GUTTER, NOT A TIGHT FIT. The disc used to be inscribed in the square with
// 4% to spare, which left rim labels at 3 and 9 o'clock nowhere to go: they
// were dropped by the overflow guard, or drawn hard against the border where
// they read as running off the page. The ring now stops well short of the edge,
// and the space it gives back is where the wedge names live.
const WORLD = 1200;
const CX = WORLD / 2, CY = WORLD / 2;
const R_HUB_IN = 16, R_HUB_OUT = 112;
const R_IN = 128, R_OUT = 448;
const GUTTER = CY - R_OUT;                                   // 152 world units

const SECTOR_HUE = [205, 34, 168, 12, 265, 96, 320, 52, 188, 145, 285, 72];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const TIME_RAMP = [[58, 122, 158], [168, 178, 190], [226, 150, 68]];
const timeColour = (t) => (t < 0.5
  ? mix(TIME_RAMP[0], TIME_RAMP[1], t * 2)
  : mix(TIME_RAMP[1], TIME_RAMP[2], (t - 0.5) * 2));
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const hash01 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 8) / 0xffffff;
};

const SHELLS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181];
const RING_LABELS = [1, 3, 8, 21, 55, 144, 377, 987, 2584];

// ─── layout ─────────────────────────────────────────────────────────────────

let D = null;      // the dataset in view
let L = null;      // everything derived from it

function buildLayout(data) {
  const N = data.cols.w.length;
  const { w: W, c: CNT, d: DF, f: FIRST, m: MEAN, s: SEC, i: IDX } = data.cols;
  const X = new Float32Array(N);
  const Y = new Float32Array(N);
  const SZ = new Float32Array(N);
  const ANG = new Float32Array(N);
  const isHub = new Uint8Array(N);

  const ring = data.order.filter((k) => k !== data.general);
  // One object per wedge, mutated in place by blendGeom rather than replaced:
  // drawStructure and drawAnchors hold on to this Map, and swapping it out
  // under them would leave them drawing last frame's geometry.
  const wedgeOf = new Map(ring.map((k) => [k, { a0: 0, a1: 0, span: 0, mid: 0 }]));

  let CMAX = 1;
  for (let i = 0; i < N; i++) if (SEC[i] !== data.general && CNT[i] > CMAX) CMAX = CNT[i];
  const LOGMAX = Math.log(CMAX) || 1;
  const freqU = (c) => Math.min(1, Math.log(c) / LOGMAX);

  // ── RADIUS IS RANK, PLACED FOR EQUAL AREA ─────────────────────────────────
  //
  // The obvious mapping — radius ∝ log frequency — is unusable on a real
  // vocabulary, and it took drawing it to see why. Zipf puts about half of any
  // lexicon at exactly one use, and log(1) = 0, so half the words land on a
  // single hairline circle at the rim while the whole interior sits empty.
  // Widening the band does not fix it: log-frequency gave the count-1 shell 9%
  // of the radius for 48% of the words.
  //
  //     r(p) = √( r_in² + (r_rim² − r_in²) · p ),   p = rank / N
  //
  // Density is then flat across the disc — the only way a picture of a Zipf
  // distribution can be looked at — and frequency stays legible, because rank
  // is monotone in count and the rings are drawn where the counts cross.
  //
  // Ties are broken by hash, not by the alphabet: they arrive alphabetically,
  // and an alphabetical gradient in radius is a lie the eye reads as structure.
  const radiusForP = (p, rim) => Math.sqrt(R_IN * R_IN + (rim * rim - R_IN * R_IN) * p);

  for (let i = 0; i < N; i++) {
    isHub[i] = SEC[i] === data.general ? 1 : 0;
    SZ[i] = isHub[i]
      ? 1.0 + 2.2 * Math.pow(freqU(CNT[i]), 1.4)
      : (wedgeOf.has(SEC[i]) ? 1.15 + 2.4 * Math.pow(freqU(CNT[i]), 1.6) : 0);
  }

  // ── THE FILTER RE-WEAVES THE WEB ──────────────────────────────────────────
  //
  // `min uses` used to hide marks and nothing else, so raising it ate the rim
  // and left a moth-eaten copy of the same picture — the surviving words still
  // sitting where they had sat when they had company. But every positional
  // quantity here is a function of WHICH WORDS ARE IN PLAY: a wedge's angular
  // span comes from how many types the topic has, its rim vertex from how deep
  // its tail runs, a word's radius from its rank, its angle from its index
  // within its wedge. Recompute all of it over the survivors and the web
  // genuinely re-forms — wedges breathe, the outline changes shape, and what is
  // left spreads out to fill the disc.
  //
  // This runs on every `input` event of a dragged slider, so it has to be O(N)
  // with small constants. The SORTS HAPPEN ONCE, here: filtering removes words
  // but never reorders them, so a precomputed order can be walked with the
  // misses skipped, and the survivor's rank is just how many survivors came
  // before it.
  const ringOrder = [];
  const hubOrder = [];
  for (let i = 0; i < N; i++) (isHub[i] ? hubOrder : ringOrder).push(i);
  ringOrder.sort((a, b) => CNT[b] - CNT[a] || hash01(W[a]) - hash01(W[b]));
  hubOrder.sort((a, b) => CNT[b] - CNT[a]);

  const members = new Map(ring.map((k) => [k, []]));
  for (let i = 0; i < N; i++) { const a = members.get(SEC[i]); if (a) a.push(i); }
  for (const a of members.values()) a.sort((x, y) => IDX[x] - IDX[y]);

  // Geometry is twelve wedges and eighteen contour radii — small enough to hold
  // three copies of (where it was, where it is going, where it is now) and lerp
  // between them, which is what makes the change read as a web re-weaving
  // rather than as one picture cutting to another.
  const K = ring.length;
  const NS = SHELLS.length;
  const mkGeom = () => ({
    a0: new Float64Array(K), span: new Float64Array(K),
    vr: new Float64Array(K), shellP: new Float64Array(NS),
  });
  const gFrom = mkGeom(), gTo = mkGeom(), gNow = mkGeom();
  const TX = new Float32Array(N), TY = new Float32Array(N), TANG = new Float32Array(N);
  const FX = new Float32Array(N), FY = new Float32Array(N), FANG = new Float32Array(N);

  // The rim is not a circle: each wedge's frame vertex sits further out the
  // deeper that wedge's tail runs, so the outline is a portrait of range — and
  // therefore changes shape as the filter changes what "range" means.
  const rimOf = (g, angle) => {
    const a = ((angle + Math.PI / 2) % TAU + TAU) % TAU;
    let acc = 0;
    for (let i = 0; i < K; i++) {
      if (a <= acc + g.span[i] || i === K - 1) {
        const t = g.span[i] > 0 ? (a - acc) / g.span[i] : 0;
        return lerp(g.vr[i], g.vr[(i + 1) % K], Math.min(1, Math.max(0, t)));
      }
      acc += g.span[i];
    }
    return R_OUT;
  };

  function computeGeom(minc, g, tx, ty, tang) {
    // wedge spans, from the surviving type count of each topic
    const live = new Float64Array(K);
    let total = 0;
    for (let ki = 0; ki < K; ki++) {
      let n = 0;
      for (const i of members.get(ring[ki])) if (CNT[i] >= minc) n++;
      live[ki] = Math.max(1, n);          // an emptied wedge keeps a hairline slice
      total += live[ki];
    }
    let a = -Math.PI / 2;
    for (let ki = 0; ki < K; ki++) {
      g.span[ki] = TAU * (live[ki] / total);
      g.a0[ki] = a;
      a += g.span[ki];
    }
    let vMin = Infinity, vMax = -Infinity;
    for (let ki = 0; ki < K; ki++) { vMin = Math.min(vMin, live[ki]); vMax = Math.max(vMax, live[ki]); }
    for (let ki = 0; ki < K; ki++) {
      const u = vMax > vMin ? (live[ki] - vMin) / (vMax - vMin) : 1;
      g.vr[ki] = R_OUT * (0.84 + 0.16 * u);
    }

    // angle: position within the wedge, over the survivors of that wedge
    for (let ki = 0; ki < K; ki++) {
      const list = members.get(ring[ki]);
      let nn = 0;
      for (const i of list) if (CNT[i] >= minc) nn++;
      nn = nn || 1;
      let j = 0;
      for (const i of list) {
        if (CNT[i] < minc) continue;
        tang[i] = g.a0[ki] + g.span[ki] * (0.04 + 0.92 * ((j + 0.5) / nn));
        j++;
      }
    }

    // radius: rank among survivors, equal-area — and the contour rings in the
    // same descending walk, so `21×` keeps meaning "where 21 uses starts" for
    // the vocabulary actually on screen.
    let nSurv = 0;
    for (const i of ringOrder) if (CNT[i] >= minc) nSurv++;
    const denom = nSurv || 1;
    let si = NS - 1, j = 0;
    for (const i of ringOrder) {
      if (CNT[i] < minc) continue;
      while (si >= 0 && CNT[i] < SHELLS[si]) { g.shellP[si] = j / denom; si--; }
      const ang = tang[i];
      const r = radiusForP((j + 0.5) / denom, rimOf(g, ang));
      tx[i] = CX + Math.cos(ang) * r;
      ty[i] = CY + Math.sin(ang) * r;
      j++;
    }
    while (si >= 0) { g.shellP[si] = j / denom; si--; }

    // hub: a phyllotaxis disc, most-used at the centre, over the survivors
    let hn = 0;
    for (const i of hubOrder) if (CNT[i] >= minc) hn++;
    const hd = hn || 1;
    let hj = 0;
    for (const i of hubOrder) {
      if (CNT[i] < minc) continue;
      const r = R_HUB_IN + (R_HUB_OUT - R_HUB_IN) * Math.sqrt((hj + 0.5) / hd);
      const ang = hj * GOLDEN;
      tang[i] = ang;
      tx[i] = CX + Math.cos(ang) * r;
      ty[i] = CY + Math.sin(ang) * r;
      hj++;
    }
  }

  const copyGeom = (src, dst) => {
    dst.a0.set(src.a0); dst.span.set(src.span);
    dst.vr.set(src.vr); dst.shellP.set(src.shellP);
  };
  const blendGeom = (e) => {
    for (let ki = 0; ki < K; ki++) {
      gNow.a0[ki] = lerp(gFrom.a0[ki], gTo.a0[ki], e);
      gNow.span[ki] = lerp(gFrom.span[ki], gTo.span[ki], e);
      gNow.vr[ki] = lerp(gFrom.vr[ki], gTo.vr[ki], e);
    }
    for (let s = 0; s < NS; s++) gNow.shellP[s] = lerp(gFrom.shellP[s], gTo.shellP[s], e);
    for (let ki = 0; ki < K; ki++) {
      const w = wedgeOf.get(ring[ki]);
      w.a0 = gNow.a0[ki]; w.span = gNow.span[ki];
      w.a1 = w.a0 + w.span; w.mid = w.a0 + w.span / 2;
    }
  };

  // The spatial hash for hover. Rebuilt when a re-weave settles, never during
  // one: 39k Map inserts a frame is not affordable, and a tooltip mid-flight is
  // not worth having.
  const CELL = 9;
  const GW = Math.ceil(WORLD / CELL);
  let grid = new Map();
  function regrid() {
    grid = new Map();
    for (let i = 0; i < N; i++) {
      const key = ((Y[i] / CELL) | 0) * GW + ((X[i] / CELL) | 0);
      let a = grid.get(key);
      if (!a) { a = []; grid.set(key, a); }
      a.push(i);
    }
    out.grid = grid;
  }

  // Start settled at "everything", so a page that never touches the slider is
  // byte-for-byte the picture it was before any of this existed.
  computeGeom(1, gTo, TX, TY, TANG);
  copyGeom(gTo, gFrom);
  copyGeom(gTo, gNow);
  blendGeom(1);
  X.set(TX); Y.set(TY); ANG.set(TANG);

  const out = { N, W, CNT, DF, FIRST, MEAN, SEC, X, Y, SZ, ANG, isHub,
    ring, wedge: wedgeOf, radiusForP, freqU, grid, CELL, GW,
    rimAt: (a) => rimOf(gNow, a), shellP: gNow.shellP,
    TX, TY, TANG, FX, FY, FANG, gFrom, gTo, gNow,
    computeGeom, copyGeom, blendGeom, regrid };
  regrid();
  return out;
}

// ─── colour ─────────────────────────────────────────────────────────────────

const BUCKETS = 28;
let bucket = null;
let bucketColour = [];

function recolour(mode) {
  const { N, CNT, DF, FIRST, MEAN, SEC } = L;
  bucket = new Uint8Array(N);
  const days = Math.max(1, D.days);
  if (mode === 'sector') {
    for (let i = 0; i < N; i++) bucket[i] = L.ring.indexOf(SEC[i]) + 1;
    bucketColour = [hsl(0, 0, 0.72)].concat(L.ring.map((k, i) => hsl(SECTOR_HUE[i % 12], 0.46, 0.62)));
    $('colourlegend').textContent = 'which wedge — the hub is grey';
    return;
  }
  const vals = new Float32Array(N);
  if (mode === 'burst') {
    for (let i = 0; i < N; i++) vals[i] = Math.min(1, (CNT[i] / DF[i] - 1) / 1.4);
    $('colourlegend').textContent = 'repeats within a post — pale means said once and moved on, warm means said again and again in the same breath';
  } else {
    const src = mode === 'first' ? FIRST : MEAN;
    for (let i = 0; i < N; i++) vals[i] = Math.min(1, Math.max(0, src[i] / days));
    $('colourlegend').textContent = mode === 'first'
      ? `when the word first appeared — ${D.span[0]} is cool, ${D.span[1]} is warm`
      : `the average date of every use — ${D.span[0]} is cool, ${D.span[1]} is warm`;
  }
  for (let i = 0; i < N; i++) bucket[i] = Math.min(BUCKETS - 1, (vals[i] * BUCKETS) | 0);
  bucketColour = [];
  for (let b = 0; b < BUCKETS; b++) bucketColour.push(timeColour((b + 0.5) / BUCKETS));
}

// ─── drawing ────────────────────────────────────────────────────────────────

const cv = $('web');
const ctx = cv.getContext('2d');
let S = 1;
let ready = false;

const state = {
  mode: 'mean', tsize: 13, minc: 1, weblines: 0.55, shown: 0,
  hidden: new Set(), hit: -1, found: -1,
};

// ── HOW MANY LABELS FIT IS A CONSEQUENCE OF HOW BIG THEY ARE ────────────────
//
// There used to be a count slider and a fixed type size, which is the wrong way
// round: asking for 400 labels at 17px is asking for something the canvas
// cannot give, and the control silently did nothing past the point where the
// collision grid was full. Type size is the honest handle — you can always see
// what it did — and the number of labels follows from it, quadratically,
// because labels compete for AREA. The readout reports what was actually
// placed, so it is a measurement rather than a setting.
const TSIZE_REF = 13, LABELS_REF = 150;
const budgetFor = (size, z) =>
  Math.round(LABELS_REF * (TSIZE_REF / size) ** 2 * Math.min(3.5, Math.max(1, z * 0.8)));

// ── THE VIEW ────────────────────────────────────────────────────────────────
//
// world → device is  d = w · S · z + pan.  Marks and structure are drawn under
// that as a canvas transform; labels and anchors are drawn with the identity
// transform (text does not want to be scaled) and apply it themselves, which is
// what `tf` is for.
//
// Sizes stay constant in DEVICE pixels as you zoom — dots do not grow, lines do
// not thicken. That is the whole point: zooming has to separate the haze into
// individual words rather than magnify a blob.
const view = { z: 1, x: 0, y: 0 };
const MINZ = 1, MAXZ = 40;
// The transform carries the size of the SURFACE IT IS FOR, not just the scale.
// It did not, once, and the export was the casualty: drawMarks culled against
// the on-screen canvas while rendering into a 2000px one, so everything past
// `cv.width / s` world units was dropped and the PNG came out as a quarter of a
// web. Anything that needs to know where the edges are now has to be handed a
// transform, which is the only object that knows.
const tf = () => ({ s: S * view.z, x: view.x, y: view.y, w: cv.width, h: cv.height });

function clampPan() {
  // Never let the web leave the frame entirely. At z = 1 it is pinned dead
  // centre; beyond that you may push the edge of the disc to the middle of the
  // canvas and no further.
  const span = WORLD * S * view.z;
  const slack = view.z <= 1 ? 0 : cv.width / 2;
  const min = cv.width - span - slack;
  view.x = Math.min(slack, Math.max(min, view.x));
  view.y = Math.min(slack, Math.max(cv.height - span - slack, view.y));
  if (view.z <= 1) { view.x = (cv.width - span) / 2; view.y = (cv.height - span) / 2; }
}

function zoomAt(dx, dy, factor) {
  const z0 = view.z;
  view.z = Math.min(MAXZ, Math.max(MINZ, view.z * factor));
  const k = view.z / z0;
  view.x = dx - (dx - view.x) * k;
  view.y = dy - (dy - view.y) * k;
  clampPan();
  showZoom();
  draw();
}

function resetView() { view.z = 1; clampPan(); showZoom(); draw(); }

// ─── the re-weave ───────────────────────────────────────────────────────────
//
// Changing `min uses` recomputes the whole layout for the surviving words and
// then flies everything there. The motion is the point: a snap would show you a
// different web, where a tween shows you THIS web re-forming — wedges opening
// and closing, the rim changing shape, the tail streaming outward as it stops
// having to share the disc. Retargeting mid-flight is deliberate and is what
// makes dragging the slider feel continuous: `from` is wherever things are at
// this instant, not wherever they started.
const WEAVE_MS = 480;
let weaveT0 = 0, weaving = false, weaveRaf = 0;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function reweave(minc, instant = false) {
  if (!L) return;
  const { X, Y, ANG, TX, TY, TANG, FX, FY, FANG, gFrom, gTo, gNow } = L;
  FX.set(X); FY.set(Y); FANG.set(ANG);
  L.copyGeom(gNow, gFrom);
  L.computeGeom(minc, gTo, TX, TY, TANG);
  if (instant || reducedMotion()) {
    X.set(TX); Y.set(TY); ANG.set(TANG);
    L.copyGeom(gTo, gNow);
    L.blendGeom(1);
    L.regrid();
    weaving = false;
    draw();
    return;
  }
  weaveT0 = performance.now();
  if (!weaving) { weaving = true; weaveRaf = requestAnimationFrame(weaveStep); }
}

function weaveStep(now) {
  const { N, X, Y, ANG, TX, TY, TANG, FX, FY, FANG } = L;
  const raw = Math.min(1, (now - weaveT0) / WEAVE_MS);
  const e = easeInOut(raw);
  for (let i = 0; i < N; i++) {
    X[i] = FX[i] + (TX[i] - FX[i]) * e;
    Y[i] = FY[i] + (TY[i] - FY[i]) * e;
    ANG[i] = FANG[i] + (TANG[i] - FANG[i]) * e;
  }
  L.blendGeom(e);
  draw();
  if (raw < 1) { weaveRaf = requestAnimationFrame(weaveStep); return; }
  L.copyGeom(L.gTo, L.gNow);
  weaving = false;
  L.regrid();          // the hover hash is only rebuilt once the web has settled
}

function showZoom() {
  const el = $('zoomtag');
  if (!el) return;
  el.hidden = view.z <= 1.001;
  el.firstChild.textContent = `${view.z.toFixed(1)}×`;
}

function size() {
  const w = cv.parentElement.clientWidth;
  if (!w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(w * dpr);
  cv.style.height = w + 'px';
  S = cv.width / WORLD;
  clampPan();
  draw();
}

function drawStructure(c, s, alpha) {
  if (alpha <= 0.001) return;
  const { ring, wedge, rimAt, radiusForP, shellP } = L;
  c.lineCap = 'round';

  // the capture spiral: one continuous curve threading every contour
  c.beginPath();
  const turns = SHELLS.length - 1;
  for (let t = 0; t <= turns; t += 0.02) {
    const seg = Math.min(turns - 1, Math.floor(t));
    const f = t - seg;
    const a = -Math.PI / 2 + t * TAU;
    const rim = rimAt(a);
    const r = lerp(radiusForP(shellP[seg], rim), radiusForP(shellP[seg + 1], rim), f);
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
    if (t === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.strokeStyle = `rgba(226,240,252,${0.13 * alpha})`;
  c.lineWidth = 0.9 / s;
  c.stroke();

  // spokes
  c.beginPath();
  for (const k of ring) {
    const wd = wedge.get(k);
    const subs = Math.max(1, Math.round(44 * (wd.span / TAU)));
    for (let j = 0; j < subs; j++) {
      const a = wd.a0 + (wd.span * j) / subs;
      c.moveTo(CX + Math.cos(a) * R_IN, CY + Math.sin(a) * R_IN);
      c.lineTo(CX + Math.cos(a) * rimAt(a), CY + Math.sin(a) * rimAt(a));
    }
  }
  c.strokeStyle = `rgba(176,192,208,${0.16 * alpha})`;
  c.lineWidth = 0.8 / s;
  c.stroke();

  // frame
  c.beginPath();
  for (let j = 0; j <= 360; j++) {
    const a = -Math.PI / 2 + (j / 360) * TAU;
    const r = rimAt(a);
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
    if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.strokeStyle = `rgba(214,192,154,${0.62 * alpha + 0.18})`;
  c.lineWidth = 1.6 / s;
  c.stroke();

  c.beginPath();
  for (const k of ring) {
    const a = wedge.get(k).a0;
    c.moveTo(CX + Math.cos(a) * R_HUB_OUT, CY + Math.sin(a) * R_HUB_OUT);
    c.lineTo(CX + Math.cos(a) * rimAt(a), CY + Math.sin(a) * rimAt(a));
  }
  c.strokeStyle = `rgba(214,192,154,${0.30 * alpha + 0.10})`;
  c.lineWidth = 1.0 / s;
  c.stroke();

  for (const r of [R_HUB_OUT, R_IN]) {
    c.beginPath();
    c.arc(CX, CY, r, 0, TAU);
    c.strokeStyle = `rgba(206,218,230,${0.22 * alpha + 0.06})`;
    c.lineWidth = 0.9 / s;
    c.stroke();
  }
}

function drawMarks(c, s, cw, t) {
  const { N, CNT, SEC, X, Y, SZ } = L;
  const paths = Array.from({ length: bucketColour.length }, () => new Path2D());
  const dim = state.hidden.size > 0;
  const dimPath = new Path2D();
  // Marks are sized in DEVICE pixels so they stay crisp, but a fixed device
  // size is wrong on a small canvas: at 366 px the same dots that read as a
  // fine haze on a desktop merge into a solid disc. Scale the device size with
  // the canvas, floored so they never vanish entirely.
  // The cap used to be 1.35, which put the 2000px export outside the linear
  // regime while the screen was inside it: the same web came out with visibly
  // finer dots than the one you had been looking at. The cap is only there to
  // stop marks merging into blobs, which needs a much larger canvas than an
  // export before it becomes a risk.
  const dot = Math.max(0.45, Math.min(2.2, cw / 1000));
  // Cull to the visible world rectangle. At 20× this is most of the vocabulary,
  // and Path2D.rect on 39k invisible marks is pure cost. The bounds come from
  // the TRANSFORM's own surface, never from `cv` — see the note at tf().
  const vis = t ? {
    x0: (-t.x) / t.s - 8, y0: (-t.y) / t.s - 8,
    x1: (t.w - t.x) / t.s + 8, y1: (t.h - t.y) / t.s + 8,
  } : null;
  for (let i = 0; i < N; i++) {
    if (CNT[i] < state.minc || SZ[i] <= 0) continue;
    if (vis && (X[i] < vis.x0 || X[i] > vis.x1 || Y[i] < vis.y0 || Y[i] > vis.y1)) continue;
    const sz = (SZ[i] / s) * dot;
    (dim && state.hidden.has(SEC[i]) ? dimPath : paths[bucket[i]])
      .rect(X[i] - sz / 2, Y[i] - sz / 2, sz, sz);
  }
  if (dim) { c.fillStyle = 'rgba(120,132,148,0.10)'; c.fill(dimPath); }
  for (let b = 0; b < paths.length; b++) {
    c.fillStyle = rgb(bucketColour[b]);
    c.fill(paths[b]);
  }
}

// ── ANCHORING LABELS ────────────────────────────────────────────────────────
//
// Without these the picture is a beautiful object you cannot read: no way to
// know which direction is which topic, or what a given distance from the centre
// means. The wedge names go in the gutter, radially, each reading outward; the
// use-counts go along one wedge boundary, so the radial axis is annotated
// exactly once instead of twelve times.

// Returns the boxes it occupies, so the word labels can be told to keep off.
// Drawing the anchors last and letting them win a collision is right — they
// carry opaque plates and there are only a dozen — but "winning" still left the
// word underneath visibly clipped: `uses` painted over `currently` read as
// `current`. Reserving the space first is the difference between an anchor that
// covers a word and one that never had to.
function drawAnchors(c, t, px, cw, ch, collect = false) {
  const boxes = [];
  const box = (x, y, w, h) => { boxes.push({ x, y, w, h }); };
  const { ring, wedge, rimAt, radiusForP, shellP } = L;

  // EVERYTHING HERE IS DEVICE SPACE. The first version did its trigonometry in
  // world units and then drew with the identity transform, so a radius of 464
  // was read as 464 pixels — the wedge names landed halfway across the page and
  // off the left edge, which is exactly the bug these labels were added to help
  // with. World → device is a multiply by `s`, applied once, here.
  const wx = (v) => CX * t.s + t.x + v;
  const wy = (v) => CY * t.s + t.y + v;
  const s = t.s;

  // wedge names, in the gutter
  c.save();
  c.font = `${(13.5 * px).toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.textBaseline = 'middle';
  for (const k of ring) {
    const wd = wedge.get(k);
    const sec = D.sectors.find((x) => x.k === k);
    if (!sec) continue;
    const a = wd.mid;
    const r = (rimAt(a) + 14) * s;
    const ax = wx(Math.cos(a) * r);
    const ay = wy(Math.sin(a) * r);
    const left = Math.cos(a) < 0;

    // How much room is there, along the text's own direction, before the edge?
    // Solve for the distance at which the ray leaves the canvas, then trim the
    // label to fit it. Truncating is honest; drawing past the edge is not.
    const dx = Math.cos(a) * (left ? -1 : 1);
    const dy = Math.sin(a) * (left ? -1 : 1);
    const pad = 6 * px;
    let room = Infinity;
    if (dx > 1e-6) room = Math.min(room, (cw - pad - ax) / dx);
    if (dx < -1e-6) room = Math.min(room, (pad - ax) / dx);
    if (dy > 1e-6) room = Math.min(room, (ch - pad - ay) / dy);
    if (dy < -1e-6) room = Math.min(room, (pad - ay) / dy);
    if (!(room > 12 * px)) continue;

    let text = sec.label.slice(0, 2).join(' ');
    if (c.measureText(text).width > room) text = sec.label[0];
    while (text.length > 3 && c.measureText(text + '…').width > room) text = text.slice(0, -1);
    if (text !== sec.label[0] && text !== sec.label.slice(0, 2).join(' ')) text += '…';
    if (c.measureText(text).width > room) continue;

    // the rotated run, as an axis-aligned box around both ends
    const tw2 = c.measureText(text).width;
    const ex = ax + dx * tw2;
    const ey = ay + dy * tw2;
    box(Math.min(ax, ex) - 2 * px, Math.min(ay, ey) - 9 * px,
      Math.abs(ex - ax) + 4 * px, Math.abs(ey - ay) + 18 * px);
    if (collect) continue;

    c.save();
    c.translate(ax, ay);
    c.rotate(left ? a + Math.PI : a);
    c.textAlign = left ? 'right' : 'left';
    c.fillStyle = 'rgba(214,192,154,0.85)';
    c.fillText(text, 0, 0);
    c.restore();
  }
  c.restore();

  // the radial axis, annotated once — on a wedge boundary, so the counts sit in
  // the gap between two wedges rather than on top of anybody's words
  const axisAngle = wedge.get(ring[0]).a0;
  c.save();
  c.font = `${(11 * px).toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Outermost first, with a minimum gap. Equal-area radius squeezes the
  // high-count end hard — 3×, 8×, 21× and 55× all land within a few percent of
  // the hub — so without this the inner half of the axis is an illegible stack.
  const rimHere = rimAt(axisAngle);
  let lastR = Infinity;
  for (const count of RING_LABELS) {
    const si = SHELLS.indexOf(count);
    if (si < 0 || shellP[si] <= 0.0008) continue;
    const rr = radiusForP(shellP[si], rimHere);
    if (rr > rimHere - 8 || rr < R_IN + 6) continue;
    if ((lastR - rr) * s < 34 * px) continue;
    lastR = rr;
    const x = wx(Math.cos(axisAngle) * rr * s);
    const y = wy(Math.sin(axisAngle) * rr * s);
    const t = `${count}×`;
    const w = c.measureText(t).width;
    if (x - w / 2 < 2 || x + w / 2 > cw - 2 || y < 8 * px || y > ch - 8 * px) continue;
    box(x - w / 2 - 4 * px, y - 8 * px, w + 8 * px, 16 * px);
    if (collect) continue;
    c.fillStyle = 'rgba(8,10,14,0.94)';
    c.fillRect(x - w / 2 - 4 * px, y - 8 * px, w + 8 * px, 16 * px);
    c.fillStyle = 'rgba(186,200,214,0.98)';
    c.fillText(t, x, y);
  }
  // the axis caption sits just OUTSIDE the free-zone ring, not on it
  const lx = wx(Math.cos(axisAngle) * (R_IN + 13) * s);
  const ly = wy(Math.sin(axisAngle) * (R_IN + 13) * s);
  const lw = c.measureText('uses').width;
  box(lx - lw / 2 - 4 * px, ly - 8 * px, lw + 8 * px, 16 * px);
  if (!collect) {
    c.fillStyle = 'rgba(8,10,14,0.94)';
    c.fillRect(lx - lw / 2 - 4 * px, ly - 8 * px, lw + 8 * px, 16 * px);
    c.fillStyle = 'rgba(150,164,180,0.95)';
    c.fillText('uses', lx, ly);
  }
  c.restore();
  return boxes;
}

// ── word labels ─────────────────────────────────────────────────────────────

function drawLabels(c, t, cw, ch, budget, reserved = []) {
  if (budget <= 0) return 0;
  const { N, W, CNT, DF, SEC, X, Y, SZ, ANG, isHub, freqU } = L;
  const px = cw / 1000;
  const sx = (i) => X[i] * t.s + t.x;
  const sy = (i) => Y[i] * t.s + t.y;
  // The collision grid tracks the type size. Held at a constant 13px it made a
  // 8px label reserve a 13px row it did not need, so turning the text down
  // stopped buying you more words about halfway through the slider.
  const CELL = Math.max(5, state.tsize * 0.78) * px;
  const gw = Math.ceil(cw / CELL), gh = Math.ceil(ch / CELL);
  const grid = new Uint8Array(gw * gh);
  for (const b of reserved) {
    const c0 = Math.floor(b.x / CELL), c1 = Math.floor((b.x + b.w) / CELL);
    const r0 = Math.floor(b.y / CELL), r1 = Math.floor((b.y + b.h) / CELL);
    for (let r = Math.max(0, r0); r <= Math.min(gh - 1, r1); r++) {
      for (let col = Math.max(0, c0); col <= Math.min(gw - 1, c1); col++) grid[r * gw + col] = 1;
    }
  }

  // STRATIFY BY FREQUENCY BAND, WITH AN EQUAL SHARE EACH.
  //
  // Two failed versions are worth recording. Straight count-descending order
  // spends the whole budget failing to place labels in the crowded hub and then
  // prints whatever fits out in the hapax fog. Weighting the bands by how many
  // words they hold is no better, because the count-1 band holds about half the
  // lexicon and swallows the budget again. Both printed the same thing: a
  // parade of `aaaaalll`, `abbots`, `abby` — the alphabet, because ties in
  // count arrive alphabetically and nothing was breaking them.
  const bands = SHELLS.map(() => []);
  for (let i = 0; i < N; i++) {
    if (CNT[i] < state.minc || SZ[i] <= 0) continue;
    if (state.hidden.size && state.hidden.has(SEC[i])) continue;
    const px0 = sx(i), py0 = sy(i);
    if (px0 < -40 || px0 > cw + 40 || py0 < -20 || py0 > ch + 20) continue;
    let b = 0;
    while (b < SHELLS.length - 1 && CNT[i] >= SHELLS[b + 1]) b++;
    bands[b].push(i);
  }
  for (const b of bands) b.sort((x, y) => CNT[y] - CNT[x] || DF[y] - DF[x] || hash01(W[x]) - hash01(W[y]));
  const order = [];
  {
    const per = Math.ceil((budget * 2.2) / bands.length);
    const heads = bands.map(() => 0);
    let more = true;
    while (more) {
      more = false;
      for (let b = bands.length - 1; b >= 0; b--) {
        if (heads[b] < Math.min(per, bands[b].length)) { order.push(bands[b][heads[b]++]); more = true; }
      }
    }
  }

  c.textBaseline = 'middle';
  let placed = 0;
  for (const i of order) {
    if (placed >= budget) break;
    const cx = sx(i), cy = sy(i);
    // Size is the slider, spread around it by frequency: the ±22% keeps the
    // "this word is used more" cue that a flat size would throw away.
    const fs = state.tsize * (0.78 + 0.44 * freqU(CNT[i])) * px;
    c.font = `${fs.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tw = c.measureText(W[i]).width;

    // TRY OUTWARD, THEN INWARD. Pushing every label away from the centre reads
    // best, but at 3 and 9 o'clock there is nothing outward to push into — those
    // labels used to be silently dropped, so the rim lost its names exactly
    // where the picture is widest. Flipping to the inside is always available.
    let lx = 0, ly = 0, fits = false;
    for (const dir of [1, -1]) {
      const off = (SZ[i] + 4) * t.s * dir;
      const ox = Math.cos(ANG[i]) * off;
      const oy = Math.sin(ANG[i]) * off;
      const anchorLeft = (Math.cos(ANG[i]) * dir) >= 0;
      const x = cx + ox + (anchorLeft ? 0 : -tw);
      const y = cy + oy;
      if (x >= 3 && x + tw <= cw - 3 && y >= fs && y <= ch - fs) { lx = x; ly = y; fits = true; break; }
    }
    if (!fits) continue;

    const c0 = Math.floor(lx / CELL), c1 = Math.floor((lx + tw) / CELL);
    const r0 = Math.floor((ly - fs * 0.55) / CELL), r1 = Math.floor((ly + fs * 0.55) / CELL);
    let free = true;
    for (let r = r0; r <= r1 && free; r++) {
      for (let col = c0; col <= c1; col++) {
        if (r < 0 || col < 0 || r >= gh || col >= gw || grid[r * gw + col]) { free = false; break; }
      }
    }
    if (!free) continue;
    for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) grid[r * gw + col] = 1;

    c.fillStyle = 'rgba(4,6,10,0.72)';
    c.fillText(W[i], lx + 1, ly + 1);
    c.fillStyle = isHub[i] ? '#f0e6d2' : '#e8f0f7';
    c.fillText(W[i], lx, ly);
    placed++;
  }
  return placed;
}

function drawMarker(i, colour, t) {
  if (i < 0) return;
  ctx.beginPath();
  ctx.arc(L.X[i], L.Y[i], Math.max(4, L.SZ[i] * 2.4) / t.s * 1.6, 0, TAU);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6 / t.s;
  ctx.stroke();
}

// The HTML chrome floating over the canvas — the hub caption, the zoom readout,
// the pan hint — sits in real estate the label placer cannot see, so words were
// being drawn underneath it and read as gibberish. Measure the elements and
// reserve their rectangles the same way the anchors reserve theirs. Nothing here
// applies to the export, which has no chrome and paints its own caption band.
function chromeBoxes() {
  const b = cv.getBoundingClientRect();
  if (!b.width) return [];
  const dpr = cv.width / b.width;
  const out = [];
  for (const id of ['hubtag', 'zoomtag', 'zoomhint']) {
    const el = $(id);
    if (!el || el.hidden || !el.offsetWidth) continue;
    const r = el.getBoundingClientRect();
    out.push({
      x: (r.left - b.left) * dpr - 4, y: (r.top - b.top) * dpr - 4,
      w: r.width * dpr + 8, h: r.height * dpr + 8,
    });
  }
  return out;
}

function draw() {
  if (!ready) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#080a0e';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const t = tf();
  ctx.setTransform(t.s, 0, 0, t.s, t.x, t.y);
  drawStructure(ctx, t.s, state.weblines);
  drawMarks(ctx, t.s, cv.width, t);
  drawMarker(state.found, 'rgba(216,164,69,0.95)', t);
  drawMarker(state.hit, 'rgba(255,255,255,0.85)', t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Words first, anchors last. The anchors are few and carry opaque backing
  // plates, so when the two collide the anchor should be the one that survives —
  // a ring labelled `55×` half-covered by the word `currently` tells you neither.
  //
  // Zooming spends its extra room on more words, not just bigger ones: the
  // budget is what fits at rest, scaled with z and capped, because past ~4×
  // the collision grid is the binding constraint anyway.
  const px = cv.width / 1000;
  const reserved = drawAnchors(ctx, t, px, cv.width, cv.height, true).concat(chromeBoxes());
  const placed = drawLabels(ctx, t, cv.width, cv.height, budgetFor(state.tsize, view.z), reserved);
  drawAnchors(ctx, t, px, cv.width, cv.height);
  if (placed !== state.shown) { state.shown = placed; showTsize(); }
}

// ─── export ─────────────────────────────────────────────────────────────────
//
// Rendered fresh at a fixed size with a caption, rather than lifting the pixels
// off the screen: what gets pasted somewhere else has to say what it is and
// whose it is, and a screenshot of a 700px canvas does neither.

function renderExport(px = 2000) {
  const off = document.createElement('canvas');
  const cap = Math.round(px * 0.085);
  off.width = px;
  off.height = px + cap;
  const c = off.getContext('2d');
  c.fillStyle = '#080a0e';
  c.fillRect(0, 0, off.width, off.height);

  // Always the WHOLE web at z = 1, whatever the screen is showing. An export
  // that silently depended on how far you happened to be zoomed in would be a
  // different picture every time you pressed the button.
  const s = px / WORLD;
  const et = { s, x: 0, y: 0, w: px, h: px };
  c.setTransform(s, 0, 0, s, 0, 0);
  drawStructure(c, s, Math.max(0.4, state.weblines));
  drawMarks(c, s, px, et);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const reserved = drawAnchors(c, et, px / 1000, px, px, true);
  // The export is 2000px against a screen canvas of maybe 1100, so it has room
  // for more words at the same apparent size. Ask for what that extra area is
  // worth rather than for the screen's number.
  drawLabels(c, et, px, px, Math.round(budgetFor(state.tsize, 1) * (px / cv.width) ** 2), reserved);
  drawAnchors(c, et, px / 1000, px, px);

  const u = px / 1000;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.font = `${(19 * u).toFixed(0)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.fillStyle = '#d8a445';
  c.fillText(D.handle || 'a vocabulary', 34 * u, px + cap * 0.36);
  c.font = `${(15 * u).toFixed(0)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.fillStyle = '#8794a3';
  c.fillText(`${D.types.toLocaleString()} word types · ${D.posts.toLocaleString()} posts · ${D.span[0]} → ${D.span[1]}`,
    34 * u, px + cap * 0.68);
  c.textAlign = 'right';
  c.fillStyle = '#5d6875';
  c.fillText('silk.mino.mobi/word', px - 34 * u, px + cap * 0.52);
  return off;
}

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

async function copyWeb() {
  const btn = $('copy');
  const say = (t) => { btn.textContent = t; setTimeout(() => { btn.textContent = 'copy web'; }, 2200); };
  btn.disabled = true;
  try {
    const blob = await toBlob(renderExport());
    // Clipboard image writes need a secure context and are refused outright by
    // some browsers. Falling back to a download means the button always does
    // something, which is the whole point of it being one button.
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say('copied ✓');
    } catch {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(D.handle || 'lexicon').replace(/[^\w.-]/g, '_')}-web.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say('downloaded ✓');
    }
  } catch (err) {
    say('failed');
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ─── hover ──────────────────────────────────────────────────────────────────

function pick(wx, wy) {
  const { grid, CELL, GW, N, CNT, SEC, X, Y } = L;
  const gx = (wx / CELL) | 0, gy = (wy / CELL) | 0;
  // The tolerance is a fixed number of SCREEN pixels, converted to world — a
  // fixed world tolerance would grab half a wedge at 20×.
  const tol = 11 / (S * view.z);
  let best = -1, bd = tol * tol;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const a = grid.get((gy + dy) * GW + (gx + dx));
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

const dayToDate = (d) => new Date(Date.parse(D.span[0] + 'T00:00:00Z') + d * 86400000)
  .toISOString().slice(0, 10);
const labelOf = (k) => (D.sectors.find((s) => s.k === k)?.label || []).slice(0, 3).join(' ');

cv.addEventListener('mousemove', (e) => {
  if (!ready) return;
  if (drag) return;
  if (weaving) return;      // the hover hash is stale until the web settles
  const b = cv.getBoundingClientRect();
  const dpr = cv.width / b.width;
  const dx = (e.clientX - b.left) * dpr;
  const dy = (e.clientY - b.top) * dpr;
  const i = pick((dx - view.x) / (S * view.z), (dy - view.y) / (S * view.z));
  if (i !== state.hit) { state.hit = i; draw(); }
  const tip = $('tip');
  if (i < 0) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML =
    `<b>${L.W[i]}</b> <i>#${(i + 1).toLocaleString()}</i><br>` +
    `${L.CNT[i].toLocaleString()}× in ${L.DF[i].toLocaleString()} post${L.DF[i] === 1 ? '' : 's'}<br>` +
    `<i>first</i> ${dayToDate(L.FIRST[i])}<br>` +
    `<i>${L.isHub[i] ? 'the hub' : labelOf(L.SEC[i])}</i>`;
  // measure rather than assume: a long word made the old fixed 210px clamp
  // hang the tooltip off the edge of the panel
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let lx = e.clientX - b.left + 14, ly = e.clientY - b.top + 14;
  if (lx + tw > b.width - 4) lx = e.clientX - b.left - tw - 14;
  if (ly + th > b.height - 4) ly = e.clientY - b.top - th - 14;
  tip.style.left = Math.max(4, lx) + 'px';
  tip.style.top = Math.max(4, ly) + 'px';
});
cv.addEventListener('mouseleave', () => { $('tip').hidden = true; state.hit = -1; draw(); });

// ─── zoom and pan ───────────────────────────────────────────────────────────
//
// Pointer events throughout, so a mouse drag, a trackpad and two fingers on a
// phone are all the same three handlers rather than three parallel
// implementations of the same arithmetic.

let drag = null;
const pointers = new Map();
let pinch = null;

const devicePos = (e) => {
  const b = cv.getBoundingClientRect();
  const dpr = cv.width / b.width;
  return { x: (e.clientX - b.left) * dpr, y: (e.clientY - b.top) * dpr };
};

cv.addEventListener('wheel', (e) => {
  if (!ready) return;
  e.preventDefault();
  const p = devicePos(e);
  // A trackpad pinch arrives as a wheel event with ctrlKey set, and with much
  // smaller deltas than a mouse notch; the exponential keeps both feeling the
  // same rather than one crawling and the other jumping.
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.010 : 0.0022)));
}, { passive: false });

cv.addEventListener('pointerdown', (e) => {
  if (!ready) return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, devicePos(e));
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    drag = null;
  } else if (pointers.size === 1) {
    drag = { ...devicePos(e), x0: view.x, y0: view.y, moved: false };
    cv.style.cursor = 'grabbing';
    $('tip').hidden = true;
  }
});

cv.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, devicePos(e));

  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (pinch.d > 0) zoomAt(cx, cy, d / pinch.d);
    view.x += cx - pinch.cx;
    view.y += cy - pinch.cy;
    clampPan();
    pinch = { d, cx, cy };
    draw();
    return;
  }

  if (!drag) return;
  const p = devicePos(e);
  if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 3) drag.moved = true;
  view.x = drag.x0 + (p.x - drag.x);
  view.y = drag.y0 + (p.y - drag.y);
  clampPan();
  draw();
});

const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) { drag = null; cv.style.cursor = ''; }
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);

// Double-click zooms IN on the spot, or all the way back out if you are
// already in — a reset that needs a separate control gets used half as often.
cv.addEventListener('dblclick', (e) => {
  if (!ready) return;
  e.preventDefault();
  if (view.z > 1.001) resetView();
  else { const p = devicePos(e); zoomAt(p.x, p.y, 3); }
});

$('zoomreset').onclick = resetView;

window.addEventListener('keydown', (e) => {
  if (!ready || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === '0' || e.key === 'Escape') { resetView(); return; }
  if (e.key === '+' || e.key === '=') zoomAt(cv.width / 2, cv.height / 2, 1.4);
  if (e.key === '-' || e.key === '_') zoomAt(cv.width / 2, cv.height / 2, 1 / 1.4);
});

// ─── controls ───────────────────────────────────────────────────────────────

$('mode').onchange = () => { state.mode = $('mode').value; recolour(state.mode); draw(); };
$('copy').onclick = copyWeb;

const bindRange = (id, key, fmt, scale = 1) => {
  const el = $(id), out = $(id + 'v');
  const upd = () => { state[key] = +el.value * scale; out.textContent = fmt(+el.value); draw(); };
  el.addEventListener('input', upd);
  upd();
};

// Both readouts report a MEASUREMENT, not the slider position: how many labels
// actually got placed, and how many words are actually left. A control whose
// number is its own input tells you nothing you did not already know.
function showTsize() {
  $('tsizev').textContent = `${state.tsize}px · ${state.shown}`;
}
function showMinc() {
  let n = 0;
  for (let i = 0; i < L.N; i++) if (L.CNT[i] >= state.minc && L.SZ[i] > 0) n++;
  $('mincv').textContent = state.minc === 1
    ? `all · ${n.toLocaleString()}`
    : `${state.minc}× · ${n.toLocaleString()}`;
}

$('tsize').addEventListener('input', () => {
  state.tsize = +$('tsize').value;
  draw();                    // draw() writes the readout, because it counts
});

$('minc').addEventListener('input', () => {
  state.minc = +$('minc').value;
  showMinc();
  reweave(state.minc);
});

$('find').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  state.found = -1;
  if (q) {
    let exact = -1, pre = -1;
    for (let i = 0; i < L.N; i++) {
      if (L.W[i] === q) { exact = i; break; }
      if (pre < 0 && L.W[i].startsWith(q)) pre = i;
    }
    state.found = exact >= 0 ? exact : pre;
  }
  const o = $('findout');
  if (state.found >= 0) {
    const i = state.found;
    o.textContent = `${L.W[i]} — ${L.CNT[i]}× · rank ${(i + 1).toLocaleString()} · first ${dayToDate(L.FIRST[i])} · ${L.isHub[i] ? 'hub' : labelOf(L.SEC[i])}`;
  } else o.textContent = q ? 'not in this vocabulary' : '';
  // If you are zoomed in, a highlight somewhere off-screen is no answer at all:
  // bring the found word into the middle of the view.
  if (state.found >= 0 && view.z > 1.001) {
    const se = S * view.z;
    view.x = cv.width / 2 - L.X[state.found] * se;
    view.y = cv.height / 2 - L.Y[state.found] * se;
    clampPan();
  }
  draw();
});

// ─── panels ─────────────────────────────────────────────────────────────────

function fillPanels() {
  const ul = $('sectors');
  const rows = [{ k: D.general, hub: true }].concat(L.ring.map((k) => ({ k, hub: false })));
  ul.innerHTML = rows.map(({ k, hub }) => {
    const s = D.sectors.find((x) => x.k === k);
    if (!s) return '';
    const sw = hub ? 'background:#8794a3'
      : `background:${rgb(hsl(SECTOR_HUE[L.ring.indexOf(k) % 12], 0.46, 0.62))}`;
    return `<li data-k="${k}"><span class="sw" style="${sw}"></span>` +
      `<span class="wds">${hub ? '<b>the hub</b> · ' : ''}${s.label.slice(0, 4).join(' ')}</span>` +
      `<span class="n">${s.types.toLocaleString()}</span></li>`;
  }).join('');

  const rr = [];
  const push = (a, b, sep) => rr.push(`<tr${sep ? ' class="sep"' : ''}><td>${a}</td><td>${b}</td></tr>`);
  push('handle', D.handle || '—');
  push('posts', D.posts.toLocaleString());
  push('  of which replies', D.replies.toLocaleString());
  push('  with a content word', (D.postsWithWords ?? D.posts).toLocaleString());
  push('span', `${D.span[0]} → ${D.span[1]}`);
  push('sessions', D.sessions.toLocaleString(), true);
  push('content tokens', D.tokens.toLocaleString());
  push('word types', D.types.toLocaleString());
  push('used exactly once', `${D.hapax.toLocaleString()} (${(100 * D.hapax / D.types).toFixed(0)}%)`);
  push('type-token ratio', (D.types / D.tokens).toFixed(4), true);
  push('built', D.built);
  $('stats').innerHTML = rr.join('');

  $('tagsub').innerHTML =
    `— all <b>${D.types.toLocaleString()}</b> of them — from <b>${D.posts.toLocaleString()}</b> posts by ` +
    `<b>${D.handle || 'someone'}</b>, ${D.span[0]} to ${D.span[1]}. Angle is topic, radius is how often, ` +
    `colour is when. The hub is the words that belong to no topic at all.`;
  $('hapaxn').textContent = D.hapax.toLocaleString();
  $('genn').textContent = (D.sectors.find((s) => s.k === D.general)?.types || 0).toLocaleString();
}

$('sectors').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const k = +li.dataset.k;
  if (state.hidden.has(k)) state.hidden.delete(k); else state.hidden.add(k);
  li.classList.toggle('off', state.hidden.has(k));
  draw();
});

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

function drawFlat() {
  const { N, CNT } = L;
  { // Zipf
    const w = 420, h = 260, m = { l: 40, r: 8, t: 8, b: 26 };
    const pts = [];
    for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 900))) pts.push([Math.log10(i + 1), Math.log10(CNT[i])]);
    const xmax = Math.log10(N) || 1, ymax = Math.log10(CNT[0]) || 1;
    const px = (x) => m.l + (x / xmax) * (w - m.l - m.r);
    const py = (y) => h - m.b - (y / ymax) * (h - m.t - m.b);
    const f = fit(pts.map((p) => p[0]), pts.map((p) => p[1]));
    let body = `<line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" style="${AX}"/>` +
               `<line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" style="${AX}"/>`;
    body += `<polyline fill="none" stroke="#56a0ac" stroke-width="1.4" points="${pts.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ')}"/>`;
    const x0 = Math.max(0, (ymax - f.a) / f.b);
    body += `<line x1="${px(x0)}" y1="${py(Math.min(ymax, f.a + f.b * x0))}" x2="${px(xmax)}" y2="${py(Math.max(0, f.a + f.b * xmax))}" stroke="#d8a445" stroke-width="1" stroke-dasharray="4 4"/>`;
    for (const d of [0, 1, 2, 3, 4]) if (d <= xmax) body += `<text x="${px(d)}" y="${h - m.b + 14}" text-anchor="middle">10^${d}</text>`;
    for (const d of [0, 1, 2, 3]) if (d <= ymax) body += `<text x="${m.l - 6}" y="${py(d) + 3}" text-anchor="end">10^${d}</text>`;
    $('zipf').innerHTML = svg(w, h, body);
    $('cap-zipf').innerHTML = `<b>Zipf</b>rank against uses, log–log. The dashed line is the fitted slope, <b style="display:inline">${f.b.toFixed(2)}</b>. A straight line here is why the web cannot put radius on frequency at all: half the vocabulary sits at the far right of this plot, on one value. The web puts radius on <em>rank</em>, spaced for equal area, and draws the counts back on as rings.`;
  }

  { // Heaps
    const w = 420, h = 260, m = { l: 42, r: 8, t: 8, b: 26 };
    const pts = D.heaps.filter(([n]) => n > 200);
    if (pts.length > 2) {
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
      $('cap-heaps').innerHTML = `<b>Heaps</b>new word types against tokens read. Fitted <b style="display:inline">V = ${K.toFixed(1)}·N^${f.b.toFixed(3)}</b> — still climbing, and it always will. Double this corpus and the model says about <b style="display:inline">${Math.round(K * Math.pow(D.tokens * 2, f.b) / 1000)}k</b> types, not ${Math.round(D.types / 1000)}k×2.`;
    }
  }

  { // monthly
    const w = 420, h = 260, m = { l: 34, r: 30, t: 8, b: 30 };
    const ms = D.months;
    const pmax = Math.max(...ms.map((x) => x[1])) || 1;
    const fmax = Math.max(...ms.map((x) => x[3])) || 1;
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
    $('cap-months').innerHTML = `<b>Acquisition</b>posts a month (bars) against words used for the first time that month (gold). <b style="display:inline">${firstYear.toLocaleString()}</b> of the ${D.types.toLocaleString()} types arrived in the first twelve months. The gold line falling while the bars hold up is the whole reason the web's hub is small and its rim is huge.`;
  }
}

// ─── loading a dataset ──────────────────────────────────────────────────────

function setData(data) {
  D = data;
  L = buildLayout(data);
  state.hidden.clear();
  state.hit = -1;
  state.found = -1;
  $('find').value = '';
  $('findout').textContent = '';
  // A new vocabulary is a new picture. Holding 8× on a point that meant
  // something in the last one would frame a stranger's web at random.
  view.z = 1;
  showZoom();

  // `min uses` was fixed at 1..40, which is right for a 50,000-post account and
  // nonsense for a small one: most of the travel did nothing, and the top of it
  // emptied the web. Set the ceiling where about thirty ring words are left, so
  // the far end of the slider is always the interesting end.
  const counts = [];
  for (let i = 0; i < L.N; i++) if (!L.isHub[i] && L.SZ[i] > 0) counts.push(L.CNT[i]);
  counts.sort((a, b) => b - a);
  const el = $('minc');
  el.max = String(Math.max(4, Math.min(60, counts[Math.min(counts.length - 1, 29)] || 4)));
  el.value = '1';
  state.minc = 1;
  reweave(1, true);
  showMinc();

  recolour(state.mode);
  fillPanels();
  drawFlat();
  ready = true;
  size();
}

// ─── bring your own handle ──────────────────────────────────────────────────

let worker = null;
let busy = false;

const ERRORS = {
  NO_HANDLE: (h) => `No account called “${h}”. Handles look like <code>name.bsky.social</code>.`,
  NO_DID_DOC: () => 'That identity could not be resolved — its directory entry is missing.',
  NO_PDS: () => 'That account has no data server listed, so there is no repo to read.',
  RATE_LIMIT: () => 'The data server is rate-limiting. Wait a minute and try again.',
  GET_REPO: () => 'The data server refused the archive. Some self-hosted servers do not serve it publicly.',
  TOO_BIG: (h, m) => m,
  TOO_SMALL: (h, m) => `${m}. Try an account that posts more.`,
  UNKNOWN: (h, m) => m,
};

function showProgress(on, stage = '', frac = 0, extra = '') {
  $('progress').hidden = !on;
  $('go').disabled = on;
  $('handle').disabled = on;
  if (!on) return;
  $('pstage').textContent = stage;
  $('pextra').textContent = extra;
  $('pbar').style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
}

// `did` is optional and is only ever a shortcut: when the typeahead already
// told us the account's DID, the worker skips resolveHandle. Nothing downstream
// changes — the handle is still what labels the chart and the URL.
function runHandle(raw, did = null) {
  const handle = raw.trim().replace(/^@/, '');
  if (!handle || busy) return;
  $('err').hidden = true;
  busy = true;
  showProgress(true, 'starting', 0);

  if (worker) worker.terminate();
  worker = new Worker('./analyze.worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      const extra = msg.bytes
        ? `${(msg.bytes / 1e6).toFixed(1)} MB${msg.total ? ` of ${(msg.total / 1e6).toFixed(1)}` : ''}`
        : (msg.blocks ? `${msg.blocks.toLocaleString()} blocks` : '');
      showProgress(true, msg.stage, msg.frac, extra);
    } else if (msg.type === 'done') {
      busy = false;
      showProgress(false);
      setData(msg.data);
      history.replaceState(null, '', `?h=${encodeURIComponent(handle)}`);
      $('reset').hidden = false;
      document.querySelector('.stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (msg.type === 'error') {
      busy = false;
      showProgress(false);
      const f = ERRORS[msg.code] || ERRORS.UNKNOWN;
      $('err').innerHTML = f(handle, msg.message);
      $('err').hidden = false;
    }
  };
  worker.onerror = (e) => {
    busy = false;
    showProgress(false);
    $('err').textContent = `The builder crashed: ${e.message || 'unknown error'}`;
    $('err').hidden = false;
  };
  worker.postMessage({ handle, did });
}

// ─── typeahead on the handle box ────────────────────────────────────────────
//
// A handle is the one thing on this page you have to get exactly right and
// cannot be expected to remember — `name.bsky.social`, or `name.com`, or a
// display name that is not the handle at all — and until now the only feedback
// was a failed build. Bluesky's public directory has a typeahead for precisely
// this and sends `access-control-allow-origin: *`.
//
// IT IS A CONVENIENCE AND NEVER A GATE. Every failure here — offline, a 500, a
// rate limit, a body that is not the shape expected — ends in an empty list and
// nothing else: no error banner, no disabled button. The field stays an ordinary
// text input, so a self-hosted handle the directory has never indexed still
// works if you type it out and press Enter. That is also what makes the request
// defensible on a page that otherwise sends nothing anywhere: you opt out of it
// by not using it, and the page says so in the note under the box.

const TYPEAHEAD = 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead';
const sug = $('suggest');
let sugRows = [];       // the actors currently listed
let sugAt = -1;         // highlighted row, -1 for none
let sugSeq = 0;         // request counter, for the staleness guard below
let sugAbort = null;
let sugTimer = 0;

function closeSuggest() {
  sug.hidden = true;
  sug.replaceChildren();
  sugRows = [];
  sugAt = -1;
  $('handle').setAttribute('aria-expanded', 'false');
  $('handle').removeAttribute('aria-activedescendant');
}

function highlight(i) {
  sugAt = i;
  const items = sug.children;
  for (let k = 0; k < items.length; k++) {
    items[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
  }
  if (i >= 0) {
    items[i].scrollIntoView({ block: 'nearest' });
    $('handle').setAttribute('aria-activedescendant', items[i].id);
  } else $('handle').removeAttribute('aria-activedescendant');
}

// Rows are built with DOM calls and textContent, never innerHTML: display names
// are arbitrary strings written by strangers and arriving from a third party,
// and this is the one place on the page where such a string would be rendered.
function renderSuggest(actors, prefix) {
  sugRows = actors;
  sug.replaceChildren();
  actors.forEach((a, i) => {
    const li = document.createElement('li');
    li.id = `sug-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');

    if (a.avatar) {
      const img = document.createElement('img');
      img.src = a.avatar;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';       // the CDN learns nothing about where you are
      img.onerror = () => img.remove();
      li.append(img);
    }

    const who = document.createElement('span');
    who.className = 'who';
    const name = a.displayName?.trim();

    // Bold the part you actually typed, so it is obvious why this row is here.
    const hd = document.createElement('span');
    hd.className = 'hd';
    if (prefix && a.handle.toLowerCase().startsWith(prefix)) {
      const b = document.createElement('b');
      b.textContent = a.handle.slice(0, prefix.length);
      hd.append(b, document.createTextNode(a.handle.slice(prefix.length)));
    } else hd.textContent = a.handle;

    // An account with no display name gets one line, not the same string twice.
    if (name) {
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = name;
      who.append(nm, hd);
    } else {
      hd.classList.add('solo');
      who.append(hd);
    }
    li.append(who);

    // pointerdown, not click: the input's blur would close the list first and
    // the click would land on nothing.
    li.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pickSuggest(i);
    });
    li.addEventListener('pointerenter', () => highlight(i));
    sug.append(li);
  });
  sug.hidden = actors.length === 0;
  $('handle').setAttribute('aria-expanded', actors.length ? 'true' : 'false');
  highlight(-1);
}

function pickSuggest(i) {
  const a = sugRows[i];
  if (!a) return;
  $('handle').value = a.handle;
  closeSuggest();
  // The list already carries the DID, so picking a row skips resolveHandle —
  // one fewer round trip, and the "no such handle" failure cannot happen for a
  // name that was offered to you.
  runHandle(a.handle, a.did);
}

async function askSuggest(q) {
  const seq = ++sugSeq;
  if (sugAbort) sugAbort.abort();
  sugAbort = new AbortController();
  try {
    const r = await fetch(`${TYPEAHEAD}?limit=8&q=${encodeURIComponent(q)}`, { signal: sugAbort.signal });
    if (!r.ok) throw new Error(String(r.status));
    const body = await r.json();
    // THE STALENESS GUARD. Responses to `mi` and `minor` race, and the short
    // query is the one likelier to come back last — without this, typing fast
    // leaves you looking at the results for a prefix you have already passed.
    if (seq !== sugSeq) return;
    const actors = (body.actors || []).filter((a) => a && a.handle && a.did);
    if (document.activeElement === $('handle')) renderSuggest(actors, q.toLowerCase());
  } catch {
    if (seq === sugSeq) closeSuggest();   // silent: this feature never blocks
  }
}

$('handle').addEventListener('input', () => {
  const q = $('handle').value.trim().replace(/^@/, '');
  clearTimeout(sugTimer);
  // Under two characters the directory returns the whole firehose, and a DID is
  // already an answer — neither is worth a request.
  if (q.length < 2 || q.startsWith('did:')) { sugSeq++; closeSuggest(); return; }
  sugTimer = setTimeout(() => askSuggest(q), 140);
});

$('handle').addEventListener('keydown', (e) => {
  const open = !sug.hidden && sugRows.length > 0;
  if (e.key === 'ArrowDown' && open) { e.preventDefault(); highlight((sugAt + 1) % sugRows.length); return; }
  if (e.key === 'ArrowUp' && open) { e.preventDefault(); highlight((sugAt - 1 + sugRows.length) % sugRows.length); return; }
  if (e.key === 'Escape' && open) { e.preventDefault(); sugSeq++; closeSuggest(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(sugTimer);
    // Enter on a highlighted row picks it; Enter on anything else runs what you
    // typed, verbatim. The second case is the one that must not regress — it is
    // the whole escape hatch for accounts the directory does not know.
    if (open && sugAt >= 0) pickSuggest(sugAt);
    else { sugSeq++; closeSuggest(); runHandle($('handle').value); }
  }
});

$('handle').addEventListener('blur', () => { sugSeq++; closeSuggest(); });

$('go').onclick = () => { sugSeq++; closeSuggest(); runHandle($('handle').value); };
$('reset').onclick = async () => {
  $('reset').hidden = true;
  history.replaceState(null, '', location.pathname);
  setData(await (await fetch('./data.json')).json());
};

// A read-only handle on the layout. The page never reads it; the browser tests
// do, and so can anyone who opens a console — this page already asks you to go
// and read engine.mjs, so it may as well let you look at what came out.
window.silk = {
  get D() { return D; },
  get L() { return L; },
  get weaving() { return weaving; },
  state, view,
};

// ─── go ─────────────────────────────────────────────────────────────────────

window.addEventListener('resize', size);
bindRange('weblines', 'weblines', (v) => v + '%', 0.01);

setData(await (await fetch('./data.json')).json());

const qh = new URLSearchParams(location.search).get('h');
if (qh) { $('handle').value = qh; runHandle(qh); }
