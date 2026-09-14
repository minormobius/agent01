// marbleworks.js — the parametric part model behind /marbles.
//
// ─────────────────────────────────────────────────────────────────────────────
// ACCREDITATION
//
// This bench is a re-implementation of the marble-run builder concept by
// **Codetaur** (@vibe-coded.com on Bluesky):
//
//   post   https://bsky.app/profile/vibe-coded.com/post/3mvhbk3xyh22r
//   repo   https://github.com/ngwnos/marbles          (MIT, © 2026 ngwnos)
//   live   https://marbles.vibe-coded.com/
//
// The idea, the piece vocabulary, and — critically — the **dimensional
// reconstruction** are theirs. Codetaur reconstructed the Discovery Toys
// Marbleworks parts from reference photographs with a parametric modeller and
// published the fitted numbers under MIT. The constants in the SPEC section
// below, and the port table in PART_PORTS, are ported verbatim from that work
// (`src/pieces/marbleworks-spec.ts` and `src/generated/component-alignment.json`).
// The port/snap model below (`matingPorts`/`compatible`/`poseOnto`) follows
// their `src/assembly/snapping.ts`.
//
// What is ours: the no-build plain-three.js port, the swept-trough geometry,
// the curvilinear marble solver, and the touch-first builder. Their original
// uses React + WebGPU/TSL + Manifold + a Box3D wasm rigid-body solve; none of
// that survives a phone browser without a build step, which is the whole reason
// this bench exists. Full notice and the MIT text: ./CREDITS.md
// ─────────────────────────────────────────────────────────────────────────────
//
// Pure data + maths. No three.js, no DOM — so marbles.selftest.mjs can run the
// whole thing under node. The renderer imports from here; it never redefines a
// dimension of its own.

// ── SPEC ────────────────────────────────────────────────────────── (ported) ──
// All dimensions in millimetres. Source: marbleworks-spec.ts.

/** The one vertical unit the whole system is built on. Every mating elevation
 *  is a multiple of `rise`; `insertion` is how far a male tip enters a socket
 *  above it — the exposed tip is NOT the stacking datum, the shoulder is. */
export const VERTICAL_GRID = { rise: 47, insertion: 15 };

export const CONNECTOR = {
  postDiameter: 27,
  maleDiameter: 24,
  boreDiameter: 21,     // > marble dia: a marble falls down through a post
  socketDiameter: 24.2,
  wall: 1.5,
  shoulderHeight: VERTICAL_GRID.rise,                          // 47
  postHeight: VERTICAL_GRID.rise + VERTICAL_GRID.insertion,    // 62
};

export const TRACK = {
  channelInsideWidth: 20,
  channelDepth: 17,
  /** Trough floor at an inlet cup, measured from the piece's own bottom. */
  inletFloor: CONNECTOR.shoulderHeight - 17,                   // 30
  /** Fitted floor-to-floor fall of the accepted standard ramp. */
  runDrop: 13,
  fillet: 5.5,
};

/** 15.9 mm cat's-eye. Fits the 21 mm bore with 5.1 mm to spare. */
export const MARBLE = { diameter: 15.9, radius: 7.95 };

/** The diagonal a standard ramp spans between its two connector columns. */
export const PORT_SPAN = Math.hypot(138, 24);                  // 140.0714…

/** Floor height, above a piece's own bottom, where a run ENTERS (inlet cup)
 *  and where it LEAVES (having fallen `runDrop`) at a connector column. */
export const RUN_FLOOR = { in: TRACK.inletFloor, out: TRACK.inletFloor - TRACK.runDrop };

/** Vertical gap a marble free-falls down a post, piece to piece. Written out
 *  so the arithmetic is auditable rather than a magic 34:
 *    upper piece exit floor  = Y + RUN_FLOOR.out       = Y + 17
 *    lower piece origin      = Y - rise                = Y - 47
 *    lower piece inlet floor = Y - rise + RUN_FLOOR.in = Y - 17
 *    fall                    = rise - runDrop          = 34 */
export const FALL_THROUGH_POST = VERTICAL_GRID.rise - TRACK.runDrop; // 34

// ── PORT TABLE ─────────────────────────────────────────────────── (ported) ──
// Plan position [x, z] and the piece-local bottom elevation of each connector
// column, from component-alignment.json. `post: false` means the column has no
// male tip above it — a terminal piece nothing can stack on.
//
// A column at bottom b contributes TWO mating ports:
//   female  at y = b            (a socket facing down; accepts the piece below)
//   male    at y = b + rise     (a post facing up;    accepted by the piece above)
// Two pieces connect when one's female coincides with the other's male, which
// puts the upper piece exactly one rise above the lower. That is the entire
// assembly rule.

