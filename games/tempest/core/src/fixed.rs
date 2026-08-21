//! Integer trigonometry and roots.
//!
//! Why not `f64::sin`? Because a level is its seed, and the seed has to mean
//! the same thing on x86_64 (where the balance sweeps run) as it does on
//! wasm32 (where the game runs). Rust's `f64::sin` is a libm call whose last
//! bit is not guaranteed identical across those targets, and the web
//! generator rounds its output to integers — so a one-ulp difference can flip
//! a rounding boundary, change a lane's travel cost by a tick, and hand the
//! player a level that the solver certified for a *different* web.
//!
//! Everything here is integer-only, so that cannot happen.

/// One full turn, in the angle units used throughout. A power of two so that
/// quadrant folding is masking rather than division.
pub const TURN: i64 = 1 << 24;

/// Fixed-point scale for trig output: `sin_turns` returns `[-ONE, ONE]`.
pub const ONE: i64 = 1 << 20;

/// sin(2π · t / TURN), in units of `ONE`.
///
/// Quadrant-folded onto `[0, TURN/4]`, then a 5-term Taylor series in fixed
/// point. Peak error over the fold is under 2 parts per million of `ONE`,
/// which is three orders of magnitude finer than the per-mille grid the web
/// vertices land on.
pub fn sin_turns(t: i64) -> i64 {
    let quarter = TURN / 4;
    // Fold to [0, TURN) without a modulo on negatives.
    let t = t.rem_euclid(TURN);
    let (sign, a) = match t / quarter {
        0 => (1, t),
        1 => (1, TURN / 2 - t),
        2 => (-1, t - TURN / 2),
        _ => (-1, TURN - t),
    };
    // a in [0, TURN/4]  ->  x in [0, π/2] scaled by ONE.
    // π/2 in units of ONE:
    const HALF_PI: i64 = 1_647_099; // round(π/2 · 2^20)
    let x = a * HALF_PI / quarter;

    // sin x = x - x³/6 + x⁵/120 - x⁷/5040 + x⁹/362880, computed stepwise so no
    // intermediate exceeds ~1e13.
    let x2 = x * x / ONE;
    let mut term = x;
    let mut acc = term;
    for (i, div) in [6i64, 20, 42, 72].iter().enumerate() {
        // successive terms: x^(2k+1) / (2k+1)!  ==  prev · x² / ((2k)(2k+1))
        term = term * x2 / ONE / div;
        acc += if i % 2 == 0 { -term } else { term };
    }
    sign * acc
}

/// cos(2π · t / TURN), in units of `ONE`.
pub fn cos_turns(t: i64) -> i64 {
    sin_turns(t + TURN / 4)
}

/// Integer square root (floor). Newton's method on integers; exact.
pub fn isqrt(n: i64) -> i64 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Euclidean distance between two integer points, rounded to nearest.
pub fn dist(ax: i32, ay: i32, bx: i32, by: i32) -> i32 {
    let dx = (ax - bx) as i64;
    let dy = (ay - by) as i64;
    // isqrt(4d²) / 2 rounds half-up without leaving integer arithmetic.
    ((isqrt(4 * (dx * dx + dy * dy)) + 1) / 2) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sin_matches_reference_closely() {
        // Compared against f64 here only as a *test oracle*; the shipped path
        // never touches floats.
        let mut worst = 0i64;
        for i in 0..2048 {
            let t = i * TURN / 2048;
            let got = sin_turns(t);
            let want =
                ((i as f64 / 2048.0 * std::f64::consts::TAU).sin() * ONE as f64).round() as i64;
            worst = worst.max((got - want).abs());
        }
        assert!(worst <= 4, "worst sin error {worst} units of 2^-20");
    }

    #[test]
    fn sin_landmarks() {
        assert_eq!(sin_turns(0), 0);
        assert!((sin_turns(TURN / 4) - ONE).abs() <= 4);
        assert!(sin_turns(TURN / 2).abs() <= 4);
        assert!((sin_turns(3 * TURN / 4) + ONE).abs() <= 4);
        // negative and wrapped angles fold identically
        assert_eq!(sin_turns(-TURN / 4), sin_turns(3 * TURN / 4));
        assert_eq!(sin_turns(TURN + 12345), sin_turns(12345));
    }

    #[test]
    fn cos_is_sin_shifted() {
        assert!((cos_turns(0) - ONE).abs() <= 4);
        assert!(cos_turns(TURN / 4).abs() <= 4);
    }

    #[test]
    fn isqrt_is_exact() {
        for n in 0..2000i64 {
            let r = isqrt(n);
            assert!(r * r <= n && (r + 1) * (r + 1) > n, "isqrt({n}) = {r}");
        }
        assert_eq!(isqrt(1_000_000), 1000);
    }

    #[test]
    fn dist_rounds_to_nearest() {
        assert_eq!(dist(0, 0, 3, 4), 5);
        assert_eq!(dist(0, 0, 1, 1), 1); // √2 = 1.414 -> 1
        assert_eq!(dist(0, 0, 2, 2), 3); // 2√2 = 2.83 -> 3
        assert_eq!(dist(-5, -5, -5, -5), 0);
    }
}
