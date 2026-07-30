//! Browser-facing shell. Everything real lives in `model`; this file only
//! marshals it across the wasm boundary. Arrays cross as flat `Float64Array`s
//! (zero-copy views into linear memory on the JS side) and structured results
//! cross as JSON strings — no serde, no dependency beyond wasm-bindgen.

use crate::model::{
    pearson, probe, round2, snapshot, table2_tests, Model, Params, Recording, GRAMMAR, KEYS,
    LABELS,
};
use wasm_bindgen::prelude::*;

/// A live reservoir the page can drive one timestep at a time.
#[wasm_bindgen]
pub struct Reservoir {
    m: Model,
    rec: Recording,
    /// Rolling log of which token was presented on each recorded timestep.
    /// Kept in lockstep with `rec`.
    steps: usize,
    /// Snapshot taken when training is frozen, so probes can rewind to it.
    end: Option<(Vec<f64>, Vec<f64>, Vec<f64>)>,
}

#[wasm_bindgen]
impl Reservoir {
    /// Build a reservoir. Pass 0 for any parameter to take the paper's value.
    #[wasm_bindgen(constructor)]
    pub fn new(
        seed: f64,
        nnodes: usize,
        p_link: f64,
        leak: f64,
        lrate_wmat: f64,
        lrate_targ: f64,
    ) -> Reservoir {
        let d = Params::default();
        let p = Params {
            nnodes: if nnodes == 0 { d.nnodes } else { nnodes },
            p_link: if p_link <= 0.0 { d.p_link } else { p_link },
            leak: if leak < 0.0 { d.leak } else { leak },
            lrate_wmat: if lrate_wmat < 0.0 { d.lrate_wmat } else { lrate_wmat },
            lrate_targ: if lrate_targ < 0.0 { d.lrate_targ } else { lrate_targ },
            ..d
        };
        Reservoir {
            m: Model::new(p, seed as u64),
            rec: Recording::empty(),
            steps: 0,
            end: None,
        }
    }

    /// Present one grammatical token and learn from it. Returns the token index.
    pub fn advance(&mut self) -> usize {
        let key = self.m.advance();
        self.steps += 1;
        self.rec.push_from(&self.m, key);
        key
    }

    /// Run `n` timesteps without recording every one — for fast-forwarding
    /// through training. Only the last `keep` timesteps are retained.
    pub fn train(&mut self, timesteps: usize, keep: usize) {
        let start_discard = timesteps.saturating_sub(keep);
        for i in 0..timesteps {
            let key = self.m.advance();
            self.steps += 1;
            if i >= start_discard {
                self.rec.push_from(&self.m, key);
            }
        }
        self.rec.truncate_to_last(keep);
    }

    /// Trim the rolling record to its last `keep` timesteps.
    pub fn keep_last(&mut self, keep: usize) {
        self.rec.truncate_to_last(keep);
    }

    /// Present a specific token out of grammatical order.
    pub fn present(&mut self, key: usize, learn: bool, record: bool) {
        self.m.present_key(key, learn);
        self.m.key = key;
        self.steps += 1;
        if record {
            self.rec.push_from(&self.m, key);
        }
    }

    /// Present silence — the manoeuvre the paper turns on.
    pub fn present_silence(&mut self, learn: bool) {
        self.m.present_silence(learn);
        self.steps += 1;
    }

    /// Freeze the current weights and state so probes can rewind here.
    pub fn snapshot(&mut self) {
        self.end = Some(snapshot(&self.m));
    }

    /// Restore weights and state to the last `snapshot()`. Lets the page drive
    /// an arbitrary token sequence from a fixed starting point and compare
    /// conditions fairly. Targets are deliberately left alone, matching the
    /// reference implementation's probe procedure.
    pub fn rewind(&mut self) -> bool {
        let Some((w, a, s)) = self.end.clone() else {
            return false;
        };
        self.m.wmat.copy_from_slice(&w);
        self.m.acts.copy_from_slice(&a);
        self.m.spikes.copy_from_slice(&s);
        true
    }

    pub fn has_snapshot(&self) -> bool {
        self.end.is_some()
    }

    // ---------------------------------------------------------------- readers

    pub fn steps(&self) -> usize {
        self.steps
    }

    pub fn nnodes(&self) -> usize {
        self.m.p.nnodes
    }

