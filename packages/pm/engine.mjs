// engine.mjs — the PM engine: EVM, earned schedule, critical path, durations, tree utilities.
// Pure functions, no DOM, no dependencies. Shared by org.mino.mobi's PM app (org/src/pm/engine.ts
// re-exports this file), vault-mcp's PM tools, and anything else that plans work.
//
// Moved here from org/src/pm/engine.ts on 2026-10-04 with its types stripped by esbuild and
// nothing else changed, except one addition: computeES(tasks, asOfDate) takes an optional as-of
// date (it read the clock directly, which no agent or test could hold still). engine.selftest.mjs
// pins the numbers the original produced on fixed projects, so a later edit can't drift them.
//
// Units, as the app has always used them: dates are YYYY-MM-DD; costs are whatever currency the
// project uses; EV is plannedCost × percentComplete (self-reported) — see verifiedEarned() in
// earned.mjs for the version where only verified work earns.

export function parseDuration(s) {
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
export function durationToCalendarDays(hours) {
  return Math.max(Math.ceil(hours / 8), 1);
}
export function fmtDuration(hours) {
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
export function addDateDays(dateStr, calDays) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + calDays);
  return d.toISOString().slice(0, 10);
}
export function today() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
export function getChildren(tasks, parentId) {
  return tasks.filter((t) => t.parentId === parentId);
}
export function getAllDescendants(tasks, parentId) {
  const result = [];
  const stack = [parentId];
  while (stack.length) {
    const pid = stack.pop();
    const kids = tasks.filter((t) => t.parentId === pid);
    for (const k of kids) {
      result.push(k);
      stack.push(k.id);
    }
  }
  return result;
}
export function getLeafTasks(tasks) {
  const parentIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId));
  return tasks.filter((t) => !parentIds.has(t.id));
}
export function isParentTask(tasks, id) {
  return tasks.some((t) => t.parentId === id);
}
export function getDepth(tasks, task) {
  let d = 0;
  let t = task;
  while (t && t.parentId) {
    d++;
    t = tasks.find((x) => x.id === t.parentId);
    if (d > 20) break;
  }
  return d;
}
export function getTreeOrder(tasks) {
  const roots = tasks.filter((t) => !t.parentId);
  const result = [];
  function walk(items) {
    for (const t of items) {
      result.push(t);
      const kids = tasks.filter((c) => c.parentId === t.id);
      if (kids.length) walk(kids);
    }
  }
  walk(roots);
  return result;
}
export function isHiddenByCollapse(tasks, task, collapsed) {
  let t = task;
  while (t && t.parentId) {
    if (collapsed.includes(t.parentId)) return true;
    t = tasks.find((x) => x.id === t.parentId);
  }
  return false;
}
export function rollUpParent(tasks, parentId) {
  const t = tasks.find((x) => x.id === parentId);
  if (!t) return;
  const kids = getChildren(tasks, parentId);
  if (kids.length === 0) return;
  if (t.originalEstimate === void 0) {
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
  t.duration = (new Date(maxEnd).getTime() - new Date(minStart).getTime()) / 36e5;
  if (t.parentId) rollUpParent(tasks, t.parentId);
}
export function computeEVM(tasks, asOfDate) {
  const now = asOfDate || /* @__PURE__ */ new Date();
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
export function computeES(tasks, asOfDate) {
  const leaves = getLeafTasks(tasks);
  if (leaves.length === 0) return { es: 0, at: 0, svt: 0, spit: 1, eact: 0, sac: 0 };
  const starts = leaves.map((t) => new Date(t.plannedStart).getTime());
  const ends = leaves.map((t) => new Date(t.plannedEnd).getTime());
  const projStart = Math.min(...starts);
  const projEnd = Math.max(...ends);
  const sac = (projEnd - projStart) / 864e5;
  const now = asOfDate ? asOfDate.getTime() : Date.now();
  const at = Math.max(0, (now - projStart) / 864e5);
  const evm = computeEVM(tasks, asOfDate);
  const steps = Math.ceil(sac) || 1;
  let es = 0;
  for (let d = 0; d <= steps; d++) {
    const sampleTime = projStart + d * 864e5;
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
        const prevTime = projStart + (d - 1) * 864e5;
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
export function computeCriticalPath(tasks, deps) {
  if (tasks.length === 0) return /* @__PURE__ */ new Set();
  const info = {};
  for (const t of tasks) {
    const dur = Math.max(
      (new Date(t.plannedEnd).getTime() - new Date(t.plannedStart).getTime()) / 864e5,
      0
    );
    info[t.id] = { dur, es: 0, ef: 0, ls: Infinity, lf: Infinity, preds: [], succs: [] };
  }
  for (const d of deps) {
    if (info[d.from] && info[d.to]) {
      info[d.to].preds.push(d.from);
      info[d.from].succs.push(d.to);
    }
  }
  const visited = /* @__PURE__ */ new Set();
  const order = [];
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const s of info[id]?.succs || []) visit(s);
    order.unshift(id);
  }
  for (const t of tasks) visit(t.id);
  for (const id of order) {
    const n = info[id];
    for (const p of n.preds) {
      if (info[p]) n.es = Math.max(n.es, info[p].ef);
    }
    n.ef = n.es + n.dur;
  }
  let projEnd = 0;
  for (const id of order) projEnd = Math.max(projEnd, info[id].ef);
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
  const critical = /* @__PURE__ */ new Set();
  for (const id of order) {
    const float = info[id].ls - info[id].es;
    if (Math.abs(float) < 0.01) critical.add(id);
  }
  return critical;
}
export function syncTaskToLane(task, lanes) {
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
export function fmtNum(n, dec = 1) {
  if (!isFinite(n)) return "\u2014";
  return n.toFixed(dec);
}
export function idxClass(v, good = 1) {
  if (!isFinite(v)) return "neutral";
  if (v >= good) return "good";
  if (v >= good * 0.9) return "warn";
  return "bad";
}
export function varClass(v) {
  if (!isFinite(v)) return "neutral";
  if (v > 0) return "good";
  if (v === 0) return "neutral";
  return "bad";
}