// sim.selftest.mjs — pins the survival + fixture-action layer (hoop/v095/sim.js). Pure, deterministic.
//   node hoop/v095/test/sim.selftest.mjs
import { STAMINA_MAX, clampStamina, drainStamina, fixtureAction, isTerminalRole,
         chestDeposit, chestWithdraw, chestOf } from '../sim.js';

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

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
