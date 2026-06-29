// formation3d.selftest.mjs — factory formation in 3D: the supply chain stratifies into a TOWER (raw low,
// product high), trading footprint for climb. node hoop/forge/test/formation3d.selftest.mjs

import { engineStage, formFactory } from '../formation3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── the supply STAGE gradient (the forward production DAG, reclaim as raw source) ──
const st = engineStage();
ok(st.fulfillment === 0, 'fulfillment is stage 0 (the product exit, by the nave)');
ok(st.assembly === 1, 'assembly is stage 1 (feeds fulfillment directly)');
ok(['mill', 'chemworks', 'fab', 'weave'].every((e) => st[e] === 2), 'the refiners are stage 2 (feed assembly)');
ok(st.foundry > st.mill && st.reclaim >= st.foundry, `raw is deepest: foundry ${st.foundry} > mill ${st.mill}, reclaim ${st.reclaim} the deepest`);

// ── the TOWER stratifies: raw at the bottom (z=0), product at the top ──
const F = formFactory(7);
const bottom = F.byFloor[0], top = F.byFloor[F.byFloor.length - 1];
ok(bottom.every((f) => f.z === 0) && bottom.some((f) => f.engine === 'reclaim'), 'the bottom floor (z=0) holds the reclaim yards (raw / where waste falls)');
ok(top.some((f) => f.engine === 'assembly'), 'the top floor holds assembly (product → the lift → the nave)');
ok(F.nave.z > top[0].z, 'the nave sits above the apex');
// monotone: a facility's height rises as its stage falls (the gradient is vertical)
ok(F.facs.every((f) => f.z >= 0) && Math.max(...F.facs.map((f) => f.z)) === top[0].z, 'height is monotone in stage (a vertical supply gradient)');

// ── the tradeoff: the tower is far more COMPACT but climbs more (honest) ──
const s = F.stats;
ok(s.footprintShrink > 0.5, `the tower's footprint is far smaller than the flat disc (${(s.footprintShrink * 100 | 0)}% narrower)`);
ok(s.tower.footprintR < s.flat.footprintR, `tower radius ${s.tower.footprintR} < flat radius ${s.flat.footprintR}`);
ok(s.costRatio > 1, `…at the cost of more transport — the climb (costRatio ${s.costRatio.toFixed(2)})`);
ok(s.tower.climb > 0, 'the tower extra cost is vertical climb');
// cheaper vertical movement (lower kVert) shrinks the transport penalty
const cheap = formFactory(7, { kVert: 1.2 }).stats, dear = formFactory(7, { kVert: 4 }).stats;
ok(cheap.costRatio < dear.costRatio, `the penalty scales with how dear the climb is (kVert 1.2 → ${cheap.costRatio.toFixed(2)} vs 4 → ${dear.costRatio.toFixed(2)})`);

// deterministic
ok(JSON.stringify(formFactory(7).stats) === JSON.stringify(formFactory(7).stats), 'formFactory is deterministic');

console.log(`\nformation3d.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
