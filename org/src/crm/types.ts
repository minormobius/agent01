/** Deal stages matching the lexicon knownValues */
export const STAGES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed-won",
  "closed-lost",
] as const;

export type Stage = (typeof STAGES)[number];

/** Column display config */
export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  "closed-won": "Won",
  "closed-lost": "Lost",
};

/** Inner record: com.minomobi.crm.deal */
export interface Deal {
  title: string;
  stage: Stage;
  value?: number;
  currency?: string;
  contactRkey?: string;
  companyRkey?: string;
  notes?: string;
  tags?: string[];
  expectedClose?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Deal with its PDS rkey and author info for updates/deletes */
export interface DealRecord {
  rkey: string;
  deal: Deal;
  /** DID of whoever wrote this sealed record */
  authorDid: string;
  /** If this deal superseded a previous version, link back */
  previousDid?: string;
  previousRkey?: string;
  /** Which org this deal belongs to ("personal" for personal vault, org rkey for org deals) */
  orgRkey: string;
}

/** Inner record: com.minomobi.crm.expense */
export interface Expense {
  dealRkey?: string;
  amount: number;         // in cents
  currency: string;
  category: string;
  description?: string;
  date: string;           // YYYY-MM-DD
  vendor?: string;
  createdAt: string;
}

export interface ExpenseRecord {
  rkey: string;
  expense: Expense;
  authorDid: string;
  orgRkey: string;
}

/** Filter state for the unified deals view */
export type OrgFilter = "all" | "personal" | string;

/** vault.sealed envelope as stored on PDS */
export interface SealedEnvelope {
  $type: "com.minomobi.vault.sealed";
  innerType: string;
  keyringRkey: string;
  iv: string;
  ciphertext: string;
  /** If this record supersedes another, link to it */
  previousDid?: string;
  previousRkey?: string;
  createdAt: string;
  updatedAt?: string;
}

/** PDS session from createSession */
export interface Session {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

// --- Org & Tier Types ---

/**
 * A configurable access tier within an org.
 * Higher level = more access (can decrypt all tiers at or below).
 * Tiers are PURE encryption gates — no client-side permission flags.
 * What you can decrypt is what you can read. Period.
 */
export interface TierDef {
  name: string;        // e.g. "operator", "manager", "executive"
  level: number;       // 0 = lowest access, higher = more access
  currentEpoch?: number; // keyring epoch — 0 (or absent) = initial, incremented on rotation
}

/** Default tier presets for quick org creation. */
export const DEFAULT_TIERS: TierDef[] = [
  { name: "member", level: 0 },
  { name: "manager", level: 1 },
  { name: "admin", level: 2 },
];

// --- Office & Workflow Types ---

/** An office/department within an org. Members can be assigned to offices. */
export interface Office {
  name: string;
  description?: string;
  memberDids: string[];           // DIDs of members assigned to this office
  requiredSignatures: number;     // how many members must sign (1 = any one member)
}

/** A workflow stage gate — which offices must approve before a deal can advance. */
export interface WorkflowGate {
  fromStage: Stage;               // deals at this stage...
  toStage: Stage;                 // ...need approval to move here
  requiredOffices: string[];      // office names that must sign off
}

/** Workflow definition attached to an org. */
export interface Workflow {
  gates: WorkflowGate[];
}

// --- Change Control Protocol ---
//
// ATProto: each user writes to their own PDS only.
// Nobody can edit someone else's record.
//
// So edits become a protocol:
//   1. Proposer writes vault.proposal to their PDS (encrypted change)
//   2. Required offices write vault.approval to their PDSes
//   3. Once all approvals gathered, proposer writes the new version
//      to their own PDS as vault.sealed with a `previousDid/previousRkey`
//      link to the old version
//   4. A vault.decision record ties it together for audit
//
// The "current version" of a deal = follow the decision chain from any
// known version until you find one with no successor.

/** A proposed change to an existing record. Written to proposer's PDS. */
export interface Proposal {
  /** Org rkey this proposal belongs to */
  orgRkey: string;
  /** The record being changed */
  targetDid: string;
  targetRkey: string;
  /** Encrypted proposed content (same tier DEK as target) */
  iv: string;          // base64
  ciphertext: string;  // base64
  keyringRkey: string;
  /** What kind of change */
  changeType: "edit" | "stage" | "edit+stage";
  /** Plaintext summary visible to anyone (e.g. "move to Qualified") */
  summary?: string;
  /** Who needs to approve (office names from workflow gates) */
  requiredOffices: string[];
  proposerDid: string;
  proposerHandle?: string;
  status: "open" | "approved" | "applied" | "rejected";
  createdAt: string;
}

export interface ProposalRecord {
  rkey: string;
  proposal: Proposal;
}

/** An approval of a proposal. Written to approver's PDS. */
export interface Approval {
  /** Points to the proposal */
  proposalDid: string;
  proposalRkey: string;
  /** Which office this person is signing for */
  officeName: string;
  approverDid: string;
  approverHandle?: string;
  createdAt: string;
}

export interface ApprovalRecord {
  rkey: string;
  approval: Approval;
}

/** Decision record: links old version → new version. Written by proposer when applied. */
export interface Decision {
  orgRkey: string;
  /** The proposal that led to this decision */
  proposalDid: string;
  proposalRkey: string;
  /** The old record */
  previousDid: string;
  previousRkey: string;
  /** The new record (on proposer's PDS) */
  newDid: string;
  newRkey: string;
  /** Outcome */
  outcome: "accepted" | "rejected";
  createdAt: string;
}

export interface DecisionRecord {
  rkey: string;
  decision: Decision;
}

/** Org definition record (public, stored on founder's PDS). */
export interface Org {
  name: string;
  founderDid: string;
  tiers: TierDef[];
  offices?: Office[];
  workflow?: Workflow;
  createdAt: string;
}

export interface OrgRecord {
  rkey: string;
  org: Org;
}

/** Per-member wrapped DEK entry within a keyring. */
export interface KeyringMemberEntry {
  did: string;
  wrappedDek: string; // base64
}

/**
 * Keyring record: one per tier per org per epoch.
 *
 * Epoch 0 (initial) uses rkey `orgRkey:tierName`.
 * After rotation, epoch N uses rkey `orgRkey:tierName:N`.
 * Old keyrings are frozen — they keep the original member list so
 * remaining members can still decrypt records sealed under that epoch.
 */
export interface Keyring {
  orgRkey: string;
  tierName: string;
  epoch?: number;            // 0 or absent = initial epoch
  writerDid: string;         // DID of whoever wrote the wraps (their pubkey needed to unwrap)
  writerPublicKey: string;   // base64 — recipient needs this for ECDH unwrap
  members: KeyringMemberEntry[];
  rotatedAt?: string;        // ISO timestamp — when this epoch was created (absent for epoch 0)
  reason?: string;           // why this rotation happened (e.g. "member-removal:did:plc:xyz")
}

/** Membership record: links a user to an org with a specific tier. */
export interface Membership {
  orgRkey: string;
  orgService: string;       // PDS service URL of the org founder
  orgFounderDid: string;
  memberDid: string;
  memberHandle?: string;
  tierName: string;
  invitedBy: string;
  createdAt: string;
}

export interface MembershipRecord {
  rkey: string;
  membership: Membership;
}

/** Bookmark for an org the user has joined (not founded). Written to user's own PDS. */
export interface OrgBookmark {
  founderDid: string;
  founderService: string;
  orgRkey: string;
  orgName: string;
  createdAt: string;
}

export interface OrgBookmarkRecord {
  rkey: string;
  bookmark: OrgBookmark;
}

// --- Org Relationship Types ---
//
// Every inter-org pattern (co-founder, acquisition, skunkworks, merger)
// is an OrgRelationship with a set of authority grants and tier bridges.
// Authority can be held by a specific DID or by anyone in an org tier.

/** Structural powers one party can exercise over an org. */
export type Authority =
  | "manage_members"      // can invite/remove members
  | "manage_tiers"        // can add/modify tier structure
  | "manage_workflow"     // can set workflow gates
  | "manage_bridges"      // can create/revoke tier bridges
  | "rotate_keys"         // can trigger key rotation
  | "dissolve";           // can shut down the org

/** Who holds a given authority — a specific DID or anyone in an org tier. */
export type AuthorityHolder =
  | { type: "did"; did: string }
  | { type: "org_tier"; orgRkey: string; founderDid: string; tierName: string };

/** A single authority granted to a holder. */
export interface AuthorityGrant {
  authority: Authority;
  holder: AuthorityHolder;
  grantedBy: string;       // DID that created this grant
  grantedAt: string;
}

/** Tier bridge — cross-org encrypted data visibility. */
export interface TierBridge {
  parentTier: string;
  childTier: string;
  direction: "down" | "up" | "mutual";  // who can read whose data
  grantedBy: string;       // DID that authorized this bridge
  grantedAt: string;
}

/** How this org relationship was established. */
export type RelationshipOrigin = "founded" | "acquired" | "merged" | "spawned" | "peer";

/**
 * Org-to-org relationship record.
 *
 * This is the core primitive for all inter-org governance:
 *   - Co-founders: multiple relationships with no parent, same child, split authorities
 *   - Acquisition: parent holds all authorities over child
 *   - Skunkworks: parent holds limited visibility (bridge) + dissolve, child retains autonomy
 *   - Merger: new super-org, both original orgs become children
 *   - Peer: mutual bridges, no authority — just visibility
 */
export interface OrgRelationship {
  /** Parent org reference (absent = top-level / direct DID authority). */
  parentRef?: { did: string; orgRkey: string };
  /** Child org being governed. */
  childRef: { did: string; orgRkey: string };
  /** What structural powers the parent/holder has. */
  authorities: AuthorityGrant[];
  /** Cross-org tier visibility bridges. */
  bridges: TierBridge[];
  /** How was this relationship established? */
  origin: RelationshipOrigin;
  createdAt: string;
  updatedAt?: string;
}

export interface OrgRelationshipRecord {
  rkey: string;
  relationship: OrgRelationship;
}

/** Active org context when user is working in an org. */
export interface OrgContext {
  org: OrgRecord;
  service: string;
  founderDid: string;
  myTierName: string;
  myTierLevel: number;
  /** Map of tierName → current-epoch DEK (for writing new records). */
  tierDeks: Map<string, CryptoKey>;
  /** Map of full keyring rkey → DEK across all epochs (for reading old records). */
  keyringDeks: Map<string, CryptoKey>;
  memberships: MembershipRecord[];
  /** Open proposals in this org. */
  proposals: ProposalRecord[];
  /** Approvals gathered across member PDSes. */
  approvals: ApprovalRecord[];
  /** Decision chain (links old → new versions). */
  decisions: DecisionRecord[];
  /** Org relationships (parent/child/peer) involving this org. */
  relationships: OrgRelationshipRecord[];
}

/** App state */
export interface VaultState {
  /** PDS session */
  session: Session | null;
  /** Unwrapped DEK for sealing/unsealing (personal vault) */
  dek: CryptoKey | null;
  /** Whether the vault identity exists on PDS (vs first-run) */
  initialized: boolean;
  /** Keyring rkey for the default workspace */
  keyringRkey: string | null;
  /** Active org context (null = personal vault) */
  activeOrg: OrgContext | null;
}
