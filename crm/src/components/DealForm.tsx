import { useState } from "react";
import { STAGES, STAGE_LABELS } from "../types";
import type { Deal, Stage, DealRecord, TierDef, OrgContext } from "../types";

interface Props {
  existing?: DealRecord;
  proposingFor?: DealRecord;
  onSave: (deal: Deal, existingRkey?: string, tierName?: string) => Promise<void>;
  onCancel: () => void;
  availableTiers?: TierDef[] | null;
  activeOrg?: OrgContext | null;
  /** Org context for the deal being edited (may differ from activeOrg in "all" view) */
  orgContextForDeal?: OrgContext | null;
}

export function DealForm({ existing, proposingFor, onSave, onCancel, availableTiers, activeOrg, orgContextForDeal }: Props) {
  const source = proposingFor?.deal ?? existing?.deal;
  const [title, setTitle] = useState(source?.title ?? "");
  const [stage, setStage] = useState<Stage>(source?.stage ?? "lead");
  const [value, setValue] = useState(source?.value != null ? String(source.value / 100) : "");
  const [currency, setCurrency] = useState(source?.currency ?? "USD");
  const [notes, setNotes] = useState(source?.notes ?? "");
  const [tags, setTags] = useState(source?.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Tier selection for org mode
  const defaultTier = activeOrg?.myTierName ?? availableTiers?.[0]?.name ?? "";
  const [selectedTier, setSelectedTier] = useState(defaultTier);

  const isProposal = !!proposingFor;

  // Determine org policy context (from the deal's org, or the active org for new deals)
  const policyOrg = orgContextForDeal ?? activeOrg;
  const workflow = policyOrg?.org.org.workflow;

  // Find relevant workflow gates when stage changes
  const getRelevantGates = () => {
    if (!workflow || !source) return [];
    return workflow.gates.filter(
      (g) => g.fromStage === source.stage && g.toStage !== source.stage
    );
  };

  const relevantGates = getRelevantGates();
  const stageGate = workflow?.gates.find(
    (g) => g.fromStage === (source?.stage ?? "lead") && g.toStage === stage
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const deal: Deal = {
        title,
        stage,
        createdAt: source?.createdAt ?? new Date().toISOString(),
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
      const tierName = activeOrg && selectedTier ? selectedTier : undefined;
      await onSave(deal, existing?.rkey, tierName);
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
        <h2>
          {isProposal ? "Propose Change" : existing ? "Edit Deal" : "New Deal"}
        </h2>
        {isProposal && (
          <p className="proposal-banner">
            You're proposing a change to <strong>{proposingFor.deal.title}</strong>.
            {policyOrg?.org.org.workflow?.gates.length
              ? " Required offices will need to approve before it takes effect."
              : " This will create a new version linked to the original."}
          </p>
        )}

        {/* Org policy notification */}
        {policyOrg && relevantGates.length > 0 && !isProposal && (
          <div className="policy-banner">
            <strong>{policyOrg.org.org.name} policy:</strong>
            {relevantGates.map((g) => (
              <span key={`${g.fromStage}-${g.toStage}`} className="policy-gate-inline">
                Moving to {STAGE_LABELS[g.toStage]} requires approval from{" "}
                <strong>{g.requiredOffices.join(", ")}</strong>
              </span>
            ))}
          </div>
        )}

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
            {stageGate && stage !== source?.stage && (
              <small className="policy-stage-warning">
                Requires approval from: {stageGate.requiredOffices.join(", ")}
              </small>
            )}
          </div>

          {availableTiers && availableTiers.length > 0 && !isProposal && (
            <div className="field">
              <label htmlFor="deal-tier">Access Tier</label>
              <select
                id="deal-tier"
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
              >
                {availableTiers.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} (L{t.level})
                  </option>
                ))}
              </select>
              <small>
                Only members at this tier or higher can see this deal.
              </small>
            </div>
          )}

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
              {saving
                ? "Saving..."
                : isProposal
                  ? "Submit Proposal"
                  : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
