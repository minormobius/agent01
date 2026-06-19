// sim.selftest.mjs — pins the survival + fixture-action layer (hoop/v095/sim.js). Pure, deterministic.
//   node hoop/v095/test/sim.selftest.mjs
import { STAMINA_MAX, clampStamina, drainStamina, fixtureAction, isTerminalRole,
         chestDeposit, chestWithdraw, chestOf,
         NOURISH_MAX, HEALTH_MAX, tickSurvival, applyFood } from '../sim.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// stamina drains while walking, clamps at 0, never exceeds max
ok('fresh stamina is full', clampStamina(undefined) === STAMINA_MAX);
ok('walking drains', drainStamina(STAMINA_MAX, 10) === STAMINA_MAX - 5);
ok('stamina clamps at 0', drainStamina(1, 100) === 0);
ok('stamina clamps at max', clampStamina(999) === STAMINA_MAX);

// the fixture registry: living quarters → bed (central) + chest (wall); reading rooms → terminal
ok('dwell central → bed', fixtureAction('dwell', 'component') === 'bed');
ok('dwell wall → chest', fixtureAction('dwell', 'wall') === 'chest');
ok('learn central → terminal', fixtureAction('learn', 'component') === 'terminal');
ok('grow central → garden', fixtureAction('grow', 'component') === 'garden');
ok('isTerminalRole matches learn/govern/worship', isTerminalRole('govern') && isTerminalRole('worship') && !isTerminalRole('dwell'));
ok('unmapped → null', fixtureAction('make', 'component') === null && fixtureAction('learn', 'wall') === null);

// chest: per-chamber persistent storage, deposit/withdraw are pure
{
  let store = {};
  store = chestDeposit(store, 'g1', { name: 'Pry Bar' });
  store = chestDeposit(store, 'g1', { name: 'Ration' });
  store = chestDeposit(store, 'g2', { name: 'Cord' });
  ok('deposits land in the right chamber', chestOf(store, 'g1').length === 2 && chestOf(store, 'g2').length === 1);
  const w = chestWithdraw(store, 'g1', 0);
  ok('withdraw returns the item', w.item && w.item.name === 'Pry Bar');
  ok('withdraw removes from that chamber only', chestOf(w.store, 'g1').length === 1 && chestOf(w.store, 'g2').length === 1);
  ok('out-of-range withdraw is a no-op', chestWithdraw(store, 'g1', 9).item === null);
  ok('chests are independent per chamber address', chestOf(store, 'g1')[0].name === 'Pry Bar' && chestOf(store, 'gX').length === 0);
}

// ── nourishment + health: the food survival loop ──
ok('serve central → food', fixtureAction('serve', 'component') === 'food');
{
  const full = { stamina: STAMINA_MAX, nourish: NOURISH_MAX, health: HEALTH_MAX };
  // a full belly drains stamina slower than an empty one
  const fed = tickSurvival(full, 10);
  const empty = tickSurvival({ stamina: STAMINA_MAX, nourish: 0, health: HEALTH_MAX }, 10);
  ok('nourishment ebbs as you walk', fed.nourish < NOURISH_MAX && fed.nourish > 0);
  ok('a full belly slows the stamina drain', (STAMINA_MAX - fed.stamina) < (STAMINA_MAX - empty.stamina));
  ok('well-fed keeps full health', fed.health === HEALTH_MAX);
  // starving (nourish 0) bleeds health
  ok('starving bleeds health', empty.health < HEALTH_MAX);
  ok('health holds while any nourishment remains', tickSurvival({ stamina: 50, nourish: 1, health: 80 }, 1).health === 80);
  ok('everything clamps at 0', tickSurvival({ stamina: 0, nourish: 0, health: 0 }, 50).health === 0);
  // eating tops up nourishment, stamina, and a little health
  const hungry = { stamina: 20, nourish: 5, health: 60 };
  const ate = applyFood(hungry, { restoreStamina: 30, nourish: 40 });
  ok('eating restores nourishment', ate.nourish === 45);
  ok('eating restores stamina', ate.stamina === 50);
  ok('eating heals a little', ate.health === 70);
  ok('overeating clamps at max', applyFood({ stamina: 90, nourish: 90, health: 98 }, { restoreStamina: 42, nourish: 60 }).nourish === NOURISH_MAX);
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
