// gems.selftest — the Lapidary kernel: gacha pulls, crystallography→combat bonuses, socket caps,
// epitaxial growth (3 same-lattice → 1 bigger). Pins the data port from cards/ stays well-formed.
import { GEM_POOL, CRYSTAL_SYSTEMS, RARITY_TIER, TIER_RARITY, rollGem, gemBonus, sumBonus, socketCap, canGrow, growGems, gemGlyph, cssOf } from '../gems.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. the ported pool is well-formed + covers every crystal system
ok(GEM_POOL.length >= 24, 'pool has a healthy gem count');
ok(GEM_POOL.every((r) => r.length === 3 && CRYSTAL_SYSTEMS[r[1]] && r[2].hardness >= 1 && r[2].hardness <= 10 && RARITY_TIER[r[2].rarity] != null), 'every row is [name, validSystem, {1..10 hardness, valid rarity}]');
ok(Object.keys(CRYSTAL_SYSTEMS).every((sys) => GEM_POOL.some((r) => r[1] === sys)), 'every crystal system has at least one gem');

// 2. the pull is a valid, deterministic gem
const g = rollGem(7, 'mA:r3', 0);
ok(g && g.mineral && g.system && g.tier >= 0 && Array.isArray(g.color), 'a pull yields a complete gem');
ok(JSON.stringify(rollGem(7, 'mA:r3', 0)) === JSON.stringify(g), 'same (seed,bench,index) → identical gem');
ok(rollGem(7, 'mA:r3', 1).uid !== g.uid, 'a later pull is a different instance');
ok(gemGlyph(g) === CRYSTAL_SYSTEMS[g.system].icon && cssOf(g.color).startsWith('rgba('), 'glyph + css helpers resolve');
// rarity weighting: over many pulls, commons dominate, legendaries are scarce
let counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
for (let i = 0; i < 600; i++) counts[rollGem(1, 'bench', i).rarity]++;
ok(counts.common > counts.uncommon && counts.uncommon > counts.rare && counts.rare > counts.legendary && counts.legendary > 0, `rarity is weighted (${JSON.stringify(counts)})`);

// 3. crystallography → combat: bonuses are sane, dominant stat matches the lattice, harder/rarer = bigger
const diamond = GEM_POOL.find((r) => r[0] === 'Diamond'), halite = GEM_POOL.find((r) => r[0] === 'Halite');
const dGem = { system: 'cubic', hardness: 10, luster: 'adamantine', rarity: 'legendary', tier: 3, color: diamond[2].color };
const hGem = { system: 'cubic', hardness: 2, luster: 'vitreous', rarity: 'common', tier: 0, color: halite[2].color };
const db = gemBonus(dGem), hb = gemBonus(hGem);
ok(db.atk + db.def + db.hp + db.flux > hb.atk + hb.def + hb.hp + hb.flux, 'a harder, rarer gem grants a bigger total bonus');
const hexB = gemBonus({ system: 'hexagonal', hardness: 7, luster: 'vitreous', rarity: 'rare', tier: 2, color: [0, 0, 0, 1] });
ok(hexB.atk >= hexB.def && hexB.atk >= hexB.hp, 'a hexagonal gem favours attack (its lattice stat)');
const monoB = gemBonus({ system: 'monoclinic', hardness: 7, luster: 'vitreous', rarity: 'rare', tier: 2, color: [0, 0, 0, 1] });
ok(monoB.flux >= monoB.atk && monoB.flux >= monoB.def, 'a monoclinic gem favours flux');
ok(gemBonus(null).atk === 0, 'no gem → no bonus');
const s = sumBonus([dGem, hGem]);
ok(s.atk === db.atk + hb.atk && s.hp === db.hp + hb.hp, 'sumBonus adds socketed gems');
ok(gemBonus(hGem).atk + gemBonus(hGem).def + gemBonus(hGem).hp + gemBonus(hGem).flux >= 1, 'even a soft common gem does something');

// 4. socket caps scale with item worth, clamped 1..3
ok(socketCap({ worth: 0.9 }) === 3 && socketCap({ worth: 0.05 }) === 1 && socketCap(null) >= 1, 'socket cap scales with worth, floor 1, ceil 3');

// 5. epitaxial growth
const three = (sys, tier) => [0, 1, 2].map((i) => { const r = GEM_POOL.find((x) => x[1] === sys && RARITY_TIER[x[2].rarity] === tier) || GEM_POOL.find((x) => x[1] === sys); return { uid: 'u' + sys + i, system: sys, hardness: r[2].hardness, luster: r[2].luster, rarity: r[2].rarity, tier: RARITY_TIER[r[2].rarity], color: r[2].color }; });
ok(!canGrow([dGem, hGem]).ok, 'cannot grow gems of mixed lattices');
ok(!canGrow([dGem]).ok, 'need exactly 3 to grow');
const grow1 = growGems(three('trigonal', 0));
ok(grow1.ok && grow1.gem.tier === 1 && grow1.gem.system === 'trigonal', '3 common trigonal → 1 uncommon trigonal');
const growLeg = growGems(three('trigonal', 2));   // trigonal HAS legendary (Ruby/Sapphire)
ok(growLeg.ok && growLeg.gem.tier === 3, '3 rare trigonal → 1 legendary (system has the ceiling)');
const growCapped = growGems(three('tetragonal', 2));   // tetragonal tops out at rare
ok(growCapped.ok && growCapped.gem.tier === 2, 'growth is capped at what a system offers (tetragonal stays rare)');
ok(growGems(three('hexagonal', 0)).gem.color.length === 4, 'grown gem carries a blended colour');

console.log(`gems.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
