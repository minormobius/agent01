// sheet.js — the model sheet: the figure as an animator's reference page.
//
// Rows of panels, each one figure in one pose from one angle, drawn by the
// renderer and dressed with the construction a figure-drawing teacher would
// pencil over it: head-unit lines, the ground, and — for the walk — every
// planted foot's pivot, so a skating foot shows as a smear of dots.

import { makeRig, solve } from './rig.js';
import { buildBody } from './body.js';
import { walk } from './gait.js';
import { POSES } from './poses.js';
import { makeRenderer, camera, project, STYLE, handDetail } from './shader.js';
import { add, apply, scale, norm } from './vec.js';

const TAU = Math.PI * 2;

export const DEFAULT_SHEET = {
  title: 'mannequin',
  rows: [
    { label: 'turnaround', panels: [0, 45, 90, 135, 180].map((d) => ({ pose: 'stand', yaw: (d * Math.PI) / 180, label: ['front', '¾', 'side', '¾ back', 'back'][d / 45] })) },
    { label: 'walk · one cycle, side', walk: 8, yaw: Math.PI / 2 },
    { label: 'poses', panels: [
      { pose: 'contrapposto', yaw: 0.35 }, { pose: 'handOnHip', yaw: -0.4 }, { pose: 'reachUp', yaw: 0.5 },
      { pose: 'crouch', yaw: 0.7, pitch: 0.15 }, { pose: 'run', yaw: 1.2 }, { pose: 'sit', yaw: 0.9 }, { pose: 'lookBack', yaw: 2.4 },
    ] },
  ],
};

export function renderSheet(canvas, spec, sheet = DEFAULT_SHEET, { panelH = 440, style = STYLE, skeleton = false } = {}) {
  const rig = makeRig(spec);
  const Hh = rig.m.H;
  // one scale for the whole sheet, tall enough for the highest reach in it
  let topY = Hh;
  for (const row of sheet.rows) for (const pn of row.panels || []) {
    if (!pn.pose) continue;
    const P = solve(rig, POSES[pn.pose](rig));
    for (const j of Object.values(P.J)) topY = Math.max(topY, j[1] + 0.25);
  }
  const view = topY * 1.08;                        // world units shown per panel height
  const unit = panelH / view;                      // pixels per head
  const panelW = Math.round(unit * Math.max(3.6, Hh * 0.64));
  const top = 64, rowGap = 36;
  const rows = sheet.rows.map((row) => {
    if (row.walk) {
      const n = row.walk;
      return { ...row, panels: Array.from({ length: n }, (_, i) => ({ walkT: i / n, yaw: row.yaw, label: `${Math.round((i / n) * 100)}%` })) };
    }
    return row;
  });
  const cols = Math.max(...rows.map((r) => r.panels.length));
  canvas.width = cols * panelW + 80; canvas.height = top + rows.length * (panelH + rowGap) + 20;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = style.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.ink; ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
  const S = rig.spec;
  ctx.fillText(`${sheet.title} — ${S.heads} heads · build ${S.build} · legs ${S.legs} · mass ${S.mass}`, 24, 38);

  const gl = document.createElement('canvas'); gl.width = panelW; gl.height = panelH;
  const R = makeRenderer(gl);
  const stats = { panels: [], ms: 0 };
  const t0 = performance.now();

  rows.forEach((row, ri) => {
    const y0 = top + ri * (panelH + rowGap);
    ctx.fillStyle = style.ink; ctx.globalAlpha = 0.6; ctx.font = '500 13px ui-monospace, monospace';
    ctx.fillText(row.label.toUpperCase(), 24, y0 + 14); ctx.globalAlpha = 1;
    let cycle = null;
    row.panels.forEach((pn, ci) => {
      let pose, feet = null, target;
      if (pn.walkT !== undefined) {
        if (!cycle) cycle = walk(rig, 0).cycle;
        const t = pn.walkT * cycle;
        const w = walk(rig, t);
        pose = w.pose; feet = w.feet;
      } else pose = POSES[pn.pose](rig);
      const P = solve(rig, pose);
      target = [0, view / 2 - 0.35, 0];
      if (pn.walkT !== undefined) target = [0, view / 2 - 0.35, P.J.pelvis[2]];
      const cam = camera({ target, yaw: pn.yaw ?? row.yaw ?? 0, pitch: pn.pitch ?? 0, height: view, aspect: panelW / panelH });
      const prims = buildBody(P, { hands: handDetail(P, cam, panelH) });
      R.draw(prims, P, cam, style);
      const x0 = 40 + ci * panelW;
      // construction: head lines, the ground
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, panelW, panelH); ctx.clip();
      ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 1;
      for (let h = 0; h <= Math.ceil(Hh); h++) {
        const [, py] = project(cam, [target[0], h, target[2]], panelW, panelH);
        ctx.globalAlpha = h === 0 ? 0 : 0.35; ctx.beginPath(); ctx.moveTo(x0, y0 + py); ctx.lineTo(x0 + panelW, y0 + py); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const [, gy] = project(cam, [target[0], 0, target[2]], panelW, panelH);
      ctx.strokeStyle = style.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + gy); ctx.lineTo(x0 + panelW - 6, y0 + gy); ctx.stroke();
      if (pose.seat !== undefined) {
        const a = project(cam, [-0.9, pose.seat, -1.1], panelW, panelH), b = project(cam, [0.9, pose.seat, 0.35], panelW, panelH);
        ctx.fillStyle = 'rgba(120,110,100,0.25)'; ctx.fillRect(x0 + Math.min(a[0], b[0]), y0 + a[1], Math.abs(b[0] - a[0]), gy - a[1]);
      }
      ctx.restore();
      ctx.drawImage(gl, x0, y0);
      if (skeleton) drawSkeleton(ctx, P, cam, x0, y0, panelW, panelH);
      if (feet) for (const [s, f] of Object.entries(feet)) if (f.contact) {
        const [px, py] = project(cam, f.point, panelW, panelH);
        ctx.fillStyle = s === 'l' ? '#d2412f' : '#2f6fd2';
        ctx.beginPath(); ctx.arc(x0 + px, y0 + py, 4, 0, TAU); ctx.fill();
      }
      if (pn.label || pn.pose) {
        ctx.fillStyle = style.ink; ctx.globalAlpha = 0.55; ctx.font = '500 12px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText(pn.label || pn.pose, x0 + panelW / 2, y0 + panelH + 16); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
      stats.panels.push({ row: ri, col: ci, pose: pn.pose || `walk@${pn.walkT}`, unreached: P.report.unreached });
    });
  });
  R.gl.finish();
  stats.ms = Math.round(performance.now() - t0);
  return stats;
}

