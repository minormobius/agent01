/** ATProto auth types — app-password flow (same pattern as poll) */

export interface AuthStartRequest {
  handle: string;
  appPassword: string;
}

export interface AuthSession {
  sessionId: string;
  did: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthStartResponse {
  session: AuthSession;
}
