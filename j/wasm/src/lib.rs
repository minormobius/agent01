//! ImageJ-in-the-browser — heavy compute kernel.
//!
//! Everything numerically expensive runs here in Rust/WASM:
//!   * grayscale conversion + global statistics
//!   * Sobel gradient (edge map)
//!   * Hough-gradient circle detection (the "count the spheres" step)
//!   * line intensity profiles, with arbitrary line thickness roll-up
//!   * Monte-Carlo radial sampling across the whole population of spheres
//!   * curve fitting (semi-empirical exponential penetration + Fickian sphere series)
//!   * a synthetic confocal-sphere image generator (test data / demo)
//!
//! The browser never ships pixels anywhere — it hands an RGBA buffer to these
//! functions and gets numbers back. All data stays in the tab.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[inline]
fn ser<T: Serialize>(v: &T) -> JsValue {
    serde_wasm_bindgen::to_value(v).unwrap_or(JsValue::NULL)
}

/* ----------------------------------------------------------------------- *
 *  Tiny deterministic PRNG (xorshift64*) — avoids the getrandom/wasm dance *
 * ----------------------------------------------------------------------- */
struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self {
        // Avoid the all-zero state.
        Rng(seed ^ 0x9E3779B97F4A7C15 | 1)
    }
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }
    /// Uniform f64 in [0, 1).
    #[inline]
    fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
    /// Approx standard normal (sum of 12 uniforms - 6), good enough for noise.
    #[inline]
    fn normal(&mut self) -> f64 {
        let mut s = 0.0;
        for _ in 0..12 {
            s += self.unit();
        }
        s - 6.0
    }
}

/* ----------------------------------------------------------------------- *
 *  Bilinear sampling                                                       *
 * ----------------------------------------------------------------------- */
#[inline]
fn sample(g: &[f32], w: usize, h: usize, x: f64, y: f64) -> f64 {
    if w == 0 || h == 0 {
        return 0.0;
    }
    let xc = x.clamp(0.0, (w - 1) as f64);
    let yc = y.clamp(0.0, (h - 1) as f64);
    let x0 = xc.floor() as usize;
    let y0 = yc.floor() as usize;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);
    let fx = xc - x0 as f64;
    let fy = yc - y0 as f64;
    let v00 = g[y0 * w + x0] as f64;
    let v10 = g[y0 * w + x1] as f64;
    let v01 = g[y1 * w + x0] as f64;
    let v11 = g[y1 * w + x1] as f64;
    let a = v00 * (1.0 - fx) + v10 * fx;
    let b = v01 * (1.0 - fx) + v11 * fx;
    a * (1.0 - fy) + b * fy
}

/* ----------------------------------------------------------------------- *
 *  Grayscale + stats                                                       *
 * ----------------------------------------------------------------------- */

