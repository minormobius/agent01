//! Recursive shadowcasting — produces a per-tile **brightness** value in
//! `[0, 1]`, with walls occluding and brightness falling off from 1.0 inside
//! `bright_radius` to 0.0 at or beyond `dim_radius`. The renderer tints each
//! tile by this value, so tiles at the light's edge are pitch-black in the
//! same way un-drawn tiles past the radius are — no seam between the two.
//!
//! Game logic can still classify a tile with `level_at(brightness)` to get
//! the D&D-style `Bright` / `Dim` / `Darkness` bucket for combat rules.
//!
//! Algorithm: standard 8-octant recursive shadowcasting
//! (RogueBasin / Björn Bergström).

use crate::dungeon::{Map, Tile};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LightLevel {
    Darkness,
    Dim,
    Bright,
}

/// Bucket a brightness value into a game-logic lighting level.
pub fn level_at(brightness: f32) -> LightLevel {
    if brightness >= 1.0 { LightLevel::Bright }
    else if brightness > 0.0 { LightLevel::Dim }
    else { LightLevel::Darkness }
}

/// Compute per-tile brightness `[0, 1]` from `origin`. Occluded tiles
/// and tiles outside `dim_radius` stay at 0. `extra_blockers` is a
/// list of `(x, y)` positions that block sight in addition to walls
/// — closed doors, deployed shutters, smoke clouds. The blocker
/// tiles themselves are still lit (so the player can *see* the
/// door), but anything past them stays dark.
pub fn compute_lightmap(
    map: &Map,
    origin: (usize, usize),
    bright_radius: usize,
    dim_radius: usize,
    extra_blockers: &[(usize, usize)],
) -> Vec<f32> {
    let mut out = vec![0.0f32; map.width * map.height];
    out[origin.1 * map.width + origin.0] = 1.0;

    let ox = origin.0 as i32;
    let oy = origin.1 as i32;
    let br = bright_radius as f32;
    let dr = dim_radius    as f32;
    let dri = dim_radius   as i32;

    for &[xx, xy, yx, yy] in OCTANT_MULT.iter() {
        cast_light(map, extra_blockers, (ox, oy), 1, 1.0, 0.0,
                   br, dr, dri, xx, xy, yx, yy, &mut out);
    }
    out
}

/// Smoothstep falloff from 1.0 at `bright_r` to 0.0 at `dim_r`.
fn distance_brightness(dist: f32, bright_r: f32, dim_r: f32) -> f32 {
    if dist <= bright_r { return 1.0; }
    if dist >= dim_r    { return 0.0; }
    let t = (dist - bright_r) / (dim_r - bright_r);
    1.0 - t * t * (3.0 - 2.0 * t)
}

const OCTANT_MULT: [[i32; 4]; 8] = [
    [ 1,  0,  0,  1],
    [ 0,  1,  1,  0],
    [ 0, -1,  1,  0],
    [-1,  0,  0,  1],
    [-1,  0,  0, -1],
    [ 0, -1, -1,  0],
    [ 0,  1, -1,  0],
    [ 1,  0,  0, -1],
];

fn blocks(map: &Map, extra: &[(usize, usize)], x: i32, y: i32) -> bool {
    if !map.in_bounds(x, y) { return true; }
    let (xu, yu) = (x as usize, y as usize);
    if map.tile(xu, yu) == Tile::Wall { return true; }
    extra.iter().any(|&p| p == (xu, yu))
}

#[allow(clippy::too_many_arguments)]
fn cast_light(
    map: &Map,
    extra_blockers: &[(usize, usize)],
    origin: (i32, i32),
    row: i32,
    mut start: f32,
    end: f32,
    bright_r: f32,
    dim_r: f32,
    dim_ri: i32,
    xx: i32, xy: i32, yx: i32, yy: i32,
    out: &mut [f32],
) {
    if start < end { return; }
    let dr_sq = dim_ri * dim_ri;
    let mut new_start = 0.0f32;
    let mut blocked = false;
    let mut distance = row;

    while distance <= dim_ri && !blocked {
        let dy = -distance;
        for dx in -distance..=0 {
            let cx = origin.0 + dx * xx + dy * xy;
            let cy = origin.1 + dx * yx + dy * yy;

            let l_slope = (dx as f32 - 0.5) / (dy as f32 + 0.5);
            let r_slope = (dx as f32 + 0.5) / (dy as f32 - 0.5);

            if start < r_slope { continue; }
            if end   > l_slope { break;    }

            let d_sq = dx * dx + dy * dy;
            if d_sq <= dr_sq && map.in_bounds(cx, cy) {
                let d = (d_sq as f32).sqrt();
                let b = distance_brightness(d, bright_r, dim_r);
                let idx = cy as usize * map.width + cx as usize;
                if b > out[idx] {
                    out[idx] = b;
                }
            }

            if blocked {
                if blocks(map, extra_blockers, cx, cy) {
                    new_start = r_slope;
                } else {
                    blocked = false;
                    start = new_start;
                }
            } else if blocks(map, extra_blockers, cx, cy) && distance < dim_ri {
                blocked = true;
                cast_light(map, extra_blockers, origin, distance + 1, start, l_slope,
                           bright_r, dim_r, dim_ri, xx, xy, yx, yy, out);
                new_start = r_slope;
            }
        }
        distance += 1;
    }
}
