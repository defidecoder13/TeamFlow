/**
 * Clerk fakes for API tests (Clerk migration).
 *
 * Replaces the retired Better Auth memory-adapter + cookie-agent pattern:
 * every test identity is a deterministic Clerk user id + Bearer token, and
 * the local `User` row is provisioned on first sight through the fake
 * directory (same code path as production provisioning).
 *
 * Usage per file:
 *   const fakes = createClerkFakes(RUN_TAG);
 *   const app = createApp(fakes.appDeps());
 *   await requestAs(app, fakes, 'owner').post('/api/workspaces').send({...});
 */

import type { Express } from 'express';
import request from 'supertest';
import type { ClerkDirectory, ClerkTokenVerifier } from '../modules/auth/index';

export interface ClerkTestProfile {
  name?: string;
  image?: string | null;
  emailVerified?: boolean;
}

export interface ClerkTestFakes {
  verify: ClerkTokenVerifier;
  directory: ClerkDirectory;
  clerkIdFor: (who: string) => string;
  emailFor: (who: string) => string;
  tokenFor: (who: string) => string;
  headersFor: (who: string) => { Authorization: string };
  setProfile: (who: string, profile: ClerkTestProfile) => void;
  /**
   * Pin a custom email for `who` (invitations addressed to an arbitrary
   * email must be accepted by a user holding that email). Call before any
   * provisioning request or email lookup for `who`.
   */
  setEmail: (who: string, email: string) => void;
  appDeps: () => { verify: ClerkTokenVerifier; directory: ClerkDirectory };
}

const displayName = (who: string): string =>
  who.length === 0 ? 'Test User' : who.charAt(0).toUpperCase() + who.slice(1) + ' User';

export function createClerkFakes(tag: string): ClerkTestFakes {
  const prefix = `clerk-test-${tag}-`;
  const clerkIdFor = (who: string): string => `${prefix}${who}`;
  const defaultEmailFor = (who: string): string => `clerk-${tag}-${who}@example.invalid`;
  const emailOverrides = new Map<string, string>();
  const emailFor = (who: string): string => emailOverrides.get(who) ?? defaultEmailFor(who);
  const tokenFor = (who: string): string => {
    const token = `test-token-${tag}-${who}`;
    // Register on issue so raw tokens (sockets) verify without headersFor.
    tokenToClerkId.set(token, clerkIdFor(who));
    return token;
  };
  const tokenToClerkId = new Map<string, string>();
  const profiles = new Map<string, ClerkTestProfile>();

  const verify: ClerkTokenVerifier = async (token: string) => {
    const clerkId = tokenToClerkId.get(token);
    return clerkId ? { sub: clerkId } : null;
  };

  const headersFor = (who: string): { Authorization: string } => {
    const token = tokenFor(who);
    tokenToClerkId.set(token, clerkIdFor(who));
    return { Authorization: `Bearer ${token}` };
  };

  const setProfile = (who: string, profile: ClerkTestProfile): void => {
    profiles.set(who, profile);
  };

  const setEmail = (who: string, email: string): void => {
    emailOverrides.set(who, email);
  };

  const directory: ClerkDirectory = {
    getUser: async (clerkId: string) => {
      if (!clerkId.startsWith(prefix)) {
        return null;
      }
      const who = clerkId.slice(prefix.length);
      if (!who) {
        return null;
      }
      const override = profiles.get(who);
      return {
        email: emailFor(who),
        name: override?.name ?? displayName(who),
        image: override?.image ?? null,
        emailVerified: override?.emailVerified ?? false,
      };
    },
  };

  return {
    verify,
    directory,
    clerkIdFor,
    emailFor,
    tokenFor,
    headersFor,
    setProfile,
    setEmail,
    appDeps: () => ({ verify, directory }),
  };
}

/**
 * Supertest requests pre-authenticated as `who` (drop-in for the retired
 * cookie `agent`: `authed('owner').post(url).send(...)` chains identically,
 * including further `.set(...)` calls).
 */
export function requestAs(
  app: Express,
  fakes: Pick<ClerkTestFakes, 'headersFor'>,
  who: string,
): {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  put: (url: string) => request.Test;
  delete: (url: string) => request.Test;
} {
  const headers = fakes.headersFor(who);
  return {
    get: (url: string) => request(app).get(url).set(headers),
    post: (url: string) => request(app).post(url).set(headers),
    patch: (url: string) => request(app).patch(url).set(headers),
    put: (url: string) => request(app).put(url).set(headers),
    delete: (url: string) => request(app).delete(url).set(headers),
  };
}