/// RGBA (4 bytes/px) -> Float32 luminance (0..255).
#[wasm_bindgen]
pub fn grayscale(rgba: &[u8], w: usize, h: usize) -> Vec<f32> {
    let n = w * h;
    let mut out = vec![0.0f32; n];
    for i in 0..n {
        let r = rgba[i * 4] as f32;
        let g = rgba[i * 4 + 1] as f32;
        let b = rgba[i * 4 + 2] as f32;
        // Rec.601 luma — standard for scientific intensity readout.
        out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    out
}

#[derive(Serialize)]
struct Stats {
    count: usize,
    min: f64,
    max: f64,
    mean: f64,
    std: f64,
    median: f64,
    p1: f64,
    p99: f64,
    /// 256-bin histogram over [0,255].
    hist: Vec<u32>,
    /// integrated density (sum of intensities)
    integrated: f64,
}

#[wasm_bindgen]
pub fn stats(gray: &[f32]) -> JsValue {
    let n = gray.len();
    if n == 0 {
        return JsValue::NULL;
    }
    let mut mn = f64::INFINITY;
    let mut mx = f64::NEG_INFINITY;
    let mut sum = 0.0;
    let mut hist = vec![0u32; 256];
    for &v in gray {
        let v = v as f64;
        if v < mn {
            mn = v;
        }
        if v > mx {
            mx = v;
        }
        sum += v;
        let b = (v.clamp(0.0, 255.0)) as usize;
        hist[b.min(255)] += 1;
    }
    let mean = sum / n as f64;
    let mut var = 0.0;
    for &v in gray {
        let d = v as f64 - mean;
        var += d * d;
    }
    var /= n as f64;
    // Percentiles from the histogram (cheap, no full sort).
    let pct = |p: f64| -> f64 {
        let target = (p * n as f64).round() as u64;
        let mut acc = 0u64;
        for (b, &c) in hist.iter().enumerate() {
            acc += c as u64;
            if acc >= target {
                return b as f64;
            }
        }
        255.0
    };
    ser(&Stats {
        count: n,
        min: mn,
        max: mx,
        mean,
        std: var.sqrt(),
        median: pct(0.5),
        p1: pct(0.01),
        p99: pct(0.99),
        hist,
        integrated: sum,
    })
}

/* ----------------------------------------------------------------------- *
 *  Gaussian blur (separable) + Sobel                                       *
 * ----------------------------------------------------------------------- */
fn gaussian_blur(g: &[f32], w: usize, h: usize, sigma: f64) -> Vec<f32> {
    if sigma <= 0.05 {
        return g.to_vec();
    }
    let radius = (sigma * 3.0).ceil() as i64;
    let mut kernel = vec![0.0f64; (2 * radius + 1) as usize];
    let mut ksum = 0.0;
    for i in -radius..=radius {
        let v = (-(i * i) as f64 / (2.0 * sigma * sigma)).exp();
        kernel[(i + radius) as usize] = v;
        ksum += v;
    }
    for k in kernel.iter_mut() {
        *k /= ksum;
    }
    // horizontal
    let mut tmp = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for i in -radius..=radius {
                let xx = (x as i64 + i).clamp(0, w as i64 - 1) as usize;
                acc += g[y * w + xx] as f64 * kernel[(i + radius) as usize];
            }
            tmp[y * w + x] = acc as f32;
        }
    }
    // vertical
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for i in -radius..=radius {
                let yy = (y as i64 + i).clamp(0, h as i64 - 1) as usize;
                acc += tmp[yy * w + x] as f64 * kernel[(i + radius) as usize];
            }
            out[y * w + x] = acc as f32;
        }
    }
    out
}

struct Grad {
    mag: Vec<f32>,
    gx: Vec<f32>,
    gy: Vec<f32>,
    max: f64,
}

fn sobel_grad(g: &[f32], w: usize, h: usize) -> Grad {
    let mut mag = vec![0.0f32; w * h];
    let mut gx = vec![0.0f32; w * h];
    let mut gy = vec![0.0f32; w * h];
    let mut max = 0.0f64;
    for y in 1..h.saturating_sub(1) {
        for x in 1..w.saturating_sub(1) {
            let idx = |dx: i64, dy: i64| g[((y as i64 + dy) * w as i64 + (x as i64 + dx)) as usize] as f64;
            let sx = (idx(1, -1) + 2.0 * idx(1, 0) + idx(1, 1))
                - (idx(-1, -1) + 2.0 * idx(-1, 0) + idx(-1, 1));
            let sy = (idx(-1, 1) + 2.0 * idx(0, 1) + idx(1, 1))
                - (idx(-1, -1) + 2.0 * idx(0, -1) + idx(1, -1));
            let m = (sx * sx + sy * sy).sqrt();
            gx[y * w + x] = sx as f32;
            gy[y * w + x] = sy as f32;
            mag[y * w + x] = m as f32;
            if m > max {
                max = m;
            }
        }
    }
    Grad { mag, gx, gy, max }
}

