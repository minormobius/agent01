// foam/dungeon-export.mjs — export layer for the dungeon generator.
//
// Two targets, one geometry pass:
//
//   dungeonToJSON(d)  → the canonical `foam-dungeon` interchange object —
//                       everything a consumer needs to render, explore or
//                       re-import a dungeon: rooms with tiles (heights
//                       included), doors, paths, and per-room WALL OUTLINES
//                       computed as the boundary of each room's tile union.
//                       Documented in dungeon/FORMAT.md.
//   dungeonToUVTT(d)  → Universal VTT (the Dungeondraft `.dd2vtt` JSON, as
//                       imported by Foundry/Arkenforge/Fantasy Grounds
//                       importers): wall polylines as line_of_sight, doors as
//                       portals, coordinates in grid squares of one tile.
//                       The baked map image is the caller's to supply (the
//                       page renders its plan canvas to PNG; node passes '').
//
// Pure geometry — runs in node (the selftest) and the browser (the page's
// export buttons). Deterministic for a given dungeon. No dependencies.

import { DUNGEON_VERSION } from './dungeon.mjs';

const rnd3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------- tile corners ---
// Corner coordinates on an EXACT integer lattice, so edges shared between
// neighbouring tiles cancel by key with no float tolerance:
//   grid  — corners at (i·t, j·t): key units are t
//   hex   — pointy-top corner lattice: x in units √3R/2 (X = 2q+r±1|0),
//           z in units R/2 (Z = 3r±1|±2)
function cornersOf(shape, tileSize, t) {
  if (t.key === 'c') {
    // fallback tile (floor sliver): a free square around the centre — no
    // neighbours to cancel against, so float keys are safe
    const h = tileSize / 2;
    return [[t.x - h, t.z - h], [t.x + h, t.z - h], [t.x + h, t.z + h], [t.x - h, t.z + h]]
      .map(([x, z]) => ({ key: 'f' + Math.round(x * 1e4) + ':' + Math.round(z * 1e4), x, z }));
  }
  if (shape === 'hex') {
    const R = tileSize / Math.sqrt(3);
    const ux = Math.sqrt(3) * R / 2, uz = R / 2;
    const cX = 2 * t.q + t.r, cZ = 3 * t.r;
    return [
      [cX + 1, cZ - 1], [cX + 1, cZ + 1], [cX, cZ + 2],
      [cX - 1, cZ + 1], [cX - 1, cZ - 1], [cX, cZ - 2],
    ].map(([X, Z]) => ({ key: X + ':' + Z, x: X * ux, z: Z * uz }));
  }
  const s = tileSize;
  return [
    [t.i, t.j], [t.i + 1, t.j], [t.i + 1, t.j + 1], [t.i, t.j + 1],
  ].map(([I, J]) => ({ key: I + ':' + J, x: I * s, z: J * s }));
}

// ------------------------------------------------------------- outlines ----
// Boundary of a room's tile union, as closed loops (first point repeated
// last). Edges appearing in exactly one tile are boundary; all tiles are
// wound the same way, so directed boundary edges chain into loops. Collinear
// runs are merged.
export function roomOutlines(dungeon, room) {
  const edges = [];
  const count = new Map();
  for (const t of room.tiles) {
    const c = cornersOf(dungeon.tileShape, dungeon.tileSize, t);
    for (let k = 0; k < c.length; k++) {
      const a = c[k], b = c[(k + 1) % c.length];
      const ku = a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key;
      count.set(ku, (count.get(ku) || 0) + 1);
      edges.push({ ku, a, b });
    }
  }
  const boundary = edges.filter((e) => count.get(e.ku) === 1);
  const bySrc = new Map();
  for (const e of boundary) {
    if (!bySrc.has(e.a.key)) bySrc.set(e.a.key, []);
    bySrc.get(e.a.key).push(e);
  }
  const used = new Set();
  const loops = [];
  for (const e0 of boundary) {
    if (used.has(e0)) continue;
    const pts = [[e0.a.x, e0.a.z]];
    let e = e0;
    while (e && !used.has(e)) {
      used.add(e);
      pts.push([e.b.x, e.b.z]);
      const nexts = (bySrc.get(e.b.key) || []).filter((x) => !used.has(x));
      e = nexts[0];
    }
    // merge collinear runs (loop-aware: also test the seam)
    const merged = [];
    const n = pts.length - 1;              // last repeats first
    for (let i = 0; i < n; i++) {
      const p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
      const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
      if (Math.abs(cross) > 1e-9) merged.push(q);
    }
    if (merged.length >= 3) {
      merged.push(merged[0]);
      loops.push(merged.map(([x, z]) => [rnd3(x), rnd3(z)]));
    }
  }
  return loops;
}