const R3 = 80.87026647662293;   // 3-port radius; chord = R3·√3 = PORT_SPAN
const R2 = 70.03570517957252;   // 2-port half-span = PORT_SPAN / 2

export const PART_PORTS = {
  base:    [{ id: 'a', x: -12, z: 0, bottom: 0 }],
  spacer:  [{ id: 'a', x: 0, z: 0, bottom: 0 }],
  ramp:    [{ id: 'in', x: -69, z: -24, bottom: 0 }, { id: 'out', x: 69, z: 0, bottom: 0 }],
  snake:   [{ id: 'in', x: -R2, z: 0, bottom: 0 }, { id: 'out', x: R2, z: 0, bottom: 0 }],
  bumper:  [{ id: 'in', x: -R2, z: 0, bottom: 0 }, { id: 'out', x: R2, z: 0, bottom: 0 }],
  maze:    [{ id: 'in', x: -R2, z: 0, bottom: 0 }, { id: 'out', x: R2, z: 0, bottom: 0 }],
  hairpin: [{ id: 'in', x: -R2, z: 0, bottom: VERTICAL_GRID.rise }, { id: 'out', x: R2, z: 0, bottom: 0 }],
  paddle:  [{ id: 'in', x: -69, z: -24, bottom: VERTICAL_GRID.rise }, { id: 'out', x: 69, z: 0, bottom: 0 }],
  split:   [
    { id: 'in', x: R3, z: 0, bottom: 0 },
    { id: 'l', x: -R3 / 2, z: R3 * Math.sqrt(3) / 2, bottom: 0 },
    { id: 'r', x: -R3 / 2, z: -R3 * Math.sqrt(3) / 2, bottom: 0 },
  ],
  funnel:  [{ id: 'in', x: -136.12861565446116, z: -33, bottom: VERTICAL_GRID.rise },
            { id: 'out', x: 0, z: 0, bottom: 0, post: false }],
  start:   [{ id: 'out', x: 0, z: 0, bottom: 0, post: false }],
  finish:  [{ id: 'in', x: 0, z: 0, bottom: 0 }],
};

// ── PART CATALOGUE ────────────────────────────────────────────────── (ours) ──
// Each part declares its columns (above) plus the trough centrelines a marble
// can run. A run goes from one column's inlet cup to another column's bore.
// `shape` names the centreline generator in CENTRELINES.

const P = (id, name, blurb, color, shape, runs, opts = {}) =>
  ({ id, name, blurb, color, shape, runs, ports: PART_PORTS[id], ...opts });

export const PARTS = [
  P('start', 'Starting gate', 'Releases marbles. Every run begins here.', 0x39d6c8, 'start',
    [{ from: 'out', to: 'out' }], { source: true }),
  P('ramp', 'Standard ramp', 'The workhorse. Falls 13 mm across its diagonal span.', 0xe8503a, 'ramp',
    [{ from: 'in', to: 'out' }]),
  P('snake', 'Snake ramp', 'Same span, an S laid into it. Slower, prettier.', 0x2f6fd0, 'snake',
    [{ from: 'in', to: 'out' }]),
  P('bumper', 'Zigzag ramp', 'Sawtooth walls throw the marble corner to corner.', 0xf1bf00, 'bumper',
    [{ from: 'in', to: 'out' }]),
  P('maze', 'Maze ramp', 'A weave of pins; the marble picks its way across.', 0x8b5cf6, 'maze',
    [{ from: 'in', to: 'out' }]),
  P('hairpin', 'U-turn', 'Enters a unit high, doubles back, leaves low.', 0x18a558, 'hairpin',
    [{ from: 'in', to: 'out' }]),
  P('paddle', 'Paddle wheel', 'Catches the marble in a cup and hands it on one rise down.', 0xf58220, 'paddle',
    [{ from: 'in', to: 'out' }], { wheel: true }),
  P('split', 'Split track', 'One in, two out — alternates, so the run forks.', 0x00a7b5, 'split',
    [{ from: 'in', to: 'l' }, { from: 'in', to: 'r' }], { alternates: true }),
  P('funnel', 'Funnel', 'A long feed into a spiral bowl that drains down the middle.', 0xd1417a, 'funnel',
    [{ from: 'in', to: 'out' }]),
  P('spacer', 'Spacer', 'Pure riser. One rise of height, marble drops straight through.', 0x7a7a8c, 'spacer',
    [{ from: 'a', to: 'a' }]),
  P('base', 'Support base', 'Stands on the carpet and holds the bottom of a column.', 0x4a4a58, 'base',
    [], { ground: true }),
  P('finish', 'Finish lane', 'Catches the marble and rolls it out. Ends the run.', 0xc8c8d4, 'finish',
    [{ from: 'in', to: 'in' }], { sink: true }),
];

