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
import { taskTools } from "./tools/tasks.js";
import { contactTools } from "./tools/contacts.js";
import { searchTools } from "./tools/search.js";
import { docStateTools } from "./tools/docstate.js";
import { workflowTools } from "./tools/workflows.js";
import { activityTools } from "./tools/activity.js";
import { templateTools } from "./tools/templates.js";

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

// --- Task tools ---

server.tool(
  "list-tasks",
  "List tasks. Filter by org, status, assignee, priority.",
  {
    org: z.string().optional().describe("Org rkey, 'personal', or omit for all"),
    status: z.enum(["backlog", "todo", "in-progress", "review", "done"]).optional(),
    assignee: z.string().optional().describe("Assignee handle or DID"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    maxResults: z.number().optional().describe("Max tasks to return (default 50)"),
  },
  safe(taskTools["list-tasks"].handler)
);

server.tool(
  "get-task",
  "Get full details of a task by rkey.",
  { rkey: z.string() },
  safe(taskTools["get-task"].handler)
);

server.tool(
  "create-task",
  "Create a new task. Specify org for org tasks, omit for personal.",
  {
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(["backlog", "todo", "in-progress", "review", "done"]).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    assigneeHandle: z.string().optional().describe("Handle of assignee"),
    dueDate: z.string().optional().describe("Due date (ISO, e.g. 2026-04-01)"),
    estimateHours: z.number().optional(),
    tags: z.array(z.string()).optional(),
    org: z.string().optional().describe("Org rkey, omit for personal"),
    linkedDealRkey: z.string().optional().describe("Link to a deal rkey"),
    parentTaskRkey: z.string().optional().describe("Parent task rkey"),
  },
  safe(taskTools["create-task"].handler)
);

server.tool(
  "update-task",
  "Update a task: status, assignee, priority, progress, etc.",
  {
    rkey: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["backlog", "todo", "in-progress", "review", "done"]).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    assigneeHandle: z.string().optional(),
    dueDate: z.string().optional(),
    estimateHours: z.number().optional(),
    actualHours: z.number().optional(),
    percentComplete: z.number().optional().describe("0-100"),
    tags: z.array(z.string()).optional(),
  },
  safe(taskTools["update-task"].handler)
);

server.tool(
  "delete-task",
  "Delete a task.",
  { rkey: z.string() },
  safe(taskTools["delete-task"].handler)
);

server.tool(
  "kanban-board",
  "Show kanban board — tasks grouped by status column.",
  { org: z.string().optional() },
  safe(taskTools["kanban-board"].handler)
);

// --- Contact tools ---

server.tool(
  "list-contacts",
  "List contacts. Filter by org, company, tag, or search.",
  {
    org: z.string().optional(),
    company: z.string().optional(),
    tag: z.string().optional(),
    search: z.string().optional(),
    maxResults: z.number().optional(),
  },
  safe(contactTools["list-contacts"].handler)
);

server.tool(
  "get-contact",
  "Get full details of a contact including linked deals.",
  { rkey: z.string() },
  safe(contactTools["get-contact"].handler)
);

server.tool(
  "create-contact",
  "Create a new contact in personal or org directory.",
  {
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    did: z.string().optional().describe("ATProto DID if applicable"),
    handle: z.string().optional().describe("Bluesky handle if applicable"),
    org: z.string().optional(),
  },
  safe(contactTools["create-contact"].handler)
);

server.tool(
  "update-contact",
  "Update a contact's details.",
  {
    rkey: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    dealRkeys: z.array(z.string()).optional().describe("Link deals to this contact"),
  },
  safe(contactTools["update-contact"].handler)
);

server.tool(
  "delete-contact",
  "Delete a contact.",
  { rkey: z.string() },
  safe(contactTools["delete-contact"].handler)
);

// --- Search ---

server.tool(
  "search",
  "Search across all data: deals, tasks, contacts, events, threads, channels.",
  {
    query: z.string().describe("Search text"),
    org: z.string().optional(),
    types: z.array(z.string()).optional().describe("Filter by type: deal, task, contact, event, thread, channel"),
    maxResults: z.number().optional(),
  },
  safe(searchTools["search"].handler)
);