function drawSkeleton(ctx, P, cam, x0, y0, W, H) {
  const J = P.J;
  const bones = [['pelvis', 'waist'], ['waist', 'chest'], ['chest', 'neck'], ['neck', 'headPivot'], ['headPivot', 'crown'],
    ...['l', 'r'].flatMap((s) => [['neck', `shoulder_${s}`], [`shoulder_${s}`, `elbow_${s}`], [`elbow_${s}`, `wrist_${s}`], [`wrist_${s}`, `fingers_${s}`],
      ['pelvis', `hip_${s}`], [`hip_${s}`, `knee_${s}`], [`knee_${s}`, `ankle_${s}`], [`heel_${s}`, `ball_${s}`], [`ball_${s}`, `toe_${s}`], [`ankle_${s}`, `heel_${s}`]])];
  ctx.strokeStyle = '#1a8f5a'; ctx.lineWidth = 1.5; ctx.fillStyle = '#1a8f5a';
  for (const [a, b] of bones) {
    const p = project(cam, J[a], W, H), q = project(cam, J[b], W, H);
    ctx.beginPath(); ctx.moveTo(x0 + p[0], y0 + p[1]); ctx.lineTo(x0 + q[0], y0 + q[1]); ctx.stroke();
  }
  for (const k of Object.keys(J)) { const p = project(cam, J[k], W, H); ctx.beginPath(); ctx.arc(x0 + p[0], y0 + p[1], 2.2, 0, TAU); ctx.fill(); }
}

