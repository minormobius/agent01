#![no_std]
// The rack (Morphyx, 2026-10-13): a voice pool that renders audio a block at a time,
// inside an AudioWorklet, so the track is assembled while it plays.
//
// THE SOCKET. An instrument is one arm of `tick()` below and one name in NAMES.
// It gets the voice's state (freq, age in samples, held or released, two phases,
// a small delay line) and returns one sample. It may not allocate, may not block, and
// must finish its sample in a fixed number of steps. That rule, not the language,
// is what lets dozens of them share one 128-sample block.
static mut SR: f32 = 48000.0;
const MAXV: usize = 192;
const DL: usize = 2048;              // per-voice delay line (pluck), lowest pitch SR/DL
const TBL: usize = 4096;
static mut SINE: [f32; TBL] = [0.0; TBL];
static mut OUT: [f32; 1024] = [0.0; 1024];
static mut V: [Voice; MAXV] = [Voice::Z; MAXV];
static mut LINES: [[f32; DL]; MAXV] = [[0.0; DL]; MAXV];
static mut RNG: u32 = 0x2545F491;

#[no_mangle] pub static NAMES: [u8; 34] = *b"organ,pluck,bell,reed,kick,strings";

#[derive(Clone, Copy)]
struct Voice { on: bool, kind: u8, f: f32, g: f32, wait: u32, age: u32, len: u32,
    p1: f32, p2: f32, env: f32, lp: f32, n: usize, i: usize, k: f32 }
impl Voice { const Z: Voice = Voice { on: false, kind: 0, f: 0.0, g: 0.0, wait: 0, age: 0, len: 0,
    p1: 0.0, p2: 0.0, env: 0.0, lp: 0.0, n: 0, i: 0, k: 0.0 }; }

fn rnd() -> f32 { unsafe { RNG ^= RNG << 13; RNG ^= RNG >> 17; RNG ^= RNG << 5; (RNG >> 8) as f32 / 8388608.0 - 1.0 } }
fn sin_t(x: f32) -> f32 { // x in cycles
    let p = (x - fl(x)) * TBL as f32; let i = p as usize; let fr = p - i as f32;
    unsafe { let a = SINE[i & (TBL - 1)]; let b = SINE[(i + 1) & (TBL - 1)]; a + (b - a) * fr }
}
fn fl(x: f32) -> f32 { let t = x as i32 as f32; if t > x { t - 1.0 } else { t } }
fn taylor_sin(x: f32) -> f32 { let x2 = x * x; let mut t = x; let mut s = x; let mut k = 1.0;
    for _ in 0..9 { t = -t * x2 / ((k + 1.0) * (k + 2.0)); s += t; k += 2.0; } s }
fn exp(x: f32) -> f32 { // e^x by halving and squaring
    let mut y = x; let mut n = 0; while y > 0.0625 || y < -0.0625 { y *= 0.5; n += 1; }
    let mut e = 1.0 + y * (1.0 + y * (0.5 + y * (1.0 / 6.0 + y / 24.0))); for _ in 0..n { e *= e; } e }
fn decay(sec: f32) -> f32 { unsafe { exp(-6.9078 / (sec * SR)) } } // -60 dB over `sec`

#[no_mangle] pub extern "C" fn init(sr: f32) {
    unsafe { SR = sr; for i in 0..TBL { let x = i as f32 / TBL as f32 * 6.2831853 - 3.14159265; SINE[(i + TBL / 2) & (TBL - 1)] = taylor_sin(x); }
        for v in V.iter_mut() { v.on = false; } }
}
#[no_mangle] pub extern "C" fn out() -> *const f32 { unsafe { core::ptr::addr_of!(OUT) as *const f32 } }
#[no_mangle] pub extern "C" fn active() -> u32 { unsafe { V.iter().filter(|v| v.on).count() as u32 } }

/// Start a note `wait` samples into the next block: kind, Hz, gain, held for `len` samples.
/// Returns the voice used, or -1 if the pool is full (the note is dropped, never queued late).
#[no_mangle] pub extern "C" fn note(kind: u32, f: f32, g: f32, wait: u32, len: u32) -> i32 {
    unsafe {
        let mut slot = MAXV;
        for (i, v) in V.iter().enumerate() { if !v.on { slot = i; break; } }
        if slot == MAXV { return -1; }
        let v = &mut V[slot];
        *v = Voice { on: true, kind: kind as u8, f, g, wait, age: 0, len, ..Voice::Z };
        match kind {
            1 => { let n = (SR / f) as usize; v.n = if n < 2 { 2 } else if n >= DL { DL - 1 } else { n };
                   for j in 0..v.n { LINES[slot][j] = rnd(); } v.k = 0.996; }
            2 => { v.k = decay(2.5); v.env = 1.0; }
            4 => { v.k = decay(0.35); v.env = 1.0; v.lp = 2.0; v.p2 = exp(-30.0 / SR); }
            _ => { v.k = decay(0.25); }
        }
        slot as i32
    }
}

