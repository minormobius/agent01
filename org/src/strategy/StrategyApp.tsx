/**
 * StrategyApp — encrypted strategy tools on ATProto.
 * Starting with Decision Matrix; will grow to OKRs, SWOT, risk registers, etc.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type {
  DecisionMatrix,
  DecisionRecord,
  Criterion,
  Option,
  ScoreCard,
  Score,
  MatrixStatus,
  StrategyTab,
} from "./types";
import {
  STRATEGY_TABS,
  STATUS_LABELS,
  STATUS_COLORS,
  newId,
  computeWeightedScore,
  rankOptions,
} from "./types";
import {
  keyringRkeyForTier,
  loadPersonalDecisions,
  loadOrgDecisions,
  saveDecision,
  updateDecision,
  deleteDecision,
} from "./context";

type OrgFilter = "all" | "personal" | string;

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

function resolveDek(
  vault: VaultState,
  activeOrg: OrgContext | null,
): { dek: CryptoKey; keyringRkey: string; orgRkey: string } {
  if (activeOrg) {
    const tierName = activeOrg.myTierName;
    const tierDek = activeOrg.tierDeks.get(tierName);
    if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
    const tierDef = activeOrg.org.org.tiers.find((t) => t.name === tierName);
    return {
      dek: tierDek,
      keyringRkey: keyringRkeyForTier(activeOrg.org.rkey, tierName, tierDef?.currentEpoch ?? 0),
      orgRkey: activeOrg.org.rkey,
    };
  }
  return { dek: vault.dek, keyringRkey: "self", orgRkey: "personal" };
}

export function StrategyApp({ vault, pds, orgs: sharedOrgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();
  const [tab, setTab] = useState<StrategyTab>("decisions");
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [activeDecision, setActiveDecision] = useState<DecisionRecord | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const personal = await loadPersonalDecisions(pds, vault.dek, vault.session.did);
        const orgDecs: DecisionRecord[] = [];
        for (const ctx of sharedContexts.values()) {
          try { orgDecs.push(...await loadOrgDecisions(pds, ctx)); } catch {}
        }
        setDecisions([...personal, ...orgDecs]);
      } finally {
        setLoading(false);
      }
    })();
  }, [vault, pds, sharedContexts]);

  const orgNames = useMemo(() => {
    const map = new Map<string, string>();
    map.set("personal", "Personal");
    for (const org of sharedOrgs) map.set(org.rkey, org.org.name);
    return map;
  }, [sharedOrgs]);

  const activeOrg = filterOrg !== "all" && filterOrg !== "personal"
    ? sharedContexts.get(filterOrg) ?? null
    : null;

  const visible = useMemo(() => {
    let result = [...decisions];
    if (filterOrg === "personal") result = result.filter((d) => d.orgRkey === "personal");
    else if (filterOrg !== "all") result = result.filter((d) => d.orgRkey === filterOrg);
    result.sort((a, b) => {
      const aDate = a.matrix.updatedAt || a.matrix.createdAt;
      const bDate = b.matrix.updatedAt || b.matrix.createdAt;
      return bDate.localeCompare(aDate);
    });
    return result;
  }, [decisions, filterOrg]);

  const handleSave = useCallback(
    async (matrix: DecisionMatrix, existingRkey?: string) => {
      if (!pds || !vault) return;
      const { dek, keyringRkey, orgRkey } = resolveDek(vault, activeOrg);

      if (existingRkey) {
        const { rkey: newRkey } = await updateDecision(pds, existingRkey, matrix, dek, keyringRkey);
        setDecisions((prev) => [
          ...prev.filter((d) => d.rkey !== existingRkey),
          { rkey: newRkey, matrix, authorDid: vault.session.did, orgRkey },
        ]);
        setActiveDecision({ rkey: newRkey, matrix, authorDid: vault.session.did, orgRkey });
      } else {
        const { rkey } = await saveDecision(pds, matrix, dek, keyringRkey);
        const rec = { rkey, matrix, authorDid: vault.session.did, orgRkey };
        setDecisions((prev) => [...prev, rec]);
        setActiveDecision(rec);
      }
      setShowNewForm(false);
    },
    [pds, vault, activeOrg],
  );

  const handleDelete = useCallback(
    async (rec: DecisionRecord) => {
      if (!pds || rec.authorDid !== vault?.session.did) return;
      await deleteDecision(pds, rec.rkey);
      setDecisions((prev) => prev.filter((d) => d.rkey !== rec.rkey));
      if (activeDecision?.rkey === rec.rkey) setActiveDecision(null);
    },
    [pds, vault, activeDecision],
  );

  if (!vault || !pds) {
    return (
      <div className="strat-container">
        <div className="notes-empty-full">
          <p>Sign in to access strategy tools.</p>
          <button className="btn-secondary" onClick={() => navigate("/")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="strat-container">
      <header className="strat-header">
        <div className="strat-header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">&larr;</button>
          <h1>Strategy</h1>
          <div className="strat-tabs">
            {STRATEGY_TABS.map((t) => (
              <button
                key={t.id}
                className={`strat-tab${tab === t.id ? " active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="strat-header-right">
          <select
            className="notes-select"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value as OrgFilter)}
          >
            <option value="all">All</option>
            <option value="personal">Personal</option>
            {sharedOrgs.map((o) => (
              <option key={o.rkey} value={o.rkey}>{o.org.name}</option>
            ))}
          </select>
          {!activeDecision && (
            <button className="btn-primary btn-sm" onClick={() => setShowNewForm(true)}>
              + Decision
            </button>
          )}
          {activeDecision && (
            <button className="btn-secondary btn-sm" onClick={() => setActiveDecision(null)}>
              &larr; List
            </button>
          )}
        </div>
      </header>

      {loading && <div className="loading" style={{ padding: "2rem" }}>Loading...</div>}

      {/* Decision list view */}
      {!activeDecision && !showNewForm && !loading && (
        <div className="strat-list">
          {visible.length === 0 && (
            <div className="notes-empty-state">No decisions yet. Create one to get started.</div>
          )}
          {visible.map((rec) => (
            <div key={rec.rkey} className="strat-card" onClick={() => setActiveDecision(rec)}>
              <div className="strat-card-top">
                <span className="strat-card-title">{rec.matrix.title}</span>
                <span
                  className="strat-status-badge"
                  style={{ color: STATUS_COLORS[rec.matrix.status] }}
                >
                  {STATUS_LABELS[rec.matrix.status]}
                </span>
              </div>
              {rec.matrix.description && (
                <div className="strat-card-desc">{rec.matrix.description}</div>
              )}
              <div className="strat-card-meta">
                <span>{rec.matrix.options.length} options</span>
                <span>{rec.matrix.criteria.length} criteria</span>
                <span>{rec.matrix.scoreCards.length} score{rec.matrix.scoreCards.length !== 1 ? "s" : ""}</span>
                {rec.orgRkey !== "personal" && (
                  <span className="strat-card-org">{orgNames.get(rec.orgRkey)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New decision form */}
      {showNewForm && (
        <NewDecisionForm
          onSave={(m) => handleSave(m)}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Active decision — full matrix view */}
      {activeDecision && (
        <MatrixView
          rec={activeDecision}
          myDid={vault.session.did}
          isOwner={activeDecision.authorDid === vault.session.did}
          onSave={(m) => handleSave(m, activeDecision.rkey)}
          onDelete={() => handleDelete(activeDecision)}
        />
      )}
    </div>
  );
}

// ── NewDecisionForm ──

function NewDecisionForm({
  onSave,
  onCancel,
}: {
  onSave: (m: DecisionMatrix) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([
    { id: newId(), name: "", weight: 5 },
  ]);
  const [options, setOptions] = useState<Option[]>([
    { id: newId(), name: "" },
    { id: newId(), name: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const addCriterion = () => setCriteria((prev) => [...prev, { id: newId(), name: "", weight: 5 }]);
  const addOption = () => setOptions((prev) => [...prev, { id: newId(), name: "" }]);

  const updateCriterion = (idx: number, patch: Partial<Criterion>) => {
    setCriteria((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const updateOption = (idx: number, patch: Partial<Option>) => {
    setOptions((prev) => prev.map((o, i) => i === idx ? { ...o, ...patch } : o));
  };

  const removeCriterion = (idx: number) => setCriteria((prev) => prev.filter((_, i) => i !== idx));
  const removeOption = (idx: number) => setOptions((prev) => prev.filter((_, i) => i !== idx));

  const valid = title.trim()
    && criteria.filter((c) => c.name.trim()).length >= 1
    && options.filter((o) => o.name.trim()).length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        status: "draft",
        criteria: criteria.filter((c) => c.name.trim()),
        options: options.filter((o) => o.name.trim()),
        scoreCards: [],
        createdAt: now,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="strat-form-section">
      <form onSubmit={handleSubmit} className="strat-new-form">
        <h3>New Decision Matrix</h3>

        <input
          type="text"
          placeholder="Decision title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          placeholder="Context — what are we deciding and why?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="strat-form-group">
          <div className="strat-form-group-header">
            <h4>Criteria</h4>
            <button type="button" className="btn-secondary btn-sm" onClick={addCriterion}>+ Add</button>
          </div>
          {criteria.map((c, i) => (
            <div key={c.id} className="strat-form-row">
              <input
                type="text"
                placeholder={`Criterion ${i + 1}`}
                value={c.name}
                onChange={(e) => updateCriterion(i, { name: e.target.value })}
                className="strat-form-name"
              />
              <label className="strat-form-weight-label">
                W:
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={c.weight}
                  onChange={(e) => updateCriterion(i, { weight: Number(e.target.value) || 1 })}
                  className="strat-form-weight"
                />
              </label>
              {criteria.length > 1 && (
                <button type="button" className="strat-form-remove" onClick={() => removeCriterion(i)}>&times;</button>
              )}
            </div>
          ))}
        </div>

        <div className="strat-form-group">
          <div className="strat-form-group-header">
            <h4>Options</h4>
            <button type="button" className="btn-secondary btn-sm" onClick={addOption}>+ Add</button>
          </div>
          {options.map((o, i) => (
            <div key={o.id} className="strat-form-row">
              <input
                type="text"
                placeholder={`Option ${i + 1}`}
                value={o.name}
                onChange={(e) => updateOption(i, { name: e.target.value })}
                className="strat-form-name"
              />
              {options.length > 2 && (
                <button type="button" className="strat-form-remove" onClick={() => removeOption(i)}>&times;</button>
              )}
            </div>
          ))}
        </div>

        <div className="strat-form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !valid}>
            {saving ? "Creating..." : "Create Matrix"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── MatrixView — full interactive matrix ──

function MatrixView({
  rec,
  myDid,
  isOwner,
  onSave,
  onDelete,
}: {
  rec: DecisionRecord;
  myDid: string;
  isOwner: boolean;
  onSave: (m: DecisionMatrix) => Promise<void>;
  onDelete: () => void;
}) {
  const m = rec.matrix;
  const [editMode, setEditMode] = useState(false);
  const [scoreMode, setScoreMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editing state
  const [title, setTitle] = useState(m.title);
  const [description, setDescription] = useState(m.description || "");
  const [criteria, setCriteria] = useState<Criterion[]>(m.criteria);
  const [options, setOptions] = useState<Option[]>(m.options);

  // Scoring state
  const myCard = m.scoreCards.find((sc) => sc.memberDid === myDid);
  const [scores, setScores] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (myCard) {
      for (const s of myCard.scores) map.set(`${s.criterionId}:${s.optionId}`, s.value);
    }
    return map;
  });
  const [scoreNotes] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    if (myCard) {
      for (const s of myCard.scores) {
        if (s.note) map.set(`${s.criterionId}:${s.optionId}`, s.note);
      }
    }
    return map;
  });

  const ranked = useMemo(() => rankOptions(m), [m]);

  const setScore = (criterionId: string, optionId: string, value: number) => {
    setScores((prev) => new Map(prev).set(`${criterionId}:${optionId}`, value));
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await onSave({
        ...m,
        title: title.trim(),
        description: description.trim() || undefined,
        criteria,
        options,
        updatedAt: new Date().toISOString(),
      });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitScores = async () => {
    setSaving(true);
    try {
      const newScores: Score[] = [];
      for (const c of m.criteria) {
        for (const o of m.options) {
          const val = scores.get(`${c.id}:${o.id}`);
          if (val) {
            newScores.push({
              criterionId: c.id,
              optionId: o.id,
              value: val,
              note: scoreNotes.get(`${c.id}:${o.id}`) || undefined,
            });
          }
        }
      }

      const card: ScoreCard = {
        memberDid: myDid,
        scores: newScores,
        submittedAt: new Date().toISOString(),
      };

      // Replace existing card or add new
      const cards = m.scoreCards.filter((sc) => sc.memberDid !== myDid);
      cards.push(card);

      await onSave({
        ...m,
        scoreCards: cards,
        updatedAt: new Date().toISOString(),
      });
      setScoreMode(false);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: MatrixStatus) => {
    setSaving(true);
    try {
      await onSave({ ...m, status, updatedAt: new Date().toISOString() });
    } finally {
      setSaving(false);
    }
  };

  const handleDecide = async (optionId: string) => {
    const rationale = prompt("Rationale for this decision (optional):");
    setSaving(true);
    try {
      await onSave({
        ...m,
        status: "decided",
        chosenOptionId: optionId,
        chosenRationale: rationale || undefined,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  // Edit mode — modify criteria + options
  if (editMode) {
    return (
      <div className="strat-form-section">
        <div className="strat-new-form">
          <h3>Edit Matrix</h3>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

          <div className="strat-form-group">
            <div className="strat-form-group-header">
              <h4>Criteria</h4>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCriteria((p) => [...p, { id: newId(), name: "", weight: 5 }])}>+ Add</button>
            </div>
            {criteria.map((c, i) => (
              <div key={c.id} className="strat-form-row">
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => setCriteria((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="strat-form-name"
                />
                <label className="strat-form-weight-label">
                  W:
                  <input
                    type="number" min={1} max={10}
                    value={c.weight}
                    onChange={(e) => setCriteria((p) => p.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) || 1 } : x))}
                    className="strat-form-weight"
                  />
                </label>
                {criteria.length > 1 && (
                  <button type="button" className="strat-form-remove" onClick={() => setCriteria((p) => p.filter((_, j) => j !== i))}>&times;</button>
                )}
              </div>
            ))}
          </div>

          <div className="strat-form-group">
            <div className="strat-form-group-header">
              <h4>Options</h4>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOptions((p) => [...p, { id: newId(), name: "" }])}>+ Add</button>
            </div>
            {options.map((o, i) => (
              <div key={o.id} className="strat-form-row">
                <input
                  type="text"
                  value={o.name}
                  onChange={(e) => setOptions((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="strat-form-name"
                />
                {options.length > 2 && (
                  <button type="button" className="strat-form-remove" onClick={() => setOptions((p) => p.filter((_, j) => j !== i))}>&times;</button>
                )}
              </div>
            ))}
          </div>

          <div className="strat-form-actions">
            <button className="btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Score mode — my independent scoring
  if (scoreMode) {
    return (
      <div className="strat-score-section">
        <h3>Score: {m.title}</h3>
        <p className="strat-score-hint">Rate each option against each criterion (1-5). Your scores are encrypted.</p>
        <div className="strat-score-grid" style={{ gridTemplateColumns: `200px repeat(${m.options.length}, 1fr)` }}>
          <div className="strat-score-header">Criterion (weight)</div>
          {m.options.map((o) => (
            <div key={o.id} className="strat-score-header">{o.name}</div>
          ))}
          {m.criteria.map((c) => (
            <>
              <div key={`label-${c.id}`} className="strat-score-label">
                {c.name} <span className="strat-score-w">({c.weight})</span>
              </div>
              {m.options.map((o) => {
                const key = `${c.id}:${o.id}`;
                const val = scores.get(key) || 0;
                return (
                  <div key={key} className="strat-score-cell">
                    <div className="strat-score-stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`strat-star${val >= n ? " filled" : ""}`}
                          onClick={() => setScore(c.id, o.id, val === n ? 0 : n)}
                        >
                          {val >= n ? "\u2605" : "\u2606"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ))}
        </div>
        <div className="strat-form-actions">
          <button className="btn-secondary" onClick={() => setScoreMode(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmitScores} disabled={saving}>
            {saving ? "Submitting..." : myCard ? "Update Scores" : "Submit Scores"}
          </button>
        </div>
      </div>
    );
  }

  // Main matrix view
  return (
    <div className="strat-matrix-view">
      <div className="strat-matrix-header">
        <div>
          <h2>{m.title}</h2>
          {m.description && <p className="strat-matrix-desc">{m.description}</p>}
        </div>
        <span className="strat-status-badge" style={{ color: STATUS_COLORS[m.status], fontSize: "0.9rem" }}>
          {STATUS_LABELS[m.status]}
        </span>
      </div>

      {/* Action bar */}
      <div className="strat-action-bar">
        {isOwner && m.status === "draft" && (
          <button className="btn-primary btn-sm" onClick={() => handleStatusChange("scoring")}>
            Open for Scoring
          </button>
        )}
        {(m.status === "scoring" || m.status === "draft") && (
          <button className="btn-secondary btn-sm" onClick={() => setScoreMode(true)}>
            {myCard ? "Update My Scores" : "Score Options"}
          </button>
        )}
        {isOwner && m.status === "scoring" && m.scoreCards.length > 0 && (
          <button className="btn-primary btn-sm" onClick={() => handleStatusChange("revealed")}>
            Reveal Results
          </button>
        )}
        {isOwner && (
          <button className="btn-secondary btn-sm" onClick={() => setEditMode(true)}>Edit</button>
        )}
        {isOwner && (
          <button className="strat-delete-btn" onClick={onDelete}>Delete</button>
        )}
      </div>

      {/* Results table — shows when revealed or decided */}
      {(m.status === "revealed" || m.status === "decided") && m.scoreCards.length > 0 && (
        <div className="strat-results">
          <h4>Results</h4>
          <div className="strat-results-table">
            <div className="strat-results-row strat-results-header">
              <span className="strat-results-rank">#</span>
              <span className="strat-results-option">Option</span>
              <span className="strat-results-score">Avg Score</span>
              {m.status === "revealed" && isOwner && <span className="strat-results-action">Decide</span>}
            </div>
            {ranked.map((r, i) => (
              <div
                key={r.option.id}
                className={`strat-results-row${m.chosenOptionId === r.option.id ? " chosen" : ""}`}
              >
                <span className="strat-results-rank">{i + 1}</span>
                <span className="strat-results-option">
                  {r.option.name}
                  {m.chosenOptionId === r.option.id && <span className="strat-chosen-badge">chosen</span>}
                </span>
                <span className="strat-results-score">{r.score.toFixed(2)}</span>
                {m.status === "revealed" && isOwner && (
                  <button className="btn-primary btn-sm" onClick={() => handleDecide(r.option.id)}>
                    Choose
                  </button>
                )}
              </div>
            ))}
          </div>
          {m.chosenRationale && (
            <div className="strat-rationale">
              <strong>Rationale:</strong> {m.chosenRationale}
            </div>
          )}
        </div>
      )}

      {/* Scoring status */}
      <div className="strat-scores-status">
        <h4>Scores ({m.scoreCards.length})</h4>
        {m.scoreCards.length === 0 && <p className="strat-dim">No scores submitted yet.</p>}
        {m.scoreCards.map((sc) => (
          <div key={sc.memberDid} className="strat-scorer">
            <span className="strat-scorer-did">{sc.memberHandle || sc.memberDid.slice(0, 20) + "..."}</span>
            <span className="strat-scorer-date">{new Date(sc.submittedAt).toLocaleDateString()}</span>
            {(m.status === "revealed" || m.status === "decided") && (
              <div className="strat-scorer-breakdown">
                {m.options.map((o) => (
                  <span key={o.id} className="strat-scorer-opt">
                    {o.name}: {computeWeightedScore(m, o.id, sc).toFixed(1)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Criteria + Options reference */}
      <div className="strat-matrix-ref">
        <div className="strat-ref-col">
          <h4>Criteria</h4>
          {m.criteria.map((c) => (
            <div key={c.id} className="strat-ref-item">
              <span>{c.name}</span>
              <span className="strat-ref-weight">weight: {c.weight}</span>
            </div>
          ))}
        </div>
        <div className="strat-ref-col">
          <h4>Options</h4>
          {m.options.map((o) => (
            <div key={o.id} className="strat-ref-item">
              <span>{o.name}</span>
              {o.description && <span className="strat-ref-desc">{o.description}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
