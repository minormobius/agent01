// biome/sprite/render.mjs — the PHENOTYPE layer: forward kinematics, procedural animation clips, and
// the canvas renderer. The skeleton (skeleton.mjs) is inert data; this file poses and draws it.
//
// As of the osteology rebuild the thing being drawn is a LITERAL articulated skeleton — bones with
// epiphyses, a vertebral column with neural spines, scapula/pelvis blades, a ribcage, a skull. The
// rig and the subject are now the same object: the clip animates real joints. `solve()`/`bbox()` are
// canvas-free & pure so the contract is sandbox-testable; `draw()` is the only browser-only function.
//
// The clip is the generalisation of mega/sprite/core.js's walkPose(): one pure function phase→per-bone
// angle deltas, dispatched by the bone's own (leg, joint) tags so it works for any skeleton topology.

const TAU = Math.PI * 2;
const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
const perp = (a) => ({ x: -Math.sin(a), y: Math.cos(a) }); // +90°: for a=0 points +y (down)

// ── ANIMATION CLIPS ────────────────────────────────────────────────────────────────────────────
// A clip returns { angles: {segId: ΔradiansAtThisPhase}, bob: yOffsetUnits }. It reads the skeleton's
// own tags — seg.leg ∈ {FN,FF,BN,BF} and seg.joint ∈ {upper,mid,lower,foot} — so it is independent of
// how many bones a limb is built from.
const CLIPS = {
  // Quadruped diagonal-gait walk: diagonal pairs (front-near + back-far) swing together, antiphase to
  // the other diagonal — the trot every tetrapod shares. Distal joints lag & flex on the lift; the
  // lumbar spine flexes slightly; the tail sways; the trunk bounces at twice stride frequency.
  walk(phase, sprite) {
    const angles = {};
    const legPhase = { FN: 0, BF: 0, FF: Math.PI, BN: Math.PI };
    const swing = 0.30, flex = 0.42;
    for (const s of sprite.segs) {
      if (s.leg) {
        const t = phase + (legPhase[s.leg] ?? 0);
        const near = s.leg[1] === 'N' ? 1 : 0.85;
        const front = s.leg[0] === 'F' ? 1 : -1;
        const lift = 0.5 + 0.5 * Math.sin(t + 1.1);
        if (s.joint === 'upper') angles[s.id] = swing * Math.sin(t) * near;
        else if (s.joint === 'mid') angles[s.id] = -flex * lift * front * near * 0.8;
        else if (s.joint === 'lower') angles[s.id] = -flex * lift * front * near;
        else if (s.joint === 'foot') angles[s.id] = flex * lift * front * near * 0.7;
      } else if (s.role === 'caudal') {
        angles[s.id] = 0.06 * Math.sin(phase * 0.5 + 0.4); // tail wave accumulates down the chain
      } else if (s.role === 'lumbar') {
        angles[s.id] = 0.02 * Math.sin(phase * 2 + 0.6);
      } else if (s.role === 'cervical') {
        angles[s.id] = 0.012 * Math.sin(phase + 0.3);
      }
    }
    return { angles, bob: -1.4 * Math.abs(Math.sin(phase)) };
  },
  // a gentle breathing stand; fallback for any clip we haven't written.
  idle(phase, sprite) {
    const angles = {};
    for (const s of sprite.segs) {
      if (s.role === 'cervical') angles[s.id] = 0.01 * Math.sin(phase);
      if (s.role === 'caudal') angles[s.id] = 0.03 * Math.sin(phase * 0.6);
    }
    return { angles, bob: -0.5 * (0.5 + 0.5 * Math.sin(phase)) };
  },
};

