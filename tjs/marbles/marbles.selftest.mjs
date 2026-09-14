#!/usr/bin/env node
// marbles.selftest.mjs — known-answer tests for the /marbles part model and
// marble solver. No three.js, no DOM: everything under test lives in
// marbleworks.js, which is exactly why it lives there.
//
// Run: node tjs/marbles/marbles.selftest.mjs
//
// Credit for the dimensional spec these tests pin: Codetaur (@vibe-coded.com),
// https://github.com/ngwnos/marbles — MIT. See ./CREDITS.md.

import {
  VERTICAL_GRID, CONNECTOR, TRACK, MARBLE, PORT_SPAN, RUN_FLOOR, FALL_THROUGH_POST,
  PARTS, PART_BY_ID, PART_PORTS, partRuns, matingPorts, compatible, poseOnto,
  openPorts, worldPort, SNAP_FIT_TOLERANCE, rotateY,
  buildGraph, spawnMarble, stepMarble, arcTable, sampleAt,
  rollingSpeed, ROLL_FACTOR, G, encodeLayout, decodeLayout,
  PRESETS, newBoard, seed, attachBelow, attachAbove, exitColumn, YAW_STEP, overlaps,
} from './marbleworks.js';

let failed = 0, ran = 0;
const ok = (name, cond, detail = '') => {
  ran++;
  if (cond) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};
const near = (a, b, tol, name) => ok(name, Math.abs(a - b) <= tol, `${a} vs ${b} (±${tol})`);
const group = n => console.log(`\n${n}`);

// ── 1. the ported dimensional grid ───────────────────────────────────────────
group('grid — the ported Marbleworks reconstruction');

ok('rise is the one vertical unit', VERTICAL_GRID.rise === 47);
ok('insertion is below the rise', VERTICAL_GRID.insertion === 15
  && VERTICAL_GRID.insertion < VERTICAL_GRID.rise);
ok('post height = shoulder + insertion', CONNECTOR.postHeight === 62);
near(PORT_SPAN, 140.07141, 1e-4, 'standard ramp diagonal span = hypot(138, 24)');
ok('inlet floor sits one channel depth below the shoulder',
  RUN_FLOOR.in === CONNECTOR.shoulderHeight - TRACK.channelDepth);
ok('a run falls runDrop between its two columns',
  RUN_FLOOR.in - RUN_FLOOR.out === TRACK.runDrop);
ok('fall through a post = rise − runDrop = 34', FALL_THROUGH_POST === 34);
ok('a marble clears the bore', MARBLE.diameter < CONNECTOR.boreDiameter,
  `${MARBLE.diameter} vs ${CONNECTOR.boreDiameter}`);
ok('a marble does not clear the trough walls', MARBLE.diameter < TRACK.channelInsideWidth);
// The marble rests on the flat of the trough floor, not wedged in the fillets:
// its radius exceeds the fillet radius, so the two arcs cannot touch it.
ok('marble rides the trough flat, not the fillets', MARBLE.radius > TRACK.fillet);

group('port table — the two chords the whole lattice is built on');
const twoPort = PART_PORTS.snake;
near(Math.hypot(twoPort[1].x - twoPort[0].x, twoPort[1].z - twoPort[0].z), PORT_SPAN, 1e-6,
  '2-column pieces span exactly one port span');
const three = PART_PORTS.split;
for (let i = 0; i < 3; i++) {
  const a = three[i], b = three[(i + 1) % 3];
  near(Math.hypot(a.x - b.x, a.z - b.z), PORT_SPAN, 1e-6,
    `3-column piece: chord ${i} is one port span`);
}
near(Math.hypot(PART_PORTS.ramp[1].x - PART_PORTS.ramp[0].x,
  PART_PORTS.ramp[1].z - PART_PORTS.ramp[0].z), PORT_SPAN, 1e-6,
  'the ramp diagonal (138 × 24) is the same span');

// ── 2. every part's trough meets its own columns ─────────────────────────────
group('centrelines — every run starts in an inlet cup and ends at a bore');

