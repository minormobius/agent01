// foam/dungeon-plan.mjs — THE top-down plan renderer, shared by every page
// (generator ⊞ plan + baked .png/.dd2vtt images, the content builder's live
// preview). One implementation so the line grammar stays coherent:
//
//   LINES ARE MADE OF TILES: rubble walls and tripwires read as runs of
//   FILLED tiles (slate + hatching = closed; ember red = trap), laid along
//   lattice directions by the content roller — not strokes around tiles.
//   Dashes survive only where a thing is genuinely hidden: secret-room
//   walls and trapdoor mouths. Hatches wear solid rims + ▲.
//
// Browser + node-canvas compatible (pure 2D context calls). Callers own the
// transform: k = px per metre, (ox, oz) = world coords of the canvas origin.

export const PATH_COLORS = ['#ff9e6e', '#9ff0e6', '#c8a5ff', '#ffd166', '#8fd3ff', '#ffa5c0'];

import { roomOutlines } from './dungeon-export.mjs';
import { ENEMY_TYPES } from './dungeon-content.mjs';

// drawPlan(ctx, { dungeon, content, showContent = true, k, ox, oz, w, h })
export function drawPlan(ctx, o) {
  const { dungeon, content, k, ox, oz } = o;
  const showContent = o.showContent !== false;
  const mx = (x) => (x - ox) * k, mz = (z) => (z - oz) * k;
  ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, o.w, o.h);
  const s = dungeon.tileSize;
  let y0 = Infinity, y1 = -Infinity;
  for (const r of dungeon.rooms) for (const t of r.tiles) { y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
  const tilePath = (t, inset = 1) => {
    ctx.beginPath();
    if (t.poly) {
      const f = 0.96 * inset;
      t.poly.forEach(([px, pz], i) => {
        const x = mx(t.x + (px - t.x) * f), z = mz(t.z + (pz - t.z) * f);
        i ? ctx.lineTo(x, z) : ctx.moveTo(x, z);
      });
    } else if (dungeon.tileShape === 'hex') {
      const R = (s / Math.sqrt(3)) * k * 0.96 * inset;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        const px = mx(t.x) + R * Math.cos(a), pz = mz(t.z) + R * Math.sin(a);
        i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz);
      }
    } else {
      const hs = s * 0.48 * k * inset;
      ctx.rect(mx(t.x) - hs, mz(t.z) - hs, hs * 2, hs * 2);
    }
    ctx.closePath();
  };

  // -- tiles
  for (const r of dungeon.rooms) {
    for (const t of r.tiles) {
      const h = y1 - y0 > 1e-6 ? (t.y - y0) / (y1 - y0) : 0.5;
      if (t.kind === 'door') ctx.fillStyle = '#ffce78';
      else if (t.kind === 'entrance') ctx.fillStyle = '#b8ff9e';
      else if (t.kind === 'goal') ctx.fillStyle = PATH_COLORS[r.endpointIndex % PATH_COLORS.length];
      else if (t.kind === 'trapdoor') ctx.fillStyle = '#0a1418';
      else if (t.kind === 'hatch') ctx.fillStyle = '#2a5f5a';
      else if (r.secret) ctx.fillStyle = 'hsl(210 30% ' + (14 + h * 20).toFixed(0) + '%)';
      // confluence: each party's ground takes its own approach colour, so
      // three descents that never meet read apart on one sheet
      else if (dungeon.confluence && r.side >= 0) {
        const pc = PATH_COLORS[r.side % PATH_COLORS.length];
        ctx.fillStyle = pc;
        ctx.globalAlpha = 0.20 + h * 0.30;
      }
      // twin: side 1 wears violet so the two interleaved dungeons read apart
      else if (r.side === 1) ctx.fillStyle = 'hsl(265 32% ' + (18 + h * 26).toFixed(0) + '%)';
      else ctx.fillStyle = 'hsl(190 40% ' + (16 + h * 28).toFixed(0) + '%)';
      tilePath(t); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(4,6,10,.65)'; ctx.lineWidth = Math.max(0.5, k * 0.02);
      ctx.stroke();
    }
  }

  // -- walls (secret rooms wear dashed blue)
  ctx.lineJoin = 'round';
  for (const r of dungeon.rooms) {
    ctx.save();
    ctx.strokeStyle = r.secret ? 'rgba(143,160,255,.9)' : 'rgba(127,216,208,.85)';
    ctx.lineWidth = Math.max(r.secret ? 1.6 : 1, k * (r.secret ? 0.1 : 0.07));
    if (r.secret) ctx.setLineDash([Math.max(4, k * 0.2), Math.max(3, k * 0.12)]);
    for (const loop of (r._outlines ??= roomOutlines(dungeon, r))) {
      ctx.beginPath();
      loop.forEach(([x, z], i) => i ? ctx.lineTo(mx(x), mz(z)) : ctx.moveTo(mx(x), mz(z)));
      ctx.stroke();
    }
    ctx.restore();
  }

  // -- paths
  dungeon.paths.forEach((p, pi) => {
    ctx.strokeStyle = PATH_COLORS[pi % PATH_COLORS.length];
    ctx.lineWidth = Math.max(1.2, k * 0.06); ctx.globalAlpha = 0.85;
    ctx.beginPath();
    const c0 = dungeon.roomOf.get(p.rooms[0]).centroid;
    ctx.moveTo(mx(c0[0]), mz(c0[2]));
    for (let i = 0; i < p.doors.length; i++) {
      const at = p.doors[i].at, c = dungeon.roomOf.get(p.rooms[i + 1]).centroid;
      ctx.lineTo(mx(at[0]), mz(at[2])); ctx.lineTo(mx(c[0]), mz(c[2]));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  });

  // -- entrance ring(s) — a twin document has two
  const e = dungeon.roomOf.get(dungeon.entrance).centroid;
  ctx.strokeStyle = '#b8ff9e'; ctx.lineWidth = Math.max(1.5, k * 0.08);
  ctx.beginPath(); ctx.arc(mx(e[0]), mz(e[2]), Math.max(4, s * 0.5 * k), 0, Math.PI * 2); ctx.stroke();
  if (dungeon.confluence) {
    // every party's mouth wears its own ring; the shared chamber a halo
    dungeon.confluence.entrances.forEach((ni, i) => {
      const c = dungeon.roomOf.get(ni).centroid;
      ctx.strokeStyle = PATH_COLORS[i % PATH_COLORS.length];
      ctx.beginPath(); ctx.arc(mx(c[0]), mz(c[2]), Math.max(4, s * 0.5 * k), 0, Math.PI * 2); ctx.stroke();
    });
    const cc = dungeon.roomOf.get(dungeon.confluence.chamber).centroid;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, k * 0.07);
    for (const rr of [0.55, 0.95]) {
      ctx.beginPath(); ctx.arc(mx(cc[0]), mz(cc[2]), Math.max(5, s * rr * k), 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (dungeon.twin) {
    const e2 = dungeon.roomOf.get(dungeon.twin.entrances[1]).centroid;
    ctx.strokeStyle = '#d9b8ff';
    ctx.beginPath(); ctx.arc(mx(e2[0]), mz(e2[2]), Math.max(4, s * 0.5 * k), 0, Math.PI * 2); ctx.stroke();

    // -- seams: the sealed membranes where the twins touch. Passable seams
    //    (certified crossings that will never open) wear a solid bright
    //    diamond — the windows; mere shared walls a faint dotted one.
    for (const sm of dungeon.twin.seams) {
      const x = mx(sm.at[0]), z = mz(sm.at[2]);
      const g = Math.max(4, s * 0.3 * k);
      ctx.save();
      ctx.strokeStyle = sm.passable ? '#ff9ef2' : 'rgba(255,158,242,.4)';
      ctx.lineWidth = Math.max(1.5, k * 0.08);
      if (!sm.passable) ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, z - g); ctx.lineTo(x + g, z); ctx.lineTo(x, z + g); ctx.lineTo(x - g, z);
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }

  // -- passage mouths: drawn LAST so the grammar sits on top of everything
  for (const r of dungeon.rooms) {
    for (const t of r.tiles) {
      if (t.kind !== 'trapdoor' && t.kind !== 'hatch') continue;
      ctx.save();
      ctx.strokeStyle = '#5fd8cb'; ctx.lineWidth = Math.max(2, k * 0.11);
      if (t.kind === 'trapdoor') ctx.setLineDash([Math.max(3, k * 0.14), Math.max(3, k * 0.12)]);
      tilePath(t, 0.9); ctx.stroke();
      ctx.restore();
      const g = Math.max(4, s * 0.22 * k);
      ctx.fillStyle = '#8ff2e6';
      ctx.beginPath();
      if (t.kind === 'trapdoor') { ctx.moveTo(mx(t.x) - g, mz(t.z) - g * 0.7); ctx.lineTo(mx(t.x) + g, mz(t.z) - g * 0.7); ctx.lineTo(mx(t.x), mz(t.z) + g); }
      else { ctx.moveTo(mx(t.x) - g, mz(t.z) + g * 0.7); ctx.lineTo(mx(t.x) + g, mz(t.z) + g * 0.7); ctx.lineTo(mx(t.x), mz(t.z) - g); }
      ctx.closePath(); ctx.fill();
    }
  }

  // -- content, in the line grammar, on top
  if (content && showContent) {
    const tileOf = (rec) => dungeon.roomOf.get(rec.room)?.tiles.find((t) => t.key === rec.tile) ?? null;
    const r0 = Math.max(3.5, s * 0.22 * k);
    for (const rec of content.effects) {
      const t = tileOf(rec); if (!t) continue;
      const x = mx(t.x), z = mz(t.z);
      if (rec.type === 'obstacle') {
        // a rubble tile: solid slate fill with diagonal hatching — runs of
        // these read as WALLS
        ctx.fillStyle = '#37444c';
        tilePath(t); ctx.fill();
        ctx.save();
        tilePath(t); ctx.clip();
        ctx.strokeStyle = '#5d707a'; ctx.lineWidth = Math.max(1.2, k * 0.06);
        const hspan = s * k * 0.6, step = Math.max(3, s * k * 0.22);
        ctx.beginPath();
        for (let o2 = -hspan; o2 <= hspan; o2 += step) {
          ctx.moveTo(x + o2 - hspan, z - hspan); ctx.lineTo(x + o2 + hspan, z + hspan);
        }
        ctx.stroke();
        ctx.restore();
      } else if (rec.type === 'trap') {
        // a trap tile: ember fill — runs of these read as TRIPWIRES
        ctx.fillStyle = '#571f1a';
        tilePath(t); ctx.fill();
        ctx.strokeStyle = '#ff8a76'; ctx.lineWidth = Math.max(1.2, k * 0.06);
        ctx.beginPath(); ctx.moveTo(x, z - r0); ctx.lineTo(x + r0, z + r0 * 0.8); ctx.lineTo(x - r0, z + r0 * 0.8);
        ctx.closePath(); ctx.stroke();
      } else {
        const big = rec.type === 'treasure';
        const rr = r0 * (big ? 1.4 : 1);
        ctx.fillStyle = big ? '#ffdf9e' : '#d8a94e';
        ctx.beginPath(); ctx.moveTo(x, z - rr); ctx.lineTo(x + rr, z); ctx.lineTo(x, z + rr); ctx.lineTo(x - rr, z);
        ctx.closePath(); ctx.fill();
        if (big) { ctx.strokeStyle = '#ffdf9e'; ctx.lineWidth = Math.max(1.4, k * 0.06); ctx.beginPath(); ctx.arc(x, z, rr * 1.6, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
    for (const a of content.agents) {
      const t = tileOf(a); if (!t) continue;
      ctx.fillStyle = ENEMY_TYPES[a.type].color;
      ctx.strokeStyle = 'rgba(4,6,10,.85)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mx(t.x), mz(t.z), r0 * 0.95, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}
