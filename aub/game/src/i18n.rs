//! Localization scaffolding — every player-visible string lives in
//! a single data file, keyed by a stable identifier.
//!
//! The active strings live in `assets/i18n/en-US.json` and are
//! pulled in at compile time via `include_str!`. That gives us:
//!
//! - **Translator-friendly format.** A `.json` file is what every
//!   localization tool (Lokalise, Crowdin, POEdit, Weblate, ...)
//!   speaks. A translator never has to open a Rust source file.
//! - **Single artifact to ship.** `include_str!` embeds the JSON
//!   into the binary at build time, so there's no extra runtime
//!   file to lose. Adding a new language in the future means
//!   adding another JSON next to it and switching which one we
//!   embed (or, eventually, picking at runtime).
//! - **Compile-time validation of the JSON's *presence*.** A
//!   missing or unparseable file fails the build, not the launch.
//!   Missing *keys* still surface at runtime as the `<MISSING>`
//!   marker — same contract as before.
//!
//! ## Key naming convention
//!
//! `<scope>.<topic>.<id>` — keys read like a path so a glance at
//! one tells you where the string surfaces:
//!
//! | Scope     | Surfaces in                          | Examples                                            |
//! |-----------|--------------------------------------|-----------------------------------------------------|
//! | `intro`   | The opening splash before RollStats  | `intro.title`, `intro.subtitle`                     |
//! | `title`   | Title-screen menu items + chrome     | `title.option.new_game`                             |
//! | `pause`   | Pause-menu chrome + options          | `pause.title`, `pause.option.resume`                |
//! | `ui`      | HUD / overlay labels & hints         | `ui.save.prompt_label`, `ui.load.empty`             |
//! | `log`     | Event-log lines the player reads     | `log.descend.next`, `log.combat.miss_ranged`        |
//! | `item`    | Item template `name` / `description` | `item.medkit.name`, `item.medkit.description`       |
//! | `weapon`  | Weapon names + hit / kill messages   | `weapon.wrench.name`, `weapon.wrench.melee.hit`     |
//! | `creature`| Creature template names              | `creature.gruboid.name`                             |
//! | `prop`    | Prop template names + descriptions   | `prop.cryo_tube.name`, `prop.cryo_tube.description` |
//! | `class`   | Player-class names + descriptions    | `class.engineering.name`                            |
//!
//! New strings always go through this module; reaching for a raw
//! literal is the gap that breaks the localization story.
//!
//! ## Templating
//!
//! Strings with runtime values use positional placeholders
//! `{0}`, `{1}`, ...:
//!
//! ```json
//! "log.descend.next": "You descend to level {0}."
//! ```
//!
//! Call sites use the `tr_fmt!` macro:
//!
//! ```ignore
//! add_log(&mut log, tr_fmt!("log.descend.next", level.num), now);
//! ```
//!
//! Static (non-templated) strings use the `tr` function and avoid
//! allocation:
//!
//! ```ignore
//! add_log(&mut log, tr("log.door.locked"), now);
//! ```
//!
//! Weapon hit / kill messages additionally use named placeholders
//! `{target}` and `{damage}`, substituted by `format_hit` /
//! `format_kill` in `items::weapons`.
//!
//! ## Missing keys
//!
//! Lookups that miss return a static `"<MISSING>"` marker rather
//! than panicking — a typo or a still-being-authored key shows up
//! in-game as a visible gap, not a crash. Debug builds also
//! `eprintln!` the missing key so it's easy to track down.
//!
//! ## Adding a new language (future)
//!
//! 1. Copy `assets/i18n/en-US.json` to `assets/i18n/<lang>-<region>.json`.
//! 2. Translate the values; **keys must stay identical**.
//! 3. Wire a settings toggle that swaps the `include_str!` path (or,
//!    when we want true runtime selection, switch to `fs::read_to_string`).
//!
//! ## Future hot-reload
//!
//! For a faster edit/test loop, swap the `include_str!` for a
//! `fs::read_to_string` of the same path behind a debug feature
//! flag. The lookup API doesn't change.

use std::collections::HashMap;
use std::sync::OnceLock;

/// Marker returned for an unknown key. Loud enough to spot in-game,
/// quiet enough not to crash. Public so tests can assert against it.
pub const MISSING: &str = "<MISSING>";

/// Embedded JSON for the active language. Compile-time include —
/// the build fails if the file is missing or unreadable.
const SOURCE_JSON: &str = include_str!("../assets/i18n/en-US.json");

/// Master string table. Built once on first lookup; thereafter
/// every `tr` is a `HashMap` get.
fn table() -> &'static HashMap<&'static str, &'static str> {
    static TABLE: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    TABLE.get_or_init(populate)
}