/// Sobel gradient magnitude, normalised to 0..255 for display.
#[wasm_bindgen]
pub fn sobel(gray: &[f32], w: usize, h: usize, sigma: f64) -> Vec<f32> {
    let blurred = gaussian_blur(gray, w, h, sigma);
    let gr = sobel_grad(&blurred, w, h);
    let scale = if gr.max > 0.0 { 255.0 / gr.max } else { 0.0 };
    gr.mag.iter().map(|&m| (m as f64 * scale) as f32).collect()
}

/* ----------------------------------------------------------------------- *
 *  Hough-gradient circle detection                                         *
 * ----------------------------------------------------------------------- */
#[derive(Serialize, Deserialize, Clone)]
pub struct Circle {
    pub cx: f64,
    pub cy: f64,
    pub r: f64,
    pub score: f64,
}

/// Detect circular objects via the Hough-gradient method.
///
/// Returns an array of `{cx, cy, r, score}`. Tune via the params; defaults
/// in the UI work for typical confocal sphere fields.
#[wasm_bindgen]
pub fn detect_circles(
    gray: &[f32],
    w: usize,
    h: usize,
    blur_sigma: f64,
    min_r: f64,
    max_r: f64,
    min_dist: f64,
    edge_frac: f64,   // edge pixels kept if mag > edge_frac * maxMag
    vote_frac: f64,   // centers kept if accumulator > vote_frac * maxAcc
    max_circles: usize,
) -> JsValue {
    if w < 3 || h < 3 || max_r <= 0.0 {
        return ser(&Vec::<Circle>::new());
    }
    let blurred = gaussian_blur(gray, w, h, blur_sigma);
    let gr = sobel_grad(&blurred, w, h);
    let edge_thresh = gr.max * edge_frac.max(1e-6);

    // Collect strong edge pixels with their unit gradient direction.
    let mut edges: Vec<(usize, usize, f64, f64)> = Vec::new();
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let m = gr.mag[y * w + x] as f64;
            if m >= edge_thresh && m > 0.0 {
                let dx = gr.gx[y * w + x] as f64 / m;
                let dy = gr.gy[y * w + x] as f64 / m;
                edges.push((x, y, dx, dy));
            }
        }
    }
    if edges.is_empty() {
        return ser(&Vec::<Circle>::new());
    }

    // Accumulate candidate centers by walking along the gradient direction.
    let mut acc = vec![0.0f32; w * h];
    let r0 = min_r.max(2.0);
    let r1 = max_r.max(r0 + 1.0);
    let step = 1.0_f64.max((r1 - r0) / 60.0); // cap iterations per edge pixel
    for &(x, y, dx, dy) in &edges {
        let mut r = r0;
        while r <= r1 {
            for s in [1.0_f64, -1.0] {
                let cx = x as f64 + s * dx * r;
                let cy = y as f64 + s * dy * r;
                if cx >= 0.0 && cy >= 0.0 && cx < w as f64 && cy < h as f64 {
                    let ix = cx as usize;
                    let iy = cy as usize;
                    acc[iy * w + ix] += 1.0;
                }
            }
            r += step;
        }
    }
    // Light blur of the accumulator to consolidate votes.
    let acc = gaussian_blur(&acc, w, h, 1.5);
    let acc_max = acc.iter().cloned().fold(0.0f32, f32::max) as f64;
    if acc_max <= 0.0 {
        return ser(&Vec::<Circle>::new());
    }
    let acc_thresh = acc_max * vote_frac.max(1e-6);

    // Candidate centers = local maxima above threshold.
    let mut cands: Vec<(f64, usize, usize)> = Vec::new();
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let v = acc[y * w + x] as f64;
            if v < acc_thresh {
                continue;
            }
            let mut is_max = true;
            'nb: for dy in -1i64..=1 {
                for dx in -1i64..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nx = (x as i64 + dx) as usize;
                    let ny = (y as i64 + dy) as usize;
                    if (acc[ny * w + nx] as f64) > v {
                        is_max = false;
                        break 'nb;
                    }
                }
            }
            if is_max {
                cands.push((v, x, y));
            }
        }
    }
    cands.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Greedy non-max suppression by min center distance, then radius estimation.
    let md2 = min_dist * min_dist;
    let mut circles: Vec<Circle> = Vec::new();
    let nbins = (r1.ceil() as usize) + 2;
    for (score, cx, cy) in cands {
        if circles.len() >= max_circles {
            break;
        }
        let cxf = cx as f64;
        let cyf = cy as f64;
        if circles
            .iter()
            .any(|c| (c.cx - cxf).powi(2) + (c.cy - cyf).powi(2) < md2)
        {
            continue;
        }
        // Radius histogram from edge pixels around this center.
        let mut rhist = vec![0u32; nbins];
        for &(ex, ey, _, _) in &edges {
            let d = ((ex as f64 - cxf).powi(2) + (ey as f64 - cyf).powi(2)).sqrt();
            if d >= r0 && d <= r1 {
                rhist[d.round() as usize] += 1;
            }
        }
        // Smooth and pick the dominant radius.
        let mut best_r = 0usize;
        let mut best_c = 0.0f64;
        for r in r0 as usize..=r1 as usize {
            let c = rhist[r.saturating_sub(1)] as f64 * 0.5
                + rhist[r] as f64
                + rhist[(r + 1).min(nbins - 1)] as f64 * 0.5;
            // Normalise by circumference so small/large radii compete fairly.
            let norm = c / (r as f64).max(1.0);
            if norm > best_c {
                best_c = norm;
                best_r = r;
            }
        }
        if best_r == 0 || best_c < 0.02 {
            continue;
        }
        circles.push(Circle {
            cx: cxf,
            cy: cyf,
            r: best_r as f64,
            score,
        });
    }
    ser(&circles)
}

