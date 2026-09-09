//! cffourier — the engine behind henderhead.mino.mobi/cf/.
//!
//! Draws z(t) = Σ_k exp(i q_k t) / q_k^α, where q_k are the denominators of the
//! continued-fraction convergents of a number x. After Matt Henderson's post of
//! 2026-09-09; the maths is his, this implementation is not.
//!
//! ## The ABI
//!
//! No wasm-bindgen, no wasm-pack, no npm: a plain `cdylib` for
//! wasm32-unknown-unknown with a C ABI, and forty lines of JS that read the
//! results straight out of linear memory. The whole build is
//! `cargo build --release --target wasm32-unknown-unknown`, which is also why
//! the .wasm can sit in the repo and the site needs no build step to serve.
//!
//! Results are left in engine-owned buffers and handed back as pointer + length
//! — the caller reads them before the next call, which is what every entry
//! point here is documented to invalidate.

mod cf;
mod curve;

use cf::Expansion;
use curve::Plane;

// ------------------------------------------------------------------ memory --

/// Give the caller a byte buffer inside linear memory (used for the decimal
/// string). Pair every call with `dealloc` at the same length.
#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    if !p.is_null() && n > 0 { drop(Vec::from_raw_parts(p, n, n)); }
}

// ------------------------------------------------------------------- state --

struct State {
    exp: Expansion,
    /// convergent denominators as f64 — every q we keep is under 2^50, so this
    /// is exact, and it saves the JS side an i64 read per term
    qs: Vec<f64>,
    ps: Vec<f64>,
    terms: Vec<f64>,
    xy: Vec<f32>,
    chain: Vec<f32>,
    bbox: [f32; 4],
    arc: f64,
    plane: Option<Plane>,
}

static mut ST: Option<State> = None;

fn st() -> &'static mut State {
    unsafe {
        let p = &raw mut ST;
        if (*p).is_none() {
            *p = Some(State {
                exp: cf::cf_rational(0, 1),
                qs: Vec::new(), ps: Vec::new(), terms: Vec::new(),
                xy: Vec::new(), chain: Vec::new(),
                bbox: [-1.0, -1.0, 1.0, 1.0], arc: 0.0, plane: None,
            });
        }
        (*p).as_mut().unwrap()
    }
}

fn adopt(e: Expansion) -> u32 {
    let s = st();
    s.qs = e.qs.iter().map(|&q| q as f64).collect();
    s.ps = e.ps.iter().map(|&p| p as f64).collect();
    s.terms = e.terms.iter().map(|&a| a as f64).collect();
    s.exp = e;
    s.qs.len() as u32
}

// ---------------------------------------------------------- setting the number --

/// The exact rational p/q. Also the sweep: x = i/N is a rational, so the
/// 0→1 slider and the overlay are the exact path, not an approximation.
#[no_mangle]
pub extern "C" fn set_ratio(p: i64, q: i64) -> u32 {
    adopt(cf::cf_rational(p as i128, q as i128))
}

/// The quadratic irrational (a + b√n)/c, exactly, for `want` terms. Its
/// expansion is periodic, so `want` is a request, never a limit.
#[no_mangle]
pub extern "C" fn set_surd(a: i64, b: i64, c: i64, n: i64, want: u32) -> u32 {
    match cf::cf_surd(a as i128, b as i128, c as i128, n as i128, want.max(1) as usize) {
        Some(e) => adopt(e),
        None => 0,
    }
}

/// A decimal literal, read as the exact rational it is. Feed it as many digits
/// as you have: `trusted_q` reports how far up the term list they carry.
#[no_mangle]
pub unsafe extern "C" fn set_decimal(ptr: *const u8, len: usize) -> u32 {
    let bytes = core::slice::from_raw_parts(ptr, len);
    match core::str::from_utf8(bytes).ok().and_then(cf::cf_decimal) {
        Some(e) => adopt(e),
        None => 0,
    }
}

/// The largest q_k whose term is provably the true constant's, for a decimal
/// given to `digits` significant figures.
#[no_mangle]
pub extern "C" fn trusted_q(digits: u32) -> f64 { cf::trusted_q(digits) }

// ------------------------------------------------------- reading the expansion --

#[no_mangle] pub extern "C" fn n_terms() -> u32 { st().qs.len() as u32 }
#[no_mangle] pub extern "C" fn qs_ptr() -> *const f64 { st().qs.as_ptr() }
#[no_mangle] pub extern "C" fn ps_ptr() -> *const f64 { st().ps.as_ptr() }
#[no_mangle] pub extern "C" fn terms_ptr() -> *const f64 { st().terms.as_ptr() }
#[no_mangle] pub extern "C" fn is_exact() -> u32 { st().exp.exact as u32 }
#[no_mangle] pub extern "C" fn is_terminated() -> u32 { st().exp.terminated as u32 }
#[no_mangle] pub extern "C" fn period_start() -> i32 { st().exp.period.map_or(-1, |(a, _)| a as i32) }
#[no_mangle] pub extern "C" fn period_len() -> i32 { st().exp.period.map_or(-1, |(_, l)| l as i32) }

// ------------------------------------------------------------------ drawing --

