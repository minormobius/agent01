// The action-puzzle engine. A level is a small grid; the player takes discrete
// moves (up/right/down/left); the world transitions deterministically under a
// COMPOSABLE set of mechanics. Toggling which mechanics are present turns the
// same engine into Sokoban, ice mazes, key-dungeons, button-relays,
// collect-a-thons, and hybrids — that breadth is the whole point.
//
// The transition function step() is the heart: it must be deterministic and
// total (a move is either legal → a new state, or illegal → null). The BFS
// solver explores states produced only by step(), so solvability and the
// optimal-solution "answer" are exactly as trustworthy as this function. The
// node test replays the solver's path back through step() to cross-check both.

// base terrain
export const FLOOR = 0, WALL = 1, ICE = 2, PIT = 3, EXIT = 4;
// directions: 0=up 1=right 2=down 3=left
export const DIRS = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export function idx(level, x, y) { return y * level.W + x; }
export function xy(level, i) { return [i % level.W, (i / level.W) | 0]; }
function inBounds(level, x, y) { return x >= 0 && y >= 0 && x < level.W && y < level.H; }

// ---- state (mutable working copy during play/search) ----
// { player:int, boxes:int[] sorted, keys:int(mask), coins:int(mask), filled:int(mask) }
export function initialState(level) {
  return {
    player: level.playerStart,
    boxes: level.boxesStart.slice().sort((a, b) => a - b),
    keys: 0,
    coins: 0,
    filled: 0,
  };
}
function clone(s) { return { player: s.player, boxes: s.boxes.slice(), keys: s.keys, coins: s.coins, filled: s.filled }; }
export function stateKey(s) { return s.player + '|' + s.boxes.join(',') + '|' + s.keys + '|' + s.coins + '|' + s.filled; }

function hasBox(s, i) { return s.boxes.indexOf(i) >= 0; }
function bit(n) { return 1 << n; }

// A button (color c) is held iff the player or any box sits on a button of c.
function gateOpen(level, s, color) {
  for (const b of level.buttons) {
    if (b.color !== color) continue;
    if (s.player === b.idx || hasBox(s, b.idx)) return true;
  }
  return false;
}
function doorOpen(level, s, color) { return (s.keys & bit(color)) !== 0; }

// Can the PLAYER occupy cell i, having arrived moving in direction `dir`?
function playerCanEnter(level, s, i, dir) {
  const b = level.base[i];
  if (b === WALL) return false;
  if (b === PIT && (s.filled & bit(i)) === 0) return false; // unfilled pit blocks the player
  const door = level.doorAt[i];
  if (door >= 0 && !doorOpen(level, s, door)) return false;
  const gate = level.gateAt[i];
  if (gate >= 0 && !gateOpen(level, s, gate)) return false;
  const arrow = level.arrow[i];
  if (arrow >= 0 && arrow !== dir) return false; // one-way: may only be entered moving with the arrow
  return true;
}

// Can a BOX be pushed into cell i? (boxes ignore arrows; obey walls/doors/gates/boxes)
function boxCanEnter(level, s, i) {
  const b = level.base[i];
  if (b === WALL) return false;
  if (hasBox(s, i)) return false;
  const door = level.doorAt[i];
  if (door >= 0 && !doorOpen(level, s, door)) return false;
  const gate = level.gateAt[i];
  if (gate >= 0 && !gateOpen(level, s, gate)) return false;
  return true; // a PIT is enterable by a box → it fills it (handled by caller)
}

// Pick up whatever is on cell i (mutates s).
function pickup(level, s, i) {
  const k = level.keyAt[i];
  if (k >= 0) s.keys |= bit(k);
  const c = level.coinAt[i];
  if (c >= 0) s.coins |= bit(c);
}

// Apply one move. Returns a new state, or null if the move is illegal / a no-op.
export function step(level, state, dir) {
  const dx = DX[dir], dy = DY[dir];
  const [px, py] = xy(level, state.player);
  const tx = px + dx, ty = py + dy;
  if (!inBounds(level, tx, ty)) return null;
  const ti = idx(level, tx, ty);
  const s = clone(state);

  if (hasBox(s, ti)) {
    // pushing a box
    const bx = tx + dx, by = ty + dy;
    if (!inBounds(level, bx, by)) return null;
    const bi = idx(level, bx, by);
    if (level.base[bi] === PIT && (s.filled & bit(bi)) === 0) {
      // box fills the pit and is consumed; player advances onto the box's tile
      s.boxes = s.boxes.filter((b) => b !== ti);
      s.filled |= bit(bi);
    } else {
      if (!boxCanEnter(level, s, bi)) return null;
      s.boxes = s.boxes.filter((b) => b !== ti);
      s.boxes.push(bi);
      s.boxes.sort((a, b) => a - b);
    }
    // (box bundles never contain ice, so no slide for the player here)
    s.player = ti;
    pickup(level, s, ti);
    return s;
  }

  // plain move; ice causes the player to keep sliding in `dir`
  if (!playerCanEnter(level, s, ti, dir)) return null;
  let cur = ti;
  s.player = cur;
  pickup(level, s, cur);
  while (level.base[cur] === ICE) {
    const [cx, cy] = xy(level, cur);
    const nx = cx + dx, ny = cy + dy;
    if (!inBounds(level, nx, ny)) break;
    const ni = idx(level, nx, ny);
    if (hasBox(s, ni) || !playerCanEnter(level, s, ni, dir)) break;
    cur = ni;
    s.player = cur;
    pickup(level, s, cur);
  }
  if (s.player === state.player && s.boxes.join() === state.boxes.join()) return null; // no-op guard
  return s;
}

// Win test: every required sub-goal satisfied.
export function isWin(level, s) {
  if (level.win.boxesOnTargets) {
    for (const t of level.targets) if (!hasBox(s, t)) return false;
  }
  if (level.win.coinsCollected) {
    if (s.coins !== level.allCoinsMask) return false;
  }
  if (level.win.atExit) {
    if (level.base[s.player] !== EXIT) return false;
  }
  return true;
}

// Build the fast lookup arrays a raw level spec needs before play/solve.
// spec: { W,H, base:Int8Array, targets:int[], arrow:Int8Array(-1/dir),
//         doors:[{idx,color}], gates:[{idx,color}], buttons:[{idx,color}],
//         keys:[{idx,color}], coins:int[], boxesStart:int[], playerStart, win, mechanics, bundle, theme }
export function compile(spec) {
  const N = spec.W * spec.H;
  const doorAt = new Int8Array(N).fill(-1);
  const gateAt = new Int8Array(N).fill(-1);
  const keyAt = new Int8Array(N).fill(-1);
  const coinAt = new Int8Array(N).fill(-1);
  for (const d of spec.doors || []) doorAt[d.idx] = d.color;
  for (const g of spec.gates || []) gateAt[g.idx] = g.color;
  for (const k of spec.keys || []) keyAt[k.idx] = k.color;
  (spec.coins || []).forEach((c, i) => { coinAt[c] = i; });
  return {
    ...spec,
    doors: spec.doors || [], gates: spec.gates || [], buttons: spec.buttons || [],
    keys: spec.keys || [], coins: spec.coins || [], targets: spec.targets || [],
    boxesStart: spec.boxesStart || [], arrow: spec.arrow,
    doorAt, gateAt, keyAt, coinAt,
    allCoinsMask: (spec.coins || []).length ? (1 << (spec.coins.length)) - 1 : 0,
  };
}
