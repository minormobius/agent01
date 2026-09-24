// cast.js — the company: the man in the hat, the dame in red, the Manager, the band.
//
// All of them paper, pinned at the joints. The man and the dame share a
// skeleton (hips → legs → shins → shoes; torso → arms → forearms → hands;
// head → hat); dancers in the club are the same two puppets in other papers.
// The Manager is after Picasso's American Manager in Parade: a man built of
// flats, with the skyscrapers of the city on his back and a megaphone.

import { PAL, part, at, sheet, cut, drawPuppet, path } from './stage.js';

const thigh = [[-1.7, 0], [1.7, 0], [1.3, 8.2], [-1.3, 8.2]];
const shin = [[-1.25, 0], [1.25, 0], [1, 7.1], [-1, 7.1]];
const shoe = [[-1.3, -0.6], [3.4, -0.4], [3.6, 0.9], [-1.3, 0.9]];
const upper = [[-1, -0.4], [1, -0.4], [0.9, 6.2], [-0.9, 6.2]];
const fore = [[-0.9, 0], [0.9, 0], [0.75, 5.6], [-0.75, 5.6]];
const hand = [[-0.9, 0], [0.9, 0], [1.2, 1.4], [0, 2.2], [-1, 1.4]];

// ---- the man in the hat --------------------------------------------------------------
const coatTop = [[-4.4, -12.4], [4.2, -12.4], [4.4, 0.4], [-4.2, 0.4]];
const coatSkirt = [[-4.3, -0.5], [4.5, -0.5], [5.6, 9.8], [-5.2, 9.6]];
const face = [[-1.8, 0.2], [1.6, 0.2], [2.2, -2.4], [3.6, -3.6], [2.4, -4.4], [2.6, -6.8], [-2.2, -7.2], [-2.8, -3.6]];
const hat = [[-4.4, 0], [5.4, 0], [5.4, 0.9], [-4.4, 0.9]];
const crown = [[-2.8, 0.1], [3.1, 0.1], [2.7, -3.4], [-2.3, -3.6]];

const eye = (ctx) => {           // a cubist eye: a black diamond, too big, facing us
  ctx.fillStyle = PAL.ink;
  ctx.beginPath(); ctx.moveTo(0.4, -4.6); ctx.lineTo(1.6, -4); ctx.lineTo(0.4, -3.4); ctx.lineTo(-0.8, -4); ctx.closePath(); ctx.fill();
};
const lapels = (ctx) => {
  ctx.fillStyle = '#b08852';
  ctx.beginPath(); ctx.moveTo(-1, -12.3); ctx.lineTo(3.2, -12.3); ctx.lineTo(1.2, -5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAL.ink; ctx.fillRect(-4.3, -3.2, 8.7, 1.1);                       // the belt
  ctx.fillStyle = PAL.ochre; ctx.fillRect(0.8, -3.3, 1.4, 1.3);
};

export const MAN = part('hips', [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1]], null, [
  at(0, 0, part('legB', thigh, '#2d2f38', [at(0, 8, part('shinB', shin, '#2d2f38', [at(0, 7, part('shoeB', shoe, PAL.black))]))], { back: true })),
  at(0, 0, part('legF', thigh, '#3c3f4c', [at(0, 8, part('shinF', shin, '#3c3f4c', [at(0, 7, part('shoeF', shoe, PAL.black))]))])),
  at(0, 0, part('torso', coatTop, PAL.tan, [
    at(0, 0, part('skirt', coatSkirt, PAL.tan)),
    at(2.8, -11, part('armB', upper, '#a8844f', [at(0, 6, part('foreB', fore, '#a8844f', [at(0, 5.5, part('handB', hand, PAL.cream))]))], { back: true })),
    at(0.2, -12.2, part('head', face, PAL.cream, [at(0, -6.8, part('hat', hat, PAL.black, [at(0, 0, part('crown', crown, PAL.black, [], { deco: (c) => { c.fillStyle = PAL.ochre; c.fillRect(-2.6, -1.2, 5.6, 0.9); } }))]))], { deco: eye })),
    at(-0.8, -11, part('armF', upper, PAL.tan, [at(0, 6, part('foreF', fore, PAL.tan, [at(0, 5.5, part('handF', hand, PAL.cream))]))], { pin: true })),
  ], { deco: lapels })),
]);

