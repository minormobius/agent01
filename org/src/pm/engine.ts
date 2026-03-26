/**
 * PM computation engine — pure functions, no DOM, no state.
 * EVM, Earned Schedule, critical path, duration parsing, tree utilities.
 */

import type { Task, Dependency, EvmResult, EsResult } from "./types";

// ── Duration parsing ──

/** Parse "2w3d8h", "5d", "4h", plain number (days) → work hours */
export function parseDuration(s: string): number {
  if (!s || !s.trim()) return 0;
  let hours = 0;
  const str = s.trim().toLowerCase();
  const weeks = str.match(/([\d.]+)\s*w/);
  const days = str.match(/([\d.]+)\s*d/);
  const hrs = str.match(/([\d.]+)\s*h/);
  if (weeks) hours += parseFloat(weeks[1]) * 40;
  if (days) hours += parseFloat(days[1]) * 8;
  if (hrs) hours += parseFloat(hrs[1]);
  if (!weeks && !days && !hrs && /^[\d.]+$/.test(str)) hours = parseFloat(str) * 8;
  return hours;
}

/** Work hours → calendar days (8h = 1 day) */
export function durationToCalendarDays(hours: number): number {
  return Math.max(Math.ceil(hours / 8), 1);
}

/** Work hours → human string */
export function fmtDuration(hours: number): string {
  if (!hours || hours <= 0) return "0d";
  const w = Math.floor(hours / 40);
  const rem = hours % 40;
  const d = Math.floor(rem / 8);
  const h = Math.round(rem % 8);
  let s = "";
  if (w) s += w + "w";
  if (d) s += d + "d";
  if (h) s += h + "h";
  return s || "0d";
}

// ── Date helpers ──

export function addDateDays(dateStr: string, calDays: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + calDays);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Tree utilities ──

export function getChildren(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parentId === parentId);
}

export function getAllDescendants(tasks: Task[], parentId: string): Task[] {
  const result: Task[] = [];
  const stack = [parentId];
  while (stack.length) {
    const pid = stack.pop()!;
    const kids = tasks.filter((t) => t.parentId === pid);
    for (const k of kids) {
      result.push(k);
      stack.push(k.id);
    }
  }
  return result;
}

export function getLeafTasks(tasks: Task[]): Task[] {
  const parentIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId));
  return tasks.filter((t) => !parentIds.has(t.id));
}

export function isParentTask(tasks: Task[], id: string): boolean {
  return tasks.some((t) => t.parentId === id);
}

export function getDepth(tasks: Task[], task: Task): number {
  let d = 0;
  let t: Task | undefined = task;
  while (t && t.parentId) {
    d++;
    t = tasks.find((x) => x.id === t!.parentId);
    if (d > 20) break;
  }
  return d;
}

export function getTreeOrder(tasks: Task[]): Task[] {
  const roots = tasks.filter((t) => !t.parentId);
  const result: Task[] = [];
  function walk(items: Task[]) {
    for (const t of items) {
      result.push(t);
      const kids = tasks.filter((c) => c.parentId === t.id);
      if (kids.length) walk(kids);
    }
  }
  walk(roots);
  return result;
}

export function isHiddenByCollapse(tasks: Task[], task: Task, collapsed: string[]): boolean {
  let t: Task | undefined = task;
  while (t && t.parentId) {
    if (collapsed.includes(t.parentId)) return true;
    t = tasks.find((x) => x.id === t!.parentId);
  }
  return false;
}

// ── Roll-up ──

export function rollUpParent(tasks: Task[], parentId: string): void {
  const t = tasks.find((x) => x.id === parentId);
  if (!t) return;
  const kids = getChildren(tasks, parentId);
  if (kids.length === 0) return;

  if (t.originalEstimate === undefined) {
    t.originalEstimate = { cost: t.plannedCost, duration: t.duration };
  }

  let minStart = kids[0].plannedStart;
  let maxEnd = kids[0].plannedEnd;
  let totalCost = 0;
  let totalActual = 0;
  let weightedPct = 0;

  for (const k of kids) {
    if (k.plannedStart < minStart) minStart = k.plannedStart;
    if (k.plannedEnd > maxEnd) maxEnd = k.plannedEnd;
    totalCost += k.plannedCost;
    weightedPct += k.plannedCost * k.percentComplete;
    totalActual += k.actualCost;
  }

  t.plannedStart = minStart;
  t.plannedEnd = maxEnd;
  t.percentComplete = totalCost > 0 ? Math.round(weightedPct / totalCost) : 0;
  t.plannedCost = totalCost;
  t.actualCost = totalActual;
  t.duration = (new Date(maxEnd).getTime() - new Date(minStart).getTime()) / 3600000;

  if (t.parentId) rollUpParent(tasks, t.parentId);
}

// ── EVM Engine ──

export function computeEVM(tasks: Task[], asOfDate?: Date): EvmResult {
  const now = asOfDate || new Date();
  let pv = 0;
  let ev = 0;
  let ac = 0;
  let bac = 0;
  const leaves = getLeafTasks(tasks);

  for (const t of leaves) {
    const ps = new Date(t.plannedStart).getTime();
    const pe = new Date(t.plannedEnd).getTime();
    const dur = Math.max(pe - ps, 1);
    const elapsed = Math.max(0, Math.min(now.getTime() - ps, dur));
    const plannedPct = elapsed / dur;

    pv += t.plannedCost * plannedPct;
    ev += t.plannedCost * (t.percentComplete / 100);
    ac += t.actualCost;
    bac += t.plannedCost;
  }

  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : ev > 0 ? Infinity : 1;
  const spi = pv > 0 ? ev / pv : ev > 0 ? Infinity : 1;
  const eac = cpi > 0 ? bac / cpi : Infinity;
  const etc_ = eac - ac;
  const vac = bac - eac;

  return { pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc: etc_, vac };
}

