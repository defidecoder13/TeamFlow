/**
 * Realtime messaging gateway (Phase 4C.4).
 *
 * Provides Socket.IO-based realtime delivery for channel messages.
 * REST remains the authoritative persistence layer; events are emitted
 * strictly after database commits succeed.
 *
 * Authentication uses Better Auth session cookies via handshake headers.
 * Channel authorization reuses authorizeChannelAccess() server-side.
 */

import type { Server as HttpServer } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import {
  getAuth,
  getTrustedOrigins,
  toSafeUser,
  type AuthContext,
  type SafeAuthUser,
} from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { authorizeChannelAccess } from '../messages/authorization';
import { authorizeDirectConversationAccess } from '../direct-messages/authorization';
import type { MessageResponse } from '../messages/service';

export interface ServerToClientEvents {
  'message:new': (payload: {
    type: 'message:new';
    channelId?: string | null;
    conversationId?: string | null;
    message: MessageResponse;
  }) => void;
  'message:updated': (payload: {
    type: 'message:updated';
    channelId?: string | null;
    conversationId?: string | null;
    message: MessageResponse;
  }) => void;
  'message:deleted': (payload: {
    type: 'message:deleted';
    channelId?: string | null;
    conversationId?: string | null;
    messageId: string;
    deletedAt: string;
  }) => void;
  'reaction:added': (payload: {
    type: 'reaction:added';
    channelId?: string | null;
    conversationId?: string | null;
    messageId: string;
    emoji: string;
    userId: string;
  }) => void;
  'reaction:removed': (payload: {
    type: 'reaction:removed';
    channelId?: string | null;
    conversationId?: string | null;
    messageId: string;
    emoji: string;
    userId: string;
  }) => void;
  'conversation:read': (payload: {
    type: 'conversation:read';
    conversationId: string;
    userId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
  }) => void;
  'conversation:updated': (payload: {
    type: 'conversation:updated';
    conversationId: string;
    name?: string | null;
    updatedAt: string;
  }) => void;
  'conversation:participant-added': (payload: {
    type: 'conversation:participant-added';
    conversationId: string;
    participant: {
      id: string;
      name: string;
      email: string;
      image: string | null;
      role: 'ADMIN' | 'MEMBER';
      joinedAt: string;
    };
  }) => void;
  'conversation:participant-removed': (payload: {
    type: 'conversation:participant-removed';
    conversationId: string;
    userId: string;
  }) => void;
  'notification:new': (payload: {
    type: 'notification:new';
    notification: NotificationPayload;
  }) => void;
  'notification:read': (payload: {
    type: 'notification:read';
    id: string;
    workspaceId: string;
    readAt: string;
  }) => void;
  'notification:read-all': (payload: {
    type: 'notification:read-all';
    workspaceId: string;
    readAt: string;
    updatedCount: number;
  }) => void;
}

/** Structured notification payload for realtime delivery (4H.5 shape). */
export interface NotificationPayload {
  id: string;
  type: string;
  workspaceId: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorImage: string | null;
  messageId: string | null;
  conversationId: string | null;
  channelId: string | null;
  threadRootMessageId: string | null;
  channelName: string | null;
  conversationName: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Per-user room name. Joined automatically on connect; never client-chosen. */
export function userRoomName(userId: string): string {
  return `user:${userId}`;
}

export interface ClientToServerEvents {
  'channel:join': (
    data: { channelId: string },
    callback?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'channel:leave': (data: { channelId: string }, callback?: (res: { ok: boolean }) => void) => void;
  join_direct_conversation: (
    data: { conversationId: string },
    callback?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  leave_direct_conversation: (
    data: { conversationId: string },
    callback?: (res: { ok: boolean }) => void,
  ) => void;
  'direct:join': (
    data: { conversationId: string },
    callback?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'direct:leave': (
    data: { conversationId: string },
    callback?: (res: { ok: boolean }) => void,
  ) => void;
}

export interface SocketData {
  user: SafeAuthUser;
}

let ioInstance: SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
> | null = null;

/**
 * Initialize Socket.IO on the HTTP server with Better Auth session validation.
 */
export function initRealtime(
  httpServer: HttpServer,
  resolveAuth: () => AuthContext = getAuth,
): SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const trustedOrigins = getTrustedOrigins();

  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: trustedOrigins.length > 0 ? trustedOrigins : true,
      credentials: true,
    },
    transports: ['polling', 'websocket'],
  });

