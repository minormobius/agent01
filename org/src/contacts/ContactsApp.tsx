/**
 * ContactsApp — encrypted contact directory on ATProto.
 * Personal + org scoped.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type { Contact, ContactRecord } from "./types";
import {
  keyringRkeyForTier,
  loadPersonalContacts,
  loadOrgContacts,
  saveContact,
  updateContact,
  deleteContact,
} from "./context";

type OrgFilter = "all" | "personal" | string;

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

export function ContactsApp({ vault, pds, orgs: sharedOrgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();

  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactRecord | null>(null);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const personal = await loadPersonalContacts(pds, vault.dek, vault.session.did);
        const orgContacts: ContactRecord[] = [];
        for (const ctx of sharedContexts.values()) {
          try {
            orgContacts.push(...await loadOrgContacts(pds, ctx));
          } catch (err) {
            console.warn(`Contacts: failed to load org ${ctx.org.org.name}:`, err);
          }
        }
        setContacts([...personal, ...orgContacts]);
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
    let result = [...contacts];
    if (filterOrg === "personal") result = result.filter((c) => c.orgRkey === "personal");
    else if (filterOrg !== "all") result = result.filter((c) => c.orgRkey === filterOrg);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const ct = c.contact;
        return (ct.name?.toLowerCase().includes(q))
          || (ct.email?.toLowerCase().includes(q))
          || (ct.company?.toLowerCase().includes(q))
          || (ct.role?.toLowerCase().includes(q))
          || (ct.handle?.toLowerCase().includes(q));
      });
    }

    result.sort((a, b) => a.contact.name.localeCompare(b.contact.name));
    return result;
  }, [contacts, filterOrg, search]);

  const handleSave = useCallback(
    async (contact: Contact, existingRkey?: string) => {
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
        const { rkey: newRkey } = await updateContact(pds, existingRkey, contact, dek, keyringRkey);
        setContacts((prev) => [
          ...prev.filter((c) => c.rkey !== existingRkey),
          { rkey: newRkey, contact, authorDid: vault.session.did, orgRkey },
        ]);
      } else {
        const { rkey } = await saveContact(pds, contact, dek, keyringRkey);
        setContacts((prev) => [...prev, { rkey, contact, authorDid: vault.session.did, orgRkey }]);
      }

      setShowForm(false);
      setEditing(null);
    },
    [pds, vault, activeOrg],
  );

  const handleDelete = useCallback(
    async (rec: ContactRecord) => {
      if (!pds || rec.authorDid !== vault?.session.did) return;
      await deleteContact(pds, rec.rkey);
      setContacts((prev) => prev.filter((c) => c.rkey !== rec.rkey));
    },
    [pds, vault],
  );

  if (!vault || !pds) {
    return (
      <div className="contacts-container">
        <div className="contacts-empty">
          <p>Sign in to access contacts.</p>
          <button className="btn-secondary" onClick={() => navigate("/")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="contacts-container">
      <header className="contacts-header">
        <div className="contacts-header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">&larr;</button>
          <h1>Contacts</h1>
          <span className="contacts-count">{visible.length} contact{visible.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="contacts-header-right">
          <select
            className="contacts-select"
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
            + Add
          </button>
        </div>
      </header>

      <div className="contacts-search">
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="loading" style={{ padding: "2rem" }}>Loading...</div>}

      {!loading && visible.length === 0 && (
        <div className="contacts-empty-state">
          {search ? "No contacts match your search." : "No contacts yet."}
        </div>
      )}

      <div className="contacts-list">
        {visible.map((rec) => (
          <div key={rec.rkey} className="contact-card" onClick={() => {
            if (rec.authorDid === vault.session.did) {
              setEditing(rec);
              setShowForm(true);
            }
          }}>
            <div className="contact-avatar">
              {rec.contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="contact-info">
              <div className="contact-name">
                {rec.contact.name}
                {rec.contact.handle && <span className="contact-handle">@{rec.contact.handle}</span>}
              </div>
              <div className="contact-meta">
                {rec.contact.role && <span>{rec.contact.role}</span>}
                {rec.contact.company && <span>{rec.contact.company}</span>}
              </div>
              <div className="contact-details">
                {rec.contact.email && <span>{rec.contact.email}</span>}
                {rec.contact.phone && <span>{rec.contact.phone}</span>}
              </div>
              {rec.contact.tags && rec.contact.tags.length > 0 && (
                <div className="contact-tags">
                  {rec.contact.tags.map((t) => <span key={t} className="contact-tag">{t}</span>)}
                </div>
              )}
            </div>
            <div className="contact-right">
              {rec.orgRkey !== "personal" && (
                <span className="contact-org">{orgNames.get(rec.orgRkey) ?? rec.orgRkey}</span>
              )}
              {rec.authorDid === vault.session.did && (
                <button className="contact-delete" onClick={(e) => { e.stopPropagation(); handleDelete(rec); }} title="Delete">&times;</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <ContactForm
          existing={editing ?? undefined}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ContactForm({
  existing,
  onSave,
  onCancel,
}: {
  existing?: ContactRecord;
  onSave: (contact: Contact, existingRkey?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.contact.name ?? "");
  const [email, setEmail] = useState(existing?.contact.email ?? "");
  const [phone, setPhone] = useState(existing?.contact.phone ?? "");
  const [company, setCompany] = useState(existing?.contact.company ?? "");
  const [role, setRole] = useState(existing?.contact.role ?? "");
  const [notes, setNotes] = useState(existing?.contact.notes ?? "");
  const [tags, setTags] = useState(existing?.contact.tags?.join(", ") ?? "");
  const [handle, setHandle] = useState(existing?.contact.handle ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        role: role.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        handle: handle.trim() || undefined,
        createdAt: existing?.contact.createdAt ?? new Date().toISOString(),
      }, existing?.rkey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="contact-form-overlay" onClick={onCancel}>
      <form className="contact-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{existing ? "Edit Contact" : "New Contact"}</h3>
        <input type="text" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="contact-form-row">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="contact-form-row">
          <input type="text" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input type="text" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <input type="text" placeholder="ATProto handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <input type="text" placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
        <textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <div className="contact-form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Saving..." : existing ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
