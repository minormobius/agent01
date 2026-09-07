//! Why the scanner screams.
//!
//! The gradient coils sit inside `B₀` carrying hundreds of amps, switching in
//! hundreds of microseconds. A conductor of length `L` carrying current `I`
//! across a field `B` feels a Lorentz force `F = B·I·L`, so every gradient
//! winding is being shoved sideways with a force of order a hundred kilograms
//! per metre, thousands of times a second. The coil former flexes; the flexing
//! radiates sound; the sound is a scream.
//!
//! Two things follow, and they are the whole page:
//!
//! * **The pitch of an MRI is its readout frequency.** The force follows the
//!   gradient current, so the acoustic spectrum is a **comb locked to the pulse
//!   sequence's own clock**: a boustrophedon EPI train alternates sign, so the
//!   current repeats every two lobes and every line of the spectrum sits on a
//!   multiple of `1/(2·esp)`. Halve the echo spacing and the whole comb goes up
//!   an octave. You are listening to the sequence.
//! * **You hear the corners, not the ramps.** A stiff structure driven well
//!   below resonance moves in proportion to the force, and radiated pressure
//!   goes as the *acceleration* of the radiating surface — so what reaches your
//!   ear goes as `d²G/dt²`. For a trapezoid that is a pair of impulses at each
//!   ramp's start and end, which is why EPI clatters rather than hums. It also
//!   weights the spectrum by `ω²`, which is why the loudest line is usually a
//!   harmonic rather than the fundamental — `tests.rs` measures which.
//!
//! **What is physics here and what is a model.** The waveform, the Lorentz
//! force, the derivative relationship and the resulting spectrum are computed
//! exactly and tested. The conversion from force to sound is a *single damped
//! resonator* standing in for the coil former's mechanical response — real
//! formers have many modes and a measured transfer function, and reproducing a
//! particular scanner's timbre is not attempted. The **timing structure is the
//! physics; the timbre is a model**, and the page says so.

/// One trapezoidal gradient lobe.
#[derive(Clone, Copy, Debug)]
pub struct Lobe {
    /// Plateau amplitude, tesla per metre.
    pub amp: f64,
    /// Ramp time up (and down), seconds.
    pub ramp: f64,
    /// Time at the plateau, seconds.
    pub flat: f64,
}

impl Lobe {
    /// Seconds from the start of the ramp-up to the end of the ramp-down.
    pub fn duration(&self) -> f64 {
        2.0 * self.ramp + self.flat
    }

    /// Slew rate, tesla per metre per second — the number a gradient amplifier
    /// is actually specified by, and the one that sets how hard the coil is
    /// kicked.
    pub fn slew(&self) -> f64 {
        if self.ramp > 0.0 {
            self.amp / self.ramp
        } else {
            f64::INFINITY
        }
    }

    /// Area under the lobe, tesla-seconds per metre. This is the quantity that
    /// matters to [`crate::encode`]: `Δk = γ̄ · ∫G dt`, so the readout lobe's
    /// area *is* the width of k-space it traverses.
    pub fn area(&self) -> f64 {
        self.amp * (self.flat + self.ramp)
    }

    /// Amplitude at time `t` from the start of the lobe.
    pub fn at(&self, t: f64) -> f64 {
        if t < 0.0 || t > self.duration() {
            0.0
        } else if t < self.ramp {
            self.amp * t / self.ramp
        } else if t < self.ramp + self.flat {
            self.amp
        } else {
            self.amp * (self.duration() - t) / self.ramp
        }
    }
}

/// The readout train of an EPI acquisition: `lobes` trapezoids, alternating in
/// sign, played back to back — Mansfield's boustrophedon, as a current.
///
/// Sampled at `dt` for `n` samples; returns tesla per metre.
pub fn readout_train(lobe: Lobe, lobes: usize, alternate: bool, dt: f64, n: usize) -> Vec<f64> {
    let period = lobe.duration();
    (0..n)
        .map(|i| {
            let t = i as f64 * dt;
            let idx = (t / period).floor() as i64;
            if idx < 0 || idx as usize >= lobes.max(1) {
                return 0.0;
            }
            let sign = if alternate && idx % 2 == 1 { -1.0 } else { 1.0 };
            sign * lobe.at(t - idx as f64 * period)
        })
        .collect()
}

