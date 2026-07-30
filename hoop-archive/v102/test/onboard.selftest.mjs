// onboard.selftest.mjs — the onboarding engine (story/onboard.js): the little-gimme pacing.
//   node hoop/v102/test/onboard.selftest.mjs
//
// Pins the contract the surface builds on: one gimme at a time, strictly ordered, gated to the
// narrative tier ladder (garden 1 → bench 2 → smithy 3 → gauntlet 3), organic completion credited,
// and the starter-crop picks deterministic.

import { GIMMES, activeGimme, gimmeProgress, starterCrops, givenFlag, doneFlag } from '../story/onboard.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. the track table is sane ──
ok(GIMMES.length === 4, 'four systems, four gimmes');
ok(GIMMES.map((g) => g.id).join(',') === 'garden,alchemy,smith,trainer', 'ordered: garden → alchemy → smith → trainer');
ok(GIMMES.map((g) => g.tier).join(',') === '1,2,3,3', 'tier ladder mirrors hoopy’s narrative progression (1·2·3·3)');
ok(GIMMES.every((g, i, a) => !i || a[i - 1].tier <= g.tier), 'tiers are nondecreasing (the reveal never runs backward)');
ok(GIMMES.every((g) => ['grow', 'make', 'play'].includes(g.role)), 'every gimme points at a real room role (grow/make/play — the fixture homes)');
ok(GIMMES.every((g) => g.reward > 0 && g.title && g.task && g.blurb && g.where && g.icon), 'every gimme carries its full card (title/task/blurb/where/reward/icon)');
ok(givenFlag('garden') === 'ob.given.garden' && doneFlag('garden') === 'ob.done.garden', 'flags live in the ob.* namespace');

// ── 2. one at a time, strictly ordered, tier-gated ──
ok(activeGimme({}, 1).id === 'garden', 'fresh tier-1 player → the garden');
ok(activeGimme({}, 2).id === 'garden', 'tier 2 with the garden undone → STILL the garden (one at a time, ordered)');
ok(activeGimme({ 'ob.done.garden': true }, 1) === null, 'garden done at tier 1 → nothing (the bench waits for tier 2)');
ok(activeGimme({ 'ob.done.garden': true }, 2).id === 'alchemy', 'garden done at tier 2 → the bench');
ok(activeGimme({ 'ob.done.garden': true, 'ob.done.alchemy': true }, 2) === null, 'both nave gimmes done at tier 2 → nothing (the rind pair waits)');
ok(activeGimme({ 'ob.done.garden': true, 'ob.done.alchemy': true }, 3).id === 'smith', 'tier 3 → the smithy first');
ok(activeGimme({ 'ob.done.garden': true, 'ob.done.alchemy': true, 'ob.done.smith': true }, 3).id === 'trainer', 'smithy done → the gauntlet');
ok(activeGimme({ 'ob.done.garden': true, 'ob.done.alchemy': true, 'ob.done.smith': true, 'ob.done.trainer': true }, 4) === null, 'all done → the engine goes quiet');

// ── 3. organic completion is credited (a verb done before its gimme unlocked skips that track) ──
ok(activeGimme({ 'ob.done.smith': true }, 1).id === 'garden', 'an early organic forge doesn’t disturb the current gimme');
ok(activeGimme({ 'ob.done.garden': true, 'ob.done.alchemy': true }, 3).id === 'smith', '…');
ok(activeGimme({ 'ob.done.garden': true, 'ob.done.alchemy': true, 'ob.done.smith': true }, 3).id === 'trainer', 'and when tier 3 arrives with the forge already done, the gauntlet surfaces directly');

// ── 4. progress readout ──
{
  const p0 = gimmeProgress({}, 1);
  ok(p0.done === 0 && p0.total === 4 && p0.unlocked === 1, 'fresh tier-1: 0/4 done, 1 unlocked');
  const p1 = gimmeProgress({ 'ob.done.garden': true, 'ob.done.smith': true }, 3);
  ok(p1.done === 2 && p1.unlocked === 4, 'done counts credit organic completions; tier 3 unlocks all four');
}

// ── 5. starter crops: deterministic, alchemically live, fastest first (from the REAL ark) ──
{
  const ark = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../garden/ark.json'), 'utf8'));
  const picks = starterCrops(ark, 2);
  ok(picks.length === 2, 'two starter crops picked from the live ark');
  ok(picks.every((c) => c.reagent === true), 'both picks are alchemically live (they feed the tier-2 bench gimme)');
  const days = (ark.crops || []).filter((c) => c.reagent).map((c) => c.growthDays || 99).sort((a, b) => a - b);
  ok(picks.every((c) => (c.growthDays || 99) <= days[Math.min(3, days.length - 1)]), 'the picks are among the fastest growers (a first win in days, not weeks)');
  const again = starterCrops(ark, 2);
  ok(picks.map((c) => c.id).join() === again.map((c) => c.id).join(), 'the pick is deterministic (every world grants the same herbs)');
}

console.log(`onboard.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
