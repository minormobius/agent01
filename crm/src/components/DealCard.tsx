import type { DealRecord } from "../types";

interface Props {
  dealRecord: DealRecord;
  onEdit: (dr: DealRecord) => void;
  onDelete: (rkey: string) => void;
}

export function DealCard({ dealRecord, onEdit, onDelete }: Props) {
  const { deal, rkey } = dealRecord;

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

  return (
    <div className="deal-card">
      <div className="deal-header">
        <span className="deal-title">{deal.title}</span>
        <button
          className="deal-delete"
          onClick={() => onDelete(rkey)}
          title="Delete deal"
        >
          x
        </button>
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
      <button className="deal-edit" onClick={() => onEdit(dealRecord)}>
        Edit
      </button>
    </div>
  );
}
