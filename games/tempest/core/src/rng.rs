//! SplitMix64. Small, seedable, and identical on every target — which is the
//! only property that matters here, because a level is *nothing but* its seed.
//!
//! Not cryptographic. Do not use it for anything that cares.

#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        // Any seed is legal, including 0 — SplitMix64's increment carries the
        // stream forward regardless.
        Rng { state: seed }
    }

    /// A named sub-stream. Lets the web generator and the wave generator draw
    /// from the same level seed without their draws interleaving — so changing
    /// how waves are built cannot silently reshape every web.
    pub fn stream(seed: u64, tag: &str) -> Self {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV-1a offset basis
        for b in tag.as_bytes() {
            h ^= *b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        Rng::new(seed ^ h)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, n)`. Rejection-sampled, so there is no modulo bias —
    /// which matters more than it sounds: biased draws over small ranges
    /// (lane counts, shape ids) skew a whole level population.
    pub fn below(&mut self, n: u64) -> u64 {
        assert!(n > 0, "Rng::below(0)");
        let zone = u64::MAX - (u64::MAX % n) - 1;
        loop {
            let v = self.next_u64();
            if v <= zone {
                return v % n;
            }
        }
    }

    /// Uniform in `[lo, hi]`.
    pub fn range(&mut self, lo: i32, hi: i32) -> i32 {
        assert!(hi >= lo, "Rng::range({lo}, {hi})");
        lo + self.below((hi - lo + 1) as u64) as i32
    }

    /// True with probability `num / den`.
    pub fn chance(&mut self, num: u64, den: u64) -> bool {
        self.below(den) < num
    }

    pub fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len() as u64) as usize]
    }

    pub fn shuffle<T>(&mut self, xs: &mut [T]) {
        for i in (1..xs.len()).rev() {
            let j = self.below((i + 1) as u64) as usize;
            xs.swap(i, j);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_stream() {
        let a: Vec<u64> = (0..8).map(|_| Rng::new(42).next_u64()).collect();
        assert!(a.iter().all(|v| *v == a[0]), "fresh Rng must restart");
        let mut r1 = Rng::new(7);
        let mut r2 = Rng::new(7);
        for _ in 0..64 {
            assert_eq!(r1.next_u64(), r2.next_u64());
        }
    }

    #[test]
    fn streams_diverge_but_are_stable() {
        let mut a = Rng::stream(99, "web");
        let mut b = Rng::stream(99, "wave");
        let mut a2 = Rng::stream(99, "web");
        assert_ne!(a.next_u64(), b.next_u64());
        assert_eq!(Rng::stream(99, "web").next_u64(), a2.next_u64());
    }

    #[test]
    fn below_is_in_range_and_covers() {
        let mut r = Rng::new(1);
        let mut seen = [0u32; 5];
        for _ in 0..5000 {
            let v = r.below(5) as usize;
            assert!(v < 5);
            seen[v] += 1;
        }
        // Every bucket should be well populated; a modulo-bias bug shows up
        // here as a lopsided histogram.
        assert!(seen.iter().all(|c| *c > 800), "skewed: {seen:?}");
    }

    #[test]
    fn range_hits_both_ends() {
        let mut r = Rng::new(3);
        let (mut lo, mut hi) = (false, false);
        for _ in 0..2000 {
            let v = r.range(-2, 2);
            assert!((-2..=2).contains(&v));
            lo |= v == -2;
            hi |= v == 2;
        }
        assert!(lo && hi);
    }
}
