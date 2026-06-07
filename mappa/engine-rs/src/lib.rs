// mappa-engine — first Rust/WASM milestone for the world engine.
//
// Ports the one part that walls JS resolution: the Delaunay triangulation.
// The JS engine stereographically projects the sphere points to a plane and
// triangulates them (the dual is the spherical Voronoi). Its Bowyer–Watson is
// O(n²) — fine to ~9k cells, then it falls over (16k ≈ 10s). `delaunator` is a
// robust O(n log n) sweep-hull, so this unblocks high-resolution globes.
//
// Contract (matches what engine.js expects): given the projected points as a
// flat [x0,y0,x1,y1,…] Float64Array, return the triangle vertex indices as a
// flat Uint32Array (3 per triangle, same point indexing). engine.js keeps doing
// the ghost-pole hull stitching, circumcentres and cell assembly — only the
// triangulation is offloaded. If the WASM isn't loaded, engine.js falls back to
// its own triangulator unchanged.

use wasm_bindgen::prelude::*;
use delaunator::{triangulate, Point};

#[wasm_bindgen]
pub fn triangulate_xy(coords: &[f64]) -> Vec<u32> {
    let pts: Vec<Point> = coords
        .chunks_exact(2)
        .map(|c| Point { x: c[0], y: c[1] })
        .collect();
    if pts.len() < 3 {
        return Vec::new();
    }
    triangulate(&pts)
        .triangles
        .iter()
        .map(|&i| i as u32)
        .collect()
}

/// Tiny self-describing hook so callers can confirm the module loaded.
#[wasm_bindgen]
pub fn engine_version() -> u32 {
    1
}
