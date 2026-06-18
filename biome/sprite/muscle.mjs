// biome/sprite/muscle.mjs — the muscle MODEL + candidate generation (the "knowing how muscles work"
// and "generate possible muscles" halves of the muscular-system solver).
//
// A muscle spans from an attachment on one bone to an attachment on another, crossing ≥1 joint. The
// physics that matters (mechanics.mjs consumes it):
//   • muscles only PULL (tension ≥ 0) — the master constraint; it forces antagonist pairs.
//   • torque about a joint = force × MOMENT ARM (perpendicular distance from the joint to the muscle's
//     line of action). Attachments are offset to a side (`d`) so the moment arm is non-zero — exactly
//     why real tendons stand off the bone (kneecap, olecranon).
//   • force capacity ∝ cross-section; muscle COST ∝ force × length ∝ volume → the right answer is the
//     least-volume set that holds.
//
// An attachment is { bone, t, d }: a point on `bone`, fraction t∈[0,1] along it, offset d perpendicular
// (+/- = the two sides). Everything is pure geometry over a solved pose (render.mjs solve()).

// world position of an attachment, given a solved pose W
export function attachPos(W, att) {
  const w = W[att.bone];
  const bx = w.base.x, by = w.base.y, dx = w.tip.x - bx, dy = w.tip.y - by;
  const L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L; // unit perpendicular
  return { x: bx + dx * att.t + px * att.d, y: by + dy * att.t + py * att.d };
}

// signed moment arm of the muscle line (pA→pB) about joint point j: the perpendicular distance from j
// to the line. Sign encodes which side — the grower uses it to pick the agonist vs antagonist.
export function momentArm(pA, pB, j) {
  const ux = pB.x - pA.x, uy = pB.y - pA.y, L = Math.hypot(ux, uy) || 1;
  const nx = ux / L, ny = uy / L;
  return (j.x - pA.x) * ny - (j.y - pA.y) * nx;
}

export function muscleLength(W, m) {
  const a = attachPos(W, m.a), b = attachPos(W, m.b);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// muscle volume ∝ force capacity × length (PCSA × length). The growth objective minimises Σ volume.
export function muscleVolume(W, m) { return m.fmax * muscleLength(W, m); }

// Generate candidate muscles for a joint (the segment `seg`, whose base is the joint between its parent
// and itself). Candidates attach on the parent (origin, near the joint) and on seg (insertion, near the
// joint), offset to one side for a moment arm. Both sides are generated; the grower keeps what it needs.
// Degenerate candidates (moment arm too small, i.e. tunnelling along the bone) are killed here.
export function candidatesForJoint(W, seg, scale) {
  const parent = seg.parent;
  if (!parent) return [];
  const j = W[seg.id].base;
  const standoffs = [0.12, 0.20, 0.30].map((f) => f * scale); // tendon offsets — the largest rescues folded joints (rabbit)
  const rmin = 0.025 * scale;                                 // kill near-zero moment arms
  const out = [];
  for (const side of [+1, -1]) {
    for (const so of standoffs) {
      for (const to of [0.55, 0.8]) {          // origin: along the parent, toward the joint
        for (const ti of [0.12, 0.3]) {        // insertion: along the child, near the joint
          const a = { bone: parent, t: to, d: side * so };
          const b = { bone: seg.id, t: ti, d: side * so };
          const r = momentArm(attachPos(W, a), attachPos(W, b), j);
          if (Math.abs(r) < rmin) continue;    // killed: no usable lever
          out.push({ a, b, joint: seg.id, side, r });
        }
      }
    }
  }
  return out;
}

// Which actuated joints a muscle between two bones crosses — the joints on the tree-path between them
// (up from each attachment to their lowest common ancestor, excluding the LCA's own joint). Used by the
// construction interface so a hand-drawn muscle torques exactly the joints it spans.
export function crossedJoints(sprite, aBone, bBone, actuatedSet) {
  const par = {}; for (const s of sprite.segs) par[s.id] = s.parent;
  const up = (x) => { const a = []; let c = x; while (c) { a.push(c); c = par[c]; } return a; };
  const A = up(aBone), B = up(bBone), Bset = new Set(B);
  const lca = A.find((x) => Bset.has(x));
  const toLca = (arr) => { const o = []; for (const x of arr) { if (x === lca) break; o.push(x); } return o; };
  const segs = new Set([...toLca(A), ...toLca(B)]);
  return [...segs].filter((id) => actuatedSet.has(id));
}

export default { attachPos, momentArm, muscleLength, muscleVolume, candidatesForJoint, crossedJoints };
