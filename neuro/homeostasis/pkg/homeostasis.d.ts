/* tslint:disable */
/* eslint-disable */

/**
 * A live reservoir the page can drive one timestep at a time.
 */
export class Reservoir {
    free(): void;
    [Symbol.dispose](): void;
    activations(): Float64Array;
    /**
     * Present one grammatical token and learn from it. Returns the token index.
     */
    advance(): number;
    /**
     * The autocorrelation matrix over the last `n` recorded timesteps,
     * flattened row-major (`n × n`). This is the paper's Fig. 10.
     */
    autocorrelation(n: number): Float64Array;
    /**
     * Mean and standard deviation of mean-activation over the recorded tail —
     * the band an "unexpected" input has to exceed to count as surprise.
     */
    baseline_activation(): Float64Array;
    /**
     * Correlate the *current* spike vector against the seven token codes.
     */
    correlate_current(): Float64Array;
    /**
     * Correlation of an arbitrary pattern against the recorded instances of
     * each of the seven tokens. Seven values, NaN where a token never
     * occurred in the record.
     */
    correlate_with_codes(pattern: Float64Array): Float64Array;
    current_key(): number;
    has_snapshot(): boolean;
    history_len(): number;
    history_mean_acts(): Float64Array;
    history_mean_errors(): Float64Array;
    history_spike_counts(): Uint32Array;
    /**
     * The recorded spike history, flattened row-major as `[timestep][node]`.
     */
    history_spikes(): Float64Array;
    /**
     * Token index for each recorded timestep.
     */
    history_stream(): Uint32Array;
    /**
     * Trim the rolling record to its last `keep` timesteps.
     */
    keep_last(keep: number): void;
    mean_abs_error(): number;
    mean_activation(): number;
    mean_error(): number;
    /**
     * Build a reservoir. Pass 0 for any parameter to take the paper's value.
     */
    constructor(seed: number, nnodes: number, p_link: number, leak: number, lrate_wmat: number, lrate_targ: number);
    nnodes(): number;
    /**
     * Mean pairwise correlation among instances of each token — how sharp the
     * emergent population codes are. Seven values.
     */
    population_codes(): Float64Array;
    /**
     * Present a specific token out of grammatical order.
     */
    present(key: number, learn: boolean, record: boolean): void;
    /**
     * Present silence — the manoeuvre the paper turns on.
     */
    present_silence(learn: boolean): void;
    /**
     * The spike pattern a probe produces, for plotting alongside the raster.
     */
    probe_pattern(first: number, second: number): Float64Array;
    /**
     * Run one fading-memory probe against the frozen snapshot: present
     * `first` (and `second`, if >= 0), then cut the input off. Returns the
     * resulting spike pattern's correlation with each token code, as seven
     * values. Call `snapshot()` first.
     */
    probe_row(first: number, second: number): Float64Array;
    /**
     * Token labels for the last `n` recorded timesteps, tab-separated.
     */
    recent_labels(n: number): string;
    /**
     * Restore weights and state to the last `snapshot()`. Lets the page drive
     * an arbitrary token sequence from a fixed starting point and compare
     * conditions fairly. Targets are deliberately left alone, matching the
     * reference implementation's probe procedure.
     */
    rewind(): boolean;
    /**
     * Freeze the current weights and state so probes can rewind here.
     */
    snapshot(): void;
    spike_count(): number;
    /**
     * Current spike vector, as 0.0/1.0.
     */
    spikes(): Float64Array;
    steps(): number;
    /**
     * All six rows of Table 2 for this single trained network, flattened
     * row-major (6 × 7).
     */
    table2(): Float64Array;
    targets(): Float64Array;
    /**
     * Run `n` timesteps without recording every one — for fast-forwarding
     * through training. Only the last `keep` timesteps are retained.
     */
    train(timesteps: number, keep: number): void;
}

/**
 * The grammar's transition matrix, flattened row-major (7 × 7).
 */
export function grammar(): Float64Array;

/**
 * Run `runs` independent networks to completion and return the grand-average
 * Table 2, flattened row-major (6 × 7). This is the paper's §5.4 in one call —
 * at 500 runs it is a long job even in wasm, so the page runs it in batches.
 */
export function replicate(runs: number, seed_base: number, loops: number, nnodes: number): Float64Array;

/**
 * Mean activation along a token sequence, averaged over `runs` independently
 * trained networks — the paper's §5.5 surprise test. Returns, flattened:
 * `[baseline_mean, baseline_sd, act…(len), spikes…(len)]`.
 */
export function surprise_profile(seq: Uint32Array, runs: number, seed_base: number, loops: number, nnodes: number): Float64Array;

/**
 * The six Table 2 probes as `first,second` index pairs, flattened. `second`
 * is -1 for the one-token probes.
 */
export function table2_probes(): Int32Array;

/**
 * The seven token keys, tab-separated.
 */
export function token_keys(): string;

/**
 * The seven display labels, tab-separated.
 */
export function token_labels(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_reservoir_free: (a: number, b: number) => void;
    readonly grammar: (a: number) => void;
    readonly replicate: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly reservoir_activations: (a: number, b: number) => void;
    readonly reservoir_advance: (a: number) => number;
    readonly reservoir_autocorrelation: (a: number, b: number, c: number) => void;
    readonly reservoir_baseline_activation: (a: number, b: number) => void;
    readonly reservoir_correlate_current: (a: number, b: number) => void;
    readonly reservoir_correlate_with_codes: (a: number, b: number, c: number, d: number) => void;
    readonly reservoir_current_key: (a: number) => number;
    readonly reservoir_has_snapshot: (a: number) => number;
    readonly reservoir_history_len: (a: number) => number;
    readonly reservoir_history_mean_acts: (a: number, b: number) => void;
    readonly reservoir_history_mean_errors: (a: number, b: number) => void;
    readonly reservoir_history_spike_counts: (a: number, b: number) => void;
    readonly reservoir_history_spikes: (a: number, b: number) => void;
    readonly reservoir_history_stream: (a: number, b: number) => void;
    readonly reservoir_keep_last: (a: number, b: number) => void;
    readonly reservoir_mean_abs_error: (a: number) => number;
    readonly reservoir_mean_activation: (a: number) => number;
    readonly reservoir_mean_error: (a: number) => number;
    readonly reservoir_new: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly reservoir_nnodes: (a: number) => number;
    readonly reservoir_population_codes: (a: number, b: number) => void;
    readonly reservoir_present: (a: number, b: number, c: number, d: number) => void;
    readonly reservoir_present_silence: (a: number, b: number) => void;
    readonly reservoir_probe_pattern: (a: number, b: number, c: number, d: number) => void;
    readonly reservoir_probe_row: (a: number, b: number, c: number, d: number) => void;
    readonly reservoir_recent_labels: (a: number, b: number, c: number) => void;
    readonly reservoir_rewind: (a: number) => number;
    readonly reservoir_snapshot: (a: number) => void;
    readonly reservoir_spike_count: (a: number) => number;
    readonly reservoir_spikes: (a: number, b: number) => void;
    readonly reservoir_steps: (a: number) => number;
    readonly reservoir_table2: (a: number, b: number) => void;
    readonly reservoir_targets: (a: number, b: number) => void;
    readonly reservoir_train: (a: number, b: number, c: number) => void;
    readonly surprise_profile: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly table2_probes: (a: number) => void;
    readonly token_keys: (a: number) => void;
    readonly token_labels: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
