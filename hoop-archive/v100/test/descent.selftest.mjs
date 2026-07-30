// descent.selftest.mjs — pins "a chute is a port": deck-to-deck linking is the EXISTING location stitch.
//   node hoop/v095/test/descent.selftest.mjs
// Two chunks at the same footprint, tagged different decks, with a shaft port at the same (x,y): buildWalk
// links them ONLY at the shaft, the player can cross, and playerDeckOf flips. No new stitch code.
import { createWorld, addChunk, buildWalk, pathFind, globalOf } from '../v8/manager.js';
import { attachShaft, markRindDeck, playerDeckOf, nearestConcourse } from '../descent.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// minimal chunk record: a 3-cell row of concourse with two boundary edges. (buildWalk needs cells/poly/ports.)
function fakeChunk(cells, ports) {
  return { cells, poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    road: cells.map(() => true), ports,
    // within-chunk adjacency: buildWalk reads ch.adj? No — it builds adjacency from cells+geometry via the
    // chunk's own neighbour info. For this unit we provide a simple `cellAdj` the stub buildWalk path uses.
  };
}

// buildWalk (manager.js) builds within-chunk adjacency from the chunk's mesh; our fakes use EMPTY
// within-chunk adjacency (adj/rooms) so the only links are the cross-chunk PORT stitch — exactly what
// the chute relies on. Two chunks, shaft ports at the same (x,y) → linked nodes.
{
  const A = { id: 0, cells: [{ x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 }], road: [true, true, true],
    adj: [[], [], []], rooms: [],
    poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], ports: [] };
  // sink a shaft on A's middle concourse cell
  const sc = nearestConcourse(A, 50, 50); attachShaft(A, sc.x, sc.y, sc.cell);
  ok('shaft attached as an interior port', A.ports.length === 1 && A.ports[0].shaft && A.ports[0].cell === 1);

  // the lower deck B: same footprint, its own cells, an inherited port that markRindDeck forces to the shaft
  const B = { cells: [{ x: 12, y: 52 }, { x: 52, y: 52 }, { x: 88, y: 52 }], road: [true, true, true],
    adj: [[], [], []], rooms: [],
    poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    ports: [{ x: 52, y: 52, cell: 1, inherited: true }, { x: 0, y: 50, cell: 0, edge: 3 }] };
  markRindDeck(B, 1, { x: sc.x, y: sc.y });
  ok('rind tagged deck 1 + rind', B.deck === 1 && B.rind === true);
  ok('rind stripped to ONLY the shaft port (no spurious edge links)', B.ports.length === 1 && B.ports[0].shaft);
  ok('rind shaft forced to the upper shaft (x,y)', B.ports[0].x === sc.x && B.ports[0].y === sc.y);

  const world = createWorld(); addChunk(world, A); addChunk(world, B);
  const walk = buildWalk(world);
  // the two shaft cells are linked (same port location) → you can path across decks
  const upShaft = globalOf(walk, 0, A.ports[0].cell), downShaft = globalOf(walk, 1, B.ports[0].cell);
  const p = pathFind(walk, upShaft, downShaft);
  ok('walk graph links the shaft across decks (the chute)', Array.isArray(p) && p.length >= 2 && p[0] === upShaft && p[p.length - 1] === downShaft);
  ok('crossing is the existing location stitch (adjacent nodes)', walk.adj[upShaft].includes(downShaft));

  // deck identity flips with the player's node
  ok('player on the upper shaft reads deck 0', playerDeckOf(world, walk, upShaft) === 0);
  ok('player on the lower shaft reads deck 1', playerDeckOf(world, walk, downShaft) === 1);
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
