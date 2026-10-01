/**
 * In-Memory Presence Registry (Phase 4I.1).
 *
 * Tracks ephemeral online/offline state across multiple sockets/tabs per user.
 * Zero database persistence for heartbeats/presence transitions.
 *
 * States: 'ONLINE' | 'OFFLINE'.
 * - socket count > 0 => ONLINE
 * - socket count === 0 => OFFLINE
 */

export type PresenceStatus = 'ONLINE' | 'OFFLINE';

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string | null;
}

export interface PresenceTransition {
  userId: string;
  previousStatus: PresenceStatus;
  currentStatus: PresenceStatus;
  lastSeenAt: string | null;
  changed: boolean;
}

export class PresenceRegistry {
  /** Map from userId to Set of active socket IDs */
  private userSockets = new Map<string, Set<string>>();

  /** Map from socketId to userId for O(1) reverse lookup */
  private socketToUser = new Map<string, string>();

  /** Map from userId to last seen timestamp (ISO string) when they go offline */
  private lastSeenMap = new Map<string, string>();

  /**
   * Register a connected socket for a user.
   * If this is the user's first active socket, status transitions to ONLINE.
   */
  public addSocket(userId: string, socketId: string): PresenceTransition {
    let sockets = this.userSockets.get(userId);
    const wasOnline = sockets !== undefined && sockets.size > 0;

    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }

    sockets.add(socketId);
    this.socketToUser.set(socketId, userId);

    const isOnline = sockets.size > 0;
    const previousStatus: PresenceStatus = wasOnline ? 'ONLINE' : 'OFFLINE';
    const currentStatus: PresenceStatus = isOnline ? 'ONLINE' : 'OFFLINE';

    return {
      userId,
      previousStatus,
      currentStatus,
      lastSeenAt: this.lastSeenMap.get(userId) ?? null,
      changed: previousStatus !== currentStatus,
    };
  }

  /**
   * Remove a disconnected socket.
   * If this was the user's last active socket, status transitions to OFFLINE
   * and lastSeenAt is updated to now.
   */
  public removeSocket(socketId: string): PresenceTransition | null {
    const userId = this.socketToUser.get(socketId);
    if (!userId) {
      return null;
    }

    this.socketToUser.delete(socketId);
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return null;
    }

    const wasOnline = sockets.size > 0;
    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      const nowIso = new Date().toISOString();
      this.lastSeenMap.set(userId, nowIso);

      return {
        userId,
        previousStatus: wasOnline ? 'ONLINE' : 'OFFLINE',
        currentStatus: 'OFFLINE',
        lastSeenAt: nowIso,
        changed: wasOnline !== false,
      };
    }

    return {
      userId,
      previousStatus: 'ONLINE',
      currentStatus: 'ONLINE',
      lastSeenAt: this.lastSeenMap.get(userId) ?? null,
      changed: false,
    };
  }

  /**
   * Query the presence of a single user.
   */
  public getPresence(userId: string): UserPresence {
    const sockets = this.userSockets.get(userId);
    const isOnline = sockets !== undefined && sockets.size > 0;

    return {
      userId,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: isOnline ? null : (this.lastSeenMap.get(userId) ?? null),
    };
  }

  /**
   * Batch query presence for a list of user IDs.
   */
  public getPresences(userIds: string[]): UserPresence[] {
    return userIds.map((id) => this.getPresence(id));
  }

  /**
   * Check if a user is currently online.
   */
  public isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  /**
   * Return number of active sockets for a user.
   */
  public getSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size ?? 0;
  }

  /**
   * Reset registry (useful for test isolation).
   */
  public clear(): void {
    this.userSockets.clear();
    this.socketToUser.clear();
    this.lastSeenMap.clear();
  }
}

/** Global singleton presence registry for the Node process. */
export const presenceRegistry = new PresenceRegistry();
