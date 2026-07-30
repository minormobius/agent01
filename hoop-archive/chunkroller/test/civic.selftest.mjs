// civic.selftest.mjs — the chunkroller civic kernel + biome rollup over a REAL solveChunk.
//   node hoop/chunkroller/test/civic.selftest.mjs
import { solveChunk } from '../../v099/v8/chunkgen.js';
import { ROLE_MIX } from '../../v099/econ/econ.js';
import { mixFromSliders, mixShares, NEUTRAL, BIOMES, SLIDERS } from '../biomes.js';
import { fieldFromRooms, scoreChunk, npcRoster } from '../civic.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// ── biomes / slider rollup ──
const neutral = mixFromSliders(NEUTRAL);
ok(JSON.stringify(neutral) === JSON.stringify(ROLE_MIX.map(([r, w]) => [r, Math.max(0.01, w)])), 'wild-type sliders reproduce ROLE_MIX (no bias)');
const indHeavy = mixFromSliders({ ...NEUTRAL, industry: 2 });
const wMake = (mix) => mix.find(([r]) => r === 'make')[1];
ok(wMake(indHeavy) === 2 * wMake(neutral), 'industry slider 2× doubles make/mend/trade/store weight');
const shares = mixShares(NEUTRAL);
ok(Math.abs(shares.reduce((s, [, v]) => s + v, 0) - 1) < 1e-9, 'mixShares normalize to 1');
ok(shares[0][0] === 'dwell', 'wild-type biggest share is dwell');
ok(SLIDERS.length === 7 && Object.keys(BIOMES).length >= 6, 'seven sliders, several biomes');

// ── a real chunk → civic readout ──
const W = 900, H = 600;
const chunk = solveChunk({ seed: 7, W, H });
ok(chunk.rooms.length > 5, 'the chunk grew rooms');
const field = fieldFromRooms(chunk.rooms, W, H);
ok(field.places.length === chunk.rooms.length, 'every room becomes a place');
ok(field.closure >= 0 && field.closure <= 1 && field.edges.length > 0, 'supply web wired, closure in [0,1]');
const { society, vital, metrics } = scoreChunk(chunk.rooms, W, H, 7);
ok(society.people.length > 0, 'society has residents');
ok(Number.isInteger(vital.vitality) && vital.vitality >= 0 && vital.vitality <= 100, 'vitality is 0..100');
ok(typeof vital.tier === 'string' && vital.signals && typeof vital.signals.closes === 'number', 'vitality carries a tier + signals');
ok(typeof metrics.avgReach === 'number', 'metrics carry avgReach');
// determinism
const v2 = scoreChunk(chunk.rooms, W, H, 7).vital;
ok(v2.vitality === vital.vitality, 'scoreChunk is deterministic for a fixed chunk + seed');

// ── NPC stats ──
const roster = npcRoster(society);
ok(roster.count === society.people.length, 'roster covers every resident');
ok(roster.people.every((n) => n.triad && n.attrs && typeof n.attrs.vitality === 'number'), 'every NPC has a triad + attribute block');
ok(roster.people.some((n) => n.work), 'some NPCs are employed');
const triadSum = roster.triadAvg.flesh + roster.triadAvg.chassis + roster.triadAvg.anima;
ok(Math.abs(triadSum - 1) < 0.05, 'mean triad ≈ normalized (flesh+chassis+anima ≈ 1)');
ok(Object.keys(roster.casts).length > 0, 'cast histogram populated');

// ── biome biasing is real, end-to-end through the engine override ──
const cnt = (rooms, set) => rooms.filter((r) => set.includes(r.role)).length;
const IND = ['make', 'mend', 'trade', 'store'];
const wildInd = cnt(solveChunk({ seed: 11, W, H }).rooms, IND);
const foundryInd = cnt(solveChunk({ seed: 11, W, H, roleMix: mixFromSliders(BIOMES.foundry.sliders) }).rooms, IND);
ok(foundryInd > wildInd, `Foundry Row grows more industry than wild (${foundryInd} > ${wildInd})`);
const LORE = ['learn', 'worship'];
const cloisterLore = cnt(solveChunk({ seed: 11, W, H, roleMix: mixFromSliders(BIOMES.cloister.sliders) }).rooms, LORE);
ok(cloisterLore > cnt(solveChunk({ seed: 11, W, H }).rooms, LORE), 'Cloister grows more lore (learn/worship) than wild');

console.log(`civic.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
