/* @ts-self-types="./mri.d.ts" */

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
 * The signal-optimal loop radius for a target depth, `√2 · z`.
 * @param {number} depth_m
 * @returns {number}
 */
export function best_radius(depth_m) {
    const ret = wasm.best_radius(depth_m);
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

const RxCoilFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rxcoil_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
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

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
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
