//! Tiny deterministic RNG. No dependencies — the whole crate has none, so the
//! wasm stays a few tens of KB and `cargo test` needs no network.

pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        // Avoid the xorshift fixed point at 0.
        Rng(if seed == 0 { 0x9e37_79b9 } else { seed })
    }

    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// Uniform in [0, 1).
    #[inline]
    pub fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / 16_777_216.0
    }

    /// Uniform in [lo, hi).
    #[inline]
    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.unit()
    }

    /// Approximately standard-normal (Irwin–Hall, 4 draws). Cheap and bounded,
    /// which is what the Brownian kick wants — a true Gaussian's tail can
    /// launch a bearing through a contact in one step.
    #[inline]
    pub fn normal(&mut self) -> f32 {
        let s = self.unit() + self.unit() + self.unit() + self.unit() - 2.0;
        s * 1.732_050_8
    }
}

#[cfg(test)]
mod tests {
    use super::Rng;

    #[test]
    fn deterministic_and_bounded() {
        let a: Vec<f32> = (0..64).map(|_| Rng::new(7).unit()).collect();
        assert!(a.iter().all(|&v| (0.0..1.0).contains(&v)));
        let mut r1 = Rng::new(12345);
        let mut r2 = Rng::new(12345);
        for _ in 0..1000 {
            assert_eq!(r1.next_u32(), r2.next_u32());
        }
    }

    #[test]
    fn normal_has_roughly_unit_variance() {
        let mut r = Rng::new(99);
        let n = 20_000;
        let (mut m, mut m2) = (0.0f64, 0.0f64);
        for _ in 0..n {
            let v = r.normal() as f64;
            m += v;
            m2 += v * v;
        }
        let mean = m / n as f64;
        let var = m2 / n as f64 - mean * mean;
        assert!(mean.abs() < 0.05, "mean {mean}");
        assert!((var - 1.0).abs() < 0.1, "var {var}");
    }
}