for (const part of PARTS) {
  const by = Object.fromEntries(part.ports.map(p => [p.id, p]));
  const runs = partRuns(part.id);
  if (!runs.length) { ok(`${part.id}: no runs (support piece)`, part.ground === true); continue; }
  for (const run of runs) {
    const pts = run.points;
    const a = by[run.from], b = by[run.to];
    const finite = pts.every(p => p.every(Number.isFinite));
    ok(`${part.id} ${run.from}>${run.to}: finite`, finite);
    if (part.id === 'start' || part.id === 'finish') {
      // terminal pieces: only the outlet/inlet elevation is pinned
      ok(`${part.id}: descends`, pts[0][1] > pts[pts.length - 1][1]);
      continue;
    }
    near(pts[0][1], a.bottom + RUN_FLOOR.in, 1e-6, `${part.id}: enters at the inlet cup floor`);
    near(pts[pts.length - 1][1], b.bottom + RUN_FLOOR.out, 1e-6, `${part.id}: leaves at the bore floor`);
    near(Math.hypot(pts[0][0] - a.x, pts[0][2] - a.z), 0, 1e-6, `${part.id}: enters over its inlet column`);
    near(Math.hypot(pts[pts.length - 1][0] - b.x, pts[pts.length - 1][2] - b.z), 0, 1e-6,
      `${part.id}: leaves over its outlet column`);
    // monotone descent: a marble must never be asked to roll uphill
    let rises = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i][1] > pts[i - 1][1] + 1e-9) rises++;
    ok(`${part.id}: descends monotonically`, rises === 0, `${rises} rising samples`);
    // no zero-length segments (they would make the tangent undefined)
    let degenerate = 0;
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) < 1e-6) degenerate++;
    }
    ok(`${part.id}: no degenerate samples`, degenerate === 0, `${degenerate}`);
  }
}

// ── 3. the assembly rule ─────────────────────────────────────────────────────
group('assembly — a male in a female puts the upper piece one rise up');

ok('male and female mate; like genders do not',
  compatible({ gender: 'male', axis: 1 }, { gender: 'female', axis: -1 })
  && !compatible({ gender: 'male', axis: 1 }, { gender: 'male', axis: -1 }));

{
  const board = newBoard();
  const top = seed(board, 'ramp', [0, 470, 0], 0);
  const below = attachBelow(board, top, 'out', 'snake', { yaw: YAW_STEP * 2 });
  ok('a piece attaches below an open female', !!below);
  const parentPort = openPorts([top], []).find(p => p.key === 'female:out');
  const childPort = matingPorts('snake')
    .map(p => ({ ...p, position: worldPort(p, below.pose) }))
    .find(p => p.gender === 'male' && p.column === 'in');
  const gap = Math.hypot(...parentPort.position.map((v, i) => v - childPort.position[i]));
  ok('the mated ports coincide inside the socket clearance', gap < SNAP_FIT_TOLERANCE,
    `${gap.toFixed(6)} mm`);
  near(top.pose.position[1] - below.pose.position[1], VERTICAL_GRID.rise, 1e-9,
    'the child hangs exactly one rise below');
  ok('both mated ports leave the open list',
    !openPorts(board.placed, board.connections).some(p =>
      (p.piece === top.id && p.key === 'female:out') || (p.piece === below.id && p.key === 'male:in')));
}