  // Authentication middleware using existing Better Auth session cookie
  io.use(
    async (
      socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
      next,
    ) => {
      try {
        const auth = resolveAuth();
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(socket.request.headers),
        });

        if (!session?.user) {
          return next(new Error('UNAUTHENTICATED'));
        }

        socket.data.user = toSafeUser(session.user);
        next();
      } catch {
        next(new Error('UNAUTHENTICATED'));
      }
    },
  );

  io.on('connection', (socket) => {
    // Per-user notification room, joined automatically from the
    // session-authenticated identity. There is intentionally no client event
    // to join another user's room. Join is synchronous with the default
    // in-memory adapter; delivery falls back to REST resync regardless.
    const connectedUser = socket.data.user;
    if (connectedUser) {
      void socket.join(userRoomName(connectedUser.id));
    }
    // Channel subscription with server-side authorization check
    socket.on('channel:join', async (data, callback) => {
      if (!data || typeof data !== 'object' || typeof data.channelId !== 'string') {
        callback?.({ ok: false, error: 'INVALID_CHANNEL' });
        return;
      }

      const channelId = data.channelId;
      const user = socket.data.user;
      if (!user) {
        callback?.({ ok: false, error: 'UNAUTHENTICATED' });
        return;
      }

      try {
        const prisma = getPrisma();
        const channel = await authorizeChannelAccess(prisma, {
          channelId,
          userId: user.id,
        });

        if (!channel) {
          callback?.({ ok: false, error: 'FORBIDDEN' });
          return;
        }

        await socket.join(`channel:${channelId}`);
        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('channel:leave', async (data, callback) => {
      if (data && typeof data === 'object' && typeof data.channelId === 'string') {
        await socket.leave(`channel:${data.channelId}`);
      }
      callback?.({ ok: true });
    });

    const handleJoinDirectConversation = async (
      data: unknown,
      callback?: (res: { ok: boolean; error?: string }) => void,
    ) => {
      if (
        !data ||
        typeof data !== 'object' ||
        typeof (data as { conversationId: unknown }).conversationId !== 'string'
      ) {
        callback?.({ ok: false, error: 'INVALID_CONVERSATION' });
        return;
      }

      const conversationId = (data as { conversationId: string }).conversationId;
      const user = socket.data.user;
      if (!user) {
        callback?.({ ok: false, error: 'UNAUTHENTICATED' });
        return;
      }

      try {
        const prisma = getPrisma();
        const conversation = await authorizeDirectConversationAccess(prisma, {
          conversationId,
          userId: user.id,
        });

        if (!conversation) {
          callback?.({ ok: false, error: 'FORBIDDEN' });
          return;
        }

        await socket.join(`direct-message:${conversationId}`);
        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, error: 'INTERNAL_ERROR' });
      }
    };

    const handleLeaveDirectConversation = async (
      data: unknown,
      callback?: (res: { ok: boolean }) => void,
    ) => {
      if (
        data &&
        typeof data === 'object' &&
        typeof (data as { conversationId: unknown }).conversationId === 'string'
      ) {
        await socket.leave(`direct-message:${(data as { conversationId: string }).conversationId}`);
      }
      callback?.({ ok: true });
    };

    socket.on('join_direct_conversation', handleJoinDirectConversation);
    socket.on('direct:join', handleJoinDirectConversation);
    socket.on('leave_direct_conversation', handleLeaveDirectConversation);
    socket.on('direct:leave', handleLeaveDirectConversation);
  });

  ioInstance = io;
  return io;
}