export const PART_BY_ID = Object.fromEntries(PARTS.map(p => [p.id, p]));

// ── CENTRELINES ───────────────────────────────────────────────────── (ours) ──
// Each returns an array of [x, y, z] in piece-local coordinates: the path the
// marble's CONTACT POINT follows (add MARBLE.radius for its centre). Sampled
// densely enough that the swept trough reads smooth at builder scale.

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/** Straight fall-line between two columns, floors 30 → 17. */
function straightRun(a, b, n = 24, bend = null) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
    if (bend) { const [dx, dz] = bend(t); x += dx; z += dz; }
    pts.push([x, lerp(a.bottom + RUN_FLOOR.in, b.bottom + RUN_FLOOR.out, t), z]);
  }
  return pts;
}

/** Unit normal to the a→b chord, in plan. */
function chordNormal(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
  return [-dz / L, dx / L];
}

export const CENTRELINES = {
  ramp: (a, b) => straightRun(a, b, 20),

  snake: (a, b) => {
    const [nx, nz] = chordNormal(a, b);
    const amp = 34;
    return straightRun(a, b, 60, t => {
      const s = Math.sin(t * Math.PI * 2) * amp * Math.sin(Math.PI * t) ** 0.5;
      return [nx * s, nz * s];
    });
  },

  bumper: (a, b) => {
    const [nx, nz] = chordNormal(a, b);
    const amp = 26, teeth = 5;
    return straightRun(a, b, 80, t => {
      // triangle wave, eased at both ends so the inlet/outlet stay on axis
      const u = t * teeth, tri = Math.abs(((u % 1) * 2) - 1) * 2 - 1;
      const s = tri * amp * Math.sin(Math.PI * t);
      return [nx * s, nz * s];
    });
  },

  maze: (a, b) => {
    const [nx, nz] = chordNormal(a, b);
    const amp = 30;
    return straightRun(a, b, 90, t => {
      // three superposed weaves: deterministic, but reads as picking a way
      const s = (Math.sin(t * 9.1) * 0.55 + Math.sin(t * 15.7 + 1.3) * 0.3
        + Math.sin(t * 24.3 + 2.1) * 0.15) * amp * Math.sin(Math.PI * t);
      return [nx * s, nz * s];
    });
  },

  hairpin: (a, b) => {
    // Both columns lie on one line, so the U bulges sideways: out along the
    // normal, round the bend, back. Total fall is a full rise plus the runDrop.
    const [nx, nz] = chordNormal(a, b);
    const bulge = 86, n = 72, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, ang = Math.PI * t;
      const mx = lerp(a.x, b.x, t), mz = lerp(a.z, b.z, t);
      const s = Math.sin(ang) * bulge;
      pts.push([mx + nx * s, lerp(a.bottom + RUN_FLOOR.in, b.bottom + RUN_FLOOR.out, smooth(t)), mz + nz * s]);
    }
    return pts;
  },

  paddle: (a, b) => straightRun(a, b, 28),

  split: (a, b) => straightRun(a, b, 22),

  funnel: (a, b) => {
    // Long straight feed, then two turns of a descending spiral into the bore.
    const feed = 14, spiral = 64, pts = [];
    const yIn = a.bottom + RUN_FLOOR.in, yOut = b.bottom + RUN_FLOOR.out;
    const r0 = 74, turns = 2;
    // where the feed meets the rim of the bowl
    const ang0 = Math.atan2(a.z - b.z, a.x - b.x);
    const rimX = b.x + Math.cos(ang0) * r0, rimZ = b.z + Math.sin(ang0) * r0;
    const yRim = lerp(yIn, yOut, 0.42);
    for (let i = 0; i <= feed; i++) {
      const t = i / feed;
      pts.push([lerp(a.x, rimX, t), lerp(yIn, yRim, t), lerp(a.z, rimZ, t)]);
    }
    for (let i = 1; i <= spiral; i++) {
      const t = i / spiral, ang = ang0 + t * turns * Math.PI * 2;
      const r = lerp(r0, 0, smooth(t) ** 1.6);
      pts.push([b.x + Math.cos(ang) * r, lerp(yRim, yOut, smooth(t)), b.z + Math.sin(ang) * r]);
    }
    return pts;
  },

  spacer: a => [
    [a.x, a.bottom + RUN_FLOOR.in, a.z],
    [a.x, a.bottom + RUN_FLOOR.out, a.z],
  ],

  // A short holding chute above the bore: marbles queue here before release.
  start: a => {
    const pts = [], n = 10, y0 = a.bottom + RUN_FLOOR.in + 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a.x - 58 * (1 - t), lerp(y0, a.bottom + RUN_FLOOR.out, smooth(t)), a.z]);
    }
    return pts;
  },

  base: () => [],

  // A straight run-out lane. Nothing stacks below it, so a marble reaching the
  // end of this one parks instead of falling — see stepMarble.
  finish: a => {
    const pts = [], n = 16, L = 150;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a.x + L * t, lerp(a.bottom + RUN_FLOOR.in, a.bottom + RUN_FLOOR.out - 3, t), a.z]);
    }
    return pts;
  },
};

