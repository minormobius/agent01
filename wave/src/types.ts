// --- Shared types (from vault) ---

export interface Session {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface TierDef {
  name: string;
  level: number;
  currentEpoch?: number;
}

export interface Org {
  name: string;
  founderDid: string;
  tiers: TierDef[];
  createdAt: string;
}

export interface OrgRecord {
  rkey: string;
  org: Org;
}

export interface Membership {
  orgRkey: string;
  orgService: string;
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

export interface OrgBookmark {
  founderDid: string;
  founderService: string;
  orgRkey: string;
  orgName: string;
  createdAt: string;
}

export interface KeyringMemberEntry {
  did: string;
  wrappedDek: string; // base64
}

export interface Keyring {
  orgRkey: string;
  tierName: string;
  epoch?: number;
  writerDid: string;
  writerPublicKey: string; // base64
  members: KeyringMemberEntry[];
}

// --- Wave types ---

/** A channel within an org. Stored on founder's PDS. */
export interface WaveChannel {
  $type: "com.minomobi.wave.channel";
  orgRkey: string;
  name: string;
  tierName: string;
  createdAt: string;
}

export interface WaveChannelRecord {
  rkey: string;
  channel: WaveChannel;
}

/** A thread/conversation within a channel. Stored on creator's PDS. */
export interface WaveThread {
  $type: "com.minomobi.wave.thread";
  channelUri: string; // at:// URI of the channel record
  title?: string;
  threadType: "chat" | "doc";
  createdAt: string;
}

export interface WaveThreadRecord {
  rkey: string;
  thread: WaveThread;
  authorDid: string;
  authorHandle?: string;
}

/** An operation (message, edit, reaction) within a thread. Stored on author's PDS. */
export interface WaveOp {
  $type: "com.minomobi.wave.op";
  threadUri: string; // at:// URI of the thread record
  parentOps?: string[]; // causal ordering DAG
  opType: "message" | "doc_edit" | "reaction";
  keyringRkey: string; // "public" for unencrypted ops
  iv?: { $bytes: string };        // present when encrypted
  ciphertext?: { $bytes: string }; // present when encrypted
  content?: string;                // present when public (JSON payload)
  createdAt: string;
}

export interface WaveOpRecord {
  rkey: string;
  op: WaveOp;
  authorDid: string;
  authorHandle?: string;
}

/** Decrypted message payload (inside ciphertext) */
export interface MessagePayload {
  text: string;
}

/**
 * Decrypted doc edit payload (inside ciphertext for opType: "doc_edit").
 *
 * Level 2: full snapshot + causal base for history/diff.
 * Level 3 (future): replace `text` with CRDT ops (Yjs/Automerge update bytes).
 */
export interface DocEditPayload {
  text: string;           // full markdown content (Level 1+2: snapshot)
  baseOpUri?: string;     // at:// URI of the op this edit is based on (Level 2: history DAG)
  // Future Level 3: crdtUpdate?: string; // base64-encoded CRDT delta
}

/** Active org context for Wave */
export interface WaveOrgContext {
  org: OrgRecord;
  service: string;
  founderDid: string;
  myTierName: string;
  myTierLevel: number;
  /** tierName → current-epoch DEK (for writing) */
  tierDeks: Map<string, CryptoKey>;
  /** full keyring rkey → DEK (for reading at any epoch) */
  keyringDeks: Map<string, CryptoKey>;
  memberships: MembershipRecord[];
  diagnostics: string;
}

/** Top-level app state */
export interface WaveState {
  session: Session | null;
  dek: CryptoKey | null;
  initialized: boolean;
  keyringRkey: string | null;
}

// --- Template types ---

/** Template categories */
export type TemplateCategory =
  | 'project'
  | 'journal'
  | 'meeting'
  | 'crm'
  | 'knowledge'
  | 'tracker'
  | 'other';

/** A page template stored as an ATProto record */
export interface WaveTemplate {
  $type: "com.minomobi.wave.template";
  title: string;
  description: string;
  category: TemplateCategory;
  /** Markdown content with {{variable}} placeholders */
  content: string;
  /** Variables the template expects */
  variables: TemplateVariable[];
  /** Which view plugins this template uses */
  plugins: string[];
  /** Tags for discovery */
  tags: string[];
  createdAt: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
}

export interface WaveTemplateRecord {
  rkey: string;
  template: WaveTemplate;
  authorDid: string;
  authorHandle?: string;
}
