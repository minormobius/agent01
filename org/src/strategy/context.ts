/**
 * Strategy context — encrypted decision matrix CRUD on ATProto.
 * Same sealed-envelope pattern as notes/todo/contacts.
 */

import { PdsClient } from "../pds";
import { sealRecord, unsealRecord } from "../crypto";
import type { DecisionMatrix, DecisionRecord } from "./types";
import type { OrgContext } from "../crm/types";
import { keyringRkeyForTier, SEALED_COLLECTION } from "../crm/context";

export const INNER_TYPE = "com.minomobi.vault.decision_matrix";

export { keyringRkeyForTier, SEALED_COLLECTION };

export async function loadPersonalDecisions(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string,
): Promise<DecisionRecord[]> {
  const loaded: DecisionRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if (val.innerType !== INNER_TYPE) continue;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { record } = await unsealRecord<DecisionMatrix>(val, dek);
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, matrix: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch { /* can't decrypt */ }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

export async function loadOrgDecisions(
  client: PdsClient,
  orgCtx: OrgContext,
): Promise<DecisionRecord[]> {
  const all: DecisionRecord[] = [];

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
          const { record } = await unsealRecord<DecisionMatrix>(val, dek);
          all.push({ rkey, matrix: record, authorDid: did, orgRkey: orgCtx.org.rkey });
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

export async function saveDecision(
  client: PdsClient,
  matrix: DecisionMatrix,
  dek: CryptoKey,
  keyringRkey: string,
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(INNER_TYPE, matrix, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

export async function updateDecision(
  client: PdsClient,
  oldRkey: string,
  matrix: DecisionMatrix,
  dek: CryptoKey,
  keyringRkey: string,
): Promise<{ rkey: string }> {
  await client.deleteRecord(SEALED_COLLECTION, oldRkey);
  return saveDecision(client, matrix, dek, keyringRkey);
}

export async function deleteDecision(
  client: PdsClient,
  rkey: string,
): Promise<void> {
  await client.deleteRecord(SEALED_COLLECTION, rkey);
}