export function getRealtimeIO(): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
> | null {
  return ioInstance;
}

export function closeRealtime(): Promise<void> {
  return new Promise((resolve) => {
    if (!ioInstance) {
      resolve();
      return;
    }
    ioInstance.close(() => {
      ioInstance = null;
      resolve();
    });
  });
}

/**
 * Broadcaster API — decoupled from Socket.IO internals.
 * Routes call these only after database commits succeed. Notification
 * delivery is the one exception: generation runs inside message services
 * (not routes), so the notification service emits post-commit itself.
 */
export function emitMessageCreated(channelId: string, message: MessageResponse): void {
  if (!ioInstance) return;
  ioInstance.to(`channel:${channelId}`).emit('message:new', {
    type: 'message:new',
    channelId,
    conversationId: null,
    message,
  });
}

export function emitMessageUpdated(channelId: string, message: MessageResponse): void {
  if (!ioInstance) return;
  ioInstance.to(`channel:${channelId}`).emit('message:updated', {
    type: 'message:updated',
    channelId,
    conversationId: null,
    message,
  });
}

export function emitMessageDeleted(
  channelId: string,
  messageId: string,
  deletedAt: Date | string,
): void {
  if (!ioInstance) return;
  ioInstance.to(`channel:${channelId}`).emit('message:deleted', {
    type: 'message:deleted',
    channelId,
    conversationId: null,
    messageId,
    deletedAt: typeof deletedAt === 'string' ? deletedAt : deletedAt.toISOString(),
  });
}

export function emitReactionAdded(
  channelId: string,
  messageId: string,
  emoji: string,
  userId: string,
): void {
  if (!ioInstance) return;
  ioInstance.to(`channel:${channelId}`).emit('reaction:added', {
    type: 'reaction:added',
    channelId,
    conversationId: null,
    messageId,
    emoji,
    userId,
  });
}

export function emitReactionRemoved(
  channelId: string,
  messageId: string,
  emoji: string,
  userId: string,
): void {
  if (!ioInstance) return;
  ioInstance.to(`channel:${channelId}`).emit('reaction:removed', {
    type: 'reaction:removed',
    channelId,
    conversationId: null,
    messageId,
    emoji,
    userId,
  });
}

export function emitDirectMessageCreated(conversationId: string, message: MessageResponse): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('message:new', {
    type: 'message:new',
    conversationId,
    channelId: null,
    message,
  });
}

export function emitDirectMessageUpdated(conversationId: string, message: MessageResponse): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('message:updated', {
    type: 'message:updated',
    conversationId,
    channelId: null,
    message,
  });
}

export function emitDirectMessageDeleted(
  conversationId: string,
  messageId: string,
  deletedAt: Date | string,
): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('message:deleted', {
    type: 'message:deleted',
    conversationId,
    channelId: null,
    messageId,
    deletedAt: typeof deletedAt === 'string' ? deletedAt : deletedAt.toISOString(),
  });
}

export function emitDirectReactionAdded(
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('reaction:added', {
    type: 'reaction:added',
    conversationId,
    channelId: null,
    messageId,
    emoji,
    userId,
  });
}

export function emitDirectReactionRemoved(
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('reaction:removed', {
    type: 'reaction:removed',
    conversationId,
    channelId: null,
    messageId,
    emoji,
    userId,
  });
}

export function emitDirectConversationRead(
  conversationId: string,
  payload: {
    conversationId: string;
    userId: string;
    lastReadMessageId: string | null;
    lastReadAt: Date | string;
  },
): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('conversation:read', {
    type: 'conversation:read',
    conversationId: payload.conversationId,
    userId: payload.userId,
    lastReadMessageId: payload.lastReadMessageId,
    lastReadAt:
      typeof payload.lastReadAt === 'string'
        ? payload.lastReadAt
        : payload.lastReadAt.toISOString(),
  });
}

