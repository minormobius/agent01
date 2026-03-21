// --- Shared types (from vault/CRM) ---

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
  keyringRkey: string;
  iv: { $bytes: string };
  ciphertext: { $bytes: string };
  // Future: attachments?: BlobRef[];
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

/** Active org context for Wave — simplified from CRM */
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
}

/** Top-level app state */
export interface WaveState {
  session: Session | null;
  dek: CryptoKey | null;
  initialized: boolean;
  keyringRkey: string | null;
}
