/**
 * Workspace request validation (Phase 2A).
 *
 * Zod schemas per the backend stack (docs/04: Zod for request validation).
 * Clients may set `name` and an optional custom `slug` on create —
 * userId/ownerId/role are rejected by `.strict()` so session identity can
 * never be overridden. `slug` is server-slugified and uniqueness-retried.
 */

import { z } from 'zod';

export const MAX_WORKSPACE_NAME_LENGTH = 100;
export const MAX_WORKSPACE_SLUG_LENGTH = 48;

export const workspaceNameSchema = z
  .string({ error: 'Enter a workspace name.' })
  .trim()
  .min(1, 'Enter a workspace name.')
  .max(
    MAX_WORKSPACE_NAME_LENGTH,
    `Use a shorter workspace name (${MAX_WORKSPACE_NAME_LENGTH} characters or fewer).`,
  );

export const workspaceSlugSchema = z
  .string({ error: 'Enter a valid workspace URL.' })
  .trim()
  .min(1, 'Enter a valid workspace URL.')
  .max(
    MAX_WORKSPACE_SLUG_LENGTH,
    `Use a shorter workspace URL (${MAX_WORKSPACE_SLUG_LENGTH} characters or fewer).`,
  )
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use only lowercase letters, numbers, and hyphens for the workspace URL.',
  );

export const createWorkspaceSchema = z
  .object({
    name: workspaceNameSchema,
    slug: workspaceSlugSchema.optional(),
  })
  .strict();

export const updateWorkspaceSchema = z.object({ name: workspaceNameSchema }).strict();

export const workspaceMemberRoleSchema = z.enum(['ADMIN', 'MEMBER'], {
  error: 'Role must be ADMIN or MEMBER.',
});

export const updateWorkspaceMemberSchema = z.object({ role: workspaceMemberRoleSchema }).strict();

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type UpdateWorkspaceMemberInput = z.infer<typeof updateWorkspaceMemberSchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
