// gems.selftest — the Lapidary kernel: gacha pulls, crystallography→combat bonuses, socket caps,
// epitaxial growth (3 same-lattice → 1 bigger). Pins the data port from cards/ stays well-formed.
import { GEM_POOL, CRYSTAL_SYSTEMS, RARITY_TIER, TIER_RARITY, rollGem, gemBonus, sumBonus, socketCap, canGrow, growGems, gemGlyph, cssOf, SYSTEM_PLANET, gemPlanet, gemRegister, BODY_STAT } from '../gems.js';
import { PLANETS } from '../planets.js';

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

// 6. v104 unified language — every crystal system carries a planet register; the body-resonance channel
{
  ok(Object.keys(SYSTEM_PLANET).length === 7 && new Set(Object.values(SYSTEM_PLANET)).size === 7, 'the seven crystal systems map to the seven planets (a clean bijection — no dead register)');
  ok(Object.keys(CRYSTAL_SYSTEMS).every((sys) => PLANETS[SYSTEM_PLANET[sys]]), 'every crystal system maps to a real planet');
  const hex = { system: 'hexagonal', hardness: 7, luster: 'vitreous', rarity: 'rare', tier: 2, color: [0, 0, 0, 1] };
  ok(gemPlanet(hex) === 'mars', 'a hexagonal (edged) gem is a Mars stone');
  const reg = gemRegister(hex);
  ok(reg.planet === 'mars' && reg.glyph === '♂' && reg.matchups.beats.length === 3, 'gemRegister carries the planet glyph + its combat matchup');
  // body resonance: a socketed stone hardens the attribute the WIELDER's body leans on (plan: Mars gem → Chassis frame)
  ok(BODY_STAT.flesh === 'hp' && BODY_STAT.chassis === 'def' && BODY_STAT.anima === 'flux', 'the body→stat map matches deriveCombat (flesh→hp, chassis→def, anima→flux)');
  const base = gemBonus(hex), chassis = gemBonus(hex, 'chassis');
  ok(chassis.def > base.def, "a Chassis wielder's socketed gem hardens frame (def) beyond the bare lattice bonus");
  ok(gemBonus(hex, 'flesh').hp > base.hp && gemBonus(hex, 'anima').flux > base.flux, 'the resonance follows the wielder body (flesh→hp, anima→flux)');
  ok(JSON.stringify(gemBonus(hex)) === JSON.stringify(base), 'gemBonus with no body is unchanged (back-compatible)');
  const sb = sumBonus([hex, hex], 'chassis');
  ok(sb.def === chassis.def * 2, 'sumBonus threads the body through to every socketed stone');
}

console.log(`gems.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
