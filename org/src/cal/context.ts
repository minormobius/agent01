/**
 * Calendar context — encrypted event CRUD on ATProto.
 * Same seal/unseal pattern as CRM deals.
 */

import { PdsClient } from "../pds";
import { sealRecord, unsealRecord } from "../crypto";
import type { CalEvent, CalEventRecord } from "./types";
import type { OrgContext } from "../crm/types";
import {
  discoverOrgs,
  buildOrgContext,
  keyringRkeyForTier,
  SEALED_COLLECTION,
} from "../crm/context";

export const INNER_TYPE = "com.minomobi.cal.event";

// Re-export for convenience
export { discoverOrgs, buildOrgContext, keyringRkeyForTier, SEALED_COLLECTION };

/** Load personal calendar events */
export async function loadPersonalEvents(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string
): Promise<CalEventRecord[]> {
  const loaded: CalEventRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if (val.innerType !== INNER_TYPE) continue;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { record } = await unsealRecord<CalEvent>(val, dek);
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, event: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch {
        // Can't decrypt
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

/** Load events for an org context across all member PDSes */
export async function loadOrgEvents(
  client: PdsClient,
  orgCtx: OrgContext
): Promise<CalEventRecord[]> {
  const allEvents: CalEventRecord[] = [];

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
          const { record } = await unsealRecord<CalEvent>(val, dek);
          allEvents.push({ rkey, event: record, authorDid: did, orgRkey: orgCtx.org.rkey });
        } catch {
          // Can't decrypt
        }
      }
      cursor = page.cursor;
    } while (cursor);
  };

  const myDid = client.getSession()!.did;
  await loadFrom(myDid, true);

  for (const m of orgCtx.memberships) {
    if (m.membership.memberDid === myDid) continue;
    try {
      await loadFrom(m.membership.memberDid, false);
    } catch {
      // PDS unreachable
    }
  }

  return allEvents;
}

/** Save an event (seal + create record) */
export async function saveEvent(
  client: PdsClient,
  event: CalEvent,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(INNER_TYPE, event, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

/** Update an event: delete old, create new */
export async function updateEvent(
  client: PdsClient,
  oldRkey: string,
  event: CalEvent,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  await client.deleteRecord(SEALED_COLLECTION, oldRkey);
  return saveEvent(client, event, dek, keyringRkey);
}

/** Delete an event */
export async function deleteEvent(
  client: PdsClient,
  rkey: string
): Promise<void> {
  await client.deleteRecord(SEALED_COLLECTION, rkey);
}