// ---- the dame in red -------------------------------------------------------------------
const bodice = [[-3, -12], [3.2, -12], [2.6, -4.4], [-2.4, -4.4]];
const skirt = [[-2.6, -4.6], [2.8, -4.6], [5.6, 9], [-5, 9.2]];
const legD = [[-0.9, 0], [0.9, 0], [0.8, 8.2], [-0.8, 8.2]];
const shinD = [[-0.8, 0], [0.8, 0], [0.6, 7], [-0.6, 7]];
const heel = [[-0.6, -0.4], [2.8, 0.2], [2.9, 0.9], [-0.2, 0.9], [-0.5, 1.8], [-0.9, 1.8]];
const faceD = [[-1.5, 0.2], [1.4, 0.2], [2, -2.2], [2.9, -3.2], [2, -4], [2.2, -6.4], [-1.8, -6.8], [-2.4, -3.4]];
const bob = [[-3.6, -2], [-2.8, -7.6], [2.6, -7.8], [3.2, -5.4], [0.8, -5.6], [-0.2, -2.6], [-1.2, -0.4], [-3.6, -0.4]];

const facets = (ctx) => {
  ctx.fillStyle = 'rgba(122,31,26,0.55)';
  ctx.beginPath(); ctx.moveTo(-2.4, -4.4); ctx.lineTo(1, -4.4); ctx.lineTo(-3.8, 8.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,190,170,0.25)';
  ctx.beginPath(); ctx.moveTo(2.6, -4.4); ctx.lineTo(4.8, 8.6); ctx.lineTo(2, 8.8); ctx.closePath(); ctx.fill();
};
const damehead = (ctx) => {
  path(ctx, bob); ctx.fillStyle = PAL.black; ctx.fill();
  ctx.fillStyle = PAL.red; ctx.beginPath(); ctx.arc(1.9, -1.6, 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.ink;
  ctx.beginPath(); ctx.moveTo(0.5, -4.4); ctx.lineTo(1.7, -3.9); ctx.lineTo(0.5, -3.4); ctx.lineTo(-0.6, -3.9); ctx.closePath(); ctx.fill();
};
const holder = (ctx, pose) => {                      // the cigarette holder, and its smoke
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.moveTo(0, 1.4); ctx.lineTo(4.8, -1.2); ctx.stroke();
  ctx.fillStyle = PAL.cream; ctx.fillRect(4.6, -1.5, 0.9, 0.5);
};

export const DAME = part('hips', [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1]], null, [
  at(0, 0, part('legB', legD, '#d9b8a0', [at(0, 8, part('shinB', shinD, '#d9b8a0', [at(0, 7, part('shoeB', heel, PAL.deep))]))], { back: true })),
  at(0, 0, part('legF', legD, PAL.pink, [at(0, 8, part('shinF', shinD, PAL.pink, [at(0, 7, part('shoeF', heel, PAL.red))]))])),
  at(0, 0, part('torso', bodice, PAL.red, [
    at(0, 0, part('skirt', skirt, PAL.red, [], { deco: facets })),
    at(2.4, -11, part('armB', upper, PAL.black, [at(0, 6, part('foreB', fore, PAL.black, [at(0, 5.5, part('handB', hand, PAL.black))]))], { back: true })),
    at(0.2, -12, part('head', faceD, PAL.cream, [], { deco: damehead })),
    at(-0.6, -11, part('armF', upper, PAL.pink, [at(0, 6, part('foreF', fore, PAL.black, [at(0, 5.5, part('handF', hand, PAL.black, [], { deco: holder }))]))], { pin: true })),
  ])),
]);

