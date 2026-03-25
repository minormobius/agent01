/**
 * Wave org context builder — resolves keyrings, DEKs, channels, threads, and ops
 * for a selected org. Pure async functions, no React dependency.
 */

import { PdsClient, resolvePds } from "../pds";
import {
  importPublicKey,
  fromBase64,
  toBase64,
  encrypt,
  decrypt,
  unwrapDekFromMember,
  generateTierDek,
  wrapDekForMember,
  exportPublicKey,
} from "../crypto";
import type { Membership, MembershipRecord, OrgRecord, Keyring, KeyringMemberEntry } from "../types";
import type {
  WaveOrgContext,
  WaveChannel,
  WaveChannelRecord,
  WaveThread,
  WaveThreadRecord,
  WaveOp,
  WaveOpRecord,
  MessagePayload,
  DocEditPayload,
} from "./types";

// ATProto collection names
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
const CHANNEL_COLLECTION = "com.minomobi.wave.channel";
const THREAD_COLLECTION = "com.minomobi.wave.thread";
const OP_COLLECTION = "com.minomobi.wave.op";
const ORG_COLLECTION = "com.minomobi.vault.org";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";

export function keyringRkeyForTier(orgRkey: string, tierName: string, epoch: number): string {
  return epoch === 0 ? `${orgRkey}:${tierName}` : `${orgRkey}:${tierName}:${epoch}`;
}

