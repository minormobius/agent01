//! One singing insect.
//!
//! Prophalangopsids and haglids sing by *elytral stridulation*: a row of teeth
//! on one forewing (the file) is dragged across a scraper on the other. Every
//! tooth the scraper trips is a mechanical impact, and the impacts arrive as a
//! train that drives a resonant membrane in the wing — the mirror cell — which
//! rings at its own natural frequency and radiates.
//!
//! So the synthesiser is two objects, matching the two structures:
//!
//! * a **bandlimited impulse train** at the tooth-strike rate (the file), and
//! * a **two-pole resonator** at the mirror's frequency with quality `q` (the
//!   wing).
//!
//! The impulse train is the Dirichlet kernel rather than a literal spike, so it
//! carries exactly the harmonics that fit below Nyquist and aliases nowhere —
//! which matters, because half the point of this surface is a 22.5 kHz carrier
//! rendered honestly at 48 kHz.
//!
//! ## The file is a shape, not a number
//!
//! Gu et al. 2026 publish, for each of the nine Daohugou fossils, the distance
//! between every adjacent pair of teeth along its file (their Fig. 4B). Those
//! curves are the result — the whole argument that these animals had already
//! evolved elaborate files for an elaborate repertoire lives in their shapes —
//! so this module consumes them rather than a single "tooth rate".
//!
//! The scraper crosses the file at roughly constant velocity, so the strike
//! rate at tooth *k* goes as 1 / spacing(*k*). Three shapes appear in the
//! fossils and all three are here:
//!
//! * a **trend** — spacing rising toward the basal end, steeply in
//!   *Bacharaboilus curvus* and *Gurenia caii*, which glides the call downward
//!   as the stroke ends (`sweep`);
//! * a **ripple** — the regular rise-and-fall of *Archaboilus polyneurus*,
//!   which the authors read as deliberate amplitude and frequency modulation
//!   (`ripple`, `ripple_cycles`);
//! * a **bipartite file** — *Allaboilus gigantus* carries about eight widely
//!   spaced "pegs" at the anal end (400–600 µm) before a dense regular file
//!   (~100 µm). At constant scraper velocity those pegs arrive as separated
//!   clicks with the wing ringing down between them, then the file proper
//!   arrives as a burst. That is exactly the reconstructed syllable in their
//!   Fig. 4C, and it falls out of the geometry rather than being drawn on
//!   (`pegs`, `peg_ratio`).
//!
//! ## Both strokes
//!
//! Modern katydids radiate on the closing stroke only. These fossils have
//! **symmetric wings**, and Gu et al. read that as the ancestral condition:
//! "the main amplitude components of the call produced during both the opening
//! and closing phases of the wing stridulatory cycle." So a syllable here is a
//! pair of hemisyllables — the scraper runs down the file and back up it — and
//! the return trip sweeps the file's shape in reverse. Set `opening` to 0 for a
//! closing-only singer.

use core::f64::consts::PI;

/// Longest interaural delay we model, in seconds (~a human head).
const MAX_ITD_S: f32 = 0.00066;
/// Interaural delay line length, samples. Ample at any plausible sample rate.
const ITD_LEN: usize = 128;

/// The highest fraction of the sample rate this kernel will render a carrier
/// at. Just under Nyquist: a 22.5 kHz call fits in a 48 kHz stream and does not
/// fit in a 44.1 kHz one, which is exactly the distinction the page needs to
/// make honestly.
pub const REPRODUCIBLE_FRACTION: f32 = 0.49;

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

