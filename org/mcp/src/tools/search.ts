/**
 * Unified search tool — searches across deals, tasks, contacts, events,
 * threads, and channels in a single query.
 */

import { PdsClient } from "../../../src/pds";
import { unsealRecord } from "../../../src/crypto";
import { SEALED_COLLECTION } from "../../../src/crm/context";
import type { Deal } from "../../../src/crm/types";
import type { CalEvent } from "../../../src/cal/types";
import type { OrgContext } from "../../../src/crm/types";
import {
  loadChannels,
  loadThreadsForChannel,
} from "../../../src/wave/context";
import type { WaveOrgContext } from "../../../src/wave/types";
import { state, requireVault } from "../state";

interface SearchResult {
  type: string;
  rkey: string;
  title: string;
  detail: string;
  orgRkey: string;
  createdAt?: string;
}

const DEAL_INNER = "com.minomobi.crm.deal";
const TASK_INNER = "com.minomobi.pm.task";
const CONTACT_INNER = "com.minomobi.crm.contact";
const EVENT_INNER = "com.minomobi.cal.event";

export const searchTools = {
  "search": {
    description:
      "Search across all data: deals, tasks, contacts, events, threads, channels. " +
      "Returns matching results ranked by relevance.",
    handler: async (args: { query: string; org?: string; types?: string[]; maxResults?: number }) => {
      const vault = requireVault();
      const q = args.query.toLowerCase();
      const max = args.maxResults ?? 30;
      const results: SearchResult[] = [];

      const typeFilter = args.types ? new Set(args.types) : null;
      const orgName = (rkey: string) => {
        if (rkey === "personal") return "Personal";
        return state.orgs.find((o) => o.rkey === rkey)?.org.name ?? rkey;
      };

      // Search sealed records (deals, tasks, contacts, events)
      const searchSealed = async (did: string, deks: Map<string, CryptoKey>, orgRkey: string, useAuth: boolean) => {
        let cursor: string | undefined;
        do {
          const page = useAuth
            ? await vault.client.listRecords(SEALED_COLLECTION, 100, cursor)
            : await vault.client.listRecordsFrom(did, SEALED_COLLECTION, 100, cursor);
          for (const rec of page.records) {
            const val = (rec as Record<string, unknown>).value as Record<string, unknown>;
            const recKeyring = val.keyringRkey as string;

            // Filter by org
            if (args.org === "personal" && recKeyring !== "self") continue;
            if (args.org && args.org !== "personal" && !recKeyring.startsWith(args.org + ":")) continue;
            if (!args.org && orgRkey !== "personal" && !recKeyring.startsWith(orgRkey + ":")) continue;

            const dek = deks.get(recKeyring);
            if (!dek) continue;
            const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;

            try {
              const { innerType, record: raw } = await unsealRecord<Record<string, unknown>>(val, dek);
              if (innerType === DEAL_INNER && (!typeFilter || typeFilter.has("deal"))) {
                const record = raw as unknown as Deal;
                const searchable = `${record.title} ${record.notes ?? ""} ${record.contact ?? ""}`.toLowerCase();
                if (searchable.includes(q)) {
                  results.push({
                    type: "deal", rkey, title: record.title,
                    detail: `${record.stage} | $${((record.value ?? 0) / 100).toFixed(2)}`,
                    orgRkey, createdAt: record.createdAt,
                  });
                }
              } else if (innerType === TASK_INNER && (!typeFilter || typeFilter.has("task"))) {
                const record = raw as unknown as { title: string; description?: string; status: string; tags?: string[]; createdAt: string };
                const searchable = `${record.title} ${record.description ?? ""} ${record.tags?.join(" ") ?? ""}`.toLowerCase();
                if (searchable.includes(q)) {
                  results.push({
                    type: "task", rkey, title: record.title,
                    detail: record.status, orgRkey, createdAt: record.createdAt,
                  });
                }
              } else if (innerType === CONTACT_INNER && (!typeFilter || typeFilter.has("contact"))) {
                const record = raw as unknown as { name: string; company?: string; email?: string; notes?: string; createdAt: string };
                const searchable = `${record.name} ${record.company ?? ""} ${record.email ?? ""} ${record.notes ?? ""}`.toLowerCase();
                if (searchable.includes(q)) {
                  results.push({
                    type: "contact", rkey, title: record.name,
                    detail: [record.company, record.email].filter(Boolean).join(" | "),
                    orgRkey, createdAt: record.createdAt,
                  });
                }
              } else if (innerType === EVENT_INNER && (!typeFilter || typeFilter.has("event"))) {
                const record = raw as unknown as CalEvent;
                const searchable = `${record.title} ${record.location ?? ""} ${record.notes ?? ""}`.toLowerCase();
                if (searchable.includes(q)) {
                  results.push({
                    type: "event", rkey, title: record.title,
                    detail: `${new Date(record.start).toLocaleDateString()}${record.location ? ` | ${record.location}` : ""}`,
                    orgRkey, createdAt: record.createdAt,
                  });
                }
              }
            } catch { /* can't decrypt */ }
          }
          cursor = page.cursor;
        } while (cursor);
      };

      // Search personal vault
      const personalDeks = new Map<string, CryptoKey>();
      personalDeks.set("self", vault.dek);
      await searchSealed(vault.did, personalDeks, "personal", true);

      // Search org vaults
      for (const [orgRkey, ctx] of state.orgContexts) {
        if (args.org && args.org !== orgRkey && args.org !== "personal") continue;

        const deks = new Map(ctx.keyringDeks);
        await searchSealed(vault.did, deks, orgRkey, true);
        for (const m of ctx.memberships) {
          if (m.membership.memberDid === vault.did) continue;
          try { await searchSealed(m.membership.memberDid, deks, orgRkey, false); } catch { /* PDS unreachable */ }
        }

        // Search Wave channels and threads
        if (!typeFilter || typeFilter.has("thread") || typeFilter.has("channel")) {
          try {
            const waveCtx = ctx as unknown as WaveOrgContext;
            const channels = await loadChannels(vault.client, waveCtx, vault.did);
            for (const ch of channels) {
              if ((!typeFilter || typeFilter.has("channel")) && ch.channel.name.toLowerCase().includes(q)) {
                results.push({
                  type: "channel", rkey: ch.rkey, title: `#${ch.channel.name}`,
                  detail: `tier: ${ch.channel.tierName}`, orgRkey, createdAt: ch.channel.createdAt,
                });
              }
              if (!typeFilter || typeFilter.has("thread")) {
                const channelUri = `at://${waveCtx.founderDid}/${SEALED_COLLECTION}/${ch.rkey}`;
                const threads = await loadThreadsForChannel(vault.client, waveCtx, channelUri, vault.did);
                for (const t of threads) {
                  const searchable = `${t.thread.title ?? ""} ${ch.channel.name}`.toLowerCase();
                  if (searchable.includes(q)) {
                    results.push({
                      type: "thread", rkey: t.rkey,
                      title: t.thread.title ?? `(${t.thread.threadType})`,
                      detail: `in #${ch.channel.name} | ${t.thread.threadType}`,
                      orgRkey, createdAt: t.thread.createdAt,
                    });
                  }
                }
              }
            }
          } catch { /* wave unavailable */ }
        }
      }

      // Sort by recency
      results.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      const trimmed = results.slice(0, max);

      if (trimmed.length === 0) {
        return { content: [{ type: "text" as const, text: `No results for "${args.query}".` }] };
      }

      const lines = trimmed.map((r) =>
        `- [${r.type}] [${r.rkey}] "${r.title}" | ${r.detail} | ${orgName(r.orgRkey)}`
      );

      // Group count by type
      const counts: Record<string, number> = {};
      trimmed.forEach((r) => { counts[r.type] = (counts[r.type] ?? 0) + 1; });
      const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}(s)`).join(", ");

      return {
        content: [{
          type: "text" as const,
          text: `${trimmed.length} result(s) for "${args.query}" (${summary})${results.length > max ? ` — showing first ${max} of ${results.length}` : ""}\n\n${lines.join("\n")}`,
        }],
      };
    },
  },
};
