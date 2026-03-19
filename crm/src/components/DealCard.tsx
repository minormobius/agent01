import { useState } from "react";
import { STAGES, STAGE_LABELS } from "../types";
import type { DealRecord, Stage } from "../types";

interface GateStatus {
  gated: boolean;
  approved: boolean;
  pending: string[];
}

interface Props {
  dealRecord: DealRecord;
  onEdit?: (dr: DealRecord) => void;
  onDelete?: (rkey: string) => void;
  onSign?: (dealRkey: string, fromStage: string, toStage: string, officeName: string) => Promise<void>;
  canEditMeta?: boolean;
  getGateStatus?: (toStage: Stage) => GateStatus;
  getSignableOffices?: (toStage: Stage) => string[];
  dealRkey: string;
  currentStage: Stage;
}

export function DealCard({
  dealRecord,
  onEdit,
  onDelete,
  onSign,
  canEditMeta,
  getGateStatus,
  getSignableOffices,
  dealRkey,
  currentStage,
}: Props) {
  const { deal, rkey } = dealRecord;
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [signing, setSigning] = useState(false);

  const formatValue = () => {
    if (deal.value == null) return null;
    const currency = deal.currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
      }).format(deal.value / 100);
    } catch {
      return `${deal.value / 100} ${currency}`;
    }
  };

  // Get next logical stage
  const currentIdx = STAGES.indexOf(currentStage);
  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;

  const gateStatus = nextStage && getGateStatus ? getGateStatus(nextStage) : null;
  const signableOffices = nextStage && getSignableOffices ? getSignableOffices(nextStage) : [];

  const handleSign = async (officeName: string) => {
    if (!onSign || !nextStage) return;
    setSigning(true);
    try {
      await onSign(dealRkey, currentStage, nextStage, officeName);
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="deal-card">
      <div className="deal-header">
        <span className="deal-title">{deal.title}</span>
        {onDelete && (
          <button
            className="deal-delete"
            onClick={() => onDelete(rkey)}
            title="Delete deal"
          >
            x
          </button>
        )}
      </div>
      {deal.value != null && (
        <div className="deal-value">{formatValue()}</div>
      )}
      {deal.notes && (
        <div className="deal-notes">{deal.notes.slice(0, 80)}</div>
      )}
      {deal.tags && deal.tags.length > 0 && (
        <div className="deal-tags">
          {deal.tags.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}

      {/* Workflow gate indicator */}
      {gateStatus?.gated && (
        <div className={`deal-gate ${gateStatus.approved ? "gate-approved" : "gate-pending"}`}>
          {gateStatus.approved ? (
            <span className="gate-status-text">Approved to advance</span>
          ) : (
            <button
              className="gate-status-text gate-clickable"
              onClick={() => setShowWorkflow(!showWorkflow)}
            >
              Awaiting: {gateStatus.pending.join(", ")}
            </button>
          )}
        </div>
      )}

      {/* Sign-off controls */}
      {showWorkflow && signableOffices.length > 0 && (
        <div className="deal-sign-panel">
          <span className="sign-label">Sign as:</span>
          {signableOffices.map((office) => (
            <button
              key={office}
              className="btn-sign"
              disabled={signing}
              onClick={() => handleSign(office)}
            >
              {office}
            </button>
          ))}
        </div>
      )}

      <div className="deal-actions">
        {onEdit && (
          <button className="deal-edit" onClick={() => onEdit(dealRecord)}>
            Edit
          </button>
        )}
        {canEditMeta && nextStage && (
          <button
            className="deal-advance"
            disabled={gateStatus?.gated && !gateStatus.approved}
            title={
              gateStatus?.gated && !gateStatus.approved
                ? `Needs approval from: ${gateStatus.pending.join(", ")}`
                : `Move to ${STAGE_LABELS[nextStage]}`
            }
          >
            &rarr; {STAGE_LABELS[nextStage]}
          </button>
        )}
      </div>
    </div>
  );
}