/** Build every run of a part, in piece-local coordinates. */
export function partRuns(kind) {
  const part = PART_BY_ID[kind];
  if (!part) throw new Error(`unknown part: ${kind}`);
  const by = Object.fromEntries(part.ports.map(p => [p.id, p]));
  return part.runs.map(r => ({
    from: r.from, to: r.to,
    points: CENTRELINES[part.shape](by[r.from], by[r.to]),
  }));
}

// ── ASSEMBLY ───────────────────────────────────── (model after snapping.ts) ──

export const rotateY = ([x, y, z], a) =>
  [Math.cos(a) * x + Math.sin(a) * z, y, -Math.sin(a) * x + Math.cos(a) * z];

export const addV = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subV = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const lenV = a => Math.hypot(a[0], a[1], a[2]);

/** Every mating port a part exposes, in piece-local coordinates. */
export function matingPorts(kind) {
  const part = PART_BY_ID[kind];
  const out = [];
  for (const c of part.ports) {
    out.push({ column: c.id, gender: 'female', axis: -1, position: [c.x, c.bottom, c.z] });
    if (c.post !== false) {
      out.push({ column: c.id, gender: 'male', axis: 1, position: [c.x, c.bottom + VERTICAL_GRID.rise, c.z] });
    }
  }
  return out;
}

export const worldPort = (p, pose) => addV(rotateY(p.position, pose.yaw), pose.position);

/** A male may enter a female and only a female. Ported rule. */
export const compatible = (a, b) => a.gender !== b.gender && a.axis === -b.axis;

/** Below the socket's 0.1 mm radial clearance — ported tolerance. */
export const SNAP_FIT_TOLERANCE = 0.075;

/**
 * Open ports on the board: every mating port of every placed piece that is not
 * already consumed by a connection.
 */
export function openPorts(placed, connections) {
  const used = new Set();
  for (const c of connections) { used.add(`${c.a}/${c.ap}`); used.add(`${c.b}/${c.bp}`); }
  const out = [];
  for (const piece of placed) {
    for (const p of matingPorts(piece.kind)) {
      const key = `${p.gender}:${p.column}`;
      if (used.has(`${piece.id}/${key}`)) continue;
      out.push({ piece: piece.id, key, column: p.column, gender: p.gender, axis: p.axis,
        position: worldPort(p, piece.pose) });
    }
  }
  return out;
}

/**
 * Pose a new piece of `kind` so that its port `sourceKey` lands exactly on
 * `target`, at yaw `yaw`. Returns null if the pair cannot mate.
 */
export function poseOnto(kind, sourceKey, target, yaw) {
  const src = matingPorts(kind).find(p => `${p.gender}:${p.column}` === sourceKey);
  if (!src || !compatible(src, target)) return null;
  const off = rotateY(src.position, yaw);
  return { position: subV(target.position, off), yaw };
}

/**
 * The yaw that points a piece's run from `sourceKey` toward `aimWorld`.
 * Used by the builder so a tapped direction turns into a legal placement.
 */
export function aimYaw(kind, sourceKey, target, aimWorld) {
  const part = PART_BY_ID[kind];
  const src = matingPorts(kind).find(p => `${p.gender}:${p.column}` === sourceKey);
  if (!src || part.ports.length < 2) return 0;
  const other = part.ports.find(c => c.id !== src.column) ?? part.ports[0];
  const local = [other.x - src.position[0], 0, other.z - src.position[2]];
  const want = Math.atan2(aimWorld[2] - target.position[2], aimWorld[0] - target.position[0]);
  const have = Math.atan2(local[2], local[0]);
  // rotateY(v, yaw) sends angle θ to θ - yaw
  return have - want;
}

/** Snap a free yaw to the nearest legal 30° step — the lattice the 3-port
 *  pieces and the ramp diagonal both live on. */
export const YAW_STEP = Math.PI / 6;
export const snapYaw = y => Math.round(y / YAW_STEP) * YAW_STEP;

