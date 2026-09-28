// render.js — "Nobody Drew It", drawn: the world replayed (grown/gl.js, grown/scene.js, into an
// offscreen WebGL canvas copied onto the frame), the time-lapses as a streamgraph of every species
// the history held, and the words: the title, each chapter's name, the lyric, and who is alive.
//
// makeRenderer(W, H, dpr) → { draw(ctx, t) }: the page and the video exporter call the same draw.

import { makeRenderer as makeGL } from '../grown/gl.js';
import { scene } from '../grown/scene.js';
import { ORGANS, LETTER, signature, WX, WY, WZ } from '../vendor/attractor/lib/organism.js';
import { Replay, CHAPTERS, LAPSES, chapterAt, lapseAt, censusAt } from './world.js';
import { HISTORY } from './history.js';
import { lyric, cues, title } from './score.js';

const SERIF = '"Cormorant Garamond", Georgia, serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const hueOf = (sig) => { let h = 2166136261; for (const ch of sig) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 360; };
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(',')},${a})`;
const CAPTIONS = [
  { at: CHAPTERS[0].still, text: 'i.  the founders', sub: 'three bodies, written by hand' },
  { at: CHAPTERS[1].from, text: 'ii.  the biters', sub: 'step 300,000' },
  { at: CHAPTERS[2].from, text: 'iii.  Quul', sub: 'step 950,000' },
];

export function makeRenderer(W, H, dpr = 1) {
  const w = Math.round(W * dpr), h = Math.round(H * dpr), u = Math.min(w, h) / 100;
  const gc = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const GL = makeGL(gc), replay = new Replay();
  const aspect = w / h;

  function view(t, cam, chapter) {
    const coda = ease((t - cues.coda) / 12), quul = chapter === 2 ? 1 : 0;
    const yaw = 0.6 + t * 0.055, pitch = 0.42 + 0.35 * coda, d = (cam.spread * (1.7 + 1.4 * coda * quul)) / Math.min(1, aspect) ** 0.7;
    const tg = cam.t, cp = Math.cos(pitch);
    return { eye: [tg[0] + Math.sin(yaw) * cp * d, tg[1] + Math.sin(pitch) * d, tg[2] + Math.cos(yaw) * cp * d], target: tg, fov: 0.75 };
  }

  function words(ctx, t, W) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // the title
    const ti = clamp01(t / 2) * (1 - ease((t - cues.founders + 1.5) / 2.5));
    if (ti > 0) {
      ctx.fillStyle = `rgba(239,228,204,${ti})`; ctx.font = `500 ${u * 9}px ${SERIF}`; ctx.fillText('NOBODY DREW IT', w / 2, h * 0.42);
      ctx.fillStyle = `rgba(239,228,204,${ti * 0.7})`; ctx.font = `italic 400 ${u * 3.6}px ${SERIF}`; ctx.fillText('bodies grown from programs, sung by the ones that lived', w / 2, h * 0.42 + u * 6);
    }
    // each chapter's name, for four seconds
    for (const c of CAPTIONS) {
      const a = clamp01((t - c.at) / 0.8) * (1 - ease((t - c.at - 3.2) / 1.2));
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(239,228,204,${a})`; ctx.font = `italic 400 ${u * 5.2}px ${SERIF}`; ctx.fillText(c.text, w / 2, h * 0.16);
      ctx.fillStyle = `rgba(226,184,120,${a * 0.85})`; ctx.font = `500 ${u * 2.1}px ${MONO}`; ctx.fillText(c.sub.toUpperCase(), w / 2, h * 0.16 + u * 4);
    }
    // the lyric, as it is sung
    const L = lyric.find((l) => t >= l.from - 0.3 && t < l.to);
    if (L) {
      const a = clamp01((t - L.from + 0.3) / 0.4) * clamp01((L.to - t) / 0.5);
      ctx.font = `italic 400 ${u * 5}px ${SERIF}`; ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`; ctx.fillText(L.text, w / 2 + u * 0.2, h * 0.88 + u * 0.2);
      ctx.fillStyle = `rgba(245,236,214,${a})`; ctx.fillText(L.text, w / 2, h * 0.88);
    }
    // who is alive: the commonest body plans, their names and their organ trees in organ colours
    if (W && t > CHAPTERS[0].still + 4) {
      const by = new Map(); for (const B of W.bodies) { const k = B.genome.name; const c = by.get(k) || { name: k, n: 0, sig: (B.sig ||= signature(B.genome)) }; c.n++; by.set(k, c); }
      const rows = [...by.values()].sort((a, b) => b.n - a.n).slice(0, 4), fs = u * 1.9, x0 = u * 3;
      ctx.textAlign = 'left'; ctx.font = `500 ${fs}px ${MONO}`;
      rows.forEach((r, k) => {
        const y = u * 5 + k * fs * 1.5; let x = x0;
        ctx.fillStyle = 'rgba(239,228,204,0.7)'; const head = `${String(r.n).padStart(2)} ${r.name.padEnd(9)} `; ctx.fillText(head, x, y); x += ctx.measureText(head).width;
        for (const ch of r.sig) { const ty = Object.keys(LETTER).find((q) => LETTER[q] === ch); ctx.fillStyle = ty ? rgb(ORGANS[ty].colour, 0.85) : 'rgba(239,228,204,0.45)'; ctx.fillText(ch, x, y); x += ctx.measureText(ch).width; }
      });
      ctx.textAlign = 'center';
    }
  }

  /** A time-lapse: the history as a streamgraph, swept from s0 to s1, every species a band. */
  function lapse(ctx, t, li) {
    const Lp = LAPSES[li], p = (t - Lp.from) / (Lp.to - Lp.from), s = Lp.s0 + (Lp.s1 - Lp.s0) * ease(p);
    ctx.fillStyle = '#060509'; ctx.fillRect(0, 0, w, h);
    const S1 = Lp.s1, N = 160, x0 = w * 0.06, x1 = w * 0.94, yMid = h * 0.52, scale = (h * 0.5) / 60;
    const sp = HISTORY.species, cols = sp.map((x) => `hsla(${hueOf(x.sig)},70%,62%,`);
    // the bands up to the sweep: each column stacked, centred on the middle
    const cols2 = [];
    for (let i = 0; i <= N; i++) { const hs = (S1 * i) / N; if (hs > s) break; cols2.push({ x: x0 + ((x1 - x0) * i) / N, c: censusAt(hs) }); }
    const nb = sp.length + 1;
    for (let k = 0; k < nb; k++) {
      ctx.beginPath();
      cols2.forEach(({ x, c }, i) => { const tot = c.reduce((a, b) => a + b, 0), below = c.slice(0, k).reduce((a, b) => a + b, 0), y = yMid - (tot / 2 - below) * scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      for (let i = cols2.length - 1; i >= 0; i--) { const { x, c } = cols2[i], tot = c.reduce((a, b) => a + b, 0), below = c.slice(0, k + 1).reduce((a, b) => a + b, 0); ctx.lineTo(x, yMid - (tot / 2 - below) * scale); }
      ctx.closePath(); ctx.fillStyle = k < sp.length ? cols[k] + '0.78)' : 'rgba(239,228,204,0.12)'; ctx.fill();
    }
    // the names, at each band's widest point so far
    ctx.textAlign = 'center'; ctx.font = `italic 500 ${u * 2.6}px ${SERIF}`;
    sp.forEach((x, k) => {
      let best = null;
      cols2.forEach(({ x: px, c }) => { if (c[k] > 4 && (!best || c[k] > best.v)) { const tot = c.reduce((a, b) => a + b, 0), below = c.slice(0, k).reduce((a, b) => a + b, 0); best = { v: c[k], x: px, y: yMid - (tot / 2 - below - c[k] / 2) * scale }; } });
      if (!best) return;
      ctx.fillStyle = 'rgba(8,6,10,0.85)'; ctx.fillText(x.name, best.x, best.y + u * 0.9);
      ctx.fillStyle = 'rgba(250,244,230,0.95)'; ctx.fillText(x.name, best.x - u * 0.12, best.y + u * 0.8);
    });
    // the sweep, and the step it has reached
    const sx = x0 + ((x1 - x0) * s) / S1;
    ctx.fillStyle = 'rgba(226,184,120,0.8)'; ctx.fillRect(sx, h * 0.2, Math.max(1, u * 0.15), h * 0.64);
    ctx.font = `500 ${u * 2.2}px ${MONO}`; ctx.fillStyle = 'rgba(226,184,120,0.9)'; ctx.fillText(`STEP ${Math.round(s).toLocaleString('en')}`, w / 2, h * 0.16);
    ctx.font = `italic 400 ${u * 2.6}px ${SERIF}`; ctx.fillStyle = 'rgba(239,228,204,0.6)'; ctx.fillText('every band a body plan, as wide as how many were alive', w / 2, h * 0.16 + u * 4);
  }

  function draw(ctx, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const li = lapseAt(t);
    if (li >= 0) { lapse(ctx, t, li); words(ctx, t, null); return; }
    const { W, chapter, f } = replay.at(t);
    scene(GL, W, f, t, { haze: t < CHAPTERS[0].still ? 1.6 : 0.9 });
    GL.draw(view(t, replay.cam || { t: [WX / 2, WY / 2, WZ / 2], spread: 60 }, chapter));
    ctx.drawImage(gc, 0, 0, w, h);
    // a little darkness at the edges, and a fade at the very start and end
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const black = Math.max(1 - t / 1.5, ease((t - cues.end + 3) / 3)); if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${black})`; ctx.fillRect(0, 0, w, h); }
    words(ctx, t, W);
  }
  return { draw, title };
}
