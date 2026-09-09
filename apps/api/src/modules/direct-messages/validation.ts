import { z } from 'zod';
import { decodeConversationCursor } from './cursor';

export const createDirectConversationSchema = z
  .object({
    recipientId: z.string().trim().min(1, 'Recipient ID is required.').optional(),
    targetUserId: z.string().trim().min(1, 'Recipient ID is required.').optional(),
  })
  .strict()
  .refine((data) => Boolean(data.recipientId || data.targetUserId), {
    message: 'Recipient ID is required.',
  })
  .transform((data) => ({
    recipientId: (data.recipientId || data.targetUserId)!,
  }));

export const directConversationListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || decodeConversationCursor(value) !== null, {
        message: 'Invalid pagination cursor.',
      }),
  })
  .strict();

export const createDirectMessageSchema = z
  .object({
    body: z
      .string({ error: 'Message body is required.' })
      .trim()
      .min(1, 'Message cannot be empty.')
      .max(10000, 'Message exceeds 10,000 character limit.'),
  })
  .strict();

export const markDirectConversationReadSchema = z
  .object({
    messageId: z.string().trim().min(1, 'Message ID must not be empty.').optional(),
  })
  .strict();

export function hasControlCharacters(val: string): boolean {
  for (let i = 0; i < val.length; i++) {
    const code = val.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

export const groupNameSchema = z
  .string({ error: 'Group name is required.' })
  .trim()
  .min(1, 'Group name cannot be empty.')
  .max(100, 'Group name cannot exceed 100 characters.')
  .refine((val) => !hasControlCharacters(val), {
    message: 'Group name must not contain newlines or control characters.',
  });

export const createGroupConversationSchema = z
  .object({
    participantIds: z
      .array(z.string().trim().min(1, 'Participant ID must not be empty.'))
      .min(2, 'At least 2 other participants are required for a group conversation.')
      .max(19, 'A group conversation cannot exceed 20 participants.')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Duplicate participants are not allowed.',
      }),
    name: groupNameSchema.optional(),
  })
  .strict();

export const addConversationParticipantSchema = z
  .object({
    userId: z.string().trim().min(1, 'User ID is required.'),
  })
  .strict();

export const renameGroupConversationSchema = z
  .object({
    name: groupNameSchema,
  })
  .strict();

export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>;
export type CreateGroupConversationInput = z.infer<typeof createGroupConversationSchema>;
export type AddConversationParticipantInput = z.infer<typeof addConversationParticipantSchema>;
export type RenameGroupConversationInput = z.infer<typeof renameGroupConversationSchema>;
export type DirectConversationListQuery = z.infer<typeof directConversationListQuerySchema>;
export type CreateDirectMessageInput = z.infer<typeof createDirectMessageSchema>;
export type MarkDirectConversationReadInput = z.infer<typeof markDirectConversationReadSchema>;

export function firstValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : 'Validation failed.';
}
