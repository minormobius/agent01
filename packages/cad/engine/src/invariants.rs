//! What a test asserts on. Mesh bits change with tessellation and kernel
//! version; a bracket's volume does not. Everything here is computed from a
//! plain triangle soup so it is the same number for every kernel.

use crate::kernel::TriMesh;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct Invariants {
    pub volume: f64,
    pub area: f64,
    pub bbox: [[f64; 3]; 2],
    pub centroid: [f64; 3],
    pub euler: i64,
    pub watertight: bool,
    pub tris: usize,
    pub verts: usize,
    /// edges not used by exactly two triangles
    pub open_edges: usize,
    /// edges whose two triangles disagree on orientation
    pub flipped_edges: usize,
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }

pub fn compute(m: &TriMesh) -> Invariants {
    let mut volume = 0.0;
    let mut area = 0.0;
    let mut cx = [0.0; 3];
    let mut bbox = [[f64::INFINITY; 3], [f64::NEG_INFINITY; 3]];
    for p in &m.pos {
        for i in 0..3 {
            bbox[0][i] = bbox[0][i].min(p[i]);
            bbox[1][i] = bbox[1][i].max(p[i]);
        }
    }
    // signed tetra volumes from the origin; centroid of volume
    let mut edges: HashMap<(u32, u32), i32> = HashMap::new();
    for t in &m.tris {
        let (a, b, c) = (m.pos[t[0] as usize], m.pos[t[1] as usize], m.pos[t[2] as usize]);
        let v = dot(a, cross(b, c)) / 6.0;
        volume += v;
        for i in 0..3 {
            cx[i] += v * (a[i] + b[i] + c[i]) / 4.0;
        }
        let n = cross(sub(b, a), sub(c, a));
        area += dot(n, n).sqrt() / 2.0;
        for k in 0..3 {
            let (p, q) = (t[k], t[(k + 1) % 3]);
            let key = if p < q { (p, q) } else { (q, p) };
            let e = edges.entry(key).or_insert(0);
            // +1 for one direction, -1 for the other; a watertight, consistently
            // oriented mesh has every edge summing to 0 with exactly 2 uses.
            *e += if p < q { 1 } else { -1 };
        }
    }
    let mut uses: HashMap<(u32, u32), u32> = HashMap::new();
    for t in &m.tris {
        for k in 0..3 {
            let (p, q) = (t[k], t[(k + 1) % 3]);
            let key = if p < q { (p, q) } else { (q, p) };
            *uses.entry(key).or_insert(0) += 1;
        }
    }
    let open_edges = uses.values().filter(|&&u| u != 2).count();
    let flipped_edges = edges.iter().filter(|(k, &s)| uses[k] == 2 && s != 0).count();
    let watertight = !m.tris.is_empty() && open_edges == 0 && flipped_edges == 0;
    let verts = {
        let mut used = vec![false; m.pos.len()];
        for t in &m.tris {
            for &i in t {
                used[i as usize] = true;
            }
        }
        used.iter().filter(|&&u| u).count()
    };
    let euler = verts as i64 - edges.len() as i64 + m.tris.len() as i64;
    if volume.abs() > 1e-12 {
        for c in &mut cx {
            *c /= volume;
        }
    }
    Invariants { volume, area, bbox, centroid: cx, euler, watertight, tris: m.tris.len(), verts, open_edges, flipped_edges }
}

/// Weld vertices closer than `tol` so invariants (Euler, watertight) are
/// about the geometry rather than the tessellator's bookkeeping.
pub fn weld(m: &TriMesh, tol: f64) -> TriMesh { weld_with(m, tol, &[]).0 }

/// `weld`, also carrying a per-triangle payload (face ids) through the
/// degenerate-triangle drop so the two stay aligned.
pub fn weld_with(m: &TriMesh, tol: f64, per_tri: &[u32]) -> (TriMesh, Vec<u32>) {
    let q = |x: f64| -> i64 { (x / tol).round() as i64 };
    let mut map: HashMap<(i64, i64, i64), u32> = HashMap::new();
    let mut pos = Vec::new();
    let mut remap = vec![0u32; m.pos.len()];
    for (i, p) in m.pos.iter().enumerate() {
        let key = (q(p[0]), q(p[1]), q(p[2]));
        let idx = *map.entry(key).or_insert_with(|| {
            pos.push(*p);
            (pos.len() - 1) as u32
        });
        remap[i] = idx;
    }
    let mut tris = Vec::with_capacity(m.tris.len());
    let mut ids = Vec::new();
    for (i, t) in m.tris.iter().enumerate() {
        let t = [remap[t[0] as usize], remap[t[1] as usize], remap[t[2] as usize]];
        if t[0] != t[1] && t[1] != t[2] && t[0] != t[2] {
            tris.push(t);
            if let Some(&id) = per_tri.get(i) {
                ids.push(id);
            }
        }
    }
    (TriMesh { pos, tris }, ids)
}

/// Binary STL.
pub fn stl(m: &TriMesh) -> Vec<u8> {
    let mut out = Vec::with_capacity(84 + m.tris.len() * 50);
    out.extend_from_slice(&[0u8; 80]);
    out.extend_from_slice(&(m.tris.len() as u32).to_le_bytes());
    for t in &m.tris {
        let (a, b, c) = (m.pos[t[0] as usize], m.pos[t[1] as usize], m.pos[t[2] as usize]);
        let n = cross(sub(b, a), sub(c, a));
        let l = dot(n, n).sqrt().max(1e-300);
        for v in [[n[0] / l, n[1] / l, n[2] / l], a, b, c] {
            for x in v {
                out.extend_from_slice(&(x as f32).to_le_bytes());
            }
        }
        out.extend_from_slice(&[0u8; 2]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unit_cube() {
        let p = |x, y, z| [x, y, z];
        let pos = vec![p(0.0, 0.0, 0.0), p(1.0, 0.0, 0.0), p(1.0, 1.0, 0.0), p(0.0, 1.0, 0.0), p(0.0, 0.0, 1.0), p(1.0, 0.0, 1.0), p(1.0, 1.0, 1.0), p(0.0, 1.0, 1.0)];
        let quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
        let mut tris = Vec::new();
        for q in quads {
            tris.push([q[0], q[1], q[2]]);
            tris.push([q[0], q[2], q[3]]);
        }
        let inv = compute(&TriMesh { pos, tris });
        assert!((inv.volume - 1.0).abs() < 1e-12);
        assert!((inv.area - 6.0).abs() < 1e-12);
        assert_eq!(inv.euler, 2);
        assert!(inv.watertight);
        assert!((inv.centroid[0] - 0.5).abs() < 1e-12);
    }
}