// --- Doc state ---

server.tool(
  "doc-state",
  "Get the current full text of a Wave doc thread by composing all edits.",
  {
    org: z.string().describe("Org rkey"),
    threadAuthorDid: z.string().describe("DID of the thread author"),
    threadRkey: z.string().describe("Thread rkey"),
    includeHistory: z.boolean().optional().describe("Include edit history summary"),
  },
  safe(docStateTools["doc-state"].handler)
);

// --- Workflow rules ---

server.tool(
  "list-rules",
  "List workflow automation rules (event → action mappings).",
  { org: z.string().optional() },
  safe(workflowTools["list-rules"].handler)
);

server.tool(
  "create-rule",
  "Create a workflow automation rule.",
  {
    org: z.string(),
    name: z.string(),
    triggerEvent: z.string().describe("Event name (e.g. deal-stage-change, task-created)"),
    conditions: z.record(z.string()).optional().describe("Trigger conditions as key-value pairs"),
    actions: z.array(z.object({
      type: z.string().describe("Action type (e.g. create-task, send-notification)"),
      params: z.record(z.string()).describe("Action parameters"),
    })).describe("Actions to execute when triggered"),
  },
  safe(workflowTools["create-rule"].handler)
);

server.tool(
  "update-rule",
  "Update a workflow rule: toggle, change conditions or actions.",
  {
    rkey: z.string(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    triggerEvent: z.string().optional(),
    conditions: z.record(z.string()).optional(),
    actions: z.array(z.object({
      type: z.string(),
      params: z.record(z.string()),
    })).optional(),
  },
  safe(workflowTools["update-rule"].handler)
);

server.tool(
  "delete-rule",
  "Delete a workflow automation rule.",
  { rkey: z.string() },
  safe(workflowTools["delete-rule"].handler)
);

server.tool(
  "evaluate-rules",
  "Evaluate rules against an event — shows which rules would fire and what actions they'd trigger.",
  {
    org: z.string(),
    event: z.string().describe("Event name to evaluate"),
    context: z.record(z.string()).optional().describe("Event context for condition matching"),
  },
  safe(workflowTools["evaluate-rules"].handler)
);

// --- Activity feed ---

server.tool(
  "activity-feed",
  "Show recent activity across the org. Great for catch-up briefings.",
  {
    hours: z.number().optional().describe("Lookback hours (default 24)"),
    org: z.string().optional(),
    maxResults: z.number().optional(),
  },
  safe(activityTools["activity-feed"].handler)
);

// --- Template tools ---

server.tool(
  "list-templates",
  "List reusable templates. Filter by org or category.",
  {
    org: z.string().optional(),
    category: z.enum(["deal", "task", "event", "doc", "checklist"]).optional(),
  },
  safe(templateTools["list-templates"].handler)
);

server.tool(
  "get-template",
  "Get a template's full content.",
  { rkey: z.string() },
  safe(templateTools["get-template"].handler)
);

server.tool(
  "create-template",
  "Create a reusable template for deals, tasks, events, docs, or checklists.",
  {
    org: z.string(),
    name: z.string(),
    category: z.enum(["deal", "task", "event", "doc", "checklist"]),
    content: z.string().describe("Template content as JSON"),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  safe(templateTools["create-template"].handler)
);

server.tool(
  "update-template",
  "Update a template.",
  {
    rkey: z.string(),
    name: z.string().optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  safe(templateTools["update-template"].handler)
);

server.tool(
  "delete-template",
  "Delete a template.",
  { rkey: z.string() },
  safe(templateTools["delete-template"].handler)
);

server.tool(
  "apply-template",
  "Apply a template with variable substitutions. Returns populated content for use with create tools.",
  {
    rkey: z.string(),
    variables: z.record(z.string()).optional().describe("Variables to substitute in {{var}} placeholders"),
  },
  safe(templateTools["apply-template"].handler)
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
