// The micro-engine the foundry's laws run on. Deliberately more general in
// STATE than morph's (a mutable mark layer + dynamic walls + a step counter)
// and more general in LAW (the transition comes from the DSL, not from code I
// wrote) — but identical in discipline: deterministic, total, and searched by
// the same one BFS oracle.

export const DIRS = [0, 1, 2, 3];        // N E S W
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export function makeWorld(W, H, opts = {}) {
  const wrap = !!opts.wrap;              // torus or bounded grid
  const walls = opts.walls || new Uint8Array(W * H);
  return {
    W, H, wrap, walls,
    exit: opts.exit ?? -1,
    tokens0: opts.tokens || [],
    marks0: opts.marks0 || [],
    goal: opts.goal || { type: 'exit' },
    agent0: opts.agent0 ?? 0,
    stepCell(c, d) {
      let x = c % W + DX[d], y = (c / W | 0) + DY[d];
      if (wrap) { x = (x + W) % W; y = (y + H) % H; }
      else if (x < 0 || x >= W || y < 0 || y >= H) return -1;
      return y * W + x;
    },
  };
}

export function initialState(world) {
  return {
    agent: world.agent0, dir: 1, steps: 0,
    marks: new Set(world.marks0),
    dynWalls: new Set(),
    tokens: new Set(world.tokens0),
  };
}

export function stateKey(s) {
  return s.agent + '.' + s.dir + '.' + (s.steps % 2) + '|' +
    [...s.marks].sort((a, b) => a - b).join(',') + '|' +
    [...s.dynWalls].sort((a, b) => a - b).join(',') + '|' +
    [...s.tokens].sort((a, b) => a - b).join(',');
}

export function isWin(world, s) {
  switch (world.goal.type) {
    case 'exit': return s.agent === world.exit;
    case 'collect': return s.tokens.size === 0 && (world.goal.thenExit ? s.agent === world.exit : true);
    case 'inkAll': { // every non-wall cell inked (the law must be able to ink!)
      for (let c = 0; c < world.W * world.H; c++) {
        if (world.walls[c]) continue;
        if (!s.marks.has(c) && !s.dynWalls.has(c) && c !== s.agent) return false;
      }
      return true;
    }
    default: return false;
  }
}

// ---- the one oracle, again: BFS over whatever law the foundry minted ----
export function solve(world, stepFn, opts = {}) {
  const cap = opts.cap ?? 150000;
  const start = initialState(world);
  if (isWin(world, start)) return { solvable: true, par: 0, path: [], nodes: 1, capped: false };
  const seen = new Map();
  seen.set(stateKey(start), null);
  let frontier = [start], depth = 0, nodes = 1;
  while (frontier.length) {
    const next = [];
    depth++;
    for (const s of frontier) {
      for (const d of DIRS) {
        const ns = stepFn(world, s, d);
        if (!ns) continue;
        const k = stateKey(ns);
        if (seen.has(k)) continue;
        seen.set(k, { parent: stateKey(s), dir: d, state: ns });
        nodes++;
        if (isWin(world, ns)) {
          const path = [];
          let cur = k;
          while (cur) { const r = seen.get(cur); if (!r) break; path.push(r.dir); cur = r.parent; }
          return { solvable: true, par: depth, path: path.reverse(), nodes, capped: false };
        }
        next.push(ns);
        if (nodes > cap) return { solvable: false, par: -1, path: null, nodes, capped: true };
      }
    }
    frontier = next;
  }
  return { solvable: false, par: -1, path: null, nodes, capped: false };
}
