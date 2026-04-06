/**
 * Workflow rules/triggers — automation rules stored on PDS.
 * Rules define event → action mappings that an agent can evaluate.
 *
 * Stored as plain (unencrypted) records so the agent can read them
 * without needing org-level decryption for the rule definition itself.
 */

import { state, requireVault } from "../state";

const RULE_COLLECTION = "com.minomobi.vault.workflowRule";

export interface WorkflowRule {
  $type: "com.minomobi.vault.workflowRule";
  name: string;
  orgRkey: string;
  /** Event that triggers this rule */
  trigger: {
    event: string;  // e.g. "deal-stage-change", "task-created", "task-status-change", "event-created"
    conditions?: Record<string, string>;  // e.g. { stage: "negotiation" }
  };
  /** Actions to take when triggered */
  actions: Array<{
    type: string;     // e.g. "create-task", "send-message", "send-notification", "move-task"
    params: Record<string, string>;  // action-specific parameters
  }>;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface RuleRecord {
  rkey: string;
  rule: WorkflowRule;
}

async function loadRules(orgRkey?: string): Promise<RuleRecord[]> {
  const vault = state.vault!;
  const rules: RuleRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await vault.client.listRecords(RULE_COLLECTION, 100, cursor);
    for (const rec of page.records) {
      const val = (rec as Record<string, unknown>).value as unknown as WorkflowRule;
      if (orgRkey && val.orgRkey !== orgRkey) continue;
      const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
      rules.push({ rkey, rule: val });
    }
    cursor = page.cursor;
  } while (cursor);
  return rules;
}

export const workflowTools = {
  "list-rules": {
    description:
      "List workflow automation rules. Rules define event → action mappings " +
      "that an agent evaluates (e.g. 'when deal reaches negotiation, create legal review task').",
    handler: async (args: { org?: string }) => {
      requireVault();
      const rules = await loadRules(args.org);

      if (rules.length === 0) {
        return { content: [{ type: "text" as const, text: "No workflow rules defined." }] };
      }

      const orgName = (rkey: string) => state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;

      const lines = rules.map((r) => {
        const status = r.rule.enabled ? "ON" : "OFF";
        const trigger = r.rule.trigger.event;
        const conditions = r.rule.trigger.conditions
          ? Object.entries(r.rule.trigger.conditions).map(([k, v]) => `${k}=${v}`).join(", ")
          : "";
        const actions = r.rule.actions.map((a) => a.type).join(" → ");
        return `- [${r.rkey}] ${status} "${r.rule.name}" | ${orgName(r.rule.orgRkey)}\n    When: ${trigger}${conditions ? ` (${conditions})` : ""}\n    Then: ${actions}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${rules.length} workflow rule(s):\n\n${lines.join("\n\n")}`,
        }],
      };
    },
  },

  "create-rule": {
    description:
      "Create a workflow automation rule. Specify trigger event, conditions, and actions.",
    handler: async (args: {
      org: string; name: string;
      triggerEvent: string; conditions?: Record<string, string>;
      actions: Array<{ type: string; params: Record<string, string> }>;
    }) => {
      const vault = requireVault();
      const org = state.orgs.find((o) => o.rkey === args.org);
      if (!org) throw new Error(`Org not found: ${args.org}`);

      const rule: WorkflowRule = {
        $type: RULE_COLLECTION,
        name: args.name,
        orgRkey: args.org,
        trigger: {
          event: args.triggerEvent,
          conditions: args.conditions,
        },
        actions: args.actions,
        enabled: true,
        createdAt: new Date().toISOString(),
      };

      const res = await vault.client.createRecord(RULE_COLLECTION, rule);
      const rkey = res.uri.split("/").pop()!;

      const actionList = args.actions.map((a) => a.type).join(", ");

      return {
        content: [{
          type: "text" as const,
          text: `Rule created: "${args.name}" [${rkey}]\nOrg: ${org.org.name}\nTrigger: ${args.triggerEvent}\nActions: ${actionList}`,
        }],
      };
    },
  },

  "update-rule": {
    description: "Update a workflow rule: toggle enabled, change actions or conditions.",
    handler: async (args: {
      rkey: string; name?: string; enabled?: boolean;
      triggerEvent?: string; conditions?: Record<string, string>;
      actions?: Array<{ type: string; params: Record<string, string> }>;
    }) => {
      const vault = requireVault();
      const rules = await loadRules();
      const existing = rules.find((r) => r.rkey === args.rkey);
      if (!existing) throw new Error(`Rule not found: ${args.rkey}`);

      const updated: WorkflowRule = {
        ...existing.rule,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
        ...(args.triggerEvent !== undefined ? {
          trigger: { ...existing.rule.trigger, event: args.triggerEvent },
        } : {}),
        ...(args.conditions !== undefined ? {
          trigger: { ...existing.rule.trigger, conditions: args.conditions },
        } : {}),
        ...(args.actions !== undefined ? { actions: args.actions } : {}),
        updatedAt: new Date().toISOString(),
      };

      await vault.client.putRecord(RULE_COLLECTION, args.rkey, updated);

      return {
        content: [{
          type: "text" as const,
          text: `Rule updated: "${updated.name}" [${args.rkey}] — ${updated.enabled ? "enabled" : "disabled"}`,
        }],
      };
    },
  },

  "delete-rule": {
    description: "Delete a workflow automation rule.",
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const rules = await loadRules();
      const existing = rules.find((r) => r.rkey === args.rkey);
      if (!existing) throw new Error(`Rule not found: ${args.rkey}`);

      await vault.client.deleteRecord(RULE_COLLECTION, args.rkey);
      return { content: [{ type: "text" as const, text: `Rule deleted: "${existing.rule.name}" [${args.rkey}]` }] };
    },
  },

  "evaluate-rules": {
    description:
      "Evaluate all enabled rules for an org against the current data state. " +
      "Returns which rules would fire and what actions they'd trigger. " +
      "Does NOT execute actions — lets the agent decide.",
    handler: async (args: { org: string; event: string; context?: Record<string, string> }) => {
      requireVault();
      const rules = await loadRules(args.org);
      const enabled = rules.filter((r) => r.rule.enabled);

      const matching = enabled.filter((r) => {
        if (r.rule.trigger.event !== args.event) return false;
        if (r.rule.trigger.conditions && args.context) {
          for (const [k, v] of Object.entries(r.rule.trigger.conditions)) {
            if (args.context[k] !== v) return false;
          }
        }
        return true;
      });

      if (matching.length === 0) {
        return { content: [{ type: "text" as const, text: `No rules match event "${args.event}".` }] };
      }

      const lines = matching.map((r) => {
        const actions = r.rule.actions.map((a) => {
          const params = Object.entries(a.params).map(([k, v]) => `${k}="${v}"`).join(", ");
          return `    → ${a.type}(${params})`;
        });
        return `- "${r.rule.name}" [${r.rkey}]\n${actions.join("\n")}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${matching.length} rule(s) match event "${args.event}":\n\n${lines.join("\n\n")}\n\nThese are recommendations — use the appropriate tools to execute the actions.`,
        }],
      };
    },
  },
};
