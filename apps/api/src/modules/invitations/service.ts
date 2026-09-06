/**
 * Invitation domain operations (Phase 2F-A).
 *
 * Pure database logic — no Express, no session handling. Every function takes
 * an explicit PrismaClient. Security properties:
 *
 * - raw tokens never touch PostgreSQL (SHA-256 hash only; see tokens.ts)
 * - the pending invariant (one active invitation per workspace + email) is
 *   enforced inside transactions guarded by a Postgres advisory lock, so
 *   concurrent creates cannot duplicate and concurrent accepts cannot
 *   double-issue memberships
 * - acceptance is atomic: membership creation + invitation consumption commit
 *   together, or neither does
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient, WorkspaceRole } from '@teamflow/db';
import { generateInvitationToken, hashInvitationToken, normalizeEmail } from './tokens';

/** Default invitation lifetime: 7 days. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Namespaces concurrent-invitation advisory locks (stable scope string). */
const ADVISORY_LOCK_SCOPE = 'teamflow-invitations-v1';

/**
 * Serialize concurrent operations on the same invitation key for the
 * transaction's lifetime. Uses the single-bigint advisory-lock variant
 * (`hashtextextended` yields bigint directly).
 */
async function takeAdvisoryLock(tx: Pick<PrismaClient, '$executeRaw'>, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ADVISORY_LOCK_SCOPE}:${key}`}, 0))`;
}

export class InvitationInvalidError extends Error {
  constructor() {
    super('This invitation is invalid or has expired.');
    this.name = 'InvitationInvalidError';
  }
}

export class InvitationForbiddenError extends Error {
  constructor() {
    super('This invitation was sent to a different email address.');
    this.name = 'InvitationForbiddenError';
  }
}

export class InvitationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvitationConflictError';
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export interface CreatedInvitation {
  id: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  token: string;
}

export interface PendingInvitationView {
  id: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { id: string; name: string; email: string };
}

export interface AcceptedMembership {
  workspace: { id: string; name: string; slug: string };
  membership: { id: string; role: WorkspaceRole; createdAt: Date };
  alreadyMember: boolean;
}

/**
 * Create a pending invitation. The caller must have verified the inviter's
 * OWNER/ADMIN membership beforehand. Returns the record plus the raw token
 * (returned once, for the future email/UI layer — never stored or logged).
 */
export async function createInvitation(
  prisma: PrismaClient,
  input: { workspaceId: string; inviterUserId: string; email: string },
): Promise<CreatedInvitation> {
  const email = normalizeEmail(input.email);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await takeAdvisoryLock(tx, `invite:${input.workspaceId}:${email}`);

        const existingUser = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existingUser) {
          const membership = await tx.workspaceMembership.findUnique({
            where: {
              workspaceId_userId: { workspaceId: input.workspaceId, userId: existingUser.id },
            },
            select: { id: true },
          });
          if (membership) {
            throw new InvitationConflictError('This person is already a member of the workspace.');
          }
        }

        const pending = await tx.invitation.findFirst({
          where: {
            workspaceId: input.workspaceId,
            email,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (pending) {
          throw new InvitationConflictError(
            'An invitation is already pending for this email address.',
          );
        }

        const token = generateInvitationToken();
        const now = new Date();
        const invitation = await tx.invitation.create({
          data: {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            email,
            tokenHash: hashInvitationToken(token),
            invitedById: input.inviterUserId,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
        });
        return {
          id: invitation.id,
          email: invitation.email,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          token,
        };
      });
    } catch (error) {
      if (error instanceof InvitationConflictError) {
        throw error;
      }
      // Astronomically unlikely token-hash collision: fresh token, retry.
      if (isUniqueConstraintError(error) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new InvitationConflictError('Could not create the invitation. Please try again.');
}

/**
 * Pending invitations for a workspace, newest first. Excludes accepted,
 * revoked, and expired rows. Never includes token material.
 */
export async function listPendingInvitations(
  prisma: PrismaClient,
  input: { workspaceId: string },
): Promise<PendingInvitationView[]> {
  const invitations = await prisma.invitation.findMany({
    where: {
      workspaceId: input.workspaceId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return invitations;
}

/**
 * Accept an invitation by raw token. The token is hashed before any database
 * access — the raw value is never queried. The accepting user's normalized
 * email must match the invitation. Exactly-once semantics: concurrent
 * accepts serialize on an advisory lock over the token hash, so the second
 * request safely observes the consumed invitation.
 */
export async function acceptInvitation(
  prisma: PrismaClient,
  input: { token: string; userId: string; userEmail: string },
): Promise<AcceptedMembership> {
  const tokenHash = hashInvitationToken(input.token);
  const email = normalizeEmail(input.userEmail);
  try {
    return await prisma.$transaction(async (tx) => {
      await takeAdvisoryLock(tx, `accept:${tokenHash}`);

      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        include: { workspace: { select: { id: true, name: true, slug: true } } },
      });
      if (
        !invitation ||
        invitation.acceptedAt !== null ||
        invitation.revokedAt !== null ||
        invitation.expiresAt <= new Date()
      ) {
        throw new InvitationInvalidError();
      }
      if (normalizeEmail(invitation.email) !== email) {
        throw new InvitationForbiddenError();
      }

      const existing = await tx.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: invitation.workspaceId, userId: input.userId },
        },
      });
      if (existing) {
        // Defensive idempotency: spend the single-use token and report the
        // current membership instead of failing or duplicating.
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        return {
          workspace: invitation.workspace,
          membership: { id: existing.id, role: existing.role, createdAt: existing.createdAt },
          alreadyMember: true,
        };
      }

      const membership = await tx.workspaceMembership.create({
        data: {
          id: randomUUID(),
          workspaceId: invitation.workspaceId,
          userId: input.userId,
          role: 'MEMBER',
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return {
        workspace: invitation.workspace,
        membership: { id: membership.id, role: membership.role, createdAt: membership.createdAt },
        alreadyMember: false,
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new InvitationConflictError('This person is already a member of the workspace.');
    }
    throw error;
  }
}
