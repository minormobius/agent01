// render.js — Speakeasy at one size: the theatre, and the whole show, as draw(ctx, t).
//
// A proscenium with a red curtain; inside it, four sets that fly in and out on
// the score's cues; paper puppets that move on twos (twelve drawings a second,
// as stop-motion does) and on their instruments' notes; and across the top a
// strip of paper where the typewriter in the score types the story.

import { events, cues, sec, LINES_TYPED, bar } from './score.js';
import { PAL, makeTextures, sheet, cut, path, drawPuppet, partPositions } from './stage.js';
import { MAN, DAME, walkPose, stand, charleston, drawManager, drawBand } from './cast.js';
import { rng, hash } from '../lib/paint.js';

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const span = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, f) => a + (b - a) * f;
const FLOOR = 86;
const DRAW = 12;                                     // puppet drawings per second

// ---- the score, indexed ---------------------------------------------------------------
const byInst = {};
for (const e of events) (byInst[e.inst] ??= []).push(e);
const tagged = (tag) => events.filter((e) => e.tag === tag);
function lastBefore(list, t) {
  if (!list) return null;
  let lo = 0, hi = list.length - 1, best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].at <= t) { best = list[mid]; lo = mid + 1; } else hi = mid - 1; }
  return best;
}
const countBefore = (list, t) => { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].at <= t) lo = mid + 1; else hi = mid; } return lo; };
/** How recently an instrument sounded: 1 at the note, falling away over `tau` seconds. */
const hit = (inst, t, tau = 0.18) => { const e = lastBefore(byInst[inst], t); return e ? Math.exp(-(t - e.at) / tau) : 0; };
const pitchOf = (inst, t) => { const e = lastBefore(byInst[inst], t); return e?.midi ? clamp((e.midi - 55) / 30) : 0; };
function beatAt(t) { let lo = 0, hi = 420; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (sec(mid) < t) lo = mid; else hi = mid; } return lo; }

const steps = byInst.step || [];
const taxis = tagged('taxi');
const floors = tagged('floor');
const clinks = tagged('clink');
const typeEvents = (byInst.type || []);

// ---- the typewriter's text ------------------------------------------------------------
const LINES = LINES_TYPED.map((l, li) => {
  const times = [];
  const typed = typeEvents.filter((e) => e.line === li);
  for (let i = 0; i < l.text.length; i++) {
    const e = typed.find((x) => x.char === i);
    times.push(e ? e.at : (times[i - 1] ?? l.at));
  }
  return { ...l, times };
});

