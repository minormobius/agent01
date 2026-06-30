// wayfind.selftest.mjs — THE VALIDATION CERTIFICATE for the whole ops construction. Routing exercises the
// chambers + doors + stairs and proves the load-bearing claim: the two hubs are joined ONLY through the weave.
//   Run: node rind/ops/test/wayfind.selftest.mjs

import { buildFoam3D, FACTIONS } from '../foam3d.js';
import { buildNav, route, certify } from '../wayfind.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildFoam3D(3);

// ── factions: 3 × 2 white-collar roles (representation), mapped to the nave lobes ──
ok(FACTIONS.length === 3 && FACTIONS.every((f) => f.roleIds.length === 2), '3 factions, two white-collar roles each');
ok(m.warps.length === 6 && m.warps.every((w) => w.faction), 'every white arm belongs to a faction');
ok(['rindwalker', 'continuant', 'drift'].every((id) => m.warps.filter((w) => w.faction === id).length === 2), 'each nave faction is represented by 2 arms');
// faction-contiguous placement (each faction owns adjacent arm indices → a sector)
for (const f of FACTIONS) { const idx = m.warps.filter((w) => w.faction === f.id).map((w) => w.w).sort((a, b) => a - b); ok(idx[1] === idx[0] + 1, `${f.label} owns a contiguous sector (arms ${idx})`); }

// ── the nav graph: doors + stairs ──
const nav = buildNav(m);
ok(nav.N === m.nuclei.length, 'nav graph covers every chamber');
ok(m.nuclei.filter((n) => !n.hub).every((n) => nav.stair[n.i] >= 0), 'every non-hub chamber has a stair (the facility)');
ok(m.nuclei.filter((n) => n.hub).every((n) => nav.stair[n.i] === -1), 'hub chambers have NO stair');

// ── a route between two ordinary chambers exists and is a real path ──
const body = m.nuclei.filter((n) => !n.hub);
const r = route(nav, body[0].i, body[body.length - 1].i);
ok(r && r.path.length >= 2 && r.path[0] === body[0].i, 'a route between two chambers is a real path');
ok(r.doors + r.stairs === r.path.length - 1, 'route steps are all doors or stairs');

// ── THE CERTIFICATE ──
const c = certify(m);
ok(c.connected, 'the whole floor is ONE navigable space (every chamber reachable via doors+stairs)');
ok(!c.hubsDirect, 'the white hub and production hub share NO direct edge');
ok(c.throughWeave, 'white hub → production hub is FORCED through the weave (the route crosses ≥1 stair)');
ok(c.hubRoute && c.hubRoute.stairs >= 1, `the hub-to-hub route climbs ${c.hubRoute ? c.hubRoute.stairs : 0} stair(s) — never a direct shaft`);
ok(c.reachAll, 'representation: from the white hub the cortex can route to every production line');
ok(c.ok, 'CERTIFIED: connected · hubs-only-through-weave · all production reachable');

// ── it holds across the whole family (the structure is robust, not a lucky seed) ──
let bad = 0; for (let sd = 1; sd <= 30; sd++) { if (!certify(buildFoam3D(sd)).ok) bad++; }
ok(bad === 0, 'the certificate holds for all 30 sampled seeds');

console.log(`wayfind.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