/** Do two placed pieces occupy the same column footprint at the same level? */
export function overlaps(a, b) {
  for (const ca of PART_BY_ID[a.kind].ports) {
    const wa = addV(rotateY([ca.x, ca.bottom, ca.z], a.pose.yaw), a.pose.position);
    for (const cb of PART_BY_ID[b.kind].ports) {
      const wb = addV(rotateY([cb.x, cb.bottom, cb.z], b.pose.yaw), b.pose.position);
      if (Math.hypot(wa[0] - wb[0], wa[2] - wb[2]) < CONNECTOR.postDiameter * 0.8
        && Math.abs(wa[1] - wb[1]) < VERTICAL_GRID.rise * 0.5) return true;
    }
  }
  return false;
}

// ── RUN GRAPH + MARBLE SOLVER ─────────────────────────────────────── (ours) ──
//
// A marble in a Marbleworks trough is a sphere rolling without slip on a flat
// floor, so its along-track acceleration is the textbook
//
//     a = (5/7) · g · sinθ − rolling resistance
//
// (the 5/7 is 1/(1 + I/mr²) for a solid sphere). Between pieces it free-falls
// down a 21 mm bore. Solving one arclength coordinate per marble instead of a
// full rigid-body contact problem is what lets this run at 60 fps on a phone
// with no wasm — the trade the original makes differently, with Box3D.

export const G = 9810;            // mm/s²
export const ROLL_FACTOR = 5 / 7; // solid sphere, rolling without slipping
const ROLL_RESIST = 0.010;        // dimensionless, ×g — carpet-grade plastic
const AIR = 4e-7;                 // quadratic drag coefficient, per mm

/** Cumulative arclength of a polyline, plus total. */
export function arcTable(points) {
  const s = [0];
  for (let i = 1; i < points.length; i++) {
    s.push(s[i - 1] + lenV(subV(points[i], points[i - 1])));
  }
  return { s, total: s[s.length - 1] };
}

/** Position and unit tangent at arclength `d` along a polyline. */
export function sampleAt(points, table, d) {
  const { s } = table;
  if (points.length === 1) return { p: points[0].slice(), t: [1, 0, 0] };
  let i = 1;
  while (i < s.length - 1 && s[i] < d) i++;
  const seg = s[i] - s[i - 1] || 1;
  const u = Math.min(1, Math.max(0, (d - s[i - 1]) / seg));
  const a = points[i - 1], b = points[i];
  const dir = subV(b, a), L = lenV(dir) || 1;
  return {
    p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)],
    t: [dir[0] / L, dir[1] / L, dir[2] / L],
  };
}

/**
 * Assemble the world-space run graph: every piece's runs, transformed by its
 * pose, keyed so a marble leaving a piece can find where it lands.
 */
export function buildGraph(placed, connections) {
  const byId = new Map(placed.map(p => [p.id, p]));
  const segments = new Map();   // `${pieceId}/${from}>${to}` → segment
  const entryOf = new Map();    // `${pieceId}/${columnId}` → [segment keys]

  for (const piece of placed) {
    for (const run of partRuns(piece.kind)) {
      const points = run.points.map(pt => addV(rotateY(pt, piece.pose.yaw), piece.pose.position));
      if (points.length < 2) continue;
      const key = `${piece.id}/${run.from}>${run.to}`;
      const seg = { key, piece: piece.id, kind: piece.kind, from: run.from, to: run.to,
        points, table: arcTable(points) };
      segments.set(key, seg);
      const ek = `${piece.id}/${run.from}`;
      if (!entryOf.has(ek)) entryOf.set(ek, []);
      entryOf.get(ek).push(key);
    }
  }

  // A connection joins piece A's female column to piece B's male column: B sits
  // one rise below A, so a marble leaving A at that column drops into B.
  const dropTo = new Map();     // `${pieceId}/${columnId}` → { piece, column }
  for (const c of connections) {
    const a = byId.get(c.a), b = byId.get(c.b);
    if (!a || !b) continue;
    const [aCol, bCol] = [c.ap.split(':')[1], c.bp.split(':')[1]];
    const aFemale = c.ap.startsWith('female');
    // female-side piece is the upper one; the marble goes down into the other
    if (aFemale) dropTo.set(`${c.a}/${aCol}`, { piece: c.b, column: bCol });
    else dropTo.set(`${c.b}/${bCol}`, { piece: c.a, column: aCol });
  }

  return { segments, entryOf, dropTo, byId };
}

/** Where a marble entering piece/column goes next: a segment, or nothing. */
export function segmentFrom(graph, pieceId, columnId, pick = 0) {
  const keys = graph.entryOf.get(`${pieceId}/${columnId}`);
  if (!keys || !keys.length) return null;
  return graph.segments.get(keys[pick % keys.length]);
}

/**
 * One marble. `mode` is 'roll' (constrained to a segment) or 'fall' (ballistic
 * through a bore, or off the end of the world).
 */
