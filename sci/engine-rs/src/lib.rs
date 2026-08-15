//! sci-mri-engine — the MRI detection chain, computed rather than asserted.
//!
//! Two solvers, both dependency-free:
//!
//! * [`coil`] — Biot–Savart fields from wire loops, and the **principle of
//!   reciprocity** (Hoult & Richards, *J Magn Reson* 24:71–85, 1976): a coil's
//!   receive sensitivity at a point is the field it would produce at that point
//!   per unit current. That equivalence is why a sensitivity map is computable
//!   at all, and it is what the `/mri` page is built around.
//! * [`bloch`] — the Bloch equations (Bloch, *Phys Rev* 70:460, 1946) for the
//!   magnetisation those coils detect: relaxation, off-resonance, hard pulses,
//!   isochromat ensembles, spin echoes.
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
pub mod physics;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(test)]
mod tests;
