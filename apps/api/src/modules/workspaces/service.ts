/**
 * Workspace domain operations (Phase 2A).
 *
 * Pure database logic — no Express, no session handling. Every function takes
 * an explicit PrismaClient (the app passes the shared singleton; tests pass
 * whichever client they need). Authorization lives in `authorization.ts` and
 * the routes; the service assumes the caller already checked membership,
 * except where noted.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient, WorkspaceRole } from '@teamflow/db';
import { slugify, withSlugSuffix } from './slug';

/** Safe workspace representation returned by the API (role = caller's own). */
export interface WorkspaceWithRole {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

/** Slug-collision retries before surfacing a 409 (unique constraint is authoritative). */
const MAX_SLUG_ATTEMPTS = 10;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super('Workspace not found.');
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceSlugConflictError extends Error {
  constructor() {
    super('Could not create a unique workspace URL. Please try a different name.');
    this.name = 'WorkspaceSlugConflictError';
  }
}

export class WorkspaceMemberNotFoundError extends Error {
  constructor() {
    super('Workspace member not found.');
    this.name = 'WorkspaceMemberNotFoundError';
  }
}

export class WorkspaceMemberConflictError extends Error {
  constructor(message = 'Workspace member operation conflict.') {
    super(message);
    this.name = 'WorkspaceMemberConflictError';
  }
}

export class WorkspaceForbiddenError extends Error {
  constructor(message = 'You do not have permission.') {
    super(message);
    this.name = 'WorkspaceForbiddenError';
  }
}

function toResponse(
  workspace: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date },
  role: WorkspaceRole,
): WorkspaceWithRole {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * Create a workspace with the creator as OWNER, atomically in one
 * transaction. Slug collisions retry with numeric suffixes; the database
 * unique constraint is the final authority.
 */
export async function createWorkspace(
  prisma: PrismaClient,
  input: { userId: string; name: string },
): Promise<WorkspaceWithRole> {
  const base = slugify(input.name);
  for (let attempt = 0; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : withSlugSuffix(base, attempt + 1);
    try {
      const workspace = await prisma.$transaction(async (tx) => {
        const created = await tx.workspace.create({
          data: { id: randomUUID(), name: input.name, slug },
        });
        await tx.workspaceMembership.create({
          data: {
            id: randomUUID(),
            workspaceId: created.id,
            userId: input.userId,
            role: 'OWNER',
          },
        });
        return created;
      });
      return toResponse(workspace, 'OWNER');
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_SLUG_ATTEMPTS) {
        continue;
      }
      if (isUniqueConstraintError(error)) {
        throw new WorkspaceSlugConflictError();
      }
      throw error;
    }
  }
  throw new WorkspaceSlugConflictError();
}

/** Workspaces where the user has a membership, each with the caller's role. */
export async function listWorkspaces(
  prisma: PrismaClient,
  input: { userId: string },
): Promise<WorkspaceWithRole[]> {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId: input.userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.map((membership) => toResponse(membership.workspace, membership.role));
}

/**
 * Workspace by ID for membership-checked callers. Returns null when the
 * workspace is missing OR the user is not a member (non-enumerating).
 */
export async function getWorkspaceForMember(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string },
): Promise<WorkspaceWithRole | null> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    include: { workspace: true },
  });
  if (!membership) {
    return null;
  }
  return toResponse(membership.workspace, membership.role);
}

/**
 * Rename a workspace (slug immutable). Throws WorkspaceNotFoundError when the
 * workspace vanished between the membership check and the update.
 */
export async function renameWorkspace(
  prisma: PrismaClient,
  input: { workspaceId: string; name: string },
): Promise<{ id: string; name: string; slug: string; createdAt: Date; updatedAt: Date }> {
  try {
    return await prisma.workspace.update({
      where: { id: input.workspaceId },
      data: { name: input.name },
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new WorkspaceNotFoundError();
    }
    throw error;
  }
}

/**
 * Delete a workspace. Memberships cascade at the database level; Better Auth
 * users are never touched. Throws WorkspaceNotFoundError on races.
 */
export async function deleteWorkspace(
  prisma: PrismaClient,
  input: { workspaceId: string },
): Promise<void> {
  try {
    await prisma.workspace.delete({ where: { id: input.workspaceId } });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new WorkspaceNotFoundError();
    }
    throw error;
  }
}

/** Safe member representation: identity + role only, never credentials. */
export interface WorkspaceMemberWithUser {
  id: string;
  role: WorkspaceRole;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

/**
 * Update a member's role. Only ADMIN↔MEMBER is allowed via this endpoint;
 * OWNER is immutable here (prevents accidental ownerless workspace). Caller
 * must have verified requester is OWNER and target is in same workspace.
 * Protects the last OWNER from demotion. Idempotent if same role.
 */
export async function updateWorkspaceMemberRole(
  prisma: PrismaClient,
  input: { workspaceId: string; targetUserId: string; newRole: WorkspaceRole },
): Promise<WorkspaceMemberWithUser> {
  if (input.newRole === 'OWNER') {
    throw new WorkspaceMemberConflictError('Cannot assign OWNER via this endpoint.');
  }
  const target = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new WorkspaceMemberNotFoundError();
  }
  if (target.role === input.newRole) {
    const full = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    if (!full) throw new WorkspaceMemberNotFoundError();
    return { id: full.id, role: full.role, createdAt: full.createdAt, user: full.user };
  }
  if (target.role === 'OWNER') {
    // OWNER demotion requires ownership transfer workflow which does not exist.
    throw new WorkspaceMemberConflictError('Cannot change the OWNER role via this endpoint.');
  }
  const updated = await prisma.workspaceMembership.update({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } },
    data: { role: input.newRole },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  return { id: updated.id, role: updated.role, createdAt: updated.createdAt, user: updated.user };
}

/**
 * Remove a member from a workspace. Caller must have verified requester is
 * OWNER. Protects the last OWNER from removal. Preserves ChannelMembership
 * rows (they become inaccessible via workspace boundary) to avoid destructive
 * cascades; realtime rooms are revoked post-commit.
 */
export async function removeWorkspaceMember(
  prisma: PrismaClient,
  input: { workspaceId: string; targetUserId: string },
): Promise<void> {
  const target = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new WorkspaceMemberNotFoundError();
  }
  if (target.role === 'OWNER') {
    const ownerCount = await prisma.workspaceMembership.count({
      where: { workspaceId: input.workspaceId, role: 'OWNER' },
    });
    if (ownerCount <= 1) {
      throw new WorkspaceMemberConflictError('Cannot remove the only OWNER.');
    }
  }
  await prisma.workspaceMembership.delete({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } },
  });
}

/**
 * Members of a workspace with their users, in one query (no N+1).
 * Deterministic order: OWNER first, then ADMIN, then MEMBER (PostgreSQL
 * enums sort in definition order, matching the migration); ties break by
 * membership creation time, then id. Callers must verify membership first —
 * this function does not authorize.
 */
export async function listWorkspaceMembers(
  prisma: PrismaClient,
  input: { workspaceId: string },
): Promise<WorkspaceMemberWithUser[]> {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId: input.workspaceId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  return memberships.map((membership) => ({
    id: membership.id,
    role: membership.role,
    createdAt: membership.createdAt,
    user: {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      image: membership.user.image,
    },
  }));
}