/// Parse the embedded JSON into the lookup table. Each key/value
/// pair is leaked into `'static` storage so call sites can keep
/// their `&'static str` return contract — the strings live for the
/// program's lifetime regardless of how we source them, and the
/// leak is bounded (one allocation per key, paid once at startup).
///
/// Top-level non-string entries (like the documentation `_comment`
/// field at the top of the JSON) are silently skipped — that lets
/// us annotate the JSON for translators without exposing the
/// notes as lookable keys.
fn populate() -> HashMap<&'static str, &'static str> {
    // Two-stage parse: first to a generic JSON value so we can be
    // forgiving about non-string entries (the `_comment` doc note);
    // then we drain the string-string pairs into the typed map.
    let parsed: serde_json::Value = serde_json::from_str(SOURCE_JSON)
        .expect("i18n: en-US.json must be valid JSON");
    let object = parsed.as_object()
        .expect("i18n: en-US.json must be a JSON object");
    let mut m: HashMap<&'static str, &'static str> = HashMap::new();
    for (k, v) in object {
        // Skip non-string values (translator notes, future schema
        // extensions). Players never look these up.
        let Some(s) = v.as_str() else { continue };
        // Skip explicit doc-only keys. Convention: anything
        // starting with `_` is metadata, not a lookable string.
        if k.starts_with('_') { continue; }
        let key_static: &'static str = Box::leak(k.clone().into_boxed_str());
        let val_static: &'static str = Box::leak(s.to_string().into_boxed_str());
        m.insert(key_static, val_static);
    }
    m
}

/// Look up a static string by key. Returns the raw template — for
/// strings with `{0}`/`{1}` placeholders, route through
/// [`tr_args`] (or the [`crate::tr_fmt!`] macro) to substitute.
pub fn tr(key: &str) -> &'static str {
    if let Some(s) = table().get(key) {
        return s;
    }
    #[cfg(debug_assertions)]
    eprintln!("i18n: missing key `{}`", key);
    MISSING
}

/// Substitute positional arguments into a template fetched from
/// the table. `{0}` is replaced by the first arg's `Display`,
/// `{1}` by the second, and so on. Unmatched placeholders are
/// left as literal text — that surfaces a "missing arg" rather
/// than crashing.
pub fn tr_args(key: &str, args: &[&dyn std::fmt::Display]) -> String {
    let template = tr(key);
    let mut out = template.to_string();
    for (i, arg) in args.iter().enumerate() {
        let placeholder = format!("{{{}}}", i);
        out = out.replace(&placeholder, &arg.to_string());
    }
    out
}

/// Localized `format!` shorthand. Use for any string that would
/// otherwise be a `format!("...", x, y)` call:
///
/// ```ignore
/// add_log(&mut log, tr_fmt!("log.descend.next", level.num), now);
/// ```
///
/// The macro forwards positional args to [`tr_args`] in order.
/// `{0}` in the template = first arg, `{1}` = second, etc.
#[macro_export]
macro_rules! tr_fmt {
    ($key:expr $(,)?) => {
        $crate::i18n::tr($key).to_string()
    };
    ($key:expr, $($arg:expr),+ $(,)?) => {
        $crate::i18n::tr_args($key, &[$(&$arg as &dyn std::fmt::Display),+])
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_json_is_valid() {
        // The build already fails if `include_str!` can't find the
        // file, but a malformed JSON would only blow up the first
        // time `populate()` runs. Nudge it now so the test suite
        // catches schema regressions immediately.
        let parsed: serde_json::Value = serde_json::from_str(SOURCE_JSON)
            .expect("en-US.json must parse");
        assert!(parsed.is_object(), "top level must be an object");
    }

    #[test]
    fn known_key_returns_table_value() {
        // A representative key from each scope to catch wholesale
        // table-init bugs.
        assert_eq!(tr("intro.title"), "ECDYSIUM");
        assert_eq!(tr("pause.title"), "PAUSED");
        assert_eq!(tr("log.death"), "You collapse. The floor welcomes you.");
        assert_eq!(tr("item.medkit.name"), "medical kit");
        assert_eq!(tr("creature.gruboid.name"), "Gruboid");
        assert_eq!(tr("class.engineering.name"), "Engineering");
    }

    #[test]
    fn missing_key_returns_marker() {
        // The contract: missing keys return MISSING, never panic.
        assert_eq!(tr("does.not.exist"), MISSING);
        assert_eq!(tr(""), MISSING);
    }

    #[test]
    fn comment_keys_are_not_lookable() {
        // `_comment` and friends are translator notes baked into
        // the JSON; they MUST NOT be visible through `tr`.
        assert_eq!(tr("_comment"), MISSING);
    }

    #[test]
    fn templating_substitutes_positional_args() {
        let out = tr_args("log.descend.next", &[&3u8]);
        assert_eq!(out, "You descend to level 3.");
        let out = tr_args("log.load.success", &[&"my_save", &2u8]);
        assert_eq!(out, "Loaded `my_save` (level 2).");
    }

    #[test]
    fn templating_with_missing_template_returns_marker() {
        let out = tr_args("nope.nope.nope", &[&42u8]);
        assert!(out.contains("MISSING"), "got: {}", out);
    }

    #[test]
    fn tr_fmt_macro_zero_args_returns_static_text() {
        let out: String = crate::tr_fmt!("intro.title");
        assert_eq!(out, "ECDYSIUM");
    }

    #[test]
    fn tr_fmt_macro_with_args_substitutes() {
        let out: String = crate::tr_fmt!("log.descend.next", 7u8);
        assert_eq!(out, "You descend to level 7.");
    }
}
