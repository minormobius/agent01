/** Notes data model — unified type for notes, bookmarks, and snippets */

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
  createdAt: string;
  updatedAt?: string;
}

export interface NoteRecord {
  rkey: string;
  note: Note;
  authorDid: string;
  orgRkey: string; // "personal" or org rkey
}
