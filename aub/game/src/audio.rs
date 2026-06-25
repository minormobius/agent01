//! Central sound dispatcher.
//!
//! Call sites used to hold `Sound` handles directly and pass them
//! through half the game loop (`hurt_player(..., grunts: &[Sound], ...)`).
//! This module hides the handles behind an `Sfx` enum and a single
//! `play(&AudioBank, Sfx, rng)` dispatcher so new sounds can land
//! with a template edit instead of a function-signature change.
//!
//! Adding a new sound is three lines:
//! 1. New `Sfx::Foo` variant.
//! 2. A `SfxDef` entry in `SFX_TABLE` with the asset path(s).
//! 3. Load call in `AudioBank::load` (automatic — iterates the table).

use macroquad::audio::{load_sound, play_sound_once, Sound};
use ::rand::Rng;

/// Every sound the game can play. Variants are hashable / comparable
/// so callers just say `audio::play(&bank, Sfx::PlayerHurt, rng)`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Sfx {
    /// Player rifle / pistol discharge. Single variant for now; swap
    /// for per-WeaponKind later by looking up from the weapon template.
    WeaponFire,
    /// Default melee swing — wrench, fists, anything without a more
    /// specific sample. Per-weapon overrides can land later by
    /// adding new `Sfx::*` variants and dispatching off `WeaponKind`
    /// at the bump-attack call site.
    MeleeSwing,
    /// Player took damage. Picks a random grunt from the bank.
    PlayerHurt,
    /// Mutant Human movement squelch. Three variants; one is picked
    /// at random per step.
    MutantMove,
}

/// One entry in the catalog: an `Sfx` variant plus the asset paths
/// that back it. When a sound has multiple files (grunts), one is
/// picked at random at play time so the same variant doesn't hammer
/// the player's ear.
struct SfxDef {
    kind: Sfx,
    paths: &'static [&'static str],
}

/// Catalog of every sound the game knows about. Edit this to register
/// new sounds; `AudioBank::load` iterates and loads each.
const SFX_TABLE: &[SfxDef] = &[
    SfxDef {
        kind: Sfx::WeaponFire,
        paths: &["assets/sounds/guns/556 Single WAV.wav"],
    },
    SfxDef {
        kind: Sfx::MeleeSwing,
        paths: &["assets/sounds/melee/melee sound.wav"],
    },
    SfxDef {
        kind: Sfx::PlayerHurt,
        paths: &[
            "assets/sounds/grunts/01. Damage Grunt (Male).wav",
            "assets/sounds/grunts/02. Damage Grunt (Male).wav",
            "assets/sounds/grunts/03. Damage Grunt (Male).wav",
            "assets/sounds/grunts/04. Damage Grunt (Male).wav",
            "assets/sounds/grunts/05. Damage Grunt (Male).wav",
            "assets/sounds/grunts/06. Damage Grunt (Male).wav",
            "assets/sounds/grunts/07. Damage Grunt (Male).wav",
            "assets/sounds/grunts/08. Damage Grunt (Male).wav",
            "assets/sounds/grunts/09. Damage Grunt (Male).wav",
            "assets/sounds/grunts/10. Damage Grunt (Male).wav",
            "assets/sounds/grunts/11. Damage Grunt (Male).wav",
            "assets/sounds/grunts/12. Damage Grunt (Male).wav",
            "assets/sounds/grunts/13. Damage Grunt (Male).wav",
            "assets/sounds/grunts/14. Damage Grunt (Male).wav",
            "assets/sounds/grunts/15. Damage Grunt (Male).wav",
            "assets/sounds/grunts/16. Damage Grunt (Male).wav",
            "assets/sounds/grunts/17. Damage Grunt (Male).wav",
            "assets/sounds/grunts/18. Damage Grunt (Male).wav",
            "assets/sounds/grunts/19. Damage Grunt (Male).wav",
            "assets/sounds/grunts/20. Damage Grunt (Male).wav",
            "assets/sounds/grunts/21. Damage Grunt (Male).wav",
            "assets/sounds/grunts/22. Damage Grunt (Male).wav",
        ],
    },
    SfxDef {
        kind: Sfx::MutantMove,
        paths: &[
            "assets/sounds/mutant/move/slime_squelch_1.ogg",
            "assets/sounds/mutant/move/slime_squelch_2.ogg",
            "assets/sounds/mutant/move/slime_squelch_3.ogg",
        ],
    },
];

/// All loaded sounds. Produced by `AudioBank::load` at startup and
/// handed by reference to `play`.
pub struct AudioBank {
    /// Parallel to `SFX_TABLE`: one `Vec<Sound>` per entry, in the
    /// same order. `play` finds the bank for a given `Sfx` by
    /// scanning the table — O(n) but n is tiny and this happens
    /// only when a sound fires.
    banks: Vec<Vec<Sound>>,
}

impl AudioBank {
    /// Load every asset referenced in `SFX_TABLE`. A missing file is
    /// skipped with a warning rather than panicking: a bank that ends
    /// up empty just makes `play` a no-op (silence) for that effect, so
    /// a removed or not-yet-authored sound degrades gracefully instead
    /// of taking the whole game down at boot.
    pub async fn load() -> Self {
        // Web build: the upstream repo ships no audio files, so on wasm every
        // `load_sound` below is a 404 — and miniquad's web loader serializes
        // them, so ~30 missing sounds become ~30 sequential round-trips on a
        // cold load (the "cycling through missing assets" stall). Skip the
        // fetches entirely and hand back empty (silent) banks; `play` is
        // already a no-op for an empty bank. Drop this guard once audio assets
        // are committed (see aub/README.md "Re-syncing from upstream").
        #[cfg(target_arch = "wasm32")]
        {
            return Self {
                banks: SFX_TABLE.iter().map(|_| Vec::new()).collect(),
            };
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let mut banks: Vec<Vec<Sound>> = Vec::with_capacity(SFX_TABLE.len());
            for def in SFX_TABLE {
                let mut loaded: Vec<Sound> = Vec::with_capacity(def.paths.len());
                for path in def.paths {
                    match load_sound(path).await {
                        Ok(snd) => loaded.push(snd),
                        Err(_) => eprintln!("sound missing, skipping: {}", path),
                    }
                }
                banks.push(loaded);
            }
            Self { banks }
        }
    }
}

/// Fire off a sound. No-op if the bank for `kind` is empty (which
/// can only happen if `SFX_TABLE` is misconfigured). When the bank
/// has multiple variants (grunts), picks one uniformly at random so
/// consecutive triggers don't repeat.
pub fn play(bank: &AudioBank, kind: Sfx, rng: &mut impl Rng) {
    let Some(idx) = SFX_TABLE.iter().position(|d| d.kind == kind) else { return };
    let pool = &bank.banks[idx];
    if pool.is_empty() { return; }
    let pick = if pool.len() == 1 { 0 } else { rng.gen_range(0..pool.len()) };
    play_sound_once(&pool[pick]);
}
