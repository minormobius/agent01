/**
 * NotesApp — encrypted notes, bookmarks & snippets on ATProto.
 * One collection, three swim lanes via `kind` discriminator.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type { Note, NoteRecord, NoteKind } from "./types";
import { NOTE_KINDS } from "./types";
import {
  keyringRkeyForTier,
  loadPersonalNotes,
  loadOrgNotes,
  saveNote,
  updateNote,
  deleteNote,
} from "./context";

type OrgFilter = "all" | "personal" | string;
type KindFilter = "all" | NoteKind;

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

export function NotesApp({ vault, pds, orgs: sharedOrgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();

  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [filterKind, setFilterKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NoteRecord | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const personal = await loadPersonalNotes(pds, vault.dek, vault.session.did);
        const orgNotes: NoteRecord[] = [];
        for (const ctx of sharedContexts.values()) {
          try {
            orgNotes.push(...await loadOrgNotes(pds, ctx));
          } catch (err) {
            console.warn(`Notes: failed to load org ${ctx.org.org.name}:`, err);
          }
        }
        setNotes([...personal, ...orgNotes]);
      } finally {
        setLoading(false);
      }
    })();
  }, [vault, pds, sharedContexts]);

  const orgNames = useMemo(() => {
    const map = new Map<string, string>();
    map.set("personal", "Personal");
    for (const org of sharedOrgs) map.set(org.rkey, org.org.name);
    return map;
  }, [sharedOrgs]);

  const activeOrg = filterOrg !== "all" && filterOrg !== "personal"
    ? sharedContexts.get(filterOrg) ?? null
    : null;

  // Counts per kind
  const kindCounts = useMemo(() => {
    const counts = { note: 0, bookmark: 0, snippet: 0 };
    for (const n of notes) {
      if (counts[n.note.kind] !== undefined) counts[n.note.kind]++;
    }
    return counts;
  }, [notes]);

  const visible = useMemo(() => {
    let result = [...notes];

    if (filterOrg === "personal") result = result.filter((n) => n.orgRkey === "personal");
    else if (filterOrg !== "all") result = result.filter((n) => n.orgRkey === filterOrg);

    if (filterKind !== "all") result = result.filter((n) => n.note.kind === filterKind);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((n) =>
        n.note.title.toLowerCase().includes(q)
        || n.note.body.toLowerCase().includes(q)
        || n.note.url?.toLowerCase().includes(q)
        || n.note.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Pinned first, then by updated/created descending
    result.sort((a, b) => {
      if (a.note.pinned && !b.note.pinned) return -1;
      if (!a.note.pinned && b.note.pinned) return 1;
      const aDate = a.note.updatedAt || a.note.createdAt;
      const bDate = b.note.updatedAt || b.note.createdAt;
      return bDate.localeCompare(aDate);
    });

    return result;
  }, [notes, filterOrg, filterKind, search]);

  const handleSave = useCallback(
    async (note: Note, existingRkey?: string) => {
      if (!pds || !vault) return;

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      if (activeOrg) {
        const tierName = activeOrg.myTierName;
        const tierDek = activeOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = activeOrg.org.org.tiers.find((t) => t.name === tierName);
        keyringRkey = keyringRkeyForTier(activeOrg.org.rkey, tierName, tierDef?.currentEpoch ?? 0);
        orgRkey = activeOrg.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      if (existingRkey) {
        const { rkey: newRkey } = await updateNote(pds, existingRkey, note, dek, keyringRkey);
        setNotes((prev) => [
          ...prev.filter((n) => n.rkey !== existingRkey),
          { rkey: newRkey, note, authorDid: vault.session.did, orgRkey },
        ]);
      } else {
        const { rkey } = await saveNote(pds, note, dek, keyringRkey);
        setNotes((prev) => [...prev, { rkey, note, authorDid: vault.session.did, orgRkey }]);
      }

      setShowForm(false);
      setEditing(null);
    },
    [pds, vault, activeOrg],
  );

  const handleDelete = useCallback(
    async (rec: NoteRecord) => {
      if (!pds || rec.authorDid !== vault?.session.did) return;
      await deleteNote(pds, rec.rkey);
      setNotes((prev) => prev.filter((n) => n.rkey !== rec.rkey));
    },
    [pds, vault],
  );

  const handleTogglePin = useCallback(
    async (rec: NoteRecord) => {
      if (!pds || !vault || rec.authorDid !== vault.session.did) return;
      const updated: Note = { ...rec.note, pinned: !rec.note.pinned, updatedAt: new Date().toISOString() };

      let dek: CryptoKey;
      let keyringRkey: string;

      if (rec.orgRkey !== "personal") {
        const ctx = sharedContexts.get(rec.orgRkey);
        if (!ctx) return;
        const tierDek = ctx.tierDeks.get(ctx.myTierName);
        if (!tierDek) return;
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === ctx.myTierName);
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, ctx.myTierName, tierDef?.currentEpoch ?? 0);
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      const { rkey: newRkey } = await updateNote(pds, rec.rkey, updated, dek, keyringRkey);
      setNotes((prev) => [
        ...prev.filter((n) => n.rkey !== rec.rkey),
        { rkey: newRkey, note: updated, authorDid: vault.session.did, orgRkey: rec.orgRkey },
      ]);
    },
    [pds, vault, sharedContexts],
  );

  if (!vault || !pds) {
    return (
      <div className="notes-container">
        <div className="notes-empty-full">
          <p>Sign in to access notes.</p>
          <button className="btn-secondary" onClick={() => navigate("/")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-container">
      <header className="notes-header">
        <div className="notes-header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">&larr;</button>
          <h1>Notes</h1>
        </div>
        <div className="notes-header-right">
          <select
            className="notes-select"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value as OrgFilter)}
          >
            <option value="all">All</option>
            <option value="personal">Personal</option>
            {sharedOrgs.map((o) => (
              <option key={o.rkey} value={o.rkey}>{o.org.name}</option>
            ))}
          </select>
          <button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            + New
          </button>
        </div>
      </header>

      <div className="notes-toolbar">
        <div className="notes-kind-bar">
          <button
            className={`notes-kind-btn${filterKind === "all" ? " active" : ""}`}
            onClick={() => setFilterKind("all")}
          >
            All ({notes.length})
          </button>
          {NOTE_KINDS.map((k) => (
            <button
              key={k.id}
              className={`notes-kind-btn${filterKind === k.id ? " active" : ""}`}
              onClick={() => setFilterKind(k.id)}
            >
              {k.label} ({kindCounts[k.id]})
            </button>
          ))}
        </div>
        <input
          className="notes-search"
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="loading" style={{ padding: "2rem" }}>Loading...</div>}

      {!loading && visible.length === 0 && (
        <div className="notes-empty-state">
          {search ? "No matches." : filterKind !== "all" ? `No ${filterKind}s yet.` : "Nothing here yet."}
        </div>
      )}

      <div className="notes-list">
        {visible.map((rec) => (
          <NoteCard
            key={rec.rkey}
            rec={rec}
            isOwner={rec.authorDid === vault.session.did}
            isExpanded={expanded === rec.rkey}
            orgName={rec.orgRkey !== "personal" ? orgNames.get(rec.orgRkey) : undefined}
            onToggleExpand={() => setExpanded(expanded === rec.rkey ? null : rec.rkey)}
            onEdit={() => { setEditing(rec); setShowForm(true); }}
            onDelete={() => handleDelete(rec)}
            onTogglePin={() => handleTogglePin(rec)}
          />
        ))}
      </div>

      {showForm && (
        <NoteForm
          existing={editing ?? undefined}
          defaultKind={filterKind !== "all" ? filterKind : "note"}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function NoteCard({
  rec,
  isOwner,
  isExpanded,
  orgName,
  onToggleExpand,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  rec: NoteRecord;
  isOwner: boolean;
  isExpanded: boolean;
  orgName?: string;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const n = rec.note;
  const kindIcon = n.kind === "bookmark" ? "\u{1F517}" : n.kind === "snippet" ? "\u{1F4CB}" : "\u{1F4DD}";

  return (
    <div className={`note-card${n.pinned ? " pinned" : ""}${isExpanded ? " expanded" : ""}`}>
      <div className="note-card-header" onClick={onToggleExpand}>
        <span className="note-kind-icon">{kindIcon}</span>
        <span className="note-title">{n.title}</span>
        {n.pinned && <span className="note-pin-badge">pinned</span>}
        {n.language && <span className="note-lang-badge">{n.language}</span>}
        {orgName && <span className="note-org-badge">{orgName}</span>}
      </div>

      {n.kind === "bookmark" && n.url && (
        <div className="note-url">
          <a href={n.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            {n.url}
          </a>
        </div>
      )}

      {isExpanded && (
        <div className="note-card-body">
          <div className={`note-body-text${n.kind === "snippet" ? " snippet" : ""}`}>
            {n.kind === "snippet" ? <pre>{n.body}</pre> : <p>{n.body}</p>}
          </div>
          {n.tags && n.tags.length > 0 && (
            <div className="note-tags">
              {n.tags.map((t) => <span key={t} className="note-tag">{t}</span>)}
            </div>
          )}
          {isOwner && (
            <div className="note-card-actions">
              <button className="btn-secondary btn-sm" onClick={onTogglePin}>
                {n.pinned ? "Unpin" : "Pin"}
              </button>
              <button className="btn-secondary btn-sm" onClick={onEdit}>Edit</button>
              <button className="note-delete-btn" onClick={onDelete}>&times;</button>
            </div>
          )}
        </div>
      )}

      {!isExpanded && n.body && (
        <div className="note-preview" onClick={onToggleExpand}>
          {n.body.slice(0, 120)}{n.body.length > 120 ? "..." : ""}
        </div>
      )}
    </div>
  );
}

function NoteForm({
  existing,
  defaultKind,
  onSave,
  onCancel,
}: {
  existing?: NoteRecord;
  defaultKind: NoteKind;
  onSave: (note: Note, existingRkey?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<NoteKind>(existing?.note.kind ?? defaultKind);
  const [title, setTitle] = useState(existing?.note.title ?? "");
  const [body, setBody] = useState(existing?.note.body ?? "");
  const [url, setUrl] = useState(existing?.note.url ?? "");
  const [language, setLanguage] = useState(existing?.note.language ?? "");
  const [tags, setTags] = useState(existing?.note.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await onSave({
        kind,
        title: title.trim(),
        body: body,
        url: kind === "bookmark" ? url.trim() || undefined : undefined,
        language: kind === "snippet" ? language.trim() || undefined : undefined,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        pinned: existing?.note.pinned ?? false,
        createdAt: existing?.note.createdAt ?? now,
        updatedAt: existing ? now : undefined,
      }, existing?.rkey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="note-form-overlay" onClick={onCancel}>
      <form className="note-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{existing ? "Edit" : "New"} {kind === "bookmark" ? "Bookmark" : kind === "snippet" ? "Snippet" : "Note"}</h3>

        <div className="note-form-kind-row">
          {NOTE_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`note-form-kind-btn${kind === k.id ? " active" : ""}`}
              onClick={() => setKind(k.id)}
            >
              {k.label.slice(0, -1)}
            </button>
          ))}
        </div>

        <input type="text" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />

        {kind === "bookmark" && (
          <input type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        )}

        {kind === "snippet" && (
          <input type="text" placeholder="Language (e.g. typescript, python)" value={language} onChange={(e) => setLanguage(e.target.value)} />
        )}

        <textarea
          placeholder={kind === "snippet" ? "Paste code here..." : kind === "bookmark" ? "Description (optional)" : "Write something..."}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={kind === "snippet" ? 10 : 5}
          className={kind === "snippet" ? "note-snippet-input" : ""}
        />

        <input type="text" placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />

        <div className="note-form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? "Saving..." : existing ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
