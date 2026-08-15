//! sci-mri-engine — an MRI, computed rather than asserted.
//!
//! Seven modules, no dependencies. Part one of the page is the sensor; part two
//! is the encoding. Both are here:
//!
//! * [`coil`] — Biot–Savart fields from wire loops, and the **principle of
//!   reciprocity** (Hoult & Richards, *J Magn Reson* 24:71–85, 1976): a coil's
//!   receive sensitivity at a point is the field it would produce at that point
//!   per unit current. That equivalence is why a sensitivity map is computable
//!   at all, and it is what the `/mri` page is built around.
//! * [`bloch`] — the Bloch equations (Bloch, *Phys Rev* 70:460, 1946) for the
//!   magnetisation those coils detect: relaxation, off-resonance, hard pulses,
//!   isochromat ensembles, spin echoes.
//! * [`phantom`] — an object made of ellipses, and its k-space evaluated in
//!   closed form, so that undersampling aliases for the same reason a real
//!   scanner's does rather than because a grid was reused.
//! * [`fft`] — sixty lines of Cooley–Tukey, which is the entire reconstruction
//!   algorithm of a clinical scanner.
//! * [`encode`] — gradients as a steering wheel for k-space (Twieg 1983), the
//!   trajectories that result, and the artefacts that come from *when* each
//!   sample was taken rather than which.
//! * [`contrast`] — measured tissue T₁/T₂ (Stanisz 2005) and the sequence
//!   equations that turn them into brightness, each cross-checked against a
//!   full Bloch simulation rather than against a textbook.
//!
//! Plus [`physics`], which holds the constants and the two scaling laws that
//! make the whole instrument make sense: Curie-law polarisation and the
//! frequency dependence of Faraday detection.
//!
//! Every claim the page makes about these is checked in `tests.rs` against a
//! closed-form solution, and `cargo run --release --bin verify` prints the
//! comparison.

pub mod bloch;
pub mod coil;
pub mod contrast;
pub mod encode;
pub mod fft;
pub mod phantom;
pub mod physics;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(test)]
mod tests;
