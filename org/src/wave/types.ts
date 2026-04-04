// Wave-specific types — shared vault types come from ../types

import type { MembershipRecord, OrgRecord } from "../types";

/**
 * Channel inner record — encrypted inside vault.sealed.
 * No plaintext metadata leaks (name, tierName, orgRkey all hidden).
 */
export interface WaveChannel {
  orgRkey: string;
  name: string;
  tierName: string;
  createdAt: string;
}

export interface WaveChannelRecord {
  rkey: string;
  channel: WaveChannel;
}

/**
 * Thread inner record — encrypted inside vault.sealed.
 * channelUri, title, threadType all hidden.
 */
export interface WaveThread {
  channelUri: string;
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

/**
 * Op inner record — encrypted inside vault.sealed.
 * threadUri, opType, parentOps, and payload all hidden.
 *
 * Payload fields (text, baseOpUri) are included directly — no nested
 * encryption layer needed since the whole record is inside the shield.
 */
export interface WaveOp {
  threadUri: string;
  parentOps?: string[];
  opType: "message" | "doc_edit" | "reaction";
  /** Message/doc text (decrypted from sealed envelope) */
  text?: string;
  /** Doc edit base op reference */
  baseOpUri?: string;
  createdAt: string;
}

export interface WaveOpRecord {
  rkey: string;
  op: WaveOp;
  /** Decrypted payload (set client-side after unseal) */
  payload?: MessagePayload | DocEditPayload;
  authorDid: string;
  authorHandle?: string;
}

export interface MessagePayload {
  text: string;
}

export interface DocEditPayload {
  text: string;
  baseOpUri?: string;
}

/** Active org context for Wave */
export interface WaveOrgContext {
  org: OrgRecord;
  service: string;
  founderDid: string;
  myTierName: string;
  myTierLevel: number;
  tierDeks: Map<string, CryptoKey>;
  keyringDeks: Map<string, CryptoKey>;
  memberships: MembershipRecord[];
  diagnostics: string;
}
