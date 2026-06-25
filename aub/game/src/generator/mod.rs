pub mod caves;
pub mod rooms;
pub mod maze_rooms;
pub mod sector;

use rand::Rng;
use crate::dungeon::Map;

pub trait Generator {
    fn generate(&self, width: usize, height: usize, rng: &mut impl Rng) -> Map;
}