{
  // the mirror: stacking above an open male post
  const board = newBoard();
  const bottom = seed(board, 'ramp', [0, 470, 0], 0);
  // stack onto the lower ramp's INLET post, so the marble is fed into its trough
  const above = attachAbove(board, bottom, 'in', 'snake', { yaw: YAW_STEP * 3 });
  ok('a piece stacks above an open male', !!above);
  near(above.pose.position[1] - bottom.pose.position[1], VERTICAL_GRID.rise, 1e-9,
    'the stacked piece sits exactly one rise up');
  const male = matingPorts('ramp').map(p => ({ ...p, position: worldPort(p, bottom.pose) }))
    .find(p => p.gender === 'male' && p.column === 'in');
  const female = matingPorts('snake').map(p => ({ ...p, position: worldPort(p, above.pose) }))
    .find(p => p.gender === 'female' && p.column === 'out');
  ok('the stacked pair mates', Math.hypot(...male.position.map((v, i) => v - female.position[i]))
    < SNAP_FIT_TOLERANCE);
  // and the marble must now run through the upper piece and into the lower one
  const graph = buildGraph(board.placed, board.connections);
  const m = spawnMarble(graph, above.id, 'in');
  let steps = 0;
  while (m.alive && m.mode !== 'parked' && steps++ < 240 * 30) stepMarble(m, graph, 1 / 240, null);
  ok('a marble runs from the stacked piece into the one below', m.hops >= 1, `${m.hops} hops`);

  {
    // and the honest converse: stacked onto an OUTLET post, the marble drops
    // through the bore it lands in rather than running that piece backwards
    const b2 = newBoard();
    const low = seed(b2, 'ramp', [0, 470, 0], 0);
    const hi = attachAbove(b2, low, 'out', 'snake', { yaw: 0 });
    const g2 = buildGraph(b2.placed, b2.connections);
    const m2 = spawnMarble(g2, hi.id, 'in');
    let n2 = 0;
    while (m2.alive && m2.mode !== 'parked' && n2++ < 240 * 30) stepMarble(m2, g2, 1 / 240, null);
    ok('landing in an outlet bore falls through instead of running uphill',
      m2.hops === 0 && !m2.alive);
  }

  ok('a piece overlaps itself', overlaps(bottom, bottom));
  ok('two pieces a rise apart do not overlap', !overlaps(bottom, above));
}

{
  // yaw must not move the mating point — rotation is about the port, by
  // construction, for every legal 30° step
  let worst = 0;
  for (let k = 0; k < 12; k++) {
    const board = newBoard();
    const top = seed(board, 'ramp', [0, 470, 0], 0);
    const kid = attachBelow(board, top, 'out', 'ramp', { yaw: k * YAW_STEP });
    const parentPort = openPorts([top], []).find(p => p.key === 'female:out');
    const childPort = matingPorts('ramp')
      .map(p => ({ ...p, position: worldPort(p, kid.pose) }))
      .find(p => p.gender === 'male' && p.column === 'in');
    worst = Math.max(worst, Math.hypot(...parentPort.position.map((v, i) => v - childPort.position[i])));
  }
  ok('every 30° yaw step still mates', worst < SNAP_FIT_TOLERANCE, `worst ${worst.toExponential(2)} mm`);
}

// ── 4. the solver against closed form ────────────────────────────────────────
group('solver — a rolling sphere, checked against the textbook');

{
  // One isolated straight ramp. Analytic: a = (5/7)·g·sinθ − μ·g, constant,
  // so v(L) = sqrt(2·a·L). Air drag is ~0.01% of a at these speeds.
  const board = newBoard();
  const ramp = seed(board, 'ramp', [0, 470, 0], 0);
  const graph = buildGraph(board.placed, board.connections);
  const seg = graph.segments.get(`${ramp.id}/in>out`);
  const L = seg.table.total;
  const drop = seg.points[0][1] - seg.points[seg.points.length - 1][1];
  near(drop, TRACK.runDrop, 1e-9, 'the ramp falls exactly runDrop');
  const sinTheta = drop / L;
  const MU = 0.010;   // ROLL_RESIST in marbleworks.js
  const a = ROLL_FACTOR * G * sinTheta - MU * G;
  const analytic = Math.sqrt(2 * a * L);

  let m = spawnMarble(graph, ramp.id, 'in');
  const dt = 1 / 960;
  for (let i = 0; i < 60 * 960 && m.mode === 'roll'; i++) stepMarble(m, graph, dt, null);
  const v = m.carry ?? m.v;
  ok('the marble reached the end of the ramp', m.mode !== 'roll');
  near(v / analytic, 1, 0.02, 'exit speed matches the closed form within 2%');

  // and the frictionless ideal is the well-known sqrt(10gh/7)
  near(rollingSpeed(TRACK.runDrop), Math.sqrt(10 * G * TRACK.runDrop / 7), 1e-9,
    'rollingSpeed() is sqrt(10gh/7)');
  ok('friction makes it slower than the ideal', v < rollingSpeed(drop));
}

