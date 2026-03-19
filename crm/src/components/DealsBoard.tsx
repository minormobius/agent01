import { useState, useMemo, type ReactNode } from "react";
import { STAGES, STAGE_LABELS } from "../types";
import type { Deal, DealRecord, Stage, TierDef, OrgContext, OrgFilter } from "../types";
import { DealCard } from "./DealCard";
import { DealForm } from "./DealForm";

type Tab = "deals" | "docs";

interface Props {
  deals: DealRecord[];
  filterOrg: OrgFilter;
  orgNames: Map<string, string>;
  onSaveDeal: (deal: Deal, existingRkey?: string, tierName?: string) => Promise<void>;
  onDeleteDeal: (rkey: string) => Promise<void>;
  onPropose?: (
    targetDeal: DealRecord,
    proposedDeal: Deal,
    changeType: "edit" | "stage" | "edit+stage",
    summary: string
  ) => Promise<string>;
  onApprove?: (proposalDid: string, proposalRkey: string, officeName: string) => Promise<void>;
  handle: string;
  myDid: string;
  onLogout: () => void;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  orgSwitcher?: ReactNode;
  activeOrg?: OrgContext | null;
  orgContexts: Map<string, OrgContext>;
  availableTiers?: TierDef[] | null;
}

export function DealsBoard({
  deals,
  filterOrg,
  orgNames,
  onSaveDeal,
  onDeleteDeal,
  onPropose,
  onApprove,
  handle,
  myDid,
  onLogout,
  tab,
  onTabChange,
  orgSwitcher,
  activeOrg,
  orgContexts,
  availableTiers,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DealRecord | undefined>();
  const [proposing, setProposing] = useState<DealRecord | undefined>();

  // Local filters
  const [filterStage, setFilterStage] = useState<Stage | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Apply all filters
  const filteredDeals = useMemo(() => {
    let result = deals;

    // Org filter
    if (filterOrg === "personal") {
      result = result.filter((d) => d.orgRkey === "personal");
    } else if (filterOrg !== "all") {
      result = result.filter((d) => d.orgRkey === filterOrg);
    }

    // Stage filter
    if (filterStage !== "all") {
      result = result.filter((d) => d.deal.stage === filterStage);
    }

    // Date filters
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      result = result.filter((d) => new Date(d.deal.createdAt) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo + "T23:59:59");
      result = result.filter((d) => new Date(d.deal.createdAt) <= to);
    }

    return result;
  }, [deals, filterOrg, filterStage, filterDateFrom, filterDateTo]);

  const columnDeals = (stage: Stage) =>
    filteredDeals.filter((d) => d.deal.stage === stage);

  const totalValue = filteredDeals.reduce((sum, d) => sum + (d.deal.value ?? 0), 0);

  const handleEdit = (dr: DealRecord) => {
    // If this deal belongs to an org and we're not the author, propose
    const dealOrgCtx = dr.orgRkey !== "personal" ? orgContexts.get(dr.orgRkey) : null;
    if (dealOrgCtx && dr.authorDid !== myDid) {
      setProposing(dr);
      setEditing(undefined);
      setShowForm(true);
    } else {
      setEditing(dr);
      setProposing(undefined);
      setShowForm(true);
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setEditing(undefined);
    setProposing(undefined);
  };

  // Determine if "New Deal" should be available
  // Available when viewing personal or a specific org (not "all")
  const canCreate = filterOrg !== "all";

  // Get org context for a deal (for proposals/approvals display)
  const getOrgCtxForDeal = (dr: DealRecord): OrgContext | null => {
    if (dr.orgRkey === "personal") return null;
    return orgContexts.get(dr.orgRkey) ?? null;
  };

  // Get pending proposals for a deal
  const getProposals = (dr: DealRecord) => {
    const ctx = getOrgCtxForDeal(dr);
    if (!ctx) return [];
    return ctx.proposals.filter(
      (p) =>
        p.proposal.targetDid === dr.authorDid &&
        p.proposal.targetRkey === dr.rkey &&
        (p.proposal.status === "open" || p.proposal.status === "approved")
    );
  };

  // Get approvals for a proposal
  const getApprovals = (proposalDid: string, proposalRkey: string) => {
    // Search across all org contexts
    for (const ctx of orgContexts.values()) {
      const approvals = ctx.approvals.filter(
        (a) =>
          a.approval.proposalDid === proposalDid &&
          a.approval.proposalRkey === proposalRkey
      );
      if (approvals.length > 0) return approvals;
    }
    return [];
  };

  // Get offices current user belongs to (for a specific deal's org)
  const getMyOfficesForDeal = (dr: DealRecord) => {
    const ctx = getOrgCtxForDeal(dr);
    if (!ctx) return [];
    return (ctx.org.org.offices ?? []).filter(
      (o) => o.memberDids.includes(myDid)
    );
  };

  // Get workflow gates for a deal's org (for policy notification)
  const getWorkflowGates = (dr: DealRecord) => {
    const ctx = getOrgCtxForDeal(dr);
    if (!ctx) return [];
    return ctx.org.org.workflow?.gates ?? [];
  };

  const hasActiveFilters = filterStage !== "all" || filterDateFrom || filterDateTo;

  return (
    <div className="board-container">
      <header className="board-header">
        <div className="header-left">
          {orgSwitcher}
          <nav className="tab-bar">
            <button
              className={`tab ${tab === "deals" ? "tab-active" : ""}`}
              onClick={() => onTabChange("deals")}
            >
              Deals
            </button>
            <button
              className={`tab ${tab === "docs" ? "tab-active" : ""}`}
              onClick={() => onTabChange("docs")}
            >
              Docs
            </button>
          </nav>
          {tab === "deals" && (
            <span className="header-stat">
              {filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""}
              {filteredDeals.length !== deals.length && ` of ${deals.length}`}
              {totalValue > 0 && ` / ${formatCurrency(totalValue)}`}
            </span>
          )}
        </div>
        <div className="header-right">
          <span className="header-handle">{handle}</span>
          {tab === "deals" && canCreate && (
            <button onClick={() => { setEditing(undefined); setProposing(undefined); setShowForm(true); }} className="btn-primary">
              + New Deal
            </button>
          )}
          <button onClick={onLogout} className="btn-secondary">
            Lock
          </button>
        </div>
      </header>

      {tab === "deals" && (
        <>
          <div className="filter-bar">
            <div className="filter-group">
              <label>Stage</label>
              <select
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value as Stage | "all")}
              >
                <option value="all">All stages</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
            {hasActiveFilters && (
              <button
                className="filter-clear"
                onClick={() => { setFilterStage("all"); setFilterDateFrom(""); setFilterDateTo(""); }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="board">
            {(filterStage === "all" ? STAGES : [filterStage]).map((stage) => {
              const items = filterStage === "all" ? columnDeals(stage) : filteredDeals;
              const colValue = items.reduce((s, d) => s + (d.deal.value ?? 0), 0);
              return (
                <div key={stage} className={`column column-${stage}`}>
                  <div className="column-header">
                    <span className="column-title">{STAGE_LABELS[stage]}</span>
                    <span className="column-count">{items.length}</span>
                    {colValue > 0 && (
                      <span className="column-value">{formatCurrency(colValue)}</span>
                    )}
                  </div>
                  <div className="column-cards">
                    {items.map((dr) => (
                      <DealCard
                        key={`${dr.authorDid}:${dr.rkey}`}
                        dealRecord={dr}
                        onEdit={handleEdit}
                        onDelete={dr.authorDid === myDid ? onDeleteDeal : undefined}
                        isOwn={dr.authorDid === myDid}
                        isOrg={dr.orgRkey !== "personal"}
                        orgName={orgNames.get(dr.orgRkey)}
                        showOrgBadge={filterOrg === "all"}
                        proposals={getProposals(dr)}
                        getApprovals={getApprovals}
                        myOffices={getMyOfficesForDeal(dr)}
                        myDid={myDid}
                        onApprove={onApprove}
                        workflowGates={getWorkflowGates(dr)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showForm && (
        <DealForm
          existing={editing}
          proposingFor={proposing}
          onSave={async (deal, existingRkey, tierName) => {
            if (proposing && onPropose) {
              const stageChanged = deal.stage !== proposing.deal.stage;
              const contentChanged = deal.title !== proposing.deal.title ||
                deal.value !== proposing.deal.value ||
                deal.notes !== proposing.deal.notes;
              const changeType = stageChanged && contentChanged ? "edit+stage"
                : stageChanged ? "stage" : "edit";
              const summary = stageChanged
                ? `Move to ${STAGE_LABELS[deal.stage]}`
                : `Edit: ${deal.title}`;
              await onPropose(proposing, deal, changeType, summary);
            } else {
              await onSaveDeal(deal, existingRkey, tierName);
            }
          }}
          onCancel={handleClose}
          availableTiers={availableTiers}
          activeOrg={activeOrg}
          orgContextForDeal={editing ? getOrgCtxForDeal(editing) : null}
        />
      )}
    </div>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}
