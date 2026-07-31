//! homeostasis-engine — the reservoir of Falandays, Nguyen & Spivey (2021),
//! in Rust.
//!
//! `model` is the whole thing and depends on nothing. `wasm` is a thin
//! browser-facing shell around it, compiled only for wasm32.

pub mod model;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(test)]
mod tests;
