import { useState } from "react";
import { STAGES, STAGE_LABELS } from "../types";
import type { Deal, DealRecord, Stage } from "../types";
import { DealCard } from "./DealCard";
import { DealForm } from "./DealForm";

interface Props {
  deals: DealRecord[];
  onSaveDeal: (deal: Deal, existingRkey?: string) => Promise<void>;
  onDeleteDeal: (rkey: string) => Promise<void>;
  handle: string;
  onLogout: () => void;
}

export function DealsBoard({ deals, onSaveDeal, onDeleteDeal, handle, onLogout }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DealRecord | undefined>();

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

  return (
    <div className="board-container">
      <header className="board-header">
        <div className="header-left">
          <h1>Deals</h1>
          <span className="header-stat">
            {deals.length} deal{deals.length !== 1 ? "s" : ""}
            {totalValue > 0 && ` / ${formatCurrency(totalValue)}`}
          </span>
        </div>
        <div className="header-right">
          <span className="header-handle">{handle}</span>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + New Deal
          </button>
          <button onClick={onLogout} className="btn-secondary">
            Lock
          </button>
        </div>
      </header>

      <div className="board">
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
                    onEdit={handleEdit}
                    onDelete={onDeleteDeal}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <DealForm
          existing={editing}
          onSave={onSaveDeal}
          onCancel={handleClose}
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
