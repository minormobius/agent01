/**
 * CRM context — pure async functions for deal management, org context, and change control.
 * Extracted from CRM App.tsx to keep CrmApp.tsx lean.
 */

import { PdsClient, resolvePds, resolveHandle } from "../pds";
import {
  sealRecord,
  unsealRecord,
  unwrapDekFromMember,
  importPublicKey,
  toBase64,
  fromBase64,
  encrypt as aesEncrypt,
} from "../crypto";
import type {
  Deal,
  DealRecord,
  OrgRecord,
  OrgContext,
  Org,
  MembershipRecord,
  Membership,
  Keyring,
  KeyringMemberEntry,
  ProposalRecord,
  Proposal,
  ApprovalRecord,
  Approval,
  DecisionRecord,
  Decision,
  OrgBookmark,
  OrgBookmarkRecord,
  OrgRelationship,
  OrgRelationshipRecord,
} from "./types";

// ATProto collection names
export const SEALED_COLLECTION = "com.minomobi.vault.sealed";
export const ORG_COLLECTION = "com.minomobi.vault.org";
export const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
export const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
export const PROPOSAL_COLLECTION = "com.minomobi.vault.proposal";
export const APPROVAL_COLLECTION = "com.minomobi.vault.approval";
export const DECISION_COLLECTION = "com.minomobi.vault.decision";
export const BOOKMARK_COLLECTION = "com.minomobi.vault.orgBookmark";
export const RELATIONSHIP_COLLECTION = "com.minomobi.vault.orgRelationship";
export const NOTIFICATION_DISMISSAL_COLLECTION = "com.minomobi.vault.notificationDismissal";
export const NOTIFICATION_COLLECTION = "com.minomobi.vault.notification";
export const INNER_TYPE = "com.minomobi.crm.deal";
export const NOTIFICATION_INNER_TYPE = "com.minomobi.vault.notification";
export const PROPOSAL_INNER_TYPE = "com.minomobi.vault.proposal";
export const APPROVAL_INNER_TYPE = "com.minomobi.vault.approval";
export const DECISION_INNER_TYPE = "com.minomobi.vault.decision";

/** Compute the keyring rkey for a tier at a given epoch. */
export function keyringRkeyForTier(orgRkey: string, tierName: string, epoch: number): string {
  return epoch === 0 ? `${orgRkey}:${tierName}` : `${orgRkey}:${tierName}:${epoch}`;
}

/** Discover orgs: founded + joined via bookmarks */
export async function discoverOrgs(client: PdsClient): Promise<{
  foundedOrgs: OrgRecord[];
  joinedOrgs: Array<{ org: OrgRecord; founderService: string }>;
  allMemberships: MembershipRecord[];
}> {
  // 1. Orgs I founded
  const foundedOrgs: OrgRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as unknown as Org;
      const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
      foundedOrgs.push({ rkey, org: val });
    }
    cursor = page.cursor;
  } while (cursor);

  // 2. Local memberships
  const localMemberships: MembershipRecord[] = [];
  cursor = undefined;
  do {
    const page = await client.listRecords(MEMBERSHIP_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as unknown as Membership;
      const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
      localMemberships.push({ rkey, membership: val });
    }
    cursor = page.cursor;
  } while (cursor);

  // 3. Bookmarks (joined orgs)
  const bookmarks: OrgBookmarkRecord[] = [];
  cursor = undefined;
  do {
    const page = await client.listRecords(BOOKMARK_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as unknown as OrgBookmark;
      const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
      bookmarks.push({ rkey, bookmark: val });
    }
    cursor = page.cursor;
  } while (cursor);

  // 4. Fetch each bookmarked org from founder's PDS
  const joinedOrgs: Array<{ org: OrgRecord; founderService: string }> = [];
  const remoteMemberships: MembershipRecord[] = [];

  for (const bm of bookmarks) {
    try {
      let founderService: string;
      try {
        founderService = await resolvePds(bm.bookmark.founderDid);
      } catch {
        founderService = bm.bookmark.founderService;
      }

      const founderClient = new PdsClient(founderService);
      const orgRec = await founderClient.getRecordFrom(
        bm.bookmark.founderDid, ORG_COLLECTION, bm.bookmark.orgRkey
      );
      if (!orgRec) continue;

      const val = (orgRec as Record<string, unknown>).value as unknown as Org;
      joinedOrgs.push({ org: { rkey: bm.bookmark.orgRkey, org: val }, founderService });

      let memberCursor: string | undefined;
      do {
        const page = await founderClient.listRecordsFrom(
          bm.bookmark.founderDid, MEMBERSHIP_COLLECTION, 100, memberCursor
        );
        for (const rec of page.records) {
          const mVal = (rec as Record<string, unknown>).value as Record<string, unknown>;
          if ((mVal as { orgRkey?: string }).orgRkey === bm.bookmark.orgRkey) {
            const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
            remoteMemberships.push({ rkey, membership: mVal as unknown as Membership });
          }
        }
        memberCursor = page.cursor;
      } while (memberCursor);
    } catch (err) {
      console.warn(`Failed to fetch joined org from ${bm.bookmark.founderService}:`, err);
    }
  }

  return {
    foundedOrgs,
    joinedOrgs,
    allMemberships: [...localMemberships, ...remoteMemberships],
  };
}

