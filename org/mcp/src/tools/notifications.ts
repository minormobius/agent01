/**
 * Notification tools — list, dismiss, preferences, send.
 */

import {
  loadDismissedNotifications,
  discoverPendingInvites,
  loadNotificationPreferences,
  saveNotificationPreferences,
  broadcastNotification,
  publishNotification,
} from "../../../src/crm/context";
import type { NotificationType, NotificationPreferences } from "../../../src/types";
import { NOTIFICATION_TYPE_LABELS } from "../../../src/types";
import { state, requireVault } from "../state";

export const notificationTools = {
  "list-notifications": {
    description:
      "List pending notifications (org invites discovered from known founders). " +
      "Shows invites you haven't accepted or dismissed yet.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: async () => {
      const vault = requireVault();

      const existingOrgRkeys = new Set(state.orgs.map((o) => o.rkey));
      const dismissed = await loadDismissedNotifications(vault.client);

      const knownFounderDids = new Set<string>();
      for (const m of state.memberships) {
        if (m.membership.orgFounderDid && m.membership.orgFounderDid !== vault.did) {
          knownFounderDids.add(m.membership.orgFounderDid);
        }
      }

      const pending = await discoverPendingInvites(
        vault.client, vault.did, Array.from(knownFounderDids), existingOrgRkeys, dismissed,
      );

      if (pending.length === 0) {
        return { content: [{ type: "text" as const, text: "No pending notifications." }] };
      }

      const lines = pending.map((n) => {
        const notif = n.notification;
        if (notif.type === "org-invite") {
          return `- [${n.rkey}] Org invite: "${notif.orgName}" (tier: ${notif.tierName})${notif.invitedByHandle ? ` from @${notif.invitedByHandle}` : ""}`;
        }
        return `- [${n.rkey}] ${notif.type}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${pending.length} pending notification(s):\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "dismiss-notification": {
    description: "Dismiss a notification by its key so it won't appear again.",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Notification key (e.g. invite:did:...:orgRkey)" },
      },
      required: ["key"],
    },
    handler: async (args: { key: string }) => {
      const vault = requireVault();
      const rkey = args.key.replace(/[^a-zA-Z0-9.:_-]/g, "_");
      await vault.client.putRecord("com.minomobi.vault.notificationDismissal", rkey, {
        $type: "com.minomobi.vault.notificationDismissal",
        notificationKey: args.key,
        dismissedAt: new Date().toISOString(),
      });
      return { content: [{ type: "text" as const, text: `Notification dismissed: ${args.key}` }] };
    },
  },

  "notification-preferences": {
    description:
      "View or update notification preferences. " +
      "Without arguments, shows current settings. With arguments, enables/disables specific types.",
    inputSchema: {
      type: "object" as const,
      properties: {
        enable: {
          type: "array",
          items: { type: "string" },
          description: "Notification types to enable (e.g. wave-message, deal-created)",
        },
        disable: {
          type: "array",
          items: { type: "string" },
          description: "Notification types to disable",
        },
      },
    },
    handler: async (args: { enable?: string[]; disable?: string[] }) => {
      const vault = requireVault();
      let prefs = await loadNotificationPreferences(vault.client);

      if (!args.enable && !args.disable) {
        // View mode
        const types = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];
        const lines = types.map((t) => {
          const enabled = prefs?.enabled[t] ?? true;
          return `  ${enabled ? "[x]" : "[ ]"} ${NOTIFICATION_TYPE_LABELS[t]} (${t})`;
        });
        return {
          content: [{
            type: "text" as const,
            text: `Notification preferences:\n\n${lines.join("\n")}\n\nUnchecked types are disabled. Use enable/disable arrays to change.`,
          }],
        };
      }

      // Update mode
      const enabled = { ...(prefs?.enabled ?? {}) };
      for (const t of (args.enable ?? [])) {
        enabled[t as NotificationType] = true;
      }
      for (const t of (args.disable ?? [])) {
        enabled[t as NotificationType] = false;
      }

      const updated: NotificationPreferences = {
        $type: "com.minomobi.vault.notificationPrefs",
        enabled,
        orgOverrides: prefs?.orgOverrides,
        updatedAt: new Date().toISOString(),
      };
      await saveNotificationPreferences(vault.client, updated);

      const types = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];
      const lines = types.map((t) => {
        const on = updated.enabled[t] ?? true;
        return `  ${on ? "[x]" : "[ ]"} ${NOTIFICATION_TYPE_LABELS[t]} (${t})`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `Preferences updated:\n\n${lines.join("\n")}`,
        }],
      };
    },
  },

  "send-notification": {
    description:
      "Send a notification to a specific user or broadcast to the entire org. " +
      "Used for org invites, announcements, or custom notifications.",
    inputSchema: {
      type: "object" as const,
      properties: {
        org: { type: "string", description: "Org rkey" },
        type: {
          type: "string",
          description: "Notification type (e.g. org-invite, wave-message, deal-created)",
        },
        targetDid: {
          type: "string",
          description: "Target user DID, or omit to broadcast to entire org",
        },
        message: { type: "string", description: "Notification message/summary" },
      },
      required: ["org", "type", "message"],
    },
    handler: async (args: { org: string; type: string; targetDid?: string; message: string }) => {
      const vault = requireVault();
      const org = state.orgs.find((o) => o.rkey === args.org);
      if (!org) throw new Error(`Org not found: ${args.org}`);

      const payload = {
        type: args.type,
        orgRkey: args.org,
        orgName: org.org.name,
        summary: args.message,
        senderHandle: vault.handle,
        createdAt: new Date().toISOString(),
      };

      const orgCtx = state.orgContexts.get(args.org);

      if (args.targetDid) {
        await publishNotification(
          vault.client, args.targetDid, args.type as NotificationType,
          args.org, org.org.name, payload as any,
          vault.did, vault.handle,
          undefined, orgCtx,
        );
        return {
          content: [{
            type: "text" as const,
            text: `Notification sent to ${args.targetDid}: [${args.type}] ${args.message}`,
          }],
        };
      } else {
        await broadcastNotification(
          vault.client, args.type as NotificationType,
          args.org, org.org.name, payload as any,
          vault.did, vault.handle,
          undefined, orgCtx,
        );
        return {
          content: [{
            type: "text" as const,
            text: `Notification broadcast to ${org.org.name}: [${args.type}] ${args.message}`,
          }],
        };
      }
    },
  },
};
