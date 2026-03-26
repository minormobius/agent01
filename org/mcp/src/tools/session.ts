/**
 * Session tools — vault-unlock, vault-lock, vault-status.
 */

import { PdsClient, resolvePds } from "../../../src/pds";
import {
  deriveKek,
  unwrapPrivateKey,
  importPublicKey,
  deriveDek,
  fromBase64,
} from "../../../src/crypto";
import {
  discoverOrgs,
  buildOrgContext,
} from "../../../src/crm/context";
import { state } from "../state";
import type { OrgContext } from "../../../src/crm/types";

const VAULT_COLLECTION = "com.minomobi.vault.config";
const VAULT_RKEY = "self";

export const sessionTools = {
  "vault-unlock": {
    description:
      "Unlock the encrypted vault with ATProto credentials. Must be called before any other tool. " +
      "Uses handle + app password to authenticate, then derives encryption keys from the vault passphrase.",
    inputSchema: {
      type: "object" as const,
      properties: {
        handle: { type: "string", description: "Bluesky handle (e.g. user.bsky.social)" },
        appPassword: { type: "string", description: "Bluesky app password" },
        passphrase: { type: "string", description: "Vault encryption passphrase" },
      },
      required: ["handle", "appPassword", "passphrase"],
    },
    handler: async (args: { handle: string; appPassword: string; passphrase: string }) => {
      // 1. Resolve PDS and authenticate
      const service = await resolvePds(
        args.handle.startsWith("did:") ? args.handle : await resolveDid(args.handle)
      );
      const client = new PdsClient(service);
      const session = await client.login(args.handle, args.appPassword);

      // 2. Fetch vault config from PDS
      const configRec = await client.getRecord(VAULT_COLLECTION, VAULT_RKEY);
      if (!configRec) throw new Error("No vault config found. Set up vault in the browser first.");

      const config = (configRec as Record<string, unknown>).value as Record<string, unknown>;
      const saltB64 = extractBytes(config.salt);
      const wrappedKeyB64 = extractBytes(config.wrappedPrivateKey);
      const publicKeyB64 = extractBytes(config.publicKey);

      // 3. Derive KEK and unwrap identity key
      const salt = fromBase64(saltB64);
      const kek = await deriveKek(args.passphrase, salt);
      const privateKey = await unwrapPrivateKey(fromBase64(wrappedKeyB64), kek);
      const publicKey = await importPublicKey(fromBase64(publicKeyB64));

      // 4. Derive personal DEK
      const dek = await deriveDek(privateKey, publicKey);

      // 5. Store in state
      state.vault = {
        client,
        dek,
        privateKey,
        publicKey,
        did: session.did,
        handle: session.handle,
      };

      // 6. Discover orgs and build contexts
      const { foundedOrgs, joinedOrgs, allMemberships } = await discoverOrgs(client);
      state.memberships = allMemberships;
      state.orgs = [...foundedOrgs, ...joinedOrgs.map((j) => j.org)];
      state.orgContexts = new Map();

      for (const org of foundedOrgs) {
        const myM = allMemberships.find(
          (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === session.did
        );
        if (!myM) continue;
        try {
          const ctx = await buildOrgContext(
            client, client.getService(), org, myM, allMemberships, privateKey, session.did
          );
          state.orgContexts.set(org.rkey, ctx);
        } catch (err) {
          // Log but continue
        }
      }

      for (const { org, founderService } of joinedOrgs) {
        const myM = allMemberships.find(
          (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === session.did
        );
        if (!myM) continue;
        try {
          const ctx = await buildOrgContext(
            client, founderService, org, myM, allMemberships, privateKey, session.did
          );
          state.orgContexts.set(org.rkey, ctx);
        } catch (err) {
          // Log but continue
        }
      }

      const orgSummary = state.orgs.map((o) => {
        const ctx = state.orgContexts.get(o.rkey);
        return `  - ${o.org.name} (${o.rkey}) [${ctx ? `tier: ${ctx.myTierName}, ${ctx.memberships.length} members` : "no context"}]`;
      }).join("\n");

      return {
        content: [{
          type: "text" as const,
          text: `Vault unlocked for @${session.handle} (${session.did})\n\nOrgs (${state.orgs.length}):\n${orgSummary || "  (none)"}`,
        }],
      };
    },
  },

  "vault-lock": {
    description: "Lock the vault, clearing all keys and session data from memory.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: async () => {
      state.vault = null;
      state.orgContexts = new Map();
      state.orgs = [];
      state.memberships = [];
      return { content: [{ type: "text" as const, text: "Vault locked. All keys cleared from memory." }] };
    },
  },

  "vault-status": {
    description: "Check if the vault is unlocked and show session info.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: async () => {
      if (!state.vault) {
        return { content: [{ type: "text" as const, text: "Vault is locked. Call vault-unlock to authenticate." }] };
      }
      const orgList = state.orgs.map((o) => `  - ${o.org.name} (${o.rkey})`).join("\n");
      return {
        content: [{
          type: "text" as const,
          text: `Vault unlocked\nHandle: @${state.vault.handle}\nDID: ${state.vault.did}\nOrgs (${state.orgs.length}):\n${orgList || "  (none)"}`,
        }],
      };
    },
  },
};

/** Extract base64 from a field that may be a string or ATProto $bytes object */
function extractBytes(field: unknown): string {
  if (typeof field === "string") return field;
  if (field && typeof field === "object" && "$bytes" in (field as Record<string, unknown>)) {
    return (field as { $bytes: string }).$bytes;
  }
  throw new Error("Expected string or { $bytes } field");
}

/** Resolve a handle to a DID via public API */
async function resolveDid(handle: string): Promise<string> {
  handle = handle.replace(/^@/, "").trim();
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: @${handle}`);
  const { did } = (await res.json()) as { did: string };
  return did;
}
