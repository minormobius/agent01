// machinehall.js — recast a PRODUCTION thread's rooms as an engine's MACHINE HALL. These floors run a
// PROCESS, not people, so the nave's verb chambers (make/store/dwell…) are the wrong furniture. Each
// engine (engines.js) is a small graph: named machine STEPS, a keystone CORE, FLOW edges wiring them,
// and a topology FAMILY. This maps that process onto the thread's EXISTING rooms — we keep the proven
// partition, walk graph, doors and one-door topology; only the MEANING of the rooms and a set of
// CONVEYOR runs change — so the eight floors read as eight distinct factories:
//
//   • BAYS — the rooms, sorted hub→rim, take the engine's steps in author order (which is flow order:
//     ore→flux→furnace→…), so the process TILES along the strip as many times as the rooms allow — a
//     floor is several production lines. The keystone `core` bay is flagged.
//   • CONVEYORS — every flow edge [a→b] becomes a directed run between the bays assigned a and b IN THE
//     SAME LINE, in the engine's own hue; a back-edge (recycle→reactor, return→pump) is flagged as a
//     RETURN leg. The FAMILY shape falls out of the flow graph for free: foundry (`star`) radiates into
//     its furnace, chemworks (`cycle`) loops, mill (`path`) runs straight, assembly (`intree`) converges,
//     reclaim (`fan`) fans out.
//
// Pure + deterministic (rooms carry positions; we only sort + map — no rng, no Date). The renderer reads
// { bays, conveyors } and the pocket topology is never touched. Node-tested by machinehall.selftest.mjs.

// engine: an ENGINES[…] record (steps[], flow[], core, inAt, outAt, family, color)
// rooms:  [{ idx, u }]  — idx into the chunk's rooms, u = arc position hub→rim (any monotone coordinate)
// → { bays: [{ idx, stepId, name, glyph, fp, core, line, rank }], conveyors: [{ fromIdx, toIdx, line, back, commodity }], lines }
export function machineLayout(engine, rooms, opts = {}) {
  const steps = (engine && engine.steps) || [];
  const S = steps.length;
  if (!S || !rooms || !rooms.length) return { bays: [], conveyors: [], lines: 0 };

  const order = rooms.slice().sort((a, b) => (a.u - b.u) || (a.idx - b.idx));   // hub → rim, stable
  const rankOf = {}; steps.forEach((s, i) => { rankOf[s.id] = i; });
  const bayByLineStep = new Map();   // `${line}:${stepId}` → room idx
  const bays = order.map((r, k) => {
    const st = steps[k % S], line = (k / S) | 0;
    bayByLineStep.set(line + ':' + st.id, r.idx);
    return { idx: r.idx, stepId: st.id, name: st.name, glyph: st.glyph, fp: st.fp ?? 1, core: st.id === engine.core, line, rank: k % S };
  });
  const lines = bays.length ? bays[bays.length - 1].line + 1 : 0;

  const conveyors = [];
  for (let line = 0; line < lines; line++) {
    for (const [a, b] of (engine.flow || [])) {
      const fa = bayByLineStep.get(line + ':' + a), fb = bayByLineStep.get(line + ':' + b);
      if (fa == null || fb == null) continue;   // a partial (rim) line may lack the tail steps
      conveyors.push({ fromIdx: fa, toIdx: fb, line, back: (rankOf[b] ?? 0) <= (rankOf[a] ?? 0) });
    }
  }
  return { bays, conveyors, lines };
}

if (typeof globalThis !== 'undefined') globalThis.RindMachineHall = { machineLayout };
