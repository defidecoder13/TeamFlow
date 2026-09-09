/**
 * Realtime Socket.IO client manager (Phase 4C.4).
 *
 * Manages a shared, credentialed Socket.IO connection to the TeamFlow API.
 * Uses Better Auth session cookies passed automatically via withCredentials: true.
 */

import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from './config';

export type RealtimeMessageNewEvent = {
  type: 'message:new';
  channelId?: string | null;
  conversationId?: string | null;
  message: unknown;
};

export type RealtimeMessageUpdatedEvent = {
  type: 'message:updated';
  channelId?: string | null;
  conversationId?: string | null;
  message: unknown;
};

export type RealtimeMessageDeletedEvent = {
  type: 'message:deleted';
  channelId?: string | null;
  conversationId?: string | null;
  messageId: string;
  deletedAt: string;
};

export type RealtimeReactionAddedEvent = {
  type: 'reaction:added';
  channelId?: string | null;
  conversationId?: string | null;
  messageId: string;
  emoji: string;
  userId: string;
};

export type RealtimeReactionRemovedEvent = {
  type: 'reaction:removed';
  channelId?: string | null;
  conversationId?: string | null;
  messageId: string;
  emoji: string;
  userId: string;
};

export type RealtimeConversationReadEvent = {
  type: 'conversation:read';
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
};

export type RealtimeConversationUpdatedEvent = {
  type: 'conversation:updated';
  conversationId: string;
  name?: string | null;
  updatedAt: string;
};

export type RealtimeParticipantAddedEvent = {
  type: 'conversation:participant-added';
  conversationId: string;
  participant: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role?: 'ADMIN' | 'MEMBER';
    joinedAt: string;
  };
};

export type RealtimeParticipantRemovedEvent = {
  type: 'conversation:participant-removed';
  conversationId: string;
  userId: string;
};

export type RealtimeNotificationNewEvent = {
  type: 'notification:new';
  notification: {
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
  };
};

export type RealtimeNotificationReadEvent = {
  type: 'notification:read';
  id: string;
  workspaceId: string;
  readAt: string;
};

export type RealtimeNotificationReadAllEvent = {
  type: 'notification:read-all';
  workspaceId: string;
  readAt: string;
  updatedCount: number;
};

export type RealtimePresenceChangedEvent = {
  type: 'presence:changed';
  userId: string;
  status: 'ONLINE' | 'OFFLINE' | 'AWAY';
  lastSeenAt: string | null;
};

export type RealtimeTypingStartedEvent = {
  type: 'typing:started';
  userId: string;
  channelId?: string | null;
  conversationId?: string | null;
};

export type RealtimeTypingStoppedEvent = {
  type: 'typing:stopped';
  userId: string;
  channelId?: string | null;
  conversationId?: string | null;
};

