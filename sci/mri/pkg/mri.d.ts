/* tslint:disable */
/* eslint-disable */

/**
 * A scanner the page can drive: an object, a matrix, a field of view, and a
 * trajectory through k-space.
 */
export class Imager {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Run an acquisition. `traj`: 0 spin-warp, 1 EPI, 2 radial.
     */
    acquire(traj: number, dwell_us: number, t2star_ms: number, off_res_hz: number, undersample: number): void;
    /**
     * Intensity centroid of an image, in pixels from the centre: `[x, y]`.
     */
    centroid(img: Float32Array): Float64Array;
    /**
     * Reconstruct everything acquired.
     */
    image(): Float32Array;
    /**
     * Reconstruct with parts of k-space deleted — the paintbrush.
     */
    image_masked(mask: Uint8Array): Float32Array;
    /**
     * Reconstruct from the first `frac` of the acquisition, in the order the
     * trajectory actually visits k-space.
     */
    image_progress(frac: number): Float32Array;
    /**
     * k-space magnitude, log-compressed to 0…1 for display — raw k-space has
     * a dynamic range no screen can show.
     */
    k_display(): Float32Array;
    k_max_per_cm(): number;
    /**
     * `n` must be a power of two. `fov_cm` is the field of view and
     * `object_cm` the radius the phantom's unit disc maps to.
     */
    constructor(n: number, fov_cm: number, object_cm: number, classic: boolean);
    /**
     * Acquisition order per k-space sample, `-1` where never acquired.
     */
    order(): Int32Array;
    pixel_mm(): number;
    /**
     * Seconds this acquisition would take. `tr_ms` is the repetition time for
     * the sequences that need one per line.
     */
    seconds(traj: number, dwell_us: number, undersample: number, tr_ms: number): number;
    /**
     * The object as it really is — what the reconstruction is trying to be.
     */
    truth(): Float32Array;
}

/**
 * A receive coil built from circular loops. Lengths in metres; `B₀` is along
 * `+z`, so a loop whose normal is `+z` faces down the bore.
 */
export class RxCoil {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a loop of `radius` at `(cx, cy, cz)` with plane normal `(nx, ny, nz)`.
     */
    add_loop(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, radius: number): void;
    clear(): void;
    /**
     * Full field vector at a point, `[Bx, By, Bz]` in µT per amp — so the page
     * can show *why* a sensitivity is low: strong field, wrong direction.
     */
    field_at(x: number, y: number, z: number): Float64Array;
    constructor();
    /**
     * The loop's wire path, projected into the y = 0 plane as `[x, z, …]` in
     * metres, for drawing the coil over its own sensitivity map.
     */
    outline_xz(): Float32Array;
    /**
     * Receive sensitivity |B₁⁻| at a point, in µT per amp.
     */
    sensitivity_at(x: number, y: number, z: number): number;
    /**
     * Sensitivity over a grid in the y = 0 plane (the plane containing B₀),
     * row-major, `nz` rows of `nx`, in µT per amp.
     */
    sensitivity_map(x0: number, x1: number, z0: number, z1: number, nx: number, nz: number): Float32Array;
}

/**
 * A scanner whose phantom is made of the measured tissues, imaged through the
 * same encoding and reconstruction as part two.
 */
export class TissueImager {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Re-weight every region by what its tissue does under this sequence, then
     * acquire and reconstruct. The image is a real reconstruction, not a
     * colouring-in of the truth map.
     */
    image(kind: number, tr_ms: number, te_ms: number, ti_ms: number, flip_deg: number): Float32Array;
    /**
     * A map of which tissue is where, for the legend: the tissue index at each
     * pixel, or −1 outside the phantom.
     */
    label_map(): Int32Array;
    constructor(n: number, fov_cm: number, object_cm: number);
}

/**
 * The loudest line in that spectrum, hertz.
 */
export function acoustic_peak_hz(amp_mt_per_m: number, ramp_us: number, flat_us: number, sample_rate: number, n: number, resonance_hz: number, q: number): number;

