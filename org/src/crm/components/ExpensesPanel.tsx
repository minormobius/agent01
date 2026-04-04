import { useState, useMemo, type ReactNode } from "react";
import type { Expense, ExpenseRecord, DealRecord, OrgFilter } from "../types";

const CATEGORIES = [
  "travel", "software", "hardware", "consulting", "marketing",
  "meals", "supplies", "shipping", "legal", "other",
] as const;

interface Props {
  expenses: ExpenseRecord[];
  deals: DealRecord[];
  filterOrg: OrgFilter;
  orgNames: Map<string, string>;
  myDid: string;
  handle: string;
  onSaveExpense: (expense: Expense, existingRkey?: string) => Promise<void>;
  onDeleteExpense: (rkey: string) => Promise<void>;
  onBackToHub?: () => void;
  orgSwitcher?: ReactNode;
  crmTab: "deals" | "expenses";
  onCrmTabChange: (tab: "deals" | "expenses") => void;
}

function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function ExpensesPanel({
  expenses,
  deals,
  filterOrg,
  orgNames,
  myDid,
  handle,
  onSaveExpense,
  onDeleteExpense,
  onBackToHub,
  orgSwitcher,
  crmTab,
  onCrmTabChange,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | undefined>();
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const filtered = useMemo(() => {
    let result = [...expenses];
    if (filterOrg === "personal") result = result.filter((e) => e.orgRkey === "personal");
    else if (filterOrg !== "all") result = result.filter((e) => e.orgRkey === filterOrg);
    if (filterCategory !== "all") result = result.filter((e) => e.expense.category === filterCategory);
    result.sort((a, b) => b.expense.date.localeCompare(a.expense.date));
    return result;
  }, [expenses, filterOrg, filterCategory]);

  const totalCents = filtered.reduce((s, e) => s + e.expense.amount, 0);

  // Deal name lookup
  const dealNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deals) m.set(d.rkey, d.deal.title);
    return m;
  }, [deals]);

  const handleSave = async (expense: Expense) => {
    await onSaveExpense(expense, editing?.rkey);
    setShowForm(false);
    setEditing(undefined);
  };

  return (
    <div className="board-container">
      <header className="board-header">
        <div className="header-left">
          {onBackToHub && (
            <button className="back-btn" onClick={onBackToHub} title="Back to Hub">&larr;</button>
          )}
          <nav className="crm-tab-bar">
            <button className={`crm-tab-btn${crmTab === "deals" ? " active" : ""}`} onClick={() => onCrmTabChange("deals")}>Deals</button>
            <button className={`crm-tab-btn${crmTab === "expenses" ? " active" : ""}`} onClick={() => onCrmTabChange("expenses")}>Expenses</button>
          </nav>
          {orgSwitcher}
          <span className="header-stat">
            {filtered.length} expense{filtered.length !== 1 ? "s" : ""} / {formatCurrency(totalCents)}
          </span>
        </div>
        <div className="header-right">
          <span className="header-handle">{handle}</span>
          <button className="btn-primary" onClick={() => { setEditing(undefined); setShowForm(true); }}>
            + Expense
          </button>
        </div>
      </header>

      <div className="expense-toolbar">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="expense-list">
        {filtered.length === 0 && (
          <div className="expense-empty">No expenses recorded yet.</div>
        )}
        {filtered.map((rec) => (
          <div key={rec.rkey} className="expense-row">
            <div className="expense-date">{rec.expense.date}</div>
            <div className="expense-cat">{rec.expense.category}</div>
            <div className="expense-desc">
              {rec.expense.description || "—"}
              {rec.expense.dealRkey && (
                <span className="expense-deal">{dealNames.get(rec.expense.dealRkey) || rec.expense.dealRkey}</span>
              )}
              {rec.expense.vendor && <span className="expense-vendor">{rec.expense.vendor}</span>}
            </div>
            <div className="expense-amount">{formatCurrency(rec.expense.amount, rec.expense.currency)}</div>
            {filterOrg === "all" && rec.orgRkey !== "personal" && (
              <div className="expense-deal" style={{ minWidth: 60 }}>{orgNames.get(rec.orgRkey) ?? ""}</div>
            )}
            {rec.authorDid === myDid && (
              <div className="expense-actions">
                <button className="btn-secondary btn-sm" onClick={() => { setEditing(rec); setShowForm(true); }}>Edit</button>
                <button className="expense-delete" onClick={() => onDeleteExpense(rec.rkey)}>&times;</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <ExpenseForm
          existing={editing}
          deals={deals}
          filterOrg={filterOrg}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
}

function ExpenseForm({
  existing,
  deals,
  filterOrg,
  onSave,
  onCancel,
}: {
  existing?: ExpenseRecord;
  deals: DealRecord[];
  filterOrg: OrgFilter;
  onSave: (expense: Expense) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(existing ? (existing.expense.amount / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(existing?.expense.currency ?? "USD");
  const [category, setCategory] = useState(existing?.expense.category ?? "other");
  const [description, setDescription] = useState(existing?.expense.description ?? "");
  const [date, setDate] = useState(existing?.expense.date ?? new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState(existing?.expense.vendor ?? "");
  const [dealRkey, setDealRkey] = useState(existing?.expense.dealRkey ?? "");
  const [saving, setSaving] = useState(false);

  // Filter deals to current org
  const availableDeals = useMemo(() => {
    if (filterOrg === "all") return deals;
    return deals.filter((d) => d.orgRkey === filterOrg);
  }, [deals, filterOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    setSaving(true);
    try {
      await onSave({
        amount: Math.round(parseFloat(amount) * 100),
        currency,
        category,
        description: description.trim() || undefined,
        date,
        vendor: vendor.trim() || undefined,
        dealRkey: dealRkey || undefined,
        createdAt: existing?.expense.createdAt ?? new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal-form expense-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{existing ? "Edit Expense" : "New Expense"}</h3>
        <div className="form-row">
          <label>Amount</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ flex: 1 }} />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 80 }}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" />
        </div>
        <div className="form-row">
          <label>Vendor</label>
          <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Who was paid?" />
        </div>
        {availableDeals.length > 0 && (
          <div className="form-row">
            <label>Linked deal</label>
            <select value={dealRkey} onChange={(e) => setDealRkey(e.target.value)}>
              <option value="">None</option>
              {availableDeals.map((d) => (
                <option key={d.rkey} value={d.rkey}>{d.deal.title}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !amount}>
            {saving ? "Saving..." : existing ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
