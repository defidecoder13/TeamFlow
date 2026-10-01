/**
 * Draft request validation (Audit 13).
 *
 * Strict schemas: only documented fields pass. Workspace and user always
 * resolve server-side from the URL and session.
 */

import { z } from 'zod';

export const MAX_DRAFT_BODY_LENGTH = 10000;

export const draftTargetKindSchema = z.enum(['CHANNEL', 'DIRECT_MESSAGE', 'THREAD']);

export const upsertDraftSchema = z
  .object({
    targetKind: draftTargetKindSchema,
    targetId: z.string().min(1, 'Target is required.').max(128),
    body: z
      .string()
      .max(MAX_DRAFT_BODY_LENGTH, `Drafts cannot exceed ${MAX_DRAFT_BODY_LENGTH} characters.`),
  })
  .strict();

export type UpsertDraftBody = z.infer<typeof upsertDraftSchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
