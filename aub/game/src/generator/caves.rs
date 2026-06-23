use rand::Rng;
use crate::dungeon::{Map, Tile};
use super::Generator;

pub struct CaveGenerator {
    pub fill_prob: f64,
    pub iterations: usize,
    pub wall_threshold: usize,
}

impl Default for CaveGenerator {
    fn default() -> Self {
        Self { fill_prob: 0.45, iterations: 5, wall_threshold: 5 }
    }
}

impl Generator for CaveGenerator {
    fn generate(&self, width: usize, height: usize, rng: &mut impl Rng) -> Map {
        let mut map = Map::new(width, height);

        for y in 1..height - 1 {
            for x in 1..width - 1 {
                if !rng.gen_bool(self.fill_prob) {
                    map.set_tile(x, y, Tile::Floor);
                }
            }
        }

        for _ in 0..self.iterations {
            let snap: Vec<Tile> = map.tile_slice().to_vec();
            for y in 1..height - 1 {
                for x in 1..width - 1 {
                    let tile = if wall_count(&snap, x, y, width, height) >= self.wall_threshold {
                        Tile::Wall
                    } else {
                        Tile::Floor
                    };
                    map.set_tile(x, y, tile);
                }
            }
        }

        map.rebuild_connections();
        map
    }
}

fn wall_count(tiles: &[Tile], x: usize, y: usize, width: usize, height: usize) -> usize {
    let mut count = 0;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= width as i32 || ny >= height as i32 {
                count += 1;
            } else if tiles[ny as usize * width + nx as usize] == Tile::Wall {
                count += 1;
            }
        }
    }
    count
}