/**
 * Discover pending org invites — memberships targeting our DID that we haven't
 * bookmarked yet. Scans known founders' PDS + optionally a specific handle.
 *
 * Returns notifications for invites that haven't been dismissed.
 */
export async function discoverPendingInvites(
  _client: PdsClient,
  myDid: string,
  knownFounderDids: string[],
  existingBookmarkOrgRkeys: Set<string>,
  dismissedKeys: Set<string>,
): Promise<import("../types").NotificationRecord[]> {
  const notifications: import("../types").NotificationRecord[] = [];
  const seen = new Set<string>();

  for (const founderDid of knownFounderDids) {
    try {
      let founderService: string;
      try {
        founderService = await resolvePds(founderDid);
      } catch { continue; }

      const founderClient = new PdsClient(founderService);

      // Scan founder's memberships for records targeting us
      let cursor: string | undefined;
      do {
        const page = await founderClient.listRecordsFrom(
          founderDid, MEMBERSHIP_COLLECTION, 100, cursor
        );
        for (const rec of page.records) {
          const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
          if ((val as { memberDid?: string }).memberDid !== myDid) continue;

          const orgRkey = (val as { orgRkey?: string }).orgRkey;
          if (!orgRkey) continue;
          if (existingBookmarkOrgRkeys.has(orgRkey)) continue;

          const key = `invite:${founderDid}:${orgRkey}`;
          if (seen.has(key) || dismissedKeys.has(key)) continue;
          seen.add(key);

          // Fetch org name
          let orgName = orgRkey;
          try {
            const orgRec = await founderClient.getRecordFrom(founderDid, ORG_COLLECTION, orgRkey);
            if (orgRec) {
              const orgVal = (orgRec as Record<string, unknown>).value as Record<string, unknown>;
              orgName = (orgVal as { name?: string }).name ?? orgRkey;
            }
          } catch { /* use rkey as fallback */ }

          notifications.push({
            rkey: key,
            notification: {
              type: "org-invite",
              orgRkey,
              orgName,
              founderDid,
              founderService,
              tierName: (val as { tierName?: string }).tierName ?? "member",
              invitedBy: (val as { invitedBy?: string }).invitedBy ?? founderDid,
              invitedByHandle: (val as { memberHandle?: string }).memberHandle,
              createdAt: (val as { createdAt?: string }).createdAt ?? new Date().toISOString(),
            },
          });
        }
        cursor = page.cursor;
      } while (cursor);
    } catch (err) {
      console.warn(`Failed to check invites from ${founderDid}:`, err);
    }
  }

  return notifications;
}

