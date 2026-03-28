import { z } from 'zod';

export const PollModeSchema = z.enum(['anon_credential_v2', 'public_like']);
export const PollStatusSchema = z.enum(['draft', 'open', 'closed', 'finalized']);
export const EligibilityModeSchema = z.enum(['open', 'did_list', 'followers', 'mutuals', 'at_list']);

export const CreatePollSchema = z.object({
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(20),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  mode: PollModeSchema.default('anon_credential_v2'),
  eligibilityMode: EligibilityModeSchema.default('open'),
  eligibilitySource: z.string().max(2000).optional(),
  whitelistedDids: z.array(z.string().min(1).max(100)).max(10000).optional(),
});

export const EligibilityRequestSchema = z.object({
  blindedMessage: z.string().optional(),
});

export const BallotSubmissionSchema = z.object({
  choice: z.number().int().min(0),
  tokenMessage: z.string().min(1),
  issuerSignature: z.string().min(1),
  nullifier: z.string().min(1),
  credentialProof: z.string().optional(),
  ballotVersion: z.number().int().default(1),
});

export const PollIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** Survey schemas */

export const SurveyQuestionTypeSchema = z.enum(['single_choice', 'ranking']).default('single_choice');

export const CreateSurveySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  questions: z.array(z.object({
    question: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(20),
    required: z.boolean().default(true),
    questionType: SurveyQuestionTypeSchema,
  })).min(1).max(50),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  eligibilityMode: EligibilityModeSchema.default('open'),
  eligibilitySource: z.string().max(2000).optional(),
  whitelistedDids: z.array(z.string().min(1).max(100)).max(10000).optional(),
});

export const SurveyBallotSubmissionSchema = z.object({
  // Single-choice: number (-1 = skipped). Ranking: number[] (ordered preference).
  choices: z.array(z.union([z.number().int().min(-1), z.array(z.number().int().min(0))])),
  tokenMessage: z.string().min(1),
  issuerSignature: z.string().min(1),
  nullifier: z.string().min(1),
  credentialProof: z.string().optional(),
  ballotVersion: z.number().int().default(1),
});

export const SurveyIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** ATProto record shapes for publishing */
export const PollDefRecordSchema = z.object({
  $type: z.literal('com.minomobi.poll.def'),
  pollId: z.string().uuid(),
  question: z.string(),
  options: z.array(z.string()),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  mode: PollModeSchema,
  hostKeyFingerprint: z.string().nullable().optional(),
  hostPublicKey: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const PollBallotRecordSchema = z.object({
  $type: z.literal('com.minomobi.poll.ballot'),
  pollId: z.string().uuid(),
  option: z.number().int().min(0),
  tokenMessage: z.string(),
  issuerSignature: z.string(),
  nullifier: z.string(),
  submittedAt: z.string().datetime(),
  ballotVersion: z.number().int(),
  publicSerial: z.number().int(),
});

export const PollTallyRecordSchema = z.object({
  $type: z.literal('com.minomobi.poll.tally'),
  pollId: z.string().uuid(),
  countsByOption: z.record(z.string(), z.number().int().min(0)),
  ballotCount: z.number().int().min(0),
  computedAt: z.string().datetime(),
  final: z.boolean(),
});
