// craft/ascii.mjs — a top-down text view of any craft world, any tiling.
//
// Each character cell samples the column under its centre (columnLocator),
// so a Penrose floor shows as Penrose-shaped glyph patches. Characters are
// ~2:1 tall, so z is sampled at twice the x step. This is the headless
// "render" — for a terminal, a log, a test failure — not the one Jev reads:
// Jev never sees the map, only perceive.mjs's facts about it.

import { B, H } from './world.mjs';
import { columnLocator } from './tiling.mjs';

const GLYPH = {
  [B.grass]: '.', [B.dirt]: ':', [B.sand]: '_', [B.water]: '~', [B.stone]: '#', [B.bedrock]: 'X',
  [B.log]: 'O', [B.leaves]: '*', [B.coal_ore]: 'c', [B.iron_ore]: 'r', [B.planks]: '=',
  [B.cobblestone]: '%', [B.crafting_table]: '+', [B.furnace]: 'F', [B.torch]: 'i',
};
const ENT = { player: '@', zombie: 'Z', pig: 'p' };

const locators = new WeakMap();

// src: anything with { world, ents } and blocks at world.blocks (a Sim or a Replay)
export function renderAscii(src, { cx, cz, w = 72, h = 28, step = 0.5 } = {}) {
  const world = src.world, cols = world.tiling.cols, b = world.blocks;
  if (!locators.has(world)) locators.set(world, columnLocator(world.tiling));
  const at = locators.get(world);
  const byCol = new Map();
  for (const e of src.ents.values()) {
    const prev = byCol.get(e.c);
    if (!prev || e.kind === 'player' || (e.kind === 'zombie' && prev.kind === 'pig')) byCol.set(e.c, e);
  }
  if (cx == null) { const p = [...src.ents.values()].find((e) => e.kind === 'player'); cx = cols[p.c].x; cz = cols[p.c].z; }
  const rows = [];
  for (let j = 0; j < h; j++) {
    let row = '';
    for (let i = 0; i < w; i++) {
      // nudged off the lattice: a sample exactly on a shared edge is in neither tile
      const x = cx + (i - w / 2) * step + 0.0137, z = cz + (j - h / 2) * step * 2 + 0.0091;
      const c = at(x, z);
      if (c < 0) { row += ' '; continue; }
      const e = byCol.get(c);
      if (e) { row += ENT[e.kind] || '?'; continue; }
      let y = H - 1;
      while (y > 0 && b[c * H + y] === B.air) y--;
      row += GLYPH[b[c * H + y]] || '?';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

export const LEGEND = '@ you  Z zombie  p pig  . grass  : dirt  _ sand  ~ water  # stone  O log  * leaves  = planks  % cobble  + table  F furnace  i torch  c coal  r iron';
