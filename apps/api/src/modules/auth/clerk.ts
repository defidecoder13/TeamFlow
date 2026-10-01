/**
 * Clerk session verification for the Express API (Clerk migration).
 *
 * Identity ALWAYS comes from a verified Clerk session token (`Authorization:
 * Bearer`), never from client-supplied fields. The verified Clerk user id
 * (`sub`) maps to exactly one local `User` row via `User.clerkId`
 * (provisioned on first sight); every downstream consumer keeps using the
 * local id, so workspace/channel/DM authorization is untouched.
 *
 * Error envelope matches the previous contract:
 *   401 { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }
 */

import { createClerkClient, verifyToken } from '@clerk/backend';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@teamflow/db';
import { getPrisma } from './prisma';
import { toSafeUser, type SafeAuthUser } from './session';

function requireEnv(name: 'CLERK_SECRET_KEY'): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Configure it in the API environment (never commit real secrets).`,
    );
  }
  return value;
}

/** Injectable token verifier (real JWT verification by default; fakes in tests). */
export type ClerkTokenVerifier = (token: string) => Promise<{ sub: string } | null>;

/** Injectable per-route overrides (real verification/provisioning by default; fakes in tests). */
export interface ClerkRouteOptions {
  verify?: ClerkTokenVerifier;
  directory?: ClerkDirectory;
}

async function defaultVerifyToken(token: string): Promise<{ sub: string } | null> {
  try {
    const claims = await verifyToken(token, { secretKey: requireEnv('CLERK_SECRET_KEY') });
    if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
      return null;
    }
    return { sub: claims.sub };
  } catch {
    return null;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Verify a raw Bearer token. Returns the Clerk user id or null. */
export async function verifyBearerToken(
  token: string | null | undefined,
  verify: ClerkTokenVerifier = defaultVerifyToken,
): Promise<{ clerkId: string } | null> {
  if (!token || token.trim().length === 0) {
    return null;
  }
  try {
    const verified = await verify(token.trim());
    if (!verified) {
      return null;
    }
    return { clerkId: verified.sub };
  } catch {
    return null;
  }
}

/** Verify the request's Bearer token. Returns the Clerk user id or null. */
export async function getClerkSession(
  req: Request,
  verify: ClerkTokenVerifier = defaultVerifyToken,
): Promise<{ clerkId: string } | null> {
  return verifyBearerToken(bearerToken(req), verify);
}

export type ClerkDirectoryUser = {
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
};

export type ClerkDirectory = {
  getUser: (clerkId: string) => Promise<ClerkDirectoryUser | null>;
};

function defaultDirectory(): ClerkDirectory {
  const client = createClerkClient({ secretKey: requireEnv('CLERK_SECRET_KEY') });
  return {
    async getUser(clerkId: string) {
      let remote: Awaited<ReturnType<typeof client.users.getUser>>;
      try {
        remote = await client.users.getUser(clerkId);
      } catch {
        return null;
      }
      const primary = remote.primaryEmailAddress;
      const email =
        primary?.emailAddress ?? remote.emailAddresses[0]?.emailAddress ?? null;
      if (!email) {
        return null;
      }
      const fullName = [remote.firstName, remote.lastName].filter(Boolean).join(' ').trim();
      return {
        email,
        name: fullName || remote.username || email.split('@')[0] || 'TeamFlow member',
        image: remote.imageUrl ?? null,
        emailVerified: primary?.verification?.status === 'verified',
      };
    },
  };
}

/**
 * Find-or-create the local user for a verified Clerk identity.
 * Race-safe: concurrent first-sight requests collapse via the unique
 * `clerkId` constraint (P2002 → re-read).
 */
export async function provisionClerkUser(
  prisma: PrismaClient,
  clerkId: string,
  directory: ClerkDirectory = defaultDirectory(),
): Promise<SafeAuthUser | null> {
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) {
    return toSafeUser(existing);
  }
  const remote = await directory.getUser(clerkId);
  if (!remote) {
    return null;
  }
  try {
    const created = await prisma.user.create({
      data: {
        id: randomUUID(),
        clerkId,
        name: remote.name,
        email: remote.email,
        image: remote.image,
        emailVerified: remote.emailVerified,
      },
    });
    return toSafeUser(created);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      const raced = await prisma.user.findUnique({ where: { clerkId } });
      return raced ? toSafeUser(raced) : null;
    }
    throw error;
  }
}

/** Resolve the authenticated local user from the request, or null. */
export async function getClerkAuthUser(
  req: Request,
  options: { verify?: ClerkTokenVerifier; directory?: ClerkDirectory } = {},
): Promise<SafeAuthUser | null> {
  const session = await getClerkSession(req, options.verify);
  if (!session) {
    return null;
  }
  try {
    return await provisionClerkUser(getPrisma(), session.clerkId, options.directory);
  } catch {
    return null;
  }
}

/**
 * Express middleware factory for protected routes. Attaches the
 * Clerk-derived local user to `req.authUser`; responds 401 when
 * unauthenticated. Takes optional verifier/directory overrides for tests.
 */
export function requireClerkAuth(options: {
  verify?: ClerkTokenVerifier;
  directory?: ClerkDirectory;
} = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let user: SafeAuthUser | null;
    try {
      user = await getClerkAuthUser(req, options);
    } catch (err) {
      next(err);
      return;
    }
    if (!user) {
      res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
      return;
    }
    req.authUser = user;
    next();
  };
}