/// The shape of one stridulatory file, after Gu et al. 2026 Fig. 4B.
///
/// All terms are multipliers on the mean inter-tooth distance, so the file is
/// described independently of how fast the scraper crosses it.
#[derive(Clone, Copy)]
pub struct FileShape {
    /// Fractional rise in spacing from the anal to the basal end, which glides
    /// the call down in pitch as the stroke ends.
    pub sweep: f32,
    /// How the sweep is distributed along the file. 1 is a straight ramp;
    /// larger values hold the spacing flat and then flare it near the basal
    /// end, which is what *Bacharaboilus curvus* and *Gurenia caii* actually
    /// do in Gu et al. 2026 Fig. 4B — flat for most of the traverse, then a
    /// sharp widening over the last teeth. A straight ramp of the same
    /// end-to-end ratio would smear that across the whole note.
    pub flare: f32,
    /// Amplitude of a regular rise-and-fall in spacing along the file.
    pub ripple: f32,
    /// How many full cycles of that ripple the file carries.
    pub ripple_cycles: f32,
    /// Scatter in spacing, 0–1. The difference between a musical call and a
    /// scratchy one.
    pub jitter: f32,
    /// Widely spaced pegs at the anal end, engaged before the file proper.
    pub pegs: u32,
    /// How much further apart those pegs sit than the mean file tooth.
    pub peg_ratio: f32,
}

impl FileShape {
    pub const fn plain() -> Self {
        FileShape {
            sweep: 0.0,
            flare: 1.0,
            ripple: 0.0,
            ripple_cycles: 0.0,
            jitter: 0.0,
            pegs: 0,
            peg_ratio: 1.0,
        }
    }

    /// Spacing multiplier at tooth `k` of `teeth`, before jitter.
    fn spacing(&self, k: f32, teeth: u32) -> f32 {
        let n = (teeth.max(2) - 1) as f32;
        let u = (k / n).clamp(0.0, 1.0);
        // Mean-zero in u, so `sweep` changes the shape of the file without
        // changing how long the traverse takes.
        let e = self.flare.max(0.05);
        let mut s = 1.0 + self.sweep * (u.powf(e) - 1.0 / (e + 1.0));
        if self.ripple != 0.0 && self.ripple_cycles > 0.0 {
            s += self.ripple * (2.0 * (PI as f32) * self.ripple_cycles * u).sin();
        }
        if k < self.pegs as f32 {
            s *= self.peg_ratio.max(0.01);
        }
        s.max(0.05)
    }

