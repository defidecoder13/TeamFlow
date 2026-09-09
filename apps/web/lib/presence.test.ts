/**
 * Unit tests for client-side presence validation and parsing (Phase 4I.3).
 */

import { describe, expect, it } from 'vitest';
import {
  parsePresenceStatus,
  parseUserPresence,
  parseWorkspacePresenceResponse,
  type UserPresence,
} from './presence';

describe('presence client validation', () => {
  describe('parsePresenceStatus', () => {
    it('accepts valid status strings', () => {
      expect(parsePresenceStatus('ONLINE')).toBe('ONLINE');
      expect(parsePresenceStatus('OFFLINE')).toBe('OFFLINE');
      expect(parsePresenceStatus('AWAY')).toBe('AWAY');
    });

    it('rejects invalid or malformed status strings', () => {
      expect(parsePresenceStatus('UNKNOWN')).toBeNull();
      expect(parsePresenceStatus(null)).toBeNull();
      expect(parsePresenceStatus(123)).toBeNull();
      expect(parsePresenceStatus({})).toBeNull();
    });
  });

  describe('parseUserPresence', () => {
    it('parses valid online presence object', () => {
      const parsed = parseUserPresence({
        userId: 'user-1',
        status: 'ONLINE',
        lastSeenAt: null,
      });
      expect(parsed).toEqual<UserPresence>({
        userId: 'user-1',
        status: 'ONLINE',
        lastSeenAt: null,
      });
    });

    it('parses valid offline presence with lastSeenAt', () => {
      const parsed = parseUserPresence({
        userId: 'user-2',
        status: 'OFFLINE',
        lastSeenAt: '2026-09-09T18:00:00.000Z',
      });
      expect(parsed).toEqual<UserPresence>({
        userId: 'user-2',
        status: 'OFFLINE',
        lastSeenAt: '2026-09-09T18:00:00.000Z',
      });
    });

    it('rejects objects missing userId or with invalid status', () => {
      expect(parseUserPresence({ status: 'ONLINE' })).toBeNull();
      expect(parseUserPresence({ userId: '', status: 'ONLINE' })).toBeNull();
      expect(parseUserPresence({ userId: 'u-1', status: 'INVALID' })).toBeNull();
      expect(parseUserPresence(null)).toBeNull();
      expect(parseUserPresence('string')).toBeNull();
    });
  });

  describe('parseWorkspacePresenceResponse', () => {
    it('parses valid workspace presence payload', () => {
      const parsed = parseWorkspacePresenceResponse({
        presence: [
          { userId: 'u-1', status: 'ONLINE', lastSeenAt: null },
          { userId: 'u-2', status: 'OFFLINE', lastSeenAt: '2026-09-09T18:00:00.000Z' },
        ],
      });
      expect(parsed).toHaveLength(2);
      expect(parsed?.[0].userId).toBe('u-1');
      expect(parsed?.[1].userId).toBe('u-2');
    });

    it('rejects payload if presence array is missing or contains invalid item', () => {
      expect(parseWorkspacePresenceResponse({})).toBeNull();
      expect(parseWorkspacePresenceResponse({ presence: 'not-array' })).toBeNull();
      expect(
        parseWorkspacePresenceResponse({
          presence: [{ userId: 'u-1', status: 'ONLINE' }, { invalid: true }],
        }),
      ).toBeNull();
    });
  });
});
