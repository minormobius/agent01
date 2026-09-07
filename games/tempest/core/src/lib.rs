//! # tempest
//!
//! A Tempest whose levels are generated and then *proved playable* before
//! anyone sees them.
//!
//! The arcade original gave you a web of lanes, enemies climbing them, and a
//! gun that only fires down the lane you are standing in. Its webs were hand
//! drawn and its difficulty was hand tuned. This one generates both, and can
//! answer exactly — not approximately, not by playtesting — the question the
//! genre has always begged:
//!
//! > **Given where everything is right now, is there any way round the web
//! > that holds the rim?**
//!
//! Everything else follows from being able to answer that:
//!
//! - the generator ships no level it cannot certify ([`gen`]),
//! - the certificate names how much slack perfect play has, so difficulty is a
//!   measured quantity rather than a knob ([`solver::Cert`]),
//! - and after a run the game can tell you the exact tick your web turned
//!   against you, and which way you should have gone ([`autopsy`]).
//!
//! ## Layout
//!
//! | module | holds |
//! |---|---|
//! | [`fixed`] | integer trig — no floats anywhere near a seed |
//! | [`rng`] | SplitMix64, with named sub-streams |
//! | [`web`] | the lane ring/strip, and the geometry that sets travel costs |
//! | [`level`] | threats, waves, and the collision arithmetic |
//! | [`sim`] | the tick-stepped headless simulator |
//! | [`solver`] | the exact answer: Pareto Held–Karp over kill tours |
//! | [`gen`] | procgen, and the repair loop that makes levels honest |
//! | [`pack`] | the certified level pack, the golden vectors, the wasm wire |
//! | [`bots`] | policies, including the deliberately bad control |
//! | [`lab`] | measurement: spreads, bands, warnings |
//! | [`autopsy`] | what actually killed a run |
//! | [`wasm`] | the flat-memory ABI the browser build exports |

pub mod autopsy;
pub mod bots;
pub mod fixed;
pub mod gen;
pub mod lab;
pub mod level;
pub mod pack;
pub mod rng;
pub mod sim;
pub mod solver;
pub mod web;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

/// Bumped whenever a change alters what a seed means. The browser build and
/// the golden vectors both carry it, so a stale `tempest.wasm` next to fresh
/// Rust is a loud failure rather than a quiet wrong answer.
pub const SEED_EPOCH: u32 = 1;