// -------------------------------------------------------- unique doors -----
// One record per membrane, with both sides' rooms.
export function uniqueDoors(dungeon) {
  const seen = new Map();
  for (const r of dungeon.rooms) {
    for (const d of r.doors) {
      if (!seen.has(d.face)) {
        seen.set(d.face, { face: d.face, rooms: [r.id, d.to], at: d.at.slice() });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.face - b.face);
}

// A canonical document's LAYOUT SIGNATURE: fnv over the geometry-bearing
// subset (the same subset the selftest's golden permalink pins hash).
// Content rolls bind to this — a content document knows which map it
// furnishes, whatever metadata either document also carries.
export function layoutSignature(json) {
  const str = JSON.stringify({ e: json.entrance, n: json.endpoints, r: json.rooms, d: json.doors, p: json.paths });
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// ------------------------------------------------- the canonical format ----
export function dungeonToJSON(dungeon) {
  const P = dungeon.pocket;
  const roleOf = (r) => r.isEntrance ? 'entrance' : r.endpointIndex >= 0 ? 'endpoint' : 'room';
  return {
    format: 'foam-dungeon',
    version: DUNGEON_VERSION,
    generator: {
      engine: 'foam.mino.mobi/dungeon/',
      seed: P.seed, salt: P.salt,
      endpoints: dungeon.requestedEndpoints,
      tileShape: dungeon.tileShape, tileScale: dungeon.tileScale,
      size: dungeon.size,
      dims: { nx: P.opts.nx, nz: P.opts.nz, layers: P.opts.layers, subLayers: P.opts.subLayers, cell: P.opts.cell },
    },
    units: 'meters',
    axes: 'x/z plan, y up (tile y = floor height under the tile centre)',
    bounds: { w: rnd3(P.W), h: rnd3(P.H), d: rnd3(P.D) },
    tile: {
      shape: dungeon.tileShape, size: rnd3(dungeon.tileSize),
      lattice: dungeon.tileShape === 'hex'
        ? 'pointy-top axial (q,r): x=√3R(q+r/2), z=1.5Rr, R=size/√3, global origin 0,0'
        : 'square (i,j): centre x=(i+0.5)size, z=(j+0.5)size, global origin 0,0',
    },
    entrance: dungeon.entrance,
    endpoints: dungeon.endpoints.slice(),
    rooms: dungeon.rooms.map((r) => ({
      id: r.id, role: roleOf(r),
      ...(r.secret ? { secret: true } : {}),
      ...(r.loop ? { loop: true } : {}),
      ...(r.endpointIndex >= 0 ? { endpointIndex: r.endpointIndex } : {}),
      depth: r.depth, floorY: rnd3(r.floorY),
      centroid: r.centroid.map(rnd3), area: rnd3(r.area),
      onPaths: r.onPaths.slice(),
      doors: r.doors.map((d) => ({ to: d.to, face: d.face, at: d.at.map(rnd3), tile: d.tile, ...(d.loop ? { loop: true } : {}) })),
      tiles: r.tiles.map((t) => ({
        key: t.key,
        ...(t.q !== undefined ? { q: t.q, r: t.r } : {}),
        ...(t.i !== undefined ? { i: t.i, j: t.j } : {}),
        x: rnd3(t.x), z: rnd3(t.z), y: rnd3(t.y), kind: t.kind,
      })),
      outline: roomOutlines(dungeon, r),
    })),
    doors: uniqueDoors(dungeon).map((d) => ({ face: d.face, rooms: d.rooms, at: d.at.map(rnd3) })),
    trapdoors: (dungeon.trapdoors ?? []).map((t) => ({ ...t })),
    loops: (dungeon.loops ?? []).map((l) => ({ ...l })),
    paths: dungeon.paths.map((p) => ({
      endpoint: p.endpoint,
      rooms: p.rooms.slice(),
      doors: p.doors.map((d) => ({ face: d.face, from: d.from, to: d.to, at: d.at.map(rnd3) })),
    })),
  };
}

// ------------------------------------------------------------- UVTT --------
// The plan-space window the map covers (world metres), padded a tile out.
export function planBounds(dungeon) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of dungeon.rooms) for (const t of r.tiles) {
    x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x);
    z0 = Math.min(z0, t.z); z1 = Math.max(z1, t.z);
  }
  const pad = dungeon.tileSize * 1.5;
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}

// Universal VTT: coordinates in GRID SQUARES (one square = one tile size),
// origin at the padded plan window's corner. `image` is the raw base64 PNG
// of the map at map_size × pixelsPerGrid — supply it from a canvas render
// (the page does); '' keeps the file valid for geometry-only consumers.
// A hex dungeon exports the same walls/portals/image; the VTT's square grid
// overlay simply won't align with hex tiles (UVTT has no hex grid).
export function dungeonToUVTT(dungeon, { pixelsPerGrid = 64, image = '' } = {}) {
  const b = planBounds(dungeon);
  const t = dungeon.tileSize;
  const gw = Math.ceil((b.x1 - b.x0) / t), gh = Math.ceil((b.z1 - b.z0) / t);
  const gx = (x) => rnd3((x - b.x0) / t), gz = (z) => rnd3((z - b.z0) / t);
  const line_of_sight = [];
  for (const r of dungeon.rooms) {
    for (const loop of roomOutlines(dungeon, r)) {
      line_of_sight.push(loop.map(([x, z]) => ({ x: gx(x), y: gz(z) })));
    }
  }
  const P = dungeon.pocket;
  const portals = uniqueDoors(dungeon).map((d) => {
    const f = P.faces[d.face];
    // door line: through the station, along the membrane's horizontal run
    const hl = Math.hypot(f.n[0], f.n[2]) || 1;
    const hu = [f.n[2] / hl, -f.n[0] / hl];
    const half = t * 0.5;
    return {
      position: { x: gx(d.at[0]), y: gz(d.at[2]) },
      bounds: [
        { x: gx(d.at[0] - hu[0] * half), y: gz(d.at[2] - hu[1] * half) },
        { x: gx(d.at[0] + hu[0] * half), y: gz(d.at[2] + hu[1] * half) },
      ],
      rotation: rnd3(Math.atan2(hu[1], hu[0])),
      closed: true,
      freestanding: false,
    };
  });
  return {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: gw, y: gh },
      pixels_per_grid: pixelsPerGrid,
    },
    line_of_sight,
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: [],
    image,
  };
}