/* ----------------------------------------------------------------------- *
 *  Line profile (with thickness roll-up)                                   *
 * ----------------------------------------------------------------------- */

/// Intensity profile along the segment (x0,y0)->(x1,y1).
///
/// `thickness` ≥ 1 averages over that many parallel scan lines centred on the
/// segment (ImageJ "line width") — the perpendicular roll-up. `n` samples; if
/// `n==0`, uses round(length)+1 samples (≈1 px spacing).
#[wasm_bindgen]
pub fn line_profile(
    gray: &[f32],
    w: usize,
    h: usize,
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    thickness: usize,
    n: usize,
) -> Vec<f32> {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-9 {
        return vec![sample(gray, w, h, x0, y0) as f32];
    }
    let np = if n == 0 { len.round() as usize + 1 } else { n }.max(2);
    let ux = dx / len;
    let uy = dy / len;
    // Perpendicular unit vector.
    let px = -uy;
    let py = ux;
    let t = thickness.max(1);
    let half = (t as f64 - 1.0) / 2.0;
    let mut out = vec![0.0f32; np];
    for i in 0..np {
        let tt = i as f64 / (np - 1) as f64;
        let sx = x0 + dx * tt;
        let sy = y0 + dy * tt;
        let mut acc = 0.0;
        for k in 0..t {
            let off = k as f64 - half;
            acc += sample(gray, w, h, sx + px * off, sy + py * off);
        }
        out[i] = (acc / t as f64) as f32;
    }
    out
}

/* ----------------------------------------------------------------------- *
 *  Monte-Carlo radial sampling across the sphere population                *
 * ----------------------------------------------------------------------- */
#[derive(Serialize)]
struct McResult {
    n_curves: usize,
    n_bins: usize,
    /// Normalised radius bins, 0 (center) .. 1 (surface).
    bins: Vec<f32>,
    /// Mean radial curve across all sampled curves.
    mean: Vec<f32>,
    /// Std dev per bin.
    std: Vec<f32>,
    /// Flattened row-major matrix [n_curves * n_bins] of raw radial curves.
    curves: Vec<f32>,
    /// Which detected circle each curve came from.
    circle_idx: Vec<u32>,
}

