/* tslint:disable */
/* eslint-disable */

/**
 * A line of text that has been detected, but not recognized.
 *
 * This contains information about the location of the text, but not the
 * string contents.
 */
export class DetectedLine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    rotatedRect(): RotatedRect;
    words(): RotatedRect[];
}

/**
 * A pre-processed image that can be passed as input to `OcrEngine.loadImage`.
 */
export class Image {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Return the number of channels in the image.
     */
    channels(): number;
    /**
     * Return the image data in row-major, channels-last order.
     */
    data(): Uint8Array;
    /**
     * Return the height of the image.
     */
    height(): number;
    /**
     * Return the width of the image.
     */
    width(): number;
}

/**
 * OcrEngine is the main API for performing OCR in WebAssembly.
 */
export class OcrEngine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Detect text in an image.
     *
     * Returns a list of lines that were found. These can be passed to
     * `recognizeText` identify the characters.
     */
    detectText(image: Image): DetectedLine[];
    /**
     * Detect and recognize text in an image.
     *
     * Returns a single string containing all the text found in reading order.
     */
    getText(image: Image): string;
    /**
     * Detect and recognize text in an image.
     *
     * Returns a list of `TextLine` objects that can be used to query the text
     * and bounding boxes of each line.
     */
    getTextLines(image: Image): TextLine[];
    /**
     * Prepare an image for analysis by the OCR engine.
     *
     * The image is an array of pixels in row-major, channels last order. This
     * matches the format of the
     * [ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData)
     * API. Supported channel combinations are RGB and RGBA. The number of
     * channels is inferred from the length of `data`.
     */
    loadImage(width: number, height: number, data: Uint8Array): Image;
    /**
     * Construct a new `OcrEngine` using the models and other settings given
     * by `init`.
     *
     * To detect text in an image, `init` must have a detection model set.
     * To recognize text, `init` must have a recognition model set.
     */
    constructor(init: OcrEngineInit);
    /**
     * Recognize text that was previously detected with `detectText`.
     *
     * Returns a list of `TextLine` objects that can be used to query the text
     * and bounding boxes of each line.
     */
    recognizeText(image: Image, lines: DetectedLine[]): TextLine[];
}

/**
 * Options for constructing an [OcrEngine].
 */
export class OcrEngineInit {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    /**
     * Load a model for text detection.
     */
    setDetectionModel(data: Uint8Array): void;
    /**
     * Load a model for text recognition.
     */
    setRecognitionModel(data: Uint8Array): void;
}

export class RotatedRect {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Return the coordinates of the axis-aligned bounding rectangle of this
     * rotated rect.
     *
     * The result is a `[left, top, right, bottom]` array of coordinates.
     */
    boundingRect(): Float32Array;
    /**
     * Return an array of the X and Y coordinates of corners of this rectangle,
     * arranged as `[x0, y0, ... x3, y3]`.
     */
    corners(): Float32Array;
}

/**
 * A sequence of `TextWord`s that were recognized, forming a line.
 */
export class TextLine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    text(): string;
    words(): TextWord[];
}

/**
 * Bounding box and text of a word that was recognized.
 */
export class TextWord {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Return the oriented bounding rectangle containing the characters in
     * this word.
     */
    rotatedRect(): RotatedRect;
    text(): string;
}

/**
 * Run OCR over an encoded image.
 *
 * `image_bytes` is the raw contents of a PNG/JPEG/WebP/GIF/BMP file.
 * `allowed_chars`, if non-empty, restricts recognition to that character set
 * (e.g. `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"` for a "code mode" that
 * sharpens activation-code reads). Pass an empty string for the full alphabet.
 *
 * Returns JSON: `{ "text": "<all lines, newline-joined>", "lines": [ ... ] }`.
 */
export function extract_text(image_bytes: Uint8Array, allowed_chars: string): string;

/**
 * Load the OCR models. `detection_model` and `recognition_model` are the raw
 * bytes of ocrs's `.rten` model files (fetched + cached by the page).
 *
 * Idempotent: calling again replaces the engine. Returns an error string to
 * JS if either model fails to parse.
 */
export function init_engine(detection_model: Uint8Array, recognition_model: Uint8Array): void;

/**
 * Install a panic hook that forwards Rust panics to the browser console.
 * Call once, early, from JS — makes WASM panics legible instead of
 * surfacing as an opaque `unreachable`.
 */
export function init_panic_hook(): void;

/**
 * True once [`init_engine`] has succeeded.
 */
export function is_ready(): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly extract_text: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly init_engine: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly init_panic_hook: () => void;
    readonly is_ready: () => number;
    readonly __wbg_detectedline_free: (a: number, b: number) => void;
    readonly __wbg_image_free: (a: number, b: number) => void;
    readonly __wbg_ocrengine_free: (a: number, b: number) => void;
    readonly __wbg_ocrengineinit_free: (a: number, b: number) => void;
    readonly __wbg_rotatedrect_free: (a: number, b: number) => void;
    readonly __wbg_textline_free: (a: number, b: number) => void;
    readonly __wbg_textword_free: (a: number, b: number) => void;
    readonly detectedline_rotatedRect: (a: number) => number;
    readonly detectedline_words: (a: number, b: number) => void;
    readonly image_channels: (a: number) => number;
    readonly image_data: (a: number, b: number) => void;
    readonly image_height: (a: number) => number;
    readonly image_width: (a: number) => number;
    readonly ocrengine_detectText: (a: number, b: number, c: number) => void;
    readonly ocrengine_getText: (a: number, b: number, c: number) => void;
    readonly ocrengine_getTextLines: (a: number, b: number, c: number) => void;
    readonly ocrengine_loadImage: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly ocrengine_new: (a: number, b: number) => void;
    readonly ocrengine_recognizeText: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly ocrengineinit_new: () => number;
    readonly ocrengineinit_setDetectionModel: (a: number, b: number, c: number, d: number) => void;
    readonly ocrengineinit_setRecognitionModel: (a: number, b: number, c: number, d: number) => void;
    readonly rotatedrect_boundingRect: (a: number, b: number) => void;
    readonly rotatedrect_corners: (a: number, b: number) => void;
    readonly textline_text: (a: number, b: number) => void;
    readonly textline_words: (a: number, b: number) => void;
    readonly textword_rotatedRect: (a: number) => number;
    readonly textword_text: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
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
export default function __wbg_init (module_or_path: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
