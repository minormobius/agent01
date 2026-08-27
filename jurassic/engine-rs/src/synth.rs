//! One singing insect.
//!
//! Prophalangopsids and haglids sing by *elytral stridulation*: a row of teeth
//! on one forewing (the file) is dragged across a hardened scraper on the
//! other. Every tooth the scraper trips is a mechanical impact, and the impacts
//! arrive as a train whose rate is (scraper velocity ÷ tooth pitch). That train
//! drives a resonant membrane in the wing — the mirror cell — which rings at
//! its own natural frequency and radiates.
//!
//! So the synthesiser is two objects, matching the two structures:
//!
//! * a **bandlimited impulse train** at the tooth-strike rate (the file), and
//! * a **two-pole resonator** at the mirror's frequency with quality `q` (the
//!   wing).
//!
//! When strike rate and mirror frequency coincide and the file is evenly
//! spaced, the resonator is driven at resonance by a coherent train and you get
//! the near-sinusoidal "pure tone" that makes these fossils identifiable as
//! musical in the first place. Detune them, or scatter the tooth spacing, and
//! the same code produces the broadband rasp of a modern bush-cricket. That
//! single mechanism spans the whole assemblage, which is why the roster is data
//! and this file is not.
//!
//! The impulse train is the Dirichlet kernel rather than a literal spike, so it
//! carries exactly the harmonics that fit below Nyquist and aliases nowhere —
//! which matters, because half the point of this surface is a 22 kHz carrier
//! rendered honestly at 48 kHz.

use core::f64::consts::PI;

/// Longest interaural delay we model, in seconds (~a human head).
const MAX_ITD_S: f32 = 0.00066;
/// Interaural delay line length, samples. Ample at any plausible sample rate.
const ITD_LEN: usize = 128;

/// A deterministic per-voice PRNG, so tooth-spacing jitter is reproducible and
/// two runs of the same scene sound identical.
#[derive(Clone, Copy)]
struct Lcg(u32);

impl Lcg {
    const fn new(seed: u32) -> Self {
        Lcg(seed | 1)
    }
    /// Uniform on [-1, 1).
    fn bipolar(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        ((self.0 >> 8) as f32 / 8388608.0) - 1.0
    }
}

/// Everything about one singer that the caller sets.
#[derive(Clone, Copy)]
pub struct VoiceParams {
    /// Position on the forest-floor plane, metres.
    pub x: f32,
    pub y: f32,
    /// Mirror-cell resonance — the carrier you actually hear, Hz. This is the
    /// *true* frequency: propagation physics always uses it, even when the
    /// detector is shifting what reaches your ears.
    pub carrier_hz: f32,
    /// Resonator quality. High = pure tone that rings on; low = a rasp that
    /// dies between tooth strikes.
    pub q: f32,
    /// Tooth-strike rate during the closing stroke, Hz. Equal to `carrier_hz`
    /// for a resonant stridulator; offset it for a species whose file drives
    /// the mirror off its natural frequency.
    pub tooth_rate_hz: f32,
    /// Teeth engaged in one wing closure. With the strike rate, this *is* the
    /// syllable duration — the syllable lasts exactly as long as the traverse.
    pub teeth: u32,
    /// Fractional glide in strike rate across the stroke, from the file's
    /// tooth pitch widening toward the base. 0.1 = ±5 % about the mean.
    pub sweep: f32,
    /// Scatter in tooth spacing, 0–1. The difference between a musical call and
    /// a scratchy one.
    pub jitter: f32,
    /// Syllables per chirp.
    pub syllables: u32,
    /// Silence between syllables within a chirp, seconds.
    pub gap_s: f32,
    /// Chirp onset to chirp onset, seconds.
    pub chirp_period_s: f32,
    /// Source level, dB SPL at 1 m.
    pub spl_db: f32,
    /// Seed for this voice's jitter and its phase within the chorus.
    pub seed: u32,
}