/** Several figures side by side, heads the same size: the proportions compared. */
export function renderLineup(canvas, specs, { panelH = 520, style = STYLE, yaws = [0, 0.6], names = [], pose = 'stand' } = {}) {
  const rigs = specs.map((sp) => makeRig(sp));
  const tallest = Math.max(...rigs.map((r) => r.m.H));
  const view = tallest * 1.1, unit = panelH / view;
  const widths = rigs.map((r) => Math.round(unit * Math.max(pose === 'stand' ? 2.4 : 3.4, r.m.shoulderHalf * 2 + 1.6)));
  const top = 56;
  canvas.width = 40 + yaws.length * widths.reduce((a, b) => a + b, 0) + 20; canvas.height = top + panelH + 60;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = style.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.ink; ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif'; ctx.fillText('lineup — one head is one head', 24, 36);
  const gl = document.createElement('canvas');
  let x = 40;
  // head-unit lines across the whole lineup
  ctx.strokeStyle = '#9fb3c8'; ctx.globalAlpha = 0.35;
  for (let h = 1; h <= Math.ceil(tallest); h++) { const y = top + panelH - (h + 0.35) * unit + 0.35 * unit - (panelH - (view / 2 + 0.35) * unit) * 0; }
  ctx.globalAlpha = 1;
  for (const yaw of yaws) rigs.forEach((rig, i) => {
    const W = widths[i];
    gl.width = W; gl.height = panelH;
    const R = makeRenderer(gl);
    const P = solve(rig, POSES[specs[i].pose || pose](rig));
    const cam = camera({ target: [0, view / 2 - 0.35, 0], yaw, height: view, aspect: W / panelH });
    R.draw(buildBody(P, { hands: handDetail(P, cam, panelH) }), P, cam, style);
    ctx.save(); ctx.strokeStyle = '#9fb3c8'; ctx.globalAlpha = 0.35;
    for (let h = 1; h <= Math.ceil(tallest); h++) { const [, py] = project(cam, [0, h, 0], W, panelH); ctx.beginPath(); ctx.moveTo(x, top + py); ctx.lineTo(x + W, top + py); ctx.stroke(); }
    ctx.restore();
    const [, gy] = project(cam, [0, 0, 0], W, panelH);
    ctx.strokeStyle = style.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 4, top + gy); ctx.lineTo(x + W - 4, top + gy); ctx.stroke();
    ctx.drawImage(gl, x, top);
    ctx.fillStyle = style.ink; ctx.globalAlpha = 0.6; ctx.font = '500 12px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(names[i] || `${rig.m.H} heads`, x + W / 2, top + panelH + 22); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    x += W;
  });
}

// ---- the face sheet ------------------------------------------------------------------
import { EXPRESSIONS } from './face.js';

export const CAST = [
  { name: 'tsurime · thin brows', face: { eyes: 'tsurime', brows: 'thin', irisColor: 'red', lashes: 'heavy', extras: ['mole'] } },
  { name: 'tareme · blush', face: { eyes: 'tareme', brows: 'arched', irisColor: 'green', extras: ['blush'] } },
  { name: 'round · cat mouth', face: { eyes: 'round', brows: 'thin', mouth: 'cat', irisColor: 'amber', extras: ['blush'] } },
  { name: 'narrow · thick brows', face: { eyes: 'narrow', brows: 'thick', irisColor: 'blue', mouth: 'wide', nose: 'dot' } },
  { name: 'jito-me · fang', face: { eyes: 'jitome', brows: 'straight', mouth: 'fang', irisColor: 'violet' } },
];

/** Close-ups of the head: the turn, the expressions, and a cast of identities. */
export function renderFaceSheet(canvas, spec, { panelH = 300, style = STYLE } = {}) {
  const baseSpec = { ...spec, face: spec.face || {} };
  const rows = [
    { label: 'turn · neutral', panels: [0, 30, 60, 90, 135].map((d) => ({ yaw: (d * Math.PI) / 180, label: `${d}°` })).concat([{ yaw: 0.35, head: { pitch: -0.35 }, label: 'looks up' }, { yaw: 0.35, head: { pitch: 0.3 }, label: 'looks down' }]) },
    { label: 'expressions', panels: Object.keys(EXPRESSIONS).map((e) => ({ yaw: 0.3, expression: e, label: e })) },
    { label: 'cast · identity from predicates', panels: CAST.map((c) => ({ yaw: 0.35, spec: { ...spec, face: c.face }, expression: 'smile', label: c.name })) },
  ];
  const panelW = Math.round(panelH * 0.8);
  const top = 60, gap = 34;
  const cols = Math.max(...rows.map((r) => r.panels.length));
  canvas.width = 40 + cols * panelW; canvas.height = top + rows.length * (panelH + gap) + 10;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = style.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.ink; ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('faces — identity × expression', 24, 38);
  const gl = document.createElement('canvas'); gl.width = panelW; gl.height = panelH;
  const R = makeRenderer(gl);
  const stats = { panels: [] };
  rows.forEach((row, ri) => {
    const y0 = top + ri * (panelH + gap);
    ctx.fillStyle = style.ink; ctx.globalAlpha = 0.6; ctx.font = '500 13px ui-monospace, monospace';
    ctx.fillText(row.label.toUpperCase(), 24, y0 + 12); ctx.globalAlpha = 1;
    row.panels.forEach((pn, ci) => {
      const rig = makeRig(pn.spec || baseSpec);
      const pose = { ...POSES.stand(rig), expression: pn.expression || 'neutral', head: pn.head || {} };
      const P = solve(rig, pose);
      const hc = add(P.J.headPivot, apply(P.F.head, [0, 0.32, 0]));
      const cam = camera({ target: hc, yaw: pn.yaw, pitch: 0.05, height: 1.55, aspect: panelW / panelH });
      R.draw(buildBody(P), P, cam, style);
      ctx.drawImage(gl, 40 + ci * panelW, y0 + 16);
      ctx.fillStyle = style.ink; ctx.globalAlpha = 0.55; ctx.font = '500 12px ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText(pn.label, 40 + ci * panelW + panelW / 2, y0 + panelH + 26); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      stats.panels.push({ row: ri, col: ci, label: pn.label });
    });
  });
  return stats;
}

