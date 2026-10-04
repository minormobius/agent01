import type { PmTask, EvmResult, EsResult } from './engine.mjs';
export type VvStatus = 'verified' | 'partial' | 'failed' | 'unverified';
export interface TaskEarning { reqs: string[]; verified: string[]; failed: string[]; claimed: number; earned: number }
export interface VerifiedEarned {
  evm: EvmResult; es: EsResult; claimedEv: number; unverifiedClaim: number;
  unlinked: string[]; byTask: Record<string, TaskEarning>;
}
export function verifiedEarned<T extends PmTask & { reqs?: string[] }>(
  tasks: T[], status: Record<string, VvStatus | string>,
  opts?: { asOf?: Date; links?: { from: string; to: string; kind?: string }[] },
): VerifiedEarned;
