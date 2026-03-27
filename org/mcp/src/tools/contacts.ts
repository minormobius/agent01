/**
 * Contact/Directory tools — encrypted contact CRUD on ATProto.
 * Contacts link to deals, events, and tasks.
 */

import { PdsClient } from "../../../src/pds";
import { sealRecord, unsealRecord } from "../../../src/crypto";
import {
  keyringRkeyForTier,
  SEALED_COLLECTION,
} from "../../../src/crm/context";
import type { OrgContext } from "../../../src/crm/types";
import { state, requireVault } from "../state";

const INNER_TYPE = "com.minomobi.crm.contact";

export interface Contact {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
  tags?: string[];
  /** Linked deal rkeys */
  dealRkeys?: string[];
  /** ATProto DID if this contact has a Bluesky/PDS account */
  did?: string;
  handle?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ContactRecord {
  rkey: string;
  contact: Contact;
  authorDid: string;
  orgRkey: string;
}

async function loadPersonalContacts(client: PdsClient, dek: CryptoKey, ownerDid: string): Promise<ContactRecord[]> {
  const loaded: ContactRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if (val.innerType !== INNER_TYPE) continue;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { record } = await unsealRecord<Contact>(val, dek);
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, contact: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch { /* can't decrypt */ }
    }
    cursor = page.cursor;
  } while (cursor);
  return loaded;
}

async function loadOrgContacts(client: PdsClient, orgCtx: OrgContext): Promise<ContactRecord[]> {
  const all: ContactRecord[] = [];
  const myDid = client.getSession()!.did;

  const loadFrom = async (did: string, useAuth: boolean) => {
    let cursor: string | undefined;
    do {
      const page = useAuth
        ? await client.listRecords(SEALED_COLLECTION, 100, cursor)
        : await client.listRecordsFrom(did, SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
        if (val.innerType !== INNER_TYPE) continue;
        const recKeyring = val.keyringRkey as string;
        if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        const dek = orgCtx.keyringDeks.get(recKeyring);
        if (!dek) continue;
        try {
          const { record } = await unsealRecord<Contact>(val, dek);
          all.push({ rkey, contact: record, authorDid: did, orgRkey: orgCtx.org.rkey });
        } catch { /* can't decrypt */ }
      }
      cursor = page.cursor;
    } while (cursor);
  };

  await loadFrom(myDid, true);
  for (const m of orgCtx.memberships) {
    if (m.membership.memberDid === myDid) continue;
    try { await loadFrom(m.membership.memberDid, false); } catch { /* PDS unreachable */ }
  }
  return all;
}

async function loadAllContacts(): Promise<ContactRecord[]> {
  const vault = state.vault!;
  const all: ContactRecord[] = [];
  const personal = await loadPersonalContacts(vault.client, vault.dek, vault.did);
  all.push(...personal);
  for (const ctx of state.orgContexts.values()) {
    const orgContacts = await loadOrgContacts(vault.client, ctx);
    all.push(...orgContacts);
  }
  return all;
}