{
  // integrator convergence: halving dt must change the answer by less than the
  // difference it already made — first-order, so the error should roughly halve
  const run = dt => {
    const board = newBoard();
    const ramp = seed(board, 'ramp', [0, 470, 0], 0);
    const graph = buildGraph(board.placed, board.connections);
    const m = spawnMarble(graph, ramp.id, 'in');
    for (let i = 0; i < 2e6 && m.mode === 'roll'; i++) stepMarble(m, graph, dt, null);
    return m.carry ?? m.v;
  };
  const coarse = run(1 / 120), mid = run(1 / 480), fine = run(1 / 1920);
  const e1 = Math.abs(coarse - fine), e2 = Math.abs(mid - fine);
  ok('the integrator converges as dt shrinks', e2 < e1 * 0.6,
    `|coarse−fine| ${e1.toFixed(3)}, |mid−fine| ${e2.toFixed(3)}`);
}

{
  // energy: rolling never gains mechanical energy. (½ + ⅕)mv² for a rolling
  // sphere; compare specific energy per unit mass, so m cancels.
  const board = PRESETS.classic.build();
  const graph = buildGraph(board.placed, board.connections);
  const startPiece = board.placed.find(p => p.kind === 'start');
  const m = spawnMarble(graph, startPiece.id, 'out');
  const E = mm => 0.7 * mm.v * mm.v + G * mm.pos[1];
  let worstGain = 0, prev = null;
  for (let i = 0; i < 60 * 240 && m.mode === 'roll'; i++) {
    stepMarble(m, graph, 1 / 240, null);
    if (m.mode === 'roll') {
      const e = E(m);
      if (prev !== null) worstGain = Math.max(worstGain, e - prev);
      prev = e;
    } else prev = null;
  }
  ok('rolling never manufactures energy', worstGain < 1e3,
    `worst per-step gain ${worstGain.toFixed(1)} mm²/s²`);
}

// ── 5. whole runs ────────────────────────────────────────────────────────────
group('runs — every preset delivers its marble to a finish lane');

for (const [key, preset] of Object.entries(PRESETS)) {
  const board = preset.build();
  const graph = buildGraph(board.placed, board.connections);
  const startPiece = board.placed.find(p => p.kind === 'start');
  ok(`${key}: has a starting gate`, !!startPiece);
  let pick = 0;
  const route = () => pick++;              // split: alternate outlets
  const m = spawnMarble(graph, startPiece.id, 'out');
  ok(`${key}: a marble can be released`, !!m);
  let steps = 0;
  const dt = 1 / 240;
  while (m.alive && m.mode !== 'parked' && steps++ < 240 * 90) stepMarble(m, graph, dt, route);
  const finite = m.pos.every(Number.isFinite);
  ok(`${key}: stays finite`, finite);
  ok(`${key}: parks in a finish lane`, m.mode === 'parked',
    `ended '${m.mode}' after ${(steps * dt).toFixed(1)} s, ${m.hops} hops`);
  ok(`${key}: took a plausible time`, steps * dt > 0.5 && steps * dt < 60,
    `${(steps * dt).toFixed(2)} s`);
  ok(`${key}: passed through several pieces`, m.hops >= 3, `${m.hops} hops`);
}

{
  // a branching board must actually branch
  const board = PRESETS.fork.build();
  const graph = buildGraph(board.placed, board.connections);
  const startPiece = board.placed.find(p => p.kind === 'start');
  const ends = [];
  for (let n = 0; n < 2; n++) {
    let pick = n;
    const m = spawnMarble(graph, startPiece.id, 'out');
    let steps = 0;
    while (m.alive && m.mode !== 'parked' && steps++ < 240 * 90) stepMarble(m, graph, 1 / 240, () => pick);
    ends.push(m.pos.map(v => Math.round(v)).join(','));
  }
  ok('the split sends marbles to two different finishes', ends[0] !== ends[1], ends.join(' | '));
}

group('determinism');
{
  const trace = () => {
    const board = PRESETS.classic.build();
    const graph = buildGraph(board.placed, board.connections);
    const s = board.placed.find(p => p.kind === 'start');
    const m = spawnMarble(graph, s.id, 'out');
    const out = [];
    for (let i = 0; i < 2000; i++) { stepMarble(m, graph, 1 / 240, null); if (i % 200 === 0) out.push(m.pos.join(',')); }
    return out.join(';');
  };
  ok('two identical runs produce identical traces', trace() === trace());
}