impl VoiceParams {
    pub const fn silent() -> Self {
        VoiceParams {
            x: 0.0,
            y: 0.0,
            carrier_hz: 1000.0,
            q: 20.0,
            tooth_rate_hz: 1000.0,
            teeth: 50,
            sweep: 0.0,
            jitter: 0.0,
            syllables: 1,
            gap_s: 0.05,
            chirp_period_s: 1.0,
            spl_db: 0.0,
            seed: 1,
        }
    }

    /// Syllable duration, seconds: the time to drag the scraper over the file.
    pub fn syllable_s(&self) -> f32 {
        if self.tooth_rate_hz <= 0.0 {
            return 0.0;
        }
        self.teeth as f32 / self.tooth_rate_hz
    }

    /// Chirp duration, seconds: every syllable plus the gaps between them.
    pub fn chirp_s(&self) -> f32 {
        let n = self.syllables.max(1) as f32;
        n * self.syllable_s() + (n - 1.0) * self.gap_s
    }

    /// Fraction of wall-clock time this voice is actually radiating.
    pub fn duty(&self) -> f32 {
        if self.chirp_period_s <= 0.0 {
            return 0.0;
        }
        (self.chirp_s() / self.chirp_period_s).min(1.0)
    }
}

/// A voice: its parameters, its running oscillator state, and its ear delay.
pub struct Voice {
    pub p: VoiceParams,
    pub active: bool,
    /// Caller-set trim, 0–1 — solo and mute live here, not in `spl_db`.
    pub trim: f32,
    /// Stroke envelope at the last sample, 0–1. The map reads this to light a
    /// singer up while it is actually singing rather than guessing at the
    /// rhythm from a second clock that would slowly drift out of step.
    pub gate: f32,

    /// Seconds elapsed within the current chirp cycle.
    cycle_t: f32,
    /// Phase of the tooth-strike train, in cycles.
    strike_phase: f64,
    /// Tooth-strike jitter, resampled once per syllable.
    jitter_now: f32,
    last_syllable: i32,

    /// Two-pole resonator history.
    y1: f32,
    y2: f32,

    rng: Lcg,

    /// Delay line for the far ear (interaural time difference).
    ring: [f32; ITD_LEN],
    ring_pos: usize,
}

impl Voice {
    pub const fn new() -> Self {
        Voice {
            p: VoiceParams::silent(),
            active: false,
            trim: 1.0,
            gate: 0.0,
            cycle_t: 0.0,
            strike_phase: 0.0,
            jitter_now: 0.0,
            last_syllable: -1,
            y1: 0.0,
            y2: 0.0,
            rng: Lcg::new(1),
            ring: [0.0; ITD_LEN],
            ring_pos: 0,
        }
    }

    pub fn set(&mut self, p: VoiceParams) {
        self.p = p;
        self.active = true;
        self.trim = 1.0;
        self.gate = 0.0;
        self.rng = Lcg::new(p.seed);
        self.y1 = 0.0;
        self.y2 = 0.0;
        self.last_syllable = -1;
        self.jitter_now = 0.0;
        self.strike_phase = 0.0;
        self.ring = [0.0; ITD_LEN];
        self.ring_pos = 0;
        // Scatter chorus entry across the cycle, or every male in the clearing
        // starts his chirp on the same sample and the forest sounds like a
        // metronome.
        let mut r = Lcg::new(p.seed ^ 0x9E37_79B9);
        self.cycle_t = (r.bipolar() * 0.5 + 0.5).abs() * p.chirp_period_s.max(0.001);
    }

    pub fn clear(&mut self) {
        self.active = false;
    }

