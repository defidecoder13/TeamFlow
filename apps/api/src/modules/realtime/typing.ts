/**
 * In-memory Typing State Registry (Phase 4I.4).
 *
 * Ephemeral typing state tracker supporting multi-socket sessions, auto-expiration,
 * race-safe generation tokens, and container-scoped tracking for channels & DMs.
 * Zero database persistence or external storage.
 */

export const TYPING_TIMEOUT_MS = 3000;

export type TypingContainerType = 'channel' | 'direct_message';

export interface TypingContainerKey {
  containerType: TypingContainerType;
  containerId: string;
}

export function toContainerKey(containerType: TypingContainerType, containerId: string): string {
  return `${containerType}:${containerId}`;
}

export interface TypingTransition {
  userId: string;
  containerType: TypingContainerType;
  containerId: string;
  changed: boolean; // true if transitioned not-typing -> typing or typing -> not-typing
  isTyping: boolean;
}

interface SocketTypingEntry {
  userId: string;
  containerType: TypingContainerType;
  containerId: string;
  timer: NodeJS.Timeout;
  generation: number;
}

export class TypingRegistry {
  private timeoutMs: number;
  private onUserStoppedTyping?: (transition: TypingTransition) => void;

  // Key: `${socketId}:${toContainerKey(containerType, containerId)}`
  private socketTyping = new Map<string, SocketTypingEntry>();

  // Key: `${userId}:${toContainerKey(containerType, containerId)}` -> Set of socketIds
  private userContainerSockets = new Map<string, Set<string>>();

  // Generation tracker for stale timer invalidation
  private generationCounter = 0;

  constructor(options?: {
    timeoutMs?: number;
    onUserStoppedTyping?: (transition: TypingTransition) => void;
  }) {
    this.timeoutMs = options?.timeoutMs ?? TYPING_TIMEOUT_MS;
    this.onUserStoppedTyping = options?.onUserStoppedTyping;
  }

  public setOnUserStoppedTyping(callback: (transition: TypingTransition) => void): void {
    this.onUserStoppedTyping = callback;
  }

  private userContainerKey(
    userId: string,
    containerType: TypingContainerType,
    containerId: string,
  ): string {
    return `${userId}:${toContainerKey(containerType, containerId)}`;
  }

  private socketKey(
    socketId: string,
    containerType: TypingContainerType,
    containerId: string,
  ): string {
    return `${socketId}:${toContainerKey(containerType, containerId)}`;
  }

  /**
   * Register or refresh a typing state for a socket in a container.
   * Returns a TypingTransition indicating whether the user became active typing (transitioned from not-typing).
   */
  public startTyping(
    userId: string,
    socketId: string,
    containerType: TypingContainerType,
    containerId: string,
  ): TypingTransition {
    const sKey = this.socketKey(socketId, containerType, containerId);
    const ucKey = this.userContainerKey(userId, containerType, containerId);

    let socketSet = this.userContainerSockets.get(ucKey);
    const wasTyping = socketSet && socketSet.size > 0;

    if (!socketSet) {
      socketSet = new Set<string>();
      this.userContainerSockets.set(ucKey, socketSet);
    }
    socketSet.add(socketId);

    // Clear existing timer if socket was already typing in this container
    const existing = this.socketTyping.get(sKey);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const currentGen = ++this.generationCounter;
    const timer = setTimeout(() => {
      this.handleTimeout(userId, socketId, containerType, containerId, currentGen);
    }, this.timeoutMs);

    this.socketTyping.set(sKey, {
      userId,
      containerType,
      containerId,
      timer,
      generation: currentGen,
    });

    const isTypingNow = true;
    const changed = !wasTyping && isTypingNow;

    return {
      userId,
      containerType,
      containerId,
      changed,
      isTyping: isTypingNow,
    };
  }

  /**
   * Explicitly stop typing for a socket in a container.
   * Returns a TypingTransition indicating if the user stopped typing across all their sockets.
   */
  public stopTyping(
    userId: string,
    socketId: string,
    containerType: TypingContainerType,
    containerId: string,
  ): TypingTransition {
    const sKey = this.socketKey(socketId, containerType, containerId);
    const entry = this.socketTyping.get(sKey);
    if (entry) {
      clearTimeout(entry.timer);
      this.socketTyping.delete(sKey);
    }

    const ucKey = this.userContainerKey(userId, containerType, containerId);
    const socketSet = this.userContainerSockets.get(ucKey);
    const wasTyping = socketSet ? socketSet.size > 0 : false;

    if (socketSet) {
      socketSet.delete(socketId);
      if (socketSet.size === 0) {
        this.userContainerSockets.delete(ucKey);
      }
    }

    const isTypingNow = this.isUserTyping(userId, containerType, containerId);
    const changed = wasTyping && !isTypingNow;

    return {
      userId,
      containerType,
      containerId,
      changed,
      isTyping: isTypingNow,
    };
  }

  private handleTimeout(
    userId: string,
    socketId: string,
    containerType: TypingContainerType,
    containerId: string,
    generation: number,
  ): void {
    const sKey = this.socketKey(socketId, containerType, containerId);
    const entry = this.socketTyping.get(sKey);
    if (!entry || entry.generation !== generation) {
      // Stale timer callback, ignore
      return;
    }

    const transition = this.stopTyping(userId, socketId, containerType, containerId);
    if (transition.changed && this.onUserStoppedTyping) {
      this.onUserStoppedTyping(transition);
    }
  }

  /**
   * Remove all typing states registered by a disconnected socket.
   * Returns an array of transitions where the user has completely stopped typing in that container.
   */
  public handleSocketDisconnect(socketId: string): TypingTransition[] {
    const transitions: TypingTransition[] = [];
    const entriesToClean: {
      userId: string;
      containerType: TypingContainerType;
      containerId: string;
    }[] = [];

    for (const [sKey, entry] of this.socketTyping.entries()) {
      if (sKey.startsWith(`${socketId}:`)) {
        clearTimeout(entry.timer);
        entriesToClean.push({
          userId: entry.userId,
          containerType: entry.containerType,
          containerId: entry.containerId,
        });
      }
    }

    for (const item of entriesToClean) {
      const sKey = this.socketKey(socketId, item.containerType, item.containerId);
      this.socketTyping.delete(sKey);

      const ucKey = this.userContainerKey(item.userId, item.containerType, item.containerId);
      const socketSet = this.userContainerSockets.get(ucKey);
      const wasTyping = socketSet ? socketSet.size > 0 : false;

      if (socketSet) {
        socketSet.delete(socketId);
        if (socketSet.size === 0) {
          this.userContainerSockets.delete(ucKey);
        }
      }

      const isTypingNow = this.isUserTyping(item.userId, item.containerType, item.containerId);
      if (wasTyping && !isTypingNow) {
        transitions.push({
          userId: item.userId,
          containerType: item.containerType,
          containerId: item.containerId,
          changed: true,
          isTyping: false,
        });
      }
    }

    return transitions;
  }

  public isUserTyping(
    userId: string,
    containerType: TypingContainerType,
    containerId: string,
  ): boolean {
    const ucKey = this.userContainerKey(userId, containerType, containerId);
    const set = this.userContainerSockets.get(ucKey);
    return Boolean(set && set.size > 0);
  }

  public clear(): void {
    for (const entry of this.socketTyping.values()) {
      clearTimeout(entry.timer);
    }
    this.socketTyping.clear();
    this.userContainerSockets.clear();
  }
}

export const typingRegistry = new TypingRegistry();