fn tick(v: &mut Voice, line: &mut [f32; DL], sr: f32) -> f32 {
    let held = v.age < v.len; let t = v.age as f32 / sr; let dt = v.f / sr;
    let s = match v.kind {
        0 => { // organ: three partials, 5 ms attack, 0.25 s release
            let a = if held { if t < 0.005 { t / 0.005 } else { 1.0 } } else { v.env * v.k };
            if held { v.env = a; } else { v.env = a; }
            v.p1 += dt; if v.p1 >= 1.0 { v.p1 -= 1.0; }
            a * (sin_t(v.p1) + 0.5 * sin_t(2.0 * v.p1) + 0.25 * sin_t(3.0 * v.p1)) * 0.5 }
        1 => { // pluck: Karplus-Strong; release damps it faster
            let j = v.i; let nx = if j + 1 >= v.n { 0 } else { j + 1 };
            let y = line[j]; line[j] = (y + line[nx]) * 0.5 * if held { v.k } else { 0.95 }; v.i = nx; y * 0.8 }
        2 => { // bell: FM, ratio 1.4, index falls with the envelope
            v.env *= v.k; v.p2 += dt * 1.4; if v.p2 >= 1.0 { v.p2 -= 1.0; }
            v.p1 += dt; if v.p1 >= 1.0 { v.p1 -= 1.0; }
            v.env * sin_t(v.p1 + 0.6 * v.env * sin_t(v.p2)) * 0.6 }
        3 => { // reed: PolyBLEP square through a one-pole low-pass
            v.p1 += dt; if v.p1 >= 1.0 { v.p1 -= 1.0; }
            let mut sq = if v.p1 < 0.5 { 1.0 } else { -1.0 };
            let blep = |p: f32| if p < dt { let x = p / dt; x + x - x * x - 1.0 } else if p > 1.0 - dt { let x = (p - 1.0) / dt; x * x + x + x + 1.0 } else { 0.0 };
            sq += blep(v.p1); let p2 = v.p1 + 0.5; sq -= blep(if p2 >= 1.0 { p2 - 1.0 } else { p2 });
            let a = if held { if t < 0.02 { t / 0.02 } else { 1.0 } } else { v.env * v.k }; v.env = a;
            v.lp += (sq - v.lp) * 0.18; a * v.lp * 0.35 }
        4 => { // kick: a sine falling from 3x to 1x its pitch, plus a click of noise
            v.env *= v.k; let fr = v.f * (1.0 + v.lp); v.lp *= v.p2; if v.lp < 1e-6 { v.lp = 0.0; }
            v.p1 += fr / sr; if v.p1 >= 1.0 { v.p1 -= 1.0; }
            v.env * (sin_t(v.p1) + if t < 0.003 { 0.4 * rnd() } else { 0.0 }) }
        _ => { // strings: two detuned saws (naive), slow attack
            v.p1 += dt * 1.003; if v.p1 >= 1.0 { v.p1 -= 1.0; }
            v.p2 += dt * 0.997; if v.p2 >= 1.0 { v.p2 -= 1.0; }
            let a = if held { if t < 0.12 { t / 0.12 } else { 1.0 } } else { v.env * v.k }; v.env = a;
            let raw = (v.p1 - 0.5) + (v.p2 - 0.5); v.lp += (raw - v.lp) * 0.08; a * v.lp * 0.7 }
    };
    v.age += 1;
    let perc = v.kind == 2 || v.kind == 4; // percussive: done when it has died away, held or not
    if perc && v.env < 0.0005 { v.on = false; }
    if !held && (v.age > v.len + (sr * 4.0) as u32 || (v.kind != 1 && v.env < 0.0005 && v.age > v.len + 16)) { v.on = false; }
    if v.kind == 1 && !held && v.age > v.len + (sr * 0.3) as u32 { v.on = false; }
    s * v.g
}

/// Mix every sounding voice into OUT[0..n] (n <= 1024). Returns the voices that sounded.
#[no_mangle] pub extern "C" fn render(n: u32) -> u32 {
    unsafe {
        let n = if n > 1024 { 1024 } else { n as usize }; let sr = SR;
        for x in OUT[..n].iter_mut() { *x = 0.0; }
        let mut c = 0;
        for k in 0..MAXV {
            if !V[k].on { continue; } c += 1;
            let v = &mut V[k]; let line = &mut LINES[k];
            let mut i = 0; if v.wait > 0 { let w = if (v.wait as usize) < n { v.wait as usize } else { n }; v.wait -= w as u32; i = w; }
            let mut lv = *v; let o = &mut OUT; while i < n && lv.on { o[i] += tick(&mut lv, line, sr); i += 1; } *v = lv;
        }
        for x in OUT[..n].iter_mut() { *x = if *x > 1.0 { 1.0 } else if *x < -1.0 { -1.0 } else { *x }; }
        c
    }
}
#[panic_handler] fn panic(_: &core::panic::PanicInfo) -> ! { loop {} }
