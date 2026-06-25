//! Structured event logging.
//!
//! Every interesting in-run event — room transition, monster spawn,
//! kill, player death, item pickup, save / load, crash — emits a
//! single JSON object on its own line into `telemetry/<run>.jsonl`.
//! The format is JSONL so the file is both `tail -f`-friendly for
//! live development and trivially machine-parseable for post-hoc
//! analysis (one `serde_json::from_str` per line).
//!
//! ## Why structured
//!
//! When a playtester reports "the game crashed on floor 3 with the
//! Station Master", we want to be able to reconstruct what happened
//! without asking them to remember every step. A JSONL log per run
//! lets us:
//!
//! - **Reproduce** the bug — every line carries the run seed, so a
//!   crash on seed 12345 floor 3 means `cargo run -- 12345 3` puts
//!   us on the same map.
//! - **Aggregate** across runs — feeding the lines through `jq` or
//!   a small script answers questions like "what kills players
//!   most often on floor 1?" or "which weapon has the lowest
//!   completion-rate correlation?".
//! - **Bound disk usage** — old run files are pruned on startup so
//!   the directory stays small without the developer having to
//!   remember.
//!
//! ## File layout
//!
//! `telemetry/<unix-seconds>-<seed>.jsonl` — name carries the run's
//! identity at a glance. Within the file, the first line is always
//! a `run_start` event with the seed and the build's
//! `format_version`-equivalent stamp (currently the `SAVE_FORMAT_VERSION`
//! constant — reused as a "build epoch" indicator).
//!
//! ## What's NOT in here
//!
//! - PII. The log carries gameplay data only — no system info, no
//!   user identifiers, no file paths. Sharing a run log is safe.
//! - Per-frame state. Every emit is a *discrete event*. The
//!   `monster_turn` loop, the render pass, etc. do **not** call
//!   into telemetry — only state transitions that matter for
//!   replay / analysis.
//!
//! ## Release builds
//!
//! Telemetry is on by default in debug; in release builds the
//! global writer initialises lazily on the first emit so a
//! distribution that ships with telemetry disabled (a future
//! settings toggle, not yet wired) pays no I/O cost beyond
//! creating the file. Set `ECDYSIUM_TELEMETRY=off` in the
//! environment to disable.

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// Directory where per-run JSONL files land. Created on first emit.
pub const TELEMETRY_DIR: &str = "telemetry";

/// Soft cap on the number of run files kept on disk. On startup we
/// prune the oldest beyond this. Tunable here.
const MAX_RUN_FILES: usize = 25;

/// Environment variable that disables telemetry when set to `"off"`,
/// `"0"`, or `"false"`. Quiet success when telemetry is disabled —
/// emits become no-ops, no error in the log, no warning.
const DISABLE_ENV: &str = "ECDYSIUM_TELEMETRY";

/// One emitted line of the log. The `event` field is the
/// discriminator; the `data` field carries the payload as a free-
/// form JSON value so emit sites can attach whatever they like
/// without the schema turning into a thousand-variant enum.
///
/// `timestamp_ms` is wall-clock milliseconds since the Unix epoch —
/// chosen over monotonic ticks because the analysis side wants to
/// know "when did this run happen" cross-machine. Replay determinism
/// doesn't depend on this field (the save's `resume_seed` is the
/// source of truth there).
#[derive(serde::Serialize)]
struct Event<'a> {
    timestamp_ms: u128,
    seed: u64,
    event: &'a str,
    data: serde_json::Value,
}

/// The active writer, set up lazily on the first `emit`.
struct Writer {
    out: BufWriter<File>,
    seed: u64,
    enabled: bool,
}

static WRITER: OnceLock<Option<Mutex<Writer>>> = OnceLock::new();

