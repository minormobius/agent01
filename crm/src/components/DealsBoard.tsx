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
  onSignDeal?: (dealRkey: string, fromStage: string, toStage: string, officeName: string) => Promise<void>;
  handle: string;
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
  onSignDeal,
  handle,
  onLogout,
  tab,
  onTabChange,
  orgSwitcher,
  activeOrg,
  availableTiers,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DealRecord | undefined>();

  const canEdit = !activeOrg || activeOrg.myPermissions.edit;
  const canEditMeta = !activeOrg || activeOrg.myPermissions.editMeta;

  const columnDeals = (stage: Stage) =>
    deals.filter((d) => d.deal.stage === stage);

  const totalValue = deals.reduce((sum, d) => sum + (d.deal.value ?? 0), 0);

  const handleEdit = (dr: DealRecord) => {
    setEditing(dr);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditing(undefined);
  };

  // Check if a deal has all required approvals for a stage transition
  const getGateStatus = (dealRkey: string, fromStage: Stage, toStage: Stage) => {
    if (!activeOrg?.org.org.workflow?.gates) return { gated: false, approved: true, pending: [] as string[] };
    const gate = activeOrg.org.org.workflow.gates.find(
      (g) => g.fromStage === fromStage && g.toStage === toStage
    );
    if (!gate) return { gated: false, approved: true, pending: [] as string[] };

    const offices = activeOrg.org.org.offices ?? [];
    const sigs = activeOrg.signatures.filter(
      (s) => s.signature.dealRkey === dealRkey &&
        s.signature.fromStage === fromStage &&
        s.signature.toStage === toStage
    );

    const pending: string[] = [];
    for (const officeName of gate.requiredOffices) {
      const office = offices.find((o) => o.name === officeName);
      if (!office) continue;
      const officeSigs = sigs.filter((s) => s.signature.officeName === officeName);
      if (officeSigs.length < office.requiredSignatures) {
        pending.push(officeName);
      }
    }

    return { gated: true, approved: pending.length === 0, pending };
  };

  // Get offices the current user can sign for on a deal
  const getSignableOffices = (dealRkey: string, fromStage: Stage, toStage: Stage) => {
    if (!activeOrg?.org.org.workflow?.gates || !activeOrg.org.org.offices) return [];
    const gate = activeOrg.org.org.workflow.gates.find(
      (g) => g.fromStage === fromStage && g.toStage === toStage
    );
    if (!gate) return [];

    const myDid = activeOrg.memberships.find(
      (m) => m.membership.tierName === activeOrg.myTierName
    )?.membership.memberDid;
    if (!myDid) return [];

    return gate.requiredOffices.filter((officeName) => {
      const office = activeOrg.org.org.offices?.find((o) => o.name === officeName);
      if (!office) return false;
      // Am I in this office?
      if (!office.memberDids.includes(myDid)) return false;
      // Have I already signed?
      const alreadySigned = activeOrg.signatures.some(
        (s) =>
          s.signature.dealRkey === dealRkey &&
          s.signature.fromStage === fromStage &&
          s.signature.toStage === toStage &&
          s.signature.officeName === officeName &&
          s.signature.signerDid === myDid
      );
      return !alreadySigned;
    });
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
          {tab === "deals" && canEdit && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
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
                    key={dr.rkey}
                    dealRecord={dr}
                    onEdit={canEdit ? handleEdit : undefined}
                    onDelete={canEdit ? onDeleteDeal : undefined}
                    onSign={onSignDeal}
                    canEditMeta={canEditMeta}
                    getGateStatus={activeOrg ? (toStage: Stage) =>
                      getGateStatus(dr.rkey, dr.deal.stage, toStage) : undefined}
                    getSignableOffices={activeOrg ? (toStage: Stage) =>
                      getSignableOffices(dr.rkey, dr.deal.stage, toStage) : undefined}
                    dealRkey={dr.rkey}
                    currentStage={dr.deal.stage}
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
          onSave={onSaveDeal}
          onCancel={handleClose}
          availableTiers={availableTiers}
          activeOrg={activeOrg}
          canEditMeta={canEditMeta}
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
