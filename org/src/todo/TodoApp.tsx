/**
 * TodoApp — encrypted to-do lists on ATProto.
 * Personal + org scoped, with priorities and due dates.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type { TodoItem, TodoRecord } from "./types";
import {
  keyringRkeyForTier,
  loadPersonalTodos,
  loadOrgTodos,
  saveTodo,
  updateTodo,
  deleteTodo,
} from "./context";

type OrgFilter = "all" | "personal" | string;
type SortBy = "created" | "priority" | "due" | "alpha";
type ShowFilter = "active" | "done" | "all";

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function TodoApp({ vault, pds, orgs: sharedOrgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();

  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [showFilter, setShowFilter] = useState<ShowFilter>("active");
  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [editingTodo, setEditingTodo] = useState<TodoRecord | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadedRef = useRef(false);

  // Load on mount
  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const personal = await loadPersonalTodos(pds, vault.dek, vault.session.did);
        const orgTodos: TodoRecord[] = [];
        for (const ctx of sharedContexts.values()) {
          try {
            orgTodos.push(...await loadOrgTodos(pds, ctx));
          } catch (err) {
            console.warn(`Todo: failed to load org ${ctx.org.org.name}:`, err);
          }
        }
        setTodos([...personal, ...orgTodos]);
      } finally {
        setLoading(false);
      }
    })();
  }, [vault, pds, sharedContexts]);

  // Org names
  const orgNames = useMemo(() => {
    const map = new Map<string, string>();
    map.set("personal", "Personal");
    for (const org of sharedOrgs) map.set(org.rkey, org.org.name);
    return map;
  }, [sharedOrgs]);

  // Active org context
  const activeOrg = filterOrg !== "all" && filterOrg !== "personal"
    ? sharedContexts.get(filterOrg) ?? null
    : null;

  // Filtered + sorted
  const visibleTodos = useMemo(() => {
    let result = [...todos];

    // Org filter
    if (filterOrg === "personal") {
      result = result.filter((t) => t.orgRkey === "personal");
    } else if (filterOrg !== "all") {
      result = result.filter((t) => t.orgRkey === filterOrg);
    }

    // Done filter
    if (showFilter === "active") result = result.filter((t) => !t.todo.done);
    else if (showFilter === "done") result = result.filter((t) => t.todo.done);

    // Sort
    result.sort((a, b) => {
      if (sortBy === "priority") return PRIORITY_ORDER[a.todo.priority] - PRIORITY_ORDER[b.todo.priority];
      if (sortBy === "due") {
        if (!a.todo.dueDate && !b.todo.dueDate) return 0;
        if (!a.todo.dueDate) return 1;
        if (!b.todo.dueDate) return -1;
        return a.todo.dueDate.localeCompare(b.todo.dueDate);
      }
      if (sortBy === "alpha") return a.todo.title.localeCompare(b.todo.title);
      return b.todo.createdAt.localeCompare(a.todo.createdAt); // newest first
    });

    return result;
  }, [todos, filterOrg, showFilter, sortBy]);

  // Toggle done
  const handleToggle = useCallback(
    async (rec: TodoRecord) => {
      if (!pds || !vault) return;
      if (rec.authorDid !== vault.session.did) return; // can only edit own records

      const updated: TodoItem = { ...rec.todo, done: !rec.todo.done };
      let dek: CryptoKey;
      let keyringRkey: string;

      if (rec.orgRkey !== "personal") {
        const ctx = sharedContexts.get(rec.orgRkey);
        if (!ctx) return;
        const tierName = ctx.myTierName;
        const tierDek = ctx.tierDeks.get(tierName);
        if (!tierDek) return;
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === tierName);
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, tierName, tierDef?.currentEpoch ?? 0);
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      try {
        const { rkey: newRkey } = await updateTodo(pds, rec.rkey, updated, dek, keyringRkey);
        setTodos((prev) => [
          ...prev.filter((t) => t.rkey !== rec.rkey),
          { rkey: newRkey, todo: updated, authorDid: vault.session.did, orgRkey: rec.orgRkey },
        ]);
      } catch (err) {
        console.error("Failed to toggle todo:", err);
      }
    },
    [pds, vault, sharedContexts],
  );

  // Save (create or update)
  const handleSave = useCallback(
    async (item: TodoItem, existingRkey?: string) => {
      if (!pds || !vault) return;

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      if (activeOrg) {
        const tierName = activeOrg.myTierName;
        const tierDek = activeOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = activeOrg.org.org.tiers.find((t) => t.name === tierName);
        keyringRkey = keyringRkeyForTier(activeOrg.org.rkey, tierName, tierDef?.currentEpoch ?? 0);
        orgRkey = activeOrg.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      if (existingRkey) {
        const { rkey: newRkey } = await updateTodo(pds, existingRkey, item, dek, keyringRkey);
        setTodos((prev) => [
          ...prev.filter((t) => t.rkey !== existingRkey),
          { rkey: newRkey, todo: item, authorDid: vault.session.did, orgRkey },
        ]);
      } else {
        const { rkey } = await saveTodo(pds, item, dek, keyringRkey);
        setTodos((prev) => [...prev, { rkey, todo: item, authorDid: vault.session.did, orgRkey }]);
      }

      setShowForm(false);
      setEditingTodo(null);
    },
    [pds, vault, activeOrg],
  );

  // Delete
  const handleDelete = useCallback(
    async (rec: TodoRecord) => {
      if (!pds || rec.authorDid !== vault?.session.did) return;
      await deleteTodo(pds, rec.rkey);
      setTodos((prev) => prev.filter((t) => t.rkey !== rec.rkey));
    },
    [pds, vault],
  );

  // Counts
  const activeCount = todos.filter((t) => !t.todo.done).length;
  const doneCount = todos.filter((t) => t.todo.done).length;

  if (!vault || !pds) {
    return (
      <div className="todo-container">
        <div className="todo-empty">
          <p>Sign in to access your to-do list.</p>
          <button className="btn-secondary" onClick={() => navigate("/")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="todo-container">
      <header className="todo-header">
        <div className="todo-header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">&larr;</button>
          <h1>To-Do</h1>
          <span className="todo-count">{activeCount} active, {doneCount} done</span>
        </div>
        <div className="todo-header-right">
          <select
            className="todo-select"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value as OrgFilter)}
          >
            <option value="all">All</option>
            <option value="personal">Personal</option>
            {sharedOrgs.map((o) => (
              <option key={o.rkey} value={o.rkey}>{o.org.name}</option>
            ))}
          </select>
          <button
            className="btn-primary btn-sm"
            onClick={() => { setEditingTodo(null); setShowForm(true); }}
          >
            + Add
          </button>
        </div>
      </header>

      <div className="todo-toolbar">
        <div className="todo-filters">
          {(["active", "done", "all"] as ShowFilter[]).map((f) => (
            <button
              key={f}
              className={`todo-filter-btn${showFilter === f ? " active" : ""}`}
              onClick={() => setShowFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="todo-sort">
          <label>Sort:</label>
          <select className="todo-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="created">Newest</option>
            <option value="alpha">A-Z</option>
          </select>
        </div>
      </div>

      {loading && <div className="loading" style={{ padding: "2rem" }}>Loading...</div>}

      {!loading && visibleTodos.length === 0 && (
        <div className="todo-empty-state">
          {showFilter === "active" ? "No active to-dos. Nice work!" : "Nothing here yet."}
        </div>
      )}

      <div className="todo-list">
        {visibleTodos.map((rec) => (
          <div key={rec.rkey} className={`todo-item${rec.todo.done ? " done" : ""}`}>
            <button
              className="todo-check"
              onClick={() => handleToggle(rec)}
              disabled={rec.authorDid !== vault.session.did}
            >
              {rec.todo.done ? "\u2611" : "\u2610"}
            </button>
            <div className="todo-body" onClick={() => {
              if (rec.authorDid === vault.session.did) {
                setEditingTodo(rec);
                setShowForm(true);
              }
            }}>
              <span className="todo-title">{rec.todo.title}</span>
              <div className="todo-meta">
                <span className={`todo-priority ${rec.todo.priority}`}>{rec.todo.priority}</span>
                {rec.todo.dueDate && (
                  <span className="todo-due">{rec.todo.dueDate}</span>
                )}
                {rec.orgRkey !== "personal" && (
                  <span className="todo-org">{orgNames.get(rec.orgRkey) ?? rec.orgRkey}</span>
                )}
                {rec.todo.tags && rec.todo.tags.length > 0 && (
                  <span className="todo-tags">{rec.todo.tags.join(", ")}</span>
                )}
              </div>
            </div>
            {rec.authorDid === vault.session.did && (
              <button className="todo-delete" onClick={() => handleDelete(rec)} title="Delete">&times;</button>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <TodoForm
          existing={editingTodo ?? undefined}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingTodo(null); }}
        />
      )}
    </div>
  );
}

/** Inline form for creating/editing a to-do */
function TodoForm({
  existing,
  onSave,
  onCancel,
}: {
  existing?: TodoRecord;
  onSave: (item: TodoItem, existingRkey?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.todo.title ?? "");
  const [priority, setPriority] = useState<TodoItem["priority"]>(existing?.todo.priority ?? "medium");
  const [notes, setNotes] = useState(existing?.todo.notes ?? "");
  const [dueDate, setDueDate] = useState(existing?.todo.dueDate ?? "");
  const [tags, setTags] = useState(existing?.todo.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const item: TodoItem = {
        title: title.trim(),
        done: existing?.todo.done ?? false,
        priority,
        notes: notes.trim() || undefined,
        dueDate: dueDate || undefined,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        createdAt: existing?.todo.createdAt ?? new Date().toISOString(),
      };
      await onSave(item, existing?.rkey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="todo-form-overlay" onClick={onCancel}>
      <form className="todo-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{existing ? "Edit To-Do" : "New To-Do"}</h3>
        <input
          className="todo-input"
          type="text"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <div className="todo-form-row">
          <select className="todo-select" value={priority} onChange={(e) => setPriority(e.target.value as TodoItem["priority"])}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            className="todo-input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <input
          className="todo-input"
          type="text"
          placeholder="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <textarea
          className="todo-input todo-textarea"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
        <div className="todo-form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? "Saving..." : existing ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
