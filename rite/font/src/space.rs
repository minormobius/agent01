//! Spacing and kerning.
//!
//! **Spacing** follows Walter Tracy's method: a case has one *straight*
//! sidebearing (set from its counter, so the `nn`/`HH` rhythm matches the
//! letters' own inner space), and every side is a fraction of it by shape —
//! round sides take a little over half, diagonals almost none.

use crate::build::{Drawn, Metrics};
use crate::curve::{v, V};
use crate::font::Cut;
use crate::style::Style;

pub fn sb_lc(s: &Style, m: &Metrics) -> f64 {
    (m.cn * 0.27 + m.stem * 0.06) * s.spacing
}
pub fn sb_uc(s: &Style, m: &Metrics) -> f64 {
    (m.ch * 0.21 + m.ustem * 0.1) * s.spacing
}

/// Position a glyph's polygons and return (polys, advance).
pub fn place(mut polys: Vec<Vec<V>>, d: &Drawn, c: char, s: &Style, m: &Metrics) -> (Vec<Vec<V>>, f64) {
    let (mut x0, mut x1) = (f64::MAX, f64::MIN);
    for p in &polys {
        for q in p {
            x0 = x0.min(q.x);
            x1 = x1.max(q.x);
        }
    }
    if let Some((a, b)) = d.body {
        x0 = a;
        x1 = b;
    }
    if x0 > x1 {
        return (polys, d.advance.unwrap_or(m.cn));
    }
    let sb = if c.is_uppercase() || c.is_ascii_digit() { sb_uc(s, m) } else { sb_lc(s, m) };
    let floor = m.stem * 0.08 + 6.0;
    let lsb = sb * d.l + if d.l < 0.2 { floor } else { 0.0 };
    let rsb = sb * d.r + if d.r < 0.2 { floor } else { 0.0 };
    let mut adv = d.advance.unwrap_or(lsb + (x1 - x0) + rsb);
    // fixed-advance glyphs (tabular figures, marks) centre their ink
    let mut dx = if d.advance.is_some() { (adv - (x1 - x0)) / 2.0 - x0 } else { lsb - x0 };
    let mut squeeze = 1.0;
    if s.mono {
        let ma = crate::font::mono_adv(m);
        let room = ma * 0.9;
        let iw = x1 - x0;
        if iw > room {
            // too wide for the cell (m, W, …): condense about the ink centre
            squeeze = room / iw;
        }
        dx = (ma - iw * squeeze) / 2.0 - x0 * squeeze;
        adv = ma;
    }
    for p in polys.iter_mut() {
        for q in p.iter_mut() {
            *q = v(q.x * squeeze + dx, q.y);
        }
    }
    (polys, adv)
}

// ---- kerning -----------------------------------------------------------------
//
// **Kerning** is measured, not tabulated. Each glyph's left and right edges
// are sampled in thin horizontal bands; for a pair, the white between them is
// averaged over the height they share (each band's depth clamped — the eye
// stops reading space past a point) and compared with the reference gap of
// `nn`, `HH` or `Hn`. The difference is the kern. A floor on the narrowest
// band keeps pairs like `Tô` from crashing their accents into the arm.

const BAND: f64 = 12.0;
const Y0: f64 = -320.0;
const NB: usize = 110; // covers -320 .. +1000

struct Prof {
    l: [f64; NB], // leftmost ink per band (NAN = none)
    r: [f64; NB], // advance − rightmost ink
    lo: usize,
    hi: usize,
}