export function emitDirectConversationUpdated(
  conversationId: string,
  payload: {
    conversationId: string;
    name?: string | null;
    updatedAt: Date | string;
  },
): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('conversation:updated', {
    type: 'conversation:updated',
    conversationId: payload.conversationId,
    name: payload.name ?? null,
    updatedAt:
      typeof payload.updatedAt === 'string' ? payload.updatedAt : payload.updatedAt.toISOString(),
  });
}

export function emitDirectParticipantAdded(
  conversationId: string,
  payload: {
    conversationId: string;
    participant: {
      id: string;
      name: string;
      email: string;
      image: string | null;
      role?: 'ADMIN' | 'MEMBER';
      joinedAt?: Date | string;
    };
  },
): void {
  if (!ioInstance) return;
  const joinedAt = payload.participant.joinedAt;
  ioInstance.to(`direct-message:${conversationId}`).emit('conversation:participant-added', {
    type: 'conversation:participant-added',
    conversationId: payload.conversationId,
    participant: {
      id: payload.participant.id,
      name: payload.participant.name,
      email: payload.participant.email,
      image: payload.participant.image,
      role: payload.participant.role ?? 'MEMBER',
      joinedAt:
        joinedAt instanceof Date
          ? joinedAt.toISOString()
          : typeof joinedAt === 'string'
            ? joinedAt
            : new Date().toISOString(),
    },
  });
}

export function emitDirectParticipantRemoved(
  conversationId: string,
  payload: {
    conversationId: string;
    userId: string;
  },
): void {
  if (!ioInstance) return;
  ioInstance.to(`direct-message:${conversationId}`).emit('conversation:participant-removed', {
    type: 'conversation:participant-removed',
    conversationId: payload.conversationId,
    userId: payload.userId,
  });
}

export function removeUserFromDirectConversationRoom(conversationId: string, userId: string): void {
  if (!ioInstance) return;
  const roomName = `direct-message:${conversationId}`;
  for (const [, socket] of ioInstance.of('/').sockets) {
    if (socket.data?.user?.id === userId) {
      void socket.leave(roomName);
    }
  }
}

/**
 * Deliver a persisted notification to its recipient's private user room.
 * Call only after the notification row has committed. The payload mirrors
 * the 4H.5 REST shape; no other user can receive it.
 */
export function emitNotificationNew(
  recipientUserId: string,
  notification: NotificationPayload,
): void {
  if (!ioInstance) return;
  ioInstance.to(userRoomName(recipientUserId)).emit('notification:new', {
    type: 'notification:new',
    notification,
  });
}

/**
 * Deliver a persisted read transition to the recipient's private user room.
 * Call only after the readAt update has committed, and only for actual
 * unread → read transitions (idempotent re-marks emit nothing).
 */
export function emitNotificationRead(
  recipientUserId: string,
  payload: { id: string; workspaceId: string; readAt: Date | string },
): void {
  if (!ioInstance) return;
  ioInstance.to(userRoomName(recipientUserId)).emit('notification:read', {
    type: 'notification:read',
    id: payload.id,
    workspaceId: payload.workspaceId,
    readAt: typeof payload.readAt === 'string' ? payload.readAt : payload.readAt.toISOString(),
  });
}

/**
 * Deliver a persisted read-all transition to the user's private room.
 * Call only after the update has committed and only when at least one row
 * changed (updatedCount === 0 emits nothing).
 */
export function emitNotificationReadAll(
  userId: string,
  payload: { workspaceId: string; readAt: Date | string; updatedCount: number },
): void {
  if (!ioInstance) return;
  ioInstance.to(userRoomName(userId)).emit('notification:read-all', {
    type: 'notification:read-all',
    workspaceId: payload.workspaceId,
    readAt: typeof payload.readAt === 'string' ? payload.readAt : payload.readAt.toISOString(),
    updatedCount: payload.updatedCount,
  });
}
