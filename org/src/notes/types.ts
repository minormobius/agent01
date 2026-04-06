/** Notes data model — unified type for notes, bookmarks, and snippets */

import type { VaultBlobRef } from "../blobs";

export type NoteKind = "note" | "bookmark" | "snippet";

export const NOTE_KINDS: { id: NoteKind; label: string }[] = [
  { id: "note", label: "Notes" },
  { id: "bookmark", label: "Bookmarks" },
  { id: "snippet", label: "Snippets" },
];

export interface Note {
  kind: NoteKind;
  title: string;
  body: string;
  /** Bookmark-specific: the URL */
  url?: string;
  /** Snippet-specific: language tag for syntax context */
  language?: string;
  tags?: string[];
  pinned?: boolean;
  /** Folder path — e.g. "projects/acme" or "/" for root */
  folder?: string;
  /** Encrypted file attachments */
  attachments?: VaultBlobRef[];
  createdAt: string;
  updatedAt?: string;
}

export interface NoteRecord {
  rkey: string;
  note: Note;
  authorDid: string;
  orgRkey: string; // "personal" or org rkey
}

/** Extract unique folder paths from a set of notes, sorted */
export function extractFolders(notes: NoteRecord[]): string[] {
  const set = new Set<string>();
  for (const n of notes) {
    const f = n.note.folder || "/";
    set.add(f);
    // Also add parent folders so tree is navigable
    const parts = f.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      set.add(parts.slice(0, i).join("/"));
    }
  }
  return Array.from(set).sort();
}

/** Check if a note is in a folder (or any subfolder) */
export function isInFolder(note: Note, folder: string): boolean {
  const noteFolder = note.folder || "/";
  if (folder === "/") return true;
  return noteFolder === folder || noteFolder.startsWith(folder + "/");
}

/** Parse [[wiki-links]] from note body, return array of linked titles */
export function parseWikiLinks(body: string): string[] {
  const matches = body.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2).trim());
}
