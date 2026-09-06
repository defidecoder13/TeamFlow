/**
 * Invitation token + email primitives (Phase 2F-A).
 *
 * Pure functions, independently testable:
 * - tokens come from `crypto.randomBytes` (never Math.random/timestamps/IDs)
 * - only the SHA-256 hash is ever stored (see service.ts)
 * - emails are normalized (trimmed + lowercased) for invitation identity
 */

import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of entropy, base64url-encoded (43 chars, URL-safe). */
export const INVITATION_TOKEN_BYTES = 32;

export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex digest — the only token form that touches PostgreSQL. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Canonical invitation identity: trimmed + lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