/// The same train repeated forever, so an audio buffer can loop seamlessly.
pub fn readout_loop(lobe: Lobe, alternate: bool, dt: f64, n: usize) -> Vec<f64> {
    let period = lobe.duration();
    (0..n)
        .map(|i| {
            let t = i as f64 * dt;
            let idx = (t / period).floor() as i64;
            let sign = if alternate && idx.rem_euclid(2) == 1 { -1.0 } else { 1.0 };
            sign * lobe.at(t - idx as f64 * period)
        })
        .collect()
}

/// Lorentz force per metre of conductor: `F/L = B·I`, newtons per metre.
///
/// No approximation — this is the definition of the magnetic force on a current
/// perpendicular to a field. At 3 T and 300 A it is 900 N/m, which is about
/// 92 kilograms hanging off every metre of wire, reversing thousands of times a
/// second.
pub fn force_per_metre(current_a: f64, b0_t: f64) -> f64 {
    current_a * b0_t
}

/// That force expressed as the mass it would take to match it, in kilograms per
/// metre, because newtons per metre is not an intuition anybody has.
pub fn force_as_kg_per_metre(current_a: f64, b0_t: f64) -> f64 {
    force_per_metre(current_a, b0_t) / 9.806_65
}

/// Second time derivative by central differences — the acceleration of the
/// driven structure, and so the shape of the radiated pressure.
pub fn second_derivative(w: &[f64], dt: f64) -> Vec<f64> {
    let n = w.len();
    (0..n)
        .map(|i| {
            if i == 0 || i + 1 >= n {
                0.0
            } else {
                (w[i + 1] - 2.0 * w[i] + w[i - 1]) / (dt * dt)
            }
        })
        .collect()
}

/// A single damped mechanical resonance, driven by `force`, integrated with the
/// velocity-Verlet-flavoured scheme below and returned as the *acceleration* of
/// the mass — which is what radiates.
///
/// `f0` is the resonance in hertz and `q` its quality factor. This is the
/// **model** part of the module: a real gradient former has many modes and a
/// measured response. One resonator is enough to show why the sound is coloured
/// rather than a pure impulse train, and not enough to imitate any actual
/// scanner.
pub fn resonator(force: &[f64], dt: f64, f0: f64, q: f64) -> Vec<f64> {
    let w0 = 2.0 * std::f64::consts::PI * f0;
    let (mut x, mut v) = (0.0f64, 0.0f64);
    let mut out = Vec::with_capacity(force.len());
    for &f in force {
        let a = f - (w0 / q) * v - w0 * w0 * x;
        v += a * dt;
        x += v * dt;
        out.push(a);
    }
    out
}

/// Magnitude spectrum of a real signal, via [`crate::fft`]. Returns the first
/// half (up to Nyquist); bin `i` is the frequency `i / (n·dt)`.
pub fn spectrum(signal: &[f64], _dt: f64) -> Vec<f64> {
    let n = signal.len().next_power_of_two().min(1 << 16);
    let mut buf = vec![0.0f64; 2 * n];
    for (i, &s) in signal.iter().take(n).enumerate() {
        buf[2 * i] = s;
    }
    crate::fft::fft(&mut buf, false);
    (0..n / 2).map(|i| buf[2 * i].hypot(buf[2 * i + 1])).collect()
}

/// The frequency of the loudest spectral component, in hertz.
pub fn peak_frequency(signal: &[f64], dt: f64) -> f64 {
    let n = signal.len().next_power_of_two().min(1 << 16);
    let sp = spectrum(signal, dt);
    // Skip DC and the first couple of bins, which carry the train's envelope.
    let (mut best, mut bv) = (0usize, -1.0f64);
    for (i, &v) in sp.iter().enumerate().skip(2) {
        if v > bv {
            bv = v;
            best = i;
        }
    }
    best as f64 / (n as f64 * dt)
}

/// Sound pressure level in decibels for a pressure amplitude in pascals,
/// against the standard 20 µPa reference.
pub fn spl_db(pressure_pa: f64) -> f64 {
    20.0 * (pressure_pa / 20e-6).log10()
}

/// The pressure amplitude, in pascals, corresponding to an SPL in decibels.
pub fn pressure_pa(spl_db: f64) -> f64 {
    20e-6 * 10f64.powf(spl_db / 20.0)
}

/// How many times louder in *energy* one SPL is than another. Useful for the
/// only comparison a reader actually wants: EPI against the exposure limit.
pub fn energy_ratio(db_a: f64, db_b: f64) -> f64 {
    10f64.powf((db_a - db_b) / 10.0)
}
