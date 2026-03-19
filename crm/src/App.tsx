import { useCallback, useState } from "react";
import { PdsClient } from "./pds";
import {
  deriveKek,
  generateIdentityKey,
  exportPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  importPublicKey,
  deriveDek,
  sealRecord,
  unsealRecord,
  unwrapDekFromMember,
  toBase64,
  fromBase64,
  encrypt as aesEncrypt,
} from "./crypto";
import type {
  Deal,
  DealRecord,
  VaultState,
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
  OrgFilter,
} from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { DealsBoard } from "./components/DealsBoard";
import { DocsPage } from "./components/DocsPage";
import { OrgManager } from "./components/OrgManager";
import { OrgSwitcher } from "./components/OrgSwitcher";

type Tab = "deals" | "docs";

const SEALED_COLLECTION = "com.minomobi.vault.sealed";
const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";
const ORG_COLLECTION = "com.minomobi.vault.org";
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
const PROPOSAL_COLLECTION = "com.minomobi.vault.proposal";
const APPROVAL_COLLECTION = "com.minomobi.vault.approval";
const DECISION_COLLECTION = "com.minomobi.vault.decision";
const INNER_TYPE = "com.minomobi.crm.deal";

export function App() {
  const [vault, setVault] = useState<VaultState>({
    session: null,
    dek: null,
    initialized: false,
    keyringRkey: null,
    activeOrg: null,
  });
  // Unified deals array — personal + all orgs, each tagged with orgRkey
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [pds, setPds] = useState<PdsClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("deals");

  // Identity keys kept in memory for org operations
  const [identityKeys, setIdentityKeys] = useState<{
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  } | null>(null);

  // Org state
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [showOrgManager, setShowOrgManager] = useState(false);

  // All loaded org contexts (keyed by org rkey)
  const [orgContexts, setOrgContexts] = useState<Map<string, OrgContext>>(new Map());

  // Filter: "all" | "personal" | orgRkey
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");

  // Derive activeOrg from filter
  const activeOrg = filterOrg !== "all" && filterOrg !== "personal"
    ? orgContexts.get(filterOrg) ?? null
    : null;

  // --- Login + Unlock ---

  const handleLogin = useCallback(
    async (
      service: string,
      handle: string,
      appPassword: string,
      passphrase: string
    ) => {
      // Step 1: Authenticate with PDS
      const client = new PdsClient(service);
      let session;
      try {
        session = await client.login(handle, appPassword);
      } catch (err) {
        throw new Error(`Login failed: ${err instanceof Error ? err.message : err}`);
      }
      setPds(client);

      // Step 2: Derive KEK from passphrase
      const salt = new TextEncoder().encode(session.did + ":vault-kek");
      const kek = await deriveKek(passphrase, salt);

      // Step 3: Check if identity exists on PDS
      const existing = await client.getRecord(IDENTITY_COLLECTION, "self");

      let privateKey: CryptoKey;
      let publicKey: CryptoKey;

      if (existing) {
        // Returning user: unwrap existing identity key
        const val = existing.value as Record<string, unknown>;
        const wrappedField = val.wrappedKey as { $bytes: string };
        const wrappedKey = fromBase64(wrappedField.$bytes);
        try {
          privateKey = await unwrapPrivateKey(wrappedKey, kek);
        } catch {
          throw new Error("Wrong vault passphrase. The passphrase couldn't decrypt your identity key.");
        }

        // Fetch public key
        const pubRecord = await client.getRecord(PUBKEY_COLLECTION, "self");
        if (!pubRecord) {
          throw new Error("Vault corrupted: identity key exists but public key record is missing.");
        }
        const pubVal = pubRecord.value as Record<string, unknown>;
        const pubField = pubVal.publicKey as { $bytes: string };
        publicKey = await importPublicKey(fromBase64(pubField.$bytes));
      } else {
        // First run: generate identity key pair, store on PDS
        const keyPair = await generateIdentityKey();
        privateKey = keyPair.privateKey;
        publicKey = keyPair.publicKey;

        const wrappedKey = await wrapPrivateKey(privateKey, kek);
        const pubKeyRaw = await exportPublicKey(publicKey);

        // Store wrapped private key
        try {
          await client.putRecord(IDENTITY_COLLECTION, "self", {
            $type: IDENTITY_COLLECTION,
            wrappedKey: { $bytes: toBase64(wrappedKey) },
            algorithm: "PBKDF2-SHA256",
            salt: { $bytes: toBase64(salt) },
            iterations: 600000,
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          throw new Error(`Failed to store vault identity on PDS: ${err instanceof Error ? err.message : err}`);
        }

        // Store public key
        try {
          await client.putRecord(PUBKEY_COLLECTION, "self", {
            $type: PUBKEY_COLLECTION,
            publicKey: { $bytes: toBase64(pubKeyRaw) },
            algorithm: "ECDH-P256",
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          throw new Error(`Failed to store public key on PDS: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Step 4: Derive personal DEK
      const dek = await deriveDek(privateKey, publicKey);

      setIdentityKeys({ privateKey, publicKey });

      setVault({
        session,
        dek,
        initialized: true,
        keyringRkey: "self",
        activeOrg: null,
      });

      // Load everything: personal deals + discover orgs + load all org deals
      setLoading(true);
      try {
        const personalDeals = await loadPersonalDeals(client, dek, session.did);
        const { foundedOrgs, allMemberships } = await discoverOrgs(client);

        // Load all org contexts and deals in parallel
        const allOrgDeals: DealRecord[] = [];
        const loadedContexts = new Map<string, OrgContext>();

        for (const org of foundedOrgs) {
          const myMembership = allMemberships.find(
            (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === session.did
          );
          if (!myMembership) continue;

          try {
            const ctx = await buildOrgContext(client, org, myMembership, allMemberships, privateKey, session.did);
            loadedContexts.set(org.rkey, ctx);
            const orgDeals = await loadOrgDealsForCtx(client, ctx);
            allOrgDeals.push(...orgDeals);
          } catch (err) {
            console.warn(`Failed to load org ${org.org.name}:`, err);
          }
        }

        setDeals([...personalDeals, ...allOrgDeals]);
        setOrgContexts(loadedContexts);
        setOrgs(foundedOrgs);
        setMemberships(allMemberships);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Discover orgs (returns data, doesn't set state) ---

  const discoverOrgs = async (client: PdsClient) => {
    const foundedOrgs: OrgRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        const rkey = rec.uri.split("/").pop()!;
        foundedOrgs.push({ rkey, org: val as unknown as Org });
      }
      cursor = page.cursor;
    } while (cursor);

    const allMemberships: MembershipRecord[] = [];
    cursor = undefined;
    do {
      const page = await client.listRecords(MEMBERSHIP_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        const rkey = rec.uri.split("/").pop()!;
        allMemberships.push({ rkey, membership: val as unknown as Membership });
      }
      cursor = page.cursor;
    } while (cursor);

    return { foundedOrgs, allMemberships };
  };

  // --- Build org context (unwrap DEKs, load change control) ---

  const buildOrgContext = async (
    client: PdsClient,
    orgRecord: OrgRecord,
    myMembership: MembershipRecord,
    allMemberships: MembershipRecord[],
    privateKey: CryptoKey,
    myDid: string
  ): Promise<OrgContext> => {
    const myTierDef = orgRecord.org.tiers.find(
      (t) => t.name === myMembership.membership.tierName
    );
    if (!myTierDef) throw new Error("Tier not found in org");

    // Unwrap DEKs for accessible tiers
    const tierDeks = new Map<string, CryptoKey>();
    const accessibleTiers = orgRecord.org.tiers.filter(
      (t) => t.level <= myTierDef.level
    );

    for (const tier of accessibleTiers) {
      try {
        const keyringRecord = await client.getRecord(
          KEYRING_COLLECTION,
          `${orgRecord.rkey}:${tier.name}`
        );
        if (!keyringRecord) continue;

        const keyringVal = (keyringRecord as Record<string, unknown>)
          .value as Keyring & { $type: string };
        const myEntry = keyringVal.members.find(
          (m: KeyringMemberEntry) => m.did === myDid
        );
        if (!myEntry) continue;

        const writerPublicKey = await importPublicKey(
          fromBase64(keyringVal.writerPublicKey)
        );
        const tierDek = await unwrapDekFromMember(
          fromBase64(myEntry.wrappedDek),
          privateKey,
          writerPublicKey
        );
        tierDeks.set(tier.name, tierDek);
      } catch (err) {
        console.warn(`Failed to unwrap DEK for tier ${tier.name}:`, err);
      }
    }

    const orgMemberships = allMemberships.filter(
      (m) => m.membership.orgRkey === orgRecord.rkey
    );
    const memberDids = orgMemberships.map((m) => m.membership.memberDid);

    const { proposals, approvals, decisions } = await loadChangeControl(
      client, orgRecord.rkey, memberDids
    );

    return {
      org: orgRecord,
      service: client.getService(),
      founderDid: orgRecord.org.founderDid,
      myTierName: myMembership.membership.tierName,
      myTierLevel: myTierDef.level,
      tierDeks,
      memberships: orgMemberships,
      proposals,
      approvals,
      decisions,
    };
  };

  // --- Load personal deals ---

  const loadPersonalDeals = async (
    client: PdsClient,
    dek: CryptoKey,
    ownerDid: string
  ): Promise<DealRecord[]> => {
    const loaded: DealRecord[] = [];
    let cursor: string | undefined;

    do {
      const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        if (val.innerType !== INNER_TYPE) continue;
        const recKeyring = val.keyringRkey as string;
        if (recKeyring !== "self") continue;
        try {
          const { record } = await unsealRecord<Deal>(val, dek);
          const rkey = rec.uri.split("/").pop()!;
          loaded.push({
            rkey,
            deal: record,
            authorDid: ownerDid,
            previousDid: val.previousDid as string | undefined,
            previousRkey: val.previousRkey as string | undefined,
            orgRkey: "personal",
          });
        } catch (err) {
          console.warn("Failed to unseal record:", rec.uri, err);
        }
      }
      cursor = page.cursor;
    } while (cursor);

    return loaded;
  };

  // --- Load org deals (returns array, doesn't set state) ---

  const loadOrgDealsForCtx = async (
    client: PdsClient,
    orgCtx: OrgContext
  ): Promise<DealRecord[]> => {
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
          const val = rec.value as Record<string, unknown>;
          if (val.innerType !== INNER_TYPE) continue;
          const recKeyring = val.keyringRkey as string;
          if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;

          const rkey = rec.uri.split("/").pop()!;
          const recordKey = `${did}:${rkey}`;
          if (superseded.has(recordKey)) continue;

          const tierName = recKeyring.split(":")[1];
          const dek = orgCtx.tierDeks.get(tierName);
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
  };

  // --- Load org change control state (proposals, approvals, decisions) ---

  const loadChangeControl = async (
    client: PdsClient,
    orgRkey: string,
    memberDids: string[]
  ): Promise<{
    proposals: ProposalRecord[];
    approvals: ApprovalRecord[];
    decisions: DecisionRecord[];
  }> => {
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
          const val = rec.value as Record<string, unknown>;
          const rkey = rec.uri.split("/").pop()!;
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
  };

  // --- Filter change (no data reload, just changes what's displayed) ---

  const handleFilterChange = useCallback((newFilter: OrgFilter) => {
    setFilterOrg(newFilter);
    // Update vault's activeOrg for write operations
    if (newFilter !== "all" && newFilter !== "personal") {
      const ctx = orgContexts.get(newFilter);
      if (ctx) {
        setVault((prev) => ({
          ...prev,
          activeOrg: ctx,
          keyringRkey: `${newFilter}:${ctx.myTierName}`,
        }));
      }
    } else {
      setVault((prev) => ({ ...prev, activeOrg: null, keyringRkey: "self" }));
    }
  }, [orgContexts]);

  // --- Save deal (always creates a new record — no overwrites) ---

  const handleSaveDeal = useCallback(
    async (deal: Deal, existingRkey?: string, tierName?: string) => {
      if (!pds || !vault.session) throw new Error("Vault not unlocked");

      // Determine which org context based on the deal being edited or the current filter
      let targetOrgRkey = "personal";
      let dek: CryptoKey;
      let keyringRkey: string;

      if (activeOrg && tierName) {
        const tierDek = activeOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        keyringRkey = `${activeOrg.org.rkey}:${tierName}`;
        targetOrgRkey = activeOrg.org.rkey;
      } else if (vault.dek) {
        dek = vault.dek;
        keyringRkey = "self";
      } else {
        throw new Error("No encryption key available");
      }

      // Find the existing deal if editing (for chain link)
      const existingDeal = existingRkey
        ? deals.find((d) => d.rkey === existingRkey && d.authorDid === vault.session!.did)
        : undefined;

      const sealed = await sealRecord(INNER_TYPE, deal, keyringRkey, dek);

      // Always create a new record
      const sealedWithLink = existingDeal
        ? {
            ...(sealed as Record<string, unknown>),
            previousDid: existingDeal.authorDid,
            previousRkey: existingDeal.rkey,
          }
        : sealed;

      const res = await pds.createRecord(SEALED_COLLECTION, sealedWithLink);
      const newRkey = res.uri.split("/").pop()!;

      if (existingDeal) {
        // Write decision record for audit trail
        const decisionRkey = `${keyringRkey}:${existingDeal.rkey}:${newRkey}`;
        const decision: Decision & { $type: string } = {
          $type: DECISION_COLLECTION,
          orgRkey: activeOrg?.org.rkey ?? "personal",
          proposalDid: vault.session.did,
          proposalRkey: newRkey, // self-edit, no separate proposal
          previousDid: existingDeal.authorDid,
          previousRkey: existingDeal.rkey,
          newDid: vault.session.did,
          newRkey,
          outcome: "accepted",
          createdAt: new Date().toISOString(),
        };
        await pds.putRecord(DECISION_COLLECTION, decisionRkey, decision);

        // Replace old deal with new in local state
        setDeals((prev) => [
          ...prev.filter((d) => !(d.rkey === existingDeal.rkey && d.authorDid === existingDeal.authorDid)),
          {
            rkey: newRkey,
            deal,
            authorDid: vault.session!.did,
            previousDid: existingDeal.authorDid,
            previousRkey: existingDeal.rkey,
            orgRkey: existingDeal.orgRkey,
          },
        ]);
      } else {
        // Brand new deal
        setDeals((prev) => [...prev, {
          rkey: newRkey,
          deal,
          authorDid: vault.session!.did,
          orgRkey: targetOrgRkey,
        }]);
      }
    },
    [pds, vault.dek, activeOrg, vault.session, deals]
  );

  // --- Propose a change to someone else's deal ---

  const handlePropose = useCallback(
    async (
      targetDeal: DealRecord,
      proposedDeal: Deal,
      changeType: "edit" | "stage" | "edit+stage",
      summary: string
    ) => {
      // For proposals, we need the org context. Resolve it from the deal's orgRkey.
      const dealOrgCtx = orgContexts.get(targetDeal.orgRkey);
      if (!pds || !vault.session || !dealOrgCtx) throw new Error("Not in org mode");

      const tierName = dealOrgCtx.myTierName;
      const dek = dealOrgCtx.tierDeks.get(tierName);
      if (!dek) throw new Error("No encryption key for your tier");

      const keyringRkey = `${dealOrgCtx.org.rkey}:${tierName}`;

      // Encrypt the proposed deal content
      const json = JSON.stringify(proposedDeal);
      const plaintext = new TextEncoder().encode(json);
      const { iv, ciphertext } = await aesEncrypt(plaintext, dek);

      // Determine required offices from workflow gates
      const workflow = dealOrgCtx.org.org.workflow;
      let requiredOffices: string[] = [];
      if (workflow && changeType !== "edit") {
        const gate = workflow.gates.find(
          (g) => g.fromStage === targetDeal.deal.stage && g.toStage === proposedDeal.stage
        );
        if (gate) {
          requiredOffices = gate.requiredOffices;
        }
      }

      const proposal: Proposal & { $type: string } = {
        $type: PROPOSAL_COLLECTION,
        orgRkey: dealOrgCtx.org.rkey,
        targetDid: targetDeal.authorDid,
        targetRkey: targetDeal.rkey,
        iv: toBase64(iv),
        ciphertext: toBase64(ciphertext),
        keyringRkey,
        changeType,
        summary,
        requiredOffices,
        proposerDid: vault.session.did,
        proposerHandle: vault.session.handle,
        status: requiredOffices.length === 0 ? "approved" : "open",
        createdAt: new Date().toISOString(),
      };

      const res = await pds.createRecord(PROPOSAL_COLLECTION, proposal);
      const rkey = res.uri.split("/").pop()!;

      // Update org context with new proposal
      setOrgContexts((prev) => {
        const updated = new Map(prev);
        const ctx = updated.get(dealOrgCtx.org.rkey);
        if (ctx) {
          updated.set(dealOrgCtx.org.rkey, {
            ...ctx,
            proposals: [...ctx.proposals, { rkey, proposal: proposal as Proposal }],
          });
        }
        return updated;
      });

      // If no approvals needed, apply immediately
      if (requiredOffices.length === 0) {
        await applyProposal(
          rkey,
          proposal as Proposal,
          targetDeal,
          proposedDeal,
          dek,
          keyringRkey
        );
      }

      return rkey;
    },
    [pds, vault.session, orgContexts]
  );

  // --- Approve a proposal ---

  const handleApprove = useCallback(
    async (proposalDid: string, proposalRkey: string, officeName: string) => {
      if (!pds || !vault.session) throw new Error("Not logged in");

      // Find the org this proposal belongs to
      let proposalOrgRkey: string | undefined;
      for (const [orgRkey, ctx] of orgContexts) {
        if (ctx.proposals.some((p) => p.rkey === proposalRkey && p.proposal.proposerDid === proposalDid)) {
          proposalOrgRkey = orgRkey;
          break;
        }
      }
      if (!proposalOrgRkey) throw new Error("Proposal org not found");

      const approval: Approval & { $type: string } = {
        $type: APPROVAL_COLLECTION,
        proposalDid,
        proposalRkey,
        officeName,
        approverDid: vault.session.did,
        approverHandle: vault.session.handle,
        createdAt: new Date().toISOString(),
      };

      const approvalRkey = `${proposalOrgRkey}:${proposalRkey}:${officeName}:${vault.session.did}`;
      await pds.putRecord(APPROVAL_COLLECTION, approvalRkey, approval);

      // Update org context
      setOrgContexts((prev) => {
        const updated = new Map(prev);
        const ctx = updated.get(proposalOrgRkey!);
        if (ctx) {
          updated.set(proposalOrgRkey!, {
            ...ctx,
            approvals: [...ctx.approvals, { rkey: approvalRkey, approval: approval as Approval }],
          });
        }
        return updated;
      });
    },
    [pds, vault.session, orgContexts]
  );

  // --- Apply a proposal (write new version + decision record) ---

  const applyProposal = async (
    proposalRkey: string,
    proposal: Proposal,
    targetDeal: DealRecord,
    newDeal: Deal,
    dek: CryptoKey,
    keyringRkey: string
  ) => {
    if (!pds || !vault.session) return;

    // Write the new sealed record with supersession link
    const sealed = await sealRecord(INNER_TYPE, newDeal, keyringRkey, dek);
    const sealedWithLink = {
      ...(sealed as Record<string, unknown>),
      previousDid: targetDeal.authorDid,
      previousRkey: targetDeal.rkey,
    };

    const newRes = await pds.createRecord(SEALED_COLLECTION, sealedWithLink);
    const newRkey = newRes.uri.split("/").pop()!;

    // Write decision record
    const decision: Decision & { $type: string } = {
      $type: DECISION_COLLECTION,
      orgRkey: proposal.orgRkey,
      proposalDid: vault.session.did,
      proposalRkey,
      previousDid: targetDeal.authorDid,
      previousRkey: targetDeal.rkey,
      newDid: vault.session.did,
      newRkey,
      outcome: "accepted",
      createdAt: new Date().toISOString(),
    };

    const decisionRkey = `${proposal.orgRkey}:${proposalRkey}`;
    await pds.putRecord(DECISION_COLLECTION, decisionRkey, decision);

    // Update proposal status
    await pds.putRecord(PROPOSAL_COLLECTION, proposalRkey, {
      $type: PROPOSAL_COLLECTION,
      ...proposal,
      status: "applied",
    });

    // Update deals — replace old with new
    setDeals((prev) => [
      ...prev.filter(
        (d) => !(d.rkey === targetDeal.rkey && d.authorDid === targetDeal.authorDid)
      ),
      {
        rkey: newRkey,
        deal: newDeal,
        authorDid: vault.session!.did,
        previousDid: targetDeal.authorDid,
        previousRkey: targetDeal.rkey,
        orgRkey: targetDeal.orgRkey,
      },
    ]);

    // Update org context decisions
    setOrgContexts((prev) => {
      const updated = new Map(prev);
      const ctx = updated.get(proposal.orgRkey);
      if (ctx) {
        updated.set(proposal.orgRkey, {
          ...ctx,
          decisions: [...ctx.decisions, { rkey: decisionRkey, decision: decision as Decision }],
        });
      }
      return updated;
    });
  };

  // --- Delete deal ---

  const handleDeleteDeal = useCallback(
    async (rkey: string) => {
      if (!pds) throw new Error("Vault not unlocked");
      await pds.deleteRecord(SEALED_COLLECTION, rkey);
      setDeals((prev) => prev.filter((d) => d.rkey !== rkey));
    },
    [pds]
  );

  // --- Update org (offices/workflow changes) ---

  const handleUpdateOrg = useCallback(
    async (updatedOrg: Org) => {
      if (!pds) return;
      const orgRecord = orgs.find((o) => o.org.name === updatedOrg.name);
      if (!orgRecord) return;

      await pds.putRecord(ORG_COLLECTION, orgRecord.rkey, {
        $type: ORG_COLLECTION,
        ...updatedOrg,
      });

      setOrgs((prev) =>
        prev.map((o) =>
          o.rkey === orgRecord.rkey ? { ...o, org: updatedOrg } : o
        )
      );

      // Update org context
      setOrgContexts((prev) => {
        const updated = new Map(prev);
        const ctx = updated.get(orgRecord.rkey);
        if (ctx) {
          updated.set(orgRecord.rkey, {
            ...ctx,
            org: { ...ctx.org, org: updatedOrg },
          });
        }
        return updated;
      });
    },
    [pds, orgs]
  );

  // --- Logout ---

  const handleLogout = useCallback(() => {
    setVault({
      session: null,
      dek: null,
      initialized: false,
      keyringRkey: null,
      activeOrg: null,
    });
    setDeals([]);
    setPds(null);
    setIdentityKeys(null);
    setOrgs([]);
    setMemberships([]);
    setOrgContexts(new Map());
    setFilterOrg("all");
  }, []);

  // --- Render ---

  if (!vault.session || !vault.dek) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onShowDocs={() => setTab("docs")}
        showingDocs={tab === "docs"}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <p>Decrypting vault...</p>
      </div>
    );
  }

  // Compute available tiers for the deal form
  const availableTiers = activeOrg
    ? activeOrg.org.org.tiers.filter(
        (t) => t.level <= activeOrg!.myTierLevel
      )
    : null;

  // Build org name map for display
  const orgNames = new Map<string, string>();
  orgNames.set("personal", "Personal");
  for (const org of orgs) {
    orgNames.set(org.rkey, org.org.name);
  }

  return (
    <>
      <DealsBoard
        deals={deals}
        filterOrg={filterOrg}
        orgNames={orgNames}
        onSaveDeal={handleSaveDeal}
        onDeleteDeal={handleDeleteDeal}
        onPropose={handlePropose}
        onApprove={handleApprove}
        handle={vault.session.handle}
        myDid={vault.session.did}
        onLogout={handleLogout}
        tab={tab}
        onTabChange={setTab}
        orgSwitcher={
          <OrgSwitcher
            orgs={orgs}
            filterOrg={filterOrg}
            onFilterChange={handleFilterChange}
            onManageOrgs={() => setShowOrgManager(true)}
            activeOrg={activeOrg}
          />
        }
        activeOrg={activeOrg}
        orgContexts={orgContexts}
        availableTiers={availableTiers}
      />
      {tab === "docs" && <DocsPage />}
      {showOrgManager && pds && identityKeys && (
        <OrgManager
          pds={pds}
          myDid={vault.session.did}
          myHandle={vault.session.handle}
          myPrivateKey={identityKeys.privateKey}
          myPublicKey={identityKeys.publicKey}
          orgs={orgs}
          memberships={memberships}
          onOrgCreated={(org) => setOrgs((prev) => [...prev, org])}
          onMemberInvited={(m) =>
            setMemberships((prev) => [...prev, m])
          }
          onOrgUpdated={handleUpdateOrg}
          onClose={() => setShowOrgManager(false)}
        />
      )}
    </>
  );
}
