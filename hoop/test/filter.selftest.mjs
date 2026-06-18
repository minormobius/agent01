// filter.selftest.mjs — pins the pool filter projection (hoop/story/filter.js): the totally-filterable
// quasi-database (lane / provider / tier views) + provenance stamping + spine-wins merge.
// Run: node hoop/test/filter.selftest.mjs
import { poolFilter, laneOf, providerOf, stampProvenance, mergePools } from '../story/filter.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const pool = [
  { id: 'sp1', type: 'npc', lane: 'spine', provider: 'authored', approved: true, revelation_tier: 1, tags: ['drift'] },
  { id: 'sp2', type: 'lore_fragment', provider: 'authored', approved: true, revelation_tier: 4, tags: ['rind'] },   // lane absent ⇒ spine
  { id: 'sq1', type: 'npc', lane: 'sidequest', provider: 'gemini-2.5-flash', approved: true, revelation_tier: 2, tags: ['drift'] },
  { id: 'sq2', type: 'item', lane: 'sidequest', provider: 'local:qwen', approved: false, revelation_tier: 2, tags: ['salvage'] },
];

// ── lane / provenance defaults ──
ok(laneOf(pool[1]) === 'spine', 'absent lane defaults to spine (back-compat)');
ok(providerOf(pool[1]) === 'authored', 'absent provider defaults to authored');

// ── lane filter ──
ok(poolFilter(pool, { lane: 'spine' }).map((c) => c.id).join() === 'sp1,sp2', 'lane:spine keeps only spine (incl. lane-absent)');
ok(poolFilter(pool, { lane: 'sidequest' }).map((c) => c.id).join() === 'sq1,sq2', 'lane:sidequest keeps only side-quests');
ok(poolFilter(pool, {}).length === 4, 'no spec ⇒ pass-through (keep everything)');
ok(poolFilter(pool, { lane: 'all' }).length === 4, "lane:'all' keeps both lanes");

// ── provider filter: rip out the experimental local model wholesale ──
ok(poolFilter(pool, { providers: { deny: ['local:*'] } }).every((c) => providerOf(c) !== 'local:qwen'), 'deny local:* drops the local-model item');
ok(poolFilter(pool, { providers: { allow: ['authored'] } }).map((c) => c.id).join() === 'sp1,sp2', 'allow:[authored] keeps only hand-authored');
ok(poolFilter(pool, { providers: { deny: ['gemini-2.5-flash'] } }).every((c) => c.id !== 'sq1'), 'exact-match deny drops the gemini item');

// ── tier / approval / type axes ──
ok(poolFilter(pool, { maxRevelation: 2 }).every((c) => (c.revelation_tier || 1) <= 2), 'maxRevelation clamps the view');
ok(poolFilter(pool, { approved: true }).map((c) => c.id).join() === 'sp1,sp2,sq1', 'approved:true drops the unapproved side-quest');
ok(poolFilter(pool, { types: ['npc'] }).map((c) => c.id).join() === 'sp1,sq1', 'types filter keeps only npcs');
ok(poolFilter(pool, { tagsAny: ['drift'] }).map((c) => c.id).join() === 'sp1,sq1', 'tagsAny keeps items carrying any listed tag');

// ── composition: a realistic engine view (spine, approved, tier-legal, no experimental) ──
{
  const view = poolFilter(pool, { lane: 'spine', approved: true, providers: { deny: ['local:*'] } });
  ok(view.map((c) => c.id).join() === 'sp1,sp2', 'composed filter yields the canon engine view');
  ok(pool.length === 4, 'filter is non-mutating (input pool intact)');
}

// ── stampProvenance ──
{
  const raw = { id: 'g1', type: 'npc', content: { name: 'X' } };
  const s = stampProvenance(raw, { provider: 'gemini-2.5-flash', genState: 'x'.repeat(400) });
  ok(s.lane === 'sidequest', 'stamp defaults lane to sidequest');
  ok(s.provider === 'gemini-2.5-flash', 'stamp sets provider');
  ok(s.genState.length === 256, 'stamp clamps genState to 256 chars');
  ok(raw.lane === undefined, 'stamp does not mutate the input');
  ok(stampProvenance(raw, { lane: 'spine' }).lane === 'spine', 'stamp can mark spine');
}

// ── mergePools: spine wins on id collision, collisions reported ──
{
  const spine = [{ id: 'a', lane: 'spine' }, { id: 'b', lane: 'spine' }];
  const side = [{ id: 'b', lane: 'sidequest' }, { id: 'c', lane: 'sidequest' }];
  const { content, collisions } = mergePools(spine, side);
  ok(content.map((c) => c.id).join() === 'a,b,c', 'merge unions ids');
  ok(content.find((c) => c.id === 'b').lane === 'spine', 'spine wins the id-b collision');
  ok(collisions.join() === 'b', 'the collision is reported, not applied');
  ok(mergePools(spine, []).content.length === 2, 'merge with no side-quests is the spine');
}

console.log(`filter.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
