/** Room — a live audio session hosted by an ATProto identity */
export interface Room {
  id: string;
  /** Host's ATProto DID */
  hostDid: string;
  /** Host's display handle */
  hostHandle: string;
  /** Room title */
  title: string;
  /** Optional description */
  description?: string;
  /** Room lifecycle */
  status: RoomStatus;
  /** Max participants (including host). 0 = unlimited (up to practical WebRTC limit) */
  maxParticipants: number;
  /** Created timestamp */
  createdAt: string;
  /** When the room went live */
  startedAt?: string;
  /** When the room ended */
  endedAt?: string;
}

export type RoomStatus = 'waiting' | 'live' | 'ended';

/** A participant in a room */
export interface Participant {
  /** ATProto DID */
  did: string;
  /** Display handle */
  handle: string;
  /** Display name (from profile) */
  displayName?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Role in the room */
  role: ParticipantRole;
  /** Audio state */
  isMuted: boolean;
  /** Hand raised */
  hasRaisedHand: boolean;
  /** When they joined */
  joinedAt: string;
}

export type ParticipantRole = 'host' | 'speaker' | 'listener';

/** Request to create a room */
export interface CreateRoomRequest {
  title: string;
  description?: string;
  maxParticipants?: number;
}

/** Room summary for lobby listing */
export interface RoomSummary {
  id: string;
  hostHandle: string;
  title: string;
  status: RoomStatus;
  participantCount: number;
  createdAt: string;
}
