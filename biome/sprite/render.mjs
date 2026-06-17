// biome/sprite/render.mjs — the PHENOTYPE layer: forward kinematics, the procedural animation clips,
// and the canvas renderer. The skeleton (bauplan.mjs) is inert data; this file poses and draws it.
//
// `solve()` and `bbox()` are canvas-free and pure (numbers in, numbers out) so the self-test can
// assert determinism + finiteness with no DOM. `draw()` is the only browser-only function.
//
// The clip is the generalisation of mega/sprite/core.js's walkPose(): instead of one hardcoded
// humanoid gait, a clip is a pure function phase → per-bone angle deltas, chosen per archetype.

const TAU = Math.PI * 2;

// ── ANIMATION CLIPS ────────────────────────────────────────────────────────────────────────────
// A clip returns { angles: {segId: ΔradiansAtThisPhase}, bob: yOffsetUnits }. phase ∈ [0, TAU).
const CLIPS = {
  // Quadruped diagonal-gait walk. Diagonal pairs (front-near + back-far) move together, antiphase to
  // the other diagonal — the trot every tetrapod shares. Knees bend on the lift; the torso bounces at
  // twice stride frequency; head counter-nods to stay level; the tail sways slowly.
  walk(phase) {
    const angles = {};
    // leg tag → phase offset (radians). FN/BF in phase; FF/BN antiphase.
    const legPhase = { FN: 0, BF: 0, FF: Math.PI, BN: Math.PI };
    const swing = 0.5, knee = 0.55;
    for (const tag of ['FN', 'FF', 'BN', 'BF']) {
      const t = phase + legPhase[tag];
      const up = swing * Math.sin(t);                          // hip swings fore/aft
      const lift = 0.5 + 0.5 * Math.sin(t + 1.1);              // 0..1, peaks on forward swing
      const lo = -knee * lift * (tag[0] === 'F' ? 1 : -1);     // front knee & rear hock bend opposite
      const near = tag[1] === 'N' ? 1 : 0.85;                  // far legs swing a touch less
      angles[tag + 'U'] = up * near;
      angles[tag + 'L'] = lo * near;
      angles[tag + 'F'] = -(up + lo) * 0.5 * near;             // foot stays roughly level
    }
    angles.tail = 0.28 * Math.sin(phase * 0.5 + 0.5);
    angles.neck = 0.05 * Math.sin(phase + 0.3);
    angles.head = -0.04 * Math.sin(phase + 0.3);
    return { angles, bob: -1.6 * Math.abs(Math.sin(phase)) };
  },
  // idle: a gentle breathing sway, used as a fallback for any clip we haven't written.
  idle(phase) {
    return { angles: { neck: 0.03 * Math.sin(phase), head: 0.03 * Math.sin(phase) },
             bob: -0.6 * (0.5 + 0.5 * Math.sin(phase)) };
  },
};

const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
const perp = (a) => ({ x: -Math.sin(a), y: Math.cos(a) });  // +90°: for a=0 points +y (down/belly)

// ── FORWARD KINEMATICS ─────────────────────────────────────────────────────────────────────────
// Walk the parent-before-child segment list, composing each bone's world base point + absolute angle
// from its parent. Returns { segId: { base:{x,y}, tip:{x,y}, abs, seg } }. Pure & deterministic.
export function solve(sprite, phase = 0) {
  const clip = CLIPS[sprite.clip] || CLIPS.idle;
  const pose = clip(phase % TAU);
  const A = pose.angles || {};
  const out = {};
  for (const s of sprite.segs) {
    let base, parentAbs;
    if (s.parent == null) {
      base = { x: 0, y: pose.bob || 0 };
      parentAbs = 0;
    } else {
      const p = out[s.parent];
      if (!p) throw new Error(`segment "${s.id}" references parent "${s.parent}" before it is defined`);
      const at = s.at == null ? 1 : s.at;
      const d = dir(p.abs), q = perp(p.abs), off = s.off || 0;
      base = {
        x: p.base.x + d.x * p.seg.len * at + q.x * off,
        y: p.base.y + d.y * p.seg.len * at + q.y * off,
      };
      parentAbs = p.abs;
    }
    const abs = parentAbs + (s.rest || 0) + (A[s.id] || 0);
    const d = dir(abs);
    out[s.id] = { base, tip: { x: base.x + d.x * s.len, y: base.y + d.y * s.len }, abs, seg: s };
  }
  return out;
}

// Axis-aligned bounding box of the posed sprite (accounts for bone widths). Canvas-free — used to
// fit-and-centre on a canvas and to assert "bigger mass ⇒ bigger sprite" in the self-test.
export function bbox(sprite, phase = 0) {
  const W = solve(sprite, phase);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sprite.segs) {
    const w = W[s.id], r = Math.max(s.w0 || 0, s.w1 || 0) / 2;
    for (const p of [w.base, w.tip]) {
      x0 = Math.min(x0, p.x - r); y0 = Math.min(y0, p.y - r);
      x1 = Math.max(x1, p.x + r); y1 = Math.max(y1, p.y + r);
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// ── CANVAS RENDER ──────────────────────────────────────────────────────────────────────────────
function drawShape(ctx, s, w, pal) {
  const col = pal[s.role] || pal.body;
  const cx = (w.base.x + w.tip.x) / 2, cy = (w.base.y + w.tip.y) / 2;
  if (s.shape === 'ellipse') {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(w.abs);
    ctx.beginPath();
    ctx.ellipse(0, 0, s.len / 2, (s.w0 || s.len) / 2, 0, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  } else if (s.shape === 'dot') {
    ctx.beginPath();
    ctx.ellipse(w.base.x, w.base.y, (s.w0 || 2) / 2, (s.w1 || s.w0 || 2) / 2, 0, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
  } else if (s.shape === 'tri') {
    const q = perp(w.abs), hw = (s.w0 || 4) / 2;
    ctx.beginPath();
    ctx.moveTo(w.base.x + q.x * hw, w.base.y + q.y * hw);
    ctx.lineTo(w.base.x - q.x * hw, w.base.y - q.y * hw);
    ctx.lineTo(w.tip.x, w.tip.y);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  } else { // capsule: round-cap stroke from base→tip
    ctx.beginPath();
    ctx.moveTo(w.base.x, w.base.y); ctx.lineTo(w.tip.x, w.tip.y);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, ((s.w0 || 4) + (s.w1 || 4)) / 2);
    ctx.strokeStyle = col; ctx.stroke();
  }
}

// Draw `sprite` at (x,y), auto-fit to `size` px box. facing = 1 (right) or -1 (left).
export function draw(ctx, sprite, phase, { x, y, size = 120, facing = 1, ground = false } = {}) {
  const b = bbox(sprite, 0);                         // fit on the rest pose so it doesn't jitter-scale
  const scale = (size * 0.92) / Math.max(b.w, b.h, 1);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const W = solve(sprite, phase);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  ctx.translate(-cx, -cy);
  if (ground) {                                      // soft contact shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, b.y1 - b.h * 0.02, b.w * 0.42, b.h * 0.06, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
    ctx.restore();
  }
  const order = sprite.segs.map((s) => W[s.id]).sort((a, c) => (a.seg.z || 0) - (c.seg.z || 0));
  for (const w of order) drawShape(ctx, w.seg, w, sprite.meta.palette);
  ctx.restore();
}

export default { solve, bbox, draw, CLIPS };