/// Sample the curve. `k` terms, amplitude q^-alpha, t over [t0, t1), with
/// `per_cycle` samples for every cycle of the fastest term (below about 8 the
/// fine detail aliases into shapes that are not there) and never fewer than
/// `floor` — the caller sets that from how many pixels the curve will cover, so
/// a plain circle comes out round rather than polygonal.
///
/// Returns the number of points; `xy_ptr` then holds that many x,y f32 pairs.
/// Invalidates the previous `xy_ptr`, `bbox_ptr` and `arc_len`.
#[no_mangle]
pub extern "C" fn build(k: u32, alpha: f64, t0: f64, t1: f64, per_cycle: f64, floor: u32, cap: u32) -> u32 {
    let s = st();
    let k = (k as usize).min(s.qs.len());
    let qs = &s.qs[..k];
    let amps = curve::amplitudes(qs, alpha);
    let q_max = qs.iter().cloned().fold(1.0f64, f64::max);
    let turns = (t1 - t0) / curve::tau();
    let span = turns.abs().max(1e-9);
    let cap = cap.max(64) as usize;
    let n = curve::samples_for(q_max * span, per_cycle.max(2.0), (floor as usize).min(cap), cap);
    let mut xy = core::mem::take(&mut s.xy);
    curve::sample(qs, &amps, t0, t1, n, &mut xy);
    s.bbox = curve::bbox(&xy);
    // a whole number of turns is a closed loop and its last segment is real
    s.arc = curve::arc_length(&xy, (span - span.round()).abs() < 1e-9 && span >= 1.0);
    s.xy = xy;
    (s.xy.len() / 2) as u32
}

#[no_mangle] pub extern "C" fn xy_ptr() -> *const f32 { st().xy.as_ptr() }
#[no_mangle] pub extern "C" fn bbox_ptr() -> *const f32 { st().bbox.as_ptr() }
#[no_mangle] pub extern "C" fn arc_len() -> f64 { st().arc }

/// The epicycle chain at time t: k+1 points from the origin to the pen.
#[no_mangle]
pub extern "C" fn chain_at(k: u32, alpha: f64, t: f64) -> u32 {
    let s = st();
    let k = (k as usize).min(s.qs.len());
    let qs = &s.qs[..k];
    let amps = curve::amplitudes(qs, alpha);
    let mut c = core::mem::take(&mut s.chain);
    curve::chain(qs, &amps, t, &mut c);
    s.chain = c;
    (s.chain.len() / 2) as u32
}

#[no_mangle] pub extern "C" fn chain_ptr() -> *const f32 { st().chain.as_ptr() }

// -------------------------------------------------------------- the overlay --

/// Start an additive plane: w×h pixels showing the square region of the complex
/// plane centred on (cx, cy) at `scale` pixels per unit.
#[no_mangle]
pub extern "C" fn plane_init(w: u32, h: u32, cx: f64, cy: f64, scale: f64) {
    let s = st();
    let (w, h) = (w.clamp(1, 4096) as usize, h.clamp(1, 4096) as usize);
    let reuse = matches!(&s.plane, Some(p) if p.w == w && p.h == h);
    if reuse {
        let p = s.plane.as_mut().unwrap();
        p.clear();
        p.cx = cx; p.cy = cy; p.scale = scale;
    } else {
        s.plane = Some(Plane::new(w, h, cx, cy, scale));
    }
}

/// Draw the curves for x = i/count, i ∈ [i0, i1), onto the plane.
///
/// Called in batches so the picture can build on screen the way it builds in
/// the maths — one number at a time, each adding its own filigree. Terms with
/// q above `q_cap` are dropped: they are finer than a pixel and cost the most.
#[no_mangle]
pub extern "C" fn plane_add(i0: u32, i1: u32, count: u32, alpha: f64, q_cap: f64, per_cycle: f64, cap: u32) -> u32 {
    let s = st();
    if s.plane.is_none() || count == 0 { return 0; }
    let mut xy = core::mem::take(&mut s.xy);
    let mut plane = s.plane.take().unwrap();
    for i in i0..i1.min(count) {
        let e = cf::cf_rational(i as i128, count as i128);
        let qs: Vec<f64> = e.qs.iter().map(|&q| q as f64).filter(|&q| q <= q_cap).collect();
        if qs.is_empty() { continue; }
        let amps = curve::amplitudes(&qs, alpha);
        let q_max = qs.iter().cloned().fold(1.0f64, f64::max);
        let cap = cap.max(64) as usize;
        let n = curve::samples_for(q_max, per_cycle.max(2.0), 1024.min(cap), cap);
        curve::sample(&qs, &amps, 0.0, curve::tau(), n, &mut xy);
        plane.draw(&xy);
    }
    s.xy = xy;
    let drawn = plane.curves;
    s.plane = Some(plane);
    drawn
}

#[no_mangle]
pub extern "C" fn plane_ptr() -> *const u32 {
    match &st().plane { Some(p) => p.buf.as_ptr(), None => core::ptr::null() }
}
#[no_mangle] pub extern "C" fn plane_max() -> u32 { st().plane.as_ref().map_or(0, |p| p.max) }
#[no_mangle] pub extern "C" fn plane_curves() -> u32 { st().plane.as_ref().map_or(0, |p| p.curves) }

#[cfg(test)]
mod tests;
