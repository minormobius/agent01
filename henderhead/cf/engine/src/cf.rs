//! Continued fractions, computed exactly.
//!
//! Everything the curve needs is a list of **convergent denominators** q_k.
//! The drawing z(t) = Σ_k exp(i q_k t) / q_k^α never looks at the numerators,
//! and never looks at a_0 either — q_0 is 1 for every number, so the integer
//! part of x is invisible. Only frac(x) draws.
//!
//! Three exact sources, in order of how much they can promise:
//!
//!   * `Surd`     — (a + b√n)/c. The expansion is eventually periodic, so the
//!                  terms are exact *forever*; we can emit as many as asked.
//!   * `Rational` — p/q by Euclid. Exact and finite: the expansion stops.
//!   * a decimal  — read as the exact rational d/10^m it literally is. The
//!                  terms agree with the true number's while q_k² ≪ 10^m,
//!                  which for our 38-digit constants is far past any q we draw.
//!
//! i128 throughout. The largest intermediate is a product of two convergent
//! denominators, and we stop long before those threaten 2^127.

/// Convergent denominators above this are dropped: e^{i q t} needs more than
/// ~8q samples to draw honestly, and q_k grows at least like the Fibonacci
/// numbers, so this is a handful of terms rather than a real truncation.
pub const Q_CEILING: i128 = 1 << 50;

#[derive(Clone, Debug, PartialEq)]
pub struct Expansion {
    /// partial quotients a_0, a_1, … (a_0 kept for display only)
    pub terms: Vec<i64>,
    /// convergent numerators p_k
    pub ps: Vec<i128>,
    /// convergent denominators q_k — the frequencies of the Fourier series
    pub qs: Vec<i128>,
    /// index where the periodic block starts, and its length (surds only)
    pub period: Option<(usize, usize)>,
    /// true when every emitted term is provably the true number's term
    pub exact: bool,
    /// set when the expansion ended because the number is rational
    pub terminated: bool,
}

impl Expansion {
    fn from_terms(terms: Vec<i64>, period: Option<(usize, usize)>, exact: bool, terminated: bool) -> Self {
        let (ps, qs) = convergents(&terms);
        let n = qs.len();
        Expansion { terms: terms.into_iter().take(n).collect(), ps, qs, period, exact, terminated }
    }
}

/// p_k/q_k from the partial quotients, stopping before q_k leaves the ceiling.
pub fn convergents(terms: &[i64]) -> (Vec<i128>, Vec<i128>) {
    let (mut ps, mut qs) = (Vec::new(), Vec::new());
    // p_{-2}, p_{-1} = 0, 1 ;  q_{-2}, q_{-1} = 1, 0
    let (mut pm2, mut pm1): (i128, i128) = (0, 1);
    let (mut qm2, mut qm1): (i128, i128) = (1, 0);
    for &a in terms {
        let a = a as i128;
        let p = match a.checked_mul(pm1).and_then(|v| v.checked_add(pm2)) { Some(v) => v, None => break };
        let q = match a.checked_mul(qm1).and_then(|v| v.checked_add(qm2)) { Some(v) => v, None => break };
        if q > Q_CEILING { break; }
        ps.push(p);
        qs.push(q);
        pm2 = pm1; pm1 = p;
        qm2 = qm1; qm1 = q;
    }
    (ps, qs)
}

// ------------------------------------------------------------------ rational --

/// Euclid. Exact, and it stops: a rational has a finite expansion.
///
/// The result is already canonical — the form that does not end in 1. Euclid
/// cannot produce a trailing 1: that would need two equal consecutive
/// remainders, and remainders strictly decrease. So p/q has exactly one
/// expansion here, and equal fractions always draw the same picture.
pub fn cf_rational(mut num: i128, mut den: i128) -> Expansion {
    if den == 0 { return Expansion::from_terms(vec![0], None, true, true); }
    if den < 0 { num = -num; den = -den; }
    let mut terms = Vec::new();
    while den != 0 && terms.len() < 512 {
        // div_euclid floors toward -inf for a positive divisor, which is the
        // floor a continued fraction wants, negative x included.
        let a = num.div_euclid(den);
        let r = num.rem_euclid(den);
        terms.push(a as i64);
        num = den;
        den = r;
    }
    Expansion::from_terms(terms, None, true, true)
}

// --------------------------------------------------------------------- surd --

/// Integer square root, floor(√n) for n ≥ 0.
pub fn isqrt(n: i128) -> i128 {
    if n < 2 { return n.max(0); }
    let mut x = 1i128 << ((128 - n.leading_zeros() as i128) / 2 + 1);
    loop {
        let y = (x + n / x) >> 1;
        if y >= x { break; }
        x = y;
    }
    x
}

