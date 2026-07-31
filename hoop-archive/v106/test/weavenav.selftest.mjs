// weavenav.selftest.mjs — v106's ◇ ROUTER: minimal-antechamber-crossing waypoints through the weave.
//
//   node hoop/v106/test/weavenav.selftest.mjs
//
// Pins the navigation contract the deck was built for:
//   • any pocket → any pocket resolves (the weave is one navigable world, no ladders);
//   • a thread and its ring-pair partner meet in ONE shared antechamber (2 crossings);
//   • white → white transfers take 4 crossings — through the CORE (assembly ring) or an
//     interface–hall–interface shortcut, whichever walks shorter (crossings tie);
//   • the NAVE is reached ONLY through the top-floor nexus (… → RA → NX → lift) and the LOWER RIND
//     only through the bottom-floor nexus (… → RR → ND → shaft) — every route's last hops prove it;
//   • the waypoint helper aims at a DOOR IN THE PLAYER'S OWN POCKET (never a far island), and routes
//     resolve analytically BEFORE any chunk solves (the ◇ works while the deck still streams).

import { prepareWeaveDeck, weaveSolveNext, RING_ORDER } from '../rindweave/pocketdeck.js';
import { buildWeaveNav, routeWeave, weaveWaypoint, navLocate, routeBreadcrumb, doorWorldPos } from '../rindweave/weavenav.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const st = prepareWeaveDeck(7, { cx: 24450, cy: 300 });
const nav = buildWeaveNav(st);   // NOTE: built on the UNSOLVED deck — analytic routing only

// ── 1. total reachability, minimal crossings ──
const KEYS = [...RING_ORDER, 'RA', 'RR', 'NX', 'ND'];
let allRoutes = 0, maxCross = 0;
for (const a of KEYS) for (const b of KEYS) {
  if (a === b) continue;
  const r = routeWeave(nav, { key: a, param: 0.5 }, { key: b, param: 0.5 });
  ok(!!r, `route ${a} → ${b} resolves`);
  if (r) { allRoutes++; maxCross = Math.max(maxCross, r.crossings); }
}
ok(maxCross <= 6, `no pocket pair needs more than 6 crossings (worst ${maxCross})`);

// ── 2. the pair shortcut: W_i ↔ P_i through ONE shared beefy antechamber ──
for (let i = 0; i < 6; i++) {
  const r = routeWeave(nav, { key: 'W' + i, param: 0.1 }, { key: 'P' + i, param: 0.1 });
  ok(r && r.crossings === 2 && r.hops[1][0] === 'Z', `W${i} ↔ P${i}: 2 crossings through the shared antechamber (got ${r && r.crossings}: ${r && r.hops.join('→')})`);
}

// ── 3. white → white: 4 crossings, via the core ring or an interface shortcut ──
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
  if (i === j) continue;
  const r = routeWeave(nav, { key: 'W' + i, param: 0.5 }, { key: 'W' + j, param: 0.5 });
  ok(r && r.crossings === 4, `W${i} → W${j} transfers in 4 crossings (got ${r && r.crossings})`);
  const mid = r ? r.hops[2] : '';
  ok(r && (mid === 'RA' || mid === 'RR' || mid[0] === 'P'), `W${i} → W${j} pivots on a ring or an engine hall (got ${mid})`);
}

// ── 4. the vertical rule: nave ONLY via NX, lower rind ONLY via ND ──
for (const a of [...RING_ORDER, 'RA', 'RR']) {
  const up = routeWeave(nav, { key: a, param: 0.5 }, { key: 'NAVE', param: 0 });
  ok(up && up.hops[up.hops.length - 2] === 'NX' && up.hops[up.hops.length - 3] === 'RA', `${a} → nave rides the assembly ring into the top-floor nexus`);
  const dn = routeWeave(nav, { key: a, param: 0.5 }, { key: 'LOWER', param: 0 });
  ok(dn && dn.hops[dn.hops.length - 2] === 'ND' && dn.hops[dn.hops.length - 3] === 'RR', `${a} → lower rind rides the reclaim ring into the bottom-floor nexus`);
}
// the through-descent: nave → lower rind crosses the whole weave, top nexus to bottom nexus
const through = routeWeave(nav, { key: 'NAVE', param: 0 }, { key: 'LOWER', param: 0 });
ok(through && through.hops[1] === 'NX' && through.hops[through.hops.length - 2] === 'ND', `the descent threads NX → … → ND (${through && through.hops.join(' → ')})`);