    /// Current spike vector, as 0.0/1.0.
    pub fn spikes(&self) -> Vec<f64> {
        self.m.spikes.clone()
    }

    pub fn activations(&self) -> Vec<f64> {
        self.m.acts.clone()
    }

    pub fn targets(&self) -> Vec<f64> {
        self.m.targets.clone()
    }

    pub fn mean_error(&self) -> f64 {
        self.m.mean_error()
    }

    pub fn mean_abs_error(&self) -> f64 {
        self.m.mean_abs_error()
    }

    pub fn mean_activation(&self) -> f64 {
        self.m.mean_activation()
    }

    pub fn spike_count(&self) -> usize {
        self.m.spike_count()
    }

    pub fn current_key(&self) -> usize {
        self.m.key
    }

    /// The recorded spike history, flattened row-major as `[timestep][node]`.
    pub fn history_spikes(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.rec.spikes.len() * self.m.p.nnodes);
        for row in &self.rec.spikes {
            out.extend_from_slice(row);
        }
        out
    }

    /// Token index for each recorded timestep.
    pub fn history_stream(&self) -> Vec<usize> {
        self.rec.stream.clone()
    }

    pub fn history_mean_errors(&self) -> Vec<f64> {
        self.rec.mean_errors.clone()
    }

    pub fn history_mean_acts(&self) -> Vec<f64> {
        self.rec.mean_acts.clone()
    }

    /// Mean and standard deviation of mean-activation over the recorded tail —
    /// the band an "unexpected" input has to exceed to count as surprise.
    pub fn baseline_activation(&self) -> Vec<f64> {
        let xs = &self.rec.mean_acts;
        if xs.is_empty() {
            return vec![f64::NAN, f64::NAN];
        }
        let n = xs.len() as f64;
        let mean = xs.iter().sum::<f64>() / n;
        let var = xs.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / n;
        vec![mean, var.sqrt()]
    }

    pub fn history_spike_counts(&self) -> Vec<usize> {
        self.rec.spike_counts.clone()
    }

    pub fn history_len(&self) -> usize {
        self.rec.spikes.len()
    }

    // ---------------------------------------------------------------- analysis

    /// Correlation of an arbitrary pattern against the recorded instances of
    /// each of the seven tokens. Seven values, NaN where a token never
    /// occurred in the record.
    pub fn correlate_with_codes(&self, pattern: &[f64]) -> Vec<f64> {
        (0..7)
            .map(|k| self.rec.mean_corr_with(k, pattern).unwrap_or(f64::NAN))
            .collect()
    }

    /// Correlate the *current* spike vector against the seven token codes.
    pub fn correlate_current(&self) -> Vec<f64> {
        let cur = self.m.spikes.clone();
        self.correlate_with_codes(&cur)
    }

    /// Mean pairwise correlation among instances of each token — how sharp the
    /// emergent population codes are. Seven values.
    pub fn population_codes(&self) -> Vec<f64> {
        (0..7)
            .map(|k| self.rec.population_code_strength(k).unwrap_or(f64::NAN))
            .collect()
    }

    /// The autocorrelation matrix over the last `n` recorded timesteps,
    /// flattened row-major (`n × n`). This is the paper's Fig. 10.
    pub fn autocorrelation(&self, n: usize) -> Vec<f64> {
        let len = self.rec.spikes.len();
        let start = len.saturating_sub(n);
        let rows = &self.rec.spikes[start..];
        let k = rows.len();
        let mut out = vec![f64::NAN; k * k];
        for i in 0..k {
            for j in 0..k {
                out[i * k + j] = pearson(&rows[i], &rows[j]).map(round2).unwrap_or(f64::NAN);
            }
        }
        out
    }

    /// Token labels for the last `n` recorded timesteps, tab-separated.
    pub fn recent_labels(&self, n: usize) -> String {
        let len = self.rec.stream.len();
        let start = len.saturating_sub(n);
        self.rec.stream[start..]
            .iter()
            .map(|&k| LABELS[k])
            .collect::<Vec<_>>()
            .join("\t")
    }

    /// Run one fading-memory probe against the frozen snapshot: present
    /// `first` (and `second`, if >= 0), then cut the input off. Returns the
    /// resulting spike pattern's correlation with each token code, as seven
    /// values. Call `snapshot()` first.
    pub fn probe_row(&mut self, first: usize, second: i32) -> Vec<f64> {
        let Some(end) = self.end.clone() else {
            return vec![f64::NAN; 7];
        };
        let test = crate::model::FadingMemoryTest {
            first,
            second: if second < 0 { None } else { Some(second as usize) },
        };
        let pattern = probe(&mut self.m, &test, &end);
        self.correlate_with_codes(&pattern)
    }

    /// The spike pattern a probe produces, for plotting alongside the raster.
    pub fn probe_pattern(&mut self, first: usize, second: i32) -> Vec<f64> {
        let Some(end) = self.end.clone() else {
            return vec![0.0; self.m.p.nnodes];
        };
        let test = crate::model::FadingMemoryTest {
            first,
            second: if second < 0 { None } else { Some(second as usize) },
        };
        probe(&mut self.m, &test, &end)
    }

    /// All six rows of Table 2 for this single trained network, flattened
    /// row-major (6 × 7).
    pub fn table2(&mut self) -> Vec<f64> {
        let mut out = Vec::with_capacity(42);
        for test in table2_tests() {
            let second = test.second.map(|s| s as i32).unwrap_or(-1);
            out.extend(self.probe_row(test.first, second));
        }
        out
    }
}

