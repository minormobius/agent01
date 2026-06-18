// import.selftest.mjs — pins the world-export normalizer (hoop/story/import.js): hoopy's schema →
// engine content_item, the axis map, requires parsing, the world manifest, and — the real proof — his
// actual 75-record export imports + passes the full review.js/gates.js/validate.js gate.
// Run: node hoop/test/import.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { importRecord, importWorldExport, parseTier, parseRequires, slug, AXIS_MAP, worldExternal } from '../story/import.js';
import { reviewBatch } from '../story/review.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── primitives ──
ok(parseTier('r1') === 1 && parseTier('p5') === 5 && parseTier(3) === 3 && parseTier('n2') === 2, 'parseTier strips r/n/p prefixes → int');
ok(parseTier('p9') === 5 && parseTier(null) === 1, 'parseTier clamps to 1..5 and defaults to 1');
ok(slug('Brass Axial Sight-Glass') === 'brass-axial-sight-glass', 'slug lowercases + hyphenates');
ok(AXIS_MAP.power_tier === 'revelation_tier' && AXIS_MAP.plot_tier === 'power_tier', 'axis map: his power(r)→revelation, his plot(p)→our power');

// ── requires parsing: gate strings, item: prefix, his object form ──
{
  const r = parseRequires(['flag.player_rebuilt=True', 'item:Brass Axial Sight-Glass']);
  ok(r.facts['flag.player_rebuilt'] === true, 'gate string "x=True" → fact true');
  ok(r.items[0] === 'brass axial sight-glass', 'item: prefix stripped + lowercased');
  const o = parseRequires({ flag: 'curve_noticed=True', item: 'Compass' });
  ok(o.facts['curve_noticed'] === true && o.items[0] === 'compass', 'his {flag,item} object form parses too');
  ok(parseRequires({ facts: { a: true } }).facts.a === true, 'a native blob passes through unchanged');
}

// ── importRecord: his flat record → nested content_item ──
{
  const rec = { name: 'Mnemic-leech', type: 'creature', power_tier: 'r2', narrative_tier: 'n1', plot_tier: 'p3',
    status: 'approved', description: 'a leech', tags: ['bay-14'], refs: ['Bay 14', 'Luna'],
    requires: ['flag.player_rebuilt=True'], produces: { sets: ['flag.x'] }, revelation_hint: 'identity' };
  const ci = importRecord(rec);
  ok(ci.id === 'mnemic-leech' && ci.type === 'creature', 'id derived, type carried');
  ok(ci.revelation_tier === 2 && ci.narrative_tier === 1 && ci.power_tier === 3, 'r2/n1/p3 → rev2/nar1/pow3 (axis-mapped)');
  ok(ci.content.name === 'Mnemic-leech' && ci.content.description === 'a leech', 'flat name/description nested under content');
  ok(ci.approved === true && ci.status === 'active', 'status approved → approved:true + active');
  ok(ci.lane === 'spine' && ci.provider === 'hoopy-export', 'authored canon stamped spine/hoopy-export');
  ok(ci.requires.facts['flag.player_rebuilt'] === true, 'requires normalized onto the engine blob');
  ok(ci.refs.length === 2 && ci.revelation_hint === 'identity' && ci.produces.sets[0] === 'flag.x', 'refs/hint/produces carried first-class');
  ok(importRecord({ name: 'A Whisper', type: 'rumor', status: 'pending' }).approved === false, 'rumor is a valid type; pending → approved:false');
}

// ── THE REAL PROOF: hoopy's actual 75-record export imports + passes the whole gate ──
{
  const wx = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../v096/story/world_export.json'), 'utf8'));
  const { content } = importWorldExport(wx);
  ok(content.length === 75, 'all 75 records import');
  const byType = {}; for (const c of content) byType[c.type] = (byType[c.type] || 0) + 1;
  ok(byType.rumor === 10 && byType.npc === 15 && byType.item === 15, `his type mix preserved (${JSON.stringify(byType)})`);
  ok(content.every((c) => c.content && c.content.name && c.revelation_tier >= 1), 'every item has content + a tier');
  const rep = reviewBatch([], content, [], { external: worldExternal() });
  ok(rep.verdict === 'PASS', `hoopy's canon passes the full gate (verdict ${rep.verdict}, ${rep.conflicts.length} conflicts)`);
  // and WITHOUT the world manifest it correctly flags the runtime-flag orphans (the boundary works both ways)
  ok(reviewBatch([], content, []).verdict === 'BLOCK', 'without the world manifest, the journey-flag gates are (correctly) orphans');
}

console.log(`import.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
