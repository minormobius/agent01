import { useState, type ReactNode } from "react";
import { STAGES, STAGE_LABELS } from "../types";
import type { Deal, DealRecord, Stage, TierDef, OrgContext } from "../types";
import { DealCard } from "./DealCard";
import { DealForm } from "./DealForm";

type Tab = "deals" | "docs";

interface Props {
  deals: DealRecord[];
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
  availableTiers?: TierDef[] | null;
}

export function DealsBoard({
  deals,
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
  availableTiers,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DealRecord | undefined>();
  const [proposing, setProposing] = useState<DealRecord | undefined>();

  const columnDeals = (stage: Stage) =>
    deals.filter((d) => d.deal.stage === stage);

  const totalValue = deals.reduce((sum, d) => sum + (d.deal.value ?? 0), 0);

  const handleEdit = (dr: DealRecord) => {
    if (activeOrg && dr.authorDid !== myDid) {
      // Can't directly edit someone else's record — propose instead
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

  // Get pending proposals for a deal
  const getProposals = (dr: DealRecord) => {
    if (!activeOrg) return [];
    return activeOrg.proposals.filter(
      (p) =>
        p.proposal.targetDid === dr.authorDid &&
        p.proposal.targetRkey === dr.rkey &&
        (p.proposal.status === "open" || p.proposal.status === "approved")
    );
  };

  // Get approvals for a proposal
  const getApprovals = (proposalDid: string, proposalRkey: string) => {
    if (!activeOrg) return [];
    return activeOrg.approvals.filter(
      (a) =>
        a.approval.proposalDid === proposalDid &&
        a.approval.proposalRkey === proposalRkey
    );
  };

  // Get offices current user can approve for
  const getMyOffices = () => {
    if (!activeOrg) return [];
    return (activeOrg.org.org.offices ?? []).filter(
      (o) => o.memberDids.includes(myDid)
    );
  };

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
              {deals.length} deal{deals.length !== 1 ? "s" : ""}
              {totalValue > 0 && ` / ${formatCurrency(totalValue)}`}
            </span>
          )}
        </div>
        <div className="header-right">
          <span className="header-handle">{handle}</span>
          {tab === "deals" && (
            <button onClick={() => { setEditing(undefined); setProposing(undefined); setShowForm(true); }} className="btn-primary">
              + New Deal
            </button>
          )}
          <button onClick={onLogout} className="btn-secondary">
            Lock
          </button>
        </div>
      </header>

      {tab === "deals" && <div className="board">
        {STAGES.map((stage) => {
          const items = columnDeals(stage);
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
                    isOrg={!!activeOrg}
                    proposals={getProposals(dr)}
                    getApprovals={getApprovals}
                    myOffices={getMyOffices()}
                    myDid={myDid}
                    onApprove={onApprove}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>}

      {showForm && (
        <DealForm
          existing={editing}
          proposingFor={proposing}
          onSave={async (deal, existingRkey, tierName) => {
            if (proposing && onPropose) {
              // Determine change type
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
