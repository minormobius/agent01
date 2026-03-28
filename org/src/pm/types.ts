// ── PM Data Model ──

export interface Task {
  id: string;
  name: string;
  plannedCost: number;
  actualCost: number;
  plannedStart: string; // YYYY-MM-DD
  plannedEnd: string;
  duration: number; // work hours
  percentComplete: number; // 0-100
  parentId: string | null;
  assigneeId: string | null;
  createdAt: string;
  kanbanLane: string;
  queued: boolean;
  reviewed: boolean;
  originalEstimate?: { cost: number; duration: number };
}

export interface Dependency {
  from: string; // predecessor task id
  to: string; // successor task id
}

export interface Member {
  id: string;
  displayName: string;
  role: string;
  handle: string | null;
  did: string | null;
  costRate: number;
  maxHoursPerWeek: number;
  color: string;
}

export interface Baseline {
  id: string;
  version: number;
  label: string;
  takenAt: string;
  bac: number;
  sac: number;
  tasks: Task[];
}

export interface KanbanLane {
  id: string;
  name: string;
  role: "backlog" | "queued" | "active" | "review" | "done" | "custom";
}

export interface TimeEntry {
  id: string;
  taskId: string;
  memberId: string;
  date: string;          // YYYY-MM-DD
  hours: number;
  notes?: string;
  createdAt: string;
}

export interface ProjectState {
  tasks: Task[];
  deps: Dependency[];
  baselines: Baseline[];
  baselineVisible: Record<string, boolean>;
  collapsed: string[];
  projectName: string;
  members: Member[];
  kanbanLanes: KanbanLane[];
  timeEntries?: TimeEntry[];
}

// ── EVM / ES result types ──

export interface EvmResult {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  cv: number;
  sv: number;
  cpi: number;
  spi: number;
  eac: number;
  etc: number;
  vac: number;
}

export interface EsResult {
  es: number;
  at: number;
  svt: number;
  spit: number;
  eact: number;
  sac: number;
}

// ── Tab identifiers ──

export type PmTab =
  | "dashboard"
  | "tasks"
  | "gantt"
  | "kanban"
  | "scurve"
  | "team"
  | "resources"
  | "timelogs"
  | "sync"
  | "docs";

export const PM_TABS: { id: PmTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tasks", label: "Tasks" },
  { id: "gantt", label: "Gantt" },
  { id: "kanban", label: "Kanban" },
  { id: "scurve", label: "S-Curve" },
  { id: "team", label: "Team" },
  { id: "resources", label: "Resources" },
  { id: "timelogs", label: "Time Log" },
  { id: "sync", label: "Sync" },
  { id: "docs", label: "Docs" },
];

// ── Member color palette ──

export const MEMBER_COLORS = [
  "#58a6ff", "#3fb950", "#f85149", "#d2a8ff",
  "#f0883e", "#56d4dd", "#e3b341", "#8b949e",
  "#ff7b72", "#79c0ff", "#7ee787", "#ffa657",
];