fn profile(polys: &[Vec<V>], adv: f64) -> Option<Prof> {
    let mut l = [f64::NAN; NB];
    let mut r = [f64::NAN; NB];
    let mut any = false;
    for p in polys {
        let n = p.len();
        for i in 0..n {
            let a = p[i];
            let b = p[(i + 1) % n];
            let (ylo, yhi) = (a.y.min(b.y), a.y.max(b.y));
            let b0 = (((ylo - Y0) / BAND).floor().max(0.0)) as usize;
            let b1 = ((((yhi - Y0) / BAND).floor()) as usize).min(NB - 1);
            for k in b0..=b1 {
                let (y0, y1) = (Y0 + k as f64 * BAND, Y0 + (k + 1) as f64 * BAND);
                // x range of the edge inside this band
                let clip = |y: f64| {
                    if (b.y - a.y).abs() < 1e-9 {
                        a.x
                    } else {
                        a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y)).clamp(0.0, 1.0)
                    }
                };
                let ya = y0.max(ylo);
                let yb = y1.min(yhi);
                if ya > yb {
                    continue;
                }
                let xa = clip(ya);
                let xb = clip(yb);
                let (mn, mx) = (xa.min(xb), xa.max(xb));
                if l[k].is_nan() || mn < l[k] {
                    l[k] = mn;
                }
                let rr = adv - mx;
                if r[k].is_nan() || rr < r[k] {
                    r[k] = rr;
                }
                any = true;
            }
        }
    }
    if !any {
        return None;
    }
    let lo = (0..NB).find(|&k| !l[k].is_nan())?;
    let hi = (0..NB).rev().find(|&k| !l[k].is_nan())?;
    Some(Prof { l, r, lo, hi })
}

fn band_of(y: f64) -> usize {
    (((y - Y0) / BAND).floor().max(0.0) as usize).min(NB - 1)
}

/// (mean clamped gap, min gap) between `a` then `b`, over the bands they
/// share — trimmed to `zone` (the core of the letters, clear of serifs and
/// arms) when both are letters. The min gap always looks at every band.
fn gap(a: &Prof, b: &Prof, clamp: f64, zone: Option<(usize, usize)>) -> Option<(f64, f64)> {
    let lo0 = a.lo.max(b.lo);
    let hi0 = a.hi.min(b.hi);
    if lo0 > hi0 {
        return None;
    }
    let mut mn = f64::MAX;
    for k in lo0..=hi0 {
        if !a.r[k].is_nan() && !b.l[k].is_nan() {
            mn = mn.min(a.r[k] + b.l[k]);
        }
    }
    let (lo, hi) = match zone {
        Some((z0, z1)) => (lo0.max(z0), hi0.min(z1)),
        None => (lo0, hi0),
    };
    if lo > hi {
        return None;
    }
    if lo > hi {
        return None;
    }
    let (mut sum, mut n) = (0.0, 0.0);
    // bands where one side is empty count as fully open
    for k in lo..=hi {
        let ra = a.r[k];
        let lb = b.l[k];
        let g = match (ra.is_nan(), lb.is_nan()) {
            (false, false) => ra + lb,
            _ => clamp,
        };
        sum += g.min(clamp);
        n += 1.0;
    }
    if n < 2.0 {
        return None;
    }
    Some((sum / n, mn))
}

/// Which glyphs take part in kerning.
fn kernable(c: char) -> bool {
    let u = c as u32;
    let latin = c.is_alphabetic() && u < 0x250;
    let caps_other = c.is_uppercase() && (0x370..0x530).contains(&u);
    latin || caps_other || c.is_ascii_digit() || ".,:;!?'\"‘’“”‚„-–—()/«»‹›&".contains(c)
}

/// Class-based kerning, ready for GPOS: per-glyph left/right class (0 = none),
/// the class×class matrix, and a flat pair list for the legacy `kern` table.
pub struct Kerning {
    pub cls_l: Vec<u16>, // class of each cut as the FIRST glyph of a pair
    pub cls_r: Vec<u16>, // class of each cut as the SECOND glyph
    pub n_l: usize,      // classes incl. class 0
    pub n_r: usize,
    pub matrix: Vec<i16>, // n_l × n_r, row-major
    pub legacy: Vec<(usize, usize, i16)>,
}

