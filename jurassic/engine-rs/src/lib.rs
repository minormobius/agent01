//! jurassic-engine — the Daohugou soundscape kernel.
//!
//! A raw `wasm32-unknown-unknown` module with a small C ABI, driven from an
//! AudioWorklet. No wasm-bindgen, no allocator, nothing on the heap: the scene
//! is a fixed array of voices and the output is a fixed interleaved buffer, so
//! `render` never allocates and never blocks the audio thread.
//!
//! The kernel holds **no data about any species**. Every insect on the map is
//! pushed in at runtime by `add_voice`, from the roster in `js/fauna.js`. That
//! split is deliberate: the palaeontology is a table someone can argue with and
//! revise, and this crate is the physics that turns any such table into sound.
//!
//! What it does own is the chain from a wing to an ear:
//!
//! 1. `synth` — a bandlimited tooth-strike train driving a wing resonator.
//! 2. `air` — ISO 9613 spreading, absorption and foliage scattering.
//! 3. this file — placing the result around a listener who can walk about.
//!
//! Because (2) is frequency-squared, moving the listener is not a volume
//! control: the 5 kHz chorus fades gently across a clearing while the 22 kHz
//! singer vanishes within a few tens of metres. That asymmetry is the whole
//! argument, and it falls out of the physics rather than being drawn on.

pub mod air;
pub mod synth;

#[cfg(test)]
mod tests;

use synth::{Voice, VoiceParams};

/// Room for every described singer in the assemblage several times over.
pub const MAX_VOICES: usize = 64;
/// Largest block `render` will produce. An AudioWorklet quantum is 128.
pub const MAX_FRAMES: usize = 2048;

/// Source level, dB SPL at 1 m, that renders at full scale. Katydid calls run
/// 75–100 dB at 1 m, so this puts a loud singer at unity when you are standing
/// on top of it and everything else below.
pub const REF_DB: f32 = 100.0;

/// Bumped whenever the ABI or the audible output changes.
pub const ENGINE_VERSION: u32 = 1;

pub struct Scene {
    pub voices: [Voice; MAX_VOICES],
    pub n: usize,
    pub sample_rate: f32,

    pub listener_x: f32,
    pub listener_y: f32,
    /// Listener facing, radians, 0 = +y ("north" on the map).
    pub heading: f32,

    pub temp_c: f32,
    pub humidity: f32,
    pub pressure_kpa: f32,
    /// Canopy density, 0 (clearing) to 1 (ISO "dense foliage").
    pub canopy: f32,

    /// Ultrasound detector: divide the rendered frequency of any voice whose
    /// carrier exceeds `detector_threshold_hz` by this factor. Propagation is
    /// unaffected — the air still sees the true frequency.
    pub detector_div: f32,
    pub detector_threshold_hz: f32,

    pub master: f32,

    /// Smoothed per-ear gains, so walking does not produce zipper noise.
    gl: [f32; MAX_VOICES],
    gr: [f32; MAX_VOICES],
    primed: bool,
    peak: f32,
}

impl Scene {
    pub const fn new() -> Self {
        Scene {
            voices: [const { Voice::new() }; MAX_VOICES],
            n: 0,
            sample_rate: 48000.0,
            listener_x: 0.0,
            listener_y: 0.0,
            heading: 0.0,
            temp_c: 24.0,
            humidity: 80.0,
            pressure_kpa: 101.325,
            canopy: 0.6,
            detector_div: 1.0,
            detector_threshold_hz: 14000.0,
            master: 1.0,
            gl: [0.0; MAX_VOICES],
            gr: [0.0; MAX_VOICES],
            primed: false,
            peak: 0.0,
        }
    }

    pub fn clear(&mut self) {
        for v in self.voices.iter_mut() {
            v.clear();
        }
        self.n = 0;
        self.primed = false;
    }

    pub fn add(&mut self, p: VoiceParams) -> i32 {
        if self.n >= MAX_VOICES {
            return -1;
        }
        let i = self.n;
        self.voices[i].set(p);
        self.n += 1;
        i as i32
    }

    /// Straight-line distance from the listener to voice `i`, metres.
    pub fn distance(&self, i: usize) -> f32 {
        let dx = self.voices[i].p.x - self.listener_x;
        let dy = self.voices[i].p.y - self.listener_y;
        (dx * dx + dy * dy).sqrt()
    }

    /// Level of voice `i` as it arrives at the listener, dB SPL — the value a
    /// meter at the listener's position would read while that voice is singing.
    pub fn received_db(&self, i: usize) -> f32 {
        let v = &self.voices[i];
        if !v.active {
            return -200.0;
        }
        let loss = air::transmission_loss_db(
            self.distance(i) as f64,
            v.p.carrier_hz as f64,
            self.temp_c as f64,
            self.humidity as f64,
            self.pressure_kpa as f64,
            self.canopy as f64,
        );
        v.p.spl_db - loss as f32
    }

