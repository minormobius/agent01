/**
 * Shared server state — holds the active vault session and org contexts.
 * Populated by vault-unlock, consumed by all other tools.
 */

import type { PdsClient } from "../../src/pds";
import type { OrgContext, OrgRecord, MembershipRecord } from "../../src/crm/types";

export interface VaultSession {
  client: PdsClient;
  dek: CryptoKey;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  did: string;
  handle: string;
}

export interface ServerState {
  vault: VaultSession | null;
  orgContexts: Map<string, OrgContext>;
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
}

export const state: ServerState = {
  vault: null,
  orgContexts: new Map(),
  orgs: [],
  memberships: [],
};

export function requireVault(): VaultSession {
  if (!state.vault) throw new Error("Vault not unlocked. Call vault-unlock first.");
  return state.vault;
}
