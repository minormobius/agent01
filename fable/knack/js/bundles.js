// Mechanic bundles — the genres. Each is a coherent subset of mechanics with a
// win condition and a layout recipe. Toggling the bundle is how one engine
// becomes many games. A bundle's build(rand) returns a raw level spec; the
// generator then solves it and keeps it only if the solver vouches for it.
//
// Constraint kept deliberately: ICE and BOXES never share a bundle (their
// interaction is a rabbit hole), so the transition function stays simple and
// every combination that CAN occur is tested.

import { FLOOR, WALL, ICE, PIT, EXIT } from './engine.js';

export const COLORS = ['red', 'blue', 'green', 'amber'];

// ---------- layout helpers ----------
function border(base, W, H) {
  for (let x = 0; x < W; x++) { base[x] = WALL; base[(H - 1) * W + x] = WALL; }
  for (let y = 0; y < H; y++) { base[y * W] = WALL; base[y * W + W - 1] = WALL; }
}
function interiorCells(W, H) {
  const a = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) a.push(y * W + x);
  return a;
}
// draw n distinct cells out of pool (mutates pool)
function take(rand, pool, n) {
  const out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(rand.int(pool.length), 1)[0]);
  return out;
}
function sprinkleWalls(rand, base, pool, frac) {
  const n = Math.floor(pool.length * frac);
  for (const i of take(rand, pool, n)) base[i] = WALL;
}

function baseSpec(W, H) {
  return {
    W, H, base: new Int8Array(W * H).fill(FLOOR), arrow: new Int8Array(W * H).fill(-1),
    targets: [], doors: [], gates: [], buttons: [], keys: [], coins: [], boxesStart: [],
    playerStart: 0, win: {}, mechanics: [],
  };
}

function size(rand, lo, hi) { return rand.range(lo, hi); }

// ---------- bundles ----------

// DEPOT — Sokoban: push every box onto a target.
const depot = {
  id: 'depot', name: 'Depot', theme: 'crates', accent: '#c2792e',
  blurb: 'Push every crate onto a marker. Crates only push, never pull — a crate in a corner is lost.',
  minPar: 5,
  build(rand) {
    const W = size(rand, 6, 8), H = size(rand, 6, 8);
    const sp = baseSpec(W, H); border(sp.base, W, H);
    let pool = interiorCells(W, H);
    sprinkleWalls(rand, sp.base, pool, 0.10);
    pool = pool.filter((i) => sp.base[i] === FLOOR);
    const nBoxes = rand.range(1, 2);
    const cells = take(rand, pool, 1 + nBoxes * 2);
    sp.playerStart = cells[0];
    sp.boxesStart = cells.slice(1, 1 + nBoxes);
    sp.targets = cells.slice(1 + nBoxes, 1 + nBoxes * 2);
    sp.win = { boxesOnTargets: true };
    sp.mechanics = ['box'];
    return sp;
  },
};

// FROST — Ice maze: slide until something stops you; reach the exit.
const frost = {
  id: 'frost', name: 'Frost', theme: 'ice', accent: '#2f8fd6',
  blurb: 'Step onto ice and slide until a wall stops you. Find the route to the exit.',
  minPar: 6,
  build(rand) {
    const W = size(rand, 7, 9), H = size(rand, 7, 9);
    const sp = baseSpec(W, H); border(sp.base, W, H);
    let pool = interiorCells(W, H);
    for (const i of pool) sp.base[i] = ICE;
    // scatter wall stoppers
    sprinkleWalls(rand, sp.base, pool.slice(), 0.16);
    const free = pool.filter((i) => sp.base[i] === ICE);
    const cells = take(rand, free, 2);
    sp.playerStart = cells[0];
    sp.base[cells[1]] = EXIT;
    sp.win = { atExit: true };
    sp.mechanics = ['ice'];
    return sp;
  },
};

// VAULT — colored keys open colored doors; reach the exit.
const vault = {
  id: 'vault', name: 'Vault', theme: 'keys', accent: '#7a55c8',
  blurb: 'Collect a colored key to pass its door. Sequence the unlocks to reach the exit.',
  minPar: 6,
  build(rand) {
    const W = size(rand, 7, 9), H = size(rand, 7, 9);
    const sp = baseSpec(W, H); border(sp.base, W, H);
    let pool = interiorCells(W, H);
    sprinkleWalls(rand, sp.base, pool, 0.12);
    pool = pool.filter((i) => sp.base[i] === FLOOR);
    const nLocks = rand.range(1, 2);
    const need = 2 + nLocks * 2;
    const cells = take(rand, pool, need);
    sp.playerStart = cells[0];
    sp.base[cells[1]] = EXIT;
    for (let c = 0; c < nLocks; c++) {
      sp.keys.push({ idx: cells[2 + c * 2], color: c });
      sp.doors.push({ idx: cells[3 + c * 2], color: c });
    }
    sp.win = { atExit: true };
    sp.mechanics = ['key', 'door'];
    return sp;
  },
};