// ── 6. sampling + serialisation ──────────────────────────────────────────────
group('sampling');
{
  const pts = [[0, 0, 0], [10, 0, 0], [10, 0, 10]];
  const tbl = arcTable(pts);
  near(tbl.total, 20, 1e-9, 'arclength of an L is the sum of its legs');
  const mid = sampleAt(pts, tbl, 10);
  ok('the midpoint lands on the corner', mid.p[0] === 10 && mid.p[2] === 0);
  const t0 = sampleAt(pts, tbl, 0).t;
  near(Math.hypot(t0[0], t0[1], t0[2]), 1, 1e-12, 'tangents are unit length');
  const past = sampleAt(pts, tbl, 1e6);
  ok('sampling past the end clamps', past.p[0] === 10 && past.p[2] === 10);
}

group('layout permalinks');
{
  const board = PRESETS.spiral.build();
  const round = decodeLayout(encodeLayout(board.placed, board.connections));
  ok('piece count survives a round trip', round.placed.length === board.placed.length);
  ok('link count survives a round trip', round.connections.length === board.connections.length);
  let worst = 0;
  for (let i = 0; i < board.placed.length; i++) {
    ok(`piece ${i} keeps its kind`, round.placed[i].kind === board.placed[i].kind);
    for (let k = 0; k < 3; k++) {
      worst = Math.max(worst, Math.abs(round.placed[i].pose.position[k] - board.placed[i].pose.position[k]));
    }
  }
  ok('positions survive to the millimetre', worst <= 0.5, `worst ${worst.toFixed(3)} mm`);
  // and the decoded board still runs
  const graph = buildGraph(round.placed, round.connections);
  const s = round.placed.find(p => p.kind === 'start');
  const m = spawnMarble(graph, s.id, 'out');
  let steps = 0;
  while (m.alive && m.mode !== 'parked' && steps++ < 240 * 90) stepMarble(m, graph, 1 / 240, null);
  ok('a decoded permalink still delivers its marble', m.mode === 'parked');
  ok('an empty hash decodes to an empty board', decodeLayout('').placed.length === 0);

  // sparse ids: a board that has been edited must still round-trip
  const edited = PRESETS.classic.build();
  const victim = edited.placed[4].id;
  edited.placed = edited.placed.filter(p => p.id !== victim);
  edited.connections = edited.connections.filter(c => c.a !== victim && c.b !== victim);
  const back = decodeLayout(encodeLayout(edited.placed, edited.connections));
  ok('sparse piece ids survive a round trip', back.placed.length === edited.placed.length);
  ok('every decoded link names a decoded piece',
    back.connections.every(c => back.placed.some(p => p.id === c.a) && back.placed.some(p => p.id === c.b)));
  ok('the dropped piece takes its links with it',
    back.connections.length === edited.connections.length);
}

group('catalogue integrity');
{
  ok('every part has a port table', PARTS.every(p => Array.isArray(p.ports) && p.ports.length));
  ok('every run names columns that exist', PARTS.every(p =>
    p.runs.every(r => p.ports.some(c => c.id === r.from) && p.ports.some(c => c.id === r.to))));
  ok('part ids are unique', new Set(PARTS.map(p => p.id)).size === PARTS.length);
  ok('exactly one source and one sink kind',
    PARTS.filter(p => p.source).length === 1 && PARTS.filter(p => p.sink).length === 1);
  ok('terminal pieces carry no post', PART_PORTS.start[0].post === false
    && PART_PORTS.funnel[1].post === false);
  ok('a terminal piece exposes no male port',
    !matingPorts('start').some(p => p.gender === 'male'));
  ok('poseOnto refuses an illegal pair',
    poseOnto('ramp', 'male:in', { gender: 'male', axis: 1, position: [0, 0, 0] }, 0) === null);
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} — ${ran - failed}/${ran} checks`);
process.exit(failed ? 1 : 0);
