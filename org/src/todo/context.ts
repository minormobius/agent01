/**
 * Todo context — encrypted to-do CRUD on ATProto.
 * Same seal/unseal pattern as calendar events.
 */

import { PdsClient } from "../pds";
import { sealRecord, unsealRecord } from "../crypto";
import type { TodoItem, TodoRecord } from "./types";
import type { OrgContext } from "../crm/types";
import {
  keyringRkeyForTier,
  SEALED_COLLECTION,
} from "../crm/context";

export const INNER_TYPE = "com.minomobi.vault.todo";

export { keyringRkeyForTier, SEALED_COLLECTION };

/** Load personal to-dos */
export async function loadPersonalTodos(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string
): Promise<TodoRecord[]> {
  const loaded: TodoRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { innerType, record } = await unsealRecord<TodoItem>(val, dek);
        if (innerType !== INNER_TYPE) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, todo: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch {
        // Can't decrypt
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

/** Load to-dos for an org context across all member PDSes */
export async function loadOrgTodos(
  client: PdsClient,
  orgCtx: OrgContext
): Promise<TodoRecord[]> {
  const all: TodoRecord[] = [];

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
          const { innerType, record } = await unsealRecord<TodoItem>(val, dek);
          if (innerType !== INNER_TYPE) continue;
          all.push({ rkey, todo: record, authorDid: did, orgRkey: orgCtx.org.rkey });
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

  return all;
}

/** Save a to-do (seal + create record) */
export async function saveTodo(
  client: PdsClient,
  todo: TodoItem,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(INNER_TYPE, todo, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

/** Update a to-do: delete old, create new */
export async function updateTodo(
  client: PdsClient,
  oldRkey: string,
  todo: TodoItem,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  await client.deleteRecord(SEALED_COLLECTION, oldRkey);
  return saveTodo(client, todo, dek, keyringRkey);
}

/** Delete a to-do */
export async function deleteTodo(
  client: PdsClient,
  rkey: string
): Promise<void> {
  await client.deleteRecord(SEALED_COLLECTION, rkey);
}