// ---- the hand sheet --------------------------------------------------------------------
import { GESTURES } from './hand.js';

/**
 * Every gesture close up, from the back of the hand, the palm and the thumb's side,
 * then placed hands resting on the body (the fingers lie on what they rest on).
 */
export function renderHandSheet(canvas, spec, { panelH = 220, style = STYLE } = {}) {
  const names = Object.keys(GESTURES);
  const views = [['back', (A) => A.y], ['palm', (A) => scale(A.y, -1)], ['thumb side', (A) => A.r], ['drawn small · blocks (the back, as a full figure shows it)', (A) => A.y, 'block']];
  const panelW = panelH, top = 60, gap = 34;
  const rows = views.length + 1;
  canvas.width = 40 + names.length * panelW; canvas.height = top + rows * (panelH + gap) + 10;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = style.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.ink; ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('hands — gestures, solved', 24, 38);
  const gl = document.createElement('canvas'); gl.width = panelW; gl.height = panelH;
  const R = makeRenderer(gl);
  const rig = makeRig({ ...spec, outfit: undefined });
  const label = (t, x, y) => { ctx.fillStyle = style.ink; ctx.globalAlpha = 0.55; ctx.font = '500 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(t, x, y); ctx.textAlign = 'left'; ctx.globalAlpha = 1; };
  const rowLabel = (t, y) => { ctx.fillStyle = style.ink; ctx.globalAlpha = 0.6; ctx.font = '500 13px ui-monospace, monospace'; ctx.fillText(t.toUpperCase(), 24, y); ctx.globalAlpha = 1; };
  const shoot = (P, target, dir, h, x, y, hands = 'full') => {
    const d = norm(dir), pitch = Math.asin(Math.max(-0.95, Math.min(0.95, d[1]))), yaw = Math.atan2(d[0], d[2]);
    const cam = camera({ target, yaw, pitch, height: h, aspect: 1 });
    R.draw(buildBody(P, { hands }), P, cam, style);
    ctx.drawImage(gl, x, y);
  };
  views.forEach(([vn, dirOf, detail], ri) => {
    const y0 = top + ri * (panelH + gap);
    rowLabel(vn, y0 + 12);
    names.forEach((g, ci) => {
      const base = POSES.stand(rig);
      const P = solve(rig, { ...base, arms: { ...base.arms, l: { raise: 1.25, out: 0.25, elbow: 1.35, gesture: g } } });
      const HF = P.F.hand_l, h = rig.m.hand, A = { y: HF.y, r: scale(HF.x, -1) };
      const target = add(P.J.wrist_l, scale(HF.z, 0.5 * h));
      shoot(P, target, dirOf(A), 1.5 * h, 40 + ci * panelW, y0 + 16, detail);
      label(g, 40 + ci * panelW + panelW / 2, y0 + panelH + 26);
    });
  });
  // placed: the fingers rest on the hip, and on the knees
  const y0 = top + views.length * (panelH + gap);
  rowLabel('placed · resting on the body', y0 + 12);
  const placed = [['handOnHip', 'l', 0.9], ['crouch', 'l', 0.5], ['crouch', 'r', -0.5], ['sit', 'l', 0.4]];
  placed.forEach(([pose, s, yaw], ci) => {
    const P = solve(rig, POSES[pose](rig));
    const target = add(P.J[`wrist_${s}`], scale(P.F[`hand_${s}`].z, 0.5 * rig.m.hand));
    shoot(P, target, [Math.sin(yaw), 0.35, Math.cos(yaw)], 2.2 * rig.m.hand, 40 + ci * panelW, y0 + 16);
    label(`${pose} ${s}`, 40 + ci * panelW + panelW / 2, y0 + panelH + 26);
  });
  return { panels: [] };
}
