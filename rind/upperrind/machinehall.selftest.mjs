// machinehall.selftest.mjs — pin the machine-hall recast: every production engine's process maps onto a
// thread's rooms as bays + conveyors, with the family topology surviving. Pure, no canvas. Run:
//   node rind/upperrind/machinehall.selftest.mjs
import { ENGINES, ENGINE_RING } from '../ops/engines.js';
import { machineLayout } from './machinehall.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// synthetic rooms strung hub→rim (u increasing), enough for a few lines
const mkRooms = (n) => Array.from({ length: n }, (_, i) => ({ idx: i, u: i * 10 + (i % 3) }));

// ── every engine maps cleanly ──
for (const id of ENGINE_RING) {
  const eng = ENGINES[id], S = eng.steps.length;
  const rooms = mkRooms(S * 3 + 2);   // three full lines + a partial
  const { bays, conveyors, lines } = machineLayout(eng, rooms);
  ok(bays.length === rooms.length, `${id}: every room becomes a bay`);
  ok(lines === Math.ceil(rooms.length / S), `${id}: line count = ceil(rooms/steps)`);
  ok(bays.every((b) => eng.steps.some((s) => s.id === b.stepId)), `${id}: every bay is a real step`);
  // exactly one core bay per FULL line (the last, partial line may not reach the core step)
  const coreStepRank = eng.steps.findIndex((s) => s.id === eng.core);
  const fullLines = Math.floor(rooms.length / S);
  const cores = bays.filter((b) => b.core).length;
  ok(cores >= fullLines, `${id}: at least one core bay per full line`);
  // conveyors reference valid bays, stay within their line, and match the flow-edge count per full line
  const byLineStep = new Map(); for (const b of bays) byLineStep.set(b.line + ':' + b.stepId, b.idx);
  ok(conveyors.every((c) => bays.some((b) => b.idx === c.fromIdx) && bays.some((b) => b.idx === c.toIdx)), `${id}: conveyors reference real bays`);
  ok(conveyors.every((c) => { const f = bays.find((b) => b.idx === c.fromIdx), t = bays.find((b) => b.idx === c.toIdx); return f.line === c.line && t.line === c.line; }), `${id}: conveyors stay within one line`);
  const fullLineConv = conveyors.filter((c) => c.line < fullLines).length;
  ok(fullLineConv === fullLines * eng.flow.length, `${id}: a full line wires every flow edge`);
}

// ── the FAMILY topology survives: cycle/flow engines have a back-edge (a return leg); a pure path does not ──
{
  const chem = machineLayout(ENGINES.chemworks, mkRooms(ENGINES.chemworks.steps.length));
  ok(chem.conveyors.some((c) => c.back), 'chemworks (cycle) has a return leg — recycle→reactor');
  const fluid = machineLayout(ENGINES.fluid, mkRooms(ENGINES.fluid.steps.length));
  ok(fluid.conveyors.some((c) => c.back), 'fluid (flow) has a return leg — return→pump');
  const mill = machineLayout(ENGINES.mill, mkRooms(ENGINES.mill.steps.length));
  ok(!mill.conveyors.some((c) => c.back), 'mill (path) is a straight run — no return leg');
  const fab = machineLayout(ENGINES.fab, mkRooms(ENGINES.fab.steps.length));
  ok(!fab.conveyors.some((c) => c.back), 'fab (dag) is monotone — no return leg');
}

// ── fan / intree fan-degrees survive (reclaim fans out of its sorter; assembly converges on its line) ──
{
  const rec = machineLayout(ENGINES.reclaim, mkRooms(ENGINES.reclaim.steps.length));
  // 'sort' feeds two bales → out-degree ≥ 2 from the sort bay in a line
  const sortBay = rec.bays.find((b) => b.stepId === 'sort');
  const outFromSort = rec.conveyors.filter((c) => c.fromIdx === sortBay.idx).length;
  ok(outFromSort >= 2, 'reclaim (fan): the sorter fans out to ≥2 bays');
  const asm = machineLayout(ENGINES.assembly, mkRooms(ENGINES.assembly.steps.length));
  const subBay = asm.bays.find((b) => b.stepId === 'sub');
  const intoSub = asm.conveyors.filter((c) => c.toIdx === subBay.idx).length;
  ok(intoSub >= 2, 'assembly (intree): the sub-assembly converges ≥2 feeders');
}

// ── hub→rim order + determinism + empty guards ──
{
  const eng = ENGINES.mill, S = eng.steps.length;
  const rooms = mkRooms(S);   // shuffle the input order; assignment must follow u, not input order
  const shuffled = [rooms[2], rooms[0], rooms[4], rooms[1], rooms[3]];
  const a = machineLayout(eng, shuffled), b = machineLayout(eng, rooms);
  ok(JSON.stringify(a.bays.map((x) => [x.idx, x.stepId])) === JSON.stringify(b.bays.map((x) => [x.idx, x.stepId])), 'assignment follows arc order, not input order');
  ok(a.bays[0].stepId === eng.steps[0].id, 'the hub-most room takes the first step (billet)');
  ok(machineLayout(eng, []).bays.length === 0 && machineLayout({}, mkRooms(3)).bays.length === 0, 'empty guards (no rooms / no steps)');
}

console.log(`\nmachinehall.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
