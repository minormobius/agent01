// Wave-specific types — shared vault types come from ../types

import type { MembershipRecord, OrgRecord } from "../types";

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

/** An operation (message, edit, reaction) within a thread. */
export interface WaveOp {
  $type: "com.minomobi.wave.op";
  threadUri: string;
  parentOps?: string[];
  opType: "message" | "doc_edit" | "reaction";
  keyringRkey: string;
  iv: { $bytes: string };
  ciphertext: { $bytes: string };
  createdAt: string;
}

export interface WaveOpRecord {
  rkey: string;
  op: WaveOp;
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