export function spawnMarble(graph, pieceId, columnId, opts = {}) {
  const seg = segmentFrom(graph, pieceId, columnId, opts.pick ?? 0);
  if (!seg) return null;
  const { p } = sampleAt(seg.points, seg.table, 0);
  return {
    id: opts.id ?? 0, mode: 'roll', seg, s: 0, v: opts.v ?? 0,
    pos: [p[0], p[1] + MARBLE.radius, p[2]], vel: [0, 0, 0],
    colour: opts.colour ?? 0, alive: true, hops: 0, t: 0, spin: 0,
  };
}

/**
 * Advance one marble by dt seconds. `route(pieceId)` may return an integer to
 * pick an outlet on a branching piece (split); it is called once per arrival.
 * Mutates and returns the marble.
 */
export function stepMarble(m, graph, dt, route) {
  if (!m.alive || m.mode === 'parked') return m;
  m.t += dt;

  if (m.mode === 'roll') {
    const seg = m.seg;
    const { p, t } = sampleAt(seg.points, seg.table, m.s);
    // sinθ is the tangent's downward component; positive means downhill
    const sinTheta = -t[1];
    const speed = Math.abs(m.v);
    const resist = Math.sign(m.v || 1) * (ROLL_RESIST * G + AIR * speed * speed);
    const accel = ROLL_FACTOR * G * sinTheta - resist;
    m.v += accel * dt;
    if (m.v < 0) m.v = 0;                    // a marble does not roll back uphill here
    m.s += m.v * dt;
    m.spin += (m.v / MARBLE.radius) * dt;

    if (m.s >= seg.table.total) {
      // Reached the outlet column. Rewind the fraction of this step that was
      // spent past the end, so the exit speed is the speed AT the end rather
      // than one whole step beyond it — otherwise the hand-off speed carries a
      // quantisation error the size of a·dt and the solver stops converging.
      const over = m.s - seg.table.total;
      const back = m.v > 1e-9 ? Math.min(dt, over / m.v) : 0;
      m.v = Math.max(0, m.v - accel * back);
      m.s = seg.table.total;
      const end = sampleAt(seg.points, seg.table, seg.table.total);
      m.pos = [end.p[0], end.p[1] + MARBLE.radius, end.p[2]];
      const carry = m.v;
      // A finish lane ends the run even though it stands on a column like any
      // other piece — check the sink before looking for somewhere to drop.
      if (PART_BY_ID[seg.kind]?.sink) { m.mode = 'parked'; m.v = 0; return m; }
      // Walk down the column. A piece that offers no run from the column it was
      // landed on (a spacer chain, or a ramp joined at its outlet) passes the
      // marble straight through to whatever is under it.
      let hop = graph.dropTo.get(`${seg.piece}/${seg.to}`), guard = 0, nextSeg = null;
      while (hop && guard++ < 32) {
        nextSeg = segmentFrom(graph, hop.piece, hop.column, route ? route(hop.piece) : 0);
        if (nextSeg) break;
        hop = graph.dropTo.get(`${hop.piece}/${hop.column}`);
      }
      if (nextSeg) {
        m.mode = 'bore'; m.seg = nextSeg; m.boreY = m.pos[1];
        const { p: np } = sampleAt(nextSeg.points, nextSeg.table, 0);
        m.boreTarget = [np[0], np[1] + MARBLE.radius, np[2]];
        m.boreV = 0; m.carry = carry; m.hops++;
        return m;
      }
      // nothing below — free fall out of the run
      m.mode = 'fall';
      m.vel = [t[0] * carry, t[1] * carry, t[2] * carry];
      m.pos[0] += t[0] * over; m.pos[2] += t[2] * over;
      return m;
    }
    m.pos = [p[0], p[1] + MARBLE.radius, p[2]];
    return m;
  }

  if (m.mode === 'bore') {
    // straight drop down the 21 mm post bore
    m.boreV += G * dt;
    m.pos[1] -= m.boreV * dt;
    // slide horizontally onto the inlet cup as it falls (the cup is a funnel)
    const span = Math.max(1, m.boreY - m.boreTarget[1]);
    const u = Math.min(1, Math.max(0, (m.boreY - m.pos[1]) / span));
    m.pos[0] = lerp(m.pos[0], m.boreTarget[0], Math.min(1, u * 0.35));
    m.pos[2] = lerp(m.pos[2], m.boreTarget[2], Math.min(1, u * 0.35));
    m.spin += (m.boreV / MARBLE.radius) * dt * 0.25;
    if (m.pos[1] <= m.boreTarget[1]) {
      m.pos = m.boreTarget.slice();
      m.mode = 'roll'; m.s = 0;
      // the cup absorbs the vertical; carry a fraction of the entry speed on
      m.v = m.carry * 0.55 + m.boreV * 0.18;
      m.carry = 0;
    }
    return m;
  }

  // 'fall' — ballistic, until it is well below the board
  m.vel[1] -= G * dt;
  m.pos[0] += m.vel[0] * dt; m.pos[1] += m.vel[1] * dt; m.pos[2] += m.vel[2] * dt;
  m.spin += 8 * dt;
  if (m.pos[1] < -400) m.alive = false;
  return m;
}

