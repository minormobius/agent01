export const NOTE_COLLECTION = 'com.minomobi.wiki.note';

export interface NoteRecord {
  $type: typeof NOTE_COLLECTION;
  title: string;
  content: string;           // markdown
  tags: string[];
  outgoingLinks: string[];   // rkeys of linked notes
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  rkey: string;
  uri: string;
  cid: string;
  record: NoteRecord;
}

/** Lightweight index entry for fast lookups. */
export interface NoteStub {
  rkey: string;
  title: string;
  tags: string[];
  outgoingLinks: string[];
}

/** Wikilink reference parsed from markdown. */
export interface WikiLink {
  title: string;       // display text / target note title
  rkey: string | null; // resolved rkey (null if note doesn't exist)
  start: number;       // char offset in source
  end: number;
}
