/**
 * Calendar tools — event CRUD and schedule queries.
 */

import {
  loadPersonalEvents,
  loadOrgEvents,
  saveEvent,
  updateEvent,
  deleteEvent,
  keyringRkeyForTier,
} from "../../../src/cal/context";
import { broadcastNotification } from "../../../src/crm/context";
import type { CalEvent, CalEventRecord } from "../../../src/cal/types";
import type { NotificationType } from "../../../src/types";
import { state, requireVault } from "../state";

async function loadAllEvents(): Promise<CalEventRecord[]> {
  const vault = state.vault!;
  const all: CalEventRecord[] = [];

  const personal = await loadPersonalEvents(vault.client, vault.dek, vault.did);
  all.push(...personal);

  for (const ctx of state.orgContexts.values()) {
    const orgEvents = await loadOrgEvents(vault.client, ctx);
    all.push(...orgEvents);
  }

  return all;
}

function formatEventLine(e: CalEventRecord, vault: { did: string }): string {
  const start = new Date(e.event.start);
  const end = new Date(e.event.end);
  const dateStr = e.event.allDay
    ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const orgName = e.orgRkey === "personal" ? "" : ` | ${state.orgs.find((o) => o.rkey === e.orgRkey)?.org.name ?? e.orgRkey}`;
  return `- [${e.rkey}] "${e.event.title}" | ${dateStr}${e.event.allDay ? " (all day)" : ""}${e.event.location ? ` | ${e.event.location}` : ""}${orgName}`;
}

