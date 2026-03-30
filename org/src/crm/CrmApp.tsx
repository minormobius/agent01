/**
 * CrmApp — encrypted deal pipeline on ATProto.
 * Receives vault + pds + shared org contexts from the hub.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { PdsClient } from "../pds";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type {
  Deal,
  DealRecord,
  Expense,
  ExpenseRecord,
  OrgRecord,
  OrgContext,
  OrgFilter,
} from "./types";
import {
  loadPersonalDeals,
  loadOrgDealsForCtx,
  saveDeal,
  writeDecision,
  createProposal,
  createApproval,
  applyProposal as applyProposalFn,
  keyringRkeyForTier,
  broadcastNotification,
  SEALED_COLLECTION,
  loadPersonalExpenses,
  loadOrgExpenses,
  saveExpense,
  updateExpense as updateExpenseFn,
  deleteExpense as deleteExpenseFn,
} from "./context";
import { DealsBoard } from "./components/DealsBoard";
import { ExpensesPanel } from "./components/ExpensesPanel";
import { OrgSwitcher } from "./components/OrgSwitcher";

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

export function CrmApp({ vault, pds, orgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();

  // CRM state — local copy of contexts so change control can update locally
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [orgContexts, setOrgContexts] = useState<Map<string, OrgContext>>(sharedContexts);
  const [crmTab, setCrmTab] = useState<"deals" | "expenses">("deals");

  const loadedRef = useRef(false);

  // Sync from hub when shared contexts change
  useEffect(() => {
    setOrgContexts(sharedContexts);
  }, [sharedContexts]);

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
        const personalExp = await loadPersonalExpenses(pds, vault.dek, vault.session.did);
        const allOrgDeals: DealRecord[] = [];
        const allOrgExp: ExpenseRecord[] = [];
        for (const ctx of orgContexts.values()) {
          try {
            allOrgDeals.push(...await loadOrgDealsForCtx(pds, ctx));
            allOrgExp.push(...await loadOrgExpenses(pds, ctx));
          } catch (err) {
            console.warn(`Failed to load data for ${ctx.org.org.name}:`, err);
          }
        }
        setDeals([...personalDeals, ...allOrgDeals]);
        setExpenses([...personalExp, ...allOrgExp]);
      } finally {
        setLoading(false);
      }
    })();
  }, [vault, pds, orgContexts]);

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
        // Broadcast deal update notification
        if (currentActiveOrg) {
          broadcastNotification(
            pds, "deal-updated", currentActiveOrg.org.rkey, currentActiveOrg.org.org.name,
            {
              type: "deal-updated",
              orgRkey: currentActiveOrg.org.rkey,
              orgName: currentActiveOrg.org.org.name,
              dealTitle: deal.title,
              stage: deal.stage,
              senderHandle: vault.session.handle,
              createdAt: new Date().toISOString(),
            },
            vault.session.did, vault.session.handle, undefined, currentActiveOrg,
          ).catch(() => {});
        }
      } else {
        setDeals((prev) => [...prev, { rkey: newRkey, deal, authorDid: vault.session.did, orgRkey: targetOrgRkey }]);
        // Broadcast new deal notification
        if (currentActiveOrg) {
          broadcastNotification(
            pds, "deal-created", currentActiveOrg.org.rkey, currentActiveOrg.org.org.name,
            {
              type: "deal-created",
              orgRkey: currentActiveOrg.org.rkey,
              orgName: currentActiveOrg.org.org.name,
              dealTitle: deal.title,
              stage: deal.stage,
              senderHandle: vault.session.handle,
              createdAt: new Date().toISOString(),
            },
            vault.session.did, vault.session.handle, undefined, currentActiveOrg,
          ).catch(() => {});
        }
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

      // Broadcast proposal notification
      broadcastNotification(
        pds, "proposal-created", dealOrgCtx.org.rkey, dealOrgCtx.org.org.name,
        {
          type: "proposal-created",
          orgRkey: dealOrgCtx.org.rkey,
          orgName: dealOrgCtx.org.org.name,
          summary,
          senderHandle: vault.session.handle,
          createdAt: new Date().toISOString(),
        },
        vault.session.did, vault.session.handle, undefined, dealOrgCtx,
      ).catch(() => {});

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

  // --- Expense handlers ---
  const handleSaveExpense = useCallback(
    async (expense: Expense, existingRkey?: string) => {
      if (!pds || !vault) throw new Error("Vault not unlocked");

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      const currentActiveOrg = filterOrg !== "all" && filterOrg !== "personal"
        ? orgContexts.get(filterOrg) ?? null
        : null;

      if (currentActiveOrg) {
        const tierName = currentActiveOrg.myTierName;
        const tierDek = currentActiveOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = currentActiveOrg.org.org.tiers.find((t) => t.name === tierName);
        const epoch = tierDef?.currentEpoch ?? 0;
        keyringRkey = keyringRkeyForTier(currentActiveOrg.org.rkey, tierName, epoch);
        orgRkey = currentActiveOrg.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      if (existingRkey) {
        const { rkey: newRkey } = await updateExpenseFn(pds, existingRkey, expense, dek, keyringRkey);
        setExpenses((prev) => [
          ...prev.filter((e) => e.rkey !== existingRkey),
          { rkey: newRkey, expense, authorDid: vault.session.did, orgRkey },
        ]);
      } else {
        const { rkey } = await saveExpense(pds, expense, dek, keyringRkey);
        setExpenses((prev) => [...prev, { rkey, expense, authorDid: vault.session.did, orgRkey }]);
      }
    },
    [pds, vault, filterOrg, orgContexts],
  );

  const handleDeleteExpense = useCallback(
    async (rkey: string) => {
      if (!pds) return;
      await deleteExpenseFn(pds, rkey);
      setExpenses((prev) => prev.filter((e) => e.rkey !== rkey));
    },
    [pds],
  );

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
        <div className="loading">Loading deals...</div>
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
      {crmTab === "deals" ? (
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
          onLogout={() => navigate("/")}
          onBackToHub={() => navigate("/")}
          orgSwitcher={
            <OrgSwitcher
              orgs={orgs}
              filterOrg={filterOrg}
              onFilterChange={handleFilterChange}
              onManageOrgs={() => navigate("/")}
              activeOrg={activeOrg}
            />
          }
          activeOrg={activeOrg}
          orgContexts={orgContexts}
          availableTiers={availableTiers}
          crmTab={crmTab}
          onCrmTabChange={setCrmTab}
        />
      ) : (
        <ExpensesPanel
          expenses={expenses}
          deals={deals}
          filterOrg={filterOrg}
          orgNames={orgNames}
          myDid={vault.session.did}
          handle={vault.session.handle}
          onSaveExpense={handleSaveExpense}
          onDeleteExpense={handleDeleteExpense}
          onBackToHub={() => navigate("/")}
          orgSwitcher={
            <OrgSwitcher
              orgs={orgs}
              filterOrg={filterOrg}
              onFilterChange={handleFilterChange}
              onManageOrgs={() => navigate("/")}
              activeOrg={activeOrg}
            />
          }
          crmTab={crmTab}
          onCrmTabChange={setCrmTab}
        />
      )}
    </div>
  );
}