    /// How far voice `i` carries before it drops to `threshold_db` — the
    /// hearing threshold of whoever is listening, at that voice's frequency.
    /// This is the circle the map draws.
    pub fn audible_radius(&self, i: usize, threshold_db: f32) -> f32 {
        let v = &self.voices[i];
        air::audible_radius_m(
            v.p.spl_db as f64,
            threshold_db as f64,
            v.p.carrier_hz as f64,
            self.temp_c as f64,
            self.humidity as f64,
            self.pressure_kpa as f64,
            self.canopy as f64,
        ) as f32
    }

    /// The frequency to synthesise voice `i` at, after the detector.
    pub fn render_freqs(&self, i: usize) -> (f32, f32) {
        let p = self.voices[i].p;
        if self.detector_div > 1.0 && p.carrier_hz > self.detector_threshold_hz {
            (
                p.carrier_hz / self.detector_div,
                p.tooth_rate_hz / self.detector_div,
            )
        } else {
            (p.carrier_hz, p.tooth_rate_hz)
        }
    }

    /// Target per-ear gains and the far-ear delay for voice `i`.
    fn placement(&self, i: usize) -> (f32, f32, f32, bool) {
        let v = &self.voices[i];
        let db = self.received_db(i);
        let amp = 10f32.powf((db - REF_DB) / 20.0) * v.trim;

        // Bearing to the source relative to where the listener is facing.
        // atan2(0, 0) is 0, which puts a source you are standing on dead ahead
        // — the only sane answer when the geometry has run out.
        let dx = v.p.x - self.listener_x;
        let dy = v.p.y - self.listener_y;
        let bearing = dx.atan2(dy) - self.heading;
        let lateral = bearing.sin().clamp(-1.0, 1.0);

        // Equal-power pan, so a source crossing in front holds its loudness.
        let t = (lateral + 1.0) * (core::f32::consts::PI / 4.0);
        let gl = amp * t.cos();
        let gr = amp * t.sin();
        // The far ear hears it late; delay whichever that is.
        let itd = synth::max_itd_samples(self.sample_rate) * lateral.abs();
        (gl, gr, itd, lateral > 0.0)
    }

    /// Render `frames` interleaved stereo samples into `out`.
    pub fn render(&mut self, out: &mut [f32], frames: usize) {
        let frames = frames.min(MAX_FRAMES).min(out.len() / 2);
        for s in out[..frames * 2].iter_mut() {
            *s = 0.0;
        }
        let sr = self.sample_rate;
        let inv = 1.0 / frames.max(1) as f32;

        for i in 0..self.n {
            if !self.voices[i].active {
                continue;
            }
            let (tgl, tgr, itd, right_is_far) = self.placement(i);
            let (fc, fr) = self.render_freqs(i);
            // First block after a scene change: jump rather than ramp, so a
            // freshly-placed voice does not fade in from nowhere.
            let (mut cl, mut cr) = if self.primed {
                (self.gl[i], self.gr[i])
            } else {
                (tgl, tgr)
            };
            let (dl, dr) = ((tgl - cl) * inv, (tgr - cr) * inv);

            for f in 0..frames {
                let s = self.voices[i].tick(sr, fc, fr);
                let late = self.voices[i].delayed(s, itd);
                let (sl, sr_) = if right_is_far { (s, late) } else { (late, s) };
                out[f * 2] += sl * cl;
                out[f * 2 + 1] += sr_ * cr;
                cl += dl;
                cr += dr;
            }
            self.gl[i] = tgl;
            self.gr[i] = tgr;
        }
        self.primed = true;

        // Master trim and a soft knee. A chorus of sixty is a summing problem;
        // tanh keeps a dense night from clipping without ducking the quiet
        // singers a compressor would chase.
        let mut peak = 0.0f32;
        for s in out[..frames * 2].iter_mut() {
            let v = (*s * self.master).tanh();
            *s = v;
            let a = v.abs();
            if a > peak {
                peak = a;
            }
        }
        self.peak = peak;
    }

    pub fn peak(&self) -> f32 {
        self.peak
    }
}

// ---------------------------------------------------------------- the ABI --
//
// Single-threaded wasm: one static scene, one static output buffer, reached
// through raw pointers so no `&mut` to a `static mut` is ever formed.

static mut SCENE: Scene = Scene::new();
static mut OUT: [f32; MAX_FRAMES * 2] = [0.0; MAX_FRAMES * 2];

#[inline]
fn scene() -> &'static mut Scene {
    unsafe { &mut *core::ptr::addr_of_mut!(SCENE) }
}

#[inline]
fn out_buf() -> &'static mut [f32] {
    unsafe { &mut *core::ptr::addr_of_mut!(OUT) }
}

#[no_mangle]
pub extern "C" fn engine_version() -> u32 {
    ENGINE_VERSION
}

#[no_mangle]
pub extern "C" fn max_voices() -> u32 {
    MAX_VOICES as u32
}

#[no_mangle]
pub extern "C" fn init(sample_rate: f32) {
    let s = scene();
    s.clear();
    s.sample_rate = if sample_rate > 1000.0 {
        sample_rate
    } else {
        48000.0
    };
}

