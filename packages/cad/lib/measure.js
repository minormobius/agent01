// measure.js — measurements from the exact face geometry the engine attaches
// to every face it names (plane or cylinder), never from the mesh. Shared by
// the page's measure tool and agent/measure.mjs.
import { xform, xformDir } from './assembly.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/// A face's geometry and centroid moved by a component's model matrix.
export function faceWorld(face, model) {
  if (!model) return face;
  const g = face.geom && (face.geom.kind === 'plane'
    ? { kind: 'plane', normal: norm(xformDir(model, face.geom.normal)), point: xform(model, face.geom.point) }
    : { kind: 'cylinder', axis: norm(xformDir(model, face.geom.axis)), center: xform(model, face.geom.center), radius: face.geom.radius });
  return { ...face, geom: g || face.geom, centroid: xform(model, face.centroid), normal: norm(xformDir(model, face.normal)) };
}

/// One face on its own: a cylinder's diameter, a plane's normal.
export function describe(face) {
  const g = face.geom;
  if (!g) return { kind: 'face', area: face.area };
  if (g.kind === 'cylinder') return { kind: 'cylinder', diameter: 2 * g.radius, radius: g.radius, axis: g.axis, center: g.center, area: face.area };
  return { kind: 'plane', normal: g.normal, point: g.point, area: face.area };
}

/// Two faces: plane–plane (parallel) distance, cylinder–cylinder (parallel)
/// axis distance, plane–cylinder axis-to-plane distance, else the distance
/// between centroids. `parallel` says whether the exact reading applies.
export function measure(a, b) {
  const ga = a.geom, gb = b.geom;
  const centroidDistance = len(sub(a.centroid, b.centroid));
  if (ga && gb) {
    if (ga.kind === 'plane' && gb.kind === 'plane') {
      const parallel = Math.abs(Math.abs(dot(ga.normal, gb.normal)) - 1) < 1e-6;
      const distance = parallel ? Math.abs(dot(sub(gb.point, ga.point), ga.normal)) : null;
      const angle = (Math.acos(Math.min(1, Math.abs(dot(ga.normal, gb.normal)))) * 180) / Math.PI;
      return { kind: 'plane-plane', parallel, distance, angle, centroidDistance };
    }
    if (ga.kind === 'cylinder' && gb.kind === 'cylinder') {
      const parallel = Math.abs(Math.abs(dot(ga.axis, gb.axis)) - 1) < 1e-6;
      const d = sub(gb.center, ga.center);
      const distance = parallel ? len(cross(d, ga.axis)) : null;
      return { kind: 'cylinder-cylinder', parallel, distance, diameters: [2 * ga.radius, 2 * gb.radius], wall: parallel ? Math.abs(distance - ga.radius - gb.radius) : null, centroidDistance };
    }
    const [p, c] = ga.kind === 'plane' ? [ga, gb] : [gb, ga];
    const perpendicular = Math.abs(dot(p.normal, c.axis)) < 1e-6;
    const distance = perpendicular ? Math.abs(dot(sub(c.center, p.point), p.normal)) : null;
    return { kind: 'plane-cylinder', parallel: perpendicular, distance, diameter: 2 * c.radius, centroidDistance };
  }
  return { kind: 'centroids', parallel: false, distance: null, centroidDistance };
}

/// Find a face by name in a build report's faces.
export const faceByName = (faces, name) => faces.find((f) => f.names.includes(name));
