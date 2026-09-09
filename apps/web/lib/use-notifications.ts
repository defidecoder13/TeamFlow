/**
 * Notification center state (Phase 4H.7).
 *
 * One hook instance owns a single workspace's notification state — workspace
 * switches reset everything through the request key, so stale responses can
 * never populate the wrong workspace. Race discipline mirrors use-search:
 * monotonic request ids plus AbortController; only the latest request for
 * the current workspace may write state. Server order (createdAt DESC,
 * id DESC) is preserved verbatim; merges key strictly on notification.id.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationFromJson,
  type NotificationItem,
} from './notifications';
import {
  connectRealtime,
  onRealtimeNotificationNew,
  onRealtimeNotificationRead,
  onRealtimeNotificationReadAll,
  onRealtimeReconnect,
  type RealtimeNotificationNewEvent,
  type RealtimeNotificationReadAllEvent,
  type RealtimeNotificationReadEvent,
} from './realtime-client';

export type NotificationsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      items: NotificationItem[];
      hasMore: boolean;
      nextCursor: string | null;
    }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load notifications. Check your connection and try again.';
const PAGE_LIMIT = 50;

function mergeById(existing: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  if (incoming.length === 0) {
    return existing;
  }
  const incomingIds = new Set(incoming.map((item) => item.id));
  const merged = incoming.filter(
    (item, index) => incoming.findIndex((other) => other.id === item.id) === index,
  );
  for (const item of existing) {
    if (!incomingIds.has(item.id)) {
      merged.push(item);
    }
  }
  return merged;
}

function appendPage(
  existing: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function useNotifications(workspaceId: string | null): {
  state: NotificationsState;
  hasUnread: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  loadMore: () => void;
  retry: () => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  actionError: string | null;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<NotificationsState>({ status: 'idle' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // Initial load + workspace switching + retry. The key below is the only
  // identity a response is accepted for.
  useEffect(() => {
    if (!workspaceId) {
      requestIdRef.current += 1;
      setState({ status: 'idle' });
      setIsLoadingMore(false);
      setLoadMoreError(null);
      setActionError(null);
      return;
    }
    const activeWorkspaceId = workspaceId;
    const myId = ++requestIdRef.current;
    setState({ status: 'loading' });
    setIsLoadingMore(false);
    setLoadMoreError(null);

    const controller = new AbortController();
    void (async () => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (requestIdRef.current === myId) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        }
        return;
      }
      const result = await fetchNotifications(apiBase, activeWorkspaceId, {
        limit: PAGE_LIMIT,
        signal: controller.signal,
      });
      if (requestIdRef.current !== myId) {
        return;
      }
      if (result.ok) {
        setState({
          status: 'ready',
          items: result.data.notifications,
          hasMore: result.data.pageInfo.hasMore,
          nextCursor: result.data.pageInfo.nextCursor,
        });
        return;
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }
      if (result.kind === 'aborted') {
        return;
      }
      setState({ status: 'error', message: result.message ?? LOAD_FAILURE_MESSAGE });
    })();

    return () => {
      controller.abort();
    };
  }, [workspaceId, attempt]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    const activeWorkspaceId = workspaceRef.current;
    if (
      !activeWorkspaceId ||
      current.status !== 'ready' ||
      !current.hasMore ||
      !current.nextCursor
    ) {
      return;
    }
    const cursor = current.nextCursor;
    const myId = ++requestIdRef.current;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const controller = new AbortController();
    void (async () => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (requestIdRef.current === myId) {
          setIsLoadingMore(false);
          setLoadMoreError(LOAD_FAILURE_MESSAGE);
        }
        return;
      }
      const result = await fetchNotifications(apiBase, activeWorkspaceId, {
        limit: PAGE_LIMIT,
        cursor,
        signal: controller.signal,
      });
      if (requestIdRef.current !== myId) {
        return;
      }
      setIsLoadingMore(false);
      if (result.ok) {
        setState((previous) => {
          if (previous.status !== 'ready') {
            return previous;
          }
          return {
            status: 'ready',
            items: appendPage(previous.items, result.data.notifications),
            hasMore: result.data.pageInfo.hasMore,
            nextCursor: result.data.pageInfo.nextCursor,
          };
        });
        return;
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }
      if (result.kind === 'aborted') {
        return;
      }
      setLoadMoreError(result.message ?? LOAD_FAILURE_MESSAGE);
    })();
  }, []);

  // Realtime: merge by id, scope every event to this workspace.
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const activeWorkspaceId = workspaceId;
    connectRealtime();

    const handleNew = (event: RealtimeNotificationNewEvent) => {
      if (event.notification.workspaceId !== activeWorkspaceId) {
        return;
      }
      const item = notificationFromJson(event.notification);
      if (!item) {
        return;
      }
      requestIdRef.current += 1;
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        return { ...current, items: mergeById(current.items, [item]) };
      });
    };
    const handleRead = (event: RealtimeNotificationReadEvent) => {
      if (event.workspaceId !== activeWorkspaceId) {
        return;
      }
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === event.id ? { ...item, readAt: new Date(event.readAt) } : item,
          ),
        };
      });
    };
    const handleReadAll = (event: RealtimeNotificationReadAllEvent) => {
      if (event.workspaceId !== activeWorkspaceId) {
        return;
      }
      const readAt = new Date(event.readAt);
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        return {
          ...current,
          items: current.items.map((item) => (item.readAt === null ? { ...item, readAt } : item)),
        };
      });
    };
    const handleReconnect = () => {
      // Authoritative resync: refetch the loaded range and merge by id.
      // Reuses the same request-key discipline as the initial load.
      const current = stateRef.current;
      const limit =
        current.status === 'ready' ? Math.max(current.items.length, PAGE_LIMIT) : PAGE_LIMIT;
      const myId = ++requestIdRef.current;
      const controller = new AbortController();
      void (async () => {
        let apiBase: string;
        try {
          apiBase = getApiBaseUrl();
        } catch {
          return;
        }
        const result = await fetchNotifications(apiBase, activeWorkspaceId, {
          limit,
          signal: controller.signal,
        });
        if (requestIdRef.current !== myId || !result.ok || !('data' in result)) {
          return;
        }
        setState((previous) => {
          if (previous.status !== 'ready') {
            return previous;
          }
          return {
            status: 'ready',
            items: mergeById(previous.items, result.data.notifications),
            hasMore: result.data.pageInfo.hasMore,
            nextCursor: result.data.pageInfo.nextCursor,
          };
        });
      })();
    };

    const offNew = onRealtimeNotificationNew(handleNew);
    const offRead = onRealtimeNotificationRead(handleRead);
    const offReadAll = onRealtimeNotificationReadAll(handleReadAll);
    const offReconnect = onRealtimeReconnect(handleReconnect);
    return () => {
      offNew();
      offRead();
      offReadAll();
      offReconnect();
    };
  }, [workspaceId]);

  const mutateRead = useCallback(
    async (
      notificationId: string,
      request: (
        apiBase: string,
      ) => Promise<
        { ok: true } | { ok: false; unauthenticated?: boolean; kind?: string; message?: string }
      >,
      apply: (items: NotificationItem[]) => NotificationItem[],
      rollback: (items: NotificationItem[]) => NotificationItem[],
    ) => {
      const activeWorkspaceId = workspaceRef.current;
      if (!activeWorkspaceId || stateRef.current.status !== 'ready') {
        return;
      }
      setActionError(null);
      setState((current) =>
        current.status === 'ready' ? { ...current, items: apply(current.items) } : current,
      );
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        setState((current) =>
          current.status === 'ready' ? { ...current, items: rollback(current.items) } : current,
        );
        setActionError(LOAD_FAILURE_MESSAGE);
        return;
      }
      const result = await request(apiBase);
      // A workspace switch invalidates this mutation's context.
      if (workspaceRef.current !== activeWorkspaceId) {
        return;
      }
      if (!result.ok) {
        setState((current) =>
          current.status === 'ready' ? { ...current, items: rollback(current.items) } : current,
        );
        if (!('unauthenticated' in result)) {
          setActionError(result.message ?? LOAD_FAILURE_MESSAGE);
        }
      }
    },
    [],
  );

  const markRead = useCallback(
    (notificationId: string) => {
      const activeWorkspaceId = workspaceRef.current;
      if (!activeWorkspaceId) {
        return;
      }
      const now = new Date();
      void mutateRead(
        notificationId,
        (apiBase) => markNotificationRead(apiBase, activeWorkspaceId, notificationId),
        (items) =>
          items.map((item) =>
            item.id === notificationId && item.readAt === null ? { ...item, readAt: now } : item,
          ),
        (items) =>
          items.map((item) =>
            item.id === notificationId && item.readAt?.getTime() === now.getTime()
              ? { ...item, readAt: null }
              : item,
          ),
      );
    },
    [mutateRead],
  );

  const markAllRead = useCallback(() => {
    const activeWorkspaceId = workspaceRef.current;
    if (!activeWorkspaceId) {
      return;
    }
    const now = new Date();
    // Snapshot which rows we flip so rollback restores exactly those.
    const snapshot = new Set<string>();
    void mutateRead(
      '__all__',
      (apiBase) => markAllNotificationsRead(apiBase, activeWorkspaceId),
      (items) =>
        items.map((item) => {
          if (item.readAt === null) {
            snapshot.add(item.id);
            return { ...item, readAt: now };
          }
          return item;
        }),
      (items) =>
        items.map((item) =>
          snapshot.has(item.id) && item.readAt?.getTime() === now.getTime()
            ? { ...item, readAt: null }
            : item,
        ),
    );
  }, [mutateRead]);

  const current = state;
  const hasUnread =
    current.status === 'ready' ? current.items.some((item) => item.readAt === null) : false;

  return {
    state,
    hasUnread,
    isLoadingMore,
    loadMoreError,
    loadMore,
    retry,
    markRead,
    markAllRead,
    actionError,
  };
}
