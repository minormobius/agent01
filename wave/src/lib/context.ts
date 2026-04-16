/**
 * Pure async functions for vault bootstrap, org discovery, and Wave CRUD.
 * No React state — components call these and manage their own state.
 */

import { PdsClient, resolveHandle, resolvePds } from './pds';
import {
  deriveKek,
  generateIdentityKey,
  exportPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  importPublicKey,
  deriveDek,
  encrypt,
  decrypt,
  toBase64,
  fromBase64,
  unwrapDekFromMember,
  generateTierDek,
  wrapDekForMember,
} from '../crypto';
import type {
  Org,
  OrgRecord,
  OrgBookmark,
  Membership,
  MembershipRecord,
  KeyringMemberEntry,
  Keyring,
  WaveOrgContext,
  WaveChannel,
  WaveChannelRecord,
  WaveThread,
  WaveThreadRecord,
  WaveOp,
  WaveOpRecord,
  MessagePayload,
  DocEditPayload,
} from '../types';
import type { AuthUser } from './auth';

// --- ATProto collection names ---
const IDENTITY_COLLECTION = 'com.minomobi.vault.wrappedIdentity';
const PUBKEY_COLLECTION = 'com.minomobi.vault.encryptionKey';
const ORG_COLLECTION = 'com.minomobi.vault.org';
const MEMBERSHIP_COLLECTION = 'com.minomobi.vault.membership';
const KEYRING_COLLECTION = 'com.minomobi.vault.keyring';
const BOOKMARK_COLLECTION = 'com.minomobi.vault.orgBookmark';
export const CHANNEL_COLLECTION = 'com.minomobi.wave.channel';
export const THREAD_COLLECTION = 'com.minomobi.wave.thread';
export const OP_COLLECTION = 'com.minomobi.wave.op';

export function keyringRkeyForTier(orgRkey: string, tierName: string, epoch: number): string {
  return epoch === 0 ? `${orgRkey}:${tierName}` : `${orgRkey}:${tierName}:${epoch}`;
}

export interface IdentityKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

// --- Vault bootstrap ---

export async function bootstrapVault(
  client: PdsClient,
  session: AuthUser,
  passphrase: string,
): Promise<{ identityKeys: IdentityKeys; selfDek: CryptoKey }> {
  const userPds = await resolvePds(session.did);
  client.setUserPds(userPds);

  const salt = new TextEncoder().encode(session.did + ':vault-kek');
  const kek = await deriveKek(passphrase, salt);

  const existing = await client.getRecord(IDENTITY_COLLECTION, 'self');

  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  if (existing) {
    const val = existing.value as Record<string, unknown>;
    const wrappedField = val.wrappedKey as { $bytes: string };
    try {
      privateKey = await unwrapPrivateKey(fromBase64(wrappedField.$bytes), kek);
    } catch {
      throw new Error('Wrong vault passphrase.');
    }
    const pubRecord = await client.getRecord(PUBKEY_COLLECTION, 'self');
    if (!pubRecord) throw new Error('Vault corrupted: missing public key.');
    const pubVal = pubRecord.value as Record<string, unknown>;
    const pubField = pubVal.publicKey as { $bytes: string };
    publicKey = await importPublicKey(fromBase64(pubField.$bytes));
  } else {
    const keyPair = await generateIdentityKey();
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;

    const wrappedKey = await wrapPrivateKey(privateKey, kek);
    const pubKeyRaw = await exportPublicKey(publicKey);

    await client.putRecord(IDENTITY_COLLECTION, 'self', {
      $type: IDENTITY_COLLECTION,
      wrappedKey: { $bytes: toBase64(wrappedKey) },
      algorithm: 'PBKDF2-SHA256',
      salt: { $bytes: toBase64(salt) },
      iterations: 600000,
      createdAt: new Date().toISOString(),
    });
    await client.putRecord(PUBKEY_COLLECTION, 'self', {
      $type: PUBKEY_COLLECTION,
      publicKey: { $bytes: toBase64(pubKeyRaw) },
      algorithm: 'ECDH-P256',
      createdAt: new Date().toISOString(),
    });
  }

  const selfDek = await deriveDek(privateKey, publicKey);
  return { identityKeys: { privateKey, publicKey }, selfDek };
}