/**
 * Check a specific user's PDS for invites targeting our DID.
 * Used for the "check invites from handle" feature.
 */
export async function checkInvitesFromUser(
  _client: PdsClient,
  founderHandleOrDid: string,
  myDid: string,
  existingBookmarkOrgRkeys: Set<string>,
): Promise<import("../types").NotificationRecord[]> {
  const input = founderHandleOrDid.trim().replace(/^@/, "");
  if (!input) return [];

  const founderDid = input.startsWith("did:") ? input : await resolveHandle(input);
  const founderService = await resolvePds(founderDid);
  const founderClient = new PdsClient(founderService);

  const notifications: import("../types").NotificationRecord[] = [];

  let cursor: string | undefined;
  do {
    const page = await founderClient.listRecordsFrom(
      founderDid, MEMBERSHIP_COLLECTION, 100, cursor
    );
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if ((val as { memberDid?: string }).memberDid !== myDid) continue;

      const orgRkey = (val as { orgRkey?: string }).orgRkey;
      if (!orgRkey) continue;
      if (existingBookmarkOrgRkeys.has(orgRkey)) continue;

      const key = `invite:${founderDid}:${orgRkey}`;

      let orgName = orgRkey;
      try {
        const orgRec = await founderClient.getRecordFrom(founderDid, ORG_COLLECTION, orgRkey);
        if (orgRec) {
          const orgVal = (orgRec as Record<string, unknown>).value as Record<string, unknown>;
          orgName = (orgVal as { name?: string }).name ?? orgRkey;
        }
      } catch { /* use rkey as fallback */ }

      notifications.push({
        rkey: key,
        notification: {
          type: "org-invite",
          orgRkey,
          orgName,
          founderDid,
          founderService,
          tierName: (val as { tierName?: string }).tierName ?? "member",
          invitedBy: (val as { invitedBy?: string }).invitedBy ?? founderDid,
          invitedByHandle: input.startsWith("did:") ? undefined : input,
          createdAt: (val as { createdAt?: string }).createdAt ?? new Date().toISOString(),
        },
      });
    }
    cursor = page.cursor;
  } while (cursor);

  return notifications;
}

const NOTIFICATION_PREFS_COLLECTION = "com.minomobi.vault.notificationPrefs";

/**
 * Resolve DEK + keyringRkey for the lowest tier of an org context.
 * Used for notifications (visible to all members).
 */
function resolveNotifDek(
  orgRkey: string,
  orgCtx?: { tierDeks: Map<string, CryptoKey>; org: { org: { tiers: { name: string; level: number; currentEpoch?: number }[] } }; myTierName: string } | null,
): { dek?: CryptoKey; krkey?: string } {
  if (!orgCtx) return {};
  // Use lowest-level tier so all members can decrypt
  const sorted = [...orgCtx.org.org.tiers].sort((a, b) => a.level - b.level);
  for (const tier of sorted) {
    const dek = orgCtx.tierDeks.get(tier.name);
    if (dek) {
      const epoch = tier.currentEpoch ?? 0;
      return { dek, krkey: keyringRkeyForTier(orgRkey, tier.name, epoch) };
    }
  }
  return {};
}

/**
 * Publish a notification as a sealed record — all metadata (targetDid,
 * notificationType, orgName, payload) is encrypted. No plaintext leaks.
 *
 * If orgCtx is provided, auto-resolves DEK from the org context.
 * Falls back to plaintext if no DEK available (legacy compat).
 */
