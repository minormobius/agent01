/**
 * Wave tools — channels, threads, messages, docs.
 */

import {
  loadChannels,
  loadThreadsForChannel,
  loadOpsForThread,
  decryptOp,
  sendMessageOp,
  sendDocEditOp,
  createChannelRecord,
  createThreadRecord,
  SEALED_COLLECTION,
} from "../../../src/wave/context";
import { broadcastNotification } from "../../../src/crm/context";
import type { WaveOrgContext } from "../../../src/wave/types";
import type { NotificationType } from "../../../src/types";
import { state, requireVault } from "../state";

function getOrgCtx(orgRkey: string): WaveOrgContext {
  const ctx = state.orgContexts.get(orgRkey);
  if (!ctx) throw new Error(`Org not found or no access: ${orgRkey}`);
  // WaveOrgContext and OrgContext share the same shape from buildOrgContext
  return ctx as unknown as WaveOrgContext;
}

export const waveTools = {
  "list-channels": {
    description:
      "List channels in an org. Shows channel name, tier, and creation date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
      },
      required: ["org"],
    },
    handler: async (args: { org: string }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);
      const channels = await loadChannels(vault.client, ctx, vault.did);

      if (channels.length === 0) {
        return { content: [{ type: "text" as const, text: `No channels in ${ctx.org.org.name}.` }] };
      }

      const lines = channels.map((ch) =>
        `- [${ch.rkey}] #${ch.channel.name} (tier: ${ch.channel.tierName}) — ${new Date(ch.channel.createdAt).toLocaleDateString()}`
      );

      return {
        content: [{
          type: "text" as const,
          text: `${channels.length} channel(s) in ${ctx.org.org.name}:\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "list-threads": {
    description:
      "List threads in a channel. Shows thread title, type (chat/doc), author, and date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        channel: { type: "string", description: "Channel rkey" },
      },
      required: ["org", "channel"],
    },
    handler: async (args: { org: string; channel: string }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);
      const channelUri = `at://${ctx.founderDid}/${SEALED_COLLECTION}/${args.channel}`;
      const threads = await loadThreadsForChannel(vault.client, ctx, channelUri, vault.did);

      if (threads.length === 0) {
        return { content: [{ type: "text" as const, text: "No threads in this channel." }] };
      }

      const lines = threads.map((t) => {
        const typeLabel = t.thread.threadType === "doc" ? "Doc" : "Chat";
        const author = t.authorDid === vault.did ? "you" : (t.authorHandle ?? t.authorDid);
        return `- [${t.rkey}] ${typeLabel}: "${t.thread.title || "(untitled)"}" by ${author} — ${new Date(t.thread.createdAt).toLocaleDateString()}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${threads.length} thread(s):\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "read-thread": {
    description:
      "Read messages or doc edits in a thread. Decrypts and returns the content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        threadAuthorDid: { type: "string", description: "DID of the thread author" },
        threadRkey: { type: "string", description: "Thread rkey" },
        maxResults: { type: "number", description: "Max ops to return (default 50)" },
      },
      required: ["org", "threadAuthorDid", "threadRkey"],
    },
    handler: async (args: { org: string; threadAuthorDid: string; threadRkey: string; maxResults?: number }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);
      const threadUri = `at://${args.threadAuthorDid}/${SEALED_COLLECTION}/${args.threadRkey}`;
      const ops = await loadOpsForThread(vault.client, ctx, threadUri, vault.did);

      const max = args.maxResults ?? 50;
      const recent = ops.slice(-max);

      const lines: string[] = [];
      for (const op of recent) {
        const payload = await decryptOp(op.op, ctx);
        const author = op.authorDid === vault.did ? "you" : (op.authorHandle ?? op.authorDid);
        const time = new Date(op.op.createdAt).toLocaleTimeString();

        if (payload && "text" in payload) {
          if (op.op.opType === "doc_edit") {
            lines.push(`[${time}] ${author} (doc edit): ${payload.text.slice(0, 200)}${payload.text.length > 200 ? "..." : ""}`);
          } else {
            lines.push(`[${time}] ${author}: ${payload.text}`);
          }
        } else {
          lines.push(`[${time}] ${author}: [encrypted — no access]`);
        }
      }

      const totalNote = ops.length > max ? `\n\n(showing last ${max} of ${ops.length} messages)` : "";

      return {
        content: [{
          type: "text" as const,
          text: lines.length > 0
            ? lines.join("\n") + totalNote
            : "No messages in this thread.",
        }],
      };
    },
  },

  "send-message": {
    description:
      "Send an encrypted message to a Wave thread. Broadcasts a notification to the org.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        channel: { type: "string", description: "Channel rkey (for notification context)" },
        channelName: { type: "string", description: "Channel name (for notification)" },
        threadAuthorDid: { type: "string", description: "DID of the thread author" },
        threadRkey: { type: "string", description: "Thread rkey" },
        threadTitle: { type: "string", description: "Thread title (for notification)" },
        text: { type: "string", description: "Message text" },
      },
      required: ["org", "threadAuthorDid", "threadRkey", "text"],
    },
    handler: async (args: {
      org: string; channel?: string; channelName?: string;
      threadAuthorDid: string; threadRkey: string; threadTitle?: string; text: string;
    }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);

      // Find channel tier
      const channels = await loadChannels(vault.client, ctx, vault.did);
      let channelTier = ctx.myTierName;
      let channelName = args.channelName ?? "unknown";
      for (const ch of channels) {
        if (args.channel && ch.rkey === args.channel) {
          channelTier = ch.channel.tierName;
          channelName = ch.channel.name;
          break;
        }
      }

      const result = await sendMessageOp(
        vault.client, ctx, args.threadAuthorDid, args.threadRkey,
        channelTier, args.text, vault.did, vault.handle,
      );

      // Broadcast notification
      broadcastNotification(
        vault.client, "wave-message" as NotificationType,
        args.org, ctx.org.org.name,
        {
          type: "wave-message",
          orgRkey: args.org,
          orgName: ctx.org.org.name,
          channelName,
          threadTitle: args.threadTitle,
          senderHandle: vault.handle,
          preview: args.text.slice(0, 100),
          createdAt: new Date().toISOString(),
        } as any,
        vault.did, vault.handle,
        undefined, ctx,
      ).catch(() => {});

      return {
        content: [{
          type: "text" as const,
          text: `Message sent [${result.rkey}] to thread ${args.threadRkey}`,
        }],
      };
    },
  },

  "create-thread": {
    description:
      "Create a new thread (chat or doc) in a channel. Broadcasts a notification.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        channel: { type: "string", description: "Channel rkey" },
        channelName: { type: "string", description: "Channel name (for notification)" },
        type: { type: "string", enum: ["chat", "doc"], description: "Thread type (default: chat)" },
        title: { type: "string", description: "Thread title" },
      },
      required: ["org", "channel"],
    },
    handler: async (args: {
      org: string; channel: string; channelName?: string;
      type?: string; title?: string;
    }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);
      const threadType = (args.type ?? "chat") as "chat" | "doc";

      const result = await createThreadRecord(
        vault.client, ctx, args.channel, threadType,
        args.title, vault.did, vault.handle,
      );

      const channelName = args.channelName ?? args.channel;
      const notifType = (threadType === "doc" ? "wave-thread" : "wave-thread") as NotificationType;

      broadcastNotification(
        vault.client, notifType,
        args.org, ctx.org.org.name,
        {
          type: "wave-thread",
          orgRkey: args.org,
          orgName: ctx.org.org.name,
          channelName,
          threadTitle: args.title ?? (threadType === "doc" ? "Untitled Doc" : "Chat"),
          threadType,
          senderHandle: vault.handle,
          createdAt: new Date().toISOString(),
        } as any,
        vault.did, vault.handle,
        undefined, ctx,
      ).catch(() => {});

      return {
        content: [{
          type: "text" as const,
          text: `Thread created [${result.rkey}]: ${threadType === "doc" ? "Doc" : "Chat"} "${args.title || "(untitled)"}" in #${channelName}`,
        }],
      };
    },
  },

  "create-channel": {
    description:
      "Create a new channel in an org (founder only). Broadcasts a notification.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        name: { type: "string", description: "Channel name" },
        tier: { type: "string", description: "Tier name for the channel (default: your tier)" },
      },
      required: ["org", "name"],
    },
    handler: async (args: { org: string; name: string; tier?: string }) => {
      const vault = requireVault();
      const ctx = getOrgCtx(args.org);

      if (ctx.founderDid !== vault.did) {
        throw new Error("Only the org founder can create channels");
      }

      const tierName = args.tier ?? ctx.myTierName;
      await createChannelRecord(vault.client, ctx, args.name, tierName);

      broadcastNotification(
        vault.client, "wave-channel" as NotificationType,
        args.org, ctx.org.org.name,
        {
          type: "wave-channel",
          orgRkey: args.org,
          orgName: ctx.org.org.name,
          channelName: args.name,
          senderHandle: vault.handle,
          createdAt: new Date().toISOString(),
        } as any,
        vault.did, vault.handle,
        undefined, ctx,
      ).catch(() => {});

      return {
        content: [{
          type: "text" as const,
          text: `Channel created: #${args.name} (tier: ${tierName}) in ${ctx.org.org.name}`,
        }],
      };
    },
  },
};
