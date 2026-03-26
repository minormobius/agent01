// --- PDS Session ---

export interface Session {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

// --- Vault Org Types ---

export interface TierDef {
  name: string;
  level: number;
  currentEpoch?: number;
}

export const DEFAULT_TIERS: TierDef[] = [
  { name: "member", level: 0 },
  { name: "manager", level: 1 },
  { name: "admin", level: 2 },
];

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

// --- Notifications ---

export interface OrgInviteNotification {
  type: "org-invite";
  orgRkey: string;
  orgName: string;
  founderDid: string;
  founderService: string;
  tierName: string;
  invitedBy: string;
  invitedByHandle?: string;
  createdAt: string;
}

export type Notification = OrgInviteNotification;

export interface NotificationRecord {
  /** Stable key: `invite:{founderDid}:{orgRkey}` */
  rkey: string;
  notification: Notification;
}

/** Stored on user's PDS to track dismissed notifications */
export interface NotificationDismissal {
  notificationKey: string;
  dismissedAt: string;
}

// --- App Registry ---

export interface AppDef {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  orgAware: boolean;
}

export const APPS: AppDef[] = [
  { id: "wave", name: "Wave", description: "Encrypted channels, threads & docs", url: "/wave", icon: "\u{1F30A}", orgAware: true },
  { id: "crm", name: "CRM", description: "Deal pipeline & proposals", url: "/crm", icon: "\u{1F4BC}", orgAware: true },
  { id: "pm", name: "PM", description: "Earned value project management", url: "/pm", icon: "\u{1F4CA}", orgAware: true },
  { id: "cal", name: "Calendar", description: "Events, scheduling & PM deadlines", url: "/cal", icon: "\u{1F4C5}", orgAware: true },
];
