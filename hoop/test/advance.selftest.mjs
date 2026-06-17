// advance.selftest.mjs — pins deterministic, inference-free tier advancement (hoop/story/advance.js).
//   node hoop/test/advance.selftest.mjs
// The C3 fix: without this the JS client is pinned at tier 1/1/1 and the 5-rung arc never climbs.
// Proves the manifest fires on earned state, is monotonic, clamps to the bible's 1-5 range, and is
// deterministic (no model, no Date.now).
import { MemoryStore } from '../story/engine.js';
import { checkAdvance, MILESTONES, TIER_MAX, AXES } from '../story/advance.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };
const P = 'p1';
const store = () => new MemoryStore([], { features: [] });
const setAll = (s, facts) => { for (const [k, v] of Object.entries(facts)) s.setFact(P, k, v); };
const OPENING = { 'flag.met_olo': true, 'flag.read_terminal': true, 'flag.sevin_believes': true };

// 1. fresh player sits at tier 1; no milestone held → no advance
{ const s = store();
  ok('fresh narrative_tier is 1', s.getPlayerState(P).narrative_tier === 1);
  ok('fresh revelation_tier is 1', s.getPlayerState(P).revelation_tier === 1);
  ok('no facts → no advance', checkAdvance(s, P).length === 0); }

// 2. partial requirements do not advance
{ const s = store(); setAll(s, { 'flag.met_olo': true, 'flag.read_terminal': true });   // missing sevin_believes
  ok('partial milestone withheld', checkAdvance(s, P).length === 0 && s.getPlayerState(P).narrative_tier === 1); }

// 3. full requirements advance narrative 1→2, exactly once
{ const s = store(); setAll(s, OPENING);
  const ch = checkAdvance(s, P);
  ok('milestone fires once', ch.length === 1 && ch[0].axis === 'narrative_tier' && ch[0].from === 1 && ch[0].to === 2);
  ok('tier applied', s.getPlayerState(P).narrative_tier === 2);
  ok('idempotent — no re-advance', checkAdvance(s, P).length === 0 && s.getPlayerState(P).narrative_tier === 2); }

// 4. monotonic — never demotes a player already past the floor
{ const s = store(); s.setPlayerTier(P, 'narrative_tier', 4); setAll(s, OPENING);
  ok('higher tier not demoted to floor', checkAdvance(s, P).length === 0 && s.getPlayerState(P).narrative_tier === 4); }

// 5. determinism + clamp — a synthetic milestone clamps to TIER_MAX, identical result every run
{ const mk = () => { const s = store(); s.setFact(P, 'flag.z', true); return s; };
  const m = [{ id: 'x', axis: 'revelation_tier', to: 99, requires: { facts: { 'flag.z': true } } }];
  const a = mk(), b = mk();
  const ra = checkAdvance(a, P, m), rb = checkAdvance(b, P, m);
  ok('clamps to TIER_MAX', a.getPlayerState(P).revelation_tier === TIER_MAX);
  ok('deterministic across stores', JSON.stringify(ra) === JSON.stringify(rb)); }

// 6. setPlayerTier ignores non-milestone axes (power_tier stays XP-driven)
{ const s = store(); s.setPlayerTier(P, 'power_tier', 5);
  ok('power_tier not settable via tier setter', s.getPlayerState(P).power_tier === 1); }

// 7. the shipped manifest is well-formed
ok('manifest axes/targets valid', MILESTONES.every((m) => AXES.includes(m.axis) && m.to >= 1 && m.to <= TIER_MAX && m.requires));

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
