import { useState } from "react";
import type { DealRecord, ProposalRecord, ApprovalRecord, Office } from "../types";

interface Props {
  dealRecord: DealRecord;
  onEdit: (dr: DealRecord) => void;
  onDelete?: (rkey: string) => void;
  isOwn: boolean;
  isOrg: boolean;
  proposals: ProposalRecord[];
  getApprovals: (proposalDid: string, proposalRkey: string) => ApprovalRecord[];
  myOffices: Office[];
  myDid: string;
  onApprove?: (proposalDid: string, proposalRkey: string, officeName: string) => Promise<void>;
}

export function DealCard({
  dealRecord,
  onEdit,
  onDelete,
  isOwn,
  isOrg,
  proposals,
  getApprovals,
  myOffices,
  myDid,
  onApprove,
}: Props) {
  const { deal, rkey } = dealRecord;
  const [approving, setApproving] = useState(false);

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

  const handleApprove = async (proposalDid: string, proposalRkey: string, officeName: string) => {
    if (!onApprove) return;
    setApproving(true);
    try {
      await onApprove(proposalDid, proposalRkey, officeName);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className={`deal-card ${isOwn ? "" : "deal-card-foreign"}`}>
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

      {/* Author badge for org mode */}
      {isOrg && (
        <div className="deal-author">
          {isOwn ? "you" : dealRecord.authorDid.slice(0, 16) + "..."}
          {dealRecord.previousDid && (
            <span className="deal-chain" title={`Superseded ${dealRecord.previousDid}:${dealRecord.previousRkey}`}>
              chain
            </span>
          )}
        </div>
      )}

      {/* Pending proposals on this deal */}
      {proposals.length > 0 && (
        <div className="deal-proposals">
          {proposals.map((p) => {
            const approvals = getApprovals(p.proposal.proposerDid, p.rkey);
            const approvedOffices = new Set(approvals.map((a) => a.approval.officeName));

            // Which offices can I sign for that haven't been satisfied?
            const signableOffices = myOffices.filter((o) => {
              if (!p.proposal.requiredOffices.includes(o.name)) return false;
              // Check if this office has enough signatures
              const officeSigs = approvals.filter((a) => a.approval.officeName === o.name);
              if (officeSigs.length >= o.requiredSignatures) return false;
              // Check if I already signed for this office on this proposal
              const alreadySigned = approvals.some(
                (a) => a.approval.officeName === o.name && a.approval.approverDid === myDid
              );
              return !alreadySigned;
            });

            return (
              <div key={p.rkey} className="proposal-card">
                <div className="proposal-header">
                  <span className="proposal-type">{p.proposal.changeType}</span>
                  <span className="proposal-by">
                    by {p.proposal.proposerHandle || p.proposal.proposerDid.slice(0, 12) + "..."}
                  </span>
                  <span className={`proposal-status proposal-${p.proposal.status}`}>
                    {p.proposal.status}
                  </span>
                </div>
                {p.proposal.summary && (
                  <div className="proposal-summary">{p.proposal.summary}</div>
                )}
                {p.proposal.requiredOffices.length > 0 && (
                  <div className="proposal-offices">
                    {p.proposal.requiredOffices.map((o) => (
                      <span
                        key={o}
                        className={`proposal-office ${approvedOffices.has(o) ? "office-signed" : "office-pending"}`}
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                )}
                {signableOffices.length > 0 && (
                  <div className="proposal-actions">
                    <span className="sign-label">Approve as:</span>
                    {signableOffices.map((o) => (
                      <button
                        key={o.name}
                        className="btn-sign"
                        disabled={approving}
                        onClick={() => handleApprove(p.proposal.proposerDid, p.rkey, o.name)}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="deal-actions">
        <button className="deal-edit" onClick={() => onEdit(dealRecord)}>
          {isOrg && !isOwn ? "Propose" : "Edit"}
        </button>
      </div>
    </div>
  );
}