/// For every detected circle, cast `angles` random diameters through its
/// center and read the radial intensity from center (ρ=0) to surface (ρ=1).
/// Each diameter is folded across the center (two halves averaged). Produces a
/// big dataset of normalised radial brightness curves — exactly what you feed
/// the diffusion fit.
#[wasm_bindgen]
pub fn monte_carlo_radial(
    gray: &[f32],
    w: usize,
    h: usize,
    cx: &[f64],
    cy: &[f64],
    rr: &[f64],
    angles: usize,
    thickness: usize,
    n_bins: usize,
    seed: u64,
) -> JsValue {
    let nb = n_bins.max(4);
    let na = angles.max(1);
    let mut rng = Rng::new(seed);
    let t = thickness.max(1);
    let half = (t as f64 - 1.0) / 2.0;

    let mut curves: Vec<f32> = Vec::new();
    let mut circle_idx: Vec<u32> = Vec::new();

    for ci in 0..cx.len() {
        let (ox, oy, rad) = (cx[ci], cy[ci], rr[ci]);
        if rad < 2.0 {
            continue;
        }
        for _ in 0..na {
            let theta = rng.unit() * std::f64::consts::PI; // diameter is symmetric over [0,π)
            let dirx = theta.cos();
            let diry = theta.sin();
            // perpendicular for thickness roll-up
            let px = -diry;
            let py = dirx;
            let mut curve = vec![0.0f32; nb];
            for b in 0..nb {
                let rho = b as f64 / (nb - 1) as f64;
                let radial = rho * rad;
                // average the two halves (+dir and -dir) and the thickness band
                let mut acc = 0.0;
                let mut cnt = 0.0;
                for sgn in [1.0_f64, -1.0] {
                    let bx = ox + sgn * dirx * radial;
                    let by = oy + sgn * diry * radial;
                    for k in 0..t {
                        let off = k as f64 - half;
                        acc += sample(gray, w, h, bx + px * off, by + py * off);
                        cnt += 1.0;
                    }
                }
                curve[b] = (acc / cnt) as f32;
            }
            curves.extend_from_slice(&curve);
            circle_idx.push(ci as u32);
        }
    }

    let n_curves = circle_idx.len();
    let mut mean = vec![0.0f32; nb];
    let mut std = vec![0.0f32; nb];
    if n_curves > 0 {
        for b in 0..nb {
            let mut s = 0.0;
            for c in 0..n_curves {
                s += curves[c * nb + b] as f64;
            }
            let m = s / n_curves as f64;
            mean[b] = m as f32;
            let mut v = 0.0;
            for c in 0..n_curves {
                let d = curves[c * nb + b] as f64 - m;
                v += d * d;
            }
            std[b] = (v / n_curves as f64).sqrt() as f32;
        }
    }
    let bins: Vec<f32> = (0..nb).map(|b| b as f32 / (nb - 1) as f32).collect();

    ser(&McResult {
        n_curves,
        n_bins: nb,
        bins,
        mean,
        std,
        curves,
        circle_idx,
    })
}

/* ----------------------------------------------------------------------- *
 *  Curve fitting                                                           *
 * ----------------------------------------------------------------------- */

/// 2-parameter linear least squares for  y = a*1 + b*f.
/// Returns (a, b).
fn linfit2(f: &[f64], y: &[f64]) -> (f64, f64) {
    let n = f.len() as f64;
    let mut sf = 0.0;
    let mut sff = 0.0;
    let mut sy = 0.0;
    let mut sfy = 0.0;
    for i in 0..f.len() {
        sf += f[i];
        sff += f[i] * f[i];
        sy += y[i];
        sfy += f[i] * y[i];
    }
    let det = n * sff - sf * sf;
    if det.abs() < 1e-12 {
        return (sy / n.max(1.0), 0.0);
    }
    let a = (sff * sy - sf * sfy) / det;
    let b = (n * sfy - sf * sy) / det;
    (a, b)
}