    /// One sample of this voice's radiated waveform, before propagation.
    ///
    /// `render_carrier` and `render_rate` are the frequencies to *synthesise*
    /// at — normally the true ones, but divided down when the ultrasound
    /// detector is engaged. `sr` is the sample rate.
    pub fn tick(&mut self, sr: f32, render_carrier: f32, render_rate: f32) -> f32 {
        if !self.active {
            return 0.0;
        }
        let p = self.p;
        let syl = p.syllable_s();
        let dt = 1.0 / sr;

        self.cycle_t += dt;
        if self.cycle_t >= p.chirp_period_s {
            self.cycle_t -= p.chirp_period_s;
            self.last_syllable = -1;
        }

        // Which syllable of the chirp are we inside, and how far through it?
        let stride = syl + p.gap_s;
        let mut drive = 0.0f32;
        let mut gate = 0.0f32;
        if stride > 0.0 && self.cycle_t < p.syllables.max(1) as f32 * stride {
            let idx = (self.cycle_t / stride) as i32;
            let u = (self.cycle_t - idx as f32 * stride) / syl.max(1e-9);
            if u < 1.0 {
                if idx != self.last_syllable {
                    self.last_syllable = idx;
                    self.jitter_now = self.rng.bipolar() * p.jitter;
                }
                // Closure velocity: the scraper accelerates in and eases out.
                // sin^0.5 gives a broad plateau rather than a bell, which is
                // what the recorded envelopes of resonant callers look like.
                let env = (PI as f32 * u).sin().max(0.0).powf(0.5);
                gate = env;

                // Tooth pitch widens toward the file base, so the strike rate
                // glides across the stroke.
                let glide = 1.0 + p.sweep * (u - 0.5) + self.jitter_now * 0.08;
                let rate = (render_rate * glide).max(1.0);

                self.strike_phase += (rate as f64) * (dt as f64);
                if self.strike_phase >= 1.0 {
                    self.strike_phase -= self.strike_phase.floor();
                }
                drive = blit(self.strike_phase, rate, sr) * env;
            }
        }

        self.gate = gate;

        // Two-pole resonator at the mirror-cell frequency.
        let f0 = render_carrier.clamp(20.0, sr * 0.45);
        let q = p.q.max(0.5);
        let r = (-(PI as f32) * f0 / (q * sr)).exp();
        let theta = 2.0 * (PI as f32) * f0 / sr;
        let a1 = 2.0 * r * theta.cos();
        let a2 = -(r * r);
        // Scaling the input by (1 - r) holds a resonantly-driven voice near
        // unity whatever its Q, so a pure-tone singer and a rasping one arrive
        // at the mixer at comparable level and `spl_db` stays meaningful.
        let y = (1.0 - r) * drive + a1 * self.y1 + a2 * self.y2;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }

    /// Push a sample into the ear delay line and read it back `delay` samples
    /// later, with linear interpolation. Used for the far ear only.
    pub fn delayed(&mut self, s: f32, delay_samples: f32) -> f32 {
        self.ring[self.ring_pos] = s;
        let d = delay_samples.clamp(0.0, (ITD_LEN - 2) as f32);
        let i = d.floor();
        let frac = d - i;
        let a = self.read_back(i as usize);
        let b = self.read_back(i as usize + 1);
        self.ring_pos = (self.ring_pos + 1) % ITD_LEN;
        a * (1.0 - frac) + b * frac
    }

    fn read_back(&self, n: usize) -> f32 {
        self.ring[(self.ring_pos + ITD_LEN - n) % ITD_LEN]
    }
}

/// Bandlimited impulse train (the Dirichlet kernel), peak-normalised to 1.
///
/// A literal spike train at a 22 kHz strike rate is unrepresentable at 48 kHz
/// and folds its whole spectrum back over the audio band. This carries exactly
/// the harmonics of `rate` that fit under Nyquist and nothing above, so the
/// ultrasonic voices are honest rather than merely loud.
fn blit(phase: f64, rate: f32, sr: f32) -> f32 {
    let m = ((sr * 0.5 / rate.max(1.0)) as i32).max(1);
    let n = (2 * m + 1) as f64;
    let d = (PI * phase).sin();
    if d.abs() < 1e-7 {
        return 1.0;
    }
    (((n * PI * phase).sin() / (n * d)) as f32).clamp(-1.0, 1.0)
}

/// Largest interaural delay, in samples, at this sample rate.
pub fn max_itd_samples(sr: f32) -> f32 {
    MAX_ITD_S * sr
}
