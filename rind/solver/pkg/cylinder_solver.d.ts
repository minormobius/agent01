/* tslint:disable */
/* eslint-disable */

export function hoop_json(req: string): string;

/**
 * Solve a 2D frame (axial + bending). This is what scores closed-cell foam /
 * honeycomb honestly — walls carry load by bending, which the pin-jointed `net`
 * can't represent.
 */
export function solve_frame_json(req: string): string;

export function solve_net_json(req: string): string;

/**
 * The foam-scale solve: a pin-jointed 3D truss with ~10⁵ DOF (foamview's shell
 * sector). Typed arrays instead of JSON — at this size a JSON round-trip would cost
 * more than the solve. `pos`/`load` are 3n long, `fixed` is 3n of 0/1 per DOF,
 * `mi`/`mj`/`stiff` are per-member (stiff = EA/L). Returns
 * `[converged, iters, relres, compliance, u(3n)…, force(M)…]`, or `[-1]` on a
 * malformed call. Non-convergence (converged = 0) is the mechanism flag.
 */
export function solve_truss3d(pos: Float64Array, fixed: Uint8Array, load: Float64Array, mi: Uint32Array, mj: Uint32Array, stiff: Float64Array, tol: number, max_iter: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly hoop_json: (a: number, b: number, c: number) => void;
    readonly solve_frame_json: (a: number, b: number, c: number) => void;
    readonly solve_net_json: (a: number, b: number, c: number) => void;
    readonly solve_truss3d: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
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