export async function publishNotification(
  client: PdsClient,
  targetDid: string,
  notificationType: import("../types").NotificationType,
  orgRkey: string,
  orgName: string,
  payload: import("../types").Notification,
  senderDid: string,
  senderHandle?: string,
  tierLevel?: number,
  orgCtx?: { tierDeks: Map<string, CryptoKey>; org: { org: { tiers: { name: string; level: number; currentEpoch?: number }[] } }; myTierName: string } | null,
): Promise<void> {
  const inner = {
    targetDid,
    notificationType,
    orgRkey,
    orgName,
    payload: JSON.stringify(payload),
    senderDid,
    senderHandle,
    tierLevel,
    createdAt: new Date().toISOString(),
  };

  const { dek, krkey } = resolveNotifDek(orgRkey, orgCtx);
  if (dek && krkey) {
    const sealed = await sealRecord(NOTIFICATION_INNER_TYPE, inner, krkey, dek);
    await client.createRecord(SEALED_COLLECTION, sealed);
  } else {
    // Fallback: plaintext notification (for backward compat during migration)
    const record: import("../types").PublishedNotification = {
      $type: NOTIFICATION_COLLECTION,
      ...inner,
    };
    await client.createRecord(NOTIFICATION_COLLECTION, record);
  }
}

/**
 * Broadcast a notification to the entire org (targetDid = "*").
 * Convenience wrapper around publishNotification.
 */
export async function broadcastNotification(
  client: PdsClient,
  notificationType: import("../types").NotificationType,
  orgRkey: string,
  orgName: string,
  payload: import("../types").Notification,
  senderDid: string,
  senderHandle?: string,
  tierLevel?: number,
  orgCtx?: { tierDeks: Map<string, CryptoKey>; org: { org: { tiers: { name: string; level: number; currentEpoch?: number }[] } }; myTierName: string } | null,
): Promise<void> {
  return publishNotification(
    client, "*", notificationType, orgRkey, orgName,
    payload, senderDid, senderHandle, tierLevel, orgCtx,
  );
}

/** Load notification preferences from PDS */
export async function loadNotificationPreferences(
  client: PdsClient,
): Promise<import("../types").NotificationPreferences | null> {
  try {
    const rec = await client.getRecord(NOTIFICATION_PREFS_COLLECTION, "self");
    if (!rec) return null;
    return (rec as Record<string, unknown>).value as unknown as import("../types").NotificationPreferences;
  } catch {
    return null;
  }
}

/** Save notification preferences to PDS */
export async function saveNotificationPreferences(
  client: PdsClient,
  prefs: import("../types").NotificationPreferences,
): Promise<void> {
  await client.putRecord(NOTIFICATION_PREFS_COLLECTION, "self", prefs);
}

/** Load dismissed notification keys from PDS */
export async function loadDismissedNotifications(client: PdsClient): Promise<Set<string>> {
  const dismissed = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.listRecords(NOTIFICATION_DISMISSAL_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      const key = (val as { notificationKey?: string }).notificationKey;
      if (key) dismissed.add(key);
    }
    cursor = page.cursor;
  } while (cursor);
  return dismissed;
}