/**
 * Magnitude spectrum of the radiated sound, normalised to its own peak.
 * Bin `i` is `i · sample_rate / n` hertz.
 */
export function acoustic_spectrum(amp_mt_per_m: number, ramp_us: number, flat_us: number, sample_rate: number, n: number, resonance_hz: number, q: number): Float32Array;

/**
 * What the coil radiates: `d²G/dt²` put through one damped mechanical
 * resonance, normalised to ±1 so it can be handed straight to Web Audio.
 *
 * The timing is physics; the resonance is a model. See `acoustics.rs`.
 */
export function acoustic_waveform(amp_mt_per_m: number, ramp_us: number, flat_us: number, sample_rate: number, n: number, resonance_hz: number, q: number): Float32Array;

/**
 * The signal-optimal loop radius for a target depth, `√2 · z`.
 */
export function best_radius(depth_m: number): number;

/**
 * |contrast| between two tissues over a log-spaced TR × TE grid, row-major
 * (`nte` rows of `ntr`). The landscape a radiographer is choosing a point on.
 */
export function contrast_map(i: number, j: number, tr_lo_ms: number, tr_hi_ms: number, te_lo_ms: number, te_hi_ms: number, ntr: number, nte: number, signed: boolean): Float32Array;

/**
 * How many times more acoustic energy `a` decibels is than `b`.
 */
export function db_energy_ratio(a: number, b: number): number;

/**
 * The predicted EPI geometric shift, in pixels: `Δf · N · echo-spacing / R`.
 */
export function epi_shift_px(off_res_hz: number, n: number, dwell_us: number, undersample: number): number;

/**
 * The Ernst angle in degrees: `cos α = e^(−TR/T₁)`.
 */
export function ernst_angle_deg(tr_ms: number, t1_ms: number): number;

/**
 * Free-induction decay after a 90° pulse — interleaved `[re, im, …]` in the
 * rotating frame (i.e. after the receiver's mixer).
 */
export function fid(t1: number, t2: number, spread_hz: number, dt: number, steps: number, n_iso: number): Float32Array;

/**
 * Lorentz force on a gradient winding: `[N/m, kgf/m]`.
 */
export function gradient_force(current_a: number, b0_t: number): Float64Array;

/**
 * The gradient waveform of an EPI readout train, in mT/m, sampled at `dt`.
 */
export function gradient_waveform(amp_mt_per_m: number, ramp_us: number, flat_us: number, dt_us: number, n: number): Float32Array;

/**
 * Proton Larmor frequency in MHz.
 */
export function larmor_mhz(b0: number): number;

/**
 * Free-space wavelength at the Larmor frequency, in metres.
 */
export function larmor_wavelength_m(b0: number): number;

/**
 * k-space width one readout lobe traverses, in cycles per metre — the join to
 * part two: `Δk_total = γ̄ · ∫G dt`.
 */
export function lobe_k_extent(amp_mt_per_m: number, ramp_us: number, flat_us: number): number;

/**
 * On-axis field of a circular loop, µT per amp — the closed form the solver is
 * checked against, exposed so the page can plot both.
 */
export function loop_axis_field_ut(radius_m: number, z_m: number): number;

/**
 * The inversion time that nulls a T₁, in ms.
 */
export function null_time_ms(t1_ms: number, tr_ms: number): number;

/**
 * Thermal spin polarisation in parts per million, at body temperature.
 */
export function polarization_ppm(b0: number): number;

/**
 * Induction-detected signal relative to 1.5 T — the B₀² law.
 */
export function relative_faraday_emf(b0: number): number;

/**
 * How far image `b` has slid along y relative to `a`, in pixels, by circular
 * cross-correlation — the measurement that survives the image wrapping around
 * the field of view, which is what large off-resonance actually does.
 */
export function shift_px(a: Float32Array, b: Float32Array, n: number): number;

/**
 * Signal from an arbitrary `(T1, T2)` — for drawing the response of a tissue
 * the table does not contain.
 */
export function signal_for(t1_ms: number, t2_ms: number, kind: number, tr_ms: number, te_ms: number, ti_ms: number, flip_deg: number): number;

