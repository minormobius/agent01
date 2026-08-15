/* tslint:disable */
/* eslint-disable */

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
 * The signal-optimal loop radius for a target depth, `√2 · z`.
 */
export function best_radius(depth_m: number): number;

/**
 * Free-induction decay after a 90° pulse — interleaved `[re, im, …]` in the
 * rotating frame (i.e. after the receiver's mixer).
 */
export function fid(t1: number, t2: number, spread_hz: number, dt: number, steps: number, n_iso: number): Float32Array;

/**
 * Proton Larmor frequency in MHz.
 */
export function larmor_mhz(b0: number): number;

/**
 * Free-space wavelength at the Larmor frequency, in metres.
 */
export function larmor_wavelength_m(b0: number): number;

/**
 * On-axis field of a circular loop, µT per amp — the closed form the solver is
 * checked against, exposed so the page can plot both.
 */
export function loop_axis_field_ut(radius_m: number, z_m: number): number;

/**
 * Thermal spin polarisation in parts per million, at body temperature.
 */
export function polarization_ppm(b0: number): number;

/**
 * Induction-detected signal relative to 1.5 T — the B₀² law.
 */
export function relative_faraday_emf(b0: number): number;

/**
 * Hahn spin echo: 90°, τ, 180°, and the echo at 2τ.
 */
export function spin_echo(t1: number, t2: number, spread_hz: number, tau: number, dt: number, steps: number, n_iso: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_rxcoil_free: (a: number, b: number) => void;
    readonly best_radius: (a: number) => number;
    readonly fid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly larmor_mhz: (a: number) => number;
    readonly larmor_wavelength_m: (a: number) => number;
    readonly loop_axis_field_ut: (a: number, b: number) => number;
    readonly polarization_ppm: (a: number) => number;
    readonly rxcoil_add_loop: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly rxcoil_clear: (a: number) => void;
    readonly rxcoil_field_at: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rxcoil_new: () => number;
    readonly rxcoil_outline_xz: (a: number, b: number) => void;
    readonly rxcoil_sensitivity_at: (a: number, b: number, c: number, d: number) => number;
    readonly rxcoil_sensitivity_map: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly spin_echo: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly relative_faraday_emf: (a: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
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
