/* @ts-self-types="./mri.d.ts" */

/**
 * A scanner the page can drive: an object, a matrix, a field of view, and a
 * trajectory through k-space.
 */
export class Imager {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ImagerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_imager_free(ptr, 0);
    }
    /**
     * Run an acquisition. `traj`: 0 spin-warp, 1 EPI, 2 radial.
     * @param {number} traj
     * @param {number} dwell_us
     * @param {number} t2star_ms
     * @param {number} off_res_hz
     * @param {number} undersample
     */
    acquire(traj, dwell_us, t2star_ms, off_res_hz, undersample) {
        wasm.imager_acquire(this.__wbg_ptr, traj, dwell_us, t2star_ms, off_res_hz, undersample);
    }
    /**
     * Intensity centroid of an image, in pixels from the centre: `[x, y]`.
     * @param {Float32Array} img
     * @returns {Float64Array}
     */
    centroid(img) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayF32ToWasm0(img, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.imager_centroid(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v2 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 8, 8);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Reconstruct everything acquired.
     * @returns {Float32Array}
     */
    image() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.imager_image(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Reconstruct with parts of k-space deleted — the paintbrush.
     * @param {Uint8Array} mask
     * @returns {Float32Array}
     */
    image_masked(mask) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(mask, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.imager_image_masked(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v2 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Reconstruct from the first `frac` of the acquisition, in the order the
     * trajectory actually visits k-space.
     * @param {number} frac
     * @returns {Float32Array}
     */
    image_progress(frac) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.imager_image_progress(retptr, this.__wbg_ptr, frac);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * k-space magnitude, log-compressed to 0…1 for display — raw k-space has
     * a dynamic range no screen can show.
     * @returns {Float32Array}
     */
    k_display() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.imager_k_display(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    k_max_per_cm() {
        const ret = wasm.imager_k_max_per_cm(this.__wbg_ptr);
        return ret;
    }
    /**
     * `n` must be a power of two. `fov_cm` is the field of view and
     * `object_cm` the radius the phantom's unit disc maps to.
     * @param {number} n
     * @param {number} fov_cm
     * @param {number} object_cm
     * @param {boolean} classic
     */
    constructor(n, fov_cm, object_cm, classic) {
        const ret = wasm.imager_new(n, fov_cm, object_cm, classic);
        this.__wbg_ptr = ret;
        ImagerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Acquisition order per k-space sample, `-1` where never acquired.
     * @returns {Int32Array}
     */
    order() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.imager_order(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    pixel_mm() {
        const ret = wasm.imager_pixel_mm(this.__wbg_ptr);
        return ret;
    }
    /**
     * Seconds this acquisition would take. `tr_ms` is the repetition time for
     * the sequences that need one per line.
     * @param {number} traj
     * @param {number} dwell_us
     * @param {number} undersample
     * @param {number} tr_ms
     * @returns {number}
     */
    seconds(traj, dwell_us, undersample, tr_ms) {
        const ret = wasm.imager_seconds(this.__wbg_ptr, traj, dwell_us, undersample, tr_ms);
        return ret;
    }
    /**
     * The object as it really is — what the reconstruction is trying to be.
     * @returns {Float32Array}
     */
    truth() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.imager_truth(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) Imager.prototype[Symbol.dispose] = Imager.prototype.free;

/**
 * A receive coil built from circular loops. Lengths in metres; `B₀` is along
 * `+z`, so a loop whose normal is `+z` faces down the bore.
 */
export class RxCoil {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RxCoilFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rxcoil_free(ptr, 0);
    }
    /**
     * Add a loop of `radius` at `(cx, cy, cz)` with plane normal `(nx, ny, nz)`.
     * @param {number} cx
     * @param {number} cy
     * @param {number} cz
     * @param {number} nx
     * @param {number} ny
     * @param {number} nz
     * @param {number} radius
     */
    add_loop(cx, cy, cz, nx, ny, nz, radius) {
        wasm.rxcoil_add_loop(this.__wbg_ptr, cx, cy, cz, nx, ny, nz, radius);
    }
    clear() {
        wasm.rxcoil_clear(this.__wbg_ptr);
    }
    /**
     * Full field vector at a point, `[Bx, By, Bz]` in µT per amp — so the page
     * can show *why* a sensitivity is low: strong field, wrong direction.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Float64Array}
     */
    field_at(x, y, z) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.rxcoil_field_at(retptr, this.__wbg_ptr, x, y, z);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 8, 8);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    constructor() {
        const ret = wasm.rxcoil_new();
        this.__wbg_ptr = ret;
        RxCoilFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * The loop's wire path, projected into the y = 0 plane as `[x, z, …]` in
     * metres, for drawing the coil over its own sensitivity map.
     * @returns {Float32Array}
     */
    outline_xz() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.rxcoil_outline_xz(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Receive sensitivity |B₁⁻| at a point, in µT per amp.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    sensitivity_at(x, y, z) {
        const ret = wasm.rxcoil_sensitivity_at(this.__wbg_ptr, x, y, z);
        return ret;
    }
    /**
     * Sensitivity over a grid in the y = 0 plane (the plane containing B₀),
     * row-major, `nz` rows of `nx`, in µT per amp.
     * @param {number} x0
     * @param {number} x1
     * @param {number} z0
     * @param {number} z1
     * @param {number} nx
     * @param {number} nz
     * @returns {Float32Array}
     */
    sensitivity_map(x0, x1, z0, z1, nx, nz) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.rxcoil_sensitivity_map(retptr, this.__wbg_ptr, x0, x1, z0, z1, nx, nz);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) RxCoil.prototype[Symbol.dispose] = RxCoil.prototype.free;

/**
 * A scanner whose phantom is made of the measured tissues, imaged through the
 * same encoding and reconstruction as part two.
 */
export class TissueImager {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TissueImagerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tissueimager_free(ptr, 0);
    }
    /**
     * Re-weight every region by what its tissue does under this sequence, then
     * acquire and reconstruct. The image is a real reconstruction, not a
     * colouring-in of the truth map.
     * @param {number} kind
     * @param {number} tr_ms
     * @param {number} te_ms
     * @param {number} ti_ms
     * @param {number} flip_deg
     * @returns {Float32Array}
     */
    image(kind, tr_ms, te_ms, ti_ms, flip_deg) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.tissueimager_image(retptr, this.__wbg_ptr, kind, tr_ms, te_ms, ti_ms, flip_deg);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * A map of which tissue is where, for the legend: the tissue index at each
     * pixel, or −1 outside the phantom.
     * @returns {Int32Array}
     */
    label_map() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.tissueimager_label_map(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {number} n
     * @param {number} fov_cm
     * @param {number} object_cm
     */
    constructor(n, fov_cm, object_cm) {
        const ret = wasm.tissueimager_new(n, fov_cm, object_cm);
        this.__wbg_ptr = ret;
        TissueImagerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) TissueImager.prototype[Symbol.dispose] = TissueImager.prototype.free;

/**
 * The signal-optimal loop radius for a target depth, `√2 · z`.
 * @param {number} depth_m
 * @returns {number}
 */
export function best_radius(depth_m) {
    const ret = wasm.best_radius(depth_m);
    return ret;
}

/**
 * |contrast| between two tissues over a log-spaced TR × TE grid, row-major
 * (`nte` rows of `ntr`). The landscape a radiographer is choosing a point on.
 * @param {number} i
 * @param {number} j
 * @param {number} tr_lo_ms
 * @param {number} tr_hi_ms
 * @param {number} te_lo_ms
 * @param {number} te_hi_ms
 * @param {number} ntr
 * @param {number} nte
 * @param {boolean} signed
 * @returns {Float32Array}
 */
export function contrast_map(i, j, tr_lo_ms, tr_hi_ms, te_lo_ms, te_hi_ms, ntr, nte, signed) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.contrast_map(retptr, i, j, tr_lo_ms, tr_hi_ms, te_lo_ms, te_hi_ms, ntr, nte, signed);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The predicted EPI geometric shift, in pixels: `Δf · N · echo-spacing / R`.
 * @param {number} off_res_hz
 * @param {number} n
 * @param {number} dwell_us
 * @param {number} undersample
 * @returns {number}
 */
export function epi_shift_px(off_res_hz, n, dwell_us, undersample) {
    const ret = wasm.epi_shift_px(off_res_hz, n, dwell_us, undersample);
    return ret;
}

/**
 * The Ernst angle in degrees: `cos α = e^(−TR/T₁)`.
 * @param {number} tr_ms
 * @param {number} t1_ms
 * @returns {number}
 */
export function ernst_angle_deg(tr_ms, t1_ms) {
    const ret = wasm.ernst_angle_deg(tr_ms, t1_ms);
    return ret;
}

/**
 * Free-induction decay after a 90° pulse — interleaved `[re, im, …]` in the
 * rotating frame (i.e. after the receiver's mixer).
 * @param {number} t1
 * @param {number} t2
 * @param {number} spread_hz
 * @param {number} dt
 * @param {number} steps
 * @param {number} n_iso
 * @returns {Float32Array}
 */
export function fid(t1, t2, spread_hz, dt, steps, n_iso) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.fid(retptr, t1, t2, spread_hz, dt, steps, n_iso);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Proton Larmor frequency in MHz.
 * @param {number} b0
 * @returns {number}
 */
export function larmor_mhz(b0) {
    const ret = wasm.larmor_mhz(b0);
    return ret;
}

/**
 * Free-space wavelength at the Larmor frequency, in metres.
 * @param {number} b0
 * @returns {number}
 */
export function larmor_wavelength_m(b0) {
    const ret = wasm.larmor_wavelength_m(b0);
    return ret;
}

/**
 * On-axis field of a circular loop, µT per amp — the closed form the solver is
 * checked against, exposed so the page can plot both.
 * @param {number} radius_m
 * @param {number} z_m
 * @returns {number}
 */
export function loop_axis_field_ut(radius_m, z_m) {
    const ret = wasm.loop_axis_field_ut(radius_m, z_m);
    return ret;
}

/**
 * The inversion time that nulls a T₁, in ms.
 * @param {number} t1_ms
 * @param {number} tr_ms
 * @returns {number}
 */
export function null_time_ms(t1_ms, tr_ms) {
    const ret = wasm.null_time_ms(t1_ms, tr_ms);
    return ret;
}

/**
 * Thermal spin polarisation in parts per million, at body temperature.
 * @param {number} b0
 * @returns {number}
 */
export function polarization_ppm(b0) {
    const ret = wasm.polarization_ppm(b0);
    return ret;
}

/**
 * Induction-detected signal relative to 1.5 T — the B₀² law.
 * @param {number} b0
 * @returns {number}
 */
export function relative_faraday_emf(b0) {
    const ret = wasm.relative_faraday_emf(b0);
    return ret;
}

/**
 * How far image `b` has slid along y relative to `a`, in pixels, by circular
 * cross-correlation — the measurement that survives the image wrapping around
 * the field of view, which is what large off-resonance actually does.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {number} n
 * @returns {number}
 */
export function shift_px(a, b, n) {
    const ptr0 = passArrayF32ToWasm0(a, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(b, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.shift_px(ptr0, len0, ptr1, len1, n);
    return ret;
}

/**
 * Signal from an arbitrary `(T1, T2)` — for drawing the response of a tissue
 * the table does not contain.
 * @param {number} t1_ms
 * @param {number} t2_ms
 * @param {number} kind
 * @param {number} tr_ms
 * @param {number} te_ms
 * @param {number} ti_ms
 * @param {number} flip_deg
 * @returns {number}
 */
export function signal_for(t1_ms, t2_ms, kind, tr_ms, te_ms, ti_ms, flip_deg) {
    const ret = wasm.signal_for(t1_ms, t2_ms, kind, tr_ms, te_ms, ti_ms, flip_deg);
    return ret;
}

/**
 * Hahn spin echo: 90°, τ, 180°, and the echo at 2τ.
 * @param {number} t1
 * @param {number} t2
 * @param {number} spread_hz
 * @param {number} tau
 * @param {number} dt
 * @param {number} steps
 * @param {number} n_iso
 * @returns {Float32Array}
 */
export function spin_echo(t1, t2, spread_hz, tau, dt, steps, n_iso) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.spin_echo(retptr, t1, t2, spread_hz, tau, dt, steps, n_iso);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * How many tissues the measured table carries.
 * @returns {number}
 */
export function tissue_count() {
    const ret = wasm.tissue_count();
    return ret >>> 0;
}

/**
 * @param {number} i
 * @returns {string}
 */
export function tissue_name(i) {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.tissue_name(retptr, i);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
    }
}

/**
 * `[T1, T2, T1 sd, T2 sd]` in milliseconds, straight from Stanisz 2005 Table 1.
 * @param {number} i
 * @returns {Float64Array}
 */
export function tissue_relaxation_ms(i) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.tissue_relaxation_ms(retptr, i);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Signal from tissue `i` under a sequence. `kind`: 0 spin echo,
 * 1 inversion recovery, 2 spoiled gradient echo.
 * @param {number} i
 * @param {number} kind
 * @param {number} tr_ms
 * @param {number} te_ms
 * @param {number} ti_ms
 * @param {number} flip_deg
 * @returns {number}
 */
export function tissue_signal(i, kind, tr_ms, te_ms, ti_ms, flip_deg) {
    const ret = wasm.tissue_signal(i, kind, tr_ms, te_ms, ti_ms, flip_deg);
    return ret;
}

/**
 * The TR at which two tissues become indistinguishable at this TE, in ms.
 * Negative if there is no such TR — at long TE, T₂ wins everywhere.
 * @param {number} i
 * @param {number} j
 * @param {number} te_ms
 * @returns {number}
 */
export function zero_contrast_tr_ms(i, j, te_ms) {
    const ret = wasm.zero_contrast_tr_ms(i, j, te_ms);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./mri_bg.js": import0,
    };
}

const ImagerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_imager_free(ptr, 1));
const RxCoilFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rxcoil_free(ptr, 1));
const TissueImagerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tissueimager_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('mri_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
