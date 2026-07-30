//! mulberry32 — small, seedable, and good enough to jitter a spawn position.
//!
//! Seeded deliberately: the same source and the same seed must grow the same
//! structure, or the presets in the gallery would not reproduce.

pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Rng {
        Rng(seed | 1)
    }

    pub fn next_u32(&mut self) -> u32 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let mut z = self.0;
        z = (z ^ (z >> 15)).wrapping_mul(z | 1);
        z ^= z.wrapping_add((z ^ (z >> 7)).wrapping_mul(z | 61));
        z ^ (z >> 14)
    }

    /// Uniform in `[0, 1)`.
    pub fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32
    }

    /// Uniform in `[-1, 1)`.
    pub fn signed(&mut self) -> f32 {
        self.unit() * 2.0 - 1.0
    }
}