/** Closed-form check the solver is measured against: speed of a sphere that has
 *  rolled without slipping through a height drop h from rest. */
export const rollingSpeed = h => Math.sqrt(2 * ROLL_FACTOR * G * h);

// ── LAYOUT SERIALISATION ──────────────────────────────────────────── (ours) ──
// Compact enough for a URL hash, so a run is a permalink like every other
// tjs bench.

const KIND_CODE = PARTS.map(p => p.id);

export function encodeLayout(placed, connections) {
  // Ids are renumbered to array order: after a few deletions a board's ids are
  // sparse, and a decoded board must be able to find its own connections.
  const ix = new Map(placed.map((p, i) => [p.id, i]));
  const pieces = placed.map(p => [
    KIND_CODE.indexOf(p.kind),
    Math.round(p.pose.position[0]), Math.round(p.pose.position[1]), Math.round(p.pose.position[2]),
    Math.round(p.pose.yaw / YAW_STEP),
  ].join('.'));
  const links = connections
    .filter(c => ix.has(c.a) && ix.has(c.b))
    .map(c => `${ix.get(c.a)}_${c.ap}_${ix.get(c.b)}_${c.bp}`);
  return `${pieces.join('!')}~${links.join('!')}`;
}

export function decodeLayout(str) {
  const [pieceStr = '', linkStr = ''] = String(str).split('~');
  const placed = pieceStr ? pieceStr.split('!').filter(Boolean).map((s, i) => {
    const [k, x, y, z, yaw] = s.split('.').map(Number);
    return { id: i, kind: KIND_CODE[k], pose: { position: [x, y, z], yaw: yaw * YAW_STEP } };
  }) : [];
  const connections = linkStr ? linkStr.split('!').filter(Boolean).map(s => {
    const [a, ap, b, bp] = s.split('_');
    return { a: Number(a), ap, b: Number(b), bp };
  }) : [];
  return { placed, connections };
}

// ── ASSEMBLY HELPERS + PRESETS ────────────────────────────────────── (ours) ──

export function newBoard() { return { placed: [], connections: [], nextId: 0 }; }

/** Place the first piece of a board, free in space. */
export function seed(board, kind, position = [0, 0, 0], yaw = 0) {
  const piece = { id: board.nextId++, kind, pose: { position: position.slice(), yaw } };
  board.placed.push(piece);
  return piece;
}

/**
 * Hang `kind` one rise below an open female port of `parent`, entering at
 * `entry` (which column of the new piece takes the marble). `yaw` is absolute.
 */
export function attachBelow(board, parent, column, kind, { yaw = 0, entry } = {}) {
  const part = PART_BY_ID[kind];
  const entryCol = entry ?? part.runs[0]?.from ?? part.ports[0].id;
  const target = openPorts(board.placed, board.connections)
    .find(p => p.piece === parent.id && p.key === `female:${column}`);
  if (!target) return null;
  const pose = poseOnto(kind, `male:${entryCol}`, target, yaw);
  if (!pose) return null;
  const piece = { id: board.nextId++, kind, pose };
  board.placed.push(piece);
  board.connections.push({ a: parent.id, ap: `female:${column}`, b: piece.id, bp: `male:${entryCol}` });
  return piece;
}

/**
 * Stack `kind` one rise ABOVE an open male port of `parent`, leaving by `exit`
 * (which column of the new piece hands the marble down). The mirror of
 * attachBelow — without it a finished run has nowhere left to build, because
 * every female below it is already filled.
 */
export function attachAbove(board, parent, column, kind, { yaw = 0, exit } = {}) {
  const exitCol = exit ?? exitColumn(kind) ?? PART_BY_ID[kind].ports[0].id;
  const target = openPorts(board.placed, board.connections)
    .find(p => p.piece === parent.id && p.key === `male:${column}`);
  if (!target) return null;
  const pose = poseOnto(kind, `female:${exitCol}`, target, yaw);
  if (!pose) return null;
  const piece = { id: board.nextId++, kind, pose };
  board.placed.push(piece);
  board.connections.push({ a: piece.id, ap: `female:${exitCol}`, b: parent.id, bp: `male:${column}` });
  return piece;
}