    /// Mean spacing multiplier over the whole file — what turns a nominal
    /// strike rate into a syllable duration.
    pub fn mean_spacing(&self, teeth: u32) -> f32 {
        let n = teeth.max(1);
        let mut total = 0.0;
        for k in 0..n {
            total += self.spacing(k as f32, n);
        }
        total / n as f32
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
    /// Resonator quality, from the −3 dB width of the reconstructed call.
    /// Gu et al. report 8.2 to 63 across the nine fossils; a mammalian cochlea
    /// resolves about 9–13, which is why the high-Q singers are the hard ones
    /// to locate.
    pub q: f32,
    /// Tooth-strike rate at the file's *mean* spacing, Hz. Equal to
    /// `carrier_hz` for a resonant stridulator, which is how all nine fossils
    /// are modelled — the authors' own framing: to make a 5 kHz call the wing
    /// must resonate at 5 kHz and the scraper must engage 5,000 teeth a second.
    pub tooth_rate_hz: f32,
    /// Teeth on the file.
    pub teeth: u32,
    /// The shape of that file.
    pub file: FileShape,
    /// Relative amplitude of the opening hemisyllable, 0–1. Nonzero for these
    /// symmetric-winged fossils; 0 for a modern closing-only katydid.
    pub opening: f32,
    /// Pause between the closing and opening hemisyllables, seconds.
    pub stroke_gap_s: f32,
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
            file: FileShape::plain(),
            opening: 0.0,
            stroke_gap_s: 0.01,
            syllables: 1,
            gap_s: 0.05,
            chirp_period_s: 1.0,
            spl_db: 0.0,
            seed: 1,
        }
    }

    /// Duration of one hemisyllable — the time to drag the scraper across the
    /// file once. Not a parameter: it is the traverse.
    pub fn hemisyllable_s(&self) -> f32 {
        if self.tooth_rate_hz <= 0.0 {
            return 0.0;
        }
        self.teeth as f32 * self.file.mean_spacing(self.teeth) / self.tooth_rate_hz
    }

    /// Duration of a full syllable: the closing stroke, and the opening one
    /// after it if this species radiates on both.
    pub fn syllable_s(&self) -> f32 {
        let h = self.hemisyllable_s();
        if self.opening > 0.0 {
            h * 2.0 + self.stroke_gap_s
        } else {
            h
        }
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
    /// Position of the scraper along the file, in teeth.
    tooth_pos: f32,
    /// Phase of the tooth-strike train, in cycles.
    strike_phase: f64,
    /// Jitter on the tooth currently being engaged.
    jitter_now: f32,
    last_tooth: i32,

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
            tooth_pos: 0.0,
            strike_phase: 0.0,
            jitter_now: 0.0,
            last_tooth: -1,
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
        self.last_tooth = -1;
        self.jitter_now = 0.0;
        self.strike_phase = 0.0;
        self.tooth_pos = 0.0;
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

    /// Where the scraper is at time `t` within the chirp, if it is on the file
    /// at all: `(fraction along the file 0–1, hemisyllable amplitude)`.
    fn stroke_at(&self, t: f32) -> Option<(f32, f32)> {
        let p = self.p;
        let h = p.hemisyllable_s();
        if h <= 0.0 {
            return None;
        }
        let syl = p.syllable_s();
        let stride = syl + p.gap_s;
        if stride <= 0.0 || t >= p.syllables.max(1) as f32 * stride {
            return None;
        }
        let idx = (t / stride).floor();
        let within = t - idx * stride;
        if within < h {
            // Closing stroke: anal → basal.
            Some((within / h, 1.0))
        } else if p.opening > 0.0 {
            let after = within - h - p.stroke_gap_s;
            if after >= 0.0 && after < h {
                // Opening stroke: the same file, run backward.
                Some((1.0 - after / h, p.opening))
            } else {
                None
            }
        } else {
            None
        }
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
        let dt = 1.0 / sr;

        self.cycle_t += dt;
        if self.cycle_t >= p.chirp_period_s {
            self.cycle_t -= p.chirp_period_s;
            self.last_tooth = -1;
        }

        let mut drive = 0.0f32;
        let mut gate = 0.0f32;

        if let Some((along, stroke_amp)) = self.stroke_at(self.cycle_t) {
            let k = along * (p.teeth.max(1) - 1).max(1) as f32;
            // Resample the jitter once per tooth, not once per sample: it is a
            // property of the file, not noise added to the signal.
            let ki = k as i32;
            if ki != self.last_tooth {
                self.last_tooth = ki;
                self.jitter_now = self.rng.bipolar() * p.file.jitter;
            }
            let spacing = p.file.spacing(k, p.teeth) * (1.0 + self.jitter_now * 0.35);
            // Constant scraper velocity, so a wider gap means a slower strike.
            let rate = (render_rate / spacing.max(0.05)).clamp(1.0, sr * 0.49);

            // Closure velocity: the scraper accelerates in and eases out.
            // sin^0.5 gives a broad plateau rather than a bell, which is what
            // the recorded envelopes of resonant callers look like.
            let env = ((PI as f32) * along).sin().max(0.0).powf(0.5);

            self.strike_phase += (rate as f64) * (dt as f64);
            if self.strike_phase >= 1.0 {
                self.strike_phase -= self.strike_phase.floor();
            }
            drive = blit(self.strike_phase, rate, sr) * env * stroke_amp;
            gate = env * stroke_amp;
        }
        self.gate = gate;

        // Two-pole resonator at the mirror-cell frequency.
        //
        // A carrier above this output's Nyquist limit is not quiet — it is
        // ABSENT, and saying so is the point. Clamping it down to just under
        // Nyquist would put an audible 19.8 kHz tone where a 22.5 kHz call
        // belongs, which would be a lie in exactly the direction this page
        // exists to correct. At a 44.1 kHz context that silences
        // *Sigmaboilus peregrinus* completely until the detector is engaged —
        // which is what a real recording of it would do too.
        if render_carrier > sr * REPRODUCIBLE_FRACTION {
            self.gate = 0.0;
            self.y1 = 0.0;
            self.y2 = 0.0;
            return 0.0;
        }
        let f0 = render_carrier.max(20.0);
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
/// A literal spike train at a 22.5 kHz strike rate is unrepresentable at 48 kHz
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
