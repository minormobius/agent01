/**
 * Wave Markdown Engine — TypeScript wrapper for the Rust/WASM pulldown-cmark renderer.
 *
 * Usage:
 *   import { initMarkdown, renderMarkdown, parseWikilinks } from './lib/markdown';
 *   await initMarkdown();
 *   const html = renderMarkdown('# Hello', { titleIndex: [...] });
 */

import init, {
  renderMarkdown as wasmRender,
  parseWikilinks as wasmParseWikilinks,
  expandTemplate as wasmExpandTemplate,
} from '../wasm/wave_md.js';

let initialized = false;

/** Initialize the WASM module. Call once at app startup. */
export async function initMarkdown(): Promise<void> {
  if (initialized) return;
  await init();
  initialized = true;
}

/** Check if the WASM module is ready */
export function isMarkdownReady(): boolean {
  return initialized;
}

export interface TitleEntry {
  rkey: string;
  title: string;
}

export interface TemplateVar {
  key: string;
  value: string;
}

export interface RenderOptions {
  /** Available page titles for wikilink resolution */
  titleIndex?: TitleEntry[];
  /** Enable kanban plugin (default: true) */
  kanban?: boolean;
  /** Enable dataview plugin (default: true) */
  dataview?: boolean;
  /** Enable embed plugin (default: true) */
  embeds?: boolean;
  /** Template variables to expand */
  templateVars?: TemplateVar[];
}

/** Render markdown to HTML using the Rust/WASM engine */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
  if (!initialized) {
    // Fallback: basic HTML escaping if WASM not ready
    return `<pre>${markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  }

  const config = {
    title_index: (options.titleIndex || []).map(e => ({
      rkey: e.rkey,
      title: e.title,
    })),
    kanban: options.kanban ?? true,
    dataview: options.dataview ?? true,
    embeds: options.embeds ?? true,
    template_vars: (options.templateVars || []).map(v => ({
      key: v.key,
      value: v.value,
    })),
  };

  return wasmRender(markdown, JSON.stringify(config));
}

/** Extract wikilink targets from markdown text */
export function parseWikilinks(markdown: string): string[] {
  if (!initialized) return [];
  const json = wasmParseWikilinks(markdown);
  return JSON.parse(json);
}

/** Expand template variables in text */
export function expandTemplate(template: string, vars: TemplateVar[]): string {
  if (!initialized) return template;
  return wasmExpandTemplate(template, JSON.stringify(vars.map(v => ({
    key: v.key,
    value: v.value,
  }))));
}
