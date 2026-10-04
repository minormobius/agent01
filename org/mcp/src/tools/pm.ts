/**
 * PM tools — read the sealed PM project (the one org.mino.mobi's Sync pane pushes) and compute
 * on it with the shared engine (packages/pm). Read-only: an agent can see the schedule and its
 * numbers; changing the plan stays with the person in the app.
 */

import { unsealRecord } from "../../../src/crypto";
import { SEALED_COLLECTION } from "../../../src/crm/context";
import type { ProjectState } from "../../../src/pm/types";
import {
  computeEVM, computeES, computeCriticalPath, getLeafTasks, getTreeOrder, getDepth,
} from "../../../../packages/pm/engine.mjs";
import { verifiedEarned } from "../../../../packages/pm/earned.mjs";
import { requireVault } from "../state";

const PM_PROJECT_TYPE = "com.minomobi.pm.project";
const PROJECT_RKEY = "pm-main";

async function loadProject(): Promise<ProjectState> {
  const vault = requireVault();
  const rec = await vault.client.getRecord(SEALED_COLLECTION, PROJECT_RKEY);
  if (!rec) throw new Error("No PM project on this PDS. Push one from org.mino.mobi → PM → Sync first.");
  const val = rec.value as Record<string, unknown>;
  const { innerType, record } = await unsealRecord<{ _pmState: ProjectState }>(val, vault.dek);
  if (innerType !== PM_PROJECT_TYPE || !record._pmState) throw new Error(`${PROJECT_RKEY} is not a PM project`);
  return record._pmState;
}

const asOfDate = (s: unknown) => {
  if (s == null || s === "") return undefined;
  const d = new Date(`${String(s)}T00:00:00Z`);
  if (isNaN(d.getTime())) throw new Error(`asOf must be YYYY-MM-DD, got ${String(s)}`);
  return d;
};
const r2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);
const round = <T extends Record<string, number>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)])) as T;
const json = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });

export const pmTools = {
  "pm-status": {
    handler: async (args: Record<string, unknown>) => {
      const p = await loadProject();
      const asOf = asOfDate(args.asOf);
      const critical = computeCriticalPath(p.tasks, p.deps);
      const leaves = getLeafTasks(p.tasks);
      const day = (asOf ?? new Date()).toISOString().slice(0, 10);
      return json({
        project: p.projectName,
        asOf: day,
        tasks: p.tasks.length,
        leaves: leaves.length,
        evm: round(computeEVM(p.tasks, asOf) as unknown as Record<string, number>),
        es: round(computeES(p.tasks, asOf) as unknown as Record<string, number>),
        criticalPath: getTreeOrder(p.tasks).filter((t) => critical.has(t.id)).map((t) => t.name),
        late: leaves
          .filter((t) => t.plannedEnd < day && t.percentComplete < 100)
          .map((t) => ({ id: t.id, name: t.name, plannedEnd: t.plannedEnd, percentComplete: t.percentComplete })),
      });
    },
  },

  "pm-tasks": {
    handler: async () => {
      const p = await loadProject();
      return json({
        project: p.projectName,
        tasks: getTreeOrder(p.tasks).map((t) => ({
          id: t.id, name: t.name, depth: getDepth(p.tasks, t), parentId: t.parentId,
          plannedStart: t.plannedStart, plannedEnd: t.plannedEnd, durationHours: t.duration,
          plannedCost: t.plannedCost, actualCost: t.actualCost, percentComplete: t.percentComplete,
        })),
        deps: p.deps,
      });
    },
  },

  "pm-verified-earned": {
    handler: async (args: Record<string, unknown>) => {
      const p = await loadProject();
      const status = (args.status ?? {}) as Record<string, string>;
      const links = (args.links ?? []) as { from: string; to: string; kind?: string }[];
      const r = verifiedEarned(p.tasks, status, { asOf: asOfDate(args.asOf), links });
      return json({
        project: p.projectName,
        verified: { evm: round(r.evm as unknown as Record<string, number>), es: round(r.es as unknown as Record<string, number>) },
        claimedEv: r2(r.claimedEv),
        unverifiedClaim: r2(r.unverifiedClaim),
        unlinked: r.unlinked.map((id) => p.tasks.find((t) => t.id === id)?.name ?? id),
        byTask: r.byTask,
      });
    },
  },
};
