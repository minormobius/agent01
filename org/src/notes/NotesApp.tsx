/**
 * NotesApp — encrypted notes, bookmarks & snippets on ATProto.
 * One collection, three swim lanes via `kind` discriminator.
 * Supports encrypted file attachments via the blob layer.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type { Note, NoteRecord, NoteKind } from "./types";
import { NOTE_KINDS } from "./types";
import type { VaultBlobRef } from "../blobs";
import {
  encryptAndUploadAuto,
  fetchAndDecryptAuto,
  readFileAsBytes,
  blobToObjectUrl,
  downloadBlob,
  formatFileSize,
  isChunked,
} from "../blobs";
import { VoiceRecorder } from "./VoiceRecorder";
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

/** Resolve the DEK + keyringRkey for the current scope */
function resolveDek(
  vault: VaultState,
  activeOrg: OrgContext | null,
): { dek: CryptoKey; keyringRkey: string; orgRkey: string } {
  if (activeOrg) {
    const tierName = activeOrg.myTierName;
    const tierDek = activeOrg.tierDeks.get(tierName);
    if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
    const tierDef = activeOrg.org.org.tiers.find((t) => t.name === tierName);
    return {
      dek: tierDek,
      keyringRkey: keyringRkeyForTier(activeOrg.org.rkey, tierName, tierDef?.currentEpoch ?? 0),
      orgRkey: activeOrg.org.rkey,
    };
  }
  return { dek: vault.dek, keyringRkey: "self", orgRkey: "personal" };
}