let socketInstance: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (!socketInstance) {
    const apiBase = getApiBaseUrl();
    socketInstance = io(apiBase, {
      withCredentials: true,
      autoConnect: false,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socketInstance;
}

export function connectRealtime(): Socket {
  const socket = getRealtimeSocket();
  if (!socket.connected && !socket.active) {
    socket.connect();
  }
  return socket;
}

export function disconnectRealtime(): void {
  if (socketInstance) {
    socketInstance.disconnect();
  }
}

export function joinRealtimeChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
  const socket = getRealtimeSocket();
  if (!socket.connected) {
    socket.connect();
  }

  return new Promise((resolve) => {
    socket.emit('channel:join', { channelId }, (res?: { ok: boolean; error?: string }) => {
      if (!res) {
        resolve({ ok: false, error: 'NO_RESPONSE' });
        return;
      }
      resolve(res);
    });
  });
}

export function leaveRealtimeChannel(channelId: string): Promise<{ ok: boolean }> {
  const socket = getRealtimeSocket();
  return new Promise((resolve) => {
    socket.emit('channel:leave', { channelId }, (res?: { ok: boolean }) => {
      resolve(res ?? { ok: true });
    });
  });
}

export function joinRealtimeDirectConversation(
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const socket = getRealtimeSocket();
  if (!socket.connected) {
    socket.connect();
  }

  return new Promise((resolve) => {
    socket.emit(
      'join_direct_conversation',
      { conversationId },
      (res?: { ok: boolean; error?: string }) => {
        if (!res) {
          resolve({ ok: false, error: 'NO_RESPONSE' });
          return;
        }
        resolve(res);
      },
    );
  });
}

export function leaveRealtimeDirectConversation(conversationId: string): Promise<{ ok: boolean }> {
  const socket = getRealtimeSocket();
  return new Promise((resolve) => {
    socket.emit('leave_direct_conversation', { conversationId }, (res?: { ok: boolean }) => {
      resolve(res ?? { ok: true });
    });
  });
}

export function onRealtimeMessageNew(
  handler: (event: RealtimeMessageNewEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('message:new', handler);
  return () => {
    socket.off('message:new', handler);
  };
}

export function onRealtimeMessageUpdated(
  handler: (event: RealtimeMessageUpdatedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('message:updated', handler);
  return () => {
    socket.off('message:updated', handler);
  };
}

export function onRealtimeMessageDeleted(
  handler: (event: RealtimeMessageDeletedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('message:deleted', handler);
  return () => {
    socket.off('message:deleted', handler);
  };
}

export function onRealtimeReconnect(handler: () => void): () => void {
  const socket = getRealtimeSocket();
  // Socket.IO manager emits reconnect on successful re-connection
  socket.io.on('reconnect', handler);
  return () => {
    socket.io.off('reconnect', handler);
  };
}

export function onRealtimeReactionAdded(
  handler: (event: RealtimeReactionAddedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('reaction:added', handler);
  return () => {
    socket.off('reaction:added', handler);
  };
}

export function onRealtimeReactionRemoved(
  handler: (event: RealtimeReactionRemovedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('reaction:removed', handler);
  return () => {
    socket.off('reaction:removed', handler);
  };
}

export function onRealtimeConversationRead(
  handler: (event: RealtimeConversationReadEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('conversation:read', handler);
  return () => {
    socket.off('conversation:read', handler);
  };
}

export function onRealtimeConversationUpdated(
  handler: (event: RealtimeConversationUpdatedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('conversation:updated', handler);
  return () => {
    socket.off('conversation:updated', handler);
  };
}

export function onRealtimeParticipantAdded(
  handler: (event: RealtimeParticipantAddedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('conversation:participant-added', handler);
  return () => {
    socket.off('conversation:participant-added', handler);
  };
}

export function onRealtimeParticipantRemoved(
  handler: (event: RealtimeParticipantRemovedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('conversation:participant-removed', handler);
  return () => {
    socket.off('conversation:participant-removed', handler);
  };
}

/**
 * Notification realtime subscribers (Phase 4H.6, non-visual).
 *
 * The server delivers each event only to the recipient's private user room.
 * Clients merge by notification id (REST initial load, reconnect resync, and
 * these events can all carry the same row) and recover missed events through
 * the notification REST API on `onRealtimeReconnect` — no event replay.
 */
export function onRealtimeNotificationNew(
  handler: (event: RealtimeNotificationNewEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('notification:new', handler);
  return () => {
    socket.off('notification:new', handler);
  };
}

export function onRealtimeNotificationRead(
  handler: (event: RealtimeNotificationReadEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('notification:read', handler);
  return () => {
    socket.off('notification:read', handler);
  };
}

export function onRealtimeNotificationReadAll(
  handler: (event: RealtimeNotificationReadAllEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('notification:read-all', handler);
  return () => {
    socket.off('notification:read-all', handler);
  };
}

/**
 * Presence realtime subscriber (Phase 4I.3).
 *
 * Listens for presence:changed events emitted by the server.
 */
export function onRealtimePresenceChanged(
  handler: (event: RealtimePresenceChangedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('presence:changed', handler);
  return () => {
    socket.off('presence:changed', handler);
  };
}

/**
 * Typing indicator realtime emitters & subscribers (Phase 4I.4, transport only).
 *
 * Ephemeral client events for typing start/stop with container targeting.
 */
export function emitTypingStart(container: {
  channelId?: string;
  conversationId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const socket = getRealtimeSocket();
  if (!socket.connected) {
    socket.connect();
  }

  return new Promise((resolve) => {
    socket.emit('typing:start', container, (res?: { ok: boolean; error?: string }) => {
      resolve(res ?? { ok: true });
    });
  });
}

export function emitTypingStop(container: {
  channelId?: string;
  conversationId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const socket = getRealtimeSocket();
  if (!socket.connected) {
    return Promise.resolve({ ok: true });
  }

  return new Promise((resolve) => {
    socket.emit('typing:stop', container, (res?: { ok: boolean; error?: string }) => {
      resolve(res ?? { ok: true });
    });
  });
}

export function onRealtimeTypingStarted(
  handler: (event: RealtimeTypingStartedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('typing:started', handler);
  return () => {
    socket.off('typing:started', handler);
  };
}

export function onRealtimeTypingStopped(
  handler: (event: RealtimeTypingStoppedEvent) => void,
): () => void {
  const socket = getRealtimeSocket();
  socket.on('typing:stopped', handler);
  return () => {
    socket.off('typing:stopped', handler);
  };
}
