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

/** Deal with its PDS rkey for updates/deletes */
export interface DealRecord {
  rkey: string;
  deal: Deal;
}

/** vault.sealed envelope as stored on PDS */
export interface SealedEnvelope {
  $type: "com.minomobi.vault.sealed";
  innerType: string;
  keyringRkey: string;
  iv: string;
  ciphertext: string;
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

/** Permission flags for a tier. */
export interface TierPermissions {
  read: boolean;      // can decrypt and view records at this tier
  edit: boolean;      // can create/modify deal records
  editMeta: boolean;  // can move deals between pipeline stages
}

/** Default permissions: all true for backward compat. */
export const DEFAULT_PERMISSIONS: TierPermissions = {
  read: true,
  edit: true,
  editMeta: true,
};

/** A configurable access tier within an org. Higher level = more access. */
export interface TierDef {
  name: string;   // e.g. "operator", "manager", "executive"
  level: number;  // 0 = lowest access, higher = more access
  permissions: TierPermissions;
}

/** Default tier presets for quick org creation. */
export const DEFAULT_TIERS: TierDef[] = [
  { name: "member", level: 0, permissions: { read: true, edit: false, editMeta: false } },
  { name: "manager", level: 1, permissions: { read: true, edit: true, editMeta: false } },
  { name: "admin", level: 2, permissions: { read: true, edit: true, editMeta: true } },
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

/** A signature record: one member of one office signing off on a deal stage transition. */
export interface Signature {
  dealRkey: string;
  fromStage: Stage;
  toStage: Stage;
  officeName: string;
  signerDid: string;
  signerHandle?: string;
  createdAt: string;
}

export interface SignatureRecord {
  rkey: string;
  signature: Signature;
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

/** Keyring record: one per tier per org. Holds wrapped DEKs for all members at this tier. */
export interface Keyring {
  orgRkey: string;
  tierName: string;
  writerDid: string;       // DID of whoever wrote the wraps (their pubkey needed to unwrap)
  writerPublicKey: string; // base64 — recipient needs this for ECDH unwrap
  members: KeyringMemberEntry[];
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

/** Active org context when user is working in an org. */
export interface OrgContext {
  org: OrgRecord;
  service: string;
  founderDid: string;
  myTierName: string;
  myTierLevel: number;
  myPermissions: TierPermissions;
  /** Map of tierName → DEK for all tiers this user can access. */
  tierDeks: Map<string, CryptoKey>;
  memberships: MembershipRecord[];
  /** Map of tierName → permissions for accessible tiers. */
  tierPermissions: Map<string, TierPermissions>;
  /** Signatures on deals in this org. */
  signatures: SignatureRecord[];
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
