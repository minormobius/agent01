//! Drawing z(t) = Σ_k exp(i q_k t) / q_k^α.
//!
//! Each term is a circle: radius q_k^-α, going round q_k times while t runs
//! 0 → 2π. Stack them tip to tail and the pen traces the picture. That is the
//! whole idea; everything here is about doing it fast enough to feel live.
//!
//! The sampler advances every term by one complex multiplication per step
//! rather than calling sin/cos per term per sample — a rotation by a fixed
//! δ_k = exp(i q_k Δt). Rounding creeps into the modulus over a long run, so
//! every `REANCHOR` steps we throw the accumulated state away and recompute the
//! angles outright. The correction is invisible and costs one trig call per
//! term per 4096 samples.

use core::f64::consts::PI;

const REANCHOR: usize = 4096;

/// Amplitudes q_k^-α for the frequencies given.
pub fn amplitudes(qs: &[f64], alpha: f64) -> Vec<f64> {
    qs.iter().map(|&q| if q <= 0.0 { 0.0 } else { q.powf(-alpha) }).collect()
}

/// How many samples it takes to draw this curve without lying about it.
///
/// The fastest wiggle in the picture has period 2π/q_max, so the sample count
/// has to scale with the highest frequency present — not with the pixel count.
/// Undersample and the curve doesn't get coarse, it gets *wrong*: it aliases
/// into a plausible, entirely fictitious shape.
pub fn samples_for(q_max: f64, per_cycle: f64, floor: usize, ceiling: usize) -> usize {
    let n = (q_max * per_cycle).ceil() as i64;
    (n.max(floor as i64) as usize).min(ceiling)
}

/// Sample the curve over t ∈ [t0, t1) into an interleaved xy buffer.
pub fn sample(qs: &[f64], amps: &[f64], t0: f64, t1: f64, n: usize, out: &mut Vec<f32>) {
    out.clear();
    out.reserve(2 * n);
    if n == 0 || qs.is_empty() { return; }
    let dt = (t1 - t0) / n as f64;
    let k = qs.len();

    // per-term rotation state and the step that advances it
    let mut re = vec![0.0f64; k];
    let mut im = vec![0.0f64; k];
    let mut dre = vec![0.0f64; k];
    let mut dim = vec![0.0f64; k];
    for j in 0..k {
        let d = qs[j] * dt;
        dre[j] = d.cos();
        dim[j] = d.sin();
    }

    for i in 0..n {
        if i % REANCHOR == 0 {
            let t = t0 + i as f64 * dt;
            for j in 0..k {
                let a = qs[j] * t;
                re[j] = amps[j] * a.cos();
                im[j] = amps[j] * a.sin();
            }
        }
        let (mut sx, mut sy) = (0.0f64, 0.0f64);
        for j in 0..k {
            sx += re[j];
            sy += im[j];
            let nr = re[j] * dre[j] - im[j] * dim[j];
            let ni = re[j] * dim[j] + im[j] * dre[j];
            re[j] = nr;
            im[j] = ni;
        }
        out.push(sx as f32);
        out.push(sy as f32);
    }
}

/// The epicycle chain at one instant: the running partial sums 0, z_1, z_1+z_2,
/// …, z(t). `out` gets k+1 points, so the last one is the pen.
pub fn chain(qs: &[f64], amps: &[f64], t: f64, out: &mut Vec<f32>) {
    out.clear();
    out.reserve(2 * (qs.len() + 1));
    let (mut x, mut y) = (0.0f64, 0.0f64);
    out.push(0.0);
    out.push(0.0);
    for j in 0..qs.len() {
        let a = qs[j] * t;
        x += amps[j] * a.cos();
        y += amps[j] * a.sin();
        out.push(x as f32);
        out.push(y as f32);
    }
}

/// [min_x, min_y, max_x, max_y] of an interleaved xy buffer.
pub fn bbox(xy: &[f32]) -> [f32; 4] {
    let mut b = [f32::INFINITY, f32::INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY];
    for p in xy.chunks_exact(2) {
        b[0] = b[0].min(p[0]);
        b[1] = b[1].min(p[1]);
        b[2] = b[2].max(p[0]);
        b[3] = b[3].max(p[1]);
    }
    if !b[0].is_finite() { b = [-1.0, -1.0, 1.0, 1.0]; }
    b
}