export function makeRenderer(W, H, dpr) {
  // Wide screens show the whole stage in its frame. Narrower ones crop the
  // opening (a phone sees 118 of its 160 units) and the camera pans to the action.
  const aspect = W / H;
  const portrait = aspect < 1.3;
  const view = Math.min(160, 118 + Math.max(0, aspect - 0.56) * 62);
  const s = portrait ? W / view : Math.min(W / 176, H / 116);
  const ox = W / 2, oy = aspect < 0.8 ? H * 0.42 - 50 * s : H / 2 - 50 * s + (H / s > 116 ? 0 : 3 * s);
  const T = makeTextures();
  let tex = null;
  const R = rng(4242);
  const stars = Array.from({ length: 60 }, () => [R() * 160, 4 + (R() + 1) * 22, 0.2 + (R() + 1) * 0.2]);

  function textures(ctx) {
    if (tex) return tex;
    const pat = (c, unitsPerPx) => { const p = ctx.createPattern(c, 'repeat'); p.setTransform?.(new DOMMatrix().scale(unitsPerPx)); return p; };
    tex = {
      grainPat: pat(T.grain, 1 / s), newsPat: pat(T.news, 0.12), diamondsPat: pat(T.diamonds, 0.25),
      decoPat: pat(T.deco, 0.2), brickPat: pat(T.brick, 0.25), grainScreen: ctx.createPattern(T.grain, 'repeat'),
    };
    return tex;
  }

  // On a phone the opening is cropped, so the camera pans to where the action is.
  const PANS = [[0, 0], [cues.dameLift[0], 0], [cues.dameLift[0] + 1.5, 12], [cues.descent[0] + 3, 12], [cues.descent[0] + 4, 0],
    [cues.arrive, 0], [cues.arrive + 5, 16], [cues.knows, 16], [cues.knows + 2, -6], [cues.raid[0], -6], [cues.raid[0] + 1, 8], [cues.curtain[0], 0]];
  const panScale = (160 - view) / 42;
  function pan(t) { return panScale * panAt(t); }
  function panAt(t) {
    for (let i = PANS.length - 1; i >= 0; i--) {
      if (t < PANS[i][0]) continue;
      const nx = PANS[i + 1];
      if (!nx) return PANS[i][1];
      return lerp(PANS[i][1], nx[1], ease(span(t, PANS[i][0], nx[0])));
    }
    return 0;
  }

  function draw(ctx, tReal) {
    const t = Math.floor(tReal * DRAW) / DRAW;          // the puppets' clock: on twos
    const tx = textures(ctx);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    if (portrait) ctx.translate(-pan(tReal), 0);

    // ---- inside the opening
    ctx.save();
    ctx.beginPath(); ctx.rect(-80, 0, 160, 100); ctx.clip();
    const beat = beatAt(t);
    if (t < cues.flyToLobby[1]) street(ctx, t, beat, tx, -ease(span(t, cues.flyToLobby[0], cues.flyToLobby[1])) * 110);
    if (t >= cues.flyToLobby[0] && t < cues.descent[0] + 3) lobby(ctx, t, beat, tx, t < cues.lobby ? (1 - ease(span(t, cues.flyToLobby[0], cues.flyToLobby[1]))) * -110 : -ease(span(t, cues.descent[0], cues.descent[0] + 3)) * 110);
    if (t >= cues.descent[0] && t < cues.arrive + 1.5) descent(ctx, t, beat, tx);
    if (t >= cues.arrive - 0.01) club(ctx, t, beat, tx, tReal);
    ctx.restore();

    // ---- the frame, the curtain, the typewriter
    proscenium(ctx, tReal, tx);
    if (portrait) ctx.translate(pan(tReal), 0);          // the typewriter's strip stays put
    typewriter(ctx, tReal, tx);

    // ---- the paper's tooth over the whole theatre
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tx.grainScreen;
    ctx.fillRect(0, 0, W * dpr, H * dpr);
    ctx.restore();
  }

  // ======================================================================== the street
  function street(ctx, t, beat, tx, dy) {
    ctx.save(); ctx.translate(0, dy);
    const nSteps = countBefore(steps, t);
    const walking = t >= cues.street && t < cues.flyToLobby[1];
    const stop = span(t, cues.pick - 0.3, cues.pick) * (1 - span(t, cues.pick + 1.2, cues.pick + 1.8));
    const dist = nSteps * 2.4;
    // sky and stars and the moon
    sheet(ctx, [[-82, -2], [82, -2], [82, 88], [-82, 88]], PAL.night, { edge: 0 });
    ctx.fillStyle = PAL.cream;
    for (const [x, y, r] of stars) { ctx.beginPath(); ctx.arc(((x - dist * 0.05) % 170 + 170) % 170 - 85, y + 10, r, 0, 6.3); ctx.fill(); }
    sheet(ctx, cut([[52, 18], [58, 14], [62, 20], [60, 28], [54, 30], [58, 24], [57, 19]], 3), PAL.cream, { grain: tx.grainPat });
    // far skyline (slow), near skyline (faster), each a strip of cut flats
    const skyline = (k, speed, base, col, seedBase, hMin, hMax, news) => {
      const off = (dist * speed) % 200;
      for (let i = -2; i < 12; i++) {
        const w = 12 + hash(i, seedBase) * 10, h = hMin + hash(i, seedBase + 1) * (hMax - hMin);
        const x = -100 + i * 22 - off;
        const slant = (hash(i, seedBase + 2) - 0.5) * 6;
        const poly = cut([[x, base - h + slant], [x + w, base - h - slant], [x + w, base], [x, base]], seedBase * 100 + i);
        sheet(ctx, poly, news && i % 4 === 1 ? tx.newsPat : col, { grain: tx.grainPat });
        ctx.fillStyle = k ? '#f2d27a' : '#c9b06a';
        for (let wy = base - h + 4; wy < base - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3.2) if (hash(i * 31 + wx, wy) > 0.55) ctx.fillRect(wx, wy, 1.2, 1.8);
      }
    };
    skyline(0, 0.15, 70, '#2a3b66', 11, 30, 50, false);
    skyline(1, 0.45, 78, '#3c3a52', 21, 22, 44, true);
    // neon signs on the near buildings: they blink on the snare
    const sn = hit('snare', t, 0.12);
    const neon = (x, y, text, col) => {
      const on = 0.35 + 0.65 * sn;
      ctx.save(); ctx.translate(x, y);
      sheet(ctx, cut([[-text.length * 2.2 - 1.5, -3.6], [text.length * 2.2 + 1.5, -3.6], [text.length * 2.2 + 1.5, 2.2], [-text.length * 2.2 - 1.5, 2.2]], x | 0), PAL.black, { edge: 0.2 });
      ctx.font = 'bold 4.6px Georgia, serif'; ctx.textAlign = 'center';
      ctx.shadowColor = col; ctx.shadowBlur = 8 * on * s / 4;
      ctx.fillStyle = col; ctx.globalAlpha = on; ctx.fillText(text, 0, 1.2);
      ctx.restore();
    };
    const nOff = (dist * 0.45) % 200;
    neon(-40 - nOff + 200 * (nOff > 120), 42, 'HOTEL', '#ff5a4a');
    neon(10 - nOff + 200 * (nOff > 70), 48, 'JAZZ', '#6fc3ff');
    neon(60 - nOff, 40, 'BAR', '#9dff9a');
    // the street and the kerb
    sheet(ctx, [[-82, 78], [82, 78], [82, 102], [-82, 102]], '#34343a', { grain: tx.grainPat, edge: 0 });
    sheet(ctx, [[-82, 77], [82, 77], [82, 79], [-82, 79]], PAL.grey, { edge: 0.2 });
    for (let i = -1; i < 10; i++) { const x = -90 + i * 20 - (dist % 20); sheet(ctx, [[x, 92], [x + 9, 92], [x + 9, 93.4], [x, 93.4]], PAL.cream, { edge: 0 }); }
    // lampposts
    for (let i = -1; i < 4; i++) {
      const x = -60 + i * 55 - (dist % 55);
      sheet(ctx, cut([[x - 0.6, 40], [x + 0.6, 40], [x + 0.8, 78], [x - 0.8, 78]], 7), PAL.black);
      sheet(ctx, cut([[x - 3, 36], [x + 3, 36], [x + 2, 40.5], [x - 2, 40.5]], 8), PAL.gold, { grain: tx.grainPat });
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.moveTo(x - 2, 40.5); ctx.lineTo(x + 2, 40.5); ctx.lineTo(x + 12, 78); ctx.lineTo(x - 12, 78); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // the taxi, on its horn
    const tax = taxis.filter((e) => t >= e.at - 0.8 && t < e.at + 2.4).at(-1);
    if (tax) taxi(ctx, lerp(100, -110, span(t, tax.at - 0.8, tax.at + 2.4)), 84, tx);
    // the card
    const cardX = -12;
    const cardScreen = cardX + (countBefore(steps, cues.pick) - nSteps) * 2.4;
    if (t >= cues.card && t < cues.pick + 0.6) {
      const f = span(t, cues.card, cues.card + 0.9);
      const x = t < cues.card + 0.9 ? lerp(cardScreen + 4, cardScreen, f) : cardScreen;
      const y = lerp(66, FLOOR - 0.6, f * f);
      ctx.save(); ctx.translate(x, y); ctx.rotate(f * 5 + Math.sin(f * 9) * 0.4);
      sheet(ctx, [[-2, -1.2], [2, -1.2], [2, 1.2], [-2, 1.2]], PAL.cream, { edge: 0.2 });
      ctx.restore();
    }
    // the dame, walking the other way
    if (t >= cues.dame[0] && t < cues.dame[1]) {
      const x = cardScreen + 4 + (cues.card - t) * 8.5;
      const ph = beatAt(t) * 1.0;
      const w = walkPose(ph + 0.5, 0.8, 0.5);
      w.pose.armF = -0.9; w.pose.foreF = -1.4;
      drawPuppet(ctx, DAME, { x, y: FLOOR - 15.2 + w.bob, s: 1, flip: true, pose: w.pose, tex: tx });
    }
    // the man in the hat
    const mx = -14;
    if (walking) {
      const ph = beatAt(t);
      const w = walkPose(ph, 1 - stop);
      const bend = stop;
      w.pose.torso = (w.pose.torso || 0) + bend * 0.55;
      w.pose.armF = lerp(w.pose.armF, -0.2, bend); w.pose.foreF = lerp(w.pose.foreF, 0.1, bend);
      w.pose.legF = lerp(w.pose.legF, -0.5, bend); w.pose.shinF = lerp(w.pose.shinF, 1.1, bend);
      w.pose.legB = lerp(w.pose.legB, 0.1, bend); w.pose.shinB = lerp(w.pose.shinB, 0.6, bend);
      drawPuppet(ctx, MAN, { x: mx, y: FLOOR - 15.2 + w.bob + bend * 2.2, pose: w.pose, tex: tx });
    } else if (t < cues.street) {
      drawPuppet(ctx, MAN, { x: mx, y: FLOOR - 15.2, pose: stand.pose, tex: tx });
    }
    // the card, held up to us: HOTEL MAJESTIC
    const cz = span(t, cues.pick + 1.2, cues.pick + 2.2) * (1 - span(t, bar(25, 2), bar(26)));
    if (cz > 0.01) {
      ctx.save(); ctx.translate(20, 40); ctx.scale(cz, cz); ctx.rotate(-0.06);
      sheet(ctx, cut([[-26, -14], [26, -14], [26, 14], [-26, 14]], 99), PAL.cream, { grain: tx.grainPat, edge: 0.5 });
      sheet(ctx, cut([[-23, -11], [23, -11], [23, 11], [-23, 11]], 98), 'rgba(0,0,0,0)', { edge: 0.4, edgeColor: PAL.ochre });
      ctx.fillStyle = PAL.ink; ctx.textAlign = 'center';
      ctx.font = 'bold 7px Georgia, serif'; ctx.fillText('HOTEL', 0, -2);
      ctx.font = 'bold 8.4px Georgia, serif'; ctx.fillText('MAJESTIC', 0, 6.4);
      ctx.font = 'italic 3px Georgia, serif'; ctx.fillStyle = PAL.brick; ctx.fillText('ask for the cellar', 0, 11);
      ctx.restore();
    }
    ctx.restore();
  }

  function taxi(ctx, x, y, tx) {
    ctx.save(); ctx.translate(x, y);
    sheet(ctx, cut([[-12, -7], [-6, -12.5], [6, -12.5], [11, -7], [14, -6], [14, -1], [-14, -1], [-14, -6]], 31), PAL.gold, { grain: tx.grainPat });
    sheet(ctx, cut([[-5, -11.5], [0, -11.5], [0, -7.5], [-8.4, -7.5]], 32), PAL.navy);
    sheet(ctx, cut([[1, -11.5], [5.5, -11.5], [9, -7.5], [1, -7.5]], 33), PAL.navy);
    ctx.fillStyle = PAL.ink; for (let k = 0; k < 10; k++) ctx.fillRect(-13 + k * 2.6, -5, 1.3, 1.2);
    for (const wx of [-8, 8]) { sheet(ctx, cut([[wx - 3, -2], [wx + 3, -2], [wx + 3, 3], [wx - 3, 3]], 34 + wx), PAL.black); ctx.fillStyle = PAL.grey; ctx.beginPath(); ctx.arc(wx, 0.5, 1.2, 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff2b0';
    ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-40, -11); ctx.lineTo(-40, 2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ======================================================================== the lobby
  function lobby(ctx, t, beat, tx, dy) {
    ctx.save(); ctx.translate(0, dy);
    sheet(ctx, [[-82, -2], [82, -2], [82, 70], [-82, 70]], tx.decoPat, { edge: 0 });
    // the floor: black and white marble, in perspective
    for (let row = 0; row < 5; row++) {
      const y0 = 70 + row * 4 + row * row * 0.6, y1 = 70 + (row + 1) * 4 + (row + 1) * (row + 1) * 0.6;
      for (let c = -12; c < 12; c++) {
        const k0 = 1 + row * 0.14, k1 = 1 + (row + 1) * 0.14;
        sheet(ctx, [[c * 8 * k0, y0], [(c + 1) * 8 * k0, y0], [(c + 1) * 8 * k1, y1], [c * 8 * k1, y1]], (row + c) % 2 ? PAL.cream : PAL.black, { edge: 0.1 });
      }
    }
    // columns
    for (const cx of [-62, -30, 58]) {
      sheet(ctx, cut([[cx - 4, 12], [cx + 4, 12], [cx + 4, 70], [cx - 4, 70]], cx + 200), PAL.cream, { grain: tx.grainPat });
      sheet(ctx, cut([[cx, 12], [cx + 4, 12], [cx + 4, 70], [cx, 70]], cx + 201), '#b9ad96', { edge: 0.15 });
      sheet(ctx, cut([[cx - 6, 8], [cx + 6, 8], [cx + 5, 13], [cx - 5, 13]], cx + 202), PAL.ochre, { grain: tx.grainPat });
    }
    // the chandelier: it sways with the vibes
    const vb = hit('vibes', t, 0.6);
    ctx.save(); ctx.translate(-5, -2); ctx.rotate(Math.sin(t * 1.3) * 0.03 + vb * 0.02);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12); ctx.stroke();
    sheet(ctx, cut([[-12, 12], [12, 12], [7, 18], [-7, 18]], 301), PAL.gold, { grain: tx.grainPat });
    for (let k = -3; k <= 3; k++) {
      ctx.globalAlpha = 0.6 + vb * 0.4;
      sheet(ctx, [[k * 3.4 - 0.8, 18], [k * 3.4 + 0.8, 18], [k * 3.4, 21 + (3 - Math.abs(k)) * 0.8]], '#dfeaf2', { edge: 0.15 });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // the desk, and its bell
    sheet(ctx, cut([[-58, 56], [-34, 56], [-34, 72], [-58, 72]], 310), PAL.brown, { grain: tx.grainPat });
    sheet(ctx, cut([[-60, 54], [-32, 54], [-32, 57], [-60, 57]], 311), PAL.black);
    const bell = tagged('desk')[0], bj = bell && t >= bell.at ? Math.exp(-(t - bell.at) * 3) * Math.sin((t - bell.at) * 40) : 0;
    ctx.save(); ctx.translate(-40, 54); ctx.rotate(bj * 0.2);
    sheet(ctx, cut([[-2.4, 0], [-1.8, -2.2], [0, -3], [1.8, -2.2], [2.4, 0]], 312), PAL.gold);
    ctx.restore();
    // the lift: doors, and the dial over them
    const liftOpen = Math.max(
      ease(span(t, cues.dameLift[0], cues.dameLift[0] + 0.6)) * (1 - ease(span(t, cues.dameLift[1] - 0.6, cues.dameLift[1]))),
      ease(span(t, cues.lift[0], cues.lift[0] + 0.6)) * (1 - ease(span(t, cues.lift[1] - 0.8, cues.lift[1]))),
    );
    const LX = 30;
    sheet(ctx, cut([[LX - 12, 30], [LX + 12, 30], [LX + 12, 72], [LX - 12, 72]], 320), PAL.black);
    sheet(ctx, [[LX - 10, 32], [LX + 10, 32], [LX + 10, 72], [LX - 10, 72]], '#2a1a14', { edge: 0 });
    const dw = 10 * (1 - liftOpen);
    sheet(ctx, [[LX - 10, 32], [LX - 10 + dw, 32], [LX - 10 + dw, 72], [LX - 10, 72]], PAL.gold, { grain: tx.grainPat, edge: 0.2 });
    sheet(ctx, [[LX + 10 - dw, 32], [LX + 10, 32], [LX + 10, 72], [LX + 10 - dw, 72]], PAL.gold, { grain: tx.grainPat, edge: 0.2 });
    const needleDown = Math.max(
      ease(span(t, cues.dameLift[1], cues.dameLift[1] + 2)) * (1 - ease(span(t, cues.dameLift[1] + 4, cues.dameLift[1] + 7))),
      ease(span(t, cues.lift[1], cues.lift[1] + 1.2)),
    );
    ctx.save(); ctx.translate(LX, 28);
    sheet(ctx, cut([[-7, 0], [-6, -4.5], [0, -6.5], [6, -4.5], [7, 0]], 321), PAL.ochre, { grain: tx.grainPat });
    ctx.rotate(-1.2 + needleDown * 2.4);
    ctx.fillStyle = PAL.ink; ctx.fillRect(-0.25, -5.5, 0.5, 5.5);
    ctx.restore();
    // who is where
    const manX = lerp(-70, -18, ease(span(t, cues.lobby, cues.lobby + 4)));
    const manToLift = span(t, cues.lift[0] - 1, cues.lift[1] - 1.2);
    const mx = manToLift > 0 ? lerp(-18, LX, ease(manToLift)) : manX;
    const moving = (t > cues.lobby && t < cues.lobby + 4) || (manToLift > 0 && manToLift < 1);
    const inLift = t > cues.lift[1] - 1.1;
    // the dame crosses to the lift, and goes down first
    const dX = lerp(-40, LX, ease(span(t, cues.lobby + 1, cues.dameLift[0] + 1)));
    if (t < cues.dameLift[1] - 0.7) {
      const dm = t < cues.dameLift[0] + 1 ? walkPose(beatAt(t), 0.8, 0.5) : { pose: stand.pose, bob: 0 };
      dm.pose.armF = -0.9; dm.pose.foreF = -1.4;
      drawPuppet(ctx, DAME, { x: dX, y: FLOOR - 15.2 - 14 + dm.bob, s: 1, pose: dm.pose, tex: tx, alpha: 1 });
    }
    // the Manager: slides in, blares his theme into the megaphone
    const mIn = ease(span(t, cues.managerIn, cues.managerIn + 1.5));
    if (mIn > 0) {
      const sx = hit('sax', t, 0.25);
      const theme = t >= cues.manager && t < cues.lift[0];
      drawManager(ctx, lerp(100, 55, mIn), 72, 0.72, { arm: theme ? 0.4 + sx * 0.5 : 0.1, sway: theme ? Math.sin(t * 2) * 0.02 : 0, blare: theme ? sx : 0, tex: tx, flip: true });
    }
    if (!inLift) {
      const w = moving ? walkPose(beatAt(t), 1) : { pose: stand.pose, bob: 0 };
      drawPuppet(ctx, MAN, { x: mx, y: FLOOR - 15.2 - 14 + w.bob, pose: w.pose, tex: tx });
    }
    // the doors close over whoever went in
    ctx.restore();
  }

  // ======================================================================== the descent
  function descent(ctx, t, beat, tx) {
    const d0 = cues.descent[0], d1 = cues.descent[1];
    const f = span(t, d0, d1);
    const dist = 60 * f + 140 * f * f;                    // accelerating
    ctx.save();
    ctx.translate(0, 0);
    // the shaft wall scrolls UP past us: we are going down
    ctx.save(); ctx.translate(0, -(dist % 40));
    sheet(ctx, [[-82, -2], [82, -2], [82, 142], [-82, 142]], tx.brickPat, { edge: 0 });
    ctx.restore();
    ctx.fillStyle = 'rgba(10,6,4,0.35)'; ctx.fillRect(-82, -2, 164, 104);
    // the floors going by, each on its bell
    for (const fl of floors) {
      const k = t - fl.at;
      if (k < -1.2 || k > 2.4) continue;
      const y = lerp(110, -20, span(k, -1.2, 2.4));
      sheet(ctx, cut([[-82, y], [82, y], [82, y + 6], [-82, y + 6]], fl.midi), PAL.black, { grain: tx.grainPat });
      sheet(ctx, cut([[-60, y - 9], [-36, y - 9], [-36, y - 1], [-60, y - 1]], fl.midi + 1), PAL.cream, { grain: tx.grainPat });
      ctx.fillStyle = PAL.ink; ctx.font = 'bold 5px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText({ B1: 'B1 · LAUNDRY', B2: 'B2 · WINE', B3: 'B3 · BOILER', '?': '? ? ?' }[fl.label] || fl.label, -48, y - 3);
    }
    // the gears overhead, turning with the cables' ratchet
    const ang = dist * 0.3;
    for (const [gx, gy, r, dir] of [[-20, 6, 9, 1], [-5, 10, 6, -1.5]]) {
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang * dir);
      const teeth = [];
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, rr = k % 2 ? r : r * 0.82; teeth.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      sheet(ctx, teeth, PAL.gold, { grain: tx.grainPat });
      ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, 6.3); ctx.fill();
      ctx.restore();
    }
    // the cage, shaking with the tremolo, and the man inside
    const shake = hit('strings', t, 0.05) * 0.4 + f * 0.6;
    const jx = Math.sin(t * 53) * shake, jy = Math.cos(t * 41) * shake;
    // the club's glow rising from below, as it gets close
    const glow = Math.pow(f, 3);
    if (glow > 0.01) {
      const g = ctx.createLinearGradient(0, 100, 0, 30);
      g.addColorStop(0, `rgba(255,120,60,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = g; ctx.fillRect(-82, 30, 164, 72);
    }
    ctx.save(); ctx.translate(jx - 3.5, jy - 8.4); ctx.scale(1.35, 1.35);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(10, 24); ctx.stroke();
    sheet(ctx, cut([[-4, 24], [24, 24], [24, 72], [-4, 72]], 401), 'rgba(40,28,20,0.9)');
    drawPuppet(ctx, MAN, { x: 10, y: 72 - 15.2, pose: { ...stand.pose, armF: -2.6, foreF: -0.3 }, tex: tx });
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 0.7;
    for (let k = 0; k <= 7; k++) { ctx.beginPath(); ctx.moveTo(-4 + k * 4, 24); ctx.lineTo(-4 + k * 4, 72); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-4, 48); ctx.lineTo(24, 48); ctx.stroke();
    ctx.restore();
    // arrival: the whole theatre jolts
    ctx.restore();
  }

  // ======================================================================== the club
  const shatterAt = cues.raid[0];
  function club(ctx, t, beat, tx, tReal) {
    const jolt = t < cues.arrive + 0.5 ? Math.sin((t - cues.arrive) * 60) * (1 - span(t, cues.arrive, cues.arrive + 0.5)) * 1.2 : 0;
    ctx.save(); ctx.translate(0, jolt);
    const raid = span(tReal, cues.raid[0], cues.raid[1]);
    const shattered = tReal >= shatterAt;
    const dt = Math.max(0, tReal - shatterAt);
    const fly = (seed) => shattered ? { x: hash(seed, 1) * 30 * dt - 15 * dt, y: -18 * dt + 26 * dt * dt, r: (hash(seed, 2) - 0.5) * 10 * dt } : null;
    // the room
    sheet(ctx, [[-82, -2], [82, -2], [82, 72], [-82, 72]], tx.diamondsPat, { edge: 0 });
    sheet(ctx, [[-82, 70], [82, 70], [82, 102], [-82, 102]], '#3a1c16', { grain: tx.grainPat, edge: 0 });
    for (let k = -10; k < 10; k++) sheet(ctx, [[k * 9, 70], [k * 9 + 4.5, 70], [k * 12 + 6, 102], [k * 12, 102]], '#4a2620', { edge: 0 });
    // the sign
    const neonOn = 0.6 + 0.4 * hit('ride', t, 0.3);
    ctx.save(); ctx.translate(-8, 27);
    const sf = fly(701); if (sf) { ctx.translate(sf.x, sf.y); ctx.rotate(sf.r); }
    sheet(ctx, cut([[-26, -6], [26, -6], [26, 4], [-26, 4]], 700), PAL.black);
    ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7fd4ff'; ctx.globalAlpha = neonOn;
    ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 10 * neonOn;
    ctx.fillText('SPEAKEASY', 0, 1.6); ctx.restore();
    // the bar, on the left, with bottles
    sheet(ctx, cut([[-80, 52], [-46, 52], [-46, 72], [-80, 72]], 710), PAL.brown, { grain: tx.grainPat });
    sheet(ctx, cut([[-82, 50], [-44, 50], [-44, 53], [-82, 53]], 711), PAL.black);
    for (let k = 0; k < 6; k++) {
      const c = clinks.filter((e) => t >= e.at && t < e.at + 0.6).length ? Math.sin(t * 30 + k) * 0.2 : 0;
      ctx.save(); ctx.translate(-76 + k * 5, 50);
      const bf = fly(720 + k); if (bf) { ctx.translate(bf.x, bf.y); ctx.rotate(bf.r); }
      ctx.rotate(c);
      sheet(ctx, cut([[-1, 0], [1, 0], [1, -5], [0.4, -6], [0.4, -8], [-0.4, -8], [-0.4, -6], [-1, -5]], 730 + k), [PAL.green, PAL.brick, PAL.ochre][k % 3], { grain: tx.grainPat, edge: 0.2 });
      ctx.restore();
    }
    // the band
    const lights = 1 - 0.75 * span(t, cues.knows, cues.knows + 1) ;
    const bandFly = fly(740);
    ctx.save();
    if (bandFly) { ctx.translate(bandFly.x * 0.5, bandFly.y * 0.4); ctx.rotate(bandFly.r * 0.2); }
    const frozen = t >= cues.knows;
    // a riser: the band plays above the floor
    sheet(ctx, cut([[12, 63], [82, 63], [82, 74], [12, 74]], 745), PAL.deep, { grain: tx.grainPat });
    for (let k = 0; k < 7; k++) { ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(18 + k * 10, 68.5, 1.2, 0, 6.3); ctx.fill(); }
    drawBand(ctx, 43, 63, 0.88, (inst) => frozen ? 0 : hit(inst, t), (inst) => pitchOf(inst, t), tx);
    ctx.restore();
    // the dancers: two couples, the man and the dame in other papers
    const brkHits = tagged('stab').filter((e) => e.at >= cues.brk && e.at < cues.knows);
    const inBreak = t >= cues.brk && t < cues.knows;
    const freeze = inBreak ? (lastBefore(brkHits, t)?.at ?? cues.brk) : null;
    const dancerT = freeze ?? Math.min(t, cues.knows);
    const bt = beatAt(dancerT);
    const couples = [[-28, 0, { torso: PAL.cobalt, skirt: PAL.cobalt }, { torso: PAL.ochre, skirt: PAL.ochre }], [-6, 1.3, { torso: PAL.green, skirt: PAL.green }, { torso: PAL.pink, skirt: PAL.pink }]];
    couples.forEach(([cx, k, colM, colD], i) => {
      const dance = t < cues.knows + 0.3;
      const a = dance ? charleston(bt, k) : { pose: stand.pose, bob: 0 };
      const b = dance ? charleston(bt, k + 1.6) : { pose: stand.pose, bob: 0 };
      const detM = shattered ? detachAll(MAN, 800 + i * 10, dt) : null, detD = shattered ? detachAll(DAME, 820 + i * 10, dt) : null;
      drawPuppet(ctx, MAN, { x: cx, y: FLOOR - 15.2 + a.bob, s: 0.9, pose: a.pose, colors: colM, tex: tx, detach: detM });
      drawPuppet(ctx, DAME, { x: cx + 9, y: FLOOR - 15.2 + b.bob, s: 0.9, flip: true, pose: b.pose, colors: colD, tex: tx, detach: detD });
    });
    // the dame in red, at the bar
    drawPuppet(ctx, DAME, { x: -60, y: FLOOR - 15.2 - 2, s: 1, flip: true, pose: { ...stand.pose, armF: -1.8, foreF: -1.2 }, tex: tx, detach: shattered ? detachAll(DAME, 860, dt) : null });
    // the man in the hat: down the stairs, then watching
    const down = span(t, cues.arrive + 0.3, cues.arrive + 3.5);
    const manX = lerp(-74, -42, down), manY = lerp(58, FLOOR, ease(down));
    const mw = down > 0 && down < 1 ? walkPose(beatAt(t), 0.9) : { pose: stand.pose, bob: 0 };
    const facing = t >= cues.knows ? { ...mw.pose, armF: -1.5 + span(t, cues.knows, cues.shot) * -0.2, foreF: -0.2 } : mw.pose;
    drawPuppet(ctx, MAN, { x: manX, y: manY - 15.2 + mw.bob, pose: facing, tex: tx, detach: shattered ? detachAll(MAN, 880, dt) : null });
    // the Manager comes for him
    const mIn = ease(span(t, cues.knows, cues.knows + 1.8));
    if (mIn > 0) {
      const sx = hit('sax', t, 0.25);
      ctx.save();
      const mf = fly(890); if (mf) { ctx.translate(mf.x * 0.6, mf.y); ctx.rotate(mf.r * 0.4); }
      drawManager(ctx, lerp(100, 28, mIn), 86, 1, { arm: 0.3 + sx * 0.5, blare: t < cues.shot ? sx : 0, tex: tx, flip: true });
      ctx.restore();
    }
    // smoke: paper curls drifting up
    for (let k = 0; k < 7; k++) {
      const ph = ((t * 0.08 + k / 7) % 1);
      const x = -60 + k * 18 + Math.sin(t * 0.7 + k) * 4, y = 70 - ph * 70;
      ctx.globalAlpha = 0.28 * Math.sin(ph * Math.PI);
      ctx.strokeStyle = PAL.cream; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(x, y, 3 + ph * 3, ph * 6, ph * 6 + 4); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // the lights: spotlights on the beat, then one light for two men
    if (t < cues.knows) {
      const pulse = 0.12 + 0.08 * hit('kick', t, 0.2);
      for (const [x, col] of [[-20, '#fff1c0'], [30, '#ffd0a0']]) {
        ctx.globalAlpha = pulse; ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x - 2, -2); ctx.lineTo(x + 2, -2); ctx.lineTo(x + 16, FLOOR); ctx.lineTo(x - 16, FLOOR); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (t < cues.shot) {
      ctx.fillStyle = `rgba(8,4,4,${0.72 * span(t, cues.knows, cues.knows + 1)})`;
      ctx.fillRect(-82, -2, 164, 104);
      ctx.globalCompositeOperation = 'lighter';
      for (const x of [-40, 28]) {
        ctx.globalAlpha = 0.16 * span(t, cues.knows, cues.knows + 1); ctx.fillStyle = '#fff0c8';
        ctx.beginPath(); ctx.moveTo(x - 2, -2); ctx.lineTo(x + 2, -2); ctx.lineTo(x + 14, FLOOR); ctx.lineTo(x - 14, FLOOR); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // the shot: a flash, BANG, and the dark
    if (tReal >= cues.shot && tReal < cues.raid[0]) {
      const k = tReal - cues.shot;
      if (k < 0.12) { ctx.fillStyle = '#fffbe8'; ctx.fillRect(-82, -2, 164, 104); }
      else {
        ctx.fillStyle = PAL.black; ctx.fillRect(-82, -2, 164, 104);
        if (k < 0.9) {
          ctx.save(); ctx.translate(-10, 44); ctx.scale(1 + k * 0.3, 1 + k * 0.3); ctx.rotate(-0.1);
          const star = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, rr = i % 2 ? 26 : 15; star.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.7]); }
          sheet(ctx, cut(star, 991), PAL.gold, { grain: tx.grainPat, edge: 0.6 });
          sheet(ctx, cut(star.map(([a, b]) => [a * 0.7, b * 0.7]), 992), PAL.red, { edge: 0.4 });
          ctx.fillStyle = PAL.cream; ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('BANG!', 0, 4);
          ctx.restore();
        }
      }
    }
    // the raid: police lights, red and blue
    if (raid > 0 && raid < 1) {
      const blue = Math.floor(tReal / 0.4) % 2;
      ctx.fillStyle = blue ? 'rgba(40,80,255,0.28)' : 'rgba(255,30,30,0.28)';
      ctx.fillRect(-82, -2, 164, 104);
    }
    ctx.restore();
  }

  /** Every part of a puppet flying free: the raid shatters the cast into its paper. */
  function detachAll(P, seed, dt) {
    const out = {};
    const walk = (p, i) => {
      out[p.name] = { x: (hash(seed, i, 1) - 0.5) * 34 * dt, y: -22 * dt * hash(seed, i, 2) + 30 * dt * dt, r: (hash(seed, i, 3) - 0.5) * 12 * dt };
      p.children.forEach((c, j) => walk(c, i * 7 + j + 1));
    };
    walk(P, 1);
    return out;
  }

  // ======================================================================== the frame
  function proscenium(ctx, t, tx) {
    // the house curtain: closed for the overture, up at bar 5, down at the end
    const up = ease(span(t, cues.curtainUp[0], cues.curtainUp[1]));
    const down = ease(span(t, cues.curtain[0], cues.curtain[1]));
    const cy = -100 * up * (1 - down);
    if (cy > -100) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-80, 0, 160, 100); ctx.clip();
      ctx.translate(0, cy);
      sheet(ctx, [[-82, -2], [82, -2], [82, 101], [-82, 101]], PAL.red, { grain: tx.grainPat, edge: 0 });
      for (let k = -8; k <= 8; k++) sheet(ctx, cut([[k * 10 - 1.4, 0], [k * 10 + 1.4, 0], [k * 10 + 2 + (k % 2), 100], [k * 10 - 2, 100]], 600 + k), PAL.deep, { edge: 0 });
      sheet(ctx, cut([[-82, 94], [82, 94], [82, 101], [-82, 101]], 620), PAL.gold, { grain: tx.grainPat });
      // FIN, on the curtain
      if (t >= cues.fin) {
        const f = ease(span(t, cues.fin, cues.fin + 0.8));
        ctx.save(); ctx.translate(0, 48); ctx.scale(f, f);
        const med = []; for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; med.push([Math.cos(a) * 16, Math.sin(a) * 16]); }
        sheet(ctx, cut(med, 630), PAL.gold, { grain: tx.grainPat, edge: 0.5 });
        ctx.fillStyle = PAL.ink; ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('FIN', 0, 4);
        ctx.restore();
      }
      ctx.restore();
    }
    // the frame: dark wings, a gold arch, red swags
    const E = 400;
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(-E, -E, E * 2, E - 0.1); ctx.fillRect(-E, 100, E * 2, E); ctx.fillRect(-E, -E, E - 80, E * 2); ctx.fillRect(80, -E, E, E * 2);
    sheet(ctx, cut([[-86, -6], [86, -6], [86, 0], [-86, 0]], 640), PAL.gold, { grain: tx.grainPat });
    sheet(ctx, cut([[-86, -6], [-80, -6], [-80, 104], [-86, 104]], 641), PAL.gold, { grain: tx.grainPat });
    sheet(ctx, cut([[80, -6], [86, -6], [86, 104], [80, 104]], 642), PAL.gold, { grain: tx.grainPat });
    sheet(ctx, cut([[-88, 100], [88, 100], [88, 106], [-88, 106]], 643), PAL.brown, { grain: tx.grainPat });
    for (let k = -8; k < 8; k++) sheet(ctx, cut([[k * 10, 0], [k * 10 + 10, 0], [k * 10 + 5, 6]], 650 + k), PAL.red, { grain: tx.grainPat, edge: 0.2 });
    sheet(ctx, cut([[-80, 0], [-73, 0], [-72, 58], [-80, 70]], 660), PAL.red, { grain: tx.grainPat });
    sheet(ctx, cut([[73, 0], [80, 0], [80, 70], [72, 58]], 661), PAL.red, { grain: tx.grainPat });
  }

  // ======================================================================== the typewriter
  function typewriter(ctx, t, tx) {
    let cur = null;
    for (const l of LINES) if (t >= l.times[0] - 0.05) cur = l;
    if (!cur) return;
    let nch = 0;
    for (let i = 0; i < cur.text.length; i++) if (t >= cur.times[i]) nch = i + 1;
    const fade = 1 - span(t, cur.times.at(-1) + 3.2, cur.times.at(-1) + 4);
    if (fade <= 0) return;
    const text = cur.text.slice(0, nch);
    ctx.save();
    ctx.translate(0, portrait ? -14 : 10);
    ctx.globalAlpha = fade;
    sheet(ctx, cut([[-48, -5], [48, -5], [48, 3.4], [-48, 3.4]], 900), PAL.cream, { grain: tx.grainPat, edge: 0.3 });
    ctx.fillStyle = PAL.ink;
    ctx.font = 'bold 5px "Courier New", Courier, monospace';
    ctx.textAlign = 'right';
    // the carriage: the strike point stays put and the paper moves under it
    const cw = ctx.measureText('M').width;
    ctx.fillText(text, 10 + (nch < cur.text.length ? 0 : 0), 1.2);
    ctx.fillStyle = PAL.brick; ctx.fillRect(10.6, -3.6, 0.5, 5);
    void cw;
    ctx.restore();
  }

  return { draw };
}