/** Build org context: unwrap DEKs, load change control + relationships */
export async function buildOrgContext(
  client: PdsClient,
  founderService: string,
  orgRecord: OrgRecord,
  myMembership: MembershipRecord,
  allMemberships: MembershipRecord[],
  privateKey: CryptoKey,
  myDid: string
): Promise<OrgContext> {
  const founderDid = orgRecord.org.founderDid;
  const isFounder = founderDid === myDid;
  const controlClient = isFounder ? client : new PdsClient(founderService);

  const myTierDef = orgRecord.org.tiers.find(
    (t) => t.name === myMembership.membership.tierName
  );
  if (!myTierDef) throw new Error("Tier not found in org");

  const tierDeks = new Map<string, CryptoKey>();
  const keyringDeks = new Map<string, CryptoKey>();
  const accessibleTiers = orgRecord.org.tiers.filter((t) => t.level <= myTierDef.level);

  for (const tier of accessibleTiers) {
    const currentEpoch = tier.currentEpoch ?? 0;
    for (let epoch = 0; epoch <= currentEpoch; epoch++) {
      const rkey = keyringRkeyForTier(orgRecord.rkey, tier.name, epoch);
      try {
        const keyringRecord = await controlClient.getRecordFrom(founderDid, KEYRING_COLLECTION, rkey);
        if (!keyringRecord) continue;

        const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & { $type: string };
        const myEntry = keyringVal.members.find((m: KeyringMemberEntry) => m.did === myDid);
        if (!myEntry) continue;

        const wrappedDekB64 =
          typeof myEntry.wrappedDek === "string"
            ? myEntry.wrappedDek
            : (myEntry.wrappedDek as unknown as { $bytes: string }).$bytes;
        const writerPubB64 =
          typeof keyringVal.writerPublicKey === "string"
            ? keyringVal.writerPublicKey
            : (keyringVal.writerPublicKey as unknown as { $bytes: string }).$bytes;

        const writerPublicKey = await importPublicKey(fromBase64(writerPubB64));
        const tierDek = await unwrapDekFromMember(fromBase64(wrappedDekB64), privateKey, writerPublicKey);

        keyringDeks.set(rkey, tierDek);
        if (epoch === currentEpoch) tierDeks.set(tier.name, tierDek);
      } catch (err) {
        console.warn(`Failed to unwrap DEK for tier ${tier.name} epoch ${epoch}:`, err);
      }
    }
  }

  const orgMemberships = allMemberships.filter((m) => m.membership.orgRkey === orgRecord.rkey);
  const memberDids = orgMemberships.map((m) => m.membership.memberDid);

  const { proposals, approvals, decisions } = await loadChangeControl(client, orgRecord.rkey, memberDids, keyringDeks);
  const relationships = await loadRelationships(controlClient, founderDid, orgRecord.rkey, client);

  return {
    org: orgRecord,
    service: founderService,
    founderDid,
    myTierName: myMembership.membership.tierName,
    myTierLevel: myTierDef.level,
    tierDeks,
    keyringDeks,
    memberships: orgMemberships,
    proposals,
    approvals,
    decisions,
    relationships,
  };
}

/** Load personal deals from user's PDS */
export async function loadPersonalDeals(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string
): Promise<DealRecord[]> {
  const loaded: DealRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { innerType, record } = await unsealRecord<Deal & { previousDid?: string; previousRkey?: string }>(val, dek);
        if (innerType !== INNER_TYPE) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        const { previousDid: pDid, previousRkey: pRkey, ...deal } = record;
        loaded.push({
          rkey,
          deal: deal as Deal,
          authorDid: ownerDid,
          previousDid: pDid ?? (val.previousDid as string | undefined),
          previousRkey: pRkey ?? (val.previousRkey as string | undefined),
          orgRkey: "personal",
        });
      } catch (err) {
        console.warn("Failed to unseal record:", (rec as Record<string, unknown>).uri, err);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

/** Load deals for an org context across all member PDSes */
export async function loadOrgDealsForCtx(
  client: PdsClient,
  orgCtx: OrgContext
): Promise<DealRecord[]> {
  const allDeals: DealRecord[] = [];
  const superseded = new Set<string>();

  for (const d of orgCtx.decisions) {
    superseded.add(`${d.decision.previousDid}:${d.decision.previousRkey}`);
  }

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
        if (superseded.has(`${did}:${rkey}`)) continue;

        const dek = orgCtx.keyringDeks.get(recKeyring);
        if (!dek) continue;
        try {
          const { innerType, record } = await unsealRecord<Deal & { previousDid?: string; previousRkey?: string }>(val, dek);
          if (innerType !== INNER_TYPE) continue;
          const { previousDid: pDid, previousRkey: pRkey, ...deal } = record;
          allDeals.push({
            rkey,
            deal: deal as Deal,
            authorDid: did,
            previousDid: pDid ?? (val.previousDid as string | undefined),
            previousRkey: pRkey ?? (val.previousRkey as string | undefined),
            orgRkey: orgCtx.org.rkey,
          });
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
      // Member's PDS unreachable
    }
  }

  return allDeals;
}

