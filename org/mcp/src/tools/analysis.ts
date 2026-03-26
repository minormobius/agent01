/**
 * Analysis tools — pipeline summaries, stale deal detection, cross-org reporting.
 */

import {
  loadPersonalDeals,
  loadOrgDealsForCtx,
} from "../../../src/crm/context";
import { STAGES, STAGE_LABELS } from "../../../src/crm/types";
import type { DealRecord } from "../../../src/crm/types";
import { state, requireVault } from "../state";

async function loadAllDeals(): Promise<DealRecord[]> {
  const vault = state.vault!;
  const allDeals: DealRecord[] = [];

  const personal = await loadPersonalDeals(vault.client, vault.dek, vault.did);
  allDeals.push(...personal);

  for (const ctx of state.orgContexts.values()) {
    const orgDeals = await loadOrgDealsForCtx(vault.client, ctx);
    allDeals.push(...orgDeals);
  }

  return allDeals;
}

export const analysisTools = {
  "pipeline-summary": {
    description:
      "Get a pipeline summary: deal counts and total values broken down by stage. " +
      "Optionally filter by org. Great for quick status checks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: {
          type: "string",
          description: "Filter by org rkey, 'personal', or omit for all",
        },
      },
    },
    handler: async (args: { org?: string }) => {
      requireVault();
      let deals = await loadAllDeals();

      if (args.org === "personal") {
        deals = deals.filter((d) => d.orgRkey === "personal");
      } else if (args.org) {
        deals = deals.filter((d) => d.orgRkey === args.org);
      }

      const orgName = args.org
        ? (args.org === "personal" ? "Personal" : state.orgs.find((o) => o.rkey === args.org)?.org.name ?? args.org)
        : "All";

      const stageData = STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.deal.stage === stage);
        const total = stageDeals.reduce((s, d) => s + (d.deal.value ?? 0), 0);
        return { stage, label: STAGE_LABELS[stage], count: stageDeals.length, total };
      });

      const grandTotal = deals.reduce((s, d) => s + (d.deal.value ?? 0), 0);

      const lines = stageData.map((s) => {
        const bar = "█".repeat(Math.min(s.count, 20));
        return `${s.label.padEnd(15)} ${String(s.count).padStart(3)} deals  $${(s.total / 100).toFixed(2).padStart(12)}  ${bar}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: [
            `Pipeline Summary — ${orgName}`,
            "─".repeat(60),
            ...lines,
            "─".repeat(60),
            `Total: ${deals.length} deals, $${(grandTotal / 100).toFixed(2)}`,
          ].join("\n"),
        }],
      };
    },
  },

  "stale-deals": {
    description:
      "Find deals that haven't been updated in N days. Useful for identifying " +
      "forgotten opportunities that need attention.",
    inputSchema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days of inactivity (default 14)",
        },
        org: {
          type: "string",
          description: "Filter by org rkey or 'personal'",
        },
        excludeStages: {
          type: "array",
          items: { type: "string" },
          description: "Stages to exclude (e.g. ['won', 'lost'] to skip closed deals)",
        },
      },
    },
    handler: async (args: { days?: number; org?: string; excludeStages?: string[] }) => {
      requireVault();
      const days = args.days ?? 14;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const excludeStages = new Set(args.excludeStages ?? ["won", "lost"]);

      let deals = await loadAllDeals();

      if (args.org === "personal") {
        deals = deals.filter((d) => d.orgRkey === "personal");
      } else if (args.org) {
        deals = deals.filter((d) => d.orgRkey === args.org);
      }

      const stale = deals.filter((d) => {
        if (excludeStages.has(d.deal.stage)) return false;
        const created = new Date(d.deal.createdAt);
        return created < cutoff;
      });

      stale.sort((a, b) => new Date(a.deal.createdAt).getTime() - new Date(b.deal.createdAt).getTime());

      if (stale.length === 0) {
        return { content: [{ type: "text" as const, text: `No stale deals (older than ${days} days).` }] };
      }

      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        return state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;
      };

      const lines = stale.map((d) => {
        const age = Math.floor((Date.now() - new Date(d.deal.createdAt).getTime()) / 86400000);
        const val = d.deal.value ? `$${(d.deal.value / 100).toFixed(2)}` : "no value";
        return `- [${d.rkey}] "${d.deal.title}" | ${STAGE_LABELS[d.deal.stage]} | ${val} | ${age}d old | ${orgName(d.orgRkey)}`;
      });

      const totalStaleValue = stale.reduce((s, d) => s + (d.deal.value ?? 0), 0);

      return {
        content: [{
          type: "text" as const,
          text: `${stale.length} stale deal(s) (${days}+ days old, $${(totalStaleValue / 100).toFixed(2)} total):\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "cross-org-report": {
    description:
      "Compare pipeline metrics across all orgs. Shows deal counts, total values, " +
      "and stage distribution per org for a high-level portfolio view.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: async () => {
      requireVault();
      const deals = await loadAllDeals();

      // Group by org
      const byOrg = new Map<string, DealRecord[]>();
      for (const d of deals) {
        const existing = byOrg.get(d.orgRkey) ?? [];
        existing.push(d);
        byOrg.set(d.orgRkey, existing);
      }

      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        return state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;
      };

      const sections: string[] = ["# Cross-Org Pipeline Report", ""];

      for (const [orgRkey, orgDeals] of byOrg) {
        const total = orgDeals.reduce((s, d) => s + (d.deal.value ?? 0), 0);
        const stageCounts = STAGES.map((stage) => {
          const count = orgDeals.filter((d) => d.deal.stage === stage).length;
          return count > 0 ? `${STAGE_LABELS[stage]}: ${count}` : null;
        }).filter(Boolean);

        sections.push(
          `## ${orgName(orgRkey)}`,
          `  ${orgDeals.length} deals | $${(total / 100).toFixed(2)}`,
          `  ${stageCounts.join(" | ")}`,
          ""
        );
      }

      const grandTotal = deals.reduce((s, d) => s + (d.deal.value ?? 0), 0);
      sections.push(`Total across all orgs: ${deals.length} deals, $${(grandTotal / 100).toFixed(2)}`);

      return {
        content: [{ type: "text" as const, text: sections.join("\n") }],
      };
    },
  },
};
