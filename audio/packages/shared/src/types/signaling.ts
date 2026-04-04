/**
 * WebRTC signaling protocol messages.
 *
 * These flow over WebSocket between peers and the RoomCoordinator DO.
 * The DO relays SDP offers/answers and ICE candidates between peers.
 * Audio never touches the server — only these small JSON control messages do.
 */

/** Client → Server messages */
export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | SdpOfferMessage
  | SdpAnswerMessage
  | IceCandidateMessage
  | MuteMessage
  | RaiseHandMessage
  | PromoteMessage
  | KickMessage;

export interface JoinMessage {
  type: 'join';
  /** Room ID */
  roomId: string;
  /** ATProto session token (verified server-side) */
  sessionToken: string;
}

export interface LeaveMessage {
  type: 'leave';
}

export interface SdpOfferMessage {
  type: 'sdp-offer';
  /** Target peer DID */
  targetDid: string;
  /** SDP offer string */
  sdp: string;
}

export interface SdpAnswerMessage {
  type: 'sdp-answer';
  /** Target peer DID */
  targetDid: string;
  /** SDP answer string */
  sdp: string;
}

export interface IceCandidateMessage {
  type: 'ice-candidate';
  /** Target peer DID */
  targetDid: string;
  /** ICE candidate JSON */
  candidate: string;
}

export interface MuteMessage {
  type: 'mute';
  muted: boolean;
}

export interface RaiseHandMessage {
  type: 'raise-hand';
  raised: boolean;
}

/** Host promotes a listener to speaker */
export interface PromoteMessage {
  type: 'promote';
  /** DID of participant to promote */
  targetDid: string;
  /** New role */
  role: 'speaker' | 'listener';
}

/** Host kicks a participant */
export interface KickMessage {
  type: 'kick';
  targetDid: string;
}

/** Server → Client messages */
export type ServerMessage =
  | RoomStateMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | SdpRelayMessage
  | IceCandidateRelayMessage
  | PeerMutedMessage
  | PeerHandMessage
  | RoleChangedMessage
  | KickedMessage
  | RoomEndedMessage
  | ErrorMessage;

export interface RoomStateMessage {
  type: 'room-state';
  room: {
    id: string;
    title: string;
    hostDid: string;
    status: string;
  };
  participants: Array<{
    did: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
    role: string;
    isMuted: boolean;
    hasRaisedHand: boolean;
  }>;
  /** Your assigned role */
  yourRole: string;
}

export interface PeerJoinedMessage {
  type: 'peer-joined';
  did: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
}

export interface PeerLeftMessage {
  type: 'peer-left';
  did: string;
}

export interface SdpRelayMessage {
  type: 'sdp-offer' | 'sdp-answer';
  fromDid: string;
  sdp: string;
}

export interface IceCandidateRelayMessage {
  type: 'ice-candidate';
  fromDid: string;
  candidate: string;
}

export interface PeerMutedMessage {
  type: 'peer-muted';
  did: string;
  muted: boolean;
}

export interface PeerHandMessage {
  type: 'peer-hand';
  did: string;
  raised: boolean;
}

export interface RoleChangedMessage {
  type: 'role-changed';
  did: string;
  role: string;
}

export interface KickedMessage {
  type: 'kicked';
  reason?: string;
}

export interface RoomEndedMessage {
  type: 'room-ended';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}
