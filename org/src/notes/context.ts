/**
 * Notes context — encrypted note/bookmark/snippet CRUD on ATProto.
 */

import { PdsClient } from "../pds";
import { sealRecord, unsealRecord } from "../crypto";
import type { Note, NoteRecord } from "./types";
import type { OrgContext } from "../crm/types";
import { keyringRkeyForTier, SEALED_COLLECTION } from "../crm/context";

export const INNER_TYPE = "com.minomobi.vault.note";

export { keyringRkeyForTier, SEALED_COLLECTION };

export async function loadPersonalNotes(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string
): Promise<NoteRecord[]> {
  const loaded: NoteRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { innerType, record } = await unsealRecord<Note>(val, dek);
        if (innerType !== INNER_TYPE) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, note: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch { /* can't decrypt */ }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

export async function loadOrgNotes(
  client: PdsClient,
  orgCtx: OrgContext
): Promise<NoteRecord[]> {
  const all: NoteRecord[] = [];

  const loadFrom = async (did: string, useAuth: boolean) => {
    let cursor: string | undefined;
    do {
      const page = useAuth
        ? await client.listRecords(SEALED_COLLECTION, 100, cursor)
        : await client.listRecordsFrom(did, SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
        const recKeyring = val.keyringRkey as string;
        if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        const dek = orgCtx.keyringDeks.get(recKeyring);
        if (!dek) continue;
        try {
          const { innerType, record } = await unsealRecord<Note>(val, dek);
          if (innerType !== INNER_TYPE) continue;
          all.push({ rkey, note: record, authorDid: did, orgRkey: orgCtx.org.rkey });
        } catch { /* can't decrypt */ }
      }
      cursor = page.cursor;
    } while (cursor);
  };

  const myDid = client.getSession()!.did;
  await loadFrom(myDid, true);
  for (const m of orgCtx.memberships) {
    if (m.membership.memberDid === myDid) continue;
    try { await loadFrom(m.membership.memberDid, false); } catch { /* PDS unreachable */ }
  }

  return all;
}

export async function saveNote(
  client: PdsClient,
  note: Note,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(INNER_TYPE, note, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

export async function updateNote(
  client: PdsClient,
  oldRkey: string,
  note: Note,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  await client.deleteRecord(SEALED_COLLECTION, oldRkey);
  return saveNote(client, note, dek, keyringRkey);
}

export async function deleteNote(
  client: PdsClient,
  rkey: string
): Promise<void> {
  await client.deleteRecord(SEALED_COLLECTION, rkey);
}
