import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@teamflow/db';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { cleanUpMessageR2Objects, type StorageService } from './index';

const fakes = createClerkFakes('attachments');

const mockUsers: Record<string, { id: string; name: string; email: string; image: null; emailVerified: boolean }> = {
  [fakes.clerkIdFor('userA')]: { id: 'u-a', name: 'Attachment User A', email: fakes.emailFor('userA'), image: null, emailVerified: false },
  [fakes.clerkIdFor('userB')]: { id: 'u-b', name: 'Attachment User B', email: fakes.emailFor('userB'), image: null, emailVerified: false },
};

const mockPrisma = {
  user: { findUnique: vi.fn() },
  message: {
    findUnique: vi.fn(),
  },
  channel: {
    findUnique: vi.fn(),
  },
  workspaceMembership: {
    findUnique: vi.fn(),
  },
  channelMembership: {
    findUnique: vi.fn(),
  },
  directMessageConversation: {
    findUnique: vi.fn(),
  },
  directMessageParticipant: {
    findUnique: vi.fn(),
  },
  attachment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
};

const prisma = mockPrisma as unknown as PrismaClient;

const mockStorageService = {
  createPresignedUploadUrl: vi.fn<StorageService['createPresignedUploadUrl']>(),
  createPresignedDownloadUrl: vi.fn<StorageService['createPresignedDownloadUrl']>(),
  deleteObject: vi.fn<StorageService['deleteObject']>(),
  headObject: vi.fn<StorageService['headObject']>(),
  checkConnectivity: vi.fn<StorageService['checkConnectivity']>(),
};

vi.mock('../auth/prisma', () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock('./r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./r2')>();
  return {
    ...actual,
    getStorageService: () => mockStorageService,
  };
});

