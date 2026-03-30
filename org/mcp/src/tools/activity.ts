/**
 * Activity feed tool — aggregates recent activity across all data types.
 * Gives an agent a "what happened while I was away" view.
 */

import { PdsClient } from "../../../src/pds";
import { unsealRecord } from "../../../src/crypto";
import {
  SEALED_COLLECTION,
} from "../../../src/crm/context";
import type { Deal } from "../../../src/crm/types";
import type { CalEvent } from "../../../src/cal/types";
import type { OrgContext } from "../../../src/crm/types";
import { state, requireVault } from "../state";

interface ActivityItem {
  type: string;
  title: string;
  detail: string;
  orgRkey: string;
  authorDid: string;
  createdAt: string;
}

const DEAL_INNER = "com.minomobi.crm.deal";
const TASK_INNER = "com.minomobi.pm.task";
const CONTACT_INNER = "com.minomobi.crm.contact";
const EVENT_INNER = "com.minomobi.cal.event";
const NOTIFICATION_INNER = "com.minomobi.vault.notification";

export const activityTools = {
  "activity-feed": {
    description:
      "Show recent activity across the org for the last N hours. " +
      "Aggregates new deals, tasks, events, contacts, notifications, and decisions. " +
      "Perfect for catch-up briefings.",
    handler: async (args: { hours?: number; org?: string; maxResults?: number }) => {
      const vault = requireVault();
      const hours = args.hours ?? 24;
      const max = args.maxResults ?? 50;
      const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
      const items: ActivityItem[] = [];

      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        return state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;
      };

      const authorLabel = (did: string) => did === vault.did ? "you" : did;

      // Scan sealed records (deals, tasks, contacts, events)
      const scanSealed = async (did: string, deks: Map<string, CryptoKey>, orgRkey: string, useAuth: boolean) => {
        let cursor: string | undefined;
        do {
          const page = useAuth
            ? await vault.client.listRecords(SEALED_COLLECTION, 100, cursor)
            : await vault.client.listRecordsFrom(did, SEALED_COLLECTION, 100, cursor);
          for (const rec of page.records) {
            const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
            const recKeyring = val.keyringRkey as string;

            if (args.org === "personal" && recKeyring !== "self") continue;
            if (args.org && args.org !== "personal" && !recKeyring.startsWith(args.org + ":")) continue;
            if (!args.org && orgRkey !== "personal" && !recKeyring.startsWith(orgRkey + ":")) continue;

            // Check created date from envelope
            const envCreated = val.createdAt as string | undefined;
            if (envCreated && envCreated < cutoff) continue;

            const dek = deks.get(recKeyring);
            if (!dek) continue;

            try {
              const { innerType, record: raw } = await unsealRecord<Record<string, unknown>>(val, dek);
              if (innerType === DEAL_INNER) {
                const record = raw as unknown as Deal;
                if (record.createdAt >= cutoff) {
                  items.push({
                    type: "deal", title: record.title,
                    detail: `${record.stage} | $${((record.value ?? 0) / 100).toFixed(2)}`,
                    orgRkey, authorDid: did, createdAt: record.createdAt,
                  });
                }
              } else if (innerType === TASK_INNER) {
                const record = raw as unknown as { title: string; status: string; createdAt: string; updatedAt?: string };
                const ts = record.updatedAt ?? record.createdAt;
                if (ts >= cutoff) {
                  items.push({
                    type: "task", title: record.title, detail: record.status,
                    orgRkey, authorDid: did, createdAt: ts,
                  });
                }
              } else if (innerType === CONTACT_INNER) {
                const record = raw as unknown as { name: string; company?: string; createdAt: string };
                if (record.createdAt >= cutoff) {
                  items.push({
                    type: "contact", title: record.name, detail: record.company ?? "",
                    orgRkey, authorDid: did, createdAt: record.createdAt,
                  });
                }
              } else if (innerType === EVENT_INNER) {
                const record = raw as unknown as CalEvent;
                if (record.createdAt >= cutoff) {
                  items.push({
                    type: "event", title: record.title,
                    detail: new Date(record.start).toLocaleDateString(),
                    orgRkey, authorDid: did, createdAt: record.createdAt,
                  });
                }
              } else if (innerType === NOTIFICATION_INNER) {
                const createdAt = raw.createdAt as string;
                if (createdAt >= cutoff) {
                  if (args.org && raw.orgRkey !== args.org) continue;
                  items.push({
                    type: "notification",
                    title: (raw.notificationType as string) ?? "notification",
                    detail: (raw.orgName as string) ?? "",
                    orgRkey: (raw.orgRkey as string) ?? orgRkey,
                    authorDid: (raw.senderDid as string) ?? did,
                    createdAt,
                  });
                }
              }
            } catch { /* can't decrypt */ }
          }
          cursor = page.cursor;
        } while (cursor);
      };

      // Personal vault
      const personalDeks = new Map<string, CryptoKey>();
      personalDeks.set("self", vault.dek);
      await scanSealed(vault.did, personalDeks, "personal", true);

      // Org vaults
      for (const [orgRkey, ctx] of state.orgContexts) {
        if (args.org && args.org !== orgRkey && args.org !== "personal") continue;
        const deks = new Map(ctx.keyringDeks);
        await scanSealed(vault.did, deks, orgRkey, true);
        for (const m of ctx.memberships) {
          if (m.membership.memberDid === vault.did) continue;
          try { await scanSealed(m.membership.memberDid, deks, orgRkey, false); } catch { /* PDS unreachable */ }
        }
      }

      // Sort by most recent
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const trimmed = items.slice(0, max);

      if (trimmed.length === 0) {
        return { content: [{ type: "text" as const, text: `No activity in the last ${hours} hour(s).` }] };
      }

      const lines = trimmed.map((item) => {
        const time = new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const date = new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
        const who = authorLabel(item.authorDid);
        return `- ${date} ${time} | [${item.type}] "${item.title}" ${item.detail ? `| ${item.detail} ` : ""}| ${orgName(item.orgRkey)} | by ${who}`;
      });

      // Summary
      const counts: Record<string, number> = {};
      trimmed.forEach((i) => { counts[i.type] = (counts[i.type] ?? 0) + 1; });
      const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}(s)`).join(", ");

      return {
        content: [{
          type: "text" as const,
          text: `Activity (last ${hours}h): ${trimmed.length} item(s) — ${summary}\n\n${lines.join("\n")}`,
        }],
      };
    },
  },
};
