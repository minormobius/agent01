import { useState } from "react";
import { STAGES, STAGE_LABELS } from "../types";
import type { Deal, Stage, DealRecord } from "../types";

interface Props {
  existing?: DealRecord;
  onSave: (deal: Deal, existingRkey?: string) => Promise<void>;
  onCancel: () => void;
}

export function DealForm({ existing, onSave, onCancel }: Props) {
  const init = existing?.deal;
  const [title, setTitle] = useState(init?.title ?? "");
  const [stage, setStage] = useState<Stage>(init?.stage ?? "lead");
  const [value, setValue] = useState(init?.value != null ? String(init.value / 100) : "");
  const [currency, setCurrency] = useState(init?.currency ?? "USD");
  const [notes, setNotes] = useState(init?.notes ?? "");
  const [tags, setTags] = useState(init?.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const deal: Deal = {
        title,
        stage,
        createdAt: init?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (value) {
        deal.value = Math.round(parseFloat(value) * 100);
        deal.currency = currency;
      }
      if (notes) deal.notes = notes;
      if (tags.trim()) {
        deal.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
      await onSave(deal, existing?.rkey);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{existing ? "Edit Deal" : "New Deal"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="deal-title">Title</label>
            <input
              id="deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="deal-stage">Stage</label>
            <select
              id="deal-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as Stage)}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="deal-value">Value</label>
              <input
                id="deal-value"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label htmlFor="deal-currency">Currency</label>
              <input
                id="deal-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                style={{ width: "5em" }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="deal-notes">Notes</label>
            <textarea
              id="deal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="field">
            <label htmlFor="deal-tags">Tags (comma-separated)</label>
            <input
              id="deal-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="saas, enterprise"
            />
          </div>

          {error && <div className="error">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
