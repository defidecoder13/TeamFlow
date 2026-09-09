/**
 * Message request validation (Phase 4A).
 *
 * Strict schemas: only documented fields pass. `authorId`/`channelId`/
 * `workspaceId`/timestamps can never be smuggled in. Query validation
 * rejects non-integer, out-of-range, and unknown parameters.
 */

import { z } from 'zod';
import { decodeMessageCursor } from './cursor';

export const MAX_MESSAGE_BODY_LENGTH = 10000;
export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 100;

export const messageBodySchema = z
  .string({ error: 'Enter a message.' })
  .trim()
  .min(1, 'Enter a message.')
  .max(MAX_MESSAGE_BODY_LENGTH, `Messages cannot exceed ${MAX_MESSAGE_BODY_LENGTH} characters.`);

export const createMessageSchema = z.object({ body: messageBodySchema }).strict();

export const updateMessageSchema = z.object({ body: messageBodySchema }).strict();

export const messageListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(DEFAULT_MESSAGE_LIMIT),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || decodeMessageCursor(value) !== null, {
        message: 'Invalid pagination cursor.',
      }),
  })
  .strict();

export const MAX_EMOJI_LENGTH = 16;

export const emojiSchema = z
  .string({ error: 'Emoji is required.' })
  .refine((val) => !/[\r\n\t\0]/.test(val), {
    message: 'Emoji contains invalid characters.',
  })
  .transform((val) => val.trim())
  .pipe(
    z
      .string()
      .min(1, 'Emoji is required.')
      .max(MAX_EMOJI_LENGTH, `Emoji cannot exceed ${MAX_EMOJI_LENGTH} characters.`),
  );

export const addReactionSchema = z.object({ emoji: emojiSchema }).strict();

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type AddReactionInput = z.infer<typeof addReactionSchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