describe('Phase 4J.1 - Attachments & Storage Domain & HTTP Endpoints', () => {
  let app: ReturnType<typeof createApp>;

  const userIdA = 'u-a';
  const userIdB = 'u-b';

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createApp(fakes.appDeps());
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { clerkId: string } }) =>
      Promise.resolve(mockUsers[where.clerkId] ?? null),
    );
  });

  describe('Unauthenticated access', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const initRes = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .send({ originalName: 'pic.png', mimeType: 'image/png', size: 100 });
      expect(initRes.status).toBe(401);

      const finalizeRes = await request(app).post('/api/messages/msg-1/attachments/finalize').send({
        storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
        originalName: 'pic.png',
        mimeType: 'image/png',
        size: 100,
      });
      expect(finalizeRes.status).toBe(401);

      const getRes = await request(app).get('/api/attachments/att-1/download-url');
      expect(getRes.status).toBe(401);

      const delRes = await request(app).delete('/api/attachments/att-1');
      expect(delRes.status).toBe(401);
    });
  });

  describe('Upload Initialization (POST /api/messages/:messageId/attachments/upload-url)', () => {
    it('validates request payload strictly and returns 400 on invalid input', async () => {
      // Empty filename
      const res1 = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: '', mimeType: 'image/png', size: 100 });
      expect(res1.status).toBe(400);

      // Unsupported MIME
      const res2 = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: 'app.exe', mimeType: 'application/x-msdownload', size: 100 });
      expect(res2.status).toBe(400);

      // Oversize
      const res3 = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: 'huge.zip', mimeType: 'application/zip', size: 30 * 1024 * 1024 });
      expect(res3.status).toBe(400);
    });

    it('returns 404 when target message does not exist or user is not a channel member', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/messages/nonexistent/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: 'pic.png', mimeType: 'image/png', size: 100 });

      expect(res.status).toBe(404);
    });

    it('returns 403 when non-author attempts to add attachment', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdB, // Authored by User B
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .set(fakes.headersFor('userA')) // User A is caller
        .send({ originalName: 'pic.png', mimeType: 'image/png', size: 100 });

      expect(res.status).toBe(403);
    });

    it('generates presigned upload URL successfully for message author', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.count.mockResolvedValueOnce(0);
      mockStorageService.createPresignedUploadUrl.mockResolvedValueOnce(
        'https://r2.cloudflarestorage.com/presigned-upload-url',
      );

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: 'document.pdf', mimeType: 'application/pdf', size: 5000 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        attachmentId: expect.any(String),
        storageKey: expect.stringContaining('workspaces/ws-1/messages/msg-1/'),
        uploadUrl: 'https://r2.cloudflarestorage.com/presigned-upload-url',
        expiresIn: 900,
      });
    });

    it('rejects upload when maximum attachment limit (5) is reached', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.count.mockResolvedValueOnce(5);

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: 'another.pdf', mimeType: 'application/pdf', size: 1000 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Upload Finalization (POST /api/messages/:messageId/attachments/finalize)', () => {
    it('creates and persists attachment record in PostgreSQL upon confirmation', async () => {
      const now = new Date('2026-09-09T12:00:00.000Z');
      const storageKey = 'workspaces/ws-1/messages/msg-1/att-123';
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.count.mockResolvedValueOnce(0);
      mockStorageService.headObject.mockResolvedValueOnce({
        size: 2048,
        contentType: 'image/png',
      });
      mockPrisma.attachment.create.mockResolvedValueOnce({
        id: 'att-123',
        messageId: 'msg-1',
        uploaderId: userIdA,
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 2048,
        storageKey,
        createdAt: now,
      });

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/finalize')
        .set(fakes.headersFor('userA'))
        .send({
          storageKey,
          originalName: 'photo.png',
          mimeType: 'image/png',
          size: 2048,
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        attachment: {
          id: 'att-123',
          messageId: 'msg-1',
          uploaderId: userIdA,
          originalName: 'photo.png',
          mimeType: 'image/png',
          size: 2048,
          createdAt: now.toISOString(),
        },
      });
    });

    it('rejects foreign storage keys that do not match the message path', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/finalize')
        .set(fakes.headersFor('userA'))
        .send({
          storageKey: 'workspaces/ws-other/messages/msg-other/att-123',
          originalName: 'photo.png',
          mimeType: 'image/png',
          size: 2048,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Download Signed URL (GET /api/attachments/:attachmentId/download-url)', () => {
    it('returns signed download URL for authorized workspace member', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        messageId: 'msg-1',
        originalName: 'invoice.pdf',
        mimeType: 'application/pdf',
        size: 5000,
        storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
      });
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-2' });
      mockStorageService.createPresignedDownloadUrl.mockResolvedValueOnce(
        'https://r2.cloudflarestorage.com/signed-download-url',
      );

      const res = await request(app)
        .get('/api/attachments/att-1/download-url')
        .set(fakes.headersFor('userB')); // User B is authorized workspace member

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        downloadUrl: 'https://r2.cloudflarestorage.com/signed-download-url',
        originalName: 'invoice.pdf',
        mimeType: 'application/pdf',
        size: 5000,
        expiresIn: 300,
      });
    });

    it('returns 404 when attachment does not exist or user has no access to private channel', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValueOnce({
        id: 'att-priv',
        messageId: 'msg-priv',
        originalName: 'secret.pdf',
        mimeType: 'application/pdf',
        size: 100,
        storageKey: 'workspaces/ws-1/messages/msg-priv/att-priv',
      });
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-priv',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-priv',
        directMessageConversationId: null,
        channel: { id: 'ch-priv', workspaceId: 'ws-1', type: 'PRIVATE' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-priv',
        workspaceId: 'ws-1',
        type: 'PRIVATE',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      // Non-member of private channel
      mockPrisma.channelMembership.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/attachments/att-priv/download-url')
        .set(fakes.headersFor('userB'));

      expect(res.status).toBe(404);
    });
  });

  describe('Attachment Deletion (DELETE /api/attachments/:attachmentId)', () => {
    it('deletes attachment record from DB and deletes object from R2', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        messageId: 'msg-1',
        storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
        uploaderId: userIdA,
      });
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.delete.mockResolvedValueOnce({});
      mockStorageService.deleteObject.mockResolvedValueOnce();

      const res = await request(app)
        .delete('/api/attachments/att-1')
        .set(fakes.headersFor('userA'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, attachmentId: 'att-1' });
      expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
        'workspaces/ws-1/messages/msg-1/att-1',
      );
    });

    it('returns 403 when non-uploader/non-author attempts to delete attachment', async () => {
      mockPrisma.attachment.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        messageId: 'msg-1',
        storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
        uploaderId: userIdA,
      });
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-2' });

      const res = await request(app)
        .delete('/api/attachments/att-1')
        .set(fakes.headersFor('userB')); // User B is not uploader or author

      expect(res.status).toBe(403);
    });
  });

  describe('DM / Group Conversation Attachment support', () => {
    it('authorizes upload and download for DM conversation participants', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-dm',
        authorId: userIdA,
        deletedAt: null,
        channelId: null,
        directMessageConversationId: 'dm-conv-1',
        directMessageConversation: { id: 'dm-conv-1', workspaceId: 'ws-1' },
      });
      mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
        id: 'dm-conv-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce({
        id: 'part-1',
      });
      mockPrisma.attachment.count.mockResolvedValueOnce(0);
      mockStorageService.createPresignedUploadUrl.mockResolvedValueOnce(
        'https://r2.cloudflarestorage.com/dm-upload-url',
      );

      const res = await request(app)
        .post('/api/messages/msg-dm/attachments/upload-url')
        .set(fakes.headersFor('userA'))
        .send({ originalName: 'dm-doc.pdf', mimeType: 'application/pdf', size: 1024 });

      expect(res.status).toBe(200);
      expect(res.body.uploadUrl).toBe('https://r2.cloudflarestorage.com/dm-upload-url');
    });
  });

  describe('cleanUpMessageR2Objects helper', () => {
    it('cleans up all R2 objects linked to a message', async () => {
      mockPrisma.attachment.findMany.mockResolvedValueOnce([
        { storageKey: 'key-1' },
        { storageKey: 'key-2' },
      ]);
      mockStorageService.deleteObject.mockResolvedValue();

      await cleanUpMessageR2Objects(prisma, 'msg-1', mockStorageService);

      expect(mockStorageService.deleteObject).toHaveBeenCalledWith('key-1');
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith('key-2');
    });
  });

  describe('Phase 4J.4 - Attachment Lifecycle Hardening & Edge Cases', () => {
    it('returns existing attachment idempotently when finalization is retried for same storageKey', async () => {
      const now = new Date('2026-09-09T12:00:00.000Z');
      const storageKey = 'workspaces/ws-1/messages/msg-1/att-idemp';
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.count.mockResolvedValueOnce(1);
      mockPrisma.attachment.findFirst.mockResolvedValueOnce({
        id: 'att-idemp',
        messageId: 'msg-1',
        uploaderId: userIdA,
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 2048,
        storageKey,
        createdAt: now,
      });

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/finalize')
        .set(fakes.headersFor('userA'))
        .send({
          storageKey,
          originalName: 'photo.png',
          mimeType: 'image/png',
          size: 2048,
        });

      expect(res.status).toBe(201);
      expect(res.body.attachment.id).toBe('att-idemp');
      expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
    });

    it('compensates and deletes R2 object if PostgreSQL insertion fails during finalization', async () => {
      const storageKey = 'workspaces/ws-1/messages/msg-1/att-fail';
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.count.mockResolvedValueOnce(0);
      mockPrisma.attachment.findFirst.mockResolvedValueOnce(null);
      mockStorageService.headObject.mockResolvedValueOnce({ size: 1024, contentType: 'image/png' });
      mockPrisma.attachment.create.mockRejectedValueOnce(new Error('DB connection dropped'));
      mockStorageService.deleteObject.mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/finalize')
        .set(fakes.headersFor('userA'))
        .send({
          storageKey,
          originalName: 'photo.png',
          mimeType: 'image/png',
          size: 1024,
        });

      expect(res.status).toBe(500);
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(storageKey);
    });

    it('rejects path traversal attempts in storageKey during finalization', async () => {
      const res = await request(app)
        .post('/api/messages/msg-1/attachments/finalize')
        .set(fakes.headersFor('userA'))
        .send({
          storageKey: 'workspaces/ws-1/messages/msg-1/../../../etc/passwd',
          originalName: 'passwd',
          mimeType: 'text/plain',
          size: 100,
        });

      // Storage key must match regex without traversal
      expect(res.status).toBe(400);
    });
    it('handles P2002 race condition by returning the existing attachment without compensating', async () => {
      const storageKey = 'workspaces/ws-1/messages/msg-1/att-race';
      const now = new Date('2026-09-09T12:00:00.000Z');
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        authorId: userIdA,
        deletedAt: null,
        channelId: 'ch-1',
        directMessageConversationId: null,
        channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' },
      });
      mockPrisma.channel.findUnique.mockResolvedValueOnce({
        id: 'ch-1',
        workspaceId: 'ws-1',
        type: 'PUBLIC',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.attachment.count.mockResolvedValueOnce(0);
      mockPrisma.attachment.findFirst.mockResolvedValueOnce(null);
      mockStorageService.headObject.mockResolvedValueOnce({ size: 1024, contentType: 'image/png' });
      mockPrisma.attachment.create.mockRejectedValueOnce({ code: 'P2002' });
      mockPrisma.attachment.findUnique.mockResolvedValueOnce({
        id: 'att-race',
        messageId: 'msg-1',
        uploaderId: userIdA,
        originalName: 'race.png',
        mimeType: 'image/png',
        size: 1024,
        storageKey,
        createdAt: now,
      });

      const res = await request(app)
        .post('/api/messages/msg-1/attachments/finalize')
        .set(fakes.headersFor('userA'))
        .send({ storageKey, originalName: 'race.png', mimeType: 'image/png', size: 1024 });

      if (res.status === 403) {
        console.log('BODY', res.body);
      }
      expect(res.status).toBe(201);
      expect(res.body.attachment.id).toBe('att-race');
      expect(mockStorageService.deleteObject).not.toHaveBeenCalled();
    });
  });
});
