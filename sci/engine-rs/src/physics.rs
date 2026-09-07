//! Constants, and the two scaling laws that explain why an MRI is the size and
//! shape it is.
//!
//! Both laws below are elementary, and both are the honest answer to a question
//! the page asks. Neither is quoted from a textbook — they are computed here so
//! the page can show its work.

/// Vacuum magnetic permeability, CODATA 2018 (SI redefinition made it no longer
/// exactly 4π×10⁻⁷, though it differs only in the 10th digit).
pub const MU0: f64 = 1.256_637_062_12e-6;

/// Proton gyromagnetic ratio, rad s⁻¹ T⁻¹ (CODATA 2018).
pub const GAMMA: f64 = 2.675_221_874_4e8;

/// Proton gyromagnetic ratio over 2π, Hz T⁻¹ — the ~42.58 MHz/T that the whole
/// instrument is built around.
pub const GAMMA_BAR: f64 = GAMMA / (2.0 * std::f64::consts::PI);

/// Reduced Planck constant, J s.
pub const HBAR: f64 = 1.054_571_817e-34;

/// Boltzmann constant, J K⁻¹.
pub const KB: f64 = 1.380_649e-23;

/// Human body temperature, K.
pub const T_BODY: f64 = 310.15;

/// Larmor frequency in Hz for protons at field `b0` (tesla).
pub fn larmor_hz(b0: f64) -> f64 {
    GAMMA_BAR * b0
}

/// Free-space wavelength (m) at the proton Larmor frequency for field `b0`.
///
/// The point of exposing this: at 1.5 T it is ~4.7 m, so a scanner bore is a
/// hundredth of a wavelength across and the coil sits deep in the **near
/// field**. Detection is magnetic induction, not radiation — Hoult, *Concepts
/// Magn Reson* 1:1–5 (1989).
pub fn larmor_wavelength_m(b0: f64) -> f64 {
    2.997_924_58e8 / larmor_hz(b0)
}

/// Thermal (Curie-law) spin polarisation of protons at field `b0` and
/// temperature `temp_k` — the *fraction* of spins left uncancelled.
///
/// Exact two-level result, `P = tanh(ħγB₀ / 2k_BT)`; in every practical MRI
/// regime the argument is ~10⁻⁵ and this is indistinguishable from its linear
/// (Curie) limit. At 1.5 T and body temperature it is about 4.9 parts per
/// million: essentially the whole sample cancels, and the image is built from
/// the residue.
pub fn polarization(b0: f64, temp_k: f64) -> f64 {
    (HBAR * GAMMA * b0 / (2.0 * KB * temp_k)).tanh()
}

/// Relative induced EMF for a Faraday (coil) detector, normalised to 1.5 T.
///
/// Two factors of field, and they come from different places:
///
/// 1. the equilibrium magnetisation is proportional to polarisation, hence to
///    `B₀` — [`polarization`];
/// 2. Faraday's law gives `emf = -dΦ/dt`, and the flux oscillates at the Larmor
///    frequency, which is also proportional to `B₀`.
///
/// So induction-detected signal goes as `B₀²`. This is the whole reason MRI
/// chases field strength — and the reason ultra-low-field MRI cannot use a
/// coil, and reaches for a SQUID or an atomic magnetometer instead, whose
/// sensitivity does not care about frequency at all.
///
/// Noise is *not* included here; this is signal only. See `tests.rs`.
pub fn relative_faraday_emf(b0: f64) -> f64 {
    let r = |b: f64| polarization(b, T_BODY) * larmor_hz(b);
    r(b0) / r(1.5)
}
