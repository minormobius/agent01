#!/usr/bin/env node
// period.selftest.mjs — brut through the centuries: a city building's shell in its period.
//
//   node tjs/brut/period.selftest.mjs
import { shell, masonry, maxStoreys, elevation, classify, PERIODS, PERIOD_IDS } from './period.js';
import { generate, standing, PRESENT } from '../../packages/morph/morph.js';

let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };
const rect = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];
const house = (w, n, id = 0, style = 'georgian', d = 13) => shell({ footprint: rect(w, d), front: [[0, 0], [w, 0]], storeys: n, style, seed: 7, id });

// determinism, and no unseeded randomness
{
  const a = JSON.stringify(house(6.8, 4, 3)), b = JSON.stringify(house(6.8, 4, 3));
  const R = Math.random; Math.random = () => { throw new Error('Math.random'); };
  let pure = true; try { for (const p of PERIOD_IDS) house(9, 4, 1, p); } catch { pure = false; }
  Math.random = R;
  ok(a === b && pure, 'deterministic, and every period builds with Math.random removed');
}

// the Georgian terrace house: its section and its face
{
  const sh = house(6.8, 4), f = sh.walls.find((w) => w.kind === 'front');
  const tallest = (name) => Math.max(...f.openings.filter((o) => o.storey === name && o.kind === 'sash').map((o) => o.z1 - o.z0));
  const H = ['ground', 'first', 'second', 'third'].map(tallest);
  ok(H[1] > H[0] && H[1] > H[2] && H[2] > H[3], `the piano nobile: first-floor windows the tallest (${H.map((h) => h.toFixed(2)).join(' / ')} m), shortening floor by floor above it`);
  const storeyH = Object.fromEntries(sh.storeys.map((s) => [s.name, s.h]));
  ok(storeyH.first > storeyH.ground && storeyH.first > storeyH.second, `and the first floor is the tallest storey (${storeyH.first} m)`);
  const ground = sh.storeys.find((s) => s.name === 'ground'), base = sh.storeys.find((s) => s.basement);
  ok(base && ground.z0 > 1 && base.z0 < 0, `the ground floor raised ${ground.z0.toFixed(1)} m over a basement ${(-base.z0).toFixed(1)} m down in its area`);
  const door = f.openings.find((o) => o.kind === 'door'), bays = f.bays.length;
  const mirror = house(6.8, 4, 1).walls.find((w) => w.kind === 'front').openings.find((o) => o.kind === 'door');
  ok(bays === 3 && door && door.fan > 0 && (door.x0 < 2 || door.x1 > 4.8) && Math.sign(door.x0 - 3.4) !== Math.sign(mirror.x0 - 3.4), `three bays; the door in an end bay under a fanlight, and the next house mirrors it (doors pair across the party wall)`);
  let narrow = 0;
  for (const s of ['ground', 'first', 'second', 'third']) {
    const os = f.openings.filter((o) => o.storey === s).sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < os.length; i++) if (os[i + 1].x0 - os[i].x1 < 0.85 * Math.min(os[i].x1 - os[i].x0, 1.0)) narrow++;
  }
  ok(narrow === 0, 'a load-bearing front: the pier between two windows is never much narrower than a window');
  ok(sh.walls.filter((w) => w.kind === 'party').every((w) => w.openings.length === 0) && sh.walls.filter((w) => w.kind === 'party').length === 2, 'its two party walls are blind');
  const kinds = new Set(f.bands.map((b) => b.kind));
  ok(['stucco', 'string course', 'cornice', 'parapet'].every((k) => kinds.has(k)) && f.balconies.length >= 3, `dressed as one: ${[...kinds].join(', ')}; ${f.balconies.length} balconettes at the first floor`);
  const odd = [8.5, 10, 11.5].map((w) => house(w, 4).walls.find((x) => x.kind === 'front').bays.length);
  ok(odd.every((n) => n % 2 === 1), `composed about a centre: wider fronts take an odd number of bays (${odd.join(', ')})`);
}