/// Total arc length, in the curve's own units. A number's roughness reads
/// directly off this: the pen travels further for φ than for e.
///
/// `closed` adds the segment from the last sample back to the first. Samples
/// cover [t0, t1) — the endpoint is deliberately left out so a full turn does
/// not draw its first point twice — so over a whole number of turns that last
/// segment is real and omitting it loses one sample's worth of length.
pub fn arc_length(xy: &[f32], closed: bool) -> f64 {
    let pts: Vec<&[f32]> = xy.chunks_exact(2).collect();
    let mut s = 0.0f64;
    for w in pts.windows(2) {
        let dx = (w[1][0] - w[0][0]) as f64;
        let dy = (w[1][1] - w[0][1]) as f64;
        s += (dx * dx + dy * dy).sqrt();
    }
    if closed && pts.len() > 1 {
        let (a, b) = (pts[pts.len() - 1], pts[0]);
        let (dx, dy) = ((b[0] - a[0]) as f64, (b[1] - a[1]) as f64);
        s += (dx * dx + dy * dy).sqrt();
    }
    s
}

pub fn tau() -> f64 { 2.0 * PI }

// ------------------------------------------------------------- accumulation --

/// An additive plane: every curve drawn onto it adds one to each pixel it
/// crosses, and nothing ever subtracts. Thousands of curves overlaid this way
/// is the "plot 8000 numbers on top of each other" picture, and the bright
/// parts are exactly the places many different numbers agree to visit.
pub struct Plane {
    pub w: usize,
    pub h: usize,
    pub cx: f64,
    pub cy: f64,
    pub scale: f64,
    pub buf: Vec<u32>,
    pub max: u32,
    pub curves: u32,
}

impl Plane {
    pub fn new(w: usize, h: usize, cx: f64, cy: f64, scale: f64) -> Self {
        Plane { w, h, cx, cy, scale, buf: vec![0; w * h], max: 0, curves: 0 }
    }

    #[inline]
    fn to_px(&self, x: f64, y: f64) -> (f64, f64) {
        (
            (x - self.cx) * self.scale + self.w as f64 * 0.5,
            // screen y grows downward; the complex plane's does not
            self.h as f64 * 0.5 - (y - self.cy) * self.scale,
        )
    }

    #[inline]
    fn hit(&mut self, x: i64, y: i64) {
        if x < 0 || y < 0 || x >= self.w as i64 || y >= self.h as i64 { return; }
        let i = y as usize * self.w + x as usize;
        let v = self.buf[i] + 1;
        self.buf[i] = v;
        if v > self.max { self.max = v; }
    }

    /// Bresenham, additively, from the pixel *after* (x0, y0) through (x1, y1).
    /// Segments rather than points: at low frequencies a curve's samples are
    /// pixels apart and a point plot would come out dotted. The start pixel is
    /// excluded because the caller has already counted it — otherwise every
    /// interior sample would be counted twice.
    fn segment(&mut self, mut x0: i64, mut y0: i64, x1: i64, y1: i64) {
        let dx = (x1 - x0).abs();
        let sx = if x0 < x1 { 1 } else { -1 };
        let dy = -(y1 - y0).abs();
        let sy = if y0 < y1 { 1 } else { -1 };
        // a wild jump means the curve left the frame between samples; the
        // clipping in `hit` is cheap, an unbounded walk is not
        if dx > 8192 || -dy > 8192 { self.hit(x1, y1); return; }
        let mut err = dx + dy;
        loop {
            if x0 == x1 && y0 == y1 { break; }
            let e2 = 2 * err;
            if e2 >= dy { err += dy; x0 += sx; }
            if e2 <= dx { err += dx; y0 += sy; }
            self.hit(x0, y0);
        }
    }

    /// One curve onto the plane.
    ///
    /// Samples that round to the pixel already occupied are skipped rather than
    /// re-counted. Without that, brightness would measure how densely we
    /// sampled — a slow stretch of curve piling up forty hits on one pixel —
    /// and would change every time the sample count did. Skipping makes a pixel
    /// value mean what the picture claims it means: how many of the numbers
    /// drawn go through here.
    pub fn draw(&mut self, xy: &[f32]) {
        if xy.len() < 4 { return; }
        let first = self.to_px(xy[0] as f64, xy[1] as f64);
        let (fx, fy) = (first.0.round() as i64, first.1.round() as i64);
        let (mut px, mut py) = (fx, fy);
        let mut moved = false;
        for p in xy.chunks_exact(2).skip(1) {
            let q = self.to_px(p[0] as f64, p[1] as f64);
            let (qx, qy) = (q.0.round() as i64, q.1.round() as i64);
            if qx == px && qy == py { continue; }
            self.segment(px, py, qx, qy);
            px = qx;
            py = qy;
            moved = true;
        }
        // z is 2π-periodic, so the last sample joins the first. Closing the
        // loop here rather than opening it above is what gives the starting
        // pixel exactly one count like every other pixel.
        if moved { self.segment(px, py, fx, fy); } else { self.hit(fx, fy); }
        self.curves += 1;
    }

    pub fn clear(&mut self) {
        self.buf.iter_mut().for_each(|v| *v = 0);
        self.max = 0;
        self.curves = 0;
    }
}