impl Kerning {
    pub fn get(&self, a: usize, b: usize) -> i16 {
        self.matrix[self.cls_l[a] as usize * self.n_r + self.cls_r[b] as usize]
    }
}

/// Profile distance: mean and max |Δ| over the bands either side inks, with a
/// flat penalty where only one does.
fn pdist(a: &[f64; NB], b: &[f64; NB]) -> (f64, f64) {
    let (mut sum, mut n, mut mx) = (0.0, 0.0, 0.0f64);
    for k in 0..NB {
        let d = match (a[k].is_nan(), b[k].is_nan()) {
            (true, true) => continue,
            (false, false) => (a[k] - b[k]).abs(),
            _ => 40.0,
        };
        sum += d;
        n += 1.0;
        mx = mx.max(d);
    }
    if n == 0.0 {
        (0.0, 0.0)
    } else {
        (sum / n, mx)
    }
}

/// Greedy clustering of one side's profiles; the first member seen is the
/// class's representative, so `order` puts the plain letters first.
fn cluster(profs: &[Option<Prof>], order: &[usize], right_side: bool, tol: f64) -> (Vec<u16>, Vec<usize>) {
    let mut cls = vec![0u16; profs.len()];
    let mut reps: Vec<usize> = Vec::new();
    for &i in order {
        let Some(p) = &profs[i] else { continue };
        let arr = if right_side { &p.r } else { &p.l };
        let mut found = None;
        for (ci, &r) in reps.iter().enumerate() {
            let q = profs[r].as_ref().unwrap();
            let qa = if right_side { &q.r } else { &q.l };
            let (mean, mx) = pdist(arr, qa);
            if mean <= tol && mx <= tol * 4.0 {
                found = Some(ci);
                break;
            }
        }
        let ci = match found {
            Some(ci) => ci,
            None => {
                reps.push(i);
                reps.len() - 1
            }
        };
        cls[i] = (ci + 1) as u16;
    }
    (cls, reps)
}