/** A walk: phase in beats (a step each beat), stride 0..1. */
export function walkPose(phase, stride = 1, arms = 1) {
  const a = Math.PI * phase;              // one full leg cycle every two beats
  const s = Math.sin(a), c = Math.cos(a);
  return {
    pose: {
      legF: 0.42 * s * stride, shinF: Math.max(0, -Math.cos(a + 0.6)) * 0.55 * stride,
      legB: -0.42 * s * stride, shinB: Math.max(0, Math.cos(a + 0.6)) * 0.55 * stride,
      shoeF: -0.2 * s * stride, shoeB: 0.2 * s * stride,
      armF: -0.35 * s * arms, foreF: -0.3 - 0.15 * s * arms, armB: 0.35 * s * arms, foreB: -0.3 + 0.15 * s * arms,
      torso: 0.04 * stride, head: -0.03,
    },
    bob: -Math.abs(c) * 0.7 * stride,
  };
}
export const stand = { pose: { foreF: -0.2, foreB: -0.15, armF: 0.05, armB: -0.05 }, bob: 0 };

/** A Charleston: knees in, heels out, on every beat. */
export function charleston(phase, k = 0) {
  const a = Math.PI * phase;
  const s = Math.sin(a * 2 + k);
  return {
    pose: {
      legF: 0.5 * Math.sin(a + k), shinF: 0.9 * Math.max(0, s), legB: -0.3 * Math.sin(a + k), shinB: 0.9 * Math.max(0, -s),
      armF: -1.6 + 0.7 * Math.sin(a * 2 + k), foreF: -0.8, armB: 1.4 - 0.6 * Math.sin(a * 2 + k), foreB: -0.9,
      torso: 0.12 * Math.sin(a + k), head: -0.1 * Math.sin(a + k),
    },
    bob: -Math.abs(Math.sin(a * 2 + k)) * 1.2,
  };
}