// --- Org discovery ---

export async function discoverOrgs(client: PdsClient): Promise<OrgRecord[]> {
  const foundedOrgs: OrgRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as Org;
      const rkey = rec.uri.split('/').pop()!;
      foundedOrgs.push({ rkey, org: val });
    }
    cursor = page.cursor;
  } while (cursor);

  const bookmarks: Array<{ rkey: string; bookmark: OrgBookmark }> = [];
  cursor = undefined;
  do {
    const page = await client.listRecords(BOOKMARK_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as OrgBookmark;
      const rkey = rec.uri.split('/').pop()!;
      bookmarks.push({ rkey, bookmark: val });
    }
    cursor = page.cursor;
  } while (cursor);

  const joinedOrgs: OrgRecord[] = [];
  for (const bm of bookmarks) {
    try {
      const founderClient = new PdsClient(await resolvePds(bm.bookmark.founderDid));
      const orgRec = await founderClient.getRecordFrom(
        bm.bookmark.founderDid, ORG_COLLECTION, bm.bookmark.orgRkey,
      );
      if (!orgRec) continue;
      const val = (orgRec as Record<string, unknown>).value as unknown as Org;
      joinedOrgs.push({ rkey: bm.bookmark.orgRkey, org: val });
    } catch (err) {
      console.warn('Failed to fetch joined org:', err);
    }
  }

  return [...foundedOrgs, ...joinedOrgs];
}

// --- Build org context ---

export async function buildOrgContext(
  client: PdsClient,
  orgRecord: OrgRecord,
  privateKey: CryptoKey,
  myDid: string,
): Promise<WaveOrgContext> {
  const founderDid = orgRecord.org.founderDid;
  const founderService = await resolvePds(founderDid);

  const allMemberships: MembershipRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listRecordsFrom(founderDid, MEMBERSHIP_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as Membership;
      if (val.orgRkey === orgRecord.rkey) {
        const rkey = rec.uri.split('/').pop()!;
        allMemberships.push({ rkey, membership: val });
      }
    }
    cursor = page.cursor;
  } while (cursor);

  const myMembership = allMemberships.find(m => m.membership.memberDid === myDid);
  if (!myMembership) throw new Error('You are not a member of this org');

  const myTierDef = orgRecord.org.tiers.find(t => t.name === myMembership.membership.tierName);
  if (!myTierDef) throw new Error('Tier not found');

  const tierDeks = new Map<string, CryptoKey>();
  const keyringDeks = new Map<string, CryptoKey>();
  const accessibleTiers = orgRecord.org.tiers.filter(t => t.level <= myTierDef.level);
  const diagLines: string[] = [];

  for (const tier of accessibleTiers) {
    const currentEpoch = tier.currentEpoch ?? 0;
    for (let epoch = 0; epoch <= currentEpoch; epoch++) {
      const rkey = keyringRkeyForTier(orgRecord.rkey, tier.name, epoch);
      try {
        const keyringRecord = await client.getRecordFrom(founderDid, KEYRING_COLLECTION, rkey);
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

        const wrappedDekB64 = typeof myEntry.wrappedDek === 'string'
          ? myEntry.wrappedDek
          : (myEntry.wrappedDek as unknown as { $bytes: string }).$bytes;
        const writerPubB64 = typeof keyringVal.writerPublicKey === 'string'
          ? keyringVal.writerPublicKey
          : (keyringVal.writerPublicKey as unknown as { $bytes: string }).$bytes;

        const writerPublicKey = await importPublicKey(fromBase64(writerPubB64));
        const tierDek = await unwrapDekFromMember(fromBase64(wrappedDekB64), privateKey, writerPublicKey);
        keyringDeks.set(rkey, tierDek);
        if (epoch === currentEpoch) tierDeks.set(tier.name, tierDek);
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
    diagnostics: diagLines.join('\n'),
  };
}

// --- Channel CRUD ---

export async function loadChannels(
  client: PdsClient,
  ctx: WaveOrgContext,
): Promise<WaveChannelRecord[]> {
  const result: WaveChannelRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listRecordsFrom(ctx.founderDid, CHANNEL_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as WaveChannel;
      if (val.orgRkey !== ctx.org.rkey) continue;
      const tierDef = ctx.org.org.tiers.find(t => t.name === val.tierName);
      if (tierDef && tierDef.level <= ctx.myTierLevel) {
        const rkey = rec.uri.split('/').pop()!;
        result.push({ rkey, channel: val });
      }
    }
    cursor = page.cursor;
  } while (cursor);
  return result;
}