pub fn kern(cuts: &[Cut], s: &Style, m: &Metrics) -> Option<Kerning> {
    let profs: Vec<Option<Prof>> = cuts
        .iter()
        .map(|c| if kernable(c.ch) { profile(&c.polys, c.advance) } else { None })
        .collect();
    let idx = |ch: char| cuts.iter().position(|c| c.ch == ch);
    let (n, h) = (idx('n')?, idx('H')?);
    let (pn, ph) = (profs[n].as_ref()?, profs[h].as_ref()?);
    let slc = sb_lc(s, m);
    let suc = sb_uc(s, m);
    let clamp_lc = slc * 3.4 + m.stem * 0.3;
    let clamp_uc = suc * 3.4 + m.ustem * 0.3;
    // core zones: clear of serifs, arms and crossbar ends
    let zl = Some((band_of(m.xh * 0.14), band_of(m.xh * 0.86)));
    let zu = Some((band_of(m.cap * 0.12), band_of(m.cap * 0.88)));
    let po = idx('o').and_then(|i| profs[i].as_ref());
    let pbo = idx('O').and_then(|i| profs[i].as_ref());
    // the reference: the mean of straight–straight, round–round and mixed,
    // so Tracy's round/straight balance isn't "corrected" by the kerner
    let refm = |a: &Prof, r: Option<&Prof>, clamp: f64, z| {
        let mut v = vec![gap(a, a, clamp, z).map(|g| g.0)];
        if let Some(r) = r {
            v.push(gap(r, r, clamp, z).map(|g| g.0));
            v.push(gap(a, r, clamp, z).map(|g| g.0));
            v.push(gap(r, a, clamp, z).map(|g| g.0));
        }
        let v: Vec<f64> = v.into_iter().flatten().collect();
        if v.is_empty() {
            None
        } else {
            Some(v.iter().sum::<f64>() / v.len() as f64)
        }
    };
    let ref_lc = refm(pn, po, clamp_lc, zl).unwrap_or(2.0 * slc);
    let ref_uc = refm(ph, pbo, clamp_uc, zu).unwrap_or(2.0 * suc);
    let ref_mx = gap(ph, pn, clamp_lc, zl).map(|g| g.0).unwrap_or(slc + suc);
    let strength = 0.78;
    let pair = |i: usize, j: usize| -> i16 {
        let (Some(pa), Some(pb)) = (&profs[i], &profs[j]) else { return 0 };
        let (ca, cb) = (cuts[i].ch, cuts[j].ch);
        let (ua, ub) = (ca.is_uppercase(), cb.is_uppercase());
        let (reference, clamp, sb, zone) = match (ua, ub) {
            (true, true) => (ref_uc, clamp_uc, suc, zu),
            (false, false) => (ref_lc, clamp_lc, slc, zl),
            _ => (ref_mx, clamp_lc, (slc + suc) / 2.0, zl),
        };
        // punctuation is measured wherever it sits
        let letters = ca.is_alphabetic() && cb.is_alphabetic();
        let zone = if letters { zone } else { None };
        let Some((avg, mn)) = gap(pa, pb, clamp, zone) else { return 0 };
        let mut k = strength * (reference - avg);
        // never tighten below a floor; open up anything that collides
        let floor = sb * 0.45 + m.stem * 0.05;
        k = k.max(-(sb * 2.6 + m.stem * 0.4));
        if mn + k < floor {
            k = (floor - mn).min(sb * 0.9);
        }
        let thresh = if letters { (sb * 0.34).max(10.0) } else { (sb * 0.2).max(6.0) };
        if k.abs() >= thresh {
            k.round() as i16
        } else {
            0
        }
    };
    // plain ASCII first, so class representatives are the familiar letters
    let mut order: Vec<usize> = (0..cuts.len()).collect();
    order.sort_by_key(|&i| {
        let c = cuts[i].ch;
        (if c.is_ascii() { 0 } else if (c as u32) < 0x250 { 1 } else { 2 }, i)
    });
    // cluster, loosening until the class matrix fits comfortably in GPOS
    let mut tol = 5.0;
    let (cls_l, reps_l, cls_r, reps_r) = loop {
        let (cl, rl) = cluster(&profs, &order, true, tol);
        let (cr, rr) = cluster(&profs, &order, false, tol);
        if (rl.len() + 1) * (rr.len() + 1) <= 26_000 || tol > 60.0 {
            break (cl, rl, cr, rr);
        }
        tol *= 1.25;
    };
    let n_l = reps_l.len() + 1;
    let n_r = reps_r.len() + 1;
    let mut matrix = vec![0i16; n_l * n_r];
    for (a, &ra) in reps_l.iter().enumerate() {
        for (b, &rb) in reps_r.iter().enumerate() {
            matrix[(a + 1) * n_r + (b + 1)] = pair(ra, rb);
        }
    }
    let kerning = Kerning { cls_l, cls_r, n_l, n_r, matrix, legacy: Vec::new() };
    // legacy `kern` table: the ASCII pairs, for apps that never read GPOS
    let ascii: Vec<usize> = (0..cuts.len()).filter(|&i| cuts[i].ch.is_ascii_graphic()).collect();
    let mut legacy = Vec::new();
    for &i in &ascii {
        for &j in &ascii {
            let k = kerning.get(i, j);
            if k != 0 {
                legacy.push((i, j, k));
            }
        }
    }
    // keep the legacy table small: the strongest pairs
    if legacy.len() > 2_400 {
        legacy.sort_by_key(|p| -(p.2.unsigned_abs() as i32));
        legacy.truncate(2_400);
    }
    if std::env::var("KERN_DEBUG").is_ok() {
        eprintln!("kern: tol={tol:.1} classes {n_l}×{n_r} legacy={}", legacy.len());
    }
    Some(Kerning { legacy, ..kerning })
}