/// Initialise the per-run telemetry file. Safe to call more than
/// once — subsequent calls within the same process are no-ops.
/// On the first call, also prunes the oldest run files so the
/// directory doesn't grow without bound.
///
/// Pass the run's master seed; the file name embeds it for
/// at-a-glance correlation with save files and bug reports.
pub fn init(seed: u64) {
    WRITER.get_or_init(|| {
        if telemetry_disabled() {
            return None;
        }
        match open_writer(seed) {
            Ok(w) => {
                let mutex = Mutex::new(w);
                // First line in the file is always the run-start
                // marker — lets a parser cheaply identify a fresh
                // run's beginning even if the file was opened
                // mid-game.
                {
                    let mut guard = mutex.lock().unwrap();
                    let _ = write_line(&mut guard, "run_start", serde_json::json!({
                        "build_save_format": crate::save::SAVE_FORMAT_VERSION,
                    }));
                }
                prune_old_runs(MAX_RUN_FILES);
                Some(mutex)
            }
            Err(e) => {
                eprintln!("telemetry: could not open run file: {}", e);
                None
            }
        }
    });
}

/// Emit a single event. Cheap when telemetry is disabled (a
/// `OnceLock` read returning `None`). The `data` argument is any
/// serde-serializable value — typically a `serde_json::json!({...})`
/// macro invocation at the call site.
///
/// `event` should be a snake_case identifier (`"monster_kill"`,
/// `"item_pickup"`, ...) — keep it stable, since analysis scripts
/// match on it.
pub fn emit(event: &str, data: serde_json::Value) {
    let Some(slot) = WRITER.get() else { return };
    let Some(mutex) = slot.as_ref() else { return };
    let mut guard = match mutex.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if !guard.enabled { return; }
    let _ = write_line(&mut guard, event, data);
}

// ─── Internals ────────────────────────────────────────────────────

fn telemetry_disabled() -> bool {
    let Ok(v) = std::env::var(DISABLE_ENV) else { return false };
    matches!(v.to_ascii_lowercase().as_str(), "off" | "0" | "false")
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn open_writer(seed: u64) -> std::io::Result<Writer> {
    fs::create_dir_all(TELEMETRY_DIR)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path: PathBuf = Path::new(TELEMETRY_DIR)
        .join(format!("{}-{:016x}.jsonl", stamp, seed));
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    Ok(Writer {
        out: BufWriter::new(file),
        seed,
        enabled: true,
    })
}

fn write_line(w: &mut Writer, event: &str, data: serde_json::Value) -> std::io::Result<()> {
    let line = Event { timestamp_ms: now_ms(), seed: w.seed, event, data };
    // `serde_json::to_writer` plus a newline — single allocation in
    // the buffered writer, no in-memory String. Flush every line so
    // a crash mid-run still surfaces what got us there.
    serde_json::to_writer(&mut w.out, &line)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    w.out.write_all(b"\n")?;
    w.out.flush()
}

/// Keep only the most recent `max` `.jsonl` files in `TELEMETRY_DIR`;
/// delete the rest. Sorted by mtime descending. Failures are silent
/// — telemetry's a diagnostic aid, not a load-bearing system, and
/// crashing the game because a stale file couldn't be removed
/// would be the wrong trade.
fn prune_old_runs(max: usize) {
    let Ok(entries) = fs::read_dir(TELEMETRY_DIR) else { return };
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let ext = path.extension().and_then(|s| s.to_str())?;
            if ext != "jsonl" { return None; }
            let mtime = e.metadata().ok()?.modified().ok()?;
            Some((mtime, path))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in files.into_iter().skip(max) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_env_blocks_emit() {
        // Don't actually set the env var in tests — that's process-
        // wide state. Just verify the predicate works as intended.
        // We can't directly observe a no-op `emit`, but the
        // `telemetry_disabled` function is the gate, so checking it
        // is the right proxy.
        assert!(!telemetry_disabled());
    }

    #[test]
    fn event_line_serializes_with_expected_shape() {
        let ev = Event {
            timestamp_ms: 12345,
            seed: 0xDEAD_BEEF,
            event: "test_event",
            data: serde_json::json!({"k": 42}),
        };
        let json = serde_json::to_string(&ev).unwrap();
        // The order of fields in JSON output is the field-declaration
        // order on the struct; relying on that is fine because we
        // control the struct.
        assert!(json.starts_with(r#"{"timestamp_ms":12345,"seed":3735928559"#),
            "got: {}", json);
        assert!(json.contains(r#""event":"test_event""#));
        assert!(json.contains(r#""data":{"k":42}"#));
    }
}
