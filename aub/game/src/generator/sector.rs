use rand::Rng;
use rand::seq::SliceRandom;
use crate::dungeon::{Map, Room, Tile};
use super::Generator;

pub struct SectorGenerator {
    /// How many rooms to place (capped at 9 since there are only 9 sectors).
    pub min_rooms: usize,
    pub max_rooms: usize,
    pub min_room_size: usize,
    pub max_room_size: usize,
}

impl Default for SectorGenerator {
    fn default() -> Self {
        Self {
            min_rooms: 5,
            max_rooms: 9,
            min_room_size: 4,
            max_room_size: 8,
        }
    }
}

impl Generator for SectorGenerator {
    fn generate(&self, width: usize, height: usize, rng: &mut impl Rng) -> Map {
        let mut map = Map::new(width, height);

        // Choose which sectors receive a room.
        let target = rng.gen_range(self.min_rooms..=self.max_rooms.min(9));
        let mut sector_indices: Vec<usize> = (0..9).collect();
        sector_indices.shuffle(rng);
        sector_indices.truncate(target);
        sector_indices.sort();

        let mut centers: Vec<(usize, usize)> = Vec::new();

        for &idx in &sector_indices {
            let col = idx % 3;
            let row = idx / 3;

            // Sector bounds — last col/row absorbs the remainder.
            let sx = col * width / 3;
            let sy = row * height / 3;
            let sw = if col == 2 { width - sx } else { width / 3 };
            let sh = if row == 2 { height - sy } else { height / 3 };

            let pad = 2usize;
            let inner_w = sw.saturating_sub(2 * pad);
            let inner_h = sh.saturating_sub(2 * pad);
            if inner_w < self.min_room_size || inner_h < self.min_room_size {
                continue;
            }

            let rw = rng.gen_range(self.min_room_size..=inner_w.min(self.max_room_size));
            let rh = rng.gen_range(self.min_room_size..=inner_h.min(self.max_room_size));
            let rx = rng.gen_range((sx + pad)..=(sx + sw - pad - rw));
            let ry = rng.gen_range((sy + pad)..=(sy + sh - pad - rh));

            for y in ry..ry + rh {
                for x in rx..rx + rw {
                    map.dig(x, y);
                }
            }

            let center = (rx + rw / 2, ry + rh / 2);
            map.rooms.push(Room { x: rx, y: ry, width: rw, height: rh });
            centers.push(center);
        }

        // Connect all rooms with a minimum spanning tree (Prim's, Manhattan distance).
        if centers.len() >= 2 {
            let n = centers.len();
            let mut in_tree = vec![false; n];
            in_tree[0] = true;
            let mut count = 1;

            while count < n {
                let mut best_dist = usize::MAX;
                let mut best_from = 0;
                let mut best_to = 0;

                for i in 0..n {
                    if !in_tree[i] { continue; }
                    for j in 0..n {
                        if in_tree[j] { continue; }
                        let (ax, ay) = centers[i];
                        let (bx, by) = centers[j];
                        let dist = ax.abs_diff(bx) + ay.abs_diff(by);
                        if dist < best_dist {
                            best_dist = dist;
                            best_from = i;
                            best_to = j;
                        }
                    }
                }

                in_tree[best_to] = true;
                count += 1;
                dig_corridor(&mut map, centers[best_from], centers[best_to], rng.gen_bool(0.5));
            }
        }

        // Place entrance on the map border adjacent to a floor tile.
        {
            let mut candidates: Vec<(usize, usize)> = Vec::new();
            for x in 0..width {
                if map.tile(x, 1) == Tile::Floor          { candidates.push((x, 0)); }
                if map.tile(x, height - 2) == Tile::Floor { candidates.push((x, height - 1)); }
            }
            for y in 1..height - 1 {
                if map.tile(1, y) == Tile::Floor          { candidates.push((0, y)); }
                if map.tile(width - 2, y) == Tile::Floor  { candidates.push((width - 1, y)); }
            }
            if let Some(&(ex, ey)) = candidates.choose(rng) {
                map.dig(ex, ey);
                map.entrance = Some((ex, ey));
            }
        }

        map.rebuild_connections();
        map
    }
}

fn dig_corridor(map: &mut Map, from: (usize, usize), to: (usize, usize), h_first: bool) {
    let (mut x, mut y) = from;
    let (tx, ty) = to;
    if h_first {
        while x != tx { map.dig(x, y); x = if x < tx { x + 1 } else { x - 1 }; }
        while y != ty { map.dig(x, y); y = if y < ty { y + 1 } else { y - 1 }; }
    } else {
        while y != ty { map.dig(x, y); y = if y < ty { y + 1 } else { y - 1 }; }
        while x != tx { map.dig(x, y); x = if x < tx { x + 1 } else { x - 1 }; }
    }
    map.dig(x, y);
}