// ── Earned Schedule Engine ──

export function computeES(tasks: Task[]): EsResult {
  const leaves = getLeafTasks(tasks);
  if (leaves.length === 0) return { es: 0, at: 0, svt: 0, spit: 1, eact: 0, sac: 0 };

  const starts = leaves.map((t) => new Date(t.plannedStart).getTime());
  const ends = leaves.map((t) => new Date(t.plannedEnd).getTime());
  const projStart = Math.min(...starts);
  const projEnd = Math.max(...ends);
  const sac = (projEnd - projStart) / 86400000;
  const now = Date.now();
  const at = Math.max(0, (now - projStart) / 86400000);

  const evm = computeEVM(tasks);
  const steps = Math.ceil(sac) || 1;
  let es = 0;

  for (let d = 0; d <= steps; d++) {
    const sampleTime = projStart + d * 86400000;
    let pvAtD = 0;
    for (const t of leaves) {
      const ps = new Date(t.plannedStart).getTime();
      const pe = new Date(t.plannedEnd).getTime();
      const dur = Math.max(pe - ps, 1);
      const elapsed = Math.max(0, Math.min(sampleTime - ps, dur));
      pvAtD += t.plannedCost * (elapsed / dur);
    }
    if (pvAtD >= evm.ev) {
      if (d === 0) {
        es = 0;
      } else {
        const prevTime = projStart + (d - 1) * 86400000;
        let pvPrev = 0;
        for (const t of leaves) {
          const ps = new Date(t.plannedStart).getTime();
          const pe = new Date(t.plannedEnd).getTime();
          const dur = Math.max(pe - ps, 1);
          const elapsed = Math.max(0, Math.min(prevTime - ps, dur));
          pvPrev += t.plannedCost * (elapsed / dur);
        }
        const frac = pvAtD > pvPrev ? (evm.ev - pvPrev) / (pvAtD - pvPrev) : 0;
        es = d - 1 + frac;
      }
      break;
    }
    if (d === steps) es = steps;
  }

  const svt = es - at;
  const spit = at > 0 ? es / at : es > 0 ? Infinity : 1;
  const eact = spit > 0 ? sac / spit : Infinity;

  return { es, at, svt, spit, eact, sac };
}

// ── Critical Path (CPM) ──

export function computeCriticalPath(tasks: Task[], deps: Dependency[]): Set<string> {
  if (tasks.length === 0) return new Set();

  const info: Record<
    string,
    { dur: number; es: number; ef: number; ls: number; lf: number; preds: string[]; succs: string[] }
  > = {};

  for (const t of tasks) {
    const dur = Math.max(
      (new Date(t.plannedEnd).getTime() - new Date(t.plannedStart).getTime()) / 86400000,
      0,
    );
    info[t.id] = { dur, es: 0, ef: 0, ls: Infinity, lf: Infinity, preds: [], succs: [] };
  }

  for (const d of deps) {
    if (info[d.from] && info[d.to]) {
      info[d.to].preds.push(d.from);
      info[d.from].succs.push(d.to);
    }
  }

  // Topological sort
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const s of info[id]?.succs || []) visit(s);
    order.unshift(id);
  }
  for (const t of tasks) visit(t.id);

  // Forward pass
  for (const id of order) {
    const n = info[id];
    for (const p of n.preds) {
      if (info[p]) n.es = Math.max(n.es, info[p].ef);
    }
    n.ef = n.es + n.dur;
  }

  let projEnd = 0;
  for (const id of order) projEnd = Math.max(projEnd, info[id].ef);

  // Backward pass
  for (const id of [...order].reverse()) {
    const n = info[id];
    if (n.succs.length === 0) {
      n.lf = projEnd;
    } else {
      n.lf = Infinity;
      for (const s of n.succs) {
        if (info[s]) n.lf = Math.min(n.lf, info[s].ls);
      }
    }
    n.ls = n.lf - n.dur;
  }

  const critical = new Set<string>();
  for (const id of order) {
    const float = info[id].ls - info[id].es;
    if (Math.abs(float) < 0.01) critical.add(id);
  }
  return critical;
}

// ── Kanban sync ──

export function syncTaskToLane(task: Task, lanes: { id: string; role: string }[]): string {
  const backlog = lanes.find((l) => l.role === "backlog");
  const queued = lanes.find((l) => l.role === "queued");
  const active = lanes.find((l) => l.role === "active");
  const review = lanes.find((l) => l.role === "review");
  const done = lanes.find((l) => l.role === "done");

  if (task.reviewed && task.percentComplete >= 100) {
    return done ? done.id : lanes[lanes.length - 1].id;
  } else if (task.percentComplete >= 100) {
    return review ? review.id : lanes[lanes.length - 1].id;
  } else if (task.percentComplete > 0) {
    return active ? active.id : queued ? queued.id : lanes[0].id;
  } else if (task.queued) {
    return queued ? queued.id : active ? active.id : lanes[0].id;
  }
  return backlog ? backlog.id : lanes[0].id;
}

// ── Formatting helpers ──

export function fmtNum(n: number, dec = 1): string {
  if (!isFinite(n)) return "\u2014";
  return n.toFixed(dec);
}

export function idxClass(v: number, good = 1): string {
  if (!isFinite(v)) return "neutral";
  if (v >= good) return "good";
  if (v >= good * 0.9) return "warn";
  return "bad";
}

export function varClass(v: number): string {
  if (!isFinite(v)) return "neutral";
  if (v > 0) return "good";
  if (v === 0) return "neutral";
  return "bad";
}