export const contactTools = {
  "list-contacts": {
    description: "List contacts. Filter by org, company, tag, or search text.",
    handler: async (args: { org?: string; company?: string; tag?: string; search?: string; maxResults?: number }) => {
      const vault = requireVault();
      const max = args.maxResults ?? 50;
      let contacts = await loadAllContacts();

      if (args.org === "personal") contacts = contacts.filter((c) => c.orgRkey === "personal");
      else if (args.org) contacts = contacts.filter((c) => c.orgRkey === args.org);
      if (args.company) {
        const co = args.company.toLowerCase();
        contacts = contacts.filter((c) => c.contact.company?.toLowerCase().includes(co));
      }
      if (args.tag) contacts = contacts.filter((c) => c.contact.tags?.includes(args.tag!));
      if (args.search) {
        const q = args.search.toLowerCase();
        contacts = contacts.filter((c) =>
          c.contact.name.toLowerCase().includes(q) ||
          c.contact.email?.toLowerCase().includes(q) ||
          c.contact.company?.toLowerCase().includes(q) ||
          c.contact.notes?.toLowerCase().includes(q)
        );
      }

      contacts.sort((a, b) => a.contact.name.localeCompare(b.contact.name));
      contacts = contacts.slice(0, max);

      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        return state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;
      };

      const lines = contacts.map((c) => {
        const parts = [`[${c.rkey}] ${c.contact.name}`];
        if (c.contact.company) parts.push(c.contact.company);
        if (c.contact.role) parts.push(c.contact.role);
        if (c.contact.email) parts.push(c.contact.email);
        parts.push(orgName(c.orgRkey));
        return `- ${parts.join(" | ")}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${contacts.length} contact(s)\n\n${lines.join("\n") || "(no contacts found)"}`,
        }],
      };
    },
  },

  "get-contact": {
    description: "Get full details of a contact including linked deals and history.",
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const contacts = await loadAllContacts();
      const c = contacts.find((x) => x.rkey === args.rkey);
      if (!c) return { content: [{ type: "text" as const, text: `Contact not found: ${args.rkey}` }] };

      const orgName = c.orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === c.orgRkey)?.org.name ?? c.orgRkey);

      return {
        content: [{
          type: "text" as const,
          text: [
            `Contact: ${c.contact.name}`,
            `Rkey: ${c.rkey}`,
            `Org: ${orgName}`,
            c.contact.company ? `Company: ${c.contact.company}` : null,
            c.contact.role ? `Role: ${c.contact.role}` : null,
            c.contact.email ? `Email: ${c.contact.email}` : null,
            c.contact.phone ? `Phone: ${c.contact.phone}` : null,
            c.contact.did ? `DID: ${c.contact.did}` : null,
            c.contact.handle ? `Handle: @${c.contact.handle}` : null,
            c.contact.notes ? `Notes: ${c.contact.notes}` : null,
            c.contact.tags?.length ? `Tags: ${c.contact.tags.join(", ")}` : null,
            c.contact.dealRkeys?.length ? `Linked deals: ${c.contact.dealRkeys.join(", ")}` : null,
            `Author: ${c.authorDid === vault.did ? `you (@${vault.handle})` : c.authorDid}`,
            `Created: ${c.contact.createdAt}`,
            c.contact.updatedAt ? `Updated: ${c.contact.updatedAt}` : null,
          ].filter(Boolean).join("\n"),
        }],
      };
    },
  },

  "create-contact": {
    description: "Create a new contact. Specify org for org directory, omit for personal.",
    handler: async (args: {
      name: string; email?: string; phone?: string; company?: string;
      role?: string; notes?: string; tags?: string[]; did?: string;
      handle?: string; org?: string;
    }) => {
      const vault = requireVault();

      const contact: Contact = {
        name: args.name,
        email: args.email,
        phone: args.phone,
        company: args.company,
        role: args.role,
        notes: args.notes,
        tags: args.tags,
        did: args.did,
        handle: args.handle,
        createdAt: new Date().toISOString(),
      };

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      if (args.org) {
        const ctx = state.orgContexts.get(args.org);
        if (!ctx) throw new Error(`Org not found: ${args.org}`);
        const tierDek = ctx.tierDeks.get(ctx.myTierName);
        if (!tierDek) throw new Error(`No access to tier: ${ctx.myTierName}`);
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === ctx.myTierName);
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, ctx.myTierName, tierDef?.currentEpoch ?? 0);
        orgRkey = ctx.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      const sealed = await sealRecord(INNER_TYPE, contact, keyringRkey, dek);
      const res = await vault.client.createRecord(SEALED_COLLECTION, sealed);
      const rkey = res.uri.split("/").pop()!;

      const orgName = orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === orgRkey)?.org.name ?? orgRkey);

      return {
        content: [{
          type: "text" as const,
          text: `Contact created: "${contact.name}" [${rkey}]\nOrg: ${orgName}${contact.company ? `\nCompany: ${contact.company}` : ""}${contact.email ? `\nEmail: ${contact.email}` : ""}`,
        }],
      };
    },
  },

  "update-contact": {
    description: "Update a contact's details.",
    handler: async (args: {
      rkey: string; name?: string; email?: string; phone?: string;
      company?: string; role?: string; notes?: string; tags?: string[];
      dealRkeys?: string[];
    }) => {
      const vault = requireVault();
      const contacts = await loadAllContacts();
      const existing = contacts.find((c) => c.rkey === args.rkey);
      if (!existing) throw new Error(`Contact not found: ${args.rkey}`);

      const updated: Contact = {
        ...existing.contact,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.email !== undefined ? { email: args.email } : {}),
        ...(args.phone !== undefined ? { phone: args.phone } : {}),
        ...(args.company !== undefined ? { company: args.company } : {}),
        ...(args.role !== undefined ? { role: args.role } : {}),
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.dealRkeys !== undefined ? { dealRkeys: args.dealRkeys } : {}),
        updatedAt: new Date().toISOString(),
      };

      let dek: CryptoKey;
      let keyringRkey: string;

      if (existing.orgRkey !== "personal") {
        const ctx = state.orgContexts.get(existing.orgRkey);
        if (!ctx) throw new Error("Org context not found");
        const tierDek = ctx.tierDeks.get(ctx.myTierName);
        if (!tierDek) throw new Error(`No access to tier: ${ctx.myTierName}`);
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === ctx.myTierName);
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, ctx.myTierName, tierDef?.currentEpoch ?? 0);
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      await vault.client.deleteRecord(SEALED_COLLECTION, args.rkey);
      const sealed = await sealRecord(INNER_TYPE, updated, keyringRkey, dek);
      const res = await vault.client.createRecord(SEALED_COLLECTION, sealed);
      const newRkey = res.uri.split("/").pop()!;

      return {
        content: [{
          type: "text" as const,
          text: `Contact updated: "${updated.name}" [${newRkey}]`,
        }],
      };
    },
  },

  "delete-contact": {
    description: "Delete a contact.",
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const contacts = await loadAllContacts();
      const existing = contacts.find((c) => c.rkey === args.rkey);
      if (!existing) throw new Error(`Contact not found: ${args.rkey}`);
      if (existing.authorDid !== vault.did) throw new Error("Cannot delete another member's contact");

      await vault.client.deleteRecord(SEALED_COLLECTION, args.rkey);
      return { content: [{ type: "text" as const, text: `Contact deleted: "${existing.contact.name}" [${args.rkey}]` }] };
    },
  },
};