fn r_squared(y: &[f64], pred: &[f64]) -> f64 {
    let n = y.len() as f64;
    let mean = y.iter().sum::<f64>() / n;
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for i in 0..y.len() {
        ss_res += (y[i] - pred[i]).powi(2);
        ss_tot += (y[i] - mean).powi(2);
    }
    if ss_tot < 1e-12 {
        1.0
    } else {
        1.0 - ss_res / ss_tot
    }
}

/// Golden-section search minimising `f` on [a,b].
fn golden<F: Fn(f64) -> f64>(mut a: f64, mut b: f64, f: F, iters: usize) -> f64 {
    let gr = (5.0_f64.sqrt() - 1.0) / 2.0;
    let mut c = b - gr * (b - a);
    let mut d = a + gr * (b - a);
    let mut fc = f(c);
    let mut fd = f(d);
    for _ in 0..iters {
        if fc < fd {
            b = d;
            d = c;
            fd = fc;
            c = b - gr * (b - a);
            fc = f(c);
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + gr * (b - a);
            fd = f(d);
        }
    }
    (a + b) / 2.0
}

#[derive(Serialize)]
struct FitResult {
    model: String,
    /// Named parameters.
    params: Vec<(String, f64)>,
    r2: f64,
    /// Fitted curve evaluated at the input radii.
    fit: Vec<f32>,
    /// Human-readable notes (physics interpretation).
    notes: Vec<String>,
}

/// Semi-empirical "surface penetration" model:
///   I(ρ) = bg + A · exp( -(1-ρ)/λ )
/// where ρ = r/R (0 center, 1 surface) and λ is the dimensionless penetration
/// depth (fraction of the radius). Signal is concentrated at the surface and
/// decays inward — the simplest description of your confocal rings.
#[wasm_bindgen]
pub fn fit_exp_penetration(rho: &[f32], intensity: &[f32]) -> JsValue {
    let r: Vec<f64> = rho.iter().map(|&v| v as f64).collect();
    let y: Vec<f64> = intensity.iter().map(|&v| v as f64).collect();
    if r.len() < 3 {
        return JsValue::NULL;
    }
    let sse = |lambda: f64| -> f64 {
        let f: Vec<f64> = r.iter().map(|&rr| (-(1.0 - rr) / lambda).exp()).collect();
        let (a, b) = linfit2(&f, &y);
        f.iter()
            .zip(&y)
            .map(|(fi, yi)| (a + b * fi - yi).powi(2))
            .sum()
    };
    let lambda = golden(0.01, 3.0, sse, 80);
    let f: Vec<f64> = r.iter().map(|&rr| (-(1.0 - rr) / lambda).exp()).collect();
    let (bg, amp) = linfit2(&f, &y);
    let pred: Vec<f64> = f.iter().map(|fi| bg + amp * fi).collect();
    let r2 = r_squared(&y, &pred);
    let fit: Vec<f32> = pred.iter().map(|&v| v as f32).collect();

    let notes = vec![
        format!(
            "Penetration depth λ = {:.3} · R (signal drops to 1/e of its surface value {:.1}% of the radius inward).",
            lambda,
            lambda * 100.0
        ),
        "Diffusive interpretation: a near-exponential surface profile is the short-time / large-Thiele limit of Fickian uptake, λ ≈ √(D·t)/R.".to_string(),
    ];
    ser(&FitResult {
        model: "exp_penetration".into(),
        params: vec![
            ("bg".into(), bg),
            ("A".into(), amp),
            ("lambda_over_R".into(), lambda),
        ],
        r2,
        fit,
        notes,
    })
}