/** Build the full org context with DEKs and memberships. */
export async function buildOrgContext(
  client: PdsClient,
  orgRecord: OrgRecord,
  privateKey: CryptoKey,
  myDid: string,
): Promise<WaveOrgContext> {
  const founderDid = orgRecord.org.founderDid;
  const isFounder = founderDid === myDid;

  let founderService: string;
  if (isFounder) {
    founderService = client.getService();
  } else {
    founderService = await resolvePds(founderDid);
  }
  const controlClient = isFounder ? client : new PdsClient(founderService);

  // Fetch memberships
  const allMemberships: MembershipRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await controlClient.listRecordsFrom(founderDid, MEMBERSHIP_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as Membership;
      if (val.orgRkey === orgRecord.rkey) {
        const rkey = rec.uri.split("/").pop()!;
        allMemberships.push({ rkey, membership: val });
      }
    }
    cursor = page.cursor;
  } while (cursor);

  const myMembership = allMemberships.find((m) => m.membership.memberDid === myDid);
  if (!myMembership) throw new Error("You are not a member of this org");

  const myTierDef = orgRecord.org.tiers.find((t) => t.name === myMembership.membership.tierName);
  if (!myTierDef) throw new Error("Tier not found");

  // Unwrap DEKs
  const tierDeks = new Map<string, CryptoKey>();
  const keyringDeks = new Map<string, CryptoKey>();
  const accessibleTiers = orgRecord.org.tiers.filter((t) => t.level <= myTierDef.level);
  const diagLines: string[] = [];

  for (const tier of accessibleTiers) {
    const currentEpoch = tier.currentEpoch ?? 0;
    for (let epoch = 0; epoch <= currentEpoch; epoch++) {
      const rkey = keyringRkeyForTier(orgRecord.rkey, tier.name, epoch);
      try {
        const keyringRecord = await controlClient.getRecordFrom(founderDid, KEYRING_COLLECTION, rkey);
        if (!keyringRecord) {
          diagLines.push(`${tier.name}: keyring not found`);
          continue;
        }
        const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & { $type: string };
        const myEntry = keyringVal.members.find((m: KeyringMemberEntry) => m.did === myDid);
        if (!myEntry) {
          diagLines.push(`${tier.name}: not in keyring`);
          continue;
        }

        const wrappedDekB64 =
          typeof myEntry.wrappedDek === "string"
            ? myEntry.wrappedDek
            : (myEntry.wrappedDek as unknown as { $bytes: string }).$bytes;
        const writerPubB64 =
          typeof keyringVal.writerPublicKey === "string"
            ? keyringVal.writerPublicKey
            : (keyringVal.writerPublicKey as unknown as { $bytes: string }).$bytes;

        const writerPubBytes = fromBase64(writerPubB64);
        const wrappedDekBytes = fromBase64(wrappedDekB64);
        const writerPublicKey = await importPublicKey(writerPubBytes);
        const tierDek = await unwrapDekFromMember(wrappedDekBytes, privateKey, writerPublicKey);
        keyringDeks.set(rkey, tierDek);
        if (epoch === currentEpoch) {
          tierDeks.set(tier.name, tierDek);
        }
        diagLines.push(`${tier.name}: OK`);
      } catch (err) {
        diagLines.push(`${tier.name}: FAILED ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  return {
    org: orgRecord,
    service: founderService,
    founderDid,
    myTierName: myMembership.membership.tierName,
    myTierLevel: myTierDef.level,
    tierDeks,
    keyringDeks,
    memberships: allMemberships,
    diagnostics: diagLines.join("\n"),
  };
}

/** Load channels for an org. */
export async function loadChannels(
  client: PdsClient,
  ctx: WaveOrgContext,
  myDid: string,
): Promise<WaveChannelRecord[]> {
  const result: WaveChannelRecord[] = [];
  let cursor: string | undefined;
  const controlClient = ctx.founderDid === myDid ? client : new PdsClient(ctx.service);

  do {
    const page = await controlClient.listRecordsFrom(ctx.founderDid, CHANNEL_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as WaveChannel;
      if (val.orgRkey !== ctx.org.rkey) continue;
      const tierDef = ctx.org.org.tiers.find((t) => t.name === val.tierName);
      if (tierDef && tierDef.level <= ctx.myTierLevel) {
        const rkey = rec.uri.split("/").pop()!;
        result.push({ rkey, channel: val });
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return result;
}

/** Load threads for a channel (scans all member PDSes). */
export async function loadThreadsForChannel(
  client: PdsClient,
  ctx: WaveOrgContext,
  channelUri: string,
  myDid: string,
): Promise<WaveThreadRecord[]> {
  const result: WaveThreadRecord[] = [];
  const memberDids = ctx.memberships.map((m) => m.membership.memberDid);

  for (const did of memberDids) {
    try {
      let memberService: string;
      if (did === myDid) {
        memberService = client.getService();
      } else {
        memberService = await resolvePds(did);
      }
      const memberClient = did === myDid ? client : new PdsClient(memberService);

      let cursor: string | undefined;
      do {
        const page = await memberClient.listRecordsFrom(did, THREAD_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as WaveThread;
          if (val.channelUri === channelUri) {
            const rkey = rec.uri.split("/").pop()!;
            const handle = ctx.memberships.find((m) => m.membership.memberDid === did)?.membership.memberHandle;
            result.push({ rkey, thread: val, authorDid: did, authorHandle: handle });
          }
        }
        cursor = page.cursor;
      } while (cursor);
    } catch (err) {
      console.warn(`Failed to load threads from ${did}:`, err);
    }
  }

  result.sort((a, b) => a.thread.createdAt.localeCompare(b.thread.createdAt));
  return result;
}

/** Load ops for a thread (scans all member PDSes). */
export async function loadOpsForThread(
  client: PdsClient,
  ctx: WaveOrgContext,
  threadUri: string,
  myDid: string,
): Promise<WaveOpRecord[]> {
  const result: WaveOpRecord[] = [];
  const memberDids = ctx.memberships.map((m) => m.membership.memberDid);

  for (const did of memberDids) {
    try {
      let memberService: string;
      if (did === myDid) {
        memberService = client.getService();
      } else {
        memberService = await resolvePds(did);
      }
      const memberClient = did === myDid ? client : new PdsClient(memberService);

      let cursor: string | undefined;
      do {
        const page = await memberClient.listRecordsFrom(did, OP_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as WaveOp;
          if (val.threadUri === threadUri) {
            const rkey = rec.uri.split("/").pop()!;
            const handle = ctx.memberships.find((m) => m.membership.memberDid === did)?.membership.memberHandle;
            result.push({ rkey, op: val, authorDid: did, authorHandle: handle });
          }
        }
        cursor = page.cursor;
      } while (cursor);
    } catch (err) {
      console.warn(`Failed to load ops from ${did}:`, err);
    }
  }

  result.sort((a, b) => a.op.createdAt.localeCompare(b.op.createdAt));
  return result;
}

/** Decrypt a message or doc edit op. */
export async function decryptOp(
  op: WaveOp,
  ctx: WaveOrgContext,
): Promise<MessagePayload | DocEditPayload | null> {
  const dek =
    ctx.keyringDeks.get(op.keyringRkey) ??
    ctx.tierDeks.get(op.keyringRkey.split(":").slice(1, -1).join(":") || op.keyringRkey.split(":")[1]);
  if (!dek) return null;
  try {
    const iv = fromBase64(op.iv.$bytes);
    const ciphertext = fromBase64(op.ciphertext.$bytes);
    const plaintext = await decrypt(ciphertext, iv, dek);
    const json = new TextDecoder().decode(plaintext);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Encrypt and create a message op. */
export async function sendMessageOp(
  client: PdsClient,
  ctx: WaveOrgContext,
  threadAuthorDid: string,
  threadRkey: string,
  channelTierName: string,
  text: string,
  myDid: string,
  myHandle: string,
): Promise<WaveOpRecord> {
  const dek = ctx.tierDeks.get(channelTierName);
  if (!dek) {
    const available = [...ctx.tierDeks.keys()].join(", ");
    throw new Error(`No DEK for tier "${channelTierName}". Available: [${available}].\n\n--- Keyring Trace ---\n${ctx.diagnostics}`);
  }

  const krkey = keyringRkeyForTier(
    ctx.org.rkey,
    channelTierName,
    ctx.org.org.tiers.find((t) => t.name === channelTierName)?.currentEpoch ?? 0,
  );

  const payload: MessagePayload = { text };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const { iv, ciphertext } = await encrypt(plaintext, dek);

  const threadUri = `at://${threadAuthorDid}/${THREAD_COLLECTION}/${threadRkey}`;
  const record: WaveOp = {
    $type: OP_COLLECTION,
    threadUri,
    opType: "message",
    keyringRkey: krkey,
    iv: { $bytes: toBase64(iv) },
    ciphertext: { $bytes: toBase64(ciphertext) },
    createdAt: new Date().toISOString(),
  };

  const res = await client.createRecord(OP_COLLECTION, record);
  const rkey = res.uri.split("/").pop()!;
  return { rkey, op: record, authorDid: myDid, authorHandle: myHandle };
}

/** Encrypt and create a doc edit op. */
export async function sendDocEditOp(
  client: PdsClient,
  ctx: WaveOrgContext,
  threadAuthorDid: string,
  threadRkey: string,
  channelTierName: string,
  text: string,
  baseOpUri: string | undefined,
  myDid: string,
  myHandle: string,
): Promise<WaveOpRecord> {
  const dek = ctx.tierDeks.get(channelTierName);
  if (!dek) throw new Error(`No DEK for tier "${channelTierName}"`);

  const krkey = keyringRkeyForTier(
    ctx.org.rkey,
    channelTierName,
    ctx.org.org.tiers.find((t) => t.name === channelTierName)?.currentEpoch ?? 0,
  );

  const payload: DocEditPayload = { text, baseOpUri };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const { iv, ciphertext } = await encrypt(plaintext, dek);

  const threadUri = `at://${threadAuthorDid}/${THREAD_COLLECTION}/${threadRkey}`;
  const parentOps = baseOpUri ? [baseOpUri] : undefined;

  const record: WaveOp = {
    $type: OP_COLLECTION,
    threadUri,
    parentOps,
    opType: "doc_edit",
    keyringRkey: krkey,
    iv: { $bytes: toBase64(iv) },
    ciphertext: { $bytes: toBase64(ciphertext) },
    createdAt: new Date().toISOString(),
  };

  const res = await client.createRecord(OP_COLLECTION, record);
  const rkey = res.uri.split("/").pop()!;
  return { rkey, op: record, authorDid: myDid, authorHandle: myHandle };
}

/** Create a channel (founder only). */
export async function createChannelRecord(
  client: PdsClient,
  ctx: WaveOrgContext,
  name: string,
  tierName: string,
): Promise<void> {
  const record: WaveChannel = {
    $type: CHANNEL_COLLECTION,
    orgRkey: ctx.org.rkey,
    name,
    tierName,
    createdAt: new Date().toISOString(),
  };
  await client.createRecord(CHANNEL_COLLECTION, record);
}

/** Create a thread in a channel. */
export async function createThreadRecord(
  client: PdsClient,
  ctx: WaveOrgContext,
  channelRkey: string,
  threadType: "chat" | "doc",
  title?: string,
  myDid?: string,
  myHandle?: string,
): Promise<WaveThreadRecord> {
  const channelUri = `at://${ctx.founderDid}/${CHANNEL_COLLECTION}/${channelRkey}`;
  const record: WaveThread = {
    $type: THREAD_COLLECTION,
    channelUri,
    title,
    threadType,
    createdAt: new Date().toISOString(),
  };
  const res = await client.createRecord(THREAD_COLLECTION, record);
  const rkey = res.uri.split("/").pop()!;
  return { rkey, thread: record, authorDid: myDid!, authorHandle: myHandle };
}

/** Invite a member to the active org (wraps DEKs for them). */
export async function inviteMemberToOrg(
  client: PdsClient,
  ctx: WaveOrgContext,
  memberDid: string,
  memberHandle: string | undefined,
  tierName: string,
  myDid: string,
  myPrivateKey: CryptoKey,
  myPublicKey: CryptoKey,
): Promise<void> {
  // Get the member's public key from their PDS
  const memberService = await resolvePds(memberDid);
  const memberClient = new PdsClient(memberService);
  const pubRecord = await memberClient.getRecordFrom(memberDid, PUBKEY_COLLECTION, "self");
  if (!pubRecord) throw new Error("Invitee has no vault encryption key. They must log into the hub first.");
  const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
  const pubField = pubVal.publicKey as { $bytes: string };
  const memberPubKey = await importPublicKey(fromBase64(pubField.$bytes));

  // Create membership record
  const membership: Membership = {
    orgRkey: ctx.org.rkey,
    orgService: client.getService(),
    orgFounderDid: myDid,
    memberDid,
    memberHandle,
    tierName,
    invitedBy: myDid,
    createdAt: new Date().toISOString(),
  };
  await client.createRecord(MEMBERSHIP_COLLECTION, { $type: MEMBERSHIP_COLLECTION, ...membership });

  // Wrap DEKs for accessible tiers
  const memberTierDef = ctx.org.org.tiers.find((t) => t.name === tierName);
  if (!memberTierDef) throw new Error("Tier not found");
  const accessibleTiers = ctx.org.org.tiers.filter((t) => t.level <= memberTierDef.level);

  const pubKeyRaw = await exportPublicKey(myPublicKey);
  for (const tier of accessibleTiers) {
    const epoch = tier.currentEpoch ?? 0;
    const rkey = keyringRkeyForTier(ctx.org.rkey, tier.name, epoch);
    const existing = await client.getRecord(KEYRING_COLLECTION, rkey);

    if (existing) {
      const keyringVal = (existing as Record<string, unknown>).value as Keyring & { $type: string };
      const myDek = ctx.tierDeks.get(tier.name);
      if (!myDek) continue;
      const wrappedDek = await wrapDekForMember(myDek, myPrivateKey, memberPubKey);
      keyringVal.members.push({
        did: memberDid,
        wrappedDek: { $bytes: toBase64(wrappedDek) } as unknown as string,
      });
      keyringVal.writerDid = myDid;
      keyringVal.writerPublicKey = { $bytes: toBase64(pubKeyRaw) } as unknown as string;
      await client.putRecord(KEYRING_COLLECTION, rkey, keyringVal);
    }
  }
}

/** Create a new org with keyrings. */
export async function createOrgRecord(
  client: PdsClient,
  name: string,
  tierNames: string[],
  myDid: string,
  myHandle: string,
  myPrivateKey: CryptoKey,
  myPublicKey: CryptoKey,
): Promise<void> {
  const tiers = tierNames.map((n, i) => ({ name: n, level: i }));
  const org = {
    name,
    founderDid: myDid,
    tiers,
    createdAt: new Date().toISOString(),
  };
  const orgRes = await client.createRecord(ORG_COLLECTION, { $type: ORG_COLLECTION, ...org });
  const orgRkey = orgRes.uri.split("/").pop()!;

  const membership: Membership = {
    orgRkey,
    orgService: client.getService(),
    orgFounderDid: myDid,
    memberDid: myDid,
    memberHandle: myHandle,
    tierName: tiers[tiers.length - 1].name,
    invitedBy: myDid,
    createdAt: new Date().toISOString(),
  };
  await client.createRecord(MEMBERSHIP_COLLECTION, { $type: MEMBERSHIP_COLLECTION, ...membership });

  const pubKeyRaw = await exportPublicKey(myPublicKey);
  for (const tier of tiers) {
    const tierDek = await generateTierDek();
    const wrappedDek = await wrapDekForMember(tierDek, myPrivateKey, myPublicKey);
    const keyring: Keyring & { $type: string } = {
      $type: KEYRING_COLLECTION,
      orgRkey,
      tierName: tier.name,
      epoch: 0,
      writerDid: myDid,
      writerPublicKey: { $bytes: toBase64(pubKeyRaw) } as unknown as string,
      members: [{ did: myDid, wrappedDek: { $bytes: toBase64(wrappedDek) } as unknown as string }],
    };
    const rkey = `${orgRkey}:${tier.name}`;
    await client.putRecord(KEYRING_COLLECTION, rkey, keyring);
  }
}

// Re-export collection names for delete operations
export { CHANNEL_COLLECTION, THREAD_COLLECTION, MEMBERSHIP_COLLECTION, KEYRING_COLLECTION, OP_COLLECTION };