// ── 5. the ◇ helper aims inside the player's own pocket ──
{
  // player mid-W0, target mid-W3 (both unsolved — analytic door positions)
  const pSlot = st.slots.get('W0');
  const p0 = st.pockets.get('W0').spine[36], p3 = st.pockets.get('W3').spine[36];
  const wp = weaveWaypoint(nav, { key: 'W0', x: p0.x, y: p0.y }, { key: 'W3', x: p3.x, y: p3.y });
  ok(wp && !wp.direct && Number.isFinite(wp.x), 'cross-pocket waypoint resolves to a door');
  // the aimed door must sit in W0's own island (within its slot's reach), not off in W3's
  const dSlot = Math.hypot(wp.x - pSlot.x, wp.y - pSlot.y);
  ok(dSlot < 2400, `the aimed door is in the player's own pocket (${Math.round(dSlot)}u from its slot centre)`);
  ok(typeof routeBreadcrumb(st, wp.hops) === 'string' && routeBreadcrumb(st, wp.hops).includes('→'), 'the journal breadcrumb renders');
  // same pocket → direct aim at the target
  const same = weaveWaypoint(nav, { key: 'W0', x: p0.x, y: p0.y }, { key: 'W0', x: p0.x + 50, y: p0.y + 20 });
  ok(same && same.direct === true, 'same-pocket waypoint aims straight at the target');
}

// ── 5b. AIM HYSTERESIS: a near-tied preferred door is KEPT; a genuinely worse one is dropped ──
{
  // find a white→white pair where two first doors tie on crossings (ring pivot vs interface shortcut)
  let held = 0, dropped = 0, ties = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i === j) continue;
    const p0 = st.pockets.get('W' + i).spine[36];
    const t0 = st.pockets.get('W' + j).spine[36];
    const free = weaveWaypoint(nav, { key: 'W' + i, x: p0.x, y: p0.y }, { key: 'W' + j, x: t0.x, y: t0.y });
    // every alternative first door of the source pocket at the same crossing count is a tie candidate
    for (const d of nav.byPocket.get('W' + i).map((k) => nav.doors[k])) {
      if (d.toKey === free.toKey) continue;
      const withPref = weaveWaypoint(nav, { key: 'W' + i, x: p0.x, y: p0.y }, { key: 'W' + j, x: t0.x, y: t0.y }, { prefer: d.toKey });
      if (withPref && withPref.toKey === d.toKey) { held++; ok(withPref.crossings === free.crossings, `hysteresis never holds a door at a WORSE crossing count (W${i}→W${j} via ${d.toKey})`); }
      else dropped++;
      ties++;
    }
  }
  ok(held > 0, `hysteresis holds near-tied preferred doors (${held}/${ties} preferences held)`);
  ok(dropped > 0, `hysteresis drops genuinely worse preferred doors (${dropped}/${ties} dropped)`);
  // and a preference for a door that does not exist in the pocket is ignored (falls back to the best)
  const p0 = st.pockets.get('W0').spine[36], t0 = st.pockets.get('W3').spine[36];
  const bogus = weaveWaypoint(nav, { key: 'W0', x: p0.x, y: p0.y }, { key: 'W3', x: t0.x, y: t0.y }, { prefer: 'ND' });
  const free = weaveWaypoint(nav, { key: 'W0', x: p0.x, y: p0.y }, { key: 'W3', x: t0.x, y: t0.y });
  ok(bogus && bogus.toKey === free.toKey, 'a preference for a nonexistent door falls back to the best route');
}

// ── 6. solved doors refine the aim: after solving, doorWorldPos returns the placed cell ──
{
  // solve just the first chunks until W0 seg0 exists
  let r; while ((r = weaveSolveNext(st))) { if (r.key === 'W0' && r.si === 0) break; }
  const hubDoor = nav.doors.find((d) => d.key === 'W0' && d.toKey.startsWith('ZA:'));
  const pos = doorWorldPos(st, hubDoor);
  const rec = st.pockets.get('W0').segs[0].rec;
  ok(pos && rec.cells.some((c) => Math.abs(c.x - pos.x) < 0.5 && Math.abs(c.y - pos.y) < 0.5), 'a solved pocket aims the ◇ at the real door cell');
}

console.log(`weavenav.selftest: ${pass} passed, ${fail} failed (${allRoutes} routes checked)`);
if (fail) process.exit(1);
