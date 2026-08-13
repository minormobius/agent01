// gate.mjs — THE EXECUTABLE SCALES. Runs both instruments (playtest = pacing, diversity =
// variety) and checks their METRICS lines against thresholds.json. Exit 0 = the game is still
// the game; exit 1 = some change broke a hard-won bound, with the breach named. This is what
// lets players (via the town council) and agents touch the design: the annealing lives here as
// regression bounds, not as prose. Run: node farm/sim/gate.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const T = JSON.parse(readFileSync(join(here, 'thresholds.json'), 'utf8'));

function metricsOf(script) {
  const out = execFileSync(process.execPath, [join(here, script)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const line = out.split('\n').find((l) => l.startsWith('METRICS '));
  if (!line) throw new Error(script + ' printed no METRICS line');
  return JSON.parse(line.slice(8));
}

let failed = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + '  (' + detail + ')');
  if (!cond) failed++;
};

console.log('━━━ THE SCALES — do the instruments still read true? ━━━');

const o = metricsOf('playtest.mjs');
console.log('oracle (' + o.days + 'd × ' + o.seeds + ' players):');
check('no dead sessions', o.dead <= T.oracle.deadMax, (o.dead * 100).toFixed(1) + '% ≤ ' + T.oracle.deadMax * 100 + '%');
check('unlock gap holds', o.unlockGap <= T.oracle.unlockGapMax, o.unlockGap.toFixed(1) + 'd ≤ ' + T.oracle.unlockGapMax + 'd');
check('session variety', o.variety >= T.oracle.varietyMin, o.variety.toFixed(1) + ' ≥ ' + T.oracle.varietyMin + ' verbs');
check('rewards flow', o.rewards >= T.oracle.rewardsMin, o.rewards.toFixed(1) + ' ≥ ' + T.oracle.rewardsMin + '/session');
check('unlock cadence', o.unlocks >= T.oracle.unlocksMin, o.unlocks.toFixed(0) + ' ≥ ' + T.oracle.unlocksMin + ' events');
check('economy in band', o.coins >= T.oracle.coinsRange[0] && o.coins <= T.oracle.coinsRange[1], o.coins.toFixed(0) + '◈ in [' + T.oracle.coinsRange + ']');
check('harvest tempo in band', o.harvests >= T.oracle.harvestsRange[0] && o.harvests <= T.oracle.harvestsRange[1], o.harvests.toFixed(0) + ' in [' + T.oracle.harvestsRange + ']');

const d = metricsOf('diversity.mjs');
console.log('diversity (' + d.days + 'd × ' + d.seeds + ' players):');
check('variety is real (greedy H)', d.hGreedy >= T.diversity.hGreedyMin, d.hGreedy + ' ≥ ' + T.diversity.hGreedyMin);
check('roster offers choice (random H)', d.hRandom >= T.diversity.hRandomMin, d.hRandom + ' ≥ ' + T.diversity.hRandomMin);
check('optimizer keeps species', d.greedySpecies >= T.diversity.greedySpeciesMin, d.greedySpecies + ' ≥ ' + T.diversity.greedySpeciesMin);
check('mid-game novelty drips', d.lateNovelty >= T.diversity.lateNoveltyMin, d.lateNovelty + ' ≥ ' + T.diversity.lateNoveltyMin + ' after week 1');
check('early skin shelf', d.earlySkins >= T.diversity.earlySkinsMin, d.earlySkins + ' ≥ ' + T.diversity.earlySkinsMin + ' by day 7');

if (failed) {
  console.error('\n✗ THE SCALES REFUSE — ' + failed + ' bound(s) broken. The change does not ship.');
  process.exit(1);
}
console.log('\n✓ the scales balance — ' + 12 + ' bounds hold');
