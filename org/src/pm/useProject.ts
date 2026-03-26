/**
 * Core PM state hook — manages project data, persistence, and CRUD.
 * All mutation functions return updated state for React reconciliation.
 */

import { useState, useCallback } from "react";
import type { ProjectState, Task, Dependency, Member, Baseline, KanbanLane, PmTab } from "./types";
import { MEMBER_COLORS } from "./types";
import {
  parseDuration,
  durationToCalendarDays,
  addDateDays,
  today,
  rollUpParent,
  syncTaskToLane,
} from "./engine";

const BASE_STORAGE_KEY = "mino-pm-state";

function uuid(): string {
  return crypto.randomUUID();
}

const DEFAULT_LANES: KanbanLane[] = [
  { id: "backlog", name: "Backlog", role: "backlog" },
  { id: "todo", name: "To Do", role: "queued" },
  { id: "in-progress", name: "In Progress", role: "active" },
  { id: "review", name: "Review", role: "review" },
  { id: "done", name: "Done", role: "done" },
];

function defaultState(): ProjectState {
  return {
    tasks: [],
    deps: [],
    baselines: [],
    baselineVisible: {},
    collapsed: [],
    projectName: "My Project",
    members: [],
    kanbanLanes: [...DEFAULT_LANES],
  };
}

function storageKeyFor(scope?: string): string {
  return scope ? `${BASE_STORAGE_KEY}:${scope}` : BASE_STORAGE_KEY;
}

