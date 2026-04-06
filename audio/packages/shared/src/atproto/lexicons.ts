/**
 * ATProto lexicon IDs for audio rooms.
 *
 * These define the record types stored on the service PDS.
 * Room metadata is published so other ATProto apps can discover active rooms.
 */

/** A live audio room record — published when room goes live, deleted when ended */
export const LEXICON_ROOM = 'com.minomobi.audio.room';

/** An archived session record — published when room ends (optional, for history) */
export const LEXICON_SESSION = 'com.minomobi.audio.session';

/** Room record schema (what gets written to PDS) */
export interface AudioRoomRecord {
  $type: typeof LEXICON_ROOM;
  /** Room ID (matches DO key) */
  roomId: string;
  /** Host DID */
  hostDid: string;
  /** Room title */
  title: string;
  /** Description */
  description?: string;
  /** When the room went live */
  startedAt: string;
  /** WebSocket endpoint for joining */
  wsEndpoint: string;
  createdAt: string;
}

/** Session archive record (written when room ends) */
export interface AudioSessionRecord {
  $type: typeof LEXICON_SESSION;
  roomId: string;
  hostDid: string;
  title: string;
  /** Total participants who joined */
  totalParticipants: number;
  /** Duration in seconds */
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  createdAt: string;
}
