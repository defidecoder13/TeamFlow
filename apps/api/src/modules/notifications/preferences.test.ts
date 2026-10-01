/**
 * Notification preferences API & service unit tests (Phase 4H.8).
 *
 * Covers:
 * - GET /api/users/me/notification-preferences returns ALL defaults when row is absent
 * - GET returns persisted preferences when row exists
 * - PATCH updates fields independently via atomic upsert
 * - PATCH preserves untouched fields
 * - PATCH rejects invalid enum values, extra/unknown keys, userId tampering
 * - Authentication requirements (401 when unauthenticated)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@teamflow/db';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getNotificationPreferences, updateNotificationPreferences } from './preferences.service';
import {
  notificationDeliverySchema,
  updateNotificationPreferencesSchema,
} from './preferences.schemas';

const { mockGetPrisma } = vi.hoisted(() => ({
  mockGetPrisma: vi.fn(),
}));

vi.mock('../auth/prisma', () => ({
  getPrisma: (...args: unknown[]) => mockGetPrisma(...args),
}));

const CANNED_USER = {
  id: 'u-clerk-1',
  name: 'Clerk User',
  email: 'clerk@example.invalid',
  image: null,
  emailVerified: false,
};

function makePrisma() {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ ...CANNED_USER }) },
    userNotificationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

describe('Notification Preference Schemas', () => {
  it('validates NotificationDelivery enum', () => {
    expect(notificationDeliverySchema.safeParse('ALL').success).toBe(true);
    expect(notificationDeliverySchema.safeParse('NONE').success).toBe(true);
    expect(notificationDeliverySchema.safeParse('SOME').success).toBe(false);
    expect(notificationDeliverySchema.safeParse('').success).toBe(false);
    expect(notificationDeliverySchema.safeParse(null).success).toBe(false);
  });

  it('validates and rejects unknown keys in updateNotificationPreferencesSchema', () => {
    expect(
      updateNotificationPreferencesSchema.safeParse({
        mentionDelivery: 'ALL',
      }).success,
    ).toBe(true);

    expect(
      updateNotificationPreferencesSchema.safeParse({
        dmDelivery: 'NONE',
        threadReplyDelivery: 'ALL',
      }).success,
    ).toBe(true);

    // Empty payload is allowed as an object with all undefined fields
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(true);

    // Reject unknown keys / userId
    expect(
      updateNotificationPreferencesSchema.safeParse({
        mentionDelivery: 'ALL',
        userId: 'hacker-id',
      }).success,
    ).toBe(false);

    expect(
      updateNotificationPreferencesSchema.safeParse({
        mentionDelivery: 'ALL',
        extraField: true,
      }).success,
    ).toBe(false);
  });
});

describe('Notification Preferences Service', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    mockGetPrisma.mockReturnValue(prisma);
  });

  it('returns default ALL for all preferences when no database record exists', async () => {
    prisma.userNotificationPreference.findUnique.mockResolvedValue(null);

    const prefs = await getNotificationPreferences(prisma as unknown as PrismaClient, 'user-1');
    expect(prefs).toEqual({
      mentionDelivery: 'ALL',
      dmDelivery: 'ALL',
      threadReplyDelivery: 'ALL',
    });
    expect(prisma.userNotificationPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        mentionDelivery: true,
        dmDelivery: true,
        threadReplyDelivery: true,
      },
    });
  });

  it('returns stored values when database record exists', async () => {
    prisma.userNotificationPreference.findUnique.mockResolvedValue({
      mentionDelivery: 'NONE',
      dmDelivery: 'ALL',
      threadReplyDelivery: 'NONE',
    });

    const prefs = await getNotificationPreferences(prisma as unknown as PrismaClient, 'user-1');
    expect(prefs).toEqual({
      mentionDelivery: 'NONE',
      dmDelivery: 'ALL',
      threadReplyDelivery: 'NONE',
    });
  });

  it('upserts preferences atomically on update', async () => {
    prisma.userNotificationPreference.upsert.mockResolvedValue({
      mentionDelivery: 'NONE',
      dmDelivery: 'ALL',
      threadReplyDelivery: 'ALL',
    });

    const res = await updateNotificationPreferences(prisma as unknown as PrismaClient, 'user-1', {
      mentionDelivery: 'NONE',
    });

    expect(prisma.userNotificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        mentionDelivery: 'NONE',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      },
      update: {
        mentionDelivery: 'NONE',
      },
      select: {
        mentionDelivery: true,
        dmDelivery: true,
        threadReplyDelivery: true,
      },
    });
    expect(res.mentionDelivery).toBe('NONE');
  });
});

describe('Notification Preferences Router /api/users/me/notification-preferences', () => {
  const fakes = createClerkFakes('preferences');
  let prisma: MockPrisma;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    prisma = makePrisma();
    mockGetPrisma.mockReturnValue(prisma);
    app = createApp(fakes.appDeps());
  });

  it('requires authentication for GET and PATCH', async () => {
    const getRes = await request(app).get('/api/users/me/notification-preferences');
    expect(getRes.status).toBe(401);
    expect(getRes.body.error.code).toBe('UNAUTHENTICATED');

    const patchRes = await request(app)
      .patch('/api/users/me/notification-preferences')
      .send({ mentionDelivery: 'NONE' });
    expect(patchRes.status).toBe(401);
    expect(patchRes.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns preferences for authenticated user on GET', async () => {
    prisma.userNotificationPreference.findUnique.mockResolvedValue({
      mentionDelivery: 'ALL',
      dmDelivery: 'NONE',
      threadReplyDelivery: 'ALL',
    });

    const res = await request(app)
      .get('/api/users/me/notification-preferences')
      .set(fakes.headersFor('user'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mentionDelivery: 'ALL',
      dmDelivery: 'NONE',
      threadReplyDelivery: 'ALL',
    });
  });

  it('updates preferences for authenticated user on PATCH', async () => {
    prisma.userNotificationPreference.upsert.mockResolvedValue({
      mentionDelivery: 'NONE',
      dmDelivery: 'NONE',
      threadReplyDelivery: 'ALL',
    });

    const res = await request(app)
      .patch('/api/users/me/notification-preferences')
      .set(fakes.headersFor('user'))
      .send({
        mentionDelivery: 'NONE',
        dmDelivery: 'NONE',
      });

    expect(res.status).toBe(200);
    expect(res.body.mentionDelivery).toBe('NONE');
    expect(res.body.dmDelivery).toBe('NONE');
    expect(res.body.threadReplyDelivery).toBe('ALL');
  });

  it('rejects invalid fields with 400', async () => {
    const res = await request(app)
      .patch('/api/users/me/notification-preferences')
      .set(fakes.headersFor('user'))
      .send({
        mentionDelivery: 'INVALID_VALUE',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
