// render.js — "The Minormobius Lectures", drawn. A pure function of t on a 2D canvas.
//
// The hall is the cylinder he designed (June 2026), seen as hoop's home screen sees it: from the surface,
// in perspective, looking down the bore. The inner surface is a foam of cells rising up both walls and
// meeting overhead; the sun rail runs the whole length of the axis, over our heads and away to the far
// cap, a day's light travelling along it; the wild ecosystem drifts in the volume round the axis. The 146
// sites of agent01 are cells in that foam, dark until lecture 7 lights each in the month it was born.
// The lecturer is an attractor body (packages/attractor, vendor copy), standing, easing between poses
// line by line, brighter and further into its orbits while it speaks. Each lecture has a board (script.js
// `board.mode`): the orb of his posts, the faces of his people, the words of an era, the quoted posts,
// the posts-and-commits chart, the sites as they were born, the tools. Subtitles always: the voice is a
// formant synthesiser and mishears itself about one word in five.

import { makeRig, solve } from '../vendor/figure/lib/rig.js';
import { POSES } from '../vendor/figure/lib/poses.js';
import { character, build, frames } from '../vendor/attractor/lib/avatar.js';
import { makeLight, drawAvatar } from '../vendor/attractor/lib/draw.js';
import { TIMELINE, SECTIONS, duration, title } from './score.js';
import { ERAS, LECTURES, MATH_WORDS, TOOLS } from './script.js';
import { TOTALS, MONTHS, GIT, PEOPLE, QUOTES, ORB, BIRTHS } from './record.js';

const INK = '#ece6d6', DIM = 'rgba(236,230,214,0.62)', AMBER = [255, 190, 110], TEAL = [120, 210, 200];
const DISPLAY = '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif', SERIF = '"Newsreader", Georgia, serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const fade = (t, a, b, d = 0.6) => ease((t - a) / d) * ease((b - t) / d);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ERA = Object.fromEntries(ERAS.map(([k, name, from, to, words]) => [k, { k, name, from, to, words }]));
const monthIndex = Object.fromEntries(MONTHS.map(([m], i) => [m, i]));

// ---- the lecturer: one character, three poses solved once, eased between line by line ----------------
const CH = character(20260929, { palette: 'tide', style: 'threads', points: 1100, streak: 26, lagStep: 0.02, thought: 0.55, reach: 1.25, speed: 0.9, swirl: 0.7 });
const AV = build(CH), RIG = makeRig(CH.body);
const POSED = ['stand', 'contrapposto', 'handOnHip'].map((k) => solve(RIG, POSES[k](RIG)));
const lerpJ = (A, B, f) => Object.fromEntries(Object.keys(A.J).map((k) => [k, A.J[k].map((v, i) => v + (B.J[k][i] - v) * f)]));

// ---- the cylinder, in its own units: radius 1, the bore 7 radii long, the camera standing on the floor --
const LEN = 7, NTH = 44, DZ = (2 * Math.PI) / NTH;
const FOAM = (() => {
  const rnd = mulberry32(0xf0a3), cells = [], sites = BIRTHS.map(([d, dir]) => ({ d, dir }));
  // a foam: rows round the bore, every other row offset half a cell, each cell a jittered hexagon
  for (let row = 0; row * DZ < LEN; row++) for (let i = 0; i < NTH; i++) {
    const th = ((i + (row % 2) * 0.5) / NTH) * Math.PI * 2 + (rnd() - 0.5) * 0.03, z = (row + 0.5) * DZ + (rnd() - 0.5) * 0.02;
    cells.push({ th, z, s: 0.36 + 0.08 * rnd(), rot: rnd(), glow: rnd(), site: null });
  }
  // the sites on the walls and the far roof, a radius or more down the bore (never the floor we stand on,
  // nor the near roof, which is over our heads and out of the frame)
  const up = (th) => Math.abs(((th + Math.PI) % (Math.PI * 2)) - Math.PI);   // 0 the floor, π the roof
  const free = cells.map((_, i) => i).filter((i) => up(cells[i].th) > 0.75 && (up(cells[i].th) < 2.3 || cells[i].z > 3) && cells[i].z > 1.1 && cells[i].z < LEN - 0.6).sort(() => rnd() - 0.5);
  sites.forEach((s, i) => { const c = cells[free[i]]; c.site = s; s.cell = c; });
  cells.sort((x, y) => y.z - x.z);                    // far first: the painter's order
  return { cells, sites };
})();
const ECO = (() => { const rnd = mulberry32(0xec0); return Array.from({ length: 520 }, () => ({ th: rnd() * Math.PI * 2, rho: 0.1 + rnd() * 0.42, z: rnd() * LEN, sp: 0.02 + rnd() * 0.06, ph: rnd() * 6.28, g: rnd() })); })();

