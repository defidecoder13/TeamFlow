/**
 * Invitation request validation (Phase 2F-A).
 *
 * Only the fields the endpoints support are accepted — `.strict()` rejects
 * invitedById/role/token/expiresAt/userId/workspaceId overrides so session
 * identity and server rules can never be overridden from the body.
 */

import { z } from 'zod';

export const MAX_INVITATION_EMAIL_LENGTH = 254;

const emailField = z
  .string({ error: 'Enter an email address.' })
  .trim()
  .min(1, 'Enter an email address.')
  .max(MAX_INVITATION_EMAIL_LENGTH, 'Enter a shorter email address.')
  .toLowerCase()
  .email('Enter a valid email address.');

export const createInvitationSchema = z.object({ email: emailField }).strict();

export const acceptInvitationSchema = z
  .object({
    token: z
      .string({ error: 'Enter an invitation token.' })
      .trim()
      .min(1, 'Enter an invitation token.'),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
