// genquest.selftest.mjs — pins the v096 client generation lane (hoop/v096/story/genquest.js): profile
// building, the request shaping, and folding an approved arc back into the live store so the
// inference-free engine crystallizes it. The worker POST + persist client are mocked (no network).
// Run: node hoop/test/genquest.selftest.mjs
import { buildProfile, requestSidequest, applyResult, freezeResult } from '../v096/story/genquest.js';
import { MemoryStore, interact } from '../v096/story/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── buildProfile: live world signals → ChunkProfile ──
{
  const p = buildProfile({ role: 'salvage', roomRole: 'make', roomDomain: 'metal', nearbyRoles: ['salvage', 'trade'], tier: 'Healthy' });
  ok(p.roles.salvage === 3, 'focal role (×2) + a nearby same-role (×1) sum into the roles histogram');
  ok(p.domains.metal === 1, 'the room domain enters the domains histogram');
  ok(p.factions.rindwalker >= 3 && p.factions.drift >= 1, 'roles map onto Tabard factions (salvage→rindwalker, trade→drift)');
  ok(p.tier === 'Healthy', 'tier carries through when provided');
}

// ── requestSidequest: posts the right shape, tolerant of failure ──
await (async () => {
  let seen = null;
  const post = async (path, body) => { seen = { path, body }; return { ok: true, verdict: 'PASS', items: [], beats: [] }; };
  const profile = buildProfile({ role: 'mend', roomDomain: 'cloth' });
  const r = await requestSidequest(post, { profile, existing: [{ id: 'sp1' }] });
  ok(seen.path === '/api/story/sidequest', 'requestSidequest hits the worker endpoint');
  ok(seen.body.profile === profile && typeof seen.body.descriptor === 'string' && seen.body.descriptor.length > 0, 'request carries the profile + a derived descriptor');
  ok(seen.body.existing.length === 1, 'request forwards the nearby pool for the gate');
  ok(r.verdict === 'PASS', 'the worker result passes through');

  const throwPost = async () => { throw new Error('offline'); };
  const r2 = await requestSidequest(throwPost, { profile });
  ok(r2.verdict === 'SKIP' && /offline/.test(r2.reason), 'a failed POST degrades to SKIP (procedural fallback)');
})();

// ── applyResult: fold an approved arc into the store, then the engine crystallizes it ──
{
  const store = new MemoryStore([], { features: [] });
  const npc = { id: 'sq-keeper', type: 'npc', revelation_tier: 1, narrative_tier: 1, power_tier: 1, approved: true, status: 'active', tags: ['rindwalker'], content: { name: 'The Latch-Keeper', description: 'guards a sealed hatch' } };
  const lore = { id: 'sq-mark', type: 'lore_fragment', revelation_tier: 1, narrative_tier: 1, power_tier: 1, approved: true, status: 'active', tags: ['rind'], content: { name: 'A Scored Mark', description: 'older than the hatch' } };
  const result = { ok: true, verdict: 'PASS', provider: 'gemini-2.5-flash', genState: 'deadbeef', items: [lore, npc] };

  const { added, principal } = applyResult(store, result);
  ok(added.length === 2, 'both items fold into the store');
  ok(principal === 'sq-keeper', 'the principal is the first NPC (to pin onto the feature)');
  ok(store.contentById('sq-keeper').lane === 'sidequest', 'added content is stamped lane:sidequest (filterable)');

  // the engine now crystallizes the pinned principal onto a feature — proving the fold makes it dispatchable
  store.addFeature({ key: 'weave:1', type: 'npc', label: 'woven', content_id: principal });
  const res = interact(store, 'p1', 'weave:1');
  ok(res.status === 'crystallized' && res.item.content_item_id === 'sq-keeper', 'interact crystallizes the woven NPC onto the feature');

  ok(applyResult(store, { verdict: 'BLOCK', items: [npc] }).added.length === 0, 'a non-PASS result is a no-op (nothing frozen)');
}

// ── freezeResult: optional repo write, guarded + tolerant ──
await (async () => {
  const result = { verdict: 'PASS', items: [{ id: 'sq-a' }, { id: 'sq-b' }] };
  let n = 0;
  const put = async (_client, ci) => { if (++n === 1) throw new Error('rate'); return { uri: 'at://x/' + ci.id }; };
  const r = await freezeResult({ session: 1 }, result, put);
  ok(r.written.length === 1 && r.errors.length === 1, 'freeze is per-item tolerant');
  ok((await freezeResult(null, result, put)).written.length === 0, 'no client ⇒ freeze is a no-op (localStorage stays the durable path)');
})();

console.log(`genquest.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
