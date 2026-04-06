/**
 * CRM tools — deal CRUD, proposals, approvals.
 */

import {
  loadPersonalDeals,
  loadOrgDealsForCtx,
  saveDeal,
  writeDecision,
  createProposal,
  createApproval,
  keyringRkeyForTier,
  broadcastNotification,
} from "../../../src/crm/context";
import type { Deal, DealRecord, Stage } from "../../../src/crm/types";
import { STAGES, STAGE_LABELS } from "../../../src/crm/types";
import type { NotificationType } from "../../../src/types";
import { state, requireVault } from "../state";

export const crmTools = {
  "list-deals": {
    description:
      "List CRM deals. Can filter by org, stage, date range, or author. " +
      "Returns decrypted deal data including title, value, stage, notes, and metadata.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: {
          type: "string",
          description: "Filter by org rkey, 'personal' for personal vault, or omit for all",
        },
        stage: {
          type: "string",
          enum: [...STAGES],
          description: "Filter by pipeline stage",
        },
        minValue: {
          type: "number",
          description: "Minimum deal value in cents",
        },
        maxResults: {
          type: "number",
          description: "Max deals to return (default 50)",
        },
      },
    },
    handler: async (args: { org?: string; stage?: string; minValue?: number; maxResults?: number }) => {
      const vault = requireVault();
      const maxResults = args.maxResults ?? 50;

      let allDeals: DealRecord[] = [];

      // Load personal deals
      if (!args.org || args.org === "personal") {
        const personal = await loadPersonalDeals(vault.client, vault.dek, vault.did);
        allDeals.push(...personal);
      }

      // Load org deals
      if (!args.org || (args.org && args.org !== "personal")) {
        for (const [orgRkey, ctx] of state.orgContexts) {
          if (args.org && args.org !== orgRkey) continue;
          const orgDeals = await loadOrgDealsForCtx(vault.client, ctx);
          allDeals.push(...orgDeals);
        }
      }

      // Apply filters
      if (args.stage) {
        allDeals = allDeals.filter((d) => d.deal.stage === args.stage);
      }
      if (args.minValue !== undefined) {
        allDeals = allDeals.filter((d) => (d.deal.value ?? 0) >= args.minValue!);
      }

      // Sort by value descending
      allDeals.sort((a, b) => (b.deal.value ?? 0) - (a.deal.value ?? 0));
      allDeals = allDeals.slice(0, maxResults);

      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        const org = state.orgs.find((o) => o.rkey === rkey);
        return org?.org.name ?? rkey;
      };

      const lines = allDeals.map((d) => {
        const val = d.deal.value ? `$${(d.deal.value / 100).toFixed(2)}` : "no value";
        return `- [${d.rkey}] "${d.deal.title}" | ${STAGE_LABELS[d.deal.stage]} | ${val} | ${orgName(d.orgRkey)} | by ${d.authorDid === vault.did ? "you" : d.authorDid}`;
      });

      const total = allDeals.reduce((s, d) => s + (d.deal.value ?? 0), 0);

      return {
        content: [{
          type: "text" as const,
          text: `${allDeals.length} deals (total: $${(total / 100).toFixed(2)})\n\n${lines.join("\n") || "(no deals found)"}`,
        }],
      };
    },
  },

  "get-deal": {
    description: "Get full details of a single deal by rkey, including notes and change history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rkey: { type: "string", description: "The deal record key" },
        org: { type: "string", description: "Org rkey or 'personal'" },
      },
      required: ["rkey"],
    },
    handler: async (args: { rkey: string; org?: string }) => {
      const vault = requireVault();

      // Search all deals for this rkey
      let allDeals: DealRecord[] = [];
      const personal = await loadPersonalDeals(vault.client, vault.dek, vault.did);
      allDeals.push(...personal);
      for (const ctx of state.orgContexts.values()) {
        const orgDeals = await loadOrgDealsForCtx(vault.client, ctx);
        allDeals.push(...orgDeals);
      }

      const deal = allDeals.find((d) => d.rkey === args.rkey);
      if (!deal) return { content: [{ type: "text" as const, text: `Deal not found: ${args.rkey}` }] };

      const orgName = deal.orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === deal.orgRkey)?.org.name ?? deal.orgRkey);

      // Check for proposals
      let proposalInfo = "";
      if (deal.orgRkey !== "personal") {
        const ctx = state.orgContexts.get(deal.orgRkey);
        if (ctx) {
          const proposals = ctx.proposals.filter(
            (p) => p.proposal.targetDid === deal.authorDid && p.proposal.targetRkey === deal.rkey
          );
          if (proposals.length > 0) {
            proposalInfo = `\n\nPending proposals (${proposals.length}):\n` +
              proposals.map((p) => `  - [${p.rkey}] ${p.proposal.changeType}: "${p.proposal.summary}" by ${p.proposal.proposerHandle ?? p.proposal.proposerDid} (${p.proposal.status})`).join("\n");
          }
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: [
            `Deal: ${deal.deal.title}`,
            `Rkey: ${deal.rkey}`,
            `Org: ${orgName}`,
            `Stage: ${STAGE_LABELS[deal.deal.stage]}`,
            `Value: ${deal.deal.value ? `$${(deal.deal.value / 100).toFixed(2)}` : "(no value)"}`,
            `Author: ${deal.authorDid === vault.did ? `you (@${vault.handle})` : deal.authorDid}`,
            `Created: ${deal.deal.createdAt}`,
            deal.deal.contact ? `Contact: ${deal.deal.contact}` : null,
            deal.deal.notes ? `Notes: ${deal.deal.notes}` : null,
            deal.deal.accessTier ? `Access tier: ${deal.deal.accessTier}` : null,
            deal.previousDid ? `Previous version: ${deal.previousDid}/${deal.previousRkey}` : null,
            proposalInfo,
          ].filter(Boolean).join("\n"),
        }],
      };
    },
  },

  "create-deal": {
    description:
      "Create a new deal in the CRM pipeline. Specify org for org deals, or omit for personal vault.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Deal title" },
        value: { type: "number", description: "Deal value in cents" },
        stage: {
          type: "string",
          enum: [...STAGES],
          description: "Pipeline stage (default: lead)",
        },
        notes: { type: "string", description: "Deal notes" },
        contact: { type: "string", description: "Contact name/info" },
        org: { type: "string", description: "Org rkey to create in, omit for personal" },
        tier: { type: "string", description: "Tier name for org deals (default: your tier)" },
      },
      required: ["title"],
    },
    handler: async (args: {
      title: string; value?: number; stage?: string; notes?: string;
      contact?: string; org?: string; tier?: string;
    }) => {
      const vault = requireVault();

      const deal: Deal = {
        title: args.title,
        value: args.value ?? 0,
        stage: (args.stage as Stage) ?? "lead",
        notes: args.notes ?? "",
        contact: args.contact ?? "",
        createdAt: new Date().toISOString(),
      };

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      if (args.org) {
        const ctx = state.orgContexts.get(args.org);
        if (!ctx) throw new Error(`Org not found or no access: ${args.org}`);
        const tierName = args.tier ?? ctx.myTierName;
        const tierDek = ctx.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === tierName);
        const epoch = tierDef?.currentEpoch ?? 0;
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, tierName, epoch);
        orgRkey = ctx.org.rkey;
        if (args.tier) deal.accessTier = args.tier;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      const { rkey } = await saveDeal(vault.client, deal, dek, keyringRkey);

      const orgName = orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === orgRkey)?.org.name ?? orgRkey);

      // Broadcast notification for org deals
      if (orgRkey !== "personal") {
        const orgCtx = state.orgContexts.get(orgRkey);
        broadcastNotification(
          vault.client, "deal-created" as NotificationType,
          orgRkey, orgName,
          {
            type: "deal-created",
            orgRkey,
            orgName,
            dealTitle: deal.title,
            stage: STAGE_LABELS[deal.stage],
            senderHandle: vault.handle,
            createdAt: new Date().toISOString(),
          } as any,
          vault.did, vault.handle,
          undefined, orgCtx,
        ).catch(() => {});
      }

      return {
        content: [{
          type: "text" as const,
          text: `Deal created: "${deal.title}" [${rkey}]\nOrg: ${orgName}\nStage: ${STAGE_LABELS[deal.stage]}\nValue: $${(deal.value / 100).toFixed(2)}`,
        }],
      };
    },
  },

  "update-deal": {
    description:
      "Update an existing deal. For your own deals, edits directly. " +
      "For another member's org deal, creates a proposal through change control.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rkey: { type: "string", description: "Deal rkey to update" },
        title: { type: "string", description: "New title" },
        value: { type: "number", description: "New value in cents" },
        stage: { type: "string", enum: [...STAGES], description: "New stage" },
        notes: { type: "string", description: "New notes" },
        contact: { type: "string", description: "New contact" },
        summary: { type: "string", description: "Change summary (for proposals)" },
      },
      required: ["rkey"],
    },
    handler: async (args: {
      rkey: string; title?: string; value?: number; stage?: string;
      notes?: string; contact?: string; summary?: string;
    }) => {
      const vault = requireVault();

      // Find the deal
      let allDeals: DealRecord[] = [];
      const personal = await loadPersonalDeals(vault.client, vault.dek, vault.did);
      allDeals.push(...personal);
      for (const ctx of state.orgContexts.values()) {
        const orgDeals = await loadOrgDealsForCtx(vault.client, ctx);
        allDeals.push(...orgDeals);
      }

      const existing = allDeals.find((d) => d.rkey === args.rkey);
      if (!existing) throw new Error(`Deal not found: ${args.rkey}`);

      const updatedDeal: Deal = {
        ...existing.deal,
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.value !== undefined ? { value: args.value } : {}),
        ...(args.stage !== undefined ? { stage: args.stage as Stage } : {}),
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
        ...(args.contact !== undefined ? { contact: args.contact } : {}),
      };

      const isOwn = existing.authorDid === vault.did;
      const isOrg = existing.orgRkey !== "personal";

      // If it's someone else's org deal, create a proposal
      if (isOrg && !isOwn) {
        const ctx = state.orgContexts.get(existing.orgRkey);
        if (!ctx) throw new Error("Org context not found");

        const stageChanged = updatedDeal.stage !== existing.deal.stage;
        const contentChanged = updatedDeal.title !== existing.deal.title ||
          updatedDeal.value !== existing.deal.value ||
          updatedDeal.notes !== existing.deal.notes;
        const changeType = stageChanged && contentChanged ? "edit+stage"
          : stageChanged ? "stage" : "edit";
        const summary = args.summary ?? (stageChanged
          ? `Move to ${STAGE_LABELS[updatedDeal.stage]}`
          : `Edit: ${updatedDeal.title}`);

        const { rkey: propRkey } = await createProposal(
          vault.client, ctx, existing, updatedDeal, changeType, summary,
          vault.did, vault.handle
        );

        // Broadcast proposal notification
        broadcastNotification(
          vault.client, "proposal-created" as NotificationType,
          existing.orgRkey, ctx.org.org.name,
          {
            type: "proposal-created",
            orgRkey: existing.orgRkey,
            orgName: ctx.org.org.name,
            summary,
            senderHandle: vault.handle,
            createdAt: new Date().toISOString(),
          } as any,
          vault.did, vault.handle,
          undefined, ctx,
        ).catch(() => {});

        return {
          content: [{
            type: "text" as const,
            text: `Proposal created [${propRkey}]: ${changeType} — "${summary}"\nTarget: "${existing.deal.title}" by ${existing.authorDid}\nRequires approval before applying.`,
          }],
        };
      }

      // Direct edit (own deal)
      let dek: CryptoKey;
      let keyringRkey: string;

      if (isOrg) {
        const ctx = state.orgContexts.get(existing.orgRkey)!;
        const tierName = existing.deal.accessTier ?? ctx.myTierName;
        const tierDek = ctx.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = ctx.org.org.tiers.find((t) => t.name === tierName);
        const epoch = tierDef?.currentEpoch ?? 0;
        keyringRkey = keyringRkeyForTier(ctx.org.rkey, tierName, epoch);
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      const { rkey: newRkey } = await saveDeal(vault.client, updatedDeal, dek, keyringRkey, existing);

      await writeDecision(
        vault.client,
        existing.orgRkey,
        vault.did,
        newRkey,
        existing.authorDid,
        existing.rkey,
        vault.did,
        newRkey,
        keyringRkey,
        dek,
      );

      // Broadcast notification for org deal updates
      if (isOrg) {
        const orgName = state.orgs.find((o) => o.rkey === existing.orgRkey)?.org.name ?? existing.orgRkey;
        const dealOrgCtx = state.orgContexts.get(existing.orgRkey);
        broadcastNotification(
          vault.client, "deal-updated" as NotificationType,
          existing.orgRkey, orgName,
          {
            type: "deal-updated",
            orgRkey: existing.orgRkey,
            orgName,
            dealTitle: updatedDeal.title,
            stage: STAGE_LABELS[updatedDeal.stage],
            senderHandle: vault.handle,
            createdAt: new Date().toISOString(),
          } as any,
          vault.did, vault.handle,
          undefined, dealOrgCtx,
        ).catch(() => {});
      }

      return {
        content: [{
          type: "text" as const,
          text: `Deal updated: "${updatedDeal.title}" [${newRkey}]\nPrevious: ${existing.rkey}\nStage: ${STAGE_LABELS[updatedDeal.stage]}\nValue: $${(updatedDeal.value / 100).toFixed(2)}`,
        }],
      };
    },
  },

  "list-proposals": {
    description: "List pending change control proposals for an org.",
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

      const pending = ctx.proposals.filter(
        (p) => p.proposal.status === "open" || p.proposal.status === "approved"
      );

      if (pending.length === 0) {
        return { content: [{ type: "text" as const, text: `No pending proposals for ${ctx.org.org.name}.` }] };
      }

      const lines = pending.map((p) => {
        const approvals = ctx.approvals.filter(
          (a) => a.approval.proposalDid === p.proposal.proposerDid && a.approval.proposalRkey === p.rkey
        );
        const approvalInfo = approvals.length > 0
          ? ` (${approvals.length} approval${approvals.length > 1 ? "s" : ""}: ${approvals.map((a) => a.approval.officeName).join(", ")})`
          : "";
        return `- [${p.rkey}] ${p.proposal.changeType}: "${p.proposal.summary}" by ${p.proposal.proposerHandle ?? p.proposal.proposerDid} (${p.proposal.status})${approvalInfo}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${pending.length} pending proposal(s) for ${ctx.org.org.name}:\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "approve-proposal": {
    description: "Approve a change control proposal on behalf of an office you belong to.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        proposalRkey: { type: "string", description: "Proposal rkey" },
        office: { type: "string", description: "Office name to approve as" },
      },
      required: ["org", "proposalRkey", "office"],
    },
    handler: async (args: { org: string; proposalRkey: string; office: string }) => {
      const vault = requireVault();
      const ctx = state.orgContexts.get(args.org);
      if (!ctx) throw new Error(`Org not found: ${args.org}`);

      const proposal = ctx.proposals.find((p) => p.rkey === args.proposalRkey);
      if (!proposal) throw new Error(`Proposal not found: ${args.proposalRkey}`);

      // Resolve DEK for sealing the approval
      const tierName = ctx.myTierName;
      const tierDek = ctx.tierDeks.get(tierName);
      const tierDef = ctx.org.org.tiers.find((t) => t.name === tierName);
      const approvalKeyring = tierDek ? keyringRkeyForTier(ctx.org.rkey, tierName, tierDef?.currentEpoch ?? 0) : undefined;

      const { rkey } = await createApproval(
        vault.client, args.org, proposal.proposal.proposerDid, args.proposalRkey,
        args.office, vault.did, vault.handle,
        tierDek, approvalKeyring,
      );

      return {
        content: [{
          type: "text" as const,
          text: `Approval recorded [${rkey}] for proposal "${proposal.proposal.summary}" as office: ${args.office}`,
        }],
      };
    },
  },
};
