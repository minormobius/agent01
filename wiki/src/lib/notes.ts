import { authFetch } from './auth';
import { NOTE_COLLECTION, type Note, type NoteRecord, type NoteStub, type WikiLink } from './types';

// --- TID generation ---

function generateTid(): string {
  const now = BigInt(Date.now()) * 1000n;
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  const tid = (now << 10n) | clockId;
  return tid.toString(36).padStart(13, '0');
}

// --- CRUD ---

export async function listNotes(): Promise<Note[]> {
  const all: Note[] = [];
  let cursor = '';
  while (true) {
    const params = new URLSearchParams({ collection: NOTE_COLLECTION, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await authFetch(`/pds/repo/listRecords?${params}`);
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
    const data = await res.json();
    for (const rec of data.records || []) {
      all.push({
        rkey: rec.uri.split('/').pop()!,
        uri: rec.uri,
        cid: rec.cid,
        record: rec.value as NoteRecord,
      });
    }
    cursor = data.cursor;
    if (!cursor) break;
  }
  return all;
}

export async function getNote(rkey: string): Promise<Note | null> {
  const params = new URLSearchParams({ collection: NOTE_COLLECTION, rkey });
  const res = await authFetch(`/pds/repo/getRecord?${params}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
  const rec = await res.json();
  return {
    rkey,
    uri: rec.uri,
    cid: rec.cid,
    record: rec.value as NoteRecord,
  };
}

export async function saveNote(rkey: string | null, title: string, content: string, tags: string[], outgoingLinks: string[]): Promise<Note> {
  const isNew = !rkey;
  rkey = rkey || generateTid();
  const now = new Date().toISOString();
  const record: NoteRecord = {
    $type: NOTE_COLLECTION,
    title,
    content,
    tags,
    outgoingLinks,
    createdAt: isNew ? now : now, // on update we'll overwrite — no separate fetch for old createdAt
    updatedAt: now,
  };

  const res = await authFetch('/pds/repo/putRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: NOTE_COLLECTION, rkey, record }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`putRecord failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { rkey, uri: data.uri, cid: data.cid, record };
}

export async function deleteNote(rkey: string): Promise<void> {
  const res = await authFetch('/pds/repo/deleteRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: NOTE_COLLECTION, rkey }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deleteRecord failed (${res.status}): ${text}`);
  }
}

// --- Wikilink parsing ---

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** Extract all [[wikilinks]] from markdown content. */
export function parseWikiLinks(content: string, titleToRkey: Map<string, string>): WikiLink[] {
  const links: WikiLink[] = [];
  let match: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const title = match[1].trim();
    links.push({
      title,
      rkey: titleToRkey.get(title.toLowerCase()) ?? null,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return links;
}

/** Build title → rkey lookup map from note stubs. */
export function buildTitleIndex(notes: NoteStub[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of notes) {
    map.set(n.title.toLowerCase(), n.rkey);
  }
  return map;
}

/** Resolve outgoing link rkeys from parsed wikilinks. */
export function resolveOutgoingLinks(content: string, titleToRkey: Map<string, string>): string[] {
  const links = parseWikiLinks(content, titleToRkey);
  const rkeys = new Set<string>();
  for (const l of links) {
    if (l.rkey) rkeys.add(l.rkey);
  }
  return Array.from(rkeys);
}

/** Find all notes that link TO a given rkey. */
export function findBacklinks(targetRkey: string, allNotes: NoteStub[]): NoteStub[] {
  return allNotes.filter(n => n.outgoingLinks.includes(targetRkey));
}

/** Convert note list to stubs for lightweight operations. */
export function toStubs(notes: Note[]): NoteStub[] {
  return notes.map(n => ({
    rkey: n.rkey,
    title: n.record.title,
    tags: n.record.tags,
    outgoingLinks: n.record.outgoingLinks,
  }));
}
