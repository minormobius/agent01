// node hoop/v105/test/ward-binding.selftest.mjs
// RUNTIME BINDING: the data index.html#checkWardArrival actually reads at play time —
// meta[walk.nodeChunk[playerNode]].faction — lines up with the faction-quest module, and walking the
// wards IN ORDER drives the gate to the rind-open. Closes the loop the browser smoke test can't (it would
// need to physically path the @ into each ward); here we stand a node in each ward and run the transition.
import { buildNave } from '../../nave/nave.js';
import { buildWalk } from '../v8/manager.js';
import { FQ_ORDER, fqActive, fqStatus, fqOpensRind, fqCanWitness } from '../story/factionquest.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

for (const seed of [7, 99]) {
  const nave = buildNave(seed), world = nave.world, meta = nave.meta;
  const walk = buildWalk(world);
  ok(walk && walk.nodeChunk && walk.N > 0, `seed ${seed}: buildWalk yields nodeChunk over the nave`);

  // checkWardArrival reads meta[walk.nodeChunk[player]].faction — prove a node exists in each ward and reports it.
  const nodeInFaction = (faction) => {
    for (let i = 0; i < walk.N; i++) { const m = meta[walk.nodeChunk[i]]; if (m && m.faction === faction) return walk.nodeChunk[i]; }
    return -1;
  };
  for (const f of FQ_ORDER) {
    const ci = nodeInFaction(f);
    ok(ci > 0, `seed ${seed}: a walk node sits in a ${f} ward chunk (${ci})`);
    if (ci > 0) ok(meta[ci].faction === f, `seed ${seed}: checkWardArrival reads faction=${f} there`);
  }

  // walk the campaign through the module's guarded transition (mirror of fqWitnessFaction)
  let facts = {};
  const witness = (faction) => {
    if (fqStatus(facts, faction) === 'witnessed') return 'already';
    if (!fqCanWitness(facts, faction)) return 'gated';
    facts = { ...facts, ['fq.' + faction]: 'witnessed' };
    return 'ok';
  };
  ok(witness('drift') === 'gated', `seed ${seed}: entering the Drift ward first is gated (order enforced)`);
  ok(witness('continuant') === 'ok', `seed ${seed}: continuant first`);
  ok(fqActive(facts) === 'rindwalker' && !fqOpensRind(facts), `seed ${seed}: rindwalker next, rind closed`);
  ok(witness('rindwalker') === 'ok', `seed ${seed}: rindwalker second`);
  ok(fqActive(facts) === 'drift' && !fqOpensRind(facts), `seed ${seed}: drift next, rind closed`);
  ok(witness('drift') === 'ok', `seed ${seed}: drift last`);
  ok(fqOpensRind(facts) && fqActive(facts) === null, `seed ${seed}: the Drift opens the rind; campaign complete`);
}

console.log((bad ? '✗ ' : '✓ ') + 'ward-binding.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
