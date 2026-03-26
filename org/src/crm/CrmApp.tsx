/**
 * CrmApp — encrypted deal pipeline on ATProto.
 * Receives vault + pds from the org hub (no independent login).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { PdsClient } from "../pds";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type {
  Deal,
  DealRecord,
  OrgRecord,
  OrgContext,
  Org,
  MembershipRecord,
  OrgFilter,
  OrgRelationshipRecord,
} from "./types";
import {
  discoverOrgs,
  buildOrgContext,
  loadPersonalDeals,
  loadOrgDealsForCtx,
  saveDeal,
  writeDecision,
  createProposal,
  createApproval,
  applyProposal as applyProposalFn,
  keyringRkeyForTier,
  SEALED_COLLECTION,
  ORG_COLLECTION,
} from "./context";
import { DealsBoard } from "./components/DealsBoard";
import { DocsPage } from "./components/DocsPage";
import { OrgManager } from "./components/OrgManager";
import { OrgSwitcher } from "./components/OrgSwitcher";

type Tab = "deals" | "docs";

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
}

export function CrmApp({ vault, pds }: Props) {
  const { navigate } = useRouter();

  // CRM state
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("deals");
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [showOrgManager, setShowOrgManager] = useState(false);
  const [orgContexts, setOrgContexts] = useState<Map<string, OrgContext>>(new Map());
  const [relationships, setRelationships] = useState<OrgRelationshipRecord[]>([]);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");

  const loadedRef = useRef(false);

  // Derive activeOrg from filter
  const activeOrg = filterOrg !== "all" && filterOrg !== "personal"
    ? orgContexts.get(filterOrg) ?? null
    : null;

  // --- Initial data load ---
  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const personalDeals = await loadPersonalDeals(pds, vault.dek, vault.session.did);
        const { foundedOrgs, joinedOrgs, allMemberships } = await discoverOrgs(pds);

        const allOrgDeals: DealRecord[] = [];
        const loadedContexts = new Map<string, OrgContext>();

        // Founded orgs
        for (const org of foundedOrgs) {
          const myMembership = allMemberships.find(
            (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === vault.session.did
          );
          if (!myMembership) continue;
          try {
            const ctx = await buildOrgContext(
              pds, pds.getService(), org, myMembership, allMemberships, vault.privateKey, vault.session.did
            );
            loadedContexts.set(org.rkey, ctx);
            const orgDeals = await loadOrgDealsForCtx(pds, ctx);
            allOrgDeals.push(...orgDeals);
          } catch (err) {
            console.warn(`Failed to load org ${org.org.name}:`, err);
          }
        }

        // Joined orgs
        for (const { org, founderService } of joinedOrgs) {
          const myMembership = allMemberships.find(
            (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === vault.session.did
          );
          if (!myMembership) continue;
          try {
            const ctx = await buildOrgContext(
              pds, founderService, org, myMembership, allMemberships, vault.privateKey, vault.session.did
            );
            loadedContexts.set(org.rkey, ctx);
            const orgDeals = await loadOrgDealsForCtx(pds, ctx);
            allOrgDeals.push(...orgDeals);
          } catch (err) {
            console.warn(`Failed to load joined org ${org.org.name}:`, err);
          }
        }

        const allOrgRecords = [...foundedOrgs, ...joinedOrgs.map((j) => j.org)];

        // Collect relationships
        const allRelationships: OrgRelationshipRecord[] = [];
        for (const ctx of loadedContexts.values()) {
          for (const r of ctx.relationships) {
            if (!allRelationships.some((ar) => ar.rkey === r.rkey)) {
              allRelationships.push(r);
            }
          }
        }

        setDeals([...personalDeals, ...allOrgDeals]);
        setOrgContexts(loadedContexts);
        setOrgs(allOrgRecords);
        setMemberships(allMemberships);
        setRelationships(allRelationships);
      } finally {
        setLoading(false);
      }
    })();
  }, [vault, pds]);

  // --- Filter change ---
  const handleFilterChange = useCallback((newFilter: OrgFilter) => {
    setFilterOrg(newFilter);
  }, []);

  // --- Save deal ---
  const handleSaveDeal = useCallback(
    async (deal: Deal, existingRkey?: string, tierName?: string) => {
      if (!pds || !vault) throw new Error("Vault not unlocked");

      let targetOrgRkey = "personal";
      let dek: CryptoKey;
      let keyringRkey: string;

      const currentActiveOrg = filterOrg !== "all" && filterOrg !== "personal"
        ? orgContexts.get(filterOrg) ?? null
        : null;

      if (currentActiveOrg && tierName) {
        const tierDek = currentActiveOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = currentActiveOrg.org.org.tiers.find((t) => t.name === tierName);
        const epoch = tierDef?.currentEpoch ?? 0;
        keyringRkey = keyringRkeyForTier(currentActiveOrg.org.rkey, tierName, epoch);
        targetOrgRkey = currentActiveOrg.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      const existingDeal = existingRkey
        ? deals.find((d) => d.rkey === existingRkey && d.authorDid === vault.session.did)
        : undefined;

      const { rkey: newRkey } = await saveDeal(pds, deal, dek, keyringRkey, existingDeal);

      if (existingDeal) {
        await writeDecision(
          pds,
          currentActiveOrg?.org.rkey ?? "personal",
          vault.session.did,
          newRkey,
          existingDeal.authorDid,
          existingDeal.rkey,
          vault.session.did,
          newRkey,
          keyringRkey
        );
        setDeals((prev) => [
          ...prev.filter((d) => !(d.rkey === existingDeal.rkey && d.authorDid === existingDeal.authorDid)),
          { rkey: newRkey, deal, authorDid: vault.session.did, previousDid: existingDeal.authorDid, previousRkey: existingDeal.rkey, orgRkey: existingDeal.orgRkey },
        ]);
      } else {
        setDeals((prev) => [...prev, { rkey: newRkey, deal, authorDid: vault.session.did, orgRkey: targetOrgRkey }]);
      }
    },
    [pds, vault, deals, filterOrg, orgContexts]
  );

  // --- Propose ---
  const handlePropose = useCallback(
    async (
      targetDeal: DealRecord,
      proposedDeal: Deal,
      changeType: "edit" | "stage" | "edit+stage",
      summary: string
    ) => {
      if (!pds || !vault) throw new Error("Not in org mode");
      const dealOrgCtx = orgContexts.get(targetDeal.orgRkey);
      if (!dealOrgCtx) throw new Error("Org context not found");

      const { rkey, proposal } = await createProposal(
        pds, dealOrgCtx, targetDeal, proposedDeal, changeType, summary,
        vault.session.did, vault.session.handle
      );

      setOrgContexts((prev) => {
        const updated = new Map(prev);
        const ctx = updated.get(dealOrgCtx.org.rkey);
        if (ctx) {
          updated.set(dealOrgCtx.org.rkey, { ...ctx, proposals: [...ctx.proposals, { rkey, proposal }] });
        }
        return updated;
      });

      // If no approvals needed, apply immediately
      if (proposal.requiredOffices.length === 0) {
        const tierName = dealOrgCtx.myTierName;
        const dek = dealOrgCtx.tierDeks.get(tierName);
        if (!dek) return rkey;
        const tierDef = dealOrgCtx.org.org.tiers.find((t) => t.name === tierName);
        const epoch = tierDef?.currentEpoch ?? 0;
        const keyringRkey = keyringRkeyForTier(dealOrgCtx.org.rkey, tierName, epoch);

        const { newRkey, decisionRkey } = await applyProposalFn(
          pds, rkey, proposal, targetDeal, proposedDeal, dek, keyringRkey, vault.session.did
        );

        setDeals((prev) => [
          ...prev.filter((d) => !(d.rkey === targetDeal.rkey && d.authorDid === targetDeal.authorDid)),
          { rkey: newRkey, deal: proposedDeal, authorDid: vault.session.did, previousDid: targetDeal.authorDid, previousRkey: targetDeal.rkey, orgRkey: targetDeal.orgRkey },
        ]);

        setOrgContexts((prev) => {
          const updated = new Map(prev);
          const ctx = updated.get(dealOrgCtx.org.rkey);
          if (ctx) {
            updated.set(dealOrgCtx.org.rkey, {
              ...ctx,
              decisions: [...ctx.decisions, { rkey: decisionRkey, decision: { orgRkey: proposal.orgRkey, proposalDid: vault.session.did, proposalRkey: rkey, previousDid: targetDeal.authorDid, previousRkey: targetDeal.rkey, newDid: vault.session.did, newRkey, outcome: "accepted", createdAt: new Date().toISOString() } }],
            });
          }
          return updated;
        });
      }

      return rkey;
    },
    [pds, vault, orgContexts]
  );

  // --- Approve ---
  const handleApprove = useCallback(
    async (proposalDid: string, proposalRkey: string, officeName: string) => {
      if (!pds || !vault) throw new Error("Not logged in");

      let proposalOrgRkey: string | undefined;
      for (const [orgRkey, ctx] of orgContexts) {
        if (ctx.proposals.some((p) => p.rkey === proposalRkey && p.proposal.proposerDid === proposalDid)) {
          proposalOrgRkey = orgRkey;
          break;
        }
      }
      if (!proposalOrgRkey) throw new Error("Proposal org not found");

      const { rkey: approvalRkey, approval } = await createApproval(
        pds, proposalOrgRkey, proposalDid, proposalRkey, officeName,
        vault.session.did, vault.session.handle
      );

      setOrgContexts((prev) => {
        const updated = new Map(prev);
        const ctx = updated.get(proposalOrgRkey!);
        if (ctx) {
          updated.set(proposalOrgRkey!, { ...ctx, approvals: [...ctx.approvals, { rkey: approvalRkey, approval }] });
        }
        return updated;
      });
    },
    [pds, vault, orgContexts]
  );

  // --- Delete deal ---
  const handleDeleteDeal = useCallback(
    async (rkey: string) => {
      if (!pds) throw new Error("Vault not unlocked");
      await pds.deleteRecord(SEALED_COLLECTION, rkey);
      setDeals((prev) => prev.filter((d) => d.rkey !== rkey));
    },
    [pds]
  );

  // --- Update org ---
  const handleUpdateOrg = useCallback(
    async (updatedOrg: Org) => {
      if (!pds) return;
      const orgRecord = orgs.find((o) => o.org.name === updatedOrg.name);
      if (!orgRecord) return;

      await pds.putRecord(ORG_COLLECTION, orgRecord.rkey, { $type: ORG_COLLECTION, ...updatedOrg });

      setOrgs((prev) => prev.map((o) => o.rkey === orgRecord.rkey ? { ...o, org: updatedOrg } : o));
      setOrgContexts((prev) => {
        const updated = new Map(prev);
        const ctx = updated.get(orgRecord.rkey);
        if (ctx) updated.set(orgRecord.rkey, { ...ctx, org: { ...ctx.org, org: updatedOrg } });
        return updated;
      });
    },
    [pds, orgs]
  );

  // --- Org joined ---
  const handleOrgJoined = useCallback(
    async (org: OrgRecord, founderService: string, newMemberships: MembershipRecord[]) => {
      if (!pds || !vault) return;
      setOrgs((prev) => [...prev, org]);
      setMemberships((prev) => [...prev, ...newMemberships]);

      const myMembership = newMemberships.find((m) => m.membership.memberDid === vault.session.did);
      if (!myMembership) return;

      try {
        const ctx = await buildOrgContext(
          pds, founderService, org, myMembership, newMemberships, vault.privateKey, vault.session.did
        );
        setOrgContexts((prev) => { const u = new Map(prev); u.set(org.rkey, ctx); return u; });
        const orgDeals = await loadOrgDealsForCtx(pds, ctx);
        setDeals((prev) => [...prev, ...orgDeals]);
      } catch (err) {
        console.warn("Failed to load joined org:", err);
      }
    },
    [pds, vault]
  );

  // --- Member removed ---
  const handleMemberRemoved = useCallback(
    async (membershipRkey: string, updatedOrg: Org) => {
      if (!pds || !vault) return;
      setMemberships((prev) => prev.filter((m) => m.rkey !== membershipRkey));

      const orgRecord = orgs.find((o) => o.org.name === updatedOrg.name);
      if (orgRecord) {
        setOrgs((prev) => prev.map((o) => o.rkey === orgRecord.rkey ? { ...o, org: updatedOrg } : o));
      }

      if (orgRecord) {
        const myMembership = memberships.find(
          (m) => m.membership.orgRkey === orgRecord.rkey && m.membership.memberDid === vault.session.did
        );
        if (myMembership) {
          try {
            const founderService = orgContexts.get(orgRecord.rkey)?.service ?? pds.getService();
            const allMems = memberships.filter((m) => m.rkey !== membershipRkey);
            const ctx = await buildOrgContext(
              pds, founderService, { rkey: orgRecord.rkey, org: updatedOrg }, myMembership, allMems,
              vault.privateKey, vault.session.did
            );
            setOrgContexts((prev) => { const u = new Map(prev); u.set(orgRecord.rkey, ctx); return u; });
          } catch (err) {
            console.warn("Failed to rebuild org context:", err);
          }
        }
      }
    },
    [pds, vault, orgs, memberships, orgContexts]
  );

  // --- Logout (back to hub) ---
  const handleLogout = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // --- Guard ---
  if (!vault || !pds) {
    return (
      <div className="crm-container">
        <div className="crm-empty">
          <p>Not logged in.</p>
          <button className="btn-primary" onClick={() => navigate("/")}>Back to Hub</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="crm-container">
        <div className="loading">Decrypting vault...</div>
      </div>
    );
  }

  // Compute available tiers
  const availableTiers = activeOrg
    ? activeOrg.org.org.tiers.filter((t) => t.level <= activeOrg.myTierLevel)
    : null;

  // Build org name map
  const orgNames = new Map<string, string>();
  orgNames.set("personal", "Personal");
  for (const org of orgs) {
    orgNames.set(org.rkey, org.org.name);
  }

  return (
    <div className="crm-container">
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
        onBackToHub={() => navigate("/")}
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
      {showOrgManager && (
        <OrgManager
          pds={pds}
          myDid={vault.session.did}
          myHandle={vault.session.handle}
          myPrivateKey={vault.privateKey}
          myPublicKey={vault.publicKey}
          orgs={orgs}
          memberships={memberships}
          relationships={relationships}
          onOrgCreated={(org) => setOrgs((prev) => [...prev, org])}
          onMemberInvited={(m) => setMemberships((prev) => [...prev, m])}
          onOrgUpdated={handleUpdateOrg}
          onOrgJoined={handleOrgJoined}
          onMemberRemoved={handleMemberRemoved}
          onRelationshipCreated={(rel) => setRelationships((prev) => [...prev, rel])}
          onClose={() => setShowOrgManager(false)}
        />
      )}
    </div>
  );
}
