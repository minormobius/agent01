#!/usr/bin/env node
/**
 * MCP server for the minomobi encrypted vault.
 *
 * Provides tools for interacting with CRM deals, org management, and
 * pipeline analytics — all operating on encrypted ATProto records.
 *
 * Keys stay local. The MCP server runs on the user's machine,
 * decrypts in-process, and only returns plaintext in tool results.
 *
 * Usage:
 *   node dist/server.mjs              # stdio transport (for Claude Code)
 *   vault-mcp                         # if installed globally / via npx
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sessionTools } from "./tools/session.js";
import { crmTools } from "./tools/crm.js";
import { orgTools } from "./tools/orgs.js";
import { analysisTools } from "./tools/analysis.js";
import { calendarTools } from "./tools/calendar.js";
import { notificationTools } from "./tools/notifications.js";
import { waveTools } from "./tools/wave.js";

const server = new McpServer({
  name: "vault-mcp",
  version: "0.1.0",
});

// Helper: wrap a handler with error handling
function safe(
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>
) {
  return async (args: Record<string, unknown>) => {
    try {
      return await handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true as const,
      };
    }
  };
}

// --- Session tools ---

server.tool(
  "vault-unlock",
  "Unlock the encrypted vault with ATProto credentials. Must be called before any other tool.",
  { handle: z.string(), appPassword: z.string(), passphrase: z.string() },
  safe(sessionTools["vault-unlock"].handler)
);

server.tool(
  "vault-lock",
  "Lock the vault, clearing all keys and session data from memory.",
  {},
  safe(sessionTools["vault-lock"].handler)
);

server.tool(
  "vault-status",
  "Check if the vault is unlocked and show session info.",
  {},
  safe(sessionTools["vault-status"].handler)
);

// --- CRM tools ---

server.tool(
  "list-deals",
  "List CRM deals. Filter by org, stage, value. Returns decrypted deal data.",
  {
    org: z.string().optional().describe("Org rkey, 'personal', or omit for all"),
    stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
    minValue: z.number().optional().describe("Minimum deal value in cents"),
    maxResults: z.number().optional().describe("Max deals to return (default 50)"),
  },
  safe(crmTools["list-deals"].handler)
);

server.tool(
  "get-deal",
  "Get full details of a single deal by rkey, including notes and change history.",
  { rkey: z.string(), org: z.string().optional() },
  safe(crmTools["get-deal"].handler)
);

server.tool(
  "create-deal",
  "Create a new deal in the CRM pipeline.",
  {
    title: z.string(),
    value: z.number().optional().describe("Deal value in cents"),
    stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
    notes: z.string().optional(),
    contact: z.string().optional(),
    org: z.string().optional().describe("Org rkey, omit for personal vault"),
    tier: z.string().optional().describe("Tier name for org deals"),
  },
  safe(crmTools["create-deal"].handler)
);

server.tool(
  "update-deal",
  "Update an existing deal. Creates a proposal for another member's org deal.",
  {
    rkey: z.string(),
    title: z.string().optional(),
    value: z.number().optional().describe("New value in cents"),
    stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
    notes: z.string().optional(),
    contact: z.string().optional(),
    summary: z.string().optional().describe("Change summary for proposals"),
  },
  safe(crmTools["update-deal"].handler)
);

server.tool(
  "list-proposals",
  "List pending change control proposals for an org.",
  { org: z.string() },
  safe(crmTools["list-proposals"].handler)
);

server.tool(
  "approve-proposal",
  "Approve a change control proposal on behalf of an office you belong to.",
  { org: z.string(), proposalRkey: z.string(), office: z.string() },
  safe(crmTools["approve-proposal"].handler)
);

// --- Org tools ---

server.tool(
  "list-orgs",
  "List all orgs you have access to with tier and member info.",
  {},
  safe(orgTools["list-orgs"].handler)
);

server.tool(
  "list-members",
  "List members of an org with their tiers and roles.",
  { org: z.string() },
  safe(orgTools["list-members"].handler)
);

server.tool(
  "org-detail",
  "Get detailed org info: tiers, offices, workflow gates, relationships.",
  { org: z.string() },
  safe(orgTools["org-detail"].handler)
);

// --- Analysis tools ---

server.tool(
  "pipeline-summary",
  "Pipeline summary: deal counts and total values by stage, with visual bars.",
  { org: z.string().optional().describe("Org rkey, 'personal', or omit for all") },
  safe(analysisTools["pipeline-summary"].handler)
);

server.tool(
  "stale-deals",
  "Find deals untouched for N days. Identifies forgotten opportunities.",
  {
    days: z.number().optional().describe("Days of inactivity (default 14)"),
    org: z.string().optional(),
    excludeStages: z.array(z.string()).optional().describe("Stages to skip (default: won, lost)"),
  },
  safe(analysisTools["stale-deals"].handler)
);

server.tool(
  "cross-org-report",
  "Compare pipeline metrics across all orgs — deal counts, values, stage distribution.",
  {},
  safe(analysisTools["cross-org-report"].handler)
);

// --- Calendar tools ---

server.tool(
  "list-events",
  "List calendar events. Filter by org, date range, or search text.",
  {
    org: z.string().optional().describe("Org rkey, 'personal', or omit for all"),
    from: z.string().optional().describe("Start date (ISO, e.g. 2026-03-01)"),
    to: z.string().optional().describe("End date (ISO, e.g. 2026-03-31)"),
    search: z.string().optional().describe("Search title, location, or notes"),
    maxResults: z.number().optional().describe("Max events to return (default 50)"),
  },
  safe(calendarTools["list-events"].handler)
);

server.tool(
  "get-event",
  "Get full details of a single calendar event by rkey.",
  { rkey: z.string() },
  safe(calendarTools["get-event"].handler)
);

server.tool(
  "create-event",
  "Create a new calendar event.",
  {
    title: z.string(),
    start: z.string().describe("Start datetime (ISO)"),
    end: z.string().describe("End datetime (ISO)"),
    allDay: z.boolean().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
    org: z.string().optional().describe("Org rkey, omit for personal"),
  },
  safe(calendarTools["create-event"].handler)
);

server.tool(
  "update-event",
  "Update an existing calendar event.",
  {
    rkey: z.string(),
    title: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    allDay: z.boolean().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  },
  safe(calendarTools["update-event"].handler)
);

server.tool(
  "delete-event",
  "Delete a calendar event.",
  { rkey: z.string() },
  safe(calendarTools["delete-event"].handler)
);

server.tool(
  "upcoming-events",
  "Show upcoming events for the next N days. Great for daily/weekly briefings.",
  {
    days: z.number().optional().describe("Days ahead (default 7)"),
    org: z.string().optional(),
  },
  safe(calendarTools["upcoming-events"].handler)
);

// --- Notification tools ---

server.tool(
  "list-notifications",
  "List pending notifications (org invites, messages, etc).",
  {},
  safe(notificationTools["list-notifications"].handler)
);

server.tool(
  "dismiss-notification",
  "Dismiss a notification by its key so it won't appear again.",
  { key: z.string().describe("Notification key (e.g. invite:did:...:orgRkey)") },
  safe(notificationTools["dismiss-notification"].handler)
);

server.tool(
  "notification-preferences",
  "View or update notification preferences. Without arguments shows current settings.",
  {
    enable: z.array(z.string()).optional().describe("Notification types to enable"),
    disable: z.array(z.string()).optional().describe("Notification types to disable"),
  },
  safe(notificationTools["notification-preferences"].handler)
);

server.tool(
  "send-notification",
  "Send a notification to a user or broadcast to the entire org.",
  {
    org: z.string().describe("Org rkey"),
    type: z.string().describe("Notification type (e.g. org-invite, wave-message, deal-created)"),
    message: z.string().describe("Notification message/summary"),
    targetDid: z.string().optional().describe("Target user DID, or omit to broadcast"),
  },
  safe(notificationTools["send-notification"].handler)
);

// --- Wave tools ---

server.tool(
  "list-channels",
  "List channels in an org with tier and creation date.",
  { org: z.string().describe("Org rkey") },
  safe(waveTools["list-channels"].handler)
);

server.tool(
  "list-threads",
  "List threads in a channel with title, type, author.",
  {
    org: z.string().describe("Org rkey"),
    channel: z.string().describe("Channel rkey"),
  },
  safe(waveTools["list-threads"].handler)
);

server.tool(
  "read-thread",
  "Read decrypted messages or doc edits in a thread.",
  {
    org: z.string().describe("Org rkey"),
    threadAuthorDid: z.string().describe("DID of the thread author"),
    threadRkey: z.string().describe("Thread rkey"),
    maxResults: z.number().optional().describe("Max messages to return (default 50)"),
  },
  safe(waveTools["read-thread"].handler)
);

server.tool(
  "send-message",
  "Send an encrypted message to a Wave thread.",
  {
    org: z.string().describe("Org rkey"),
    threadAuthorDid: z.string().describe("DID of the thread author"),
    threadRkey: z.string().describe("Thread rkey"),
    text: z.string().describe("Message text"),
    channel: z.string().optional().describe("Channel rkey (for context)"),
    channelName: z.string().optional().describe("Channel name (for notification)"),
    threadTitle: z.string().optional().describe("Thread title (for notification)"),
  },
  safe(waveTools["send-message"].handler)
);

server.tool(
  "create-thread",
  "Create a new thread (chat or doc) in a channel.",
  {
    org: z.string().describe("Org rkey"),
    channel: z.string().describe("Channel rkey"),
    type: z.enum(["chat", "doc"]).optional().describe("Thread type (default: chat)"),
    title: z.string().optional().describe("Thread title"),
    channelName: z.string().optional().describe("Channel name (for notification)"),
  },
  safe(waveTools["create-thread"].handler)
);

server.tool(
  "create-channel",
  "Create a new channel in an org (founder only).",
  {
    org: z.string().describe("Org rkey"),
    name: z.string().describe("Channel name"),
    tier: z.string().optional().describe("Tier name (default: your tier)"),
  },
  safe(waveTools["create-channel"].handler)
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