/** Load change control state (proposals, approvals, decisions) from sealed records */
async function loadChangeControl(
  client: PdsClient,
  orgRkey: string,
  memberDids: string[],
  keyringDeks: Map<string, CryptoKey>,
): Promise<{
  proposals: ProposalRecord[];
  approvals: ApprovalRecord[];
  decisions: DecisionRecord[];
}> {
  const proposals: ProposalRecord[] = [];
  const approvals: ApprovalRecord[] = [];
  const decisions: DecisionRecord[] = [];
  const myDid = client.getSession()!.did;

  for (const did of memberDids) {
    try {
      let cursor: string | undefined;
      const isMe = did === myDid;
      do {
        const page = isMe
          ? await client.listRecords(SEALED_COLLECTION, 100, cursor)
          : await client.listRecordsFrom(did, SEALED_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
          const recKeyring = val.keyringRkey as string;
          if (!recKeyring?.startsWith(orgRkey + ":")) continue;
          const dek = keyringDeks.get(recKeyring);
          if (!dek) continue;
          const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
          try {
            const { innerType, record } = await unsealRecord<Record<string, unknown>>(val, dek);
            if (innerType === PROPOSAL_INNER_TYPE) {
              proposals.push({ rkey, proposal: record as unknown as Proposal });
            } else if (innerType === APPROVAL_INNER_TYPE) {
              approvals.push({ rkey, approval: record as unknown as Approval });
            } else if (innerType === DECISION_INNER_TYPE) {
              decisions.push({ rkey, decision: record as unknown as Decision });
            }
          } catch { /* can't decrypt */ }
        }
        cursor = page.cursor;
      } while (cursor);
    } catch {
      // PDS unreachable
    }
  }

  return { proposals, approvals, decisions };
}

/** Load org relationships involving this org */
async function loadRelationships(
  controlClient: PdsClient,
  founderDid: string,
  orgRkey: string,
  authClient: PdsClient
): Promise<OrgRelationshipRecord[]> {
  const relationships: OrgRelationshipRecord[] = [];
  const myDid = authClient.getSession()?.did;
  const isMe = founderDid === myDid;
  let cursor: string | undefined;
  do {
    const page = isMe
      ? await controlClient.listRecords(RELATIONSHIP_COLLECTION, 100, cursor)
      : await controlClient.listRecordsFrom(founderDid, RELATIONSHIP_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as unknown as OrgRelationship;
      const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
      const isParent = val.parentRef?.orgRkey === orgRkey && val.parentRef?.did === founderDid;
      const isChild = val.childRef.orgRkey === orgRkey && val.childRef.did === founderDid;
      if (isParent || isChild) {
        relationships.push({ rkey, relationship: val });
      }
    }
    cursor = page.cursor;
  } while (cursor);
  return relationships;
}

