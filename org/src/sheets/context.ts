/**
 * Sheets context — encrypted spreadsheet CRUD on ATProto.
 */

import { PdsClient } from "../pds";
import { sealRecord, unsealRecord } from "../crypto";
import type { Sheet, SheetRecord } from "./types";
import type { OrgContext } from "../crm/types";
import { keyringRkeyForTier, SEALED_COLLECTION } from "../crm/context";

export const INNER_TYPE = "com.minomobi.vault.sheet";

export { keyringRkeyForTier, SEALED_COLLECTION };

export async function loadPersonalSheets(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string,
): Promise<SheetRecord[]> {
  const loaded: SheetRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if (val.innerType !== INNER_TYPE) continue;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { record } = await unsealRecord<Sheet>(val, dek);
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, sheet: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch { /* can't decrypt */ }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

export async function loadOrgSheets(
  client: PdsClient,
  orgCtx: OrgContext,
): Promise<SheetRecord[]> {
  const all: SheetRecord[] = [];

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
          const { record } = await unsealRecord<Sheet>(val, dek);
          all.push({ rkey, sheet: record, authorDid: did, orgRkey: orgCtx.org.rkey });
        } catch { /* can't decrypt */ }
      }
      cursor = page.cursor;
    } while (cursor);
  };

  const myDid = client.getSession()!.did;
  await loadFrom(myDid, true);
  for (const m of orgCtx.memberships) {
    if (m.membership.memberDid === myDid) continue;
    try { await loadFrom(m.membership.memberDid, false); } catch {}
  }

  return all;
}

export async function saveSheet(
  client: PdsClient,
  sheet: Sheet,
  dek: CryptoKey,
  keyringRkey: string,
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(INNER_TYPE, sheet, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

export async function updateSheet(
  client: PdsClient,
  oldRkey: string,
  sheet: Sheet,
  dek: CryptoKey,
  keyringRkey: string,
): Promise<{ rkey: string }> {
  await client.deleteRecord(SEALED_COLLECTION, oldRkey);
  return saveSheet(client, sheet, dek, keyringRkey);
}

export async function deleteSheet(
  client: PdsClient,
  rkey: string,
): Promise<void> {
  await client.deleteRecord(SEALED_COLLECTION, rkey);
}