/// The continued fraction of (a + b√n)/c, exactly, for as many terms as asked.
///
/// Quadratic irrationals are the only numbers whose expansion is eventually
/// periodic (Euler–Lagrange), so this is the one source that never runs out and
/// never approximates. It is also the reason the golden ratio draws the
/// roughest picture on the page: all-1s is the slowest possible growth of q_k,
/// so 1/q_k decays slower for φ than for anything else.
///
/// Requires b > 0, c ≠ 0, n ≥ 0. A perfect-square n falls back to the rational
/// path, which is the right answer rather than a failure.
pub fn cf_surd(a: i128, b: i128, c: i128, n: i128, want: usize) -> Option<Expansion> {
    if b <= 0 || c == 0 || n < 0 { return None; }
    let r = isqrt(n);
    if r * r == n { return Some(cf_rational(a + b * r, c)); }

    // x = (P + √D)/Q, scaled so that Q divides D − P².
    let (mut p, mut q, d) = {
        let (p0, q0, d0) = (a, c, b.checked_mul(b)?.checked_mul(n)?);
        let (p0, q0, d0) = if q0 < 0 { (-p0, -q0, d0) } else { (p0, q0, d0) };
        (p0.checked_mul(q0)?, q0.checked_mul(q0)?, d0.checked_mul(q0)?.checked_mul(q0)?)
    };
    let sqrt_d = isqrt(d);

    let mut terms = Vec::with_capacity(want);
    let mut seen: Vec<(i128, i128)> = Vec::with_capacity(want);
    let mut period = None;

    while terms.len() < want {
        if q == 0 { break; }
        if period.is_none() {
            if let Some(i) = seen.iter().position(|&s| s == (p, q)) {
                period = Some((i, seen.len() - i));
            }
            seen.push((p, q));
        }
        // a_k = floor((P + √D)/Q). √D is irrational, so floor(P + √D) = P +
        // floor(√D) and the integer isqrt is the whole story.
        let ak = num_floor(p + sqrt_d, q);
        terms.push(ak as i64);
        let p_next = ak.checked_mul(q)?.checked_sub(p)?;
        let q_next = (d.checked_sub(p_next.checked_mul(p_next)?)?) / q;
        p = p_next;
        q = q_next;
        // once the period is known there is nothing left to learn, but we keep
        // emitting terms — the caller wants a long list, not the short one.
        if period.is_some() && terms.len() >= want { break; }
    }
    let np = period;
    Some(Expansion::from_terms(terms, np, true, false))
}

/// floor(x/y) for either sign of y.
fn num_floor(x: i128, y: i128) -> i128 {
    let (q, r) = (x / y, x % y);
    if r != 0 && ((r < 0) != (y < 0)) { q - 1 } else { q }
}

// ------------------------------------------------------------------ decimal --

/// Parse a signed decimal literal into the exact rational it denotes.
///
/// "3.14159…" is not π; it is a specific rational, and we expand *that*
/// exactly. With 38 significant digits the terms agree with the constant's own
/// until q_k ≈ 10^19, which is far past `Q_CEILING`, so within this page the
/// distinction never shows. Returns (num, den, significant_digits).
pub fn parse_decimal(s: &str) -> Option<(i128, i128, u32)> {
    let s = s.trim();
    let (neg, body) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let mut num: i128 = 0;
    let mut den: i128 = 1;
    let mut seen_dot = false;
    let mut digits = 0u32;
    let mut any = false;
    let mut significant = false;
    for ch in body.chars() {
        match ch {
            '.' if !seen_dot => seen_dot = true,
            '_' | ',' | ' ' => {}
            '0'..='9' => {
                any = true;
                let d = (ch as u8 - b'0') as i128;
                if d != 0 { significant = true; }
                // stop taking digits once another would overflow; the ones we
                // have already put q_k out past the ceiling.
                if num < i128::MAX / 100 {
                    num = num * 10 + d;
                    if seen_dot { den *= 10; }
                    if significant { digits += 1; }
                } else if !seen_dot {
                    return None; // integer part too large to hold exactly
                }
            }
            _ => return None,
        }
    }
    if !any { return None; }
    Some((if neg { -num } else { num }, den, digits))
}

pub fn cf_decimal(s: &str) -> Option<Expansion> {
    let (num, den, digits) = parse_decimal(s)?;
    let mut e = cf_rational(num, den);
    // A decimal is exact *as a rational*; it is only an approximation of
    // whatever irrational it was typed for. Terms are trustworthy while
    // q_k² < 10^digits.
    e.exact = false;
    e.terminated = true;
    let _ = digits;
    Some(e)
}

/// How far the terms of a `digits`-digit decimal can be trusted: q_k below
/// 10^(digits/2) is safe, because |x − p/q| < 1/q² is what selects a term.
pub fn trusted_q(digits: u32) -> f64 {
    10f64.powf(digits as f64 / 2.0)
}
