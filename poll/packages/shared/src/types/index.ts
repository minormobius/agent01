/** Core domain types for the anonymous poll system */

export type PollMode = 'trusted_host_v1' | 'anon_credential_v2';
export type PollStatus = 'draft' | 'open' | 'closed' | 'finalized';
export type EligibilityMode = 'open' | 'did_list' | 'followers' | 'mutuals' | 'at_list';

export interface Poll {
  id: string;
  hostDid: string;
  askerDid: string | null;
  question: string;
  options: string[];
  opensAt: string;
  closesAt: string;
  status: PollStatus;
  mode: PollMode;
  eligibilityMode: EligibilityMode;
  eligibilitySource: string | null;
  hostKeyFingerprint: string;
  hostPublicKey: string | null;
  atprotoRecordUri: string | null;
  createdAt: string;
}

export interface EligibilityRecord {
  pollId: string;
  responderDid: string;
  eligibilityStatus: 'eligible' | 'consumed' | 'denied';
  consumedAt: string | null;
  issuanceMode: PollMode;
  receiptHash: string | null;
}

export interface Ballot {
  ballotId: string;
  pollId: string;
  publicBallotSerial: number;
  nullifier: string;
  choice: number;
  tokenMessage: string;
  issuerSignature: string;
  credentialProof: string | null;
  accepted: boolean;
  rejectionReason: string | null;
  submittedAt: string;
  publishedRecordUri: string | null;
  rollingAuditHash: string;
}

export interface TallySnapshot {
  pollId: string;
  countsByOption: Record<string, number>;
  ballotCount: number;
  computedAt: string;
  final: boolean;
}

export interface AuditEvent {
  id: string;
  pollId: string;
  eventType: string;
  eventPayload: string;
  rollingHash: string;
  createdAt: string;
}

/** Public ballot shape — what gets published to ATProto and shown on audit page */
export interface PublicBallot {
  poll_id: string;
  option: number;
  token_message: string;
  issuer_signature: string;
  nullifier: string;
  submitted_at: string;
  ballot_version: number;
  public_serial: number;
}

/** Credential state machine */
export type CredentialState =
  | 'UNISSUED'
  | 'ISSUANCE_PENDING'
  | 'ISSUED_LOCAL'
  | 'SUBMITTED'
  | 'ACCEPTED_PRIVATE'
  | 'ACCEPTED_PUBLIC'
  | 'REJECTED'
  | 'SPENT';

/** Client-side credential (what the responder holds in browser) */
export interface LocalCredential {
  pollId: string;
  secret: string;        // s — private serial
  tokenMessage: string;  // m = H(version || poll_id || s || expiry)
  issuerSignature: string; // sig(m)
  nullifier: string;     // H("nullifier" || s || poll_id)
  state: CredentialState;
  issuedAt: string;
}

/** API request/response shapes */
export interface CreatePollRequest {
  question: string;
  options: string[];
  opensAt: string;
  closesAt: string;
  mode: PollMode;
  eligibilityMode?: EligibilityMode;
  eligibilitySource?: string;
  whitelistedDids?: string[];
}

export interface EligibilityRequest {
  /** In v2 mode, this would be a blinded message */
  blindedMessage?: string;
}

export interface EligibilityResponse {
  eligible: boolean;
  /** v1: full credential returned by host */
  credential?: {
    tokenMessage: string;
    issuerSignature: string;
    secret: string;
    nullifier: string;
  };
  /** v2: blind signature returned by host (client unblinds locally) */
  blindedSignature?: string;
  receiptHash?: string;
}

export interface BallotSubmission {
  choice: number;
  tokenMessage: string;
  issuerSignature: string;
  nullifier: string;
  credentialProof?: string;
  ballotVersion: number;
}

export interface BallotResponse {
  accepted: boolean;
  ballotId?: string;
  publicSerial?: number;
  rejectionReason?: string;
}

export interface TallyResponse {
  pollId: string;
  countsByOption: Record<string, number>;
  ballotCount: number;
  computedAt: string;
  final: boolean;
}
