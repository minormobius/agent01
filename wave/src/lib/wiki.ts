/**
 * Wiki layer on top of Wave doc threads.
 *
 * Doc threads = wiki pages. Wikilinks ([[Page Title]]) create
 * cross-references. The graph view shows thread-to-thread connections.
 */

import type { WaveThreadRecord, WaveOpRecord, DocEditPayload } from '../types';

/** Stub for sidebar list and graph nodes. */
export interface NoteStub {
  rkey: string;
  authorDid: string;
  title: string;
  outgoingLinks: string[]; // rkeys of linked pages
}

/** Parse [[wikilinks]] from markdown text. Returns unique linked titles. */
export function parseWikilinks(text: string): string[] {
  const matches = text.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  const titles = matches.map(m => m.slice(2, -2).trim());
  return [...new Set(titles)];
}

/** Build a title → rkey index from doc threads. */
export function buildTitleIndex(docThreads: WaveThreadRecord[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const t of docThreads) {
    if (t.thread.title) {
      index.set(t.thread.title.toLowerCase(), t.rkey);
    }
  }
  return index;
}

/**
 * Build note stubs for all doc threads.
 * Requires the latest decrypted text for each thread to extract wikilinks.
 */
export function buildNoteStubs(
  docThreads: WaveThreadRecord[],
  latestTexts: Map<string, string>, // rkey → latest doc text
): NoteStub[] {
  const titleIndex = buildTitleIndex(docThreads);

  return docThreads.map(t => {
    const text = latestTexts.get(t.rkey) || '';
    const linkedTitles = parseWikilinks(text);
    const outgoingLinks = linkedTitles
      .map(title => titleIndex.get(title.toLowerCase()))
      .filter((rkey): rkey is string => !!rkey);

    return {
      rkey: t.rkey,
      authorDid: t.authorDid,
      title: t.thread.title || 'Untitled',
      outgoingLinks,
    };
  });
}

/** Find backlinks: notes that link to a given rkey. */
export function findBacklinks(stubs: NoteStub[], targetRkey: string): NoteStub[] {
  return stubs.filter(s => s.outgoingLinks.includes(targetRkey));
}

/**
 * Render markdown text with wikilinks replaced by clickable spans.
 * Returns HTML string. Links to existing pages get wiki-link class,
 * missing pages get wiki-link-missing class.
 */
export function renderWikilinks(
  text: string,
  titleIndex: Map<string, string>,
): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_match, title: string) => {
    const rkey = titleIndex.get(title.trim().toLowerCase());
    if (rkey) {
      return `<span class="wiki-link" data-rkey="${rkey}">${title}</span>`;
    }
    return `<span class="wiki-link wiki-link-missing">${title}</span>`;
  });
}

/**
 * Extract the latest text from a set of ops for a doc thread.
 * Returns the text from the most recent doc_edit op.
 */
export function getLatestDocText(
  ops: WaveOpRecord[],
  decrypted: Map<string, DocEditPayload>,
): string {
  let latestText = '';
  for (const op of ops) {
    if (op.op.opType !== 'doc_edit') continue;
    const key = `${op.authorDid}:${op.rkey}`;
    const payload = decrypted.get(key);
    if (payload) latestText = payload.text;
  }
  return latestText;
}

/** Graph edge for visualization. */
export interface GraphEdge {
  source: string; // rkey
  target: string; // rkey
}

/** Build edges from note stubs for the graph view. */
export function buildGraphEdges(stubs: NoteStub[]): GraphEdge[] {
  const rkeySet = new Set(stubs.map(s => s.rkey));
  const edges: GraphEdge[] = [];
  for (const s of stubs) {
    for (const target of s.outgoingLinks) {
      if (rkeySet.has(target)) {
        edges.push({ source: s.rkey, target });
      }
    }
  }
  return edges;
}