export const calendarTools = {
  "list-events": {
    description:
      "List calendar events. Filter by org, date range, or search text. " +
      "Returns decrypted event data including title, time, location, and notes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: {
          type: "string",
          description: "Filter by org rkey, 'personal', or omit for all",
        },
        from: {
          type: "string",
          description: "Start date (ISO date, e.g. 2026-03-01)",
        },
        to: {
          type: "string",
          description: "End date (ISO date, e.g. 2026-03-31)",
        },
        search: {
          type: "string",
          description: "Search text to match against title, location, or notes",
        },
        maxResults: {
          type: "number",
          description: "Max events to return (default 50)",
        },
      },
    },
    handler: async (args: { org?: string; from?: string; to?: string; search?: string; maxResults?: number }) => {
      const vault = requireVault();
      const maxResults = args.maxResults ?? 50;

      let events = await loadAllEvents();

      // Org filter
      if (args.org === "personal") {
        events = events.filter((e) => e.orgRkey === "personal");
      } else if (args.org) {
        events = events.filter((e) => e.orgRkey === args.org);
      }

      // Date filter
      if (args.from) {
        const from = new Date(args.from);
        events = events.filter((e) => new Date(e.event.end) >= from);
      }
      if (args.to) {
        const to = new Date(args.to + "T23:59:59");
        events = events.filter((e) => new Date(e.event.start) <= to);
      }

      // Search filter
      if (args.search) {
        const q = args.search.toLowerCase();
        events = events.filter((e) =>
          e.event.title.toLowerCase().includes(q) ||
          (e.event.location?.toLowerCase().includes(q)) ||
          (e.event.notes?.toLowerCase().includes(q))
        );
      }

      // Sort by start date
      events.sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime());
      events = events.slice(0, maxResults);

      const lines = events.map((e) => formatEventLine(e, vault));

      return {
        content: [{
          type: "text" as const,
          text: `${events.length} event(s)\n\n${lines.join("\n") || "(no events found)"}`,
        }],
      };
    },
  },

  "get-event": {
    description: "Get full details of a single calendar event by rkey.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rkey: { type: "string", description: "The event record key" },
      },
      required: ["rkey"],
    },
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const events = await loadAllEvents();
      const event = events.find((e) => e.rkey === args.rkey);
      if (!event) return { content: [{ type: "text" as const, text: `Event not found: ${args.rkey}` }] };

      const orgName = event.orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === event.orgRkey)?.org.name ?? event.orgRkey);
      const start = new Date(event.event.start);
      const end = new Date(event.event.end);

      return {
        content: [{
          type: "text" as const,
          text: [
            `Event: ${event.event.title}`,
            `Rkey: ${event.rkey}`,
            `Calendar: ${orgName}`,
            `Start: ${start.toISOString()}`,
            `End: ${end.toISOString()}`,
            event.event.allDay ? "All day: yes" : null,
            event.event.location ? `Location: ${event.event.location}` : null,
            event.event.notes ? `Notes: ${event.event.notes}` : null,
            `Author: ${event.authorDid === vault.did ? `you (@${vault.handle})` : event.authorDid}`,
          ].filter(Boolean).join("\n"),
        }],
      };
    },
  },

  "create-event": {
    description: "Create a new calendar event. Specify org for org calendar, or omit for personal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Event title" },
        start: { type: "string", description: "Start datetime (ISO, e.g. 2026-03-28T09:00:00)" },
        end: { type: "string", description: "End datetime (ISO, e.g. 2026-03-28T10:00:00)" },
        allDay: { type: "boolean", description: "All-day event (default false)" },
        location: { type: "string", description: "Location" },
        notes: { type: "string", description: "Notes" },
        org: { type: "string", description: "Org rkey, omit for personal" },
      },
      required: ["title", "start", "end"],
    },
    handler: async (args: {
      title: string; start: string; end: string; allDay?: boolean;
      location?: string; notes?: string; org?: string;
    }) => {
      const vault = requireVault();

      const event: CalEvent = {
        title: args.title,
        start: new Date(args.start).toISOString(),
        end: new Date(args.end).toISOString(),
        allDay: args.allDay ?? false,
        location: args.location,
        notes: args.notes,
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

      const { rkey } = await saveEvent(vault.client, event, dek, keyringRkey);
      const orgName = orgRkey === "personal" ? "Personal" : (state.orgs.find((o) => o.rkey === orgRkey)?.org.name ?? orgRkey);

      // Broadcast notification for org events
      if (orgRkey !== "personal") {
        broadcastNotification(
          vault.client, "cal-event" as NotificationType,
          orgRkey, orgName,
          {
            type: "cal-event",
            orgRkey,
            orgName,
            eventTitle: event.title,
            eventDate: event.start,
            senderHandle: vault.handle,
            createdAt: new Date().toISOString(),
          } as any,
          vault.did, vault.handle,
        ).catch(() => {});
      }

      return {
        content: [{
          type: "text" as const,
          text: `Event created: "${event.title}" [${rkey}]\nCalendar: ${orgName}\n${new Date(event.start).toLocaleString()} – ${new Date(event.end).toLocaleString()}`,
        }],
      };
    },
  },

  "update-event": {
    description: "Update an existing calendar event.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rkey: { type: "string", description: "Event rkey to update" },
        title: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        allDay: { type: "boolean" },
        location: { type: "string" },
        notes: { type: "string" },
      },
      required: ["rkey"],
    },
    handler: async (args: {
      rkey: string; title?: string; start?: string; end?: string;
      allDay?: boolean; location?: string; notes?: string;
    }) => {
      const vault = requireVault();
      const events = await loadAllEvents();
      const existing = events.find((e) => e.rkey === args.rkey);
      if (!existing) throw new Error(`Event not found: ${args.rkey}`);
      if (existing.authorDid !== vault.did) throw new Error("Cannot edit another member's event");

      const updated: CalEvent = {
        ...existing.event,
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.start !== undefined ? { start: new Date(args.start).toISOString() } : {}),
        ...(args.end !== undefined ? { end: new Date(args.end).toISOString() } : {}),
        ...(args.allDay !== undefined ? { allDay: args.allDay } : {}),
        ...(args.location !== undefined ? { location: args.location } : {}),
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
      };

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

      const { rkey: newRkey } = await updateEvent(vault.client, args.rkey, updated, dek, keyringRkey);

      return {
        content: [{
          type: "text" as const,
          text: `Event updated: "${updated.title}" [${newRkey}]`,
        }],
      };
    },
  },

  "delete-event": {
    description: "Delete a calendar event.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rkey: { type: "string", description: "Event rkey to delete" },
      },
      required: ["rkey"],
    },
    handler: async (args: { rkey: string }) => {
      const vault = requireVault();
      const events = await loadAllEvents();
      const existing = events.find((e) => e.rkey === args.rkey);
      if (!existing) throw new Error(`Event not found: ${args.rkey}`);
      if (existing.authorDid !== vault.did) throw new Error("Cannot delete another member's event");

      await deleteEvent(vault.client, args.rkey);

      return {
        content: [{
          type: "text" as const,
          text: `Event deleted: "${existing.event.title}" [${args.rkey}]`,
        }],
      };
    },
  },

  "upcoming-events": {
    description: "Show upcoming events for the next N days. Great for daily/weekly briefings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "Number of days ahead to look (default 7)" },
        org: { type: "string", description: "Filter by org rkey or 'personal'" },
      },
    },
    handler: async (args: { days?: number; org?: string }) => {
      const vault = requireVault();
      const days = args.days ?? 7;
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() + days);

      let events = await loadAllEvents();

      if (args.org === "personal") {
        events = events.filter((e) => e.orgRkey === "personal");
      } else if (args.org) {
        events = events.filter((e) => e.orgRkey === args.org);
      }

      const upcoming = events.filter((e) => {
        const start = new Date(e.event.start);
        const end = new Date(e.event.end);
        return end >= now && start <= cutoff;
      });

      upcoming.sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime());

      if (upcoming.length === 0) {
        return { content: [{ type: "text" as const, text: `No events in the next ${days} day(s).` }] };
      }

      // Group by date
      const grouped = new Map<string, string[]>();
      for (const e of upcoming) {
        const dateKey = new Date(e.event.start).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        const existing = grouped.get(dateKey) ?? [];
        existing.push(formatEventLine(e, vault));
        grouped.set(dateKey, existing);
      }

      const sections = Array.from(grouped.entries()).map(
        ([date, lines]) => `${date}:\n${lines.join("\n")}`
      );

      return {
        content: [{
          type: "text" as const,
          text: `Upcoming events (next ${days} days):\n\n${sections.join("\n\n")}`,
        }],
      };
    },
  },
};
