/** Core domain types for ATPolls */

export type PollMode = 'anon_credential_v2' | 'public_like';
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
  blueskyOptionPosts: { uri: string; cid: string }[] | null;
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

/** Public ballot shape — what gets published to ATProto and shown on audit page.
 *
 * SECURITY: tokenMessage and nullifier are deliberately excluded from public records.
 * Publishing them would enable rainbow-table deanonymization (tokenMessage) and
 * cross-poll vote linkability (nullifier). These fields remain in D1 only for
 * operator-side audit. Public verification uses ballotCommitment instead —
 * a SHA-256 commitment that voters can open to prove their own ballot without
 * leaking linkable information to observers.
 */
export interface PublicBallot {
  poll_id: string;
  option: number;
  ballot_commitment: string;
  issuer_signature: string;
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

/** Survey types — multi-question polling */

export interface Survey {
  id: string;
  hostDid: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  opensAt: string;
  closesAt: string;
  status: PollStatus;
  eligibilityMode: EligibilityMode;
  eligibilitySource: string | null;
  hostKeyFingerprint: string;
  hostPublicKey: string | null;
  atprotoRecordUri: string | null;
  createdAt: string;
}

export type SurveyQuestionType = 'single_choice' | 'ranking';

export interface SurveyQuestion {
  id: string;
  surveyId: string;
  question: string;
  options: string[];
  position: number;
  required: boolean;
  questionType: SurveyQuestionType;
}

export interface SurveyBallot {
  ballotId: string;
  surveyId: string;
  publicBallotSerial: number;
  nullifier: string;
  choices: (number | number[])[];  // number for single_choice, number[] for ranking
  tokenMessage: string;
  issuerSignature: string;
  credentialProof: string | null;
  accepted: boolean;
  rejectionReason: string | null;
  submittedAt: string;
  publishedRecordUri: string | null;
  rollingAuditHash: string;
}

export interface SurveyTallySnapshot {
  surveyId: string;
  countsByQuestion: Record<string, Record<string, number>>;
  ballotCount: number;
  computedAt: string;
  final: boolean;
}

export interface CreateSurveyRequest {
  title: string;
  description?: string;
  questions: { question: string; options: string[]; required?: boolean; questionType?: SurveyQuestionType }[];
  opensAt: string;
  closesAt: string;
  eligibilityMode?: EligibilityMode;
  eligibilitySource?: string;
  whitelistedDids?: string[];
}

export interface SurveyBallotSubmission {
  choices: (number | number[])[];  // number for single_choice, number[] for ranking
  tokenMessage: string;
  issuerSignature: string;
  nullifier: string;
  credentialProof?: string;
  ballotVersion: number;
}

export interface SurveyBallotResponse {
  accepted: boolean;
  ballotId?: string;
  publicSerial?: number;
  rejectionReason?: string;
}

export interface SurveyTallyResponse {
  surveyId: string;
  countsByQuestion: Record<string, Record<string, number>>;
  ballotCount: number;
  computedAt: string;
  final: boolean;
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
  /** Blind signature returned by host (client unblinds locally) */
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
