/** Deal stages matching the lexicon knownValues */
export const STAGES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed-won",
  "closed-lost",
] as const;

export type Stage = (typeof STAGES)[number];

/** Column display config */
export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  "closed-won": "Won",
  "closed-lost": "Lost",
};

/** Inner record: com.minomobi.crm.deal */
export interface Deal {
  title: string;
  stage: Stage;
  value?: number;
  currency?: string;
  contactRkey?: string;
  companyRkey?: string;
  notes?: string;
  tags?: string[];
  expectedClose?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Deal with its PDS rkey for updates/deletes */
export interface DealRecord {
  rkey: string;
  deal: Deal;
}

/** vault.sealed envelope as stored on PDS */
export interface SealedEnvelope {
  $type: "com.minomobi.vault.sealed";
  innerType: string;
  keyringRkey: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
  updatedAt?: string;
}

/** PDS session from createSession */
export interface Session {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

/** App state */
export interface VaultState {
  /** PDS session */
  session: Session | null;
  /** Unwrapped DEK for sealing/unsealing */
  dek: CryptoKey | null;
  /** Whether the vault identity exists on PDS (vs first-run) */
  initialized: boolean;
  /** Keyring rkey for the default workspace */
  keyringRkey: string | null;
}