// ── FORWARD KINEMATICS ─────────────────────────────────────────────────────────────────────────
// Walk the parent-before-child segment list, composing each bone's world base + absolute angle from
// its parent. Returns { segId: { base, tip, abs, seg } }. Pure & deterministic.
export function solve(sprite, phase = 0) {
  const clip = CLIPS[sprite.clip] || CLIPS.idle;
  const pose = clip(phase % TAU, sprite);
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

// Axis-aligned bounding box of the posed skeleton (accounts for bone widths & dorsal neural spines).
export function bbox(sprite, phase = 0) {
  const W = solve(sprite, phase);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sprite.segs) {
    const w = W[s.id];
    const r = Math.max(s.w0 || 0, s.w1 || 0, s.spine || 0, s.epi || 0) / 2 + (s.spine || 0);
    for (const p of [w.base, w.tip]) {
      x0 = Math.min(x0, p.x - r); y0 = Math.min(y0, p.y - r);
      x1 = Math.max(x1, p.x + r); y1 = Math.max(y1, p.y + r);
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// ── BONE DRAWING ─────────────────────────────────────────────────────────────────────────────────
// One small vocabulary of osteological primitives. Each is a pure function of a solved segment.
function emit(ctx, kind, w, s, pal) {
  const col = pal[s.role && pal[s.role] ? s.role : 'bone'] || pal.bone;
  const b = w.base, t = w.tip, q = perp(w.abs);
  const thick = (k) => Math.max(0.8, ((s.w0 || 2) * (1 - k) + (s.w1 || 2) * k));
  if (kind === 'bone' || kind === 'rib' || kind === 'digit') {
    const curve = s.curve || 0;                                   // perpendicular bow of the shaft
    const mx = (b.x + t.x) / 2 + q.x * curve * s.len, my = (b.y + t.y) / 2 + q.y * curve * s.len;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(mx, my, t.x, t.y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = (s.w0 + s.w1) / 2 || 2; ctx.strokeStyle = col; ctx.stroke();
    const e = s.epi == null ? Math.max(thick(0), thick(1)) * 0.85 : s.epi;  // epiphyses (joint knobs)
    if (e > 0) { for (const p of [b, t]) { ctx.beginPath(); ctx.ellipse(p.x, p.y, e, e, 0, 0, TAU);
      ctx.fillStyle = pal.joint || col; ctx.fill(); } }
  } else if (kind === 'vertebra') {
    // centrum along the spine axis + a dorsal neural spine standing up from it
    ctx.beginPath(); ctx.ellipse((b.x+t.x)/2, (b.y+t.y)/2, s.len/2*1.1, (s.w0||3)/2, w.abs, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
    const sp = s.spine || 0;
    if (sp > 0.3) { const up = { x: -q.x, y: -q.y };          // dorsal = up (−perp)
      ctx.beginPath(); ctx.moveTo(b.x - q.x*(s.w0||3)*0.2, b.y - q.y*(s.w0||3)*0.2);
      ctx.lineTo(b.x + up.x*sp, b.y + up.y*sp);
      ctx.lineWidth = Math.max(1, (s.w0||3)*0.5); ctx.strokeStyle = col; ctx.lineCap='round'; ctx.stroke(); }
  } else if (kind === 'blade') {
    // scapula / pelvis: a flat tapered paddle from base (wide) to tip (narrow)
    const w0 = (s.w0 || 6) / 2;
    ctx.beginPath();
    ctx.moveTo(b.x + q.x * w0, b.y + q.y * w0);
    ctx.lineTo(b.x - q.x * w0, b.y - q.y * w0);
    ctx.lineTo(t.x, t.y); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  } else if (kind === 'skull') {
    // cranium (ellipse) + snout wedge; the split is set by the family's snout ratio so a cat gets a
    // short round skull and a horse a long one. cf = cranium fraction of total skull length.
    const sf = Math.max(0.25, Math.min(0.66, s.snout || 0.45)), cf = 1 - sf;
    const dd = dir(w.abs), cr = (s.w0 || 8);
    const cx = b.x + dd.x * s.len * cf * 0.5, cy = b.y + dd.y * s.len * cf * 0.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, s.len * cf * 0.55, cr / 2, w.abs, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
    const fx = b.x + dd.x * s.len * cf, fy = b.y + dd.y * s.len * cf, sw = (s.w1 || cr * 0.5) / 2;
    ctx.beginPath();
    ctx.moveTo(fx + q.x * cr * 0.4, fy + q.y * cr * 0.4);
    ctx.lineTo(fx - q.x * cr * 0.4, fy - q.y * cr * 0.4);
    ctx.lineTo(t.x - q.x * sw, t.y - q.y * sw);
    ctx.lineTo(t.x + q.x * sw, t.y + q.y * sw);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + dd.x*cr*0.1 - q.x*cr*0.2, cy + dd.y*cr*0.1 - q.y*cr*0.2,
      cr * 0.17, cr * 0.17, 0, 0, TAU); ctx.fillStyle = pal.socket || '#0006'; ctx.fill();
  } else if (kind === 'hoof' || kind === 'claw') {
    const len = s.len, wd = (s.w0 || 4);
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(b.x + dir(w.abs).x*len + q.x*wd*0.3, b.y + dir(w.abs).y*len + q.y*wd*0.3, t.x, t.y);
    ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.strokeStyle = pal.keratin || col; ctx.stroke();
  }
}

function drawShape(ctx, s, w, pal) {
  emit(ctx, s.shape || 'bone', w, s, pal);
}

// Draw `sprite` at (x,y), auto-fit to `size` px box. facing = 1 (right) or -1 (left).
export function draw(ctx, sprite, phase, { x, y, size = 120, facing = 1, ground = false } = {}) {
  const b = bbox(sprite, 0);
  const scale = (size * 0.92) / Math.max(b.w, b.h, 1);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const W = solve(sprite, phase);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  ctx.translate(-cx, -cy);
  ctx.lineWidth = 1;
  if (ground) {
    ctx.save(); ctx.beginPath();
    ctx.ellipse(cx, b.y1 - b.h * 0.02, b.w * 0.42, b.h * 0.05, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); ctx.restore();
  }
  const order = sprite.segs.map((s) => W[s.id]).sort((a, c) => (a.seg.z || 0) - (c.seg.z || 0));
  for (const w of order) drawShape(ctx, w.seg, w, sprite.meta.palette);
  ctx.restore();
}

export default { solve, bbox, draw, CLIPS };
