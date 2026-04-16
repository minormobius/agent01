/* tslint:disable */
/* eslint-disable */

/**
 * Persistent canvas renderer — holds layout state between frames.
 */
export class CanvasRenderer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get total content height (for scrollbar).
     */
    getContentHeight(): number;
    /**
     * Get current scroll position.
     */
    getScroll(): number;
    /**
     * Hit test at viewport coordinates. Returns JSON or empty string.
     */
    hitTest(viewport_x: number, viewport_y: number): string;
    /**
     * Create a new renderer attached to a canvas element.
     */
    constructor(canvas: HTMLCanvasElement);
    /**
     * Repaint without re-layout (e.g. after scroll).
     */
    paint(): void;
    /**
     * Layout and paint markdown content.
     */
    render(markdown: string, config_json: string): void;
    /**
     * Resize the canvas (call on window resize).
     */
    resize(width: number, height: number): void;
    /**
     * Set scroll position.
     */
    setScroll(scroll_y: number): void;
}

/**
 * Expand template variables in text
 */
export function expandTemplate(template: string, vars_json: string): string;

/**
 * Parse wikilinks from markdown text, returns JSON array of link targets
 */
export function parseWikilinks(markdown: string): string;

/**
 * Main WASM entry point: render markdown to HTML
 */
export function renderMarkdown(markdown: string, config_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_canvasrenderer_free: (a: number, b: number) => void;
    readonly canvasrenderer_getContentHeight: (a: number) => number;
    readonly canvasrenderer_getScroll: (a: number) => number;
    readonly canvasrenderer_hitTest: (a: number, b: number, c: number, d: number) => void;
    readonly canvasrenderer_new: (a: number, b: number) => void;
    readonly canvasrenderer_paint: (a: number) => void;
    readonly canvasrenderer_render: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly canvasrenderer_resize: (a: number, b: number, c: number) => void;
    readonly canvasrenderer_setScroll: (a: number, b: number) => void;
    readonly expandTemplate: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly parseWikilinks: (a: number, b: number, c: number) => void;
    readonly renderMarkdown: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export3: (a: number, b: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number, d: number) => number;
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