/// Concentration profile for Fickian diffusion INTO a sphere held at fixed
/// surface concentration (Crank, *Mathematics of Diffusion*, eq. 6.18):
///
///   φ(ρ,τ) = 1 + (2/(π·ρ)) Σ_{n=1}^∞ ((-1)^n / n) sin(nπρ) e^{-n²π²τ}
///
/// with ρ = r/R and τ = D·t/R². We fit I(ρ) = bg + A·φ(ρ,τ) — nonlinear in the
/// single dimensionless group τ, linear in (bg, A).
#[wasm_bindgen]
pub fn fit_sphere_diffusion(rho: &[f32], intensity: &[f32], n_terms: usize) -> JsValue {
    let r: Vec<f64> = rho.iter().map(|&v| (v as f64).clamp(1e-4, 1.0)).collect();
    let y: Vec<f64> = intensity.iter().map(|&v| v as f64).collect();
    if r.len() < 3 {
        return JsValue::NULL;
    }
    let nt = n_terms.max(20);
    let phi = |rr: f64, tau: f64| -> f64 {
        let mut s = 0.0;
        for n in 1..=nt {
            let nf = n as f64;
            let sign = if n % 2 == 0 { 1.0 } else { -1.0 };
            s += sign / nf * (nf * std::f64::consts::PI * rr).sin()
                * (-nf * nf * std::f64::consts::PI * std::f64::consts::PI * tau).exp();
        }
        1.0 + (2.0 / (std::f64::consts::PI * rr)) * s
    };
    let sse = |tau: f64| -> f64 {
        let f: Vec<f64> = r.iter().map(|&rr| phi(rr, tau)).collect();
        let (a, b) = linfit2(&f, &y);
        f.iter()
            .zip(&y)
            .map(|(fi, yi)| (a + b * fi - yi).powi(2))
            .sum()
    };
    // τ ranges from "just started" (1e-4) to "nearly uniform" (~0.4).
    let tau = golden(1e-4, 0.5, sse, 100);
    let f: Vec<f64> = r.iter().map(|&rr| phi(rr, tau)).collect();
    let (bg, amp) = linfit2(&f, &y);
    let pred: Vec<f64> = f.iter().map(|fi| bg + amp * fi).collect();
    let r2 = r_squared(&y, &pred);
    let fit: Vec<f32> = pred.iter().map(|&v| v as f32).collect();

    // Fractional uptake Mt/M∞ = 1 - (6/π²) Σ (1/n²) e^{-n²π²τ}
    let mut uptake = 0.0;
    for n in 1..=nt {
        let nf = n as f64;
        uptake += 1.0 / (nf * nf)
            * (-nf * nf * std::f64::consts::PI * std::f64::consts::PI * tau).exp();
    }
    let mt_minf = 1.0 - 6.0 / (std::f64::consts::PI * std::f64::consts::PI) * uptake;

    let notes = vec![
        format!("Dimensionless time τ = D·t/R² = {:.4}.", tau),
        format!("Sphere is {:.1}% saturated (Mt/M∞).", mt_minf * 100.0),
        "Power law: Fickian uptake into a sphere goes as Mt/M∞ ∝ t^½ at early time; the full series gives Mt/M∞ = 1 − (6/π²)Σ(1/n²)e^(−n²π²τ).".to_string(),
        "Korsmeyer–Peppas Mt/M∞ = k·tⁿ: pure-Fickian spherical release has exponent n ≈ 0.43 (slab 0.5, cylinder 0.45).".to_string(),
        "Plug your real R (µm) and t (s) into D = τ·R²/t to recover the diffusion coefficient.".to_string(),
    ];
    ser(&FitResult {
        model: "fickian_sphere".into(),
        params: vec![
            ("bg".into(), bg),
            ("A".into(), amp),
            ("tau".into(), tau),
            ("Mt_over_Minf".into(), mt_minf),
        ],
        r2,
        fit,
        notes,
    })
}