// ---- the Manager -------------------------------------------------------------------------
// Drawn as flats, not a skeleton: he does not walk, he LOOMS. `arm` raises the
// megaphone; `blare` (0..1) throws its lines.
export function drawManager(ctx, x, y, s, { arm = 0, sway = 0, blare = 0, tex, flip = false }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  ctx.rotate(sway);
  const sh = (poly, fill, grain = true, edge = 0.35) => {
    ctx.save(); ctx.translate(0.6, 0.8); path(ctx, poly); ctx.fillStyle = 'rgba(20,12,8,0.25)'; ctx.fill(); ctx.restore();
    sheet(ctx, poly, fill, { grain: grain ? tex.grainPat : null, edge });
  };
  // the skyscrapers on his back
  const towers = [[-13, -64, 6, 30, '#9aa3ad'], [-6, -72, 7, 40, PAL.cream], [3, -60, 6, 28, '#7d8ea3'], [9, -66, 5, 30, PAL.cream]];
  towers.forEach(([tx, ty, tw, th, col], i) => {
    const poly = cut([[tx, ty], [tx + tw, ty - (i % 2 ? 2 : 0)], [tx + tw, ty + th], [tx, ty + th]], 40 + i);
    sh(poly, i === 1 ? tex.newsPat : col);
    ctx.fillStyle = PAL.ink;
    for (let wy = ty + 3; wy < ty + th - 2; wy += 2.6) for (let wx = tx + 1; wx < tx + tw - 1.2; wx += 1.8) ctx.fillRect(wx, wy, 0.8, 1.2);
  });
  // legs: two black stilts
  sh(cut([[-6, -16], [-2.5, -16], [-3.2, 0], [-6.4, 0]], 50), PAL.black);
  sh(cut([[1.5, -16], [5, -16], [5.6, 0], [2.4, 0]], 51), PAL.black);
  sh(cut([[-7.8, -1.2], [-2.2, -1.2], [-2.2, 0.8], [-8.4, 0.8]], 52), PAL.black);
  sh(cut([[1.6, -1.2], [7.6, -1.2], [8.2, 0.8], [1.6, 0.8]], 53), PAL.black);
  // the body: tailcoat planes, a shirt front, an ochre waistcoat set at an angle
  sh(cut([[-11, -42], [10, -44], [12, -14], [-12, -12]], 54), PAL.black);
  sh(cut([[-4, -42], [4, -42], [2, -18], [-3, -18]], 55), PAL.cream);
  sh(cut([[-3, -34], [5, -36], [6, -20], [-4, -18]], 56), PAL.ochre);
  sh(cut([[-12, -30], [-4, -32], [-6, -14], [-13, -12]], 57), tex.newsPat);
  ctx.fillStyle = PAL.ink; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(1, -32 + k * 3.6, 0.5, 0, 6.3); ctx.fill(); }
  // the head: a mask, a pipe, a stovepipe hat
  sh(cut([[-4.5, -52], [4, -53], [5, -43], [-4, -42]], 58), PAL.cream);
  ctx.fillStyle = PAL.ink; ctx.fillRect(-3, -49.5, 3, 0.8); ctx.fillRect(1, -50, 2.6, 1.3);
  ctx.beginPath(); ctx.moveTo(1, -45); ctx.lineTo(7, -44); ctx.lineTo(7.5, -46.5); ctx.lineTo(8.8, -46.5); ctx.lineTo(8.6, -43); ctx.lineTo(1, -44); ctx.closePath(); ctx.fill();
  sh(cut([[-6, -53], [6, -53.5], [6, -52], [-6, -51.6]], 59), PAL.black);
  sh(cut([[-3.8, -53], [3.6, -53.2], [3.2, -62], [-3.4, -61.6]], 60), PAL.black);
  // the far arm, and the near one with the megaphone
  ctx.save(); ctx.translate(9, -40); ctx.rotate(-0.2 - arm * 1.3);
  sh(cut([[-1.6, 0], [1.6, 0], [1.2, 14], [-1.2, 14]], 61), PAL.black);
  ctx.translate(0, 14); ctx.rotate(-0.9);
  sh(cut([[-1.4, 0], [1.4, 0], [5, 9], [-5, 9]], 62), PAL.ochre);
  if (blare > 0.02) {
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.5; ctx.globalAlpha = blare;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 12, 4 + k * 3 + blare * 2, 0.4, Math.PI - 0.4); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.restore();
}

