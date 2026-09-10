/**
 * Channel request validation (Phase 3A).
 *
 * Only `name`, `description`, and `type` are ever accepted — `.strict()`
 * rejects workspaceId/createdById/userId/role/slug overrides so session
 * identity and server rules can never be overridden from the body.
 */

import { z } from 'zod';

export const MAX_CHANNEL_NAME_LENGTH = 80;
export const MAX_CHANNEL_DESCRIPTION_LENGTH = 250;

export const channelNameSchema = z
  .string({ error: 'Enter a channel name.' })
  .trim()
  .min(1, 'Enter a channel name.')
  .max(
    MAX_CHANNEL_NAME_LENGTH,
    `Use a shorter channel name (${MAX_CHANNEL_NAME_LENGTH} characters or fewer).`,
  );

export const channelDescriptionSchema = z
  .string({ error: 'Enter a valid description.' })
  .trim()
  .max(
    MAX_CHANNEL_DESCRIPTION_LENGTH,
    `Use a shorter description (${MAX_CHANNEL_DESCRIPTION_LENGTH} characters or fewer).`,
  )
  .nullable()
  .optional();

export const channelTypeSchema = z.enum(['PUBLIC', 'PRIVATE'], {
  error: 'Channel type must be PUBLIC or PRIVATE.',
});

export const createChannelSchema = z
  .object({
    name: channelNameSchema,
    description: channelDescriptionSchema,
    type: channelTypeSchema.default('PUBLIC'),
  })
  .strict();

export const updateChannelSchema = z
  .object({
    name: channelNameSchema.optional(),
    description: channelDescriptionSchema,
  })
  .strict()
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: 'Provide a name or description to update.',
  });

export const addChannelMemberSchema = z
  .object({ userId: z.string().trim().min(1, 'User ID is required.') })
  .strict();

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type AddChannelMemberInput = z.infer<typeof addChannelMemberSchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