/// Korsmeyer–Peppas power-law fit Mt/M∞ = k·tⁿ (log-log linear).
/// Handy if the user has a time series of uptake rather than a profile.
#[wasm_bindgen]
pub fn fit_power_law(t: &[f32], mt: &[f32]) -> JsValue {
    let mut lx = Vec::new();
    let mut ly = Vec::new();
    for i in 0..t.len() {
        if t[i] > 0.0 && mt[i] > 0.0 {
            lx.push((t[i] as f64).ln());
            ly.push((mt[i] as f64).ln());
        }
    }
    if lx.len() < 2 {
        return JsValue::NULL;
    }
    // y = ln k + n ln t  -> linfit2 with f = ln t
    let (lnk, n) = linfit2(&lx, &ly);
    let k = lnk.exp();
    let pred: Vec<f64> = lx.iter().map(|x| lnk + n * x).collect();
    let r2 = r_squared(&ly, &pred);
    let fit: Vec<f32> = lx
        .iter()
        .map(|x| (lnk + n * x).exp() as f32)
        .collect();
    let notes = vec![
        format!("Release exponent n = {:.3} (Fickian sphere ≈ 0.43; anomalous transport 0.43<n<0.85; Case-II ≈ 0.85).", n),
        format!("Rate constant k = {:.4}.", k),
    ];
    ser(&FitResult {
        model: "korsmeyer_peppas".into(),
        params: vec![("k".into(), k), ("n".into(), n)],
        r2,
        fit,
        notes,
    })
}

/* ----------------------------------------------------------------------- *
 *  Synthetic confocal-sphere image (test data / demo)                      *
 * ----------------------------------------------------------------------- */

/// Generate a synthetic equatorial confocal field: `n` spheres with a
/// surface-concentrated fluorescent signal that penetrates inward with decay
/// length `lambda` (fraction of radius). Returns RGBA bytes (grayscale).
#[wasm_bindgen]
pub fn synth_image(
    w: usize,
    h: usize,
    n: usize,
    min_r: f64,
    max_r: f64,
    lambda: f64,
    noise: f64,
    seed: u64,
) -> Vec<u8> {
    let mut rng = Rng::new(seed);
    let mut field = vec![20.0f64; w * h]; // dim background

    struct S {
        x: f64,
        y: f64,
        r: f64,
    }
    let mut spheres: Vec<S> = Vec::new();
    let mut attempts = 0;
    while spheres.len() < n && attempts < n * 40 {
        attempts += 1;
        let r = min_r + rng.unit() * (max_r - min_r);
        let x = r + rng.unit() * (w as f64 - 2.0 * r);
        let y = r + rng.unit() * (h as f64 - 2.0 * r);
        // avoid heavy overlap
        if spheres
            .iter()
            .any(|s| ((s.x - x).powi(2) + (s.y - y).powi(2)).sqrt() < (s.r + r) * 0.85)
        {
            continue;
        }
        spheres.push(S { x, y, r });
    }

    for s in &spheres {
        let r0 = (s.x - s.r - 2.0).floor().max(0.0) as usize;
        let r1 = (s.x + s.r + 2.0).ceil().min(w as f64) as usize;
        let c0 = (s.y - s.r - 2.0).floor().max(0.0) as usize;
        let c1 = (s.y + s.r + 2.0).ceil().min(h as f64) as usize;
        let lam = (lambda * s.r).max(1.0);
        for y in c0..c1 {
            for x in r0..r1 {
                let d = ((x as f64 - s.x).powi(2) + (y as f64 - s.y).powi(2)).sqrt();
                if d <= s.r {
                    // distance from surface, inward
                    let depth = s.r - d;
                    // surface-bright, exponentially decaying inward + a small core
                    let v = 210.0 * (-depth / lam).exp() + 15.0;
                    field[y * w + x] += v;
                }
            }
        }
    }

    let mut out = vec![0u8; w * h * 4];
    for i in 0..w * h {
        let mut v = field[i];
        if noise > 0.0 {
            v += rng.normal() * noise + v.sqrt() * rng.normal() * (noise * 0.05);
        }
        let b = v.clamp(0.0, 255.0) as u8;
        out[i * 4] = b;
        out[i * 4 + 1] = b;
        out[i * 4 + 2] = b;
        out[i * 4 + 3] = 255;
    }
    out
}

/// Version string — also a cheap "is the wasm wired up?" health check.
#[wasm_bindgen]
pub fn version() -> String {
    format!("imagej-wasm {}", env!("CARGO_PKG_VERSION"))
}