// every opening stays on its wall, and none overlap
{
  let bad = 0, n = 0;
  for (const p of PERIOD_IDS) for (const w of [5.5, 7, 10, 14]) for (const st of [1, 2, 3, 5, 8]) {
    const sh = house(w, st, st, p);
    for (const wall of sh.walls) {
      const os = wall.openings;
      for (const o of os) { n++; if (o.x0 < -1e-9 || o.x1 > wall.length + 1e-9 || o.z1 > wall.top + 1e-9 || o.x1 <= o.x0 || o.z1 <= o.z0) bad++; }
      for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) {
        const a = os[i], b = os[j];
        if (a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6) bad++;
      }
    }
  }
  ok(bad === 0, `every opening inside its wall and below its top, none overlapping (${n} openings, ${PERIOD_IDS.length} periods)`);
}

// load-bearing masonry: the height a period could build to is a consequence
{
  const g4 = house(6.8, 4).structure, g8 = house(6.8, 8).structure;
  ok(g4.ok && !g8.ok, `a four-storey Georgian house stands (worst ${(g4.worst * 100).toFixed(0)}% of the allowable); an eight-storey one does not (${(g8.worst * 100).toFixed(0)}%)`);
  const cap = maxStoreys('georgian', 6.8, 13), capW = maxStoreys('georgian', 10, 13);
  const wide = house(10.3, 4).structure;
  ok(cap >= 4 && cap <= 7 && capW >= 4 && wide.joists === 'front to spine', `a brick terrace tops out at ${cap} storeys on a 6.8 m plot (joists party to party); a 10 m house turns its joists front to back onto a spine and reaches ${capW}`);
  const h6 = house(12, 6, 0, 'haussmann', 15).structure;
  ok(h6.ok && maxStoreys('haussmann', 12, 15) >= 8, `a six-storey Haussmann block stands in dressed stone (worst ${(h6.worst * 100).toFixed(0)}%): stone could go to ${maxStoreys('haussmann', 12, 15)}, so what held Paris at six was the 1859 height rule, not the wall`);
  const ps = g4.storeys.map((s) => s.partyStress);
  ok(ps.every((v, i) => i === 0 || v <= ps[i - 1] + 1e-9 || g4.storeys[i].t < g4.storeys[i - 1].t), 'the party-wall load grows downward (thickness steps aside)');
  ok(!house(9, 6, 0, 'modern').structure && !house(9, 20, 0, 'glass').structure, 'a frame or a curtain wall is not checked as masonry: its face carries nothing');
}

// on a real city's plots: every standing building gets a shell in its period
{
  const c = generate({ seed: 5 }), now = standing(c, PRESENT).buildings;
  let made = 0, fronts = 0, frontWithWindows = 0, corners = 0, off = 0, thrown = 0;
  for (const b of now) {
    const f = c.frontages[b.frontage], lot = c.blocks[f.block].lot;
    try {
      const sh = shell({ footprint: b.footprint, front: [f.a, f.q], storeys: b.storeys, style: b.style, seed: c.seed, id: b.id }, { lot });
      made++;
      const fr = sh.walls.filter((w) => w.kind === 'front');
      if (fr.length) { fronts++; if (fr.some((w) => w.openings.length)) frontWithWindows++; }
      if (sh.walls.some((w) => w.kind === 'side' && w.openings.length && !PERIODS[b.style].attached)) corners++;
      if (Math.abs(sh.eaves - b.height) / b.height > 0.45) off++;
    } catch { thrown++; }
  }
  ok(thrown === 0 && made === now.length, `a shell for every one of the ${now.length} buildings standing in a city`);
  ok(frontWithWindows >= fronts * 0.97, `${frontWithWindows} of ${fronts} street fronts have openings`);
  ok(corners > 10, `${corners} detached buildings have windows down their sides (an attached one shares them)`);
  ok(off <= now.length * 0.05, `the period's own storey heights stay near the city's (${off} of ${now.length} differ by more than 45%)`);
  const sh = shell({ footprint: now[0].footprint, front: [c.frontages[now[0].frontage].a, c.frontages[now[0].frontage].q], storeys: now[0].storeys, style: now[0].style, seed: 5, id: now[0].id });
  ok(elevation(sh, 0).length >= 1 && elevation(sh, 0)[0].kind === 'wall', 'and each wall draws as an elevation');
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
