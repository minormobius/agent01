// node bees/arena/swarm-combat.selftest.mjs — the swarm-combat layer over the real arena engine.
import { createBattle, act, active, unitById } from '../../v092/arena/engine.js';
import { rollCharacter, deriveCombat } from '../../v092/stats.js';
import { makeSwarmUnit, addSwarm, swarmPulse, emberHits, swarmTurn, resolveEnd, EMBER } from './swarm-combat.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

function freshBattle(seed = 7, mass = 130) {
  const c = rollCharacter(seed, { vocation: 'make' });
  const combat = deriveCombat(c);
  const s = createBattle({ player: { id: 'P', name: 'You', character: c, combat, x: 4, y: 8 }, foes: [], seed, W: 9, H: 9 });
  const sw = addSwarm(s, makeSwarmUnit({ seed: 'hive:' + seed, x: 4, y: 4, mass }));
  return { s, player: unitById(s, 'P'), sw };
}

// swarm is in initiative and built squishy + slow
{
  const { s, sw } = freshBattle();
  ok(s.order.includes('swarm'), 'swarm joined initiative order');
  ok(s.order[0] === 'P', 'player acts before the slow swarm');
  ok(sw.hp === sw.maxhp && sw.swarm === true, 'swarm hp = mass, flagged');
}

// pulse hits every enemy in radius; nobody outside it
{
  const { s, player, sw } = freshBattle();
  player.x = 4; player.y = 5;                 // within radius 2 of swarm at (4,4)
  const hp0 = player.hp;
  const hits = swarmPulse(s, sw);
  ok(hits.length === 1 && hits[0].id === 'P', 'pulse hits the in-range player');
  ok(player.hp < hp0, `pulse damages player (${hp0}→${player.hp})`);
  player.x = 0; player.y = 0;                 // far away
  ok(swarmPulse(s, sw).length === 0, 'pulse misses out-of-range player');
}

// mass = sting: a thinned swarm stings for less
{
  const { s, player, sw } = freshBattle();
  player.x = 4; player.y = 4; player.def = 0; player.buff = { def: 0, turns: 0 };
  const full = swarmPulse(s, sw)[0].dmg; player.hp = 999;
  sw.hp = Math.round(sw.maxhp * 0.25);        // thin it to a quarter
  const thin = swarmPulse(s, sw)[0].dmg;
  ok(thin < full, `thinned swarm stings less (${full}→${thin})`);
}

// Ember is super-effective vs swarm vs a plain strike-equivalent
{
  const { s, player, sw } = freshBattle();
  player.x = 4; player.y = 5;
  const before = sw.hp;
  const hits = emberHits(s, player);
  const dealt = before - sw.hp;
  ok(hits.some(h => h.id === 'swarm') && dealt > 0, `ember scorches the swarm (−${dealt})`);
  // compare to a single plain blow of the same atk (no ×mult, no vs-swarm bonus): ember should beat it
  const plainEstimate = Math.max(1, Math.round((player.atk - sw.def * 0.5) * 1.0));
  ok(dealt > plainEstimate, `ember (−${dealt}) > a plain blow (~${plainEstimate})`);
}

// a full swarm turn: closes distance then pulses; resolveEnd flags a win when the swarm dies
{
  const { s, player, sw } = freshBattle();
  sw.x = 0; sw.y = 0; player.x = 8; player.y = 8;  // far apart
  // make it the swarm's turn
  s.idx = s.order.indexOf('swarm');
  const ev = swarmTurn(s, sw);
  ok(ev.some(e => e.type === 'move'), 'swarm moves toward the player when out of range');
  ok(ev.some(e => e.type === 'pulse'), 'swarm pulses on its turn');

  sw.hp = 0; sw.alive = false; resolveEnd(s);
  ok(s.winner === 'player', 'killing the swarm wins the arena');
}

// determinism: same seed + same scripted actions → identical end state
{
  function script(seed) {
    const { s, player, sw } = freshBattle(seed);
    player.x = 4; player.y = 5;
    const log = [];
    for (let i = 0; i < 4; i++) { log.push(emberHits(s, player).map(h => h.dmg)); s.idx = s.order.indexOf('swarm'); log.push(swarmTurn(s, sw).flatMap(e => e.hits ? e.hits.map(h => h.dmg) : [])); s.idx = s.order.indexOf('P'); }
    return JSON.stringify(log) + '|' + sw.hp + '|' + player.hp;
  }
  ok(script(11) === script(11), 'scripted fight reproducible from seed');
  ok(script(11) !== script(12), 'different seed → different fight');
}

console.log(`\nbees/arena/swarm-combat.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