// ------------------------------------------------------------------ statics

/// The seven token keys, tab-separated.
#[wasm_bindgen]
pub fn token_keys() -> String {
    KEYS.join("\t")
}

/// The seven display labels, tab-separated.
#[wasm_bindgen]
pub fn token_labels() -> String {
    LABELS.join("\t")
}

/// The grammar's transition matrix, flattened row-major (7 × 7).
#[wasm_bindgen]
pub fn grammar() -> Vec<f64> {
    GRAMMAR.iter().flat_map(|r| r.iter().copied()).collect()
}

/// The six Table 2 probes as `first,second` index pairs, flattened. `second`
/// is -1 for the one-token probes.
#[wasm_bindgen]
pub fn table2_probes() -> Vec<i32> {
    table2_tests()
        .into_iter()
        .flat_map(|t| [t.first as i32, t.second.map(|s| s as i32).unwrap_or(-1)])
        .collect()
}

/// Mean activation along a token sequence, averaged over `runs` independently
/// trained networks — the paper's §5.5 surprise test. Returns, flattened:
/// `[baseline_mean, baseline_sd, act…(len), spikes…(len)]`.
#[wasm_bindgen]
pub fn surprise_profile(
    seq: &[u32],
    runs: usize,
    seed_base: f64,
    loops: usize,
    nnodes: usize,
) -> Vec<f64> {
    let d = Params::default();
    let p = Params {
        nnodes: if nnodes == 0 { d.nnodes } else { nnodes },
        ..d
    };
    let keys: Vec<usize> = seq.iter().map(|&k| (k as usize).min(6)).collect();
    let r = crate::model::surprise_profile(p, &keys, runs, seed_base as u64, loops);
    let mut out = vec![r.baseline_mean, r.baseline_sd];
    out.extend(r.acts);
    out.extend(r.spikes);
    out
}

/// Run `runs` independent networks to completion and return the grand-average
/// Table 2, flattened row-major (6 × 7). This is the paper's §5.4 in one call —
/// at 500 runs it is a long job even in wasm, so the page runs it in batches.
#[wasm_bindgen]
pub fn replicate(runs: usize, seed_base: f64, loops: usize, nnodes: usize) -> Vec<f64> {
    let d = Params::default();
    let p = Params {
        nnodes: if nnodes == 0 { d.nnodes } else { nnodes },
        ..d
    };
    let mut sums = vec![0.0f64; 42];
    let mut counts = vec![0usize; 42];
    for r in 0..runs {
        let res = crate::model::run_once(p, seed_base as u64 ^ r as u64, loops, 100);
        for (t, row) in res.corr.iter().enumerate() {
            for k in 0..7 {
                if row[k].is_finite() {
                    sums[t * 7 + k] += row[k];
                    counts[t * 7 + k] += 1;
                }
            }
        }
    }
    for i in 0..42 {
        sums[i] = if counts[i] > 0 {
            sums[i] / counts[i] as f64
        } else {
            f64::NAN
        };
    }
    sums
}
