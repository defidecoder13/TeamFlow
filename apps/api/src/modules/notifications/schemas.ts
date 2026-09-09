/**
 * Notification request validation (Phase 4H.5).
 *
 * Strict schemas: only documented parameters pass. Identity and workspace
 * context always resolve server-side from the session and URL — the client
 * can never supply a recipient, workspace membership, or role.
 */

import { z } from 'zod';
import { decodeNotificationCursor } from './cursor';

export const DEFAULT_NOTIFICATION_LIMIT = 50;
export const MAX_NOTIFICATION_LIMIT = 100;

export const notificationTypeSchema = z.enum(
  ['MENTION', 'DM_MESSAGE', 'GROUP_MESSAGE', 'THREAD_REPLY'],
  {
    error: 'Notification type must be MENTION, DM_MESSAGE, GROUP_MESSAGE, or THREAD_REPLY.',
  },
);

export type NotificationTypeFilter = z.infer<typeof notificationTypeSchema>;

export const notificationListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_NOTIFICATION_LIMIT)
      .default(DEFAULT_NOTIFICATION_LIMIT),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || decodeNotificationCursor(value) !== null, {
        message: 'Invalid pagination cursor.',
      }),
    unreadOnly: z
      .enum(['true', 'false'], { error: 'Invalid unreadOnly filter.' })
      .default('false')
      .transform((value) => value === 'true'),
    type: notificationTypeSchema.optional(),
  })
  .strict();

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