// ---- the band: five players, each moved by their own notes ---------------------------------
// hit(inst) is 0..1: how recently that instrument sounded (1 = this instant).
export function drawBand(ctx, x, y, s, hit, pitch, tex) {
  const P = (poly, fill, seed) => sheet(ctx, cut(poly, seed), fill, { grain: tex.grainPat });
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // the bandstand
  P([[-34, 0], [34, 0], [36, 4], [-36, 4]], PAL.brown, 70);
  ctx.fillStyle = PAL.gold; ctx.fillRect(-36, 0.4, 72, 0.6);
  const player = (px, body, head, hatC, lean = 0) => {
    ctx.save(); ctx.translate(px, 0); ctx.rotate(lean);
    P([[-3.2, -18], [3.2, -18], [3.8, 0], [-3.8, 0]], body, px * 7 + 1);
    P([[-2, -24], [2.2, -24], [2.6, -18.4], [-2, -18.2]], PAL.cream, px * 7 + 2);
    P([[-3, -24.2], [3.4, -24.2], [3.4, -23.3], [-3, -23.3]], hatC, px * 7 + 3);
    P([[-1.8, -24], [2.2, -24], [1.8, -27], [-1.4, -27.2]], hatC, px * 7 + 4);
    ctx.restore();
  };
  // piano, far left
  const pk = hit('piano');
  P([[-33, -14], [-19, -14], [-19, 0], [-33, 0]], PAL.black, 80);
  ctx.fillStyle = PAL.cream; ctx.fillRect(-32, -9.5, 12, 1.6);
  ctx.fillStyle = PAL.ink; for (let k = 0; k < 12; k++) ctx.fillRect(-31.6 + k, -9.5, 0.4, 1);
  player(-16, PAL.slate, 0, PAL.black, -0.08);
  ctx.save(); ctx.translate(-18.5, -12 - pk * 1.2); P([[-2, 0], [0, 0], [0, 1], [-2, 1]], PAL.cream, 81); ctx.restore();
  // bass
  const bk = hit('bass');
  ctx.save(); ctx.translate(-5, 0); ctx.rotate(-0.12 + bk * 0.02);
  P([[-3.5, -6], [-2.6, -14], [-3.4, -17], [0, -19], [3.4, -17], [2.6, -14], [3.5, -6], [2.6, -1], [-2.6, -1]], '#8a4b2a', 82);
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -2); ctx.stroke();
  P([[-0.6, -30], [0.6, -30], [0.6, -19], [-0.6, -19]], PAL.black, 83);
  ctx.restore();
  player(-9, PAL.navy, 0, PAL.black, 0.05);
  ctx.save(); ctx.translate(-5.5, -10 + bk * 1.5); ctx.rotate(bk * 0.5); P([[0, 0], [2.5, 0], [2.5, 1], [0, 1]], PAL.cream, 84); ctx.restore();
  // drums, centre
  const sn = hit('snare'), rd = hit('ride'), kk = hit('kick');
  player(4, PAL.green, 0, PAL.black);
  ctx.save(); ctx.translate(4, -6);
  const kd = 7 + kk * 0.5;
  sheet(ctx, cut([[-kd, 0], [0, -kd], [kd, 0], [0, kd]].map(([a, b], i) => [Math.cos(i * Math.PI / 2) * kd, Math.sin(i * Math.PI / 2) * kd]), 85), PAL.cream, { grain: tex.grainPat });
  ctx.beginPath(); ctx.arc(0, 0, kd, 0, 6.3); ctx.fillStyle = PAL.cream; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = PAL.red; ctx.stroke();
  ctx.fillStyle = PAL.red; ctx.font = 'bold 3.2px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('JAZZ', 0, 1);
  ctx.restore();
  ctx.save(); ctx.translate(11, -17); ctx.rotate(-0.15 + rd * 0.2);
  ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.ellipse(0, 0, 5, 1.1, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.25; ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(-2 + sn * 2, -9 - sn * 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(10 - rd * 1, -16 - rd * 2); ctx.stroke();
  // sax
  const sx = hit('sax'), sp = pitch('sax');
  player(17, PAL.brick, 0, PAL.black, -0.05 - sx * 0.08);
  ctx.save(); ctx.translate(19.5, -16); ctx.rotate(0.35 - sp * 0.5 - sx * 0.1);
  P([[0, 0], [1.2, 0], [1.6, 9], [4.2, 11.5], [4.6, 9.2], [5.8, 9.4], [5.4, 13], [2.2, 12.6], [0, 9.4]], PAL.gold, 86);
  if (sx > 0.05) { ctx.globalAlpha = sx; ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(5.4, 9.2, 1.6 + sx, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
  // trumpet
  const tr = hit('trumpet'), tp = pitch('trumpet');
  player(29, PAL.cobalt, 0, PAL.black, -tr * 0.06);
  ctx.save(); ctx.translate(31, -20.5); ctx.rotate(-0.1 - tp * 0.5 - tr * 0.1);
  P([[0, -0.4], [7, -0.5], [9.5, -2.2], [9.6, 1.6], [7, 0.5], [0, 0.4]], PAL.gold, 87);
  if (tr > 0.05) { ctx.globalAlpha = tr; ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(9.6, -0.3, 1.8 + tr, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
  ctx.restore();
}

export { drawPuppet };
