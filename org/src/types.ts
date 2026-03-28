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

export interface WaveMessageNotification {
  type: "wave-message";
  orgRkey: string;
  orgName: string;
  channelName: string;
  threadTitle?: string;
  threadRkey: string;
  threadAuthorDid: string;
  senderHandle?: string;
  preview?: string;
  createdAt: string;
}

export interface WaveDocEditNotification {
  type: "wave-doc-edit";
  orgRkey: string;
  orgName: string;
  channelName: string;
  docTitle?: string;
  threadRkey: string;
  threadAuthorDid: string;
  senderHandle?: string;
  createdAt: string;
}

export interface WaveThreadNotification {
  type: "wave-thread";
  orgRkey: string;
  orgName: string;
  channelName: string;
  threadTitle?: string;
  threadType: "chat" | "doc";
  senderHandle?: string;
  createdAt: string;
}

export interface WaveChannelNotification {
  type: "wave-channel";
  orgRkey: string;
  orgName: string;
  channelName: string;
  senderHandle?: string;
  createdAt: string;
}

export interface DealNotification {
  type: "deal-created" | "deal-updated";
  orgRkey: string;
  orgName: string;
  dealTitle: string;
  stage?: string;
  senderHandle?: string;
  createdAt: string;
}

export interface ProposalNotification {
  type: "proposal-created" | "proposal-approved";
  orgRkey: string;
  orgName: string;
  summary: string;
  senderHandle?: string;
  createdAt: string;
}

export interface CalEventNotification {
  type: "cal-event";
  orgRkey: string;
  orgName: string;
  eventTitle: string;
  eventDate?: string;
  senderHandle?: string;
  createdAt: string;
}

export type NotificationType =
  | "org-invite"
  | "wave-message"
  | "wave-doc-edit"
  | "wave-thread"
  | "wave-channel"
  | "deal-created"
  | "deal-updated"
  | "proposal-created"
  | "proposal-approved"
  | "cal-event";

export type Notification =
  | OrgInviteNotification
  | WaveMessageNotification
  | WaveDocEditNotification
  | WaveThreadNotification
  | WaveChannelNotification
  | DealNotification
  | ProposalNotification
  | CalEventNotification;

export interface NotificationRecord {
  rkey: string;
  notification: Notification;
}

/** Stored on user's PDS to track dismissed notifications */
export interface NotificationDismissal {
  notificationKey: string;
  dismissedAt: string;
}

/**
 * User's notification preferences — stored on their PDS.
 * Each key is a NotificationType; value is whether to show it.
 * Missing keys default to true (opt-out model).
 */
export interface NotificationPreferences {
  $type: "com.minomobi.vault.notificationPrefs";
  /** Per-type enable/disable */
  enabled: Partial<Record<NotificationType, boolean>>;
  /** Per-org overrides (orgRkey → per-type enable/disable) */
  orgOverrides?: Record<string, Partial<Record<NotificationType, boolean>>>;
  updatedAt: string;
}

/** All notification type labels for UI display */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  "org-invite": "Org Invites",
  "wave-message": "Chat Messages",
  "wave-doc-edit": "Doc Edits",
  "wave-thread": "New Threads/Docs",
  "wave-channel": "New Channels",
  "deal-created": "New Deals",
  "deal-updated": "Deal Updates",
  "proposal-created": "New Proposals",
  "proposal-approved": "Proposal Approvals",
  "cal-event": "Calendar Events",
};

/**
 * Published notification — written to the SENDER's PDS so it can be
 * discovered via Jetstream by the target user. The sender writes it;
 * the receiver's client filters by targetDid.
 *
 * targetDid can be "*" for org-wide broadcasts — receivers filter by
 * membership + preferences.
 */
export interface PublishedNotification {
  $type: "com.minomobi.vault.notification";
  /** Target DID or "*" for org-wide broadcast */
  targetDid: string;
  notificationType: NotificationType;
  orgRkey: string;
  orgName: string;
  /** Notification-specific payload as JSON string */
  payload: string;
  senderDid: string;
  senderHandle?: string;
  /** Minimum tier level required to see this notification */
  tierLevel?: number;
  createdAt: string;
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
  { id: "todo", name: "To-Do", description: "Encrypted checklists & tasks", url: "/todo", icon: "\u2705", orgAware: true },
  { id: "contacts", name: "Contacts", description: "Encrypted contact directory", url: "/contacts", icon: "\u{1F4C7}", orgAware: true },
  { id: "docs", name: "Docs", description: "Architecture & encryption reference", url: "/docs", icon: "\u{1F4D6}", orgAware: false },
];
