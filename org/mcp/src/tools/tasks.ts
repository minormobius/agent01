/**
 * Task/Kanban tools — encrypted task CRUD on ATProto.
 * Uses the sealed envelope pattern (same as deals/events).
 */

import { PdsClient, resolvePds } from "../../../src/pds";
import { sealRecord, unsealRecord } from "../../../src/crypto";
import {
  keyringRkeyForTier,
  SEALED_COLLECTION,
  broadcastNotification,
} from "../../../src/crm/context";
import type { OrgContext } from "../../../src/crm/types";
import type { NotificationType } from "../../../src/types";
import { state, requireVault } from "../state";

const INNER_TYPE = "com.minomobi.pm.task";

export interface VaultTask {
  title: string;
  description?: string;
  status: "backlog" | "todo" | "in-progress" | "review" | "done";
  priority?: "low" | "medium" | "high" | "critical";
  assigneeDid?: string;
  assigneeHandle?: string;
  parentTaskRkey?: string;
  linkedDealRkey?: string;
  linkedEventRkey?: string;
  tags?: string[];
  dueDate?: string;
  estimateHours?: number;
  actualHours?: number;
  percentComplete?: number;
  createdAt: string;
  updatedAt?: string;
}

interface TaskRecord {
  rkey: string;
  task: VaultTask;
  authorDid: string;
  orgRkey: string;
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

async function loadPersonalTasks(client: PdsClient, dek: CryptoKey, ownerDid: string): Promise<TaskRecord[]> {
  const loaded: TaskRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
      if ((val.keyringRkey as string) !== "self") continue;
      try {
        const { innerType, record } = await unsealRecord<VaultTask>(val, dek);
        if (innerType !== INNER_TYPE) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        loaded.push({ rkey, task: record, authorDid: ownerDid, orgRkey: "personal" });
      } catch { /* can't decrypt */ }
    }
    cursor = page.cursor;
  } while (cursor);
  return loaded;
}

async function loadOrgTasks(client: PdsClient, orgCtx: OrgContext): Promise<TaskRecord[]> {
  const all: TaskRecord[] = [];
  const myDid = client.getSession()!.did;

  const loadFrom = async (did: string, useAuth: boolean) => {
    let cursor: string | undefined;
    do {
      const page = useAuth
        ? await client.listRecords(SEALED_COLLECTION, 100, cursor)
        : await client.listRecordsFrom(did, SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
        const recKeyring = val.keyringRkey as string;
        if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        const dek = orgCtx.keyringDeks.get(recKeyring);
        if (!dek) continue;
        try {
          const { innerType, record } = await unsealRecord<VaultTask>(val, dek);
          if (innerType !== INNER_TYPE) continue;
          all.push({ rkey, task: record, authorDid: did, orgRkey: orgCtx.org.rkey });
        } catch { /* can't decrypt */ }
      }
      cursor = page.cursor;
    } while (cursor);
  };

  await loadFrom(myDid, true);
  for (const m of orgCtx.memberships) {
    if (m.membership.memberDid === myDid) continue;
    try { await loadFrom(m.membership.memberDid, false); } catch { /* PDS unreachable */ }
  }
  return all;
}

async function loadAllTasks(): Promise<TaskRecord[]> {
  const vault = state.vault!;
  const all: TaskRecord[] = [];
  const personal = await loadPersonalTasks(vault.client, vault.dek, vault.did);
  all.push(...personal);
  for (const ctx of state.orgContexts.values()) {
    const orgTasks = await loadOrgTasks(vault.client, ctx);
    all.push(...orgTasks);
  }
  return all;
}

