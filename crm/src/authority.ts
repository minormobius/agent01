/**
 * Authority resolver — checks whether a DID can perform a structural action on an org.
 *
 * Enforcement is protocol-level, not cryptographic:
 *   - The client checks authority before attempting actions
 *   - Denied actions produce clear errors with recovery hints
 *   - The founder's PDS is ground truth — the client avoids writes that would be invalid
 *
 * Resolution order:
 *   1. Founder implicit authority (backward compat — founders can do everything)
 *   2. Direct DID grants in org relationships
 *   3. Org-tier grants (any member of a granted tier holds the authority)
 *
 * If no relationships exist, the founder has full authority and nobody else does.
 * This is the zero-migration path — existing orgs work unchanged.
 */

import type {
  Authority,
  OrgRelationshipRecord,
  MembershipRecord,
} from "./types";

/** Result of an authority check — either granted (with provenance) or denied (with recovery). */
export type AuthorityResult =
  | { granted: true; source: AuthoritySource }
  | { granted: false; denial: AuthorityDenial };

/** How authority was resolved when granted. */
export interface AuthoritySource {
  type: "founder" | "direct_grant" | "tier_grant";
  /** Which relationship record provided the grant (absent for founder implicit). */
  relationshipRkey?: string;
  /** For tier grants: which tier matched. */
  tierName?: string;
}

/** Why authority was denied and how to fix it. */
export interface AuthorityDenial {
  authority: Authority;
  orgName: string;
  /** Who currently holds this authority (for the user to contact). */
  holders: string[];
  /** Human-readable recovery hint. */
  hint: string;
}

const AUTHORITY_DESCRIPTIONS: Record<Authority, string> = {
  manage_members: "invite or remove members",
  manage_tiers: "modify the tier structure",
  manage_workflow: "change workflow gates",
  manage_bridges: "create or revoke tier bridges",
  rotate_keys: "trigger key rotation",
  dissolve: "dissolve the organization",
};

/**
 * Check whether a DID has a specific authority over an org.
 *
 * @param did - The DID attempting the action
 * @param authority - The authority being checked
 * @param founderDid - The org's founder DID
 * @param orgRkey - The org's rkey
 * @param orgName - The org's display name (for error messages)
 * @param relationships - All relationships involving this org
 * @param memberships - All memberships in this org (for tier-based grants)
 */
export function checkAuthority(
  did: string,
  authority: Authority,
  founderDid: string,
  orgRkey: string,
  orgName: string,
  relationships: OrgRelationshipRecord[],
  memberships: MembershipRecord[]
): AuthorityResult {
  // 1. Founder always has implicit full authority
  if (did === founderDid) {
    return { granted: true, source: { type: "founder" } };
  }

  // 2. Check direct DID grants
  for (const rel of relationships) {
    // Only check relationships where this org is the child (being governed)
    const isChild =
      rel.relationship.childRef.orgRkey === orgRkey &&
      rel.relationship.childRef.did === founderDid;
    if (!isChild) continue;

    for (const grant of rel.relationship.authorities) {
      if (grant.authority !== authority) continue;

      if (grant.holder.type === "did" && grant.holder.did === did) {
        return {
          granted: true,
          source: {
            type: "direct_grant",
            relationshipRkey: rel.rkey,
          },
        };
      }

      // 3. Check org-tier grants
      if (grant.holder.type === "org_tier") {
        const holder = grant.holder;
        const match = memberships.find(
          (m) =>
            m.membership.memberDid === did &&
            m.membership.orgRkey === holder.orgRkey &&
            m.membership.tierName === holder.tierName
        );
        if (match) {
          return {
            granted: true,
            source: {
              type: "tier_grant",
              relationshipRkey: rel.rkey,
              tierName: holder.tierName,
            },
          };
        }
      }
    }
  }

  // Denied — build recovery hint
  const holders = collectHolders(authority, founderDid, orgRkey, relationships);
  return {
    granted: false,
    denial: {
      authority,
      orgName,
      holders,
      hint: buildDenialHint(authority, orgName, holders),
    },
  };
}

/**
 * Check multiple authorities at once. Returns the first denial, or all granted sources.
 */
export function checkAuthorities(
  did: string,
  authorities: Authority[],
  founderDid: string,
  orgRkey: string,
  orgName: string,
  relationships: OrgRelationshipRecord[],
  memberships: MembershipRecord[]
): { allGranted: boolean; results: Map<Authority, AuthorityResult> } {
  const results = new Map<Authority, AuthorityResult>();
  let allGranted = true;
  for (const auth of authorities) {
    const result = checkAuthority(
      did, auth, founderDid, orgRkey, orgName, relationships, memberships
    );
    results.set(auth, result);
    if (!result.granted) allGranted = false;
  }
  return { allGranted, results };
}

/**
 * Collect DIDs that hold a given authority (for recovery hints).
 */
function collectHolders(
  authority: Authority,
  founderDid: string,
  orgRkey: string,
  relationships: OrgRelationshipRecord[]
): string[] {
  const holders: string[] = [founderDid]; // founder always holds everything

  for (const rel of relationships) {
    const isChild =
      rel.relationship.childRef.orgRkey === orgRkey &&
      rel.relationship.childRef.did === founderDid;
    if (!isChild) continue;

    for (const grant of rel.relationship.authorities) {
      if (grant.authority !== authority) continue;
      if (grant.holder.type === "did" && !holders.includes(grant.holder.did)) {
        holders.push(grant.holder.did);
      }
      if (grant.holder.type === "org_tier") {
        // Can't resolve tier members here without more context,
        // but we can indicate the tier
        holders.push(`${grant.holder.tierName} tier of org:${grant.holder.orgRkey.slice(0, 8)}...`);
      }
    }
  }

  return holders;
}

/**
 * Build a human-readable denial message with recovery path.
 */
function buildDenialHint(
  authority: Authority,
  orgName: string,
  holders: string[]
): string {
  const action = AUTHORITY_DESCRIPTIONS[authority];
  const holderList = holders.length === 1
    ? truncateDid(holders[0])
    : holders.map(truncateDid).join(", ");

  return `You don't have permission to ${action} in "${orgName}". ` +
    `This authority is held by: ${holderList}. ` +
    `Ask them to grant you "${authority}" via the Relationships tab, ` +
    `or ask the org founder to perform the action directly.`;
}

function truncateDid(did: string): string {
  if (did.startsWith("did:")) return did.slice(0, 20) + "...";
  return did;
}

/**
 * Log an authority violation for audit trail.
 * In a production system this would write to a log collection on the user's PDS.
 * For now, console.warn with structured data.
 */
export function logAuthorityViolation(
  did: string,
  authority: Authority,
  orgRkey: string,
  denial: AuthorityDenial
): void {
  console.warn("[authority-violation]", {
    timestamp: new Date().toISOString(),
    attemptedBy: did,
    authority,
    orgRkey,
    holders: denial.holders,
    hint: denial.hint,
  });
}