#[no_mangle]
pub extern "C" fn clear_scene() {
    scene().clear();
}

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub extern "C" fn add_voice(
    x: f32,
    y: f32,
    carrier_hz: f32,
    q: f32,
    tooth_rate_hz: f32,
    teeth: u32,
    sweep: f32,
    jitter: f32,
    syllables: u32,
    gap_s: f32,
    chirp_period_s: f32,
    spl_db: f32,
    seed: u32,
) -> i32 {
    scene().add(VoiceParams {
        x,
        y,
        carrier_hz,
        q,
        tooth_rate_hz,
        teeth,
        sweep,
        jitter,
        syllables,
        gap_s,
        chirp_period_s,
        spl_db,
        seed,
    })
}

#[no_mangle]
pub extern "C" fn set_voice_trim(i: u32, trim: f32) {
    let s = scene();
    if (i as usize) < s.n {
        s.voices[i as usize].trim = trim.clamp(0.0, 4.0);
    }
}

#[no_mangle]
pub extern "C" fn set_listener(x: f32, y: f32, heading: f32) {
    let s = scene();
    s.listener_x = x;
    s.listener_y = y;
    s.heading = heading;
}

#[no_mangle]
pub extern "C" fn set_air(temp_c: f32, humidity: f32, pressure_kpa: f32, canopy: f32) {
    let s = scene();
    s.temp_c = temp_c;
    s.humidity = humidity.clamp(1.0, 100.0);
    s.pressure_kpa = if pressure_kpa > 10.0 {
        pressure_kpa
    } else {
        101.325
    };
    s.canopy = canopy.clamp(0.0, 1.0);
}

#[no_mangle]
pub extern "C" fn set_detector(divisor: f32, threshold_hz: f32) {
    let s = scene();
    s.detector_div = divisor.max(1.0);
    s.detector_threshold_hz = threshold_hz.max(0.0);
}

/// Master gain as a linear factor. The UI hands this over from a dB slider,
/// and the range has to be generous: a singer thirty metres off through
/// canopy arrives around 60 dB SPL, which is 0.01 of full scale at the
/// kernel's 100 dB reference, so a usable monitor level is +30 to +40 dB.
#[no_mangle]
pub extern "C" fn set_master(gain: f32) {
    scene().master = gain.clamp(0.0, 4096.0);
}

#[no_mangle]
pub extern "C" fn render(frames: u32) -> *const f32 {
    let s = scene();
    let o = out_buf();
    s.render(o, frames as usize);
    o.as_ptr()
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const f32 {
    out_buf().as_ptr()
}

#[no_mangle]
pub extern "C" fn voice_count() -> u32 {
    scene().n as u32
}

#[no_mangle]
pub extern "C" fn voice_received_db(i: u32) -> f32 {
    let s = scene();
    if (i as usize) < s.n {
        s.received_db(i as usize)
    } else {
        -200.0
    }
}

#[no_mangle]
pub extern "C" fn voice_audible_radius_m(i: u32, threshold_db: f32) -> f32 {
    let s = scene();
    if (i as usize) < s.n {
        s.audible_radius(i as usize, threshold_db)
    } else {
        0.0
    }
}

#[no_mangle]
pub extern "C" fn voice_duty(i: u32) -> f32 {
    let s = scene();
    if (i as usize) < s.n {
        s.voices[i as usize].p.duty()
    } else {
        0.0
    }
}

/// Stroke envelope of voice `i` right now, 0–1, scaled by how loud it arrives
/// at the listener. The map uses this to make a singer visibly sing.
#[no_mangle]
pub extern "C" fn voice_activity(i: u32) -> f32 {
    let s = scene();
    if (i as usize) >= s.n {
        return 0.0;
    }
    let v = &s.voices[i as usize];
    if !v.active {
        return 0.0;
    }
    let db = s.received_db(i as usize);
    // 0 dB SPL at the listener reads as nothing; 90 dB reads as full.
    let loud = ((db) / 90.0).clamp(0.0, 1.0);
    v.gate * loud
}

#[no_mangle]
pub extern "C" fn peak_out() -> f32 {
    scene().peak()
}

/// Exported so the map and the tests measure the air with the same ruler the
/// mixer does, rather than a second implementation that can drift.
#[no_mangle]
pub extern "C" fn absorption_db_per_m(f_hz: f32, temp_c: f32, humidity: f32, pressure_kpa: f32) -> f32 {
    air::absorption_db_per_m(f_hz as f64, temp_c as f64, humidity as f64, pressure_kpa as f64) as f32
}

#[no_mangle]
pub extern "C" fn transmission_loss_db(
    r_m: f32,
    f_hz: f32,
    temp_c: f32,
    humidity: f32,
    pressure_kpa: f32,
    canopy: f32,
) -> f32 {
    air::transmission_loss_db(
        r_m as f64,
        f_hz as f64,
        temp_c as f64,
        humidity as f64,
        pressure_kpa as f64,
        canopy as f64,
    ) as f32
}
