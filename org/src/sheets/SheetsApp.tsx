/**
 * SheetsApp — encrypted spreadsheet on ATProto.
 * Sheet list + full grid editor with formula engine.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type { SheetRecord } from "./types";
import { createBlankSheet } from "./types";
import { useSheet } from "./useSheet";
import { Grid } from "./Grid";
import { Toolbar } from "./Toolbar";
import {
  keyringRkeyForTier,
  loadPersonalSheets,
  loadOrgSheets,
  saveSheet,
  updateSheet,
  deleteSheet,
} from "./context";

type OrgFilter = "all" | "personal" | string;

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

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

export function SheetsApp({ vault, pds, orgs: sharedOrgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();
  const [sheets, setSheets] = useState<SheetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [activeRecord, setActiveRecord] = useState<SheetRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const loadedRef = useRef(false);

  // Sheet editor state
  const editor = useSheet();

  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const personal = await loadPersonalSheets(pds, vault.dek, vault.session.did);
        const orgSheets: SheetRecord[] = [];
        for (const ctx of sharedContexts.values()) {
          try { orgSheets.push(...await loadOrgSheets(pds, ctx)); } catch {}
        }
        setSheets([...personal, ...orgSheets]);
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

  const visible = useMemo(() => {
    let result = [...sheets];
    if (filterOrg === "personal") result = result.filter((s) => s.orgRkey === "personal");
    else if (filterOrg !== "all") result = result.filter((s) => s.orgRkey === filterOrg);
    result.sort((a, b) => {
      const aDate = a.sheet.updatedAt || a.sheet.createdAt;
      const bDate = b.sheet.updatedAt || b.sheet.createdAt;
      return bDate.localeCompare(aDate);
    });
    return result;
  }, [sheets, filterOrg]);

  // Open a sheet in the editor
  const openSheet = useCallback((rec: SheetRecord) => {
    editor.loadSheet(rec.sheet);
    setActiveRecord(rec);
  }, [editor]);

  // Create new blank sheet
  const createNew = useCallback(async () => {
    if (!pds || !vault) return;
    const blank = createBlankSheet("Untitled");
    const { dek, keyringRkey, orgRkey } = resolveDek(vault, activeOrg);
    const { rkey } = await saveSheet(pds, blank, dek, keyringRkey);
    const rec: SheetRecord = { rkey, sheet: blank, authorDid: vault.session.did, orgRkey };
    setSheets((prev) => [...prev, rec]);
    openSheet(rec);
  }, [pds, vault, activeOrg, openSheet]);

  // Save current sheet
  const handleSave = useCallback(async () => {
    if (!pds || !vault || !activeRecord) return;
    setSaving(true);
    try {
      const { dek, keyringRkey, orgRkey } = resolveDek(vault, activeOrg);
      const updatedSheet = { ...editor.sheet, updatedAt: new Date().toISOString() };
      const { rkey: newRkey } = await updateSheet(pds, activeRecord.rkey, updatedSheet, dek, keyringRkey);
      const newRec: SheetRecord = { rkey: newRkey, sheet: updatedSheet, authorDid: vault.session.did, orgRkey };
      setSheets((prev) => [...prev.filter((s) => s.rkey !== activeRecord.rkey), newRec]);
      setActiveRecord(newRec);
    } finally {
      setSaving(false);
    }
  }, [pds, vault, activeRecord, activeOrg, editor.sheet]);

  // Delete a sheet
  const handleDelete = useCallback(async (rec: SheetRecord) => {
    if (!pds || rec.authorDid !== vault?.session.did) return;
    await deleteSheet(pds, rec.rkey);
    setSheets((prev) => prev.filter((s) => s.rkey !== rec.rkey));
    if (activeRecord?.rkey === rec.rkey) setActiveRecord(null);
  }, [pds, vault, activeRecord]);

  // Back to list
  const backToList = useCallback(() => {
    setActiveRecord(null);
  }, []);

  if (!vault || !pds) {
    return (
      <div className="sheet-container">
        <div className="notes-empty-full">
          <p>Sign in to access spreadsheets.</p>
          <button className="btn-secondary" onClick={() => navigate("/")}>Back</button>
        </div>
      </div>
    );
  }

  // Active sheet editor view
  if (activeRecord) {
    const cellCount = Object.keys(editor.sheet.cells).length;
    return (
      <div className="sheet-container">
        <header className="sheet-header">
          <div className="sheet-header-left">
            <button className="back-btn" onClick={backToList} title="Back to list">&larr;</button>
            <input
              className="sheet-name-input"
              value={editor.sheet.name}
              onChange={(e) => editor.setName(e.target.value)}
            />
            <span className="sheet-meta-badge">{cellCount} cells</span>
          </div>
          <div className="sheet-header-right">
            <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => editor.addRows(50)}>+ Rows</button>
            <button className="btn-secondary btn-sm" onClick={() => editor.addCols(10)}>+ Cols</button>
          </div>
        </header>

        <Toolbar
          sheet={editor.sheet}
          sel={editor.sel}
          onCellEdit={editor.setCellRaw}
          onFormat={editor.setFormat}
          onStartEditing={() => editor.setSel({ ...editor.sel, editing: true })}
        />

        <Grid
          sheet={editor.sheet}
          sel={editor.sel}
          onSelect={editor.setSel}
          onCellEdit={editor.setCellRaw}
          onPaste={editor.setCellsBulk}
          onDeleteSelection={editor.deleteSelection}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onResizeCol={editor.resizeCol}
        />
      </div>
    );
  }

  // Sheet list view
  return (
    <div className="sheet-container">
      <header className="sheet-header">
        <div className="sheet-header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">&larr;</button>
          <h1>Sheets</h1>
        </div>
        <div className="sheet-header-right">
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
          <button className="btn-primary btn-sm" onClick={createNew}>+ New Sheet</button>
        </div>
      </header>

      {loading && <div className="loading" style={{ padding: "2rem" }}>Loading...</div>}

      <div className="sheet-list">
        {!loading && visible.length === 0 && (
          <div className="notes-empty-state">No sheets yet. Create one to get started.</div>
        )}
        {visible.map((rec) => (
          <div key={rec.rkey} className="sheet-list-card" onClick={() => openSheet(rec)}>
            <div className="sheet-list-card-top">
              <span className="sheet-list-card-name">{rec.sheet.name || "Untitled"}</span>
              {rec.orgRkey !== "personal" && (
                <span className="sheet-list-card-org">{orgNames.get(rec.orgRkey)}</span>
              )}
            </div>
            <div className="sheet-list-card-meta">
              <span>{Object.keys(rec.sheet.cells).length} cells</span>
              <span>{rec.sheet.colCount} cols x {rec.sheet.rowCount} rows</span>
              <span>{new Date(rec.sheet.updatedAt || rec.sheet.createdAt).toLocaleDateString()}</span>
            </div>
            {rec.authorDid === vault.session.did && (
              <button
                className="sheet-list-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(rec); }}
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
