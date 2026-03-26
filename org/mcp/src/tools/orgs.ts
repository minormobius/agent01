/**
 * Org tools — org listing, membership info, tier details.
 */

import { state, requireVault } from "../state";

export const orgTools = {
  "list-orgs": {
    description: "List all orgs you have access to (founded and joined), with tier and member info.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: async () => {
      requireVault();

      if (state.orgs.length === 0) {
        return { content: [{ type: "text" as const, text: "No orgs found." }] };
      }

      const lines = state.orgs.map((o) => {
        const ctx = state.orgContexts.get(o.rkey);
        const tierInfo = ctx
          ? `your tier: ${ctx.myTierName} (level ${ctx.myTierLevel})`
          : "no context loaded";
        const memberCount = ctx ? ctx.memberships.length : 0;
        const isFounder = o.org.founderDid === state.vault!.did;
        const tiers = o.org.tiers.map((t) => `${t.name}(L${t.level})`).join(", ");

        return [
          `## ${o.org.name}`,
          `  Rkey: ${o.rkey}`,
          `  Role: ${isFounder ? "founder" : "member"}`,
          `  ${tierInfo}`,
          `  Members: ${memberCount}`,
          `  Tiers: ${tiers}`,
          `  Created: ${o.org.createdAt}`,
        ].join("\n");
      });

      return {
        content: [{
          type: "text" as const,
          text: lines.join("\n\n"),
        }],
      };
    },
  },

  "list-members": {
    description: "List members of an org with their tiers and roles.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
      },
      required: ["org"],
    },
    handler: async (args: { org: string }) => {
      const vault = requireVault();
      const ctx = state.orgContexts.get(args.org);
      if (!ctx) throw new Error(`Org not found: ${args.org}`);

      const lines = ctx.memberships.map((m) => {
        const isYou = m.membership.memberDid === vault.did;
        const handle = m.membership.memberHandle ?? m.membership.memberDid;
        return `- ${handle}${isYou ? " (you)" : ""} | tier: ${m.membership.tierName} | invited by: ${m.membership.invitedBy}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${ctx.org.org.name} — ${ctx.memberships.length} member(s):\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "org-detail": {
    description: "Get detailed info about an org: tiers, offices, workflow gates, relationships.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
      },
      required: ["org"],
    },
    handler: async (args: { org: string }) => {
      requireVault();
      const ctx = state.orgContexts.get(args.org);
      if (!ctx) throw new Error(`Org not found: ${args.org}`);

      const org = ctx.org.org;
      const sections: string[] = [
        `# ${org.name}`,
        `Founder: ${org.founderDid}`,
        `Created: ${org.createdAt}`,
        `Your tier: ${ctx.myTierName} (level ${ctx.myTierLevel})`,
        "",
        "## Tiers",
        ...org.tiers.map((t) => `  - ${t.name} (level ${t.level}, epoch ${t.currentEpoch ?? 0})`),
      ];

      if (org.offices && org.offices.length > 0) {
        sections.push("", "## Offices");
        for (const o of org.offices) {
          sections.push(`  - ${o.name}: ${o.memberDids.length} member(s)`);
        }
      }

      if (org.workflow?.gates?.length) {
        sections.push("", "## Workflow Gates");
        for (const g of org.workflow.gates) {
          sections.push(`  - ${g.fromStage} → ${g.toStage}: requires ${g.requiredOffices.join(", ")}`);
        }
      }

      if (ctx.relationships.length > 0) {
        sections.push("", "## Relationships");
        for (const r of ctx.relationships) {
          const rel = r.relationship;
          sections.push(`  - ${rel.type}: ${rel.childRef.orgRkey} (${rel.origin?.type ?? "unknown origin"})`);
        }
      }

      return {
        content: [{ type: "text" as const, text: sections.join("\n") }],
      };
    },
  },
};
