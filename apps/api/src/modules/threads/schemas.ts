/**
 * Thread list request validation (Audit 11).
 *
 * Strict schema: only `limit` and `cursor` pass. Workspace and user always
 * resolve server-side from the URL and session.
 */

import { z } from 'zod';
import { decodeThreadCursor } from './cursor';

export const DEFAULT_THREAD_LIMIT = 50;
export const MAX_THREAD_LIMIT = 100;

export const threadListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_THREAD_LIMIT)
      .default(DEFAULT_THREAD_LIMIT),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || decodeThreadCursor(value) !== null, {
        message: 'Invalid pagination cursor.',
      }),
  })
  .strict();

export type ThreadListQuery = z.infer<typeof threadListQuerySchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
