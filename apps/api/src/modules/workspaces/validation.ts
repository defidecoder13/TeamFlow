/**
 * Workspace request validation (Phase 2A).
 *
 * Zod schemas per the backend stack (docs/04: Zod for request validation).
 * Only `name` is ever accepted from clients — userId/ownerId/role/slug are
 * rejected by `.strict()` so session identity can never be overridden.
 */

import { z } from 'zod';

export const MAX_WORKSPACE_NAME_LENGTH = 100;

export const workspaceNameSchema = z
  .string({ error: 'Enter a workspace name.' })
  .trim()
  .min(1, 'Enter a workspace name.')
  .max(
    MAX_WORKSPACE_NAME_LENGTH,
    `Use a shorter workspace name (${MAX_WORKSPACE_NAME_LENGTH} characters or fewer).`,
  );

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema }).strict();

export const updateWorkspaceSchema = z.object({ name: workspaceNameSchema }).strict();

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
