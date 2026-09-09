/**
 * User notification preference schemas (Phase 4H.8).
 *
 * Strict validation: only mentionDelivery, dmDelivery, and threadReplyDelivery
 * with enum values 'ALL' | 'NONE' are accepted. Rejects unknown fields (including userId).
 */

import { z } from 'zod';

export const notificationDeliverySchema = z.enum(['ALL', 'NONE'], {
  error: 'Delivery preference must be ALL or NONE.',
});

export const updateNotificationPreferencesSchema = z
  .object({
    mentionDelivery: notificationDeliverySchema.optional(),
    dmDelivery: notificationDeliverySchema.optional(),
    threadReplyDelivery: notificationDeliverySchema.optional(),
  })
  .strict();

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
