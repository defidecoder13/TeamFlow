/**
 * Shell provider (Audit 01).
 *
 * Composes the real session, workspace, channel, DM, notification, and
 * presence hooks so shell chrome (Sidebar/TopBar/MobileDrawer/dialogs)
 * reads backend truth while AppProvider keeps UI-only state for mock pages
 * that have not been audited yet.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { getApiBaseUrl } from './config';
import { useSessionUser, type SessionUser } from './use-session-user';
import { useWorkspaces, type WorkspacesStore } from './use-workspaces';
import { useWorkspaceChannels } from './use-workspace-channels';
import { useDirectConversations } from './use-direct-conversations';
import { useNotifications } from './use-notifications';
import { usePresence } from './use-presence';
import { useWorkspaceMembers } from './use-workspace-members';
import {
  createWorkspace as createWorkspaceApi,
  type WorkspaceSummary,
} from './workspaces';
import {
  createChannel as createChannelApi,
  markChannelRead as markChannelReadApi,
  updateChannelUserState as updateChannelUserStateApi,
  type Channel,
  type ChannelUserState,
} from './channels';
import { createInvitation, type CreateInvitationResult } from './invitations';
import {
  onRealtimeMessageNew,
  joinRealtimeChannel,
  leaveRealtimeChannel,
  disconnectRealtime,
  onRealtimeReconnect,
} from './realtime-client';
import { clearAttachmentDownloadUrlCache } from './attachments';
import type { DirectConversation } from './messages';

export interface ShellCreateWorkspaceInput {
  name: string;
  slug?: string;
}

export type ShellCreateWorkspaceResult =
  | { ok: true; workspace: WorkspaceSummary }
  | { ok: false; kind: string; message?: string };

export interface ShellCreateChannelInput {
  name: string;
  description?: string;
  topic?: string;
  type: 'PUBLIC' | 'PRIVATE';
}

export type ShellCreateChannelResult =
  | { ok: true; channel: Channel }
  | { ok: false; kind: string; message?: string };

export interface ShellContextValue {
  session: ReturnType<typeof useSessionUser>;
  currentUser: SessionUser | null;
  workspaces: WorkspacesStore;
  currentWorkspace: WorkspaceSummary | null;
  channelState: ReturnType<typeof useWorkspaceChannels>;
  channels: Channel[];
  dmState: ReturnType<typeof useDirectConversations>;
  dms: DirectConversation[];
  notifications: ReturnType<typeof useNotifications>;
  members: ReturnType<typeof useWorkspaceMembers>;
  presence: ReturnType<typeof usePresence>;

  createWorkspace: (input: ShellCreateWorkspaceInput) => Promise<ShellCreateWorkspaceResult>;
  createChannel: (input: ShellCreateChannelInput) => Promise<ShellCreateChannelResult>;
  inviteMember: (
    email: string,
    role?: 'MEMBER' | 'ADMIN',
  ) => Promise<CreateInvitationResult>;
  toggleChannelStar: (channel: Channel) => Promise<void>;
  toggleChannelMute: (channel: Channel) => Promise<void>;
  markChannelRead: (channel: Channel) => Promise<void>;
  signOut: () => Promise<void>;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const shell = useContext(ShellContext);
  if (!shell) {
    throw new Error('useShell must be used within a ShellProvider.');
  }
  return shell;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const session = useSessionUser();
  const { signOut: clerkSignOut } = useClerk();
  const workspaces = useWorkspaces();
  const router = useRouter();
  const pathname = usePathname();

  const currentUserId = session.status === 'authenticated' ? session.user.id : null;
  const currentWorkspace =
    workspaces.state.status === 'ready' ? workspaces.state.current : null;
  const workspaceId = currentWorkspace?.id ?? null;

  const channelState = useWorkspaceChannels(workspaceId);
  const dmState = useDirectConversations(workspaceId, currentUserId);
  const notifications = useNotifications(workspaceId);
  const members = useWorkspaceMembers(workspaceId);
  const presence = usePresence(workspaceId);

  const channels = channelState.state.status === 'ready' ? channelState.state.channels : [];
  const dms = dmState.state.status === 'ready' ? dmState.state.conversations : [];

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // Live unread: message:new for a non-active channel bumps its badge.
  // Public channels are joined so badges update even when not open.
  // Server-side room membership is lost on transport drop, so rejoins are
  // re-emitted on reconnect (data hooks refetch for truth; this effect owns
  // the badge joins, which no hook would otherwise restore).
  useEffect(() => {
    const joined = new Set<string>();
    let cancelled = false;
    async function joinAll() {
      for (const channel of channelsRef.current) {
        if (cancelled || joined.has(channel.id)) continue;
        joined.add(channel.id);
        await joinRealtimeChannel(channel.id);
      }
    }
    void joinAll();
    const offReconnect = onRealtimeReconnect(() => {
      joined.clear();
      void joinAll();
    });
    return () => {
      cancelled = true;
      offReconnect();
      for (const id of joined) {
        void leaveRealtimeChannel(id);
      }
    };
  }, [channels]);

  useEffect(() => {
    const unsubscribe = onRealtimeMessageNew((event) => {
      const channelId = event.channelId;
      if (!channelId || !workspaceId) return;
      const activeSlug = pathname?.startsWith('/app/channels/')
        ? pathname.slice('/app/channels/'.length).split('/')[0]
        : null;
      const channel = channelsRef.current.find((c) => c.id === channelId);
      if (!channel || channel.slug === activeSlug) return;
      channelState.updateChannelState({
        ...channel,
        userState: {
          unreadCount: (channel.userState?.unreadCount ?? 0) + 1,
          hasUnread: true,
          lastReadMessageId: channel.userState?.lastReadMessageId ?? null,
          isStarred: channel.userState?.isStarred ?? false,
          isMuted: channel.userState?.isMuted ?? false,
        },
      });
    });
    return unsubscribe;
  }, [workspaceId, pathname, channelState]);

  const createWorkspace = useCallback(
    async (input: ShellCreateWorkspaceInput): Promise<ShellCreateWorkspaceResult> => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, kind: 'failed' };
      }
      const result = await createWorkspaceApi(apiBase, input.name, input.slug);
      if (!result.ok) {
        return {
          ok: false,
          kind: result.kind,
          message: 'message' in result ? result.message : undefined,
        };
      }
      workspaces.addWorkspace(result.workspace);
      return { ok: true, workspace: result.workspace };
    },
    [workspaces],
  );

  const createChannel = useCallback(
    async (input: ShellCreateChannelInput): Promise<ShellCreateChannelResult> => {
      if (!workspaceId) return { ok: false, kind: 'failed' };
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, kind: 'failed' };
      }
      const result = await createChannelApi(apiBase, workspaceId, input);
      if (!result.ok) {
        return {
          ok: false,
          kind: result.kind,
          message: 'message' in result ? result.message : undefined,
        };
      }
      channelState.addChannel({
        ...result.channel,
        userState: {
          unreadCount: 0,
          hasUnread: false,
          lastReadMessageId: null,
          isStarred: false,
          isMuted: false,
        },
      });
      return { ok: true, channel: result.channel };
    },
    [workspaceId, channelState],
  );

  const inviteMember = useCallback(
    async (email: string, role?: 'MEMBER' | 'ADMIN'): Promise<CreateInvitationResult> => {
      if (!workspaceId) return { ok: false, kind: 'failed' };
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, kind: 'failed' };
      }
      return createInvitation(apiBase, workspaceId, email, role);
    },
    [workspaceId],
  );

  const patchUserState = useCallback(
    async (channel: Channel, patch: Partial<ChannelUserState>) => {
      if (!workspaceId) return;
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return;
      }
      const result = await updateChannelUserStateApi(apiBase, workspaceId, channel.slug, patch);
      if (!result.ok) return;
      channelState.updateChannelState({
        ...channel,
        userState: result.userState,
      });
    },
    [workspaceId, channelState],
  );

  const toggleChannelStar = useCallback(
    async (channel: Channel) => {
      await patchUserState(channel, {
        isStarred: !(channel.userState?.isStarred ?? false),
      });
    },
    [patchUserState],
  );

  const toggleChannelMute = useCallback(
    async (channel: Channel) => {
      await patchUserState(channel, {
        isMuted: !(channel.userState?.isMuted ?? false),
      });
    },
    [patchUserState],
  );

  const markChannelRead = useCallback(
    async (channel: Channel) => {
      if (!workspaceId) return;
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return;
      }
      const result = await markChannelReadApi(apiBase, workspaceId, channel.slug);
      if (!result.ok) return;
      channelState.updateChannelState({
        ...channel,
        userState: result.userState,
      });
    },
    [workspaceId, channelState],
  );

  // Mark active channel read whenever the route lands on a channel.
  useEffect(() => {
    if (!workspaceId || !pathname?.startsWith('/app/channels/')) return;
    const slug = pathname.slice('/app/channels/'.length).split('/')[0];
    if (!slug) return;
    const channel = channelsRef.current.find((c) => c.slug === slug);
    if (!channel || !channel.userState?.hasUnread) return;
    void markChannelRead(channel);
  }, [workspaceId, pathname, channels, markChannelRead]);

  const signOut = useCallback(async () => {
    try {
      await clerkSignOut();
    } catch {
      // Leave anyway: the landing page is public, so a surviving session
      // simply shows signed-in nav — never fake success, never strand.
    }
    // Session-scoped client state must not outlive the session (same
    // teardown as UserMenu): Socket.IO would keep receiving otherwise.
    disconnectRealtime();
    clearAttachmentDownloadUrlCache();
    router.replace('/');
    router.refresh();
  }, [router, clerkSignOut]);

  const value = useMemo<ShellContextValue>(
    () => ({
      session,
      currentUser: session.status === 'authenticated' ? session.user : null,
      workspaces,
      currentWorkspace,
      channelState,
      channels,
      dmState,
      dms,
      notifications,
      members,
      presence,
      createWorkspace,
      createChannel,
      inviteMember,
      toggleChannelStar,
      toggleChannelMute,
      markChannelRead,
      signOut,
    }),
    [
      session,
      workspaces,
      currentWorkspace,
      channelState,
      channels,
      dmState,
      dms,
      notifications,
      members,
      presence,
      createWorkspace,
      createChannel,
      inviteMember,
      toggleChannelStar,
      toggleChannelMute,
      markChannelRead,
      signOut,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
