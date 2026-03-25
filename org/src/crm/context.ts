/**
 * CRM context — pure async functions for deal management, org context, and change control.
 * Extracted from CRM App.tsx to keep CrmApp.tsx lean.
 */

import { PdsClient, resolvePds } from "../pds";
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
export const INNER_TYPE = "com.minomobi.crm.deal";

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

        const writerPublicKey = await importPublicKey(fromBase64(keyringVal.writerPublicKey));
        const tierDek = await unwrapDekFromMember(fromBase64(myEntry.wrappedDek), privateKey, writerPublicKey);

        keyringDeks.set(rkey, tierDek);
        if (epoch === currentEpoch) tierDeks.set(tier.name, tierDek);
      } catch (err) {
        console.warn(`Failed to unwrap DEK for tier ${tier.name} epoch ${epoch}:`, err);
      }
    }
  }

  const orgMemberships = allMemberships.filter((m) => m.membership.orgRkey === orgRecord.rkey);
  const memberDids = orgMemberships.map((m) => m.membership.memberDid);

  const { proposals, approvals, decisions } = await loadChangeControl(client, orgRecord.rkey, memberDids);
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
      if (val.innerType !== INNER_TYPE) continue;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { record } = await unsealRecord<Deal>(val, dek);
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({
          rkey,
          deal: record,
          authorDid: ownerDid,
          previousDid: val.previousDid as string | undefined,
          previousRkey: val.previousRkey as string | undefined,
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
        if (val.innerType !== INNER_TYPE) continue;
        const recKeyring = val.keyringRkey as string;
        if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;

        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        if (superseded.has(`${did}:${rkey}`)) continue;

        const dek = orgCtx.keyringDeks.get(recKeyring);
        if (!dek) continue;
        try {
          const { record } = await unsealRecord<Deal>(val, dek);
          allDeals.push({
            rkey,
            deal: record,
            authorDid: did,
            previousDid: val.previousDid as string | undefined,
            previousRkey: val.previousRkey as string | undefined,
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

/** Load change control state (proposals, approvals, decisions) for an org */
async function loadChangeControl(
  client: PdsClient,
  orgRkey: string,
  memberDids: string[]
): Promise<{
  proposals: ProposalRecord[];
  approvals: ApprovalRecord[];
  decisions: DecisionRecord[];
}> {
  const proposals: ProposalRecord[] = [];
  const approvals: ApprovalRecord[] = [];
  const decisions: DecisionRecord[] = [];
  const myDid = client.getSession()!.did;

  const loadCollection = async <T,>(
    did: string,
    collection: string,
    orgPrefix: string,
    accumulator: { rkey: string; data: T }[]
  ) => {
    let cursor: string | undefined;
    const isMe = did === myDid;
    do {
      const page = isMe
        ? await client.listRecords(collection, 100, cursor)
        : await client.listRecordsFrom(did, collection, 100, cursor);
      for (const rec of page.records) {
        const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        if (val.orgRkey === orgPrefix || rkey.startsWith(orgPrefix + ":")) {
          accumulator.push({ rkey, data: val as unknown as T });
        }
      }
      cursor = page.cursor;
    } while (cursor);
  };

  for (const did of memberDids) {
    try {
      const p: { rkey: string; data: Proposal }[] = [];
      const a: { rkey: string; data: Approval }[] = [];
      const d: { rkey: string; data: Decision }[] = [];
      await loadCollection(did, PROPOSAL_COLLECTION, orgRkey, p);
      await loadCollection(did, APPROVAL_COLLECTION, orgRkey, a);
      await loadCollection(did, DECISION_COLLECTION, orgRkey, d);
      for (const x of p) proposals.push({ rkey: x.rkey, proposal: x.data });
      for (const x of a) approvals.push({ rkey: x.rkey, approval: x.data });
      for (const x of d) decisions.push({ rkey: x.rkey, decision: x.data });
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

/** Save a deal (seal + create record, optionally with chain link) */
export async function saveDeal(
  client: PdsClient,
  deal: Deal,
  dek: CryptoKey,
  keyringRkey: string,
  existingDeal?: DealRecord
): Promise<{ rkey: string }> {
  const sealed = await sealRecord(INNER_TYPE, deal, keyringRkey, dek);
  const sealedWithLink = existingDeal
    ? { ...(sealed as Record<string, unknown>), previousDid: existingDeal.authorDid, previousRkey: existingDeal.rkey }
    : sealed;

  const res = await client.createRecord(SEALED_COLLECTION, sealedWithLink);
  return { rkey: res.uri.split("/").pop()! };
}

/** Write a decision record for a deal edit */
export async function writeDecision(
  client: PdsClient,
  orgRkey: string,
  proposalDid: string,
  proposalRkey: string,
  previousDid: string,
  previousRkey: string,
  newDid: string,
  newRkey: string,
  keyringRkey: string
): Promise<{ rkey: string }> {
  const decisionRkey = `${keyringRkey}:${previousRkey}:${newRkey}`;
  const decision: Decision & { $type: string } = {
    $type: DECISION_COLLECTION,
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
  await client.putRecord(DECISION_COLLECTION, decisionRkey, decision);
  return { rkey: decisionRkey };
}

/** Create a proposal for changing someone else's deal */
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

  const proposal: Proposal & { $type: string } = {
    $type: PROPOSAL_COLLECTION,
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

  const res = await client.createRecord(PROPOSAL_COLLECTION, proposal);
  const rkey = res.uri.split("/").pop()!;
  return { rkey, proposal: proposal as Proposal };
}

/** Write an approval for a proposal */
export async function createApproval(
  client: PdsClient,
  orgRkey: string,
  proposalDid: string,
  proposalRkey: string,
  officeName: string,
  myDid: string,
  myHandle: string
): Promise<{ rkey: string; approval: Approval }> {
  const approval: Approval & { $type: string } = {
    $type: APPROVAL_COLLECTION,
    proposalDid,
    proposalRkey,
    officeName,
    approverDid: myDid,
    approverHandle: myHandle,
    createdAt: new Date().toISOString(),
  };

  const approvalRkey = `${orgRkey}:${proposalRkey}:${officeName}:${myDid}`;
  await client.putRecord(APPROVAL_COLLECTION, approvalRkey, approval);
  return { rkey: approvalRkey, approval: approval as Approval };
}

/** Apply a proposal: write new sealed record + decision */
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
  const sealed = await sealRecord(INNER_TYPE, newDeal, keyringRkey, dek);
  const sealedWithLink = {
    ...(sealed as Record<string, unknown>),
    previousDid: targetDeal.authorDid,
    previousRkey: targetDeal.rkey,
  };

  const newRes = await client.createRecord(SEALED_COLLECTION, sealedWithLink);
  const newRkey = newRes.uri.split("/").pop()!;

  const decision: Decision & { $type: string } = {
    $type: DECISION_COLLECTION,
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

  const decisionRkey = `${proposal.orgRkey}:${proposalRkey}`;
  await client.putRecord(DECISION_COLLECTION, decisionRkey, decision);

  // Update proposal status
  await client.putRecord(PROPOSAL_COLLECTION, proposalRkey, {
    $type: PROPOSAL_COLLECTION,
    ...proposal,
    status: "applied",
  });

  return { newRkey, decisionRkey };
}