function loadState(storageKey: string): ProjectState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ProjectState>;
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(storageKey: string, state: ProjectState): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function useProject(scope?: string) {
  const storageKey = storageKeyFor(scope);
  const [state, _setState] = useState<ProjectState>(() => loadState(storageKey));
  const [activeTab, setActiveTab] = useState<PmTab>("dashboard");

  const setState = useCallback((updater: (prev: ProjectState) => ProjectState) => {
    _setState((prev) => {
      const next = updater(prev);
      saveState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  // ── Task CRUD ──

  const addTask = useCallback(
    (opts: {
      name: string;
      plannedCost: number;
      durationStr: string;
      startDate?: string;
      parentId?: string | null;
      predecessorIds?: string[];
    }) => {
      setState((prev) => {
        const hours = parseDuration(opts.durationStr);
        const calDays = durationToCalendarDays(hours);

        // Determine start date from predecessors or default to today
        let start = opts.startDate || today();
        if (opts.predecessorIds?.length) {
          for (const pid of opts.predecessorIds) {
            const pred = prev.tasks.find((t) => t.id === pid);
            if (pred && pred.plannedEnd > start) start = pred.plannedEnd;
          }
        }

        const end = addDateDays(start, calDays);
        const id = uuid();
        const lanes = prev.kanbanLanes.length ? prev.kanbanLanes : DEFAULT_LANES;

        const task: Task = {
          id,
          name: opts.name,
          plannedCost: opts.plannedCost,
          actualCost: 0,
          plannedStart: start,
          plannedEnd: end,
          duration: hours,
          percentComplete: 0,
          parentId: opts.parentId ?? null,
          assigneeId: null,
          createdAt: new Date().toISOString(),
          kanbanLane: lanes[0].id,
          queued: false,
          reviewed: false,
        };

        const newDeps: Dependency[] = (opts.predecessorIds || []).map((from) => ({
          from,
          to: id,
        }));

        const next = {
          ...prev,
          tasks: [...prev.tasks, task],
          deps: [...prev.deps, ...newDeps],
        };

        // Roll up parent
        if (task.parentId) rollUpParent(next.tasks, task.parentId);

        return next;
      });
    },
    [setState],
  );

  const deleteTask = useCallback(
    (id: string) => {
      setState((prev) => {
        // Collect descendants
        const toRemove = new Set<string>([id]);
        const stack = [id];
        while (stack.length) {
          const pid = stack.pop()!;
          for (const t of prev.tasks) {
            if (t.parentId === pid && !toRemove.has(t.id)) {
              toRemove.add(t.id);
              stack.push(t.id);
            }
          }
        }

        const task = prev.tasks.find((t) => t.id === id);
        const parentId = task?.parentId ?? null;

        const tasks = prev.tasks.filter((t) => !toRemove.has(t.id));
        const deps = prev.deps.filter((d) => !toRemove.has(d.from) && !toRemove.has(d.to));

        if (parentId) rollUpParent(tasks, parentId);

        return { ...prev, tasks, deps };
      });
    },
    [setState],
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<Task>) => {
      setState((prev) => {
        const tasks = prev.tasks.map((t) => {
          if (t.id !== id) return t;
          const updated = { ...t, ...updates };
          // Sync kanban lane
          updated.kanbanLane = syncTaskToLane(updated, prev.kanbanLanes);
          return updated;
        });
        const task = tasks.find((t) => t.id === id);
        if (task?.parentId) rollUpParent(tasks, task.parentId);
        return { ...prev, tasks };
      });
    },
    [setState],
  );

  const assignTask = useCallback(
    (taskId: string, memberId: string | null) => {
      updateTask(taskId, { assigneeId: memberId });
    },
    [updateTask],
  );

  // ── Dependencies ──

  const addDep = useCallback(
    (from: string, to: string) => {
      setState((prev) => {
        if (prev.deps.some((d) => d.from === from && d.to === to)) return prev;
        if (from === to) return prev;
        return { ...prev, deps: [...prev.deps, { from, to }] };
      });
    },
    [setState],
  );

  const removeDep = useCallback(
    (from: string, to: string) => {
      setState((prev) => ({
        ...prev,
        deps: prev.deps.filter((d) => !(d.from === from && d.to === to)),
      }));
    },
    [setState],
  );

  // ── Members ──

  const addMember = useCallback(
    (opts: { displayName: string; role: string; costRate: number; maxHoursPerWeek: number; handle?: string | null; did?: string | null }) => {
      setState((prev) => {
        const color = MEMBER_COLORS[prev.members.length % MEMBER_COLORS.length];
        const member: Member = {
          id: uuid(),
          displayName: opts.displayName,
          role: opts.role,
          handle: opts.handle ?? null,
          did: opts.did ?? null,
          costRate: opts.costRate,
          maxHoursPerWeek: opts.maxHoursPerWeek,
          color,
        };
        return { ...prev, members: [...prev.members, member] };
      });
    },
    [setState],
  );

  const removeMember = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.id !== id),
        tasks: prev.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: null } : t)),
      }));
    },
    [setState],
  );

  const updateMember = useCallback(
    (id: string, updates: Partial<Member>) => {
      setState((prev) => ({
        ...prev,
        members: prev.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      }));
    },
    [setState],
  );

  // ── Baselines ──

  const takeBaseline = useCallback(
    (label: string) => {
      setState((prev) => {
        const version = prev.baselines.length + 1;
        const baseline: Baseline = {
          id: uuid(),
          version,
          label,
          takenAt: new Date().toISOString(),
          bac: prev.tasks.reduce((s, t) => s + t.plannedCost, 0),
          sac: 0, // computed at render time
          tasks: JSON.parse(JSON.stringify(prev.tasks)),
        };
        return { ...prev, baselines: [...prev.baselines, baseline] };
      });
    },
    [setState],
  );

  const deleteBaseline = useCallback(
    (id: string) => {
      setState((prev) => {
        const { [id]: _, ...rest } = prev.baselineVisible;
        return {
          ...prev,
          baselines: prev.baselines.filter((b) => b.id !== id),
          baselineVisible: rest,
        };
      });
    },
    [setState],
  );

  const toggleBaselineVisible = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        baselineVisible: {
          ...prev.baselineVisible,
          [id]: !prev.baselineVisible[id],
        },
      }));
    },
    [setState],
  );

  // ── Collapse ──

  const toggleCollapse = useCallback(
    (id: string) => {
      setState((prev) => {
        const idx = prev.collapsed.indexOf(id);
        const collapsed =
          idx >= 0
            ? prev.collapsed.filter((c) => c !== id)
            : [...prev.collapsed, id];
        return { ...prev, collapsed };
      });
    },
    [setState],
  );

  // ── Project name ──

  const setProjectName = useCallback(
    (name: string) => {
      setState((prev) => ({ ...prev, projectName: name }));
    },
    [setState],
  );

  // ── Import / Export ──

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.projectName.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importJSON = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          setState(() => ({ ...defaultState(), ...parsed }));
        } catch {
          // silently fail — caller can show error
        }
      };
      reader.readAsText(file);
    },
    [setState],
  );

  // ── Replace full state (for ATProto pull) ──

  const replaceState = useCallback(
    (newState: ProjectState) => {
      setState(() => ({ ...defaultState(), ...newState }));
    },
    [setState],
  );

  return {
    state,
    activeTab,
    setActiveTab,

    // Task CRUD
    addTask,
    deleteTask,
    updateTask,
    assignTask,

    // Dependencies
    addDep,
    removeDep,

    // Members
    addMember,
    removeMember,
    updateMember,

    // Baselines
    takeBaseline,
    deleteBaseline,
    toggleBaselineVisible,

    // Collapse
    toggleCollapse,

    // Project
    setProjectName,
    exportJSON,
    importJSON,
    replaceState,
  };
}

export type ProjectActions = ReturnType<typeof useProject>;