/** Which column a marble leaves a piece by, given the run it took. */
export const exitColumn = (kind, pick = 0) => {
  const runs = PART_BY_ID[kind].runs;
  return runs.length ? runs[pick % runs.length].to : null;
};

/**
 * Build a straight-line chain from a spec: [{ kind, yaw }, …]. Each link hangs
 * off the previous piece's exit column. Returns the board.
 */
export function chain(spec, board = newBoard(), start = null) {
  let prev = start, prevCol = null;
  if (!prev) {
    prev = seed(board, spec[0].kind, spec[0].position ?? [0, 0, 0], spec[0].yaw ?? 0);
    prevCol = exitColumn(prev.kind);
    spec = spec.slice(1);
  } else prevCol = exitColumn(prev.kind);
  for (const step of spec) {
    const next = attachBelow(board, prev, prevCol, step.kind, { yaw: step.yaw ?? 0, entry: step.entry });
    if (!next) break;
    prev = next; prevCol = exitColumn(next.kind, step.pick ?? 0);
  }
  return { board, tail: prev, tailColumn: prevCol };
}

const T = Math.PI / 6;

export const PRESETS = {
  classic: {
    name: 'Classic run',
    build() {
      const { board, tail, tailColumn } = chain([
        { kind: 'start', position: [0, 470, 0] },
        { kind: 'ramp', yaw: 0 }, { kind: 'ramp', yaw: 2 * T },
        { kind: 'snake', yaw: 4 * T }, { kind: 'ramp', yaw: 6 * T },
        { kind: 'bumper', yaw: 8 * T }, { kind: 'ramp', yaw: 10 * T },
        { kind: 'finish', yaw: 0 },
      ]);
      capColumns(board);
      return board;
    },
  },
  spiral: {
    name: 'Down the funnel',
    build() {
      const { board } = chain([
        { kind: 'start', position: [0, 611, 0] },
        { kind: 'ramp', yaw: 0 }, { kind: 'funnel', yaw: 3 * T },
        { kind: 'snake', yaw: 7 * T }, { kind: 'hairpin', yaw: 1 * T },
        { kind: 'ramp', yaw: 5 * T }, { kind: 'finish', yaw: 0 },
      ]);
      capColumns(board);
      return board;
    },
  },
  fork: {
    name: 'The fork',
    build() {
      const a = chain([
        { kind: 'start', position: [0, 564, 0] },
        { kind: 'ramp', yaw: 0 }, { kind: 'maze', yaw: 2 * T },
        { kind: 'split', yaw: 6 * T },
      ]);
      const board = a.board, split = a.tail;
      for (const [col, yaw] of [['l', 8 * T], ['r', 4 * T]]) {
        const r = attachBelow(board, split, col, 'ramp', { yaw });
        if (r) {
          const b = attachBelow(board, r, 'out', 'bumper', { yaw: yaw + 2 * T });
          if (b) attachBelow(board, b, 'out', 'finish', { yaw });
        }
      }
      capColumns(board);
      return board;
    },
  },
  paddles: {
    name: 'Paddle house',
    build() {
      const { board } = chain([
        { kind: 'start', position: [0, 705, 0] },
        { kind: 'ramp', yaw: 0 }, { kind: 'paddle', yaw: 2 * T },
        { kind: 'ramp', yaw: 5 * T }, { kind: 'paddle', yaw: 7 * T },
        { kind: 'snake', yaw: 10 * T }, { kind: 'finish', yaw: 0 },
      ]);
      capColumns(board);
      return board;
    },
  },
};

/**
 * Stand every unsupported column on the carpet: fill each open female port with
 * spacers down to y≈0 and finish with a base. Purely structural — a marble
 * passes straight through a spacer column and out the bottom, which is what the
 * real toy does too if you forget a finish lane.
 */
export function capColumns(board, floor = 0) {
  const open = openPorts(board.placed, board.connections)
    .filter(p => p.gender === 'female' && p.position[1] > floor + VERTICAL_GRID.rise * 0.5);
  for (const port of open) {
    let parent = board.placed.find(p => p.id === port.piece), column = port.column, guard = 0;
    while (guard++ < 24) {
      const y = openPorts(board.placed, board.connections)
        .find(p => p.piece === parent.id && p.key === `female:${column}`)?.position[1];
      if (y === undefined || y <= floor + VERTICAL_GRID.rise * 0.5) break;
      const kind = y - VERTICAL_GRID.rise <= floor + VERTICAL_GRID.rise * 0.5 ? 'base' : 'spacer';
      const next = attachBelow(board, parent, column, kind, { yaw: 0, entry: 'a' });
      if (!next) break;
      parent = next; column = 'a';
      if (kind === 'base') break;
    }
  }
  return board;
}
