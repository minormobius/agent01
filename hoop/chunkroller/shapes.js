// chunkroller/shapes.js — bundled tessellation shapes (exported from the /chunkroller/tess editor).
// A shape's `boundary` (a closed polyline) drops straight into solveChunk as its `poly`, so the chunk
// fills the deformed, tessellating outline instead of a perfect hexagon. Add more by pasting an export.

// `shapePoly(shape, cx, cy, R)` → the boundary as solveChunk {x,y} verts, centred + scaled to radius R.
export function shapePoly(shape, cx, cy, R) {
  const s = R / shape.R;
  return shape.boundary.map(([x, y]) => ({ x: cx + x * s, y: cy + y * s }));
}

// `shapeSideOf(shape)` → the side (direction) index per boundary segment, so ports allocate PER DIRECTION,
// not per segment. Uses the bundled `sideOf` if present, else derives it (6 equal sides over the boundary).
export function shapeSideOf(shape) {
  if (Array.isArray(shape.sideOf) && shape.sideOf.length === shape.boundary.length) return shape.sideOf;
  const per = shape.boundary.length / 6;
  return shape.boundary.map((_, i) => Math.floor(i / per));
}

// the sample the user designed in the tessellation editor (hoop.chunkshape.tessellation v1).
export const SAMPLE_SHAPE = {
  type: 'hoop.chunkshape.tessellation', version: 1, tiling: 'translation', R: 180,
  boundary: [
    [180, 0], [162.08, 34.77], [141.24, 66.43], [163.75, 122.35], [144.59, 108.74], [90, 155.88],
    [42.78, 185.36], [38.71, 122.88], [-13.76, 153.19], [-79.33, 131.49], [-90, 155.88], [-125.89, 129.04],
    [-137.33, 97.88], [-109.16, 42.67], [-139.64, 32.13], [-180, 0], [-125.41, -47.14], [-106.25, -33.54],
    [-128.76, -89.46], [-107.92, -121.11], [-90, -155.88], [-79.33, -180.28], [-13.76, -158.58], [38.71, -188.89],
    [42.78, -126.41], [90, -155.88], [130.36, -123.75], [160.84, -113.22], [132.67, -58.01], [144.11, -26.85],
  ],
};