export async function createChannel(
  client: PdsClient,
  ctx: WaveOrgContext,
  name: string,
  tierName?: string,
): Promise<void> {
  const accessibleTiers = ctx.org.org.tiers
    .filter(t => t.level <= ctx.myTierLevel)
    .sort((a, b) => a.level - b.level);
  const resolvedTier = tierName ?? accessibleTiers[0]?.name ?? ctx.myTierName;
  await client.createRecord(CHANNEL_COLLECTION, {
    $type: CHANNEL_COLLECTION,
    orgRkey: ctx.org.rkey,
    name,
    tierName: resolvedTier,
    createdAt: new Date().toISOString(),
  } satisfies WaveChannel);
}

export async function deleteChannel(client: PdsClient, rkey: string): Promise<void> {
  await client.deleteRecord(CHANNEL_COLLECTION, rkey);
}

// --- Thread CRUD ---

export async function loadThreadsForChannel(
  client: PdsClient,
  ctx: WaveOrgContext,
  channelUri: string,
): Promise<WaveThreadRecord[]> {
  const result: WaveThreadRecord[] = [];
  for (const m of ctx.memberships) {
    const did = m.membership.memberDid;
    try {
      let cursor: string | undefined;
      do {
        const page = await client.listRecordsFrom(did, THREAD_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as WaveThread;
          if (val.channelUri === channelUri) {
            const rkey = rec.uri.split('/').pop()!;
            result.push({ rkey, thread: val, authorDid: did, authorHandle: m.membership.memberHandle });
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

export async function createThread(
  client: PdsClient,
  ctx: WaveOrgContext,
  channelRkey: string,
  myDid: string,
  myHandle: string,
  title?: string,
  threadType: 'chat' | 'doc' = 'chat',
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
  const rkey = res.uri.split('/').pop()!;
  return { rkey, thread: record, authorDid: myDid, authorHandle: myHandle };
}

export async function deleteThread(client: PdsClient, rkey: string): Promise<void> {
  await client.deleteRecord(THREAD_COLLECTION, rkey);
}

// --- Op CRUD ---

export async function loadOpsForThread(
  client: PdsClient,
  ctx: WaveOrgContext,
  threadUri: string,
): Promise<WaveOpRecord[]> {
  const result: WaveOpRecord[] = [];
  for (const m of ctx.memberships) {
    const did = m.membership.memberDid;
    try {
      let cursor: string | undefined;
      do {
        const page = await client.listRecordsFrom(did, OP_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as WaveOp;
          if (val.threadUri === threadUri) {
            const rkey = rec.uri.split('/').pop()!;
            result.push({ rkey, op: val, authorDid: did, authorHandle: m.membership.memberHandle });
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

export async function decryptOp(
  op: WaveOp,
  ctx: WaveOrgContext,
): Promise<MessagePayload | DocEditPayload | null> {
  const dek = ctx.keyringDeks.get(op.keyringRkey) ?? ctx.tierDeks.get(
    op.keyringRkey.split(':').slice(1, -1).join(':') || op.keyringRkey.split(':')[1],
  );
  if (!dek) return null;
  try {
    const iv = fromBase64(op.iv.$bytes);
    const ciphertext = fromBase64(op.ciphertext.$bytes);
    const plaintext = await decrypt(ciphertext, iv, dek);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

export async function sendMessage(
  client: PdsClient,
  ctx: WaveOrgContext,
  thread: WaveThreadRecord,
  channelTierName: string,
  text: string,
  myDid: string,
  myHandle: string,
): Promise<WaveOpRecord> {
  const dek = ctx.tierDeks.get(channelTierName);
  if (!dek) throw new Error(`No DEK for tier "${channelTierName}"`);
  const krkey = keyringRkeyForTier(
    ctx.org.rkey, channelTierName,
    ctx.org.org.tiers.find(t => t.name === channelTierName)?.currentEpoch ?? 0,
  );
  const payload: MessagePayload = { text };
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const { iv, ciphertext } = await encrypt(pt, dek);

  const threadUri = `at://${thread.authorDid}/${THREAD_COLLECTION}/${thread.rkey}`;
  const record: WaveOp = {
    $type: OP_COLLECTION,
    threadUri,
    opType: 'message',
    keyringRkey: krkey,
    iv: { $bytes: toBase64(iv) },
    ciphertext: { $bytes: toBase64(ciphertext) },
    createdAt: new Date().toISOString(),
  };
  const res = await client.createRecord(OP_COLLECTION, record);
  const rkey = res.uri.split('/').pop()!;
  return { rkey, op: record, authorDid: myDid, authorHandle: myHandle };
}

export async function sendDocEdit(
  client: PdsClient,
  ctx: WaveOrgContext,
  thread: WaveThreadRecord,
  channelTierName: string,
  text: string,
  baseOpUri: string | undefined,
  myDid: string,
  myHandle: string,
): Promise<WaveOpRecord> {
  const dek = ctx.tierDeks.get(channelTierName);
  if (!dek) throw new Error(`No DEK for tier "${channelTierName}"`);
  const krkey = keyringRkeyForTier(
    ctx.org.rkey, channelTierName,
    ctx.org.org.tiers.find(t => t.name === channelTierName)?.currentEpoch ?? 0,
  );
  const payload: DocEditPayload = { text, baseOpUri };
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const { iv, ciphertext } = await encrypt(pt, dek);

  const threadUri = `at://${thread.authorDid}/${THREAD_COLLECTION}/${thread.rkey}`;
  const record: WaveOp = {
    $type: OP_COLLECTION,
    threadUri,
    parentOps: baseOpUri ? [baseOpUri] : undefined,
    opType: 'doc_edit',
    keyringRkey: krkey,
    iv: { $bytes: toBase64(iv) },
    ciphertext: { $bytes: toBase64(ciphertext) },
    createdAt: new Date().toISOString(),
  };
  const res = await client.createRecord(OP_COLLECTION, record);
  const rkey = res.uri.split('/').pop()!;
  return { rkey, op: record, authorDid: myDid, authorHandle: myHandle };
}

// --- Org management ---

export async function createOrg(
  client: PdsClient,
  identityKeys: IdentityKeys,
  myDid: string,
  myHandle: string,
  name: string,
  tierNames: string[],
): Promise<void> {
  const tiers = tierNames.map((n, i) => ({ name: n, level: i }));
  const org: Org = { name, founderDid: myDid, tiers, createdAt: new Date().toISOString() };
  const orgRes = await client.createRecord(ORG_COLLECTION, { $type: ORG_COLLECTION, ...org });
  const orgRkey = orgRes.uri.split('/').pop()!;

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

  const pubKeyRaw = await exportPublicKey(identityKeys.publicKey);
  for (const tier of tiers) {
    const tierDek = await generateTierDek();
    const wrappedDek = await wrapDekForMember(tierDek, identityKeys.privateKey, identityKeys.publicKey);
    const keyring: Keyring & { $type: string } = {
      $type: KEYRING_COLLECTION,
      orgRkey,
      tierName: tier.name,
      epoch: 0,
      writerDid: myDid,
      writerPublicKey: { $bytes: toBase64(pubKeyRaw) } as unknown as string,
      members: [{ did: myDid, wrappedDek: { $bytes: toBase64(wrappedDek) } as unknown as string }],
    };
    await client.putRecord(KEYRING_COLLECTION, `${orgRkey}:${tier.name}`, keyring);
  }
}

export async function inviteMember(
  client: PdsClient,
  ctx: WaveOrgContext,
  identityKeys: IdentityKeys,
  myDid: string,
  handleOrDid: string,
  tierName: string,
): Promise<void> {
  const memberDid = handleOrDid.startsWith('did:')
    ? handleOrDid
    : await resolveHandle(handleOrDid);
  const memberHandle = handleOrDid.startsWith('did:') ? undefined : handleOrDid.replace(/^@/, '');

  const memberService = await resolvePds(memberDid);
  const memberClient = new PdsClient(memberService);
  const pubRecord = await memberClient.getRecordFrom(memberDid, PUBKEY_COLLECTION, 'self');
  if (!pubRecord) throw new Error('Invitee has no vault encryption key. They must log into Wave first.');
  const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
  const pubField = pubVal.publicKey as { $bytes: string };
  const memberPubKey = await importPublicKey(fromBase64(pubField.$bytes));

  const membership: Membership = {
    orgRkey: ctx.org.rkey,
    orgService: client.getService(),
    orgFounderDid: ctx.founderDid,
    memberDid,
    memberHandle,
    tierName,
    invitedBy: myDid,
    createdAt: new Date().toISOString(),
  };
  await client.createRecord(MEMBERSHIP_COLLECTION, { $type: MEMBERSHIP_COLLECTION, ...membership });

  const memberTierDef = ctx.org.org.tiers.find(t => t.name === tierName);
  if (!memberTierDef) throw new Error('Tier not found');
  const accessibleTiers = ctx.org.org.tiers.filter(t => t.level <= memberTierDef.level);

  const pubKeyRaw = await exportPublicKey(identityKeys.publicKey);
  for (const tier of accessibleTiers) {
    const epoch = tier.currentEpoch ?? 0;
    const rkey = keyringRkeyForTier(ctx.org.rkey, tier.name, epoch);
    const existing = await client.getRecord(KEYRING_COLLECTION, rkey);
    if (!existing) continue;

    const keyringVal = (existing as Record<string, unknown>).value as Keyring & { $type: string };
    const myDek = ctx.tierDeks.get(tier.name);
    if (!myDek) continue;

    const wrappedDek = await wrapDekForMember(myDek, identityKeys.privateKey, memberPubKey);
    keyringVal.members.push({
      did: memberDid,
      wrappedDek: { $bytes: toBase64(wrappedDek) } as unknown as string,
    });
    keyringVal.writerDid = myDid;
    keyringVal.writerPublicKey = { $bytes: toBase64(pubKeyRaw) } as unknown as string;
    await client.putRecord(KEYRING_COLLECTION, rkey, keyringVal);
  }
}

export async function removeMember(client: PdsClient, membershipRkey: string): Promise<void> {
  await client.deleteRecord(MEMBERSHIP_COLLECTION, membershipRkey);
}

export async function deleteOrg(client: PdsClient, orgRecord: OrgRecord): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await client.listRecords(MEMBERSHIP_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as Membership;
      if (val.orgRkey === orgRecord.rkey) {
        await client.deleteRecord(MEMBERSHIP_COLLECTION, rec.uri.split('/').pop()!);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  cursor = undefined;
  do {
    const page = await client.listRecords(KEYRING_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as Keyring;
      if (val.orgRkey === orgRecord.rkey) {
        await client.deleteRecord(KEYRING_COLLECTION, rec.uri.split('/').pop()!);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  cursor = undefined;
  do {
    const page = await client.listRecords(CHANNEL_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = rec.value as unknown as WaveChannel;
      if (val.orgRkey === orgRecord.rkey) {
        await client.deleteRecord(CHANNEL_COLLECTION, rec.uri.split('/').pop()!);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  await client.deleteRecord(ORG_COLLECTION, orgRecord.rkey);
}
