/**
 * Workspace mention list request validation (Audit 12).
 *
 * Strict schema: only `limit` and `cursor` pass. Workspace and user always
 * resolve server-side from the URL and session.
 */

import { z } from 'zod';
import { decodeMentionCursor } from './cursor';

export const DEFAULT_MENTION_LIMIT = 50;
export const MAX_MENTION_LIMIT = 100;

export const mentionListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_MENTION_LIMIT)
      .default(DEFAULT_MENTION_LIMIT),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || decodeMentionCursor(value) !== null, {
        message: 'Invalid pagination cursor.',
      }),
  })
  .strict();

export type MentionListQuery = z.infer<typeof mentionListQuerySchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