/** Resolve the DEK for reading an existing record's attachments */
function resolveDekForRecord(
  vault: VaultState,
  rec: NoteRecord,
  sharedContexts: Map<string, OrgContext>,
): CryptoKey | null {
  if (rec.orgRkey === "personal") return vault.dek;
  const ctx = sharedContexts.get(rec.orgRkey);
  if (!ctx) return null;
  // For reading, any keyringDek works — the blob was encrypted with the tier DEK at write time
  const tierDek = ctx.tierDeks.get(ctx.myTierName);
  return tierDek ?? null;
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
    result.sort((a, b) => {
      if (a.note.pinned && !b.note.pinned) return -1;
      if (!a.note.pinned && b.note.pinned) return 1;
      const aDate = a.note.updatedAt || a.note.createdAt;
      const bDate = b.note.updatedAt || b.note.createdAt;
      return bDate.localeCompare(aDate);
    });
    return result;
  }, [notes, filterOrg, filterKind, search]);

  // Save note — handles blob uploads for pending files
  const handleSave = useCallback(
    async (note: Note, pendingFiles: File[], existingRkey?: string) => {
      if (!pds || !vault) return;

      const { dek, keyringRkey, orgRkey } = resolveDek(vault, activeOrg);

      // Upload pending files as encrypted blobs
      const newAttachments: VaultBlobRef[] = [];
      for (const file of pendingFiles) {
        const bytes = await readFileAsBytes(file);
        const ref = await encryptAndUploadAuto(pds, bytes, dek, file.type || "application/octet-stream", file.name);
        newAttachments.push(ref);
      }

      // Merge with existing attachments (carry forward unless removed)
      const allAttachments = [...(note.attachments || []), ...newAttachments];
      const finalNote: Note = {
        ...note,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      };

      if (existingRkey) {
        const { rkey: newRkey } = await updateNote(pds, existingRkey, finalNote, dek, keyringRkey);
        setNotes((prev) => [
          ...prev.filter((n) => n.rkey !== existingRkey),
          { rkey: newRkey, note: finalNote, authorDid: vault.session.did, orgRkey },
        ]);
      } else {
        const { rkey } = await saveNote(pds, finalNote, dek, keyringRkey);
        setNotes((prev) => [...prev, { rkey, note: finalNote, authorDid: vault.session.did, orgRkey }]);
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

  // Download an attachment
  const handleDownloadAttachment = useCallback(
    async (rec: NoteRecord, ref: VaultBlobRef) => {
      if (!pds || !vault) return;
      const dek = resolveDekForRecord(vault, rec, sharedContexts);
      if (!dek) return;
      const { data, mimeType, filename } = await fetchAndDecryptAuto(pds, ref, dek);
      downloadBlob(data, mimeType, filename || "attachment");
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
            pds={pds}
            vault={vault}
            sharedContexts={sharedContexts}
            isOwner={rec.authorDid === vault.session.did}
            isExpanded={expanded === rec.rkey}
            orgName={rec.orgRkey !== "personal" ? orgNames.get(rec.orgRkey) : undefined}
            onToggleExpand={() => setExpanded(expanded === rec.rkey ? null : rec.rkey)}
            onEdit={() => { setEditing(rec); setShowForm(true); }}
            onDelete={() => handleDelete(rec)}
            onTogglePin={() => handleTogglePin(rec)}
            onDownload={(ref) => handleDownloadAttachment(rec, ref)}
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

// ── NoteCard ──

function NoteCard({
  rec,
  pds,
  vault,
  sharedContexts,
  isOwner,
  isExpanded,
  orgName,
  onToggleExpand,
  onEdit,
  onDelete,
  onTogglePin,
  onDownload,
}: {
  rec: NoteRecord;
  pds: PdsClient;
  vault: VaultState;
  sharedContexts: Map<string, OrgContext>;
  isOwner: boolean;
  isExpanded: boolean;
  orgName?: string;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onDownload: (ref: VaultBlobRef) => void;
}) {
  const n = rec.note;
  const kindIcon = n.kind === "bookmark" ? "\u{1F517}" : n.kind === "snippet" ? "\u{1F4CB}" : "\u{1F4DD}";
  const attachments = n.attachments || [];
  const attachCount = attachments.length;
  const hasAudio = attachments.some((a) => (isChunked(a) ? a.mimeType : a.mimeType).startsWith("audio/"));

  // For inline image previews, we decrypt on expand
  const [previews, setPreviews] = useState<Map<number, string>>(new Map());

  const loadPreview = useCallback(async (idx: number, ref: VaultBlobRef) => {
    if (previews.has(idx)) return;
    const dek = resolveDekForRecord(vault, rec, sharedContexts);
    if (!dek) return;
    try {
      const { data, mimeType } = await fetchAndDecryptAuto(pds, ref, dek);
      if (mimeType.startsWith("image/") || mimeType.startsWith("audio/")) {
        const url = blobToObjectUrl(data, mimeType);
        setPreviews((prev) => new Map(prev).set(idx, url));
      }
    } catch {
      // Can't preview — that's fine
    }
  }, [pds, vault, rec, sharedContexts, previews]);

  // Load image and audio previews when expanded
  useEffect(() => {
    if (!isExpanded) return;
    attachments.forEach((ref, i) => {
      const mime = isChunked(ref) ? ref.mimeType : ref.mimeType;
      if (mime.startsWith("image/") || mime.startsWith("audio/")) loadPreview(i, ref);
    });
  }, [isExpanded, attachments, loadPreview]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  return (
    <div className={`note-card${n.pinned ? " pinned" : ""}${isExpanded ? " expanded" : ""}`}>
      <div className="note-card-header" onClick={onToggleExpand}>
        <span className="note-kind-icon">{kindIcon}</span>
        <span className="note-title">{n.title}</span>
        {hasAudio && <span className="note-voice-badge">voice</span>}
        {attachCount > 0 && <span className="note-attach-badge">{attachCount} file{attachCount !== 1 ? "s" : ""}</span>}
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

          {attachments.length > 0 && (
            <div className="note-attachments">
              {attachments.map((ref, i) => {
                const name = isChunked(ref) ? ref.filename : ref.filename;
                const size = isChunked(ref) ? ref.size : ref.size;
                const mime = isChunked(ref) ? ref.mimeType : ref.mimeType;
                const previewUrl = previews.get(i);

                const isAudio = mime.startsWith("audio/");
                const isImage = mime.startsWith("image/");

                return (
                  <div key={i} className={`note-attachment${isAudio ? " audio" : ""}`}>
                    {previewUrl && isImage && (
                      <img src={previewUrl} alt={name || "attachment"} className="note-attach-preview" />
                    )}
                    {previewUrl && isAudio && (
                      <audio src={previewUrl} controls className="note-attach-audio" />
                    )}
                    <div className="note-attach-info">
                      <span className="note-attach-name">{name || "attachment"}</span>
                      <span className="note-attach-meta">{mime} &middot; {formatFileSize(size)}</span>
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); onDownload(ref); }}
                    >
                      Download
                    </button>
                  </div>
                );
              })}
            </div>
          )}

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

// ── NoteForm ──

function NoteForm({
  existing,
  defaultKind,
  onSave,
  onCancel,
}: {
  existing?: NoteRecord;
  defaultKind: NoteKind;
  onSave: (note: Note, pendingFiles: File[], existingRkey?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<NoteKind>(existing?.note.kind ?? defaultKind);
  const [title, setTitle] = useState(existing?.note.title ?? "");
  const [body, setBody] = useState(existing?.note.body ?? "");
  const [url, setUrl] = useState(existing?.note.url ?? "");
  const [language, setLanguage] = useState(existing?.note.language ?? "");
  const [tags, setTags] = useState(existing?.note.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  // File management
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [keptAttachments, setKeptAttachments] = useState<VaultBlobRef[]>(existing?.note.attachments || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemovePending = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRemoveExisting = (idx: number) => {
    setKeptAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

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
        attachments: keptAttachments.length > 0 ? keptAttachments : undefined,
        createdAt: existing?.note.createdAt ?? now,
        updatedAt: existing ? now : undefined,
      }, pendingFiles, existing?.rkey);
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

        {/* Attachments section */}
        <div className="note-form-attachments">
          <div className="note-form-attach-header">
            <span>Attachments</span>
            <div className="note-form-attach-actions">
              <VoiceRecorder onRecorded={(file) => setPendingFiles((prev) => [...prev, file])} />
              <button type="button" className="btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                + File
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleAddFiles}
            />
          </div>

          {/* Existing (kept) attachments */}
          {keptAttachments.map((ref, i) => {
            const name = isChunked(ref) ? ref.filename : ref.filename;
            const size = isChunked(ref) ? ref.size : ref.size;
            return (
              <div key={`existing-${i}`} className="note-form-attach-item">
                <span className="note-form-attach-name">{name || "attachment"}</span>
                <span className="note-form-attach-size">{formatFileSize(size)}</span>
                <button type="button" className="note-form-attach-remove" onClick={() => handleRemoveExisting(i)}>&times;</button>
              </div>
            );
          })}

          {/* Pending new files */}
          {pendingFiles.map((file, i) => (
            <div key={`pending-${i}`} className="note-form-attach-item pending">
              <span className="note-form-attach-name">{file.name}</span>
              <span className="note-form-attach-size">{formatFileSize(file.size)}</span>
              <button type="button" className="note-form-attach-remove" onClick={() => handleRemovePending(i)}>&times;</button>
            </div>
          ))}

          {keptAttachments.length === 0 && pendingFiles.length === 0 && (
            <div className="note-form-attach-empty">No attachments</div>
          )}
        </div>

        <div className="note-form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? (pendingFiles.length > 0 ? "Uploading..." : "Saving...") : existing ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
