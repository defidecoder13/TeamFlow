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
import { Server as SocketIOServer, type Socket } from 'socket.io';
import {
  provisionClerkUser,
  verifyBearerToken,
  type ClerkRouteOptions,
  type SafeAuthUser,
} from '../auth/index';
import { getTrustedOrigins } from '../../cors';
import { getPrisma } from '../auth/prisma';
import { authorizeChannelAccess } from '../messages/authorization';
import { authorizeDirectConversationAccess } from '../direct-messages/authorization';
import type { MessageResponse } from '../messages/service';
import type { ChannelResponse } from '../channels/service';
import type { DirectConversationResponse } from '../direct-messages/service';
import { presenceRegistry, type PresenceStatus } from './presence';
import { typingRegistry, type TypingContainerType, type TypingTransition } from './typing';

export interface ServerToClientEvents {
  'presence:changed': (payload: {
    type: 'presence:changed';
    userId: string;
    status: PresenceStatus;
    lastSeenAt: string | null;
  }) => void;
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
  /**
   * Targeted at the removed user's private room (they were just evicted
   * from the channel room, so room broadcast would miss them). Clients drop
   * the channel from lists and mark open views inaccessible.
   */
  'channel:membership-removed': (payload: {
    type: 'channel:membership-removed';
    workspaceId: string;
    channelId: string;
    userId: string;
  }) => void;
  /**
   * A channel was created. Fanned out per recipient room (never a shared
   * workspace room): public channels reach all workspace members, private
   * channels reach channel members only, so names/metadata never leak to
   * unauthorized clients. The channel shape matches the list contract
   * (no createdById). Clients dedupe by id against REST state.
   */
  'channel:created': (payload: {
    type: 'channel:created';
    workspaceId: string;
    channel: ChannelResponse;
  }) => void;
  /**
   * A DM/group conversation was created. Fanned out to participant rooms
   * only, with per-recipient peer/role fields. Emitted only when the
   * conversation is actually created (1:1 open-or-get on an existing
   * conversation emits nothing). Clients dedupe by id.
   */
  'conversation:created': (payload: {
    type: 'conversation:created';
    workspaceId: string;
    conversation: DirectConversationResponse;
  }) => void;
  /**
   * A channel was renamed/edited. Same recipient rule as channel:created
   * (public: workspace members; private: channel members). Payload matches
   * the list contract (no createdById). Clients merge by id; viewers on a
   * renamed slug fall through to the existing not-found view.
   */
  'channel:updated': (payload: {
    type: 'channel:updated';
    workspaceId: string;
    channel: ChannelResponse;
  }) => void;
  /**
   * A channel was deleted. Ids only (like channel:membership-removed), so
   * even a misdelivery exposes nothing. Clients drop the row and mark open
   * views inaccessible.
   */
  'channel:deleted': (payload: {
    type: 'channel:deleted';
    workspaceId: string;
    channelId: string;
  }) => void;
  /**
   * Targeted at the removed user's private room. Clients refresh workspace
   * membership truth (list + selection) so no stale workspace remains.
   */
  'workspace:membership-removed': (payload: {
    type: 'workspace:membership-removed';
    workspaceId: string;
    userId: string;
  }) => void;
  /**
   * A workspace was deleted. Fanned out to the private rooms of users who
   * were members immediately before deletion — never broadcast, so no
   * workspace identifier reaches non-members. Payload carries the id only;
   * clients drop it from navigation and leave workspace-scoped routes.
   */
  'workspace:deleted': (payload: { type: 'workspace:deleted'; workspaceId: string }) => void;
  'typing:started': (payload: {
    type: 'typing:started';
    userId: string;
    channelId?: string | null;
    conversationId?: string | null;
  }) => void;
  'typing:stopped': (payload: {
    type: 'typing:stopped';
    userId: string;
    channelId?: string | null;
    conversationId?: string | null;
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
  'typing:start': (
    data: { channelId?: string; conversationId?: string },
    callback?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'typing:stop': (
    data: { channelId?: string; conversationId?: string },
    callback?: (res: { ok: boolean; error?: string }) => void,
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
 * Initialize Socket.IO on the HTTP server with Clerk token validation.
 */
export function initRealtime(
  httpServer: HttpServer,
  options: ClerkRouteOptions = {},
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

  // Authentication middleware: the client sends its Clerk session token in
  // the handshake auth payload (cookies do not cross origins to the API).
  io.use(
    async (
      socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
      next,
    ) => {
      try {
        const raw = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
        const token = typeof raw === 'string' ? raw : null;
        const session = await verifyBearerToken(token, options.verify);
        if (!session) {
          return next(new Error('UNAUTHENTICATED'));
        }
        const user = await provisionClerkUser(getPrisma(), session.clerkId, options.directory);
        if (!user) {
          return next(new Error('UNAUTHENTICATED'));
        }

        socket.data.user = user;
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
      const transition = presenceRegistry.addSocket(connectedUser.id, socket.id);
      if (transition.changed) {
        void broadcastPresenceChange(connectedUser.id, 'ONLINE', null);
      }
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

    // Typing start / stop listeners with server-side authorization
    socket.on('typing:start', async (data, callback) => {
      if (!data || typeof data !== 'object') {
        callback?.({ ok: false, error: 'INVALID_PAYLOAD' });
        return;
      }

      const user = socket.data.user;
      if (!user) {
        callback?.({ ok: false, error: 'UNAUTHENTICATED' });
        return;
      }

      const { channelId, conversationId } = data as {
        channelId?: unknown;
        conversationId?: unknown;
      };

      if (
        (!channelId && !conversationId) ||
        (channelId && conversationId) ||
        (channelId && typeof channelId !== 'string') ||
        (conversationId && typeof conversationId !== 'string')
      ) {
        callback?.({ ok: false, error: 'INVALID_CONTAINER' });
        return;
      }

      try {
        const prisma = getPrisma();
        let containerType: TypingContainerType;
        let containerId: string;
        let roomName: string;

        if (channelId) {
          const channel = await authorizeChannelAccess(prisma, {
            channelId: channelId as string,
            userId: user.id,
          });
          if (!channel) {
            callback?.({ ok: false, error: 'FORBIDDEN' });
            return;
          }
          containerType = 'channel';
          containerId = channelId as string;
          roomName = `channel:${containerId}`;
        } else {
          const conversation = await authorizeDirectConversationAccess(prisma, {
            conversationId: conversationId as string,
            userId: user.id,
          });
          if (!conversation) {
            callback?.({ ok: false, error: 'FORBIDDEN' });
            return;
          }
          containerType = 'direct_message';
          containerId = conversationId as string;
          roomName = `direct-message:${containerId}`;
        }

        const transition = typingRegistry.startTyping(
          user.id,
          socket.id,
          containerType,
          containerId,
        );

        if (transition.changed) {
          socket.to(roomName).emit('typing:started', {
            type: 'typing:started',
            userId: user.id,
            ...(containerType === 'channel'
              ? { channelId: containerId }
              : { conversationId: containerId }),
          });
        }

        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('typing:stop', async (data, callback) => {
      if (!data || typeof data !== 'object') {
        callback?.({ ok: false, error: 'INVALID_PAYLOAD' });
        return;
      }

      const user = socket.data.user;
      if (!user) {
        callback?.({ ok: false, error: 'UNAUTHENTICATED' });
        return;
      }

      const { channelId, conversationId } = data as {
        channelId?: unknown;
        conversationId?: unknown;
      };

      if (
        (!channelId && !conversationId) ||
        (channelId && conversationId) ||
        (channelId && typeof channelId !== 'string') ||
        (conversationId && typeof conversationId !== 'string')
      ) {
        callback?.({ ok: false, error: 'INVALID_CONTAINER' });
        return;
      }

      const containerType: TypingContainerType = channelId ? 'channel' : 'direct_message';
      const containerId = (channelId || conversationId) as string;
      const roomName =
        containerType === 'channel' ? `channel:${containerId}` : `direct-message:${containerId}`;

      const transition = typingRegistry.stopTyping(user.id, socket.id, containerType, containerId);

      if (transition.changed) {
        socket.to(roomName).emit('typing:stopped', {
          type: 'typing:stopped',
          userId: user.id,
          ...(containerType === 'channel'
            ? { channelId: containerId }
            : { conversationId: containerId }),
        });
      }

      callback?.({ ok: true });
    });

    socket.on('disconnect', () => {
      // Clean up presence
      const presenceTransition = presenceRegistry.removeSocket(socket.id);
      if (presenceTransition && presenceTransition.changed) {
        void broadcastPresenceChange(
          presenceTransition.userId,
          presenceTransition.currentStatus,
          presenceTransition.lastSeenAt,
        );
      }

      // Clean up typing for this socket
      const typingTransitions = typingRegistry.handleSocketDisconnect(socket.id);
      for (const t of typingTransitions) {
        const roomName =
          t.containerType === 'channel'
            ? `channel:${t.containerId}`
            : `direct-message:${t.containerId}`;
        io.to(roomName).emit('typing:stopped', {
          type: 'typing:stopped',
          userId: t.userId,
          ...(t.containerType === 'channel'
            ? { channelId: t.containerId }
            : { conversationId: t.containerId }),
        });
      }
    });
  });

  // Setup typing timeout callback for broadcast
  typingRegistry.setOnUserStoppedTyping((transition: TypingTransition) => {
    const roomName =
      transition.containerType === 'channel'
        ? `channel:${transition.containerId}`
        : `direct-message:${transition.containerId}`;
    io.to(roomName).emit('typing:stopped', {
      type: 'typing:stopped',
      userId: transition.userId,
      ...(transition.containerType === 'channel'
        ? { channelId: transition.containerId }
        : { conversationId: transition.containerId }),
    });
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

/**
 * Notify a user removed from a private channel. Sent to their private user
 * room (they no longer receive channel-room broadcasts). Call only after the
 * membership deletion has committed. Payload carries ids only — no content.
 */
export function emitChannelMembershipRemoved(
  workspaceId: string,
  channelId: string,
  userId: string,
): void {
  if (!ioInstance) return;
  ioInstance.to(userRoomName(userId)).emit('channel:membership-removed', {
    type: 'channel:membership-removed',
    workspaceId,
    channelId,
    userId,
  });
}

/**
 * Recipient rule shared by all channel lifecycle fan-outs (created,
 * updated, deleted): public channels reach every workspace member, private
 * channels reach channel members only. There is no shared workspace room,
 * so per-user delivery is the only safe mechanism.
 */
export async function resolveChannelBroadcastRecipients(input: {
  workspaceId: string;
  channelId: string;
  channelType: string;
}): Promise<string[]> {
  const prisma = getPrisma();
  if (!prisma?.workspaceMembership || !prisma?.channelMembership) return [];
  const rows =
    input.channelType === 'PRIVATE'
      ? await prisma.channelMembership.findMany({
          where: { channelId: input.channelId },
          select: { userId: true },
        })
      : await prisma.workspaceMembership.findMany({
          where: { workspaceId: input.workspaceId },
          select: { userId: true },
        });
  return rows.map((row) => row.userId);
}

/**
 * Notify authorized clients of a newly created channel. Fans out to
 * private user rooms only (there is no shared workspace room): public
 * channels reach every workspace member, private channels reach channel
 * members only. Call only after the creation transaction has committed.
 * Never throws — delivery is best-effort; clients reconcile via REST.
 */
export async function notifyChannelCreated(input: {
  workspaceId: string;
  channel: ChannelResponse;
}): Promise<void> {
  try {
    if (!ioInstance) return;
    const recipients = await resolveChannelBroadcastRecipients({
      workspaceId: input.workspaceId,
      channelId: input.channel.id,
      channelType: input.channel.type,
    });
    const payload = {
      type: 'channel:created' as const,
      workspaceId: input.workspaceId,
      channel: input.channel,
    };
    for (const userId of recipients) {
      ioInstance.to(userRoomName(userId)).emit('channel:created', payload);
    }
  } catch (error) {
    console.error('[realtime] failed to notify channel created', {
      workspaceId: input.workspaceId,
      channelId: input.channel.id,
      error,
    });
  }
}

/**
 * Notify authorized clients of a channel edit. Same recipient rule and
 * payload contract as channel:created. Call only after the update has
 * committed. Never throws.
 */
export async function notifyChannelUpdated(input: {
  workspaceId: string;
  channel: ChannelResponse;
}): Promise<void> {
  try {
    if (!ioInstance) return;
    const recipients = await resolveChannelBroadcastRecipients({
      workspaceId: input.workspaceId,
      channelId: input.channel.id,
      channelType: input.channel.type,
    });
    const payload = {
      type: 'channel:updated' as const,
      workspaceId: input.workspaceId,
      channel: input.channel,
    };
    for (const userId of recipients) {
      ioInstance.to(userRoomName(userId)).emit('channel:updated', payload);
    }
  } catch (error) {
    console.error('[realtime] failed to notify channel updated', {
      workspaceId: input.workspaceId,
      channelId: input.channel.id,
      error,
    });
  }
}

/**
 * Notify authorized clients of a channel deletion. Recipients must be
 * resolved BEFORE the delete commits (cascades remove the membership rows).
 * Ids only — no content to leak. Call only after the deletion has
 * committed. Never throws.
 */
export async function notifyChannelDeleted(input: {
  workspaceId: string;
  channelId: string;
  memberUserIds: string[];
}): Promise<void> {
  try {
    if (!ioInstance) return;
    const payload = {
      type: 'channel:deleted' as const,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    };
    for (const userId of input.memberUserIds) {
      ioInstance.to(userRoomName(userId)).emit('channel:deleted', payload);
    }
  } catch (error) {
    console.error('[realtime] failed to notify channel deleted', {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      error,
    });
  }
}

/**
 * Notify participants of a newly created DM/group conversation. One payload
 * per recipient room (peer/role fields are recipient-relative). Call only
 * after the creation transaction has committed.
 * Never throws — delivery is best-effort; clients reconcile via REST.
 */
export async function notifyConversationCreated(input: {
  deliveries: Array<{ recipientUserId: string; conversation: DirectConversationResponse }>;
}): Promise<void> {
  try {
    if (!ioInstance) return;
    for (const delivery of input.deliveries) {
      ioInstance.to(userRoomName(delivery.recipientUserId)).emit('conversation:created', {
        type: 'conversation:created' as const,
        workspaceId: delivery.conversation.workspaceId,
        conversation: delivery.conversation,
      });
    }
  } catch (error) {
    console.error('[realtime] failed to notify conversation created', { error });
  }
}

/**
 * Notify pre-deletion workspace members that the workspace is gone. Sent to
 * each affected user's private room (there is no shared workspace room, and
 * membership rows no longer exist to query). Call only after the workspace
 * deletion has committed. Never throws — delivery is best-effort; clients
 * reconcile via REST.
 */
export async function notifyWorkspaceDeleted(input: {
  workspaceId: string;
  memberUserIds: string[];
}): Promise<void> {
  try {
    if (!ioInstance) return;
    const payload = { type: 'workspace:deleted' as const, workspaceId: input.workspaceId };
    for (const userId of input.memberUserIds) {
      ioInstance.to(userRoomName(userId)).emit('workspace:deleted', payload);
    }
  } catch (error) {
    console.error('[realtime] failed to notify workspace deleted', {
      workspaceId: input.workspaceId,
      error,
    });
  }
}

/**
 * Notify a user removed from a workspace. Sent to their private user room.
 * Call only after the membership deletion has committed.
 */
export function emitWorkspaceMembershipRemoved(workspaceId: string, userId: string): void {
  if (!ioInstance) return;
  ioInstance.to(userRoomName(userId)).emit('workspace:membership-removed', {
    type: 'workspace:membership-removed',
    workspaceId,
    userId,
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

export function removeUserFromChannelRoom(channelId: string, userId: string): void {
  if (!ioInstance) return;
  const roomName = `channel:${channelId}`;
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

/**
 * Broadcast presence changes to all users who share at least one workspace
 * with the target user (workspace-scoped delivery).
 */
export async function broadcastPresenceChange(
  userId: string,
  status: PresenceStatus,
  lastSeenAt: string | null,
): Promise<void> {
  if (!ioInstance) return;

  try {
    const prisma = getPrisma();
    if (!prisma || !prisma.workspaceMembership) {
      return;
    }
    // Find all workspaces this user is a member of
    const userMemberships = await prisma.workspaceMembership.findMany({
      where: { userId },
      select: { workspaceId: true },
    });

    if (userMemberships.length === 0) {
      return;
    }

    const workspaceIds = userMemberships.map((m) => m.workspaceId);

    // Find all peer users across these workspaces
    const peerMemberships = await prisma.workspaceMembership.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { userId: true },
    });

    const peerUserIds = new Set<string>();
    for (const m of peerMemberships) {
      if (m.userId !== userId) {
        peerUserIds.add(m.userId);
      }
    }

    const payload = {
      type: 'presence:changed' as const,
      userId,
      status,
      lastSeenAt,
    };

    for (const peerId of peerUserIds) {
      ioInstance.to(userRoomName(peerId)).emit('presence:changed', payload);
    }
  } catch (error) {
    console.error('[realtime] failed to broadcast presence change', { userId, error });
  }
}

export { presenceRegistry, type PresenceStatus, type UserPresence } from './presence';
export {
  typingRegistry,
  TYPING_TIMEOUT_MS,
  type TypingContainerType,
  type TypingContainerKey,
  type TypingTransition,
} from './typing';
