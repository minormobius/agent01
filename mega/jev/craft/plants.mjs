// craft/plants.mjs — where each species can be grown, and when it grows.
//
// A cultivated plant sits in the voxel above its soil. Whether it may be
// planted there is its HABITAT (soil, tile shape, cover); whether it grows on a
// given check is its CONDITION (light, day or night). Both are facts about the
// world the player can see, so macros compute them and Jev reads the result.
//
// Several habitats are properties of the tiling, which is the point of growing
// things on foam's floors: a moonpetal only takes root on the world's rarest
// tile shape, and a starbloom only on a tile whose every neighbour is a
// different shape from itself — common on kagome, rare on Penrose, impossible
// on a grid.

import { B, BLOCKS, H, SPECIES, SPECIES_NAMES, tileKinds } from './world.mjs';

// ticks per growth stage (two stages: sprout → growing → plant), before the
// water bonus (x2 on farmland with water within two tiles)
export const STAGE_TICKS = { wheat: 900, sunfruit: 1200, glowcap: 1400, moonpetal: 700, starbloom: 2000 };
export const GROW_EVERY = 20;           // how often crops are checked

const FARMLAND_SPECIES = new Set(['wheat', 'moonpetal', 'starbloom']);
export const needsFarmland = (sp) => FARMLAND_SPECIES.has(sp);

const covered = (sim, c, y) => { for (let yy = y + 1; yy < H; yy++) { const id = sim.get(c, yy); if (id !== B.air && !BLOCKS[id].light) return true; } return false; };
export const wet = (sim, c, y) => {
  const seen = new Set([c]); let ring = [c];
  for (let d = 0; d <= 2; d++) {
    for (const u of ring) if (sim.get(u, y - 1) === B.water || sim.get(u, y - 2) === B.water || (u !== c && sim.get(u, y) === B.water)) return true;
    const next = [];
    for (const u of ring) for (const w of sim.cols[u].adj) if (!seen.has(w)) { seen.add(w); next.push(w); }
    ring = next;
  }
  return false;
};
const lit = (sim, c) => sim.torchNear(c, 4);

// Can `sp` be planted in voxel (c, y)? `soilAfterTill` lets a site search ask
// about grass or dirt that would become farmland. Returns null or the reason.
export function habitat(sim, sp, c, y, { soilAfterTill = false } = {}) {
  const tk = tileKinds(sim.world.tiling);
  const soil = sim.get(c, y - 1), here = sim.get(c, y);
  if (here !== B.air) return 'the spot is not empty';
  if (needsFarmland(sp)) {
    const ok = soil === B.farmland || (soilAfterTill && (soil === B.grass || soil === B.dirt));
    if (!ok) return 'needs farmland';
    if (sp === 'moonpetal' && tk.kind[c] !== tk.rarest) return `only on the rarest tile shape (${tk.names[tk.rarest]})`;
    if (sp === 'starbloom' && !tk.isolated[c]) return 'only on a tile whose every neighbour is a different shape';
    return null;
  }
  if (sp === 'sunfruit') {
    if (soil !== B.sand) return 'needs sand';
    if (!sim.cols[c].adj.some((n) => sim.get(n, y - 1) === B.water || sim.get(n, y - 2) === B.water)) return 'needs water beside it';
    return null;
  }
  if (sp === 'glowcap') {
    if (![B.grass, B.dirt, B.stone, B.farmland, B.cobblestone, B.planks].includes(soil)) return 'needs soil, stone or planks under it';
    if (!covered(sim, c, y)) return 'needs cover overhead (a roof, rock or a canopy)';
    return null;
  }
  return 'unknown species';
}

// Does a cultivated plant at (c, y) grow on this check? null = yes, else why not.
export function condition(sim, sp, c, y) {
  const night = sim.isNight(), open = !covered(sim, c, y);
  if (sp === 'glowcap') return open ? 'uncovered' : null;
  if (sp === 'moonpetal') return !night ? 'waits for night' : !open ? 'needs open sky' : null;
  if (sp === 'wheat') return (open && !night) || lit(sim, c) ? null : 'needs light';
  return open && !night ? null : 'needs sunlight';
}

// Rough ticks until a plant at `stage` is mature, for the facts Jev reads.
export function eta(sim, sp, c, y, stage) {
  const left = 2 - stage;
  if (left <= 0) return 0;
  const bonus = needsFarmland(sp) && wet(sim, c, y) ? 2 : 1;
  const duty = sp === 'glowcap' ? 1 : sp === 'moonpetal' ? 0.375 : 0.625;     // share of the day it can grow
  return Math.round(left * STAGE_TICKS[sp] / bonus / duty);
}

// One growth check for every tracked crop (called every GROW_EVERY ticks).
export function growCrops(sim) {
  for (const k of [...sim.crops]) {
    const c = Math.floor(k / H), y = k % H, id = sim.b[k], blk = BLOCKS[id];
    if (!blk.plant || blk.stage >= 2) { sim.crops.delete(k); continue; }
    const sp = blk.plant;
    // the soil went (mined, or never right): the plant is lost
    const soil = sim.get(c, y - 1);
    if (!BLOCKS[soil].solid) { sim.set(c, y, B.air); continue; }
    if (condition(sim, sp, c, y)) continue;
    const bonus = needsFarmland(sp) && wet(sim, c, y) ? 2 : 1;
    if (sim.rng() < (GROW_EVERY * bonus) / STAGE_TICKS[sp]) sim.set(c, y, B[`${sp}_${blk.stage === 0 ? 'growing' : 'plant'}`]);
  }
}

// What harvesting a plant block gives (mature: produce + seeds; young: a seed back).
export function harvestDrop(sim, blk) {
  const sp = blk.plant;
  if (blk.stage < 2) return { [`${sp}_seeds`]: 1 };
  return { [SPECIES[sp].produce]: 1 + (sim.rng() < 0.5 ? 1 : 0), [`${sp}_seeds`]: 1 + (sim.rng() < 0.6 ? 1 : 0) };
}

// Species that can exist in this world at all (it sowed at least one wild).
export const speciesHere = (sim) => SPECIES_NAMES.filter((sp) => (sim.world.wild || {})[sp] > 0);
