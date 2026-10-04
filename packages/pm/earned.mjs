// earned.mjs — earned value where only verified work earns.
//
// engine.mjs earns EV as plannedCost × percentComplete, and percentComplete is whatever someone
// typed. Here a leaf task earns its planned cost in proportion to the requirements it carries that
// a V&V status map (packages/whetstone's vv `status()`, or anything shaped like it) calls
// `verified`. A task that carries no requirements earns nothing: work nobody can check is not
// counted as done. The difference between the two EVs is reported as `unverifiedClaim`, the
// part of the schedule that rests on someone's word.
//
//   verifiedEarned(tasks, status, { asOf, links })
//     tasks   engine tasks; a leaf's requirement ids are `task.reqs`, or come from `links`
//     status  { [reqId]: 'verified' | 'partial' | 'failed' | 'unverified' }
//     links   optional [{ from: taskId, to: reqId, kind: 'implements' }] (vv's link shape)
//     asOf    Date; defaults to now, like the engine
//
// Returns the engine's EVM and ES on verified EV, the self-reported EV beside it, and per task
// what it claimed and what it earned.
import { computeEVM, computeES, getLeafTasks } from './engine.mjs';

export function verifiedEarned(tasks, status, { asOf, links } = {}) {
  const linked = {};
  for (const l of links || []) if (!l.kind || l.kind === 'implements') (linked[l.from] ||= new Set()).add(l.to);
  const leafIds = new Set(getLeafTasks(tasks).map((t) => t.id));
  const byTask = {};
  const unlinked = [];
  const verifiedTasks = tasks.map((t) => {
    if (!leafIds.has(t.id)) return { ...t };
    const reqs = [...new Set([...(t.reqs || []), ...(linked[t.id] || [])])].sort();
    const ok = reqs.filter((r) => status[r] === 'verified');
    const failed = reqs.filter((r) => status[r] === 'failed');
    const frac = reqs.length ? ok.length / reqs.length : 0;
    if (!reqs.length) unlinked.push(t.id);
    byTask[t.id] = {
      reqs, verified: ok, failed,
      claimed: t.plannedCost * (t.percentComplete / 100),
      earned: t.plannedCost * frac,
    };
    return { ...t, percentComplete: frac * 100 };
  });
  const evm = computeEVM(verifiedTasks, asOf);
  const es = computeES(verifiedTasks, asOf);
  const claimed = computeEVM(tasks, asOf).ev;
  return {
    evm, es,
    claimedEv: claimed,
    unverifiedClaim: claimed - evm.ev,
    unlinked: unlinked.sort(),
    byTask,
  };
}
