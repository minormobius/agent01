//! Deterministic PRNG — the same xmur3 (string→seed) + mulberry32 pair that
//! borges uses, so a seed string yields the same font on every machine forever.
//! That determinism is what makes `?s=<seed>` a permalink and what will let the
//! evolutionary breeder reproduce any lineage from its seeds alone.

pub struct Rng {
    s: u32,
}

impl Rng {
    pub fn new(seed: &str) -> Self {
        Rng { s: xmur3(seed) }
    }

    pub fn next_u32(&mut self) -> u32 {
        // mulberry32
        self.s = self.s.wrapping_add(0x6D2B_79F5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    pub fn unit(&mut self) -> f64 {
        self.next_u32() as f64 / 4_294_967_296.0
    }

    pub fn range(&mut self, a: f64, b: f64) -> f64 {
        a + (b - a) * self.unit()
    }

    pub fn chance(&mut self, p: f64) -> bool {
        self.unit() < p
    }
}

/// xmur3: hash a string into a well-mixed 32-bit seed.
pub fn xmur3(s: &str) -> u32 {
    let mut h: u32 = 1779033703 ^ (s.len() as u32);
    for b in s.bytes() {
        h = h.wrapping_mul(3432918353).wrapping_add(b as u32);
        h = h.rotate_left(13);
    }
    h = (h ^ (h >> 16)).wrapping_mul(2246822507);
    h = (h ^ (h >> 13)).wrapping_mul(3266489909);
    h ^= h >> 16;
    h
}