// RELAY — push a crate onto a button to hold its gate open, then slip through.
const relay = {
  id: 'relay', name: 'Relay', theme: 'circuit', accent: '#2faa84',
  blurb: 'A gate stays open only while a crate weighs down its button. Set it up, then cross.',
  minPar: 6,
  build(rand) {
    const W = size(rand, 7, 8), H = size(rand, 7, 8);
    const sp = baseSpec(W, H); border(sp.base, W, H);
    let pool = interiorCells(W, H);
    sprinkleWalls(rand, sp.base, pool, 0.10);
    pool = pool.filter((i) => sp.base[i] === FLOOR);
    const cells = take(rand, pool, 5);
    sp.playerStart = cells[0];
    sp.base[cells[1]] = EXIT;
    sp.buttons.push({ idx: cells[2], color: 0 });
    sp.gates.push({ idx: cells[3], color: 0 });
    sp.boxesStart = [cells[4]];
    sp.win = { atExit: true };
    sp.mechanics = ['button', 'gate', 'box'];
    return sp;
  },
};

// FORAGE — collect every coin, then reach the exit; one-way arrows complicate routing.
const forage = {
  id: 'forage', name: 'Forage', theme: 'coins', accent: '#cc9a1f',
  blurb: 'Gather every coin before the exit opens. One-way tiles only let you pass one direction.',
  minPar: 8,
  build(rand) {
    const W = size(rand, 7, 9), H = size(rand, 7, 9);
    const sp = baseSpec(W, H); border(sp.base, W, H);
    let pool = interiorCells(W, H);
    sprinkleWalls(rand, sp.base, pool, 0.10);
    pool = pool.filter((i) => sp.base[i] === FLOOR);
    const nCoins = rand.range(3, 5);
    const cells = take(rand, pool, 2 + nCoins);
    sp.playerStart = cells[0];
    sp.base[cells[1]] = EXIT;
    sp.coins = cells.slice(2, 2 + nCoins);
    // a couple of one-way arrows
    const arrowCells = take(rand, pool, rand.range(1, 3));
    for (const a of arrowCells) sp.arrow[a] = rand.int(4);
    sp.win = { coinsCollected: true, atExit: true };
    sp.mechanics = ['coin', 'arrow'];
    return sp;
  },
};

// TANGLE — hybrid: two mechanic families thrown together. The diversity dial.
const tangle = {
  id: 'tangle', name: 'Tangle', theme: 'mixed', accent: '#b5476d',
  blurb: 'A mongrel: two mechanic families at once. The engine still guarantees there is a way through.',
  minPar: 7,
  build(rand) {
    const W = size(rand, 7, 9), H = size(rand, 7, 9);
    const sp = baseSpec(W, H); border(sp.base, W, H);
    let pool = interiorCells(W, H);
    sprinkleWalls(rand, sp.base, pool, 0.10);
    pool = pool.filter((i) => sp.base[i] === FLOOR);
    const cells = take(rand, pool, 2);
    sp.playerStart = cells[0];
    sp.base[cells[1]] = EXIT;
    sp.win = { atExit: true };
    const mech = new Set();
    // pick two non-ice families (ice excluded so boxes stay legal)
    const families = rand.shuffle(['key', 'button', 'coin', 'arrow']).slice(0, 2);
    for (const fam of families) {
      if (fam === 'key') {
        const c = take(rand, pool, 2);
        sp.keys.push({ idx: c[0], color: 0 }); sp.doors.push({ idx: c[1], color: 0 });
        mech.add('key'); mech.add('door');
      } else if (fam === 'button') {
        const c = take(rand, pool, 3);
        sp.buttons.push({ idx: c[0], color: 1 }); sp.gates.push({ idx: c[1], color: 1 });
        sp.boxesStart.push(c[2]); mech.add('button'); mech.add('gate'); mech.add('box');
      } else if (fam === 'coin') {
        const c = take(rand, pool, rand.range(2, 3));
        sp.coins.push(...c); sp.win.coinsCollected = true; mech.add('coin');
      } else if (fam === 'arrow') {
        for (const a of take(rand, pool, rand.range(1, 2))) sp.arrow[a] = rand.int(4);
        mech.add('arrow');
      }
    }
    sp.mechanics = [...mech];
    return sp;
  },
};

export const BUNDLES = [depot, frost, vault, relay, forage, tangle];
export const BUNDLE_BY_ID = Object.fromEntries(BUNDLES.map((b) => [b.id, b]));
export const BUNDLE_WEIGHTS = { depot: 4, frost: 4, vault: 4, relay: 3, forage: 4, tangle: 4 };
