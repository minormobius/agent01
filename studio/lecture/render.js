// render.js — "The Minormobius Lectures", drawn. A pure function of t on a 2D canvas.
//
// The hall is the cylinder he designed (June 2026), seen along its axis from the rind: the inner surface
// runs away from us as a tunnel of voronoi-foam cells round the sun line (the bright point where the axis
// vanishes), with the wild ecosystem drifting in the volume between. The 146 sites of agent01 are cells
// in that foam, dark until lecture 7 lights each in the month it was born; they stay lit after.
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

// ---- the foam: cells on the inner surface (angle, depth), the sites among them ----------------------
const FOAM = (() => {
  const rnd = mulberry32(0xf0a3), cells = [], sites = BIRTHS.map(([d, dir]) => ({ d, dir }));
  // rings of cells, fewer and larger toward us; the floor (straight down) is left clear for the lecturer
  for (let ring = 0; ring < 22; ring++) {
    const d = 0.04 + ring * 0.043 + rnd() * 0.01, n = 28 + ring * 2;
    for (let i = 0; i < n; i++) {
      const th = ((i + (ring % 2) * 0.5) / n) * Math.PI * 2 + rnd() * 0.04;
      const down = Math.abs(((th - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (down < 0.55 && d < 0.3) continue;
      cells.push({ th, d, w: (Math.PI * 2) / n * (0.62 + 0.25 * rnd()), h: 0.028 + 0.012 * rnd(), glow: rnd(), site: null });
    }
  }
  // each site gets a cell, spread along the tunnel and round it
  // (never the nearest rings: lit, those are big enough to swamp the frame)
  const free = cells.map((_, i) => i).filter((i) => cells[i].d > 0.2).sort(() => rnd() - 0.5);
  sites.forEach((s, i) => { const c = cells[free[i]]; c.site = s; s.cell = c; });
  return { cells, sites };
})();
const ECO = (() => { const rnd = mulberry32(0xec0); return Array.from({ length: 420 }, () => ({ th: rnd() * Math.PI * 2, rho: 0.12 + rnd() * 0.3, d: rnd(), sp: 0.02 + rnd() * 0.05, ph: rnd() * 6.28, g: rnd() })); })();

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
  // the hall: the axis vanishes a little above centre; the near rim is far off the frame
  const V = [W / 2, H * (tall ? 0.36 : 0.4)], RN = Math.hypot(W, H) * 0.7, K = 10;
  const proj = (th, d, roll = 0) => { const r = RN / (1 + d * K); return [V[0] + r * Math.cos(th + roll), V[1] + r * Math.sin(th + roll)]; };
  // where things go
  const board = tall ? { x: W * 0.5, y: H * 0.3, r: W * 0.4 } : { x: W * 0.63, y: H * 0.4, r: Math.min(W * 0.28, H * 0.3) };
  const lect = tall ? { x: W * 0.2, floor: H * 0.83, h: H * 0.3 } : { x: W * 0.19, floor: H * 0.94, h: H * 0.66 };
  const quoteBox = tall ? { x: W * 0.08, y: H * 0.56, w: W * 0.84 } : { x: W * 0.4, y: H * 0.68, w: W * 0.52 };
  const S = Math.min(W, H) / 540;                        // a type unit: the layout is a phone's at 540

  // the faces, loaded once (the page serves them beside the piece)
  const faces = {};
  const face = (f) => { if (!f || typeof Image === 'undefined') return null; if (!faces[f]) { faces[f] = new Image(); faces[f].src = new URL(f, import.meta.url).href; } return faces[f].complete && faces[f].naturalWidth ? faces[f] : null; };
  for (const e in PEOPLE) for (const p of PEOPLE[e]) face(p.f);

  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const tr = cur ? cur + ' ' + w : w; if (ctx.measureText(tr).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tr; }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- the hall ------------------------------------------------------------------------------------
  function hall(ctx, t, sec) {
    const reveal = sec.board?.mode === 'cylinder' ? ease((t - sec.card - 4) / 10) : t > SECTIONS.at(-1).to ? 1 : 0;
    const roll = 0.02 * Math.sin(t * 0.05) + reveal * 0.12 * Math.sin(t * 0.08);
    const g = ctx.createRadialGradient(V[0], V[1], 0, V[0], V[1], RN * 0.9);
    g.addColorStop(0, `rgb(${34 + 30 * reveal},${44 + 26 * reveal},${48 + 14 * reveal})`); g.addColorStop(0.25, '#101a1f'); g.addColorStop(1, '#05080a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the hull: ribs round the tunnel and the long trusses running to the far cap
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) { const d = ((i + (t * 0.01) % 1) / 16); const r = RN / (1 + d * K); ctx.strokeStyle = `rgba(150,190,190,${0.05 + 0.05 * (1 - d)})`; ctx.beginPath(); ctx.arc(V[0], V[1], r, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 24; i++) { const th = (i / 24) * Math.PI * 2 + roll; const a = proj(th, 0), b = proj(th, 1.2); ctx.strokeStyle = 'rgba(150,190,190,0.05)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // the foam: every cell a window; the sites lit by the date
    const lit = litDate(t);
    for (const c of FOAM.cells) {
      const a0 = c.th - c.w / 2, a1 = c.th + c.w / 2, d0 = c.d, d1 = c.d + c.h;
      const p = [proj(a0, d0, roll), proj(a1, d0, roll), proj(a1, d1, roll), proj(a0, d1, roll)];
      const on = c.site && lit && c.site.d <= lit, fresh = on && lit && daysBetween(c.site.d, lit) < 14;
      const depth = 1 - c.d, near = clamp((c.d - 0.04) / 0.25);
      let fill;
      if (on) fill = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${0.3 + 0.35 * depth + (fresh ? 0.35 : 0)})`;
      else fill = `rgba(${60 + 40 * c.glow * reveal},${90 + 30 * reveal},${95},${(0.05 + 0.08 * depth + 0.2 * reveal * c.glow) * (0.35 + 0.65 * near)})`;
      ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); ctx.fill();
    }
    // the wild ecosystem: drifting life in the volume round the axis
    for (const e of ECO) {
      const d = (e.d + t * 0.004 * (0.5 + e.g)) % 1, th = e.th + t * e.sp + roll, r = (RN / (1 + d * K)) * (e.rho + 0.02 * Math.sin(t * 0.7 + e.ph));
      const x = V[0] + r * Math.cos(th), y = V[1] + r * Math.sin(th), a = (0.18 + 0.35 * reveal) * (1 - d) * (0.5 + 0.5 * Math.sin(t * 1.3 + e.ph));
      ctx.fillStyle = `rgba(${140 + 60 * e.g},${220},${150},${a})`; ctx.fillRect(x, y, 1.4 * S * (1.4 - d), 1.4 * S * (1.4 - d));
    }
    // the sun line, end on: a point and its halo
    const sun = ctx.createRadialGradient(V[0], V[1], 0, V[0], V[1], 90 * S * (1 + reveal));
    sun.addColorStop(0, 'rgba(255,244,214,0.95)'); sun.addColorStop(0.08, 'rgba(255,226,170,0.5)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(V[0], V[1], 90 * S * (1 + reveal), 0, Math.PI * 2); ctx.fill();
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
  const orbTiles = {};
  function orb(ctx, t, era, a) {
    const posts = ORB[era] || [], n = posts.length, R = board.r, tiles = orbTiles[era] ||= posts.map((p, i) => {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      return { x: r * Math.cos(th), y, z: r * Math.sin(th), p };
    });
    const rot = t * 0.09, cr = Math.cos(rot), sr = Math.sin(rot), tilt = 0.28, ct = Math.cos(tilt), st = Math.sin(tilt);
    const placed = tiles.map((q) => { const x = q.x * cr + q.z * sr, z0 = -q.x * sr + q.z * cr, y = q.y * ct - z0 * st, z = q.y * st + z0 * ct; return { q, x, y, z }; }).sort((u, v) => u.z - v.z);
    const glow = ctx.createRadialGradient(board.x, board.y, R * 0.2, board.x, board.y, R * 1.25);
    glow.addColorStop(0, `rgba(90,150,220,${0.16 * a})`); glow.addColorStop(1, 'rgba(90,150,220,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(board.x, board.y, R * 1.25, 0, Math.PI * 2); ctx.fill();
    const tw = R * 0.42, th = R * 0.2;
    ctx.textBaseline = 'top';
    for (const { q, x, y, z } of placed) {
      if (z < -0.15) continue;
      const k = 0.62 + 0.38 * z, px = board.x + x * R, py = board.y - y * R, w = tw * k, h = th * k, al = a * clamp((z + 0.15) / 0.5) * 0.92;
      ctx.fillStyle = `rgba(22,36,52,${al * 0.85})`; ctx.strokeStyle = `rgba(122,168,240,${al * 0.7})`; ctx.lineWidth = 1;
      roundRect(ctx, px - w / 2, py - h / 2, w, h, 4 * k); ctx.fill(); ctx.stroke();
      if (z > 0.25) {
        ctx.font = `${6.4 * S * k}px ${SERIF}`; ctx.fillStyle = `rgba(236,230,214,${al})`;
        const lines = wrap(ctx, q.p[1], w - 8 * k).slice(0, 3);
        lines.forEach((ln, i) => ctx.fillText(ln, px - w / 2 + 4 * k, py - h / 2 + 3 * k + i * 7.4 * S * k));
      }
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
    const [date, text] = QUOTES[q], box = big ? { x: board.x - board.r * 1.2, y: board.y - board.r * 0.55, w: board.r * 2.4 } : quoteBox;
    const fs = (big ? 15 : 11.5) * S, pad = 10 * S;
    ctx.font = `italic ${fs}px ${SERIF}`;
    const shown = text.length > 260 ? text.slice(0, 250).replace(/\s+\S*$/, '') + '…' : text, lines = wrap(ctx, '“' + shown + '”', box.w - pad * 2);
    const h = pad * 2 + 12 * S + lines.length * fs * 1.3;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12,18,22,0.78)'; ctx.strokeStyle = 'rgba(122,168,240,0.55)'; ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, h, 6 * S); ctx.fill(); ctx.stroke();
    ctx.font = `${7.5 * S}px ${MONO}`; ctx.fillStyle = 'rgba(122,168,240,0.95)'; ctx.textBaseline = 'top';
    ctx.fillText(`@minormobius · ${date}`, box.x + pad, box.y + pad);
    ctx.font = `italic ${fs}px ${SERIF}`; ctx.fillStyle = INK;
    lines.forEach((ln, i) => ctx.fillText(ln, box.x + pad, box.y + pad + 12 * S + i * fs * 1.3));
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