/**
 * Slew rate of a lobe, T/m/s.
 */
export function slew_rate(amp_mt_per_m: number, ramp_us: number): number;

/**
 * Hahn spin echo: 90°, τ, 180°, and the echo at 2τ.
 */
export function spin_echo(t1: number, t2: number, spread_hz: number, tau: number, dt: number, steps: number, n_iso: number): Float32Array;

/**
 * How many tissues the measured table carries.
 */
export function tissue_count(): number;

export function tissue_name(i: number): string;

/**
 * `[T1, T2, T1 sd, T2 sd]` in milliseconds, straight from Stanisz 2005 Table 1.
 */
export function tissue_relaxation_ms(i: number): Float64Array;

/**
 * Signal from tissue `i` under a sequence. `kind`: 0 spin echo,
 * 1 inversion recovery, 2 spoiled gradient echo.
 */
export function tissue_signal(i: number, kind: number, tr_ms: number, te_ms: number, ti_ms: number, flip_deg: number): number;

/**
 * The TR at which two tissues become indistinguishable at this TE, in ms.
 * Negative if there is no such TR — at long TE, T₂ wins everywhere.
 */
export function zero_contrast_tr_ms(i: number, j: number, te_ms: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_imager_free: (a: number, b: number) => void;
    readonly __wbg_rxcoil_free: (a: number, b: number) => void;
    readonly acoustic_peak_hz: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly acoustic_spectrum: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly acoustic_waveform: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly best_radius: (a: number) => number;
    readonly contrast_map: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly db_energy_ratio: (a: number, b: number) => number;
    readonly epi_shift_px: (a: number, b: number, c: number, d: number) => number;
    readonly ernst_angle_deg: (a: number, b: number) => number;
    readonly fid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly gradient_force: (a: number, b: number, c: number) => void;
    readonly gradient_waveform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly imager_acquire: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly imager_centroid: (a: number, b: number, c: number, d: number) => void;
    readonly imager_image: (a: number, b: number) => void;
    readonly imager_image_masked: (a: number, b: number, c: number, d: number) => void;
    readonly imager_image_progress: (a: number, b: number, c: number) => void;
    readonly imager_k_display: (a: number, b: number) => void;
    readonly imager_k_max_per_cm: (a: number) => number;
    readonly imager_new: (a: number, b: number, c: number, d: number) => number;
    readonly imager_order: (a: number, b: number) => void;
    readonly imager_pixel_mm: (a: number) => number;
    readonly imager_seconds: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly imager_truth: (a: number, b: number) => void;
    readonly larmor_mhz: (a: number) => number;
    readonly larmor_wavelength_m: (a: number) => number;
    readonly lobe_k_extent: (a: number, b: number, c: number) => number;
    readonly loop_axis_field_ut: (a: number, b: number) => number;
    readonly null_time_ms: (a: number, b: number) => number;
    readonly polarization_ppm: (a: number) => number;
    readonly rxcoil_add_loop: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly rxcoil_clear: (a: number) => void;
    readonly rxcoil_field_at: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rxcoil_new: () => number;
    readonly rxcoil_outline_xz: (a: number, b: number) => void;
    readonly rxcoil_sensitivity_at: (a: number, b: number, c: number, d: number) => number;
    readonly rxcoil_sensitivity_map: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly shift_px: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly signal_for: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly slew_rate: (a: number, b: number) => number;
    readonly spin_echo: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly tissue_count: () => number;
    readonly tissue_name: (a: number, b: number) => void;
    readonly tissue_relaxation_ms: (a: number, b: number) => void;
    readonly tissue_signal: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly tissueimager_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly tissueimager_label_map: (a: number, b: number) => void;
    readonly tissueimager_new: (a: number, b: number, c: number) => number;
    readonly zero_contrast_tr_ms: (a: number, b: number, c: number) => number;
    readonly relative_faraday_emf: (a: number) => number;
    readonly __wbg_tissueimager_free: (a: number, b: number) => void;
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