export const taskTools = {
  "list-tasks": {
    description:
      "List tasks. Filter by org, status, assignee, priority. Returns decrypted task data.",
    handler: async (args: {
      org?: string; status?: string; assignee?: string;
      priority?: string; maxResults?: number;
    }) => {
      const vault = requireVault();
      const max = args.maxResults ?? 50;
      let tasks = await loadAllTasks();

      if (args.org === "personal") tasks = tasks.filter((t) => t.orgRkey === "personal");
      else if (args.org) tasks = tasks.filter((t) => t.orgRkey === args.org);
      if (args.status) tasks = tasks.filter((t) => t.task.status === args.status);
      if (args.priority) tasks = tasks.filter((t) => t.task.priority === args.priority);
      if (args.assignee) {
        tasks = tasks.filter((t) =>
          t.task.assigneeDid === args.assignee || t.task.assigneeHandle === args.assignee
        );
      }

      // Sort: critical first, then high, then by due date
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      tasks.sort((a, b) => {
        const pa = priorityOrder[a.task.priority ?? "medium"] ?? 2;
        const pb = priorityOrder[b.task.priority ?? "medium"] ?? 2;
        if (pa !== pb) return pa - pb;
        const da = a.task.dueDate ?? "9999";
        const db = b.task.dueDate ?? "9999";
        return da.localeCompare(db);
      });
      tasks = tasks.slice(0, max);

      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        return state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;
      };

      const lines = tasks.map((t) => {
        const pri = t.task.priority ? ` [${PRIORITY_LABELS[t.task.priority] ?? t.task.priority}]` : "";
        const due = t.task.dueDate ? ` due:${t.task.dueDate}` : "";
        const assignee = t.task.assigneeHandle ? ` @${t.task.assigneeHandle}` : "";
        const pct = t.task.percentComplete != null ? ` ${t.task.percentComplete}%` : "";
        return `- [${t.rkey}] ${STATUS_LABELS[t.task.status] ?? t.task.status}${pri}: "${t.task.title}"${assignee}${due}${pct} | ${orgName(t.orgRkey)}`;
      });

      // Status summary
      const byStatus: Record<string, number> = {};
      tasks.forEach((t) => { byStatus[t.task.status] = (byStatus[t.task.status] ?? 0) + 1; });
      const summary = Object.entries(byStatus).map(([s, n]) => `${STATUS_LABELS[s] ?? s}: ${n}`).join(", ");

      return {
        content: [{
          type: "text" as const,
          text: `${tasks.length} task(s) (${summary})\n\n${lines.join("\n") || "(no tasks found)"}`,
        }],
      };
    },
  },

  "get-task": {
    description: "Get full details of a single task by rkey.",
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const tasks = await loadAllTasks();
      const t = tasks.find((x) => x.rkey === args.rkey);
      if (!t) return { content: [{ type: "text" as const, text: `Task not found: ${args.rkey}` }] };

      const orgName = t.orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === t.orgRkey)?.org.name ?? t.orgRkey);

      return {
        content: [{
          type: "text" as const,
          text: [
            `Task: ${t.task.title}`,
            `Rkey: ${t.rkey}`,
            `Org: ${orgName}`,
            `Status: ${STATUS_LABELS[t.task.status] ?? t.task.status}`,
            t.task.priority ? `Priority: ${PRIORITY_LABELS[t.task.priority] ?? t.task.priority}` : null,
            t.task.assigneeHandle ? `Assignee: @${t.task.assigneeHandle}` : (t.task.assigneeDid ? `Assignee: ${t.task.assigneeDid}` : null),
            t.task.description ? `Description: ${t.task.description}` : null,
            t.task.dueDate ? `Due: ${t.task.dueDate}` : null,
            t.task.estimateHours != null ? `Estimate: ${t.task.estimateHours}h` : null,
            t.task.actualHours != null ? `Actual: ${t.task.actualHours}h` : null,
            t.task.percentComplete != null ? `Progress: ${t.task.percentComplete}%` : null,
            t.task.tags?.length ? `Tags: ${t.task.tags.join(", ")}` : null,
            t.task.linkedDealRkey ? `Linked deal: ${t.task.linkedDealRkey}` : null,
            t.task.linkedEventRkey ? `Linked event: ${t.task.linkedEventRkey}` : null,
            t.task.parentTaskRkey ? `Parent task: ${t.task.parentTaskRkey}` : null,
            `Author: ${t.authorDid === vault.did ? `you (@${vault.handle})` : t.authorDid}`,
            `Created: ${t.task.createdAt}`,
            t.task.updatedAt ? `Updated: ${t.task.updatedAt}` : null,
          ].filter(Boolean).join("\n"),
        }],
      };
    },
  },

  "create-task": {
    description: "Create a new task. Specify org for org tasks, omit for personal.",
    handler: async (args: {
      title: string; description?: string; status?: string; priority?: string;
      assigneeHandle?: string; dueDate?: string; estimateHours?: number;
      tags?: string[]; org?: string; linkedDealRkey?: string; parentTaskRkey?: string;
    }) => {
      const vault = requireVault();

      const task: VaultTask = {
        title: args.title,
        description: args.description,
        status: (args.status as VaultTask["status"]) ?? "todo",
        priority: args.priority as VaultTask["priority"],
        assigneeHandle: args.assigneeHandle,
        dueDate: args.dueDate,
        estimateHours: args.estimateHours,
        tags: args.tags,
        linkedDealRkey: args.linkedDealRkey,
        parentTaskRkey: args.parentTaskRkey,
        percentComplete: 0,
        createdAt: new Date().toISOString(),
      };

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      if (args.org) {
        const ctx = state.orgContexts.get(args.org);
        if (!ctx) throw new Error(`Org not found: ${args.org}`);
        const tierDek = ctx.tierDeks.get(ctx.myTierName);
        if (!tierDek) throw new Error(`No access to tier: ${ctx.myTierName}`);
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === ctx.myTierName);
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, ctx.myTierName, tierDef?.currentEpoch ?? 0);
        orgRkey = ctx.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      const sealed = await sealRecord(INNER_TYPE, task, keyringRkey, dek);
      const res = await vault.client.createRecord(SEALED_COLLECTION, sealed);
      const rkey = res.uri.split("/").pop()!;

      const orgName = orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === orgRkey)?.org.name ?? orgRkey);

      if (orgRkey !== "personal") {
        const orgCtx = state.orgContexts.get(orgRkey);
        broadcastNotification(
          vault.client, "task-created" as NotificationType,
          orgRkey, orgName,
          { type: "task-created", orgRkey, orgName, taskTitle: task.title, senderHandle: vault.handle, createdAt: task.createdAt } as any,
          vault.did, vault.handle,
          undefined, orgCtx,
        ).catch(() => {});
      }

      return {
        content: [{
          type: "text" as const,
          text: `Task created: "${task.title}" [${rkey}]\nOrg: ${orgName}\nStatus: ${STATUS_LABELS[task.status]}${task.priority ? `\nPriority: ${PRIORITY_LABELS[task.priority]}` : ""}`,
        }],
      };
    },
  },

  "update-task": {
    description: "Update a task: change status, assignee, priority, progress, etc.",
    handler: async (args: {
      rkey: string; title?: string; description?: string; status?: string;
      priority?: string; assigneeHandle?: string; dueDate?: string;
      estimateHours?: number; actualHours?: number; percentComplete?: number;
      tags?: string[];
    }) => {
      const vault = requireVault();
      const tasks = await loadAllTasks();
      const existing = tasks.find((t) => t.rkey === args.rkey);
      if (!existing) throw new Error(`Task not found: ${args.rkey}`);

      const updated: VaultTask = {
        ...existing.task,
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.status !== undefined ? { status: args.status as VaultTask["status"] } : {}),
        ...(args.priority !== undefined ? { priority: args.priority as VaultTask["priority"] } : {}),
        ...(args.assigneeHandle !== undefined ? { assigneeHandle: args.assigneeHandle } : {}),
        ...(args.dueDate !== undefined ? { dueDate: args.dueDate } : {}),
        ...(args.estimateHours !== undefined ? { estimateHours: args.estimateHours } : {}),
        ...(args.actualHours !== undefined ? { actualHours: args.actualHours } : {}),
        ...(args.percentComplete !== undefined ? { percentComplete: args.percentComplete } : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        updatedAt: new Date().toISOString(),
      };

      // Auto-complete: status done → 100%
      if (updated.status === "done" && updated.percentComplete !== 100) {
        updated.percentComplete = 100;
      }

      let dek: CryptoKey;
      let keyringRkey: string;

      if (existing.orgRkey !== "personal") {
        const ctx = state.orgContexts.get(existing.orgRkey);
        if (!ctx) throw new Error("Org context not found");
        const tierDek = ctx.tierDeks.get(ctx.myTierName);
        if (!tierDek) throw new Error(`No access to tier: ${ctx.myTierName}`);
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === ctx.myTierName);
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, ctx.myTierName, tierDef?.currentEpoch ?? 0);
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      // Delete old, create new (same pattern as calendar)
      await vault.client.deleteRecord(SEALED_COLLECTION, args.rkey);
      const sealed = await sealRecord(INNER_TYPE, updated, keyringRkey, dek);
      const res = await vault.client.createRecord(SEALED_COLLECTION, sealed);
      const newRkey = res.uri.split("/").pop()!;

      // Broadcast status changes for org tasks
      if (existing.orgRkey !== "personal" && args.status && args.status !== existing.task.status) {
        const orgName = state.orgs.find((o) => o.rkey === existing.orgRkey)?.org.name ?? existing.orgRkey;
        const orgCtx = state.orgContexts.get(existing.orgRkey);
        broadcastNotification(
          vault.client, "task-updated" as NotificationType,
          existing.orgRkey, orgName,
          { type: "task-updated", orgRkey: existing.orgRkey, orgName, taskTitle: updated.title, status: STATUS_LABELS[updated.status], senderHandle: vault.handle, createdAt: new Date().toISOString() } as any,
          vault.did, vault.handle,
          undefined, orgCtx,
        ).catch(() => {});
      }

      return {
        content: [{
          type: "text" as const,
          text: `Task updated: "${updated.title}" [${newRkey}]\nStatus: ${STATUS_LABELS[updated.status]}${updated.percentComplete != null ? ` (${updated.percentComplete}%)` : ""}`,
        }],
      };
    },
  },

  "delete-task": {
    description: "Delete a task.",
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const tasks = await loadAllTasks();
      const existing = tasks.find((t) => t.rkey === args.rkey);
      if (!existing) throw new Error(`Task not found: ${args.rkey}`);
      if (existing.authorDid !== vault.did) throw new Error("Cannot delete another member's task");

      await vault.client.deleteRecord(SEALED_COLLECTION, args.rkey);
      return { content: [{ type: "text" as const, text: `Task deleted: "${existing.task.title}" [${args.rkey}]` }] };
    },
  },

  "kanban-board": {
    description: "Show the kanban board — tasks grouped by status column. Quick overview of work state.",
    handler: async (args: { org?: string }) => {
      const vault = requireVault();
      let tasks = await loadAllTasks();
      if (args.org === "personal") tasks = tasks.filter((t) => t.orgRkey === "personal");
      else if (args.org) tasks = tasks.filter((t) => t.orgRkey === args.org);

      const columns = ["backlog", "todo", "in-progress", "review", "done"];
      const board: Record<string, TaskRecord[]> = {};
      for (const col of columns) board[col] = [];
      for (const t of tasks) {
        const col = columns.includes(t.task.status) ? t.task.status : "backlog";
        board[col].push(t);
      }

      const sections = columns.map((col) => {
        const items = board[col];
        const lines = items.map((t) => {
          const pri = t.task.priority ? ` [${t.task.priority}]` : "";
          const assignee = t.task.assigneeHandle ? ` @${t.task.assigneeHandle}` : "";
          return `  - [${t.rkey}] "${t.task.title}"${pri}${assignee}`;
        });
        return `${STATUS_LABELS[col]} (${items.length}):\n${lines.join("\n") || "  (empty)"}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `Kanban Board (${tasks.length} tasks)\n\n${sections.join("\n\n")}`,
        }],
      };
    },
  },
};
