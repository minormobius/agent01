// chamber.js — MAKE A CHAMBER: generate one room from a single cell of the 3D pancake foam.
//
// A chamber is a voronoi cell of the weave. To turn it into a ROOM we honour the rind's structural rule —
// "edges are structure, plates are not; doors/stairs are openings in PLATES and must never cut a structural
// EDGE." So:
//   • WALLS are the cell's voronoi edges (the load path). We compute the local cell footprint from the
//     in-plane neighbours (half-plane clipping, the foam.js method).
//   • DOORS are gaps cut in the MIDDLE of a shared wall — framed by the structural columns at the cell
//     corners, never reaching them. One per in-plane neighbour ⇒ the floor stays navigable AND load-bearing.
//   • a STAIR is a hatch in the FLOOR plate down/up to the OTHER-layer partner. In this weave that partner is
//     always the OTHER system (over=white ⇄ under=production), so the stair IS the white×production facility —
//     the K(6,8) contact made architectural. EXCEPT the two centre hubs: they get NO stair, so the white hub
//     and production hub stay disconnected (you can only reach one from the other out through the weave).
//   • a FIXTURE sits at the centre: an ops console (white), a process machine (production step), or the hub.
//
// Pure, deterministic from (foam, index). Node-tested.

// keep points closer to the cell centre than to neighbour (a,b,c = the perpendicular bisector half-plane)
function clip(poly, a, b, c) {
  const out = []; let cut = false; const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c;
    const ip = dp <= 1e-9, iq = dq <= 1e-9;
    if (ip) out.push(p);
    if (ip !== iq) { const t = dp / (dp - dq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); cut = true; }
  }
  return { poly: out, cut };
}

const ownerLabel = (m, q) => {
  const o = q.owner;
  if (o.kind === 'warp') return { kind: 'white', idx: o.idx, label: m.warps[o.idx].label };
  if (o.kind === 'weft') return { kind: 'prod', idx: o.idx, label: m.wefts[o.idx].label, glyph: m.wefts[o.idx].glyph, color: m.wefts[o.idx].color };
  if (o.kind === 'whub') return { kind: 'whub', label: 'white hub' };
  return { kind: 'phub', label: 'production hub' };
};

function fixtureFor(m, n) {
  const o = n.owner;
  if (o.kind === 'whub') return { type: 'hub', glyph: '△', label: 'White hub — all 6 ops surfaces meet here' };
  if (o.kind === 'phub') return { type: 'hub', glyph: '▽', label: 'Production hub — all 8 lines meet here' };
  if (o.kind === 'warp') return { type: 'office', glyph: '▣', label: m.warps[o.idx].label + ' — ops console' };
  const e = m.wefts[o.idx], steps = e.steps || [];
  const st = steps.length ? steps[Math.min(steps.length - 1, Math.floor(n.rf * steps.length))] : null;
  return { type: 'process', glyph: st ? st.glyph : e.glyph, label: e.label + (st ? ' · ' + st.name : ''), color: e.color };
}

export function buildChamber(m, i) {
  const n = m.nuclei[i];
  const same = n.neighbors.map((j) => m.nuclei[j]).filter((q) => q.iz === n.iz);     // in-plane (this floor)
  const vert = n.neighbors.map((j) => m.nuclei[j]).find((q) => q.iz !== n.iz) || null; // the other-layer partner
  const loc = (q) => [q.rad - n.rad, n.rad * m.swrap(q.th - n.th)];                  // local metres (radial, arc)
  const radSp = m.R / m.Nrad, azSp = Math.max(10, n.rad * 2 * Math.PI / m.Nth), half = Math.max(radSp, azSp) * 1.7;

  let poly = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const cand = [];
  for (const q of same) { const [u, v] = loc(q); const res = clip(poly, u, v, (u * u + v * v) / 2); poly = res.poly; if (res.cut) cand.push({ q, u, v }); }

  // doors: the wall segment lying on each neighbour's bisector → a centred gap (columns at the corners survive)
  const doors = [];
  for (const { q, u, v } of cand) {
    const L = Math.hypot(u, v) || 1, c = (u * u + v * v) / 2;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if (Math.abs(u * a[0] + v * a[1] - c) / L < 1.5 && Math.abs(u * b[0] + v * b[1] - c) / L < 1.5) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len > 6) doors.push({ to: ownerLabel(m, q), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], width: Math.min(len * 0.6, 28) });
        break;
      }
    }
  }
  // stair to the other-layer partner — the facility — but NOT between the two hubs (they stay disconnected)
  const stair = (vert && !n.hub && !vert.hub) ? { to: ownerLabel(m, vert), dir: vert.over ? 'up' : 'down', facility: ownerLabel(m, n).kind !== ownerLabel(m, vert).kind } : null;

  return {
    i, owner: n.owner, layer: n.over ? 'upper' : 'lower', hub: n.hub || null,
    arm: ownerLabel(m, n), rf: n.rf, poly, doors, stair, fixture: fixtureFor(m, n),
    neighbours: { inPlane: same.length, vertical: vert ? 1 : 0 },
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindChamber = { buildChamber };