/** Save a deal (seal + create record, optionally with chain link inside ciphertext) */
export async function saveDeal(
  client: PdsClient,
  deal: Deal,
  dek: CryptoKey,
  keyringRkey: string,
  existingDeal?: DealRecord
): Promise<{ rkey: string }> {
  // Chain link (previousDid/previousRkey) goes inside the ciphertext — no plaintext lineage
  const inner = existingDeal
    ? { ...deal, previousDid: existingDeal.authorDid, previousRkey: existingDeal.rkey }
    : deal;
  const sealed = await sealRecord(INNER_TYPE, inner, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

/** Write a decision record for a deal edit — sealed into vault.sealed */
export async function writeDecision(
  client: PdsClient,
  orgRkey: string,
  proposalDid: string,
  proposalRkey: string,
  previousDid: string,
  previousRkey: string,
  newDid: string,
  newRkey: string,
  keyringRkey: string,
  dek?: CryptoKey,
): Promise<{ rkey: string }> {
  const decision: Decision = {
    orgRkey,
    proposalDid,
    proposalRkey,
    previousDid,
    previousRkey,
    newDid,
    newRkey,
    outcome: "accepted",
    createdAt: new Date().toISOString(),
  };

  if (dek) {
    const sealed = await sealRecord(DECISION_INNER_TYPE, decision, keyringRkey, dek);
    const res = await client.createRecord(SEALED_COLLECTION, sealed);
    return { rkey: res.uri.split("/").pop()! };
  } else {
    // Fallback: legacy plaintext
    const decisionRkey = `${keyringRkey}:${previousRkey}:${newRkey}`;
    await client.putRecord(DECISION_COLLECTION, decisionRkey, { $type: DECISION_COLLECTION, ...decision });
    return { rkey: decisionRkey };
  }
}

/** Create a proposal for changing someone else's deal — sealed into vault.sealed */
export async function createProposal(
  client: PdsClient,
  orgCtx: OrgContext,
  targetDeal: DealRecord,
  proposedDeal: Deal,
  changeType: "edit" | "stage" | "edit+stage",
  summary: string,
  myDid: string,
  myHandle: string
): Promise<{ rkey: string; proposal: Proposal }> {
  const tierName = orgCtx.myTierName;
  const dek = orgCtx.tierDeks.get(tierName);
  if (!dek) throw new Error("No encryption key for your tier");

  const tierDef = orgCtx.org.org.tiers.find((t) => t.name === tierName);
  const epoch = tierDef?.currentEpoch ?? 0;
  const keyringRkey = keyringRkeyForTier(orgCtx.org.rkey, tierName, epoch);

  // Encrypt proposed deal content inside the proposal
  const json = JSON.stringify(proposedDeal);
  const plaintext = new TextEncoder().encode(json);
  const { iv, ciphertext } = await aesEncrypt(plaintext, dek);

  const workflow = orgCtx.org.org.workflow;
  let requiredOffices: string[] = [];
  if (workflow && changeType !== "edit") {
    const gate = workflow.gates.find(
      (g) => g.fromStage === targetDeal.deal.stage && g.toStage === proposedDeal.stage
    );
    if (gate) requiredOffices = gate.requiredOffices;
  }

  const proposal: Proposal = {
    orgRkey: orgCtx.org.rkey,
    targetDid: targetDeal.authorDid,
    targetRkey: targetDeal.rkey,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    keyringRkey,
    changeType,
    summary,
    requiredOffices,
    proposerDid: myDid,
    proposerHandle: myHandle,
    status: requiredOffices.length === 0 ? "approved" : "open",
    createdAt: new Date().toISOString(),
  };

  // Seal the entire proposal into vault.sealed — summary, status, offices all encrypted
  const sealed = await sealRecord(PROPOSAL_INNER_TYPE, proposal, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  const rkey = res.uri.split("/").pop()!;
  return { rkey, proposal };
}

/** Write an approval for a proposal — sealed into vault.sealed */
export async function createApproval(
  client: PdsClient,
  orgRkey: string,
  proposalDid: string,
  proposalRkey: string,
  officeName: string,
  myDid: string,
  myHandle: string,
  dek?: CryptoKey,
  keyringRkey?: string,
): Promise<{ rkey: string; approval: Approval }> {
  const approval: Approval = {
    proposalDid,
    proposalRkey,
    officeName,
    approverDid: myDid,
    approverHandle: myHandle,
    createdAt: new Date().toISOString(),
  };

  if (dek && keyringRkey) {
    const sealed = await sealRecord(APPROVAL_INNER_TYPE, approval, keyringRkey, dek);
    const res = await client.createRecord(SEALED_COLLECTION, sealed);
    const rkey = res.uri.split("/").pop()!;
    return { rkey, approval };
  } else {
    // Fallback: legacy plaintext
    const approvalRkey = `${orgRkey}:${proposalRkey}:${officeName}:${myDid}`;
    await client.putRecord(APPROVAL_COLLECTION, approvalRkey, { $type: APPROVAL_COLLECTION, ...approval });
    return { rkey: approvalRkey, approval };
  }
}

/** Apply a proposal: write new sealed record + sealed decision */
export async function applyProposal(
  client: PdsClient,
  proposalRkey: string,
  proposal: Proposal,
  targetDeal: DealRecord,
  newDeal: Deal,
  dek: CryptoKey,
  keyringRkey: string,
  myDid: string
): Promise<{ newRkey: string; decisionRkey: string }> {
  const inner = { ...newDeal, previousDid: targetDeal.authorDid, previousRkey: targetDeal.rkey };
  const sealed = await sealRecord(INNER_TYPE, inner, keyringRkey, dek);
  const newRes = await client.createRecord(SEALED_COLLECTION, sealed);
  const newRkey = newRes.uri.split("/").pop()!;

  const decision: Decision = {
    orgRkey: proposal.orgRkey,
    proposalDid: myDid,
    proposalRkey,
    previousDid: targetDeal.authorDid,
    previousRkey: targetDeal.rkey,
    newDid: myDid,
    newRkey,
    outcome: "accepted",
    createdAt: new Date().toISOString(),
  };

  // Seal the decision into vault.sealed
  const sealedDecision = await sealRecord(DECISION_INNER_TYPE, decision, keyringRkey, dek);
  const decisionRes = await client.createRecord(SEALED_COLLECTION, sealedDecision);
  const decisionRkey = decisionRes.uri.split("/").pop()!;

  // Update proposal status — delete old sealed proposal, create new one with status="applied"
  await client.deleteRecord(SEALED_COLLECTION, proposalRkey);
  const updatedProposal = { ...proposal, status: "applied" as const };
  await sealRecord(PROPOSAL_INNER_TYPE, updatedProposal, keyringRkey, dek)
    .then(s => client.createRecord(SEALED_COLLECTION, s));

  return { newRkey, decisionRkey };
}

// ── Expense CRUD ──

const EXPENSE_INNER_TYPE = "com.minomobi.crm.expense";

export async function loadPersonalExpenses(
  client: PdsClient,
  dek: CryptoKey,
  ownerDid: string
): Promise<import("./types").ExpenseRecord[]> {
  const loaded: import("./types").ExpenseRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { innerType, record } = await unsealRecord<import("./types").Expense>(val, dek);
        if (innerType !== EXPENSE_INNER_TYPE) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, expense: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch { /* can't decrypt */ }
    }
    cursor = page.cursor;
  } while (cursor);

  return loaded;
}

export async function loadOrgExpenses(
  client: PdsClient,
  orgCtx: OrgContext
): Promise<import("./types").ExpenseRecord[]> {
  const all: import("./types").ExpenseRecord[] = [];

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
          const { innerType, record } = await unsealRecord<import("./types").Expense>(val, dek);
          if (innerType !== EXPENSE_INNER_TYPE) continue;
          all.push({ rkey, expense: record, authorDid: did, orgRkey: orgCtx.org.rkey });
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

export async function saveExpense(
  client: PdsClient,
  expense: import("./types").Expense,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(EXPENSE_INNER_TYPE, expense, keyringRkey, dek);
  const res = await client.createRecord(SEALED_COLLECTION, sealed);
  return { rkey: res.uri.split("/").pop()! };
}

export async function updateExpense(
  client: PdsClient,
  oldRkey: string,
  expense: import("./types").Expense,
  dek: CryptoKey,
  keyringRkey: string
): Promise<{ rkey: string }> {
  await client.deleteRecord(SEALED_COLLECTION, oldRkey);
  return saveExpense(client, expense, dek, keyringRkey);
}

export async function deleteExpense(
  client: PdsClient,
  rkey: string
): Promise<void> {
  await client.deleteRecord(SEALED_COLLECTION, rkey);
}
