/* tslint:disable */
/* eslint-disable */

/**
 * Persistent canvas renderer — holds layout state between frames.
 */
export class CanvasRenderer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply a formatting wrap (e.g. bold **..** ) around selection or at cursor.
     */
    applyFormat(prefix: string, suffix: string): void;
    /**
     * Get total content height (for scrollbar).
     */
    getContentHeight(): number;
    /**
     * Get the current markdown text (for saving).
     */
    getMarkdown(): string;
    /**
     * Get current scroll position.
     */
    getScroll(): number;
    /**
     * Get the selected text (for copy/cut).
     */
    getSelectedText(): string;
    /**
     * Handle a click at viewport coordinates — places the cursor.
     */
    handleClick(viewport_x: number, viewport_y: number, shift: boolean): void;
    /**
     * Handle text input (characters typed).
     */
    handleInput(text: string): void;
    /**
     * Handle a key press. Returns true if the key was handled.
     */
    handleKeyDown(key: string, ctrl: boolean, shift: boolean): boolean;
    /**
     * Hit test at viewport coordinates. Returns JSON or empty string.
     */
    hitTest(viewport_x: number, viewport_y: number): string;
    /**
     * Whether the renderer is currently in edit mode.
     */
    isEditing(): boolean;
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
    /**
     * Enter edit mode with the given markdown source.
     */
    startEditing(markdown: string): void;
    /**
     * Exit edit mode and return the final markdown.
     */
    stopEditing(): string;
    /**
     * Toggle cursor blink — call from setInterval on JS side.
     */
    toggleBlink(): void;
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
    readonly canvasrenderer_applyFormat: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly canvasrenderer_getContentHeight: (a: number) => number;
    readonly canvasrenderer_getMarkdown: (a: number, b: number) => void;
    readonly canvasrenderer_getScroll: (a: number) => number;
    readonly canvasrenderer_getSelectedText: (a: number, b: number) => void;
    readonly canvasrenderer_handleClick: (a: number, b: number, c: number, d: number) => void;
    readonly canvasrenderer_handleInput: (a: number, b: number, c: number) => void;
    readonly canvasrenderer_handleKeyDown: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly canvasrenderer_hitTest: (a: number, b: number, c: number, d: number) => void;
    readonly canvasrenderer_isEditing: (a: number) => number;
    readonly canvasrenderer_new: (a: number, b: number) => void;
    readonly canvasrenderer_paint: (a: number) => void;
    readonly canvasrenderer_render: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly canvasrenderer_resize: (a: number, b: number, c: number) => void;
    readonly canvasrenderer_setScroll: (a: number, b: number) => void;
    readonly canvasrenderer_startEditing: (a: number, b: number, c: number) => void;
    readonly canvasrenderer_stopEditing: (a: number, b: number) => void;
    readonly canvasrenderer_toggleBlink: (a: number) => void;
    readonly expandTemplate: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly parseWikilinks: (a: number, b: number, c: number) => void;
    readonly renderMarkdown: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
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
