// encounter.mjs — CLI for the encounter generator. Roll a hero, summon a fight at a target difficulty.
//
//   node rind/combat/encounter.mjs                                  # a fair fight for a rolled drift hero
//   node rind/combat/encounter.mjs --faction rindwalker --power 14  # tune the hero
//   node rind/combat/encounter.mjs --difficulty tight --terrain     # harder, with cover
//   node rind/combat/encounter.mjs --all                            # one fight at every difficulty

import { rollCharacter } from './stats.js';
import { FACTIONS, FACTION_ORDER, FACTION_LEAN } from './factions.js';
import { generateEncounter, describeEncounter, DIFFICULTY } from './encounter.js';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const faction = FACTIONS[flag('faction', 'drift')] ? flag('faction', 'drift') : 'drift';
const power = +flag('power', 12);
const seed = +flag('seed', 1);
const terrain = argv.includes('--terrain');

const hero = { name: `${FACTIONS[faction].label} hero`, faction, character: rollCharacter(seed * 977 + 1, { triad: FACTION_LEAN[faction], power }) };
const a = hero.character.attrs;
console.log(`\nHERO — ${hero.name} (${FACTIONS[faction].glyph} ${faction}, power ${power})`);
console.log(`  vit ${a.vitality} frame ${a.frame} servo ${a.servo} nerve ${a.nerve} cogit ${a.cogit} core ${a.core} flux ${a.flux}`);

const diffs = argv.includes('--all') ? Object.keys(DIFFICULTY) : [flag('difficulty', 'fair')];
for (const d of diffs) {
  const enc = generateEncounter(hero, { difficulty: d, seed, terrain });
  console.log('\n' + describeEncounter(enc));
}
console.log('');