// ---- time lookups ---------------------------------------------------------------------------------
const lineAt = (t) => { let cur = null; for (const l of TIMELINE) { if (l.from <= t) cur = l; else break; } return cur; };
const sectionAt = (t) => { let s = SECTIONS[0]; for (const x of SECTIONS) if (x.from <= t) s = x; return s; };
const L7 = SECTIONS.find((s) => s.n === 6);
/** The date the sites have been lit up to at t: before lecture 7 none, during it Feb → Sep 2026, then all. */
function litDate(t) {
  if (t < L7.card + 5) return '';
  const a = L7.card + 5, b = L7.to - 1.5, f = clamp((t - a) / (b - a));
  const t0 = Date.UTC(2026, 1, 1), t1 = Date.UTC(2026, 8, 30);
  return new Date(t0 + (t1 - t0) * f).toISOString().slice(0, 10);
}

export function makeRenderer(W, H, dpr = 1) {
  const PW = Math.round(W * dpr), PH = Math.round(H * dpr), tall = H > W * 1.1;
  const light = makeLight(PW, PH);
  // the camera: standing on the floor (a little above it), looking down the bore, tipped up a little, so the
  // axis runs overhead to its vanishing point. A point on the surface is (θ, z): θ 0 the floor, π the roof.
  const FOC = tall ? W * 0.95 : W * 0.62, VPY = H * (tall ? 0.34 : 0.4), EYE = 0.1;
  let camZ = 0, pitch = 0.16, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const P3 = (x, y, z) => {
    const ry = y - (-1 + EYE), rz = z - camZ, yc = ry * cp - rz * sp, zc = ry * sp + rz * cp;
    if (zc < 0.04) return null;
    return [W / 2 + (FOC * x) / zc, VPY - FOC * (yc / zc + sp / cp), zc];
  };
  const onSurface = (th, z, r = 1) => P3(r * Math.sin(th), -r * Math.cos(th), z);
  // where things go
  const board = tall ? { x: W * 0.5, y: H * 0.3, r: W * 0.4 } : { x: W * 0.63, y: H * 0.4, r: Math.min(W * 0.28, H * 0.3) };
  const lect = tall ? { x: W * 0.2, floor: H * 0.83, h: H * 0.3 } : { x: W * 0.19, floor: H * 0.94, h: H * 0.66 };
  const quoteBox = tall ? { x: W * 0.08, y: H * 0.56, w: W * 0.84 } : { x: W * 0.4, y: H * 0.68, w: W * 0.52 };
  const S = Math.min(W, H) / 540;                        // a type unit: the layout is a phone's at 540

  // the faces, loaded once (the page serves them beside the piece)
  // the faces and his posts' pictures, loaded once (the page serves them beside the piece)
  const images = {};
  const face = (f) => { if (!f || typeof Image === 'undefined') return null; if (!images[f]) { images[f] = new Image(); images[f].src = new URL(f, import.meta.url).href; } return images[f].complete && images[f].naturalWidth ? images[f] : null; };
  for (const e in PEOPLE) for (const p of PEOPLE[e]) face(p.f);
  for (const e in ORB) for (const [, , files] of ORB[e]) for (const [f] of files) face(f);
  for (const q in QUOTES) for (const [f] of QUOTES[q][2]) face(f);
  /** Draw an image to cover a box (cropped to fill it), or a dim placeholder until it has loaded. */
  function cover(ctx, img, x, y, w, h, r = 0) {
    ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
    if (img) { const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * k, ih = img.naturalHeight * k; ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
    else { ctx.fillStyle = '#1b262c'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
  }

  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const tr = cur ? cur + ' ' + w : w; if (ctx.measureText(tr).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tr; }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- the hall ----------------------------------------------------------------------------------
  function hall(ctx, t, sec) {
    const reveal = sec.board?.mode === 'cylinder' ? ease((t - sec.card - 4) / 10) : t > SECTIONS.at(-1).to ? 1 : 0;
    camZ = 0.35 * (t / duration) + 0.4 * reveal * ease((t - sec.card) / 30);   // a slow walk down the bore
    pitch = 0.16 + 0.025 * Math.sin(t * 0.07) + 0.08 * reveal; cp = Math.cos(pitch); sp = Math.sin(pitch);
    const fogAt = (zc) => clamp(1.12 - zc / (LEN * 1.05), 0.06, 1);
    ctx.fillStyle = '#04070a'; ctx.fillRect(0, 0, W, H);
    // the far cap: a disc of haze where the bore ends
    const cap = onSurface(0, LEN), capC = P3(0, 0, LEN);
    if (cap && capC) {
      const r = Math.abs(cap[1] - capC[1]);
      const g = ctx.createRadialGradient(capC[0], capC[1], 0, capC[0], capC[1], r * 1.05);
      g.addColorStop(0, `rgba(${60 + 40 * reveal},${70 + 30 * reveal},${64},0.9)`); g.addColorStop(1, 'rgba(20,30,34,0.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(capC[0], capC[1], r, 0, Math.PI * 2); ctx.fill();
    }
    // the foam, far to near: every cell a window in the rind; the sites lit by the date
    const lit = litDate(t), fresh = [];
    for (const c of FOAM.cells) {
      if (c.z < camZ + 0.05) continue;
      const k = 7, pts = [];
      let ok = true;
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + c.rot, dth = Math.cos(a) * DZ * c.s * 1.05, dz = Math.sin(a) * DZ * c.s;
        const q = onSurface(c.th + dth, c.z + dz); if (!q) { ok = false; break; } pts.push(q);
      }
      if (!ok) continue;
      const zc = pts[0][2], f = fogAt(zc), up = Math.abs(((c.th + Math.PI) % (Math.PI * 2)) - Math.PI) / Math.PI;
      const on = c.site && lit && c.site.d <= lit, isNew = on && daysBetween(c.site.d, lit) < 12;
      if (isNew && t < L7.to) fresh.push([c, pts]);
      // the rail lights the rind: brightest where the travelling day is, the floor darker than the walls
      const day = 0.55 + 0.45 * Math.cos(c.z * 0.9 - t * 0.16);
      let fill;
      if (on) fill = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${(0.4 + 0.5 * f + (isNew ? 0.3 : 0))})`;
      else { const b = (0.18 + 0.5 * up * day + 0.3 * reveal * c.glow) * f; fill = `rgba(${Math.round(40 + 70 * b)},${Math.round(62 + 90 * b)},${Math.round(66 + 70 * b)},${(0.3 + 0.5 * f) * (0.5 + 0.5 * Math.min(1, up * 2.5))})`; }
      ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let j = 1; j < 6; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.closePath(); ctx.fill();
    }
    // the stringers: the hull's long members, down the bore
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(160,190,200,0.08)';
    for (let i = 0; i < 12; i++) { const th = (i / 12) * Math.PI * 2 + Math.PI / 12; ctx.beginPath(); let st = false; for (let z = camZ + 0.1; z <= LEN; z += 0.25) { const q = onSurface(th, z, 0.995); if (!q) { st = false; continue; } if (!st) { ctx.moveTo(q[0], q[1]); st = true; } else ctx.lineTo(q[0], q[1]); } ctx.stroke(); }
    // the wild ecosystem: drifting life in the volume round the axis
    for (const e of ECO) {
      const z = ((e.z + t * 0.01 * (0.4 + e.g)) % LEN), th = e.th + t * e.sp, r = e.rho + 0.02 * Math.sin(t * 0.7 + e.ph);
      const q = P3(r * Math.sin(th), -r * Math.cos(th), z); if (!q) continue;
      const a = (0.25 + 0.35 * reveal) * fogAt(q[2]) * (0.5 + 0.5 * Math.sin(t * 1.3 + e.ph)), sz = Math.min(3.2, 1.2 + 2 / q[2]) * S;
      ctx.fillStyle = `rgba(${140 + 60 * e.g},220,150,${a})`; ctx.fillRect(q[0], q[1], sz, sz);
    }
    // the sun rail: the whole axis, from over our heads to the far cap, a day's light moving along it
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    let prev = null;
    for (let z = camZ + 0.12; z <= LEN; z += 0.05) {
      const q = P3(0, 0, z); if (!q) { prev = null; continue; }
      const day = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.cos(z * 0.9 - t * 0.16), 3), w = Math.max(1.2, (FOC * 0.018) / q[2]), al = (0.55 + 0.4 * reveal) * day * fogAt(q[2]);
      if (prev) {
        ctx.strokeStyle = `rgba(255,236,196,${al * 0.28})`; ctx.lineWidth = w * 5; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.strokeStyle = `rgba(255,248,226,${al})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      prev = q;
    }
    ctx.restore();
    // the sites lit this fortnight, named where they are
    ctx.font = `${8 * S}px ${MONO}`; ctx.textAlign = 'center';
    for (const [c, pts] of fresh.slice(-10)) { const x = pts.reduce((a, p) => a + p[0], 0) / 6, y = pts.reduce((a, p) => a + p[1], 0) / 6; ctx.fillStyle = 'rgba(255,226,180,0.9)'; ctx.fillText(c.site.dir, x, y - 6 * S); }
    ctx.textAlign = 'left';
    // a vignette, so the boards and the lecturer sit on something calm
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(4,7,10,0)'); vg.addColorStop(1, 'rgba(4,7,10,0.8)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

  // ---- the lecturer --------------------------------------------------------------------------------
  function lecturer(t, line) {
    const idx = line ? TIMELINE.indexOf(line) : 0, from = line ? line.from : 0;
    const A = POSED[Math.max(0, idx - 1) % 3], B = POSED[Math.max(0, idx) % 3], f = ease((t - from + 0.4) / 1.2);
    const J = lerpJ(A, B, f), F = frames(J, [0, 0, 1]);
    const speaking = line && t < line.to ? 1 : 0, sway = 0.03 * Math.sin(t * 0.6);
    const scale = (lect.h * dpr) / (CH.body.heads + 1.3), yaw = -0.55 + 0.1 * Math.sin(t * 0.13), cy = Math.cos(yaw), sy = Math.sin(yaw), root = J.pelvis;
    const ox = lect.x * dpr, oy = lect.floor * dpr;
    const P = (p) => { const x = p[0] - root[0] + sway, z = p[2] - root[2], X = x * cy + z * sy; return [ox + X * scale, oy - p[1] * scale]; };
    drawAvatar(light, AV, F, t, P, { gain: 0.9 + 0.35 * speaking, m: CH.thought + 0.18 * speaking * (0.6 + 0.4 * Math.sin(t * 7)) });
  }

  // ---- the boards ----------------------------------------------------------------------------------
  // the orb: an era's posts, each with its picture, on a slowly turning sphere; few enough that the ones
  // facing us can be read
  const orbTiles = {};
  function orb(ctx, t, era, a) {
    const posts = ORB[era] || [], n = posts.length, R = board.r * 1.02, tiles = orbTiles[era] ||= posts.map((p, i) => {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      return { x: r * Math.cos(th), y: y * 0.9, z: r * Math.sin(th), p };
    });
    const rot = t * 0.07, cr = Math.cos(rot), sr = Math.sin(rot), tilt = 0.18, ct = Math.cos(tilt), st = Math.sin(tilt);
    const placed = tiles.map((q) => { const x = q.x * cr + q.z * sr, z0 = -q.x * sr + q.z * cr, y = q.y * ct - z0 * st, z = q.y * st + z0 * ct; return { q, x, y, z }; }).sort((u, v) => u.z - v.z);
    const glow = ctx.createRadialGradient(board.x, board.y, R * 0.2, board.x, board.y, R * 1.3);
    glow.addColorStop(0, `rgba(90,150,220,${0.14 * a})`); glow.addColorStop(1, 'rgba(90,150,220,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(board.x, board.y, R * 1.3, 0, Math.PI * 2); ctx.fill();
    for (const { q, x, y, z } of placed) {
      if (z < -0.2) continue;
      const k = 0.5 + 0.5 * z, w = R * 0.74 * k, ih = w * 0.62, fs = 8.2 * S * k, px = board.x + x * R * 0.92, py = board.y - y * R * 0.92;
      const [date, text, files] = q.p, front = z > 0.45;
      ctx.font = `${fs}px ${SERIF}`;
      const lines = front ? wrap(ctx, text, w - 10 * k).slice(0, 4) : [];
      const h = ih + (front ? 8 * S * k + lines.length * fs * 1.25 + 8 * k : 0), al = a * clamp((z + 0.2) / 0.5);
      const x0 = px - w / 2, y0 = py - h / 2;
      ctx.save(); ctx.globalAlpha = al * (front ? 1 : 0.55);
      ctx.fillStyle = 'rgba(14,22,30,0.94)'; roundRect(ctx, x0, y0, w, h, 5 * k); ctx.fill();
      cover(ctx, face(files[0][0]), x0, y0, w, ih, 5 * k);
      if (front) {
        ctx.font = `${6 * S * k}px ${MONO}`; ctx.fillStyle = 'rgba(122,168,240,0.95)'; ctx.textBaseline = 'top';
        ctx.fillText(date, x0 + 5 * k, y0 + ih + 4 * k);
        ctx.font = `${fs}px ${SERIF}`; ctx.fillStyle = INK;
        lines.forEach((ln, i) => ctx.fillText(ln, x0 + 5 * k, y0 + ih + 4 * k + 8 * S * k + i * fs * 1.25));
      }
      ctx.strokeStyle = `rgba(122,168,240,${front ? 0.7 : 0.3})`; ctx.lineWidth = 1; roundRect(ctx, x0, y0, w, h, 5 * k); ctx.stroke();
      ctx.restore();
    }
    label(ctx, ERA[era].name + ' · his posts', a);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function label(ctx, s, a) {
    ctx.font = `${8.5 * S}px ${MONO}`; ctx.fillStyle = `rgba(236,230,214,${0.6 * a})`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.toUpperCase(), board.x, board.y + board.r * 1.18); ctx.textAlign = 'left';
  }
  function faceRing(ctx, t, era, a, hi, x0 = board.x, y0 = board.y, R = board.r) {
    const people = PEOPLE[era] || [], n = people.length;
    people.forEach((p, i) => {
      const ring = i < 4 ? 0.42 : 0.9, j = i < 4 ? i : i - 4, m = i < 4 ? 4 : n - 4;
      const ang = (j / m) * Math.PI * 2 - Math.PI / 2 + (i < 4 ? 0.4 : 0) + t * 0.02 * (i < 4 ? 1 : -1);
      const x = x0 + Math.cos(ang) * R * ring, y = y0 + Math.sin(ang) * R * ring * 0.86, rr = R * (0.1 + 0.08 * Math.sqrt(p.w));
      const isHi = hi && p.h === hi;
      ctx.save(); ctx.globalAlpha = a;
      if (isHi) { const g = ctx.createRadialGradient(x, y, rr, x, y, rr * 2.2); g.addColorStop(0, 'rgba(255,200,120,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
      const img = p.h ? face(p.f) : null;
      if (!p.h) { ctx.setLineDash([3 * S, 3 * S]); ctx.strokeStyle = DIM; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
      else if (img) { ctx.save(); ctx.clip(); ctx.drawImage(img, x - rr, y - rr, rr * 2, rr * 2); ctx.restore(); ctx.strokeStyle = isHi ? 'rgba(255,210,140,0.95)' : 'rgba(236,230,214,0.5)'; ctx.lineWidth = isHi ? 2.2 : 1; ctx.stroke(); }
      else { ctx.fillStyle = '#1d2a31'; ctx.fill(); }
      ctx.font = `${(isHi ? 8 : 6.6) * S}px ${MONO}`; ctx.fillStyle = isHi ? 'rgba(255,214,150,0.95)' : DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(p.h ? '@' + p.h.replace('.bsky.social', '') : 'deleted', x, y + rr + 3 * S);
      ctx.restore();
    });
    ctx.textAlign = 'left';
  }
  function faces_(ctx, t, line, a) {
    // crossfade from the last line's era to this one's
    const idx = TIMELINE.indexOf(line), prev = TIMELINE[idx - 1], cur = line.era || 'invite', was = prev && prev.lecture === line.lecture ? prev.era || cur : cur;
    const f = ease((t - line.from) / 1.2);
    if (was !== cur && f < 1) faceRing(ctx, t, was, a * (1 - f), null);
    faceRing(ctx, t, cur, a * (was !== cur ? f : 1), line.hi);
    label(ctx, ERA[cur].name + ' · closest ten', a);
  }
  function words(ctx, t, list, a, name) {
    const rnd = mulberry32(list.length * 97 + list[0].length);
    list.forEach((w, i) => {
      const th = rnd() * Math.PI * 2 + t * 0.05 * (rnd() < 0.5 ? 1 : -1), rr = board.r * (0.15 + 0.85 * Math.sqrt(rnd())), z = rnd();
      const x = board.x + Math.cos(th) * rr, y = board.y + Math.sin(th) * rr * 0.75, s = (9 + 9 * z) * S;
      const on = fade(t, 0, 1e9) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.7)));
      ctx.font = `${i % 3 === 0 ? 'italic ' : ''}${s}px ${SERIF}`; ctx.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${a * on * (0.5 + 0.5 * z)})`; ctx.textAlign = 'center';
      ctx.fillText(w, x, y);
    });
    ctx.textAlign = 'left';
    label(ctx, name, a);
  }
  function chart(ctx, t, sec, line, a) {
    const b = sec.board, x0 = board.x - board.r * 1.25, x1 = board.x + board.r * 1.25, yb = board.y + board.r * 0.55, top = board.y - board.r * 0.85;
    const n = MONTHS.length, bw = (x1 - x0) / n, start = b.git ? monthIndex['2025-06'] : 0, end = monthIndex[b.upto];
    const span = sec.to - sec.card - 6, f = ease((t - sec.card - 5) / span), upto = b.git ? start + (end - start) * f : end * f;
    const maxP = 3500;
    MONTHS.forEach(([m, v], i) => {
      if (i > upto + 0.999) return;
      const h = (v / maxP) * (yb - top), inHi = b.hi && m >= b.hi[0] && m <= b.hi[1], al = a * clamp(upto + 1 - i);
      ctx.fillStyle = inHi ? `rgba(255,200,130,${al})` : `rgba(122,168,240,${al * 0.75})`; ctx.fillRect(x0 + i * bw + 0.5, yb - h, bw - 1, h);
      if (b.git && GIT[m]) { const g = (GIT[m] / 2200) * board.r * 0.45; ctx.fillStyle = `rgba(98,195,156,${al})`; ctx.fillRect(x0 + i * bw + 0.5, yb + 4 * S, bw - 1, g); }
    });
    ctx.font = `${7.5 * S}px ${MONO}`; ctx.fillStyle = `rgba(236,230,214,${0.6 * a})`; ctx.textBaseline = 'top';
    for (const y of ['2023', '2024', '2025', '2026']) { const i = monthIndex[y + '-01'] ?? 0; ctx.fillText(y, x0 + i * bw, b.git ? yb + board.r * 0.5 : yb + 4 * S); }
    const m = MONTHS[Math.min(n - 1, Math.floor(upto))];
    ctx.font = `${16 * S}px ${DISPLAY}`; ctx.fillStyle = `rgba(236,230,214,${a})`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${m[0]}  ·  ${m[1]} posts${b.git && GIT[m[0]] ? `  ·  ${GIT[m[0]]} commits` : ''}`, x0, top - 6 * S);
    label(ctx, b.git ? 'posts per month (blue) · commits per month (green)' : 'posts per month', a);
  }
  function cells(ctx, t, a) {
    const lit = litDate(t); if (!lit) return;
    const born = BIRTHS.filter(([d]) => d <= lit), month = lit.slice(0, 7), recent = born.filter(([d]) => d.slice(0, 7) === month).slice(-12);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.font = `${30 * S}px ${DISPLAY}`; ctx.fillStyle = `rgba(236,230,214,${a})`;
    ctx.fillText(new Date(lit).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }), board.x, board.y - board.r * 0.55);
    ctx.font = `${11 * S}px ${MONO}`; ctx.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${a})`;
    ctx.fillText(`${born.length} sites`, board.x, board.y - board.r * 0.55 + 18 * S);
    ctx.font = `${10 * S}px ${MONO}`;
    recent.forEach(([d, dir], i) => { ctx.fillStyle = `rgba(236,230,214,${a * (0.45 + 0.55 * (i / Math.max(1, recent.length - 1)))})`; ctx.fillText(dir, board.x + ((i % 2) - 0.5) * board.r * 0.9, board.y - board.r * 0.15 + Math.floor(i / 2) * 13 * S); });
    ctx.textAlign = 'left';
  }
  function tools(ctx, t, a) {
    faceRing(ctx, t, 'agent01', a * 0.85, null);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    TOOLS.forEach(([name], i) => {
      const ang = (i / TOOLS.length) * Math.PI * 2 + t * 0.04, x = board.x + Math.cos(ang) * board.r * 1.2, y = board.y + Math.sin(ang) * board.r * 1.02;
      ctx.font = `italic ${11 * S}px ${SERIF}`; ctx.fillStyle = `rgba(${TEAL[0]},${TEAL[1]},${TEAL[2]},${a * 0.9})`; ctx.fillText(name, x, y);
    });
    ctx.textAlign = 'left';
    label(ctx, 'the instruments', a);
  }
  function opening(ctx, t, a) {
    // the title, then the three numbers as he says them
    const tA = fade(t, 0.6, SECTIONS[0].from + 0.3, 1.2);
    if (tA > 0) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `600 ${34 * S}px ${DISPLAY}`; ctx.fillStyle = `rgba(236,230,214,${tA})`;
      const words = title.toUpperCase().split(' ');
      ctx.fillText(words.slice(0, 2).join(' '), board.x, board.y - 8 * S); ctx.fillText(words.slice(2).join(' '), board.x, board.y + 30 * S);
      ctx.font = `italic ${12 * S}px ${SERIF}`; ctx.fillStyle = `rgba(236,230,214,${0.75 * tA})`;
      ctx.fillText('No. 10 · a lecture given in the cylinder', board.x, board.y + 54 * S);
      ctx.textAlign = 'left';
    }
    const l3 = TIMELINE[2];
    if (t > l3.from - 0.2) {
      const nums = [[TOTALS.posts.toLocaleString('en'), 'posts'], [TOTALS.likes.toLocaleString('en'), 'likes'], ['1', 'repository']];
      nums.forEach(([v, k], i) => {
        const at = l3.from + [1.6, 3.2, 5.6][i], al = a * ease((t - at) / 0.6) * fade(t, 0, SECTIONS[0].to - 0.2, 0.8);
        ctx.textAlign = 'center'; ctx.font = `600 ${26 * S}px ${DISPLAY}`; ctx.fillStyle = `rgba(236,230,214,${al})`;
        const y = board.y - board.r * 0.45 + i * 46 * S; ctx.fillText(v, board.x, y);
        ctx.font = `${9 * S}px ${MONO}`; ctx.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${al})`; ctx.fillText(k.toUpperCase(), board.x, y + 14 * S);
      });
      ctx.textAlign = 'left';
    }
  }

  // ---- words on the frame --------------------------------------------------------------------------
  function quoteCard(ctx, q, a, big = false) {
    const [date, text, files] = QUOTES[q], box = big ? { x: board.x - board.r * 1.25, y: board.y - board.r * 0.7, w: board.r * 2.5 } : quoteBox;
    const fs = (big ? 15 : 11.5) * S, pad = 10 * S, pic = files.length ? face(files[0][0]) : null, has = files.length > 0;
    const pw = has ? Math.min(box.w * 0.36, (big ? 170 : 110) * S) : 0, tw = box.w - pad * 2 - (has ? pw + pad : 0);
    ctx.font = `italic ${fs}px ${SERIF}`;
    const shown = text.length > 260 ? text.slice(0, 250).replace(/\s+\S*$/, '') + '…' : text, lines = wrap(ctx, '“' + shown + '”', tw);
    const h = Math.max(pad * 2 + 12 * S + lines.length * fs * 1.3, has ? pad * 2 + pw * 0.8 : 0);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12,18,22,0.82)'; ctx.strokeStyle = 'rgba(122,168,240,0.55)'; ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, h, 6 * S); ctx.fill(); ctx.stroke();
    if (has) cover(ctx, pic, box.x + pad, box.y + pad, pw, h - pad * 2, 4 * S);
    const tx = box.x + pad + (has ? pw + pad : 0);
    ctx.font = `${7.5 * S}px ${MONO}`; ctx.fillStyle = 'rgba(122,168,240,0.95)'; ctx.textBaseline = 'top';
    ctx.fillText(`@minormobius · ${date}`, tx, box.y + pad);
    ctx.font = `italic ${fs}px ${SERIF}`; ctx.fillStyle = INK;
    lines.forEach((ln, i) => ctx.fillText(ln, tx, box.y + pad + 12 * S + i * fs * 1.3));
    ctx.restore();
  }
  function subtitle(ctx, t, line) {
    if (!line) return;
    const a = fade(t, line.from - 0.15, line.to + 0.5, 0.25);
    if (a <= 0) return;
    const fs = 13 * S, maxW = tall ? W * 0.88 : W * 0.62, cx = tall ? W / 2 : W * 0.6, by = tall ? H * 0.9 : H * 0.95;
    ctx.font = `${fs}px ${SERIF}`;
    const lines = wrap(ctx, line.text, maxW);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    lines.forEach((ln, i) => {
      const y = by - (lines.length - 1 - i) * fs * 1.3;
      ctx.fillStyle = `rgba(4,8,10,${0.55 * a})`; const w = ctx.measureText(ln).width; ctx.fillRect(cx - w / 2 - 6 * S, y - fs, w + 12 * S, fs * 1.3);
      ctx.fillStyle = `rgba(236,230,214,${a})`; ctx.fillText(ln, cx, y);
    });
    ctx.textAlign = 'left';
  }
  function header(ctx, t, sec) {
    if (sec.n < 0) return;
    // the title card: the number and the question, large, then small in the corner for the lecture
    const c = fade(t, sec.card + 0.1, sec.card + 5, 0.7);
    if (c > 0) {
      ctx.fillStyle = `rgba(3,6,8,${0.55 * c})`; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = `${10 * S}px ${MONO}`; ctx.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${c})`;
      ctx.fillText(`LECTURE ${sec.n + 1} OF 10`, W / 2, H * 0.42);
      ctx.font = `600 ${26 * S}px ${DISPLAY}`; ctx.fillStyle = `rgba(236,230,214,${c})`;
      wrap(ctx, sec.q, W * 0.8).forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.42 + 34 * S + i * 30 * S));
      ctx.textAlign = 'left';
    }
    const h = ease((t - sec.card - 4.6) / 0.8) * fade(t, 0, sec.to + 0.4, 0.5);
    if (h > 0) {
      ctx.textBaseline = 'top';
      ctx.font = `${8 * S}px ${MONO}`; ctx.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${0.9 * h})`;
      ctx.fillText(`LECTURE ${sec.n + 1} / 10`, 16 * S, 16 * S);
      ctx.font = `600 ${14 * S}px ${DISPLAY}`; ctx.fillStyle = `rgba(236,230,214,${h})`;
      wrap(ctx, sec.q, tall ? W * 0.8 : W * 0.42).forEach((ln, i) => ctx.fillText(ln, 16 * S, 30 * S + i * 17 * S));
    }
  }

  function draw(ctx, t) {
    t = clamp(t, 0, duration);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sec = sectionAt(t), line = lineAt(t), mode = sec.board?.mode;
    hall(ctx, t, sec);
    // the board: faded in after the title card, out at the section's end
    const a = sec.n < 0 ? 1 : ease((t - sec.card - 4.4) / 1) * fade(t, 0, sec.to + 0.2, 0.7);
    if (mode === 'title') opening(ctx, t, a);
    else if (a > 0 && line) {
      if (mode === 'orb') orb(ctx, t, sec.board.era, a);
      else if (mode === 'faces') faces_(ctx, t, line.lecture === sec.n ? line : TIMELINE.find((l) => l.lecture === sec.n), a);
      else if (mode === 'words') { const k = line.words || sec.board.era; words(ctx, t, k === 'math' ? MATH_WORDS : ERA[k].words, a, k === 'math' ? 'open problems he drew' : ERA[k].name + ' · his words'); }
      else if (mode === 'chart') chart(ctx, t, sec, line, a);
      else if (mode === 'cells') cells(ctx, t, a);
      else if (mode === 'tools') tools(ctx, t, a);
      else if (mode === 'quotes' && line.q) quoteCard(ctx, line.q, a * fade(t, line.from - 0.2, line.to + 1.6, 0.4), true);
    }
    // the lecturer, as light
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    lecturer(t, line);
    light.flush(ctx, 0.05);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // a quoted post, beside the board, while its line is spoken and a little after
    if (line && line.q && mode !== 'quotes') quoteCard(ctx, line.q, fade(t, line.from - 0.1, line.to + 1.7, 0.4));
    header(ctx, t, sec);
    subtitle(ctx, t, line);
    // the end: dismissed, and the credit
    const end = SECTIONS.at(-1).to;
    if (t > end - 0.5) {
      const e = ease((t - end) / 2);
      ctx.textAlign = 'center'; ctx.font = `${9 * S}px ${MONO}`; ctx.fillStyle = `rgba(236,230,214,${0.7 * e})`;
      ctx.fillText('from the public record of @minormobius.bsky.social and the agent01 repository', W / 2, H * (tall ? 0.97 : 0.97));
      ctx.textAlign = 'left';
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return { draw };
}
