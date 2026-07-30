// errand.selftest.mjs — CHAMBER ERRANDS, pinned. Every verb has a fixture task (the three stretch
// verbs documented in errand.js resolve to real acts), the pick is deterministic per keeper and
// varied across keepers, progress counts off the act.* counters against the accept-time baseline,
// and the delivery (move's person-as-fixture) completes on its ready flag.
import { buildFixturePool } from './fixtures/weavepool.mjs';
import { servePool } from '../story/import.js';
import { ACTS, ERRANDS, errandFor, errandProgress, errandTaskLine } from '../story/errand.js';

let n = 0, bad = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.error('  ✗', msg); } };

// ── the catalog: every verb covered, every variant a countable act ──
const VERBS = ['grow', 'serve', 'play', 'make', 'mend', 'trade', 'learn', 'worship', 'govern', 'dwell', 'store', 'heal', 'move'];
ok(VERBS.every((v) => ERRANDS[v] && ERRANDS[v].length), 'every verb has ≥1 errand (incl. the stretch three: heal→rest, store→chest, move→deliver)');
ok(Object.values(ERRANDS).flat().every((d) => ACTS[d.kind] && d.need >= 1 && d.reward > 0), 'every variant keys a real, countable act with a reward');

// ── errandFor over the served fixture pool ──
const served = servePool(buildFixturePool());
const keepers = served.filter((c) => c.type === 'npc' && c.room != null && !(c.content && c.content.load_bearing));
{
  const defs = keepers.map((k) => errandFor(k));
  ok(defs.every(Boolean), 'every bundle keeper offers an errand');
  ok(defs.every((d, i) => JSON.stringify(errandFor(keepers[i])) === JSON.stringify(d)), 'the pick is deterministic per keeper');
  const kinds = new Set(defs.map((d) => d.kind));
  ok(kinds.size >= 8, `the pool's errands are varied (${kinds.size} distinct acts)`);
  ok(defs.every((d, i) => (ERRANDS[keepers[i].verb] || []).some((v) => v.kind === d.kind)), 'each keeper’s errand matches their own verb');
  ok(defs.every((d) => d.offer && d.doneSays && d.task), 'each errand carries its prose');
}
{ // exclusions: anchors, ambient, retired, opted-out
  const anchor = served.find((c) => c.content && c.content.load_bearing);
  ok(errandFor(anchor) === null, 'anchors never set errands');
  const k = keepers[0];
  ok(errandFor({ ...k, content: { ...k.content, ambient: true } }) === null, 'wanderers never set errands');
  ok(errandFor({ ...k, status: 'retired' }) === null, 'the retired (the mystery’s dead) set no errands');
  ok(errandFor({ ...k, content: { ...k.content, errand: false } }) === null, 'content.errand=false is hoopy’s per-bundle kill switch');
}

// ── progress math ──
{
  const entry = { kind: 'forge', need: 2, reward: 10, base: 3 };
  ok(errandProgress(entry, { 'act.forge': 3 }).count === 0, 'baseline: acts before the accept never count');
  ok(errandProgress(entry, { 'act.forge': 4 }).ready === false, 'one of two — not ready');
  const done = errandProgress(entry, { 'act.forge': 5 });
  ok(done.ready === true && done.count === 2, 'need met against the baseline → ready');
  ok(errandProgress(entry, { 'act.forge': 9 }).count === 2, 'overshoot clamps to need');
}
{ // the delivery completes on its ready flag (set by the surface when the addressee is opened)
  const d = { kind: 'deliver', need: 1, reward: 12, target: 'kaelen-voss', targetName: 'Kaelen Voss' };
  ok(errandProgress(d, {}).ready === false, 'a parcel not yet delivered is not ready');
  ok(errandProgress(d, { 'act.deliver': 99 }).ready === false, 'counters never complete a delivery — only the addressee does');
  ok(errandProgress({ ...d, ready: true }, {}).ready === true, 'the addressee’s ready flag completes it');
  ok(errandTaskLine(d).includes('Kaelen Voss'), 'the task line names the addressee');
}

console.log(bad === 0 ? `✓ errand.selftest — ${n} checks passed` : `✗ errand.selftest — ${bad}/${n} FAILED`);
if (bad) process.exit(1);
