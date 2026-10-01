import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  Channel,
  DMConversation,
  Member,
  MemberRole,
  Message,
  NotificationItem,
  NotificationPreferences,
  PendingInvite,
  Workspace,
  Attachment,
} from '../types';
import {
  INITIAL_CHANNELS,
  INITIAL_CURRENT_USER,
  INITIAL_DMS,
  INITIAL_MEMBERS,
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATION_PREFERENCES,
  INITIAL_NOTIFICATIONS,
  INITIAL_PENDING_INVITES,
  INITIAL_WORKSPACES,
} from '../data/initialData';

interface ToastState {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'error';
}

interface AppContextType {
  // Workspaces
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string, domain?: string) => void;
  renameWorkspace: (name: string) => void;
  deleteWorkspace: (id: string) => void;

  // Channels
  channels: Channel[];
  createChannel: (name: string, topic: string, description: string, isPrivate: boolean) => Channel;
  editChannel: (id: string, updates: Partial<Channel>) => void;
  deleteChannel: (id: string) => void;
  leaveChannel: (id: string) => void;
  toggleMuteChannel: (id: string) => void;
  toggleFavoriteChannel: (id: string) => void;
  addMemberToChannel: (channelId: string, memberId: string) => void;
  removeMemberFromChannel: (channelId: string, memberId: string) => void;

  // Direct Messages
  dms: DMConversation[];
  createOrGetDm: (participantIds: string[]) => DMConversation;

  // Messages & Threads
  messages: Message[];
  sendMessage: (params: {
    channelId?: string;
    conversationId?: string;
    content: string;
    attachments?: Attachment[];
    parentId?: string;
  }) => Message;
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  activeThread: Message | null;
  openThread: (message: Message) => void;
  closeThread: () => void;

  // Drafts
  drafts: Record<string, string>;
  saveDraft: (key: string, content: string) => void;
  deleteDraft: (key: string) => void;

  // Members & Profile
  members: Member[];
  currentUser: Member;
  updateCurrentUser: (updates: Partial<Member>) => void;
  updateMemberRole: (memberId: string, role: MemberRole) => void;
  removeMember: (memberId: string) => void;
  pendingInvites: PendingInvite[];
  inviteMember: (email: string, role: MemberRole) => PendingInvite;
  revokeInvite: (inviteId: string) => void;

  // Notifications
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  notificationPreferences: NotificationPreferences;
  updateNotificationPreferences: (updates: Partial<NotificationPreferences>) => void;

  // Dialog & Modal controls
  isCreateChannelOpen: boolean;
  setCreateChannelOpen: (open: boolean) => void;
  isCreateWorkspaceOpen: boolean;
  setCreateWorkspaceOpen: (open: boolean) => void;
  isInviteMemberOpen: boolean;
  setInviteMemberOpen: (open: boolean) => void;
  isChannelMembersOpen: boolean;
  setChannelMembersOpen: (open: boolean) => void;
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // Toast / Live announcer
  toast: ToastState | null;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  hideToast: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(INITIAL_WORKSPACES);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('ws-acme');

  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [dms, setDms] = useState<DMConversation[]>(INITIAL_DMS);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Drafts store by channel ID or conversation ID or thread ID
  const [drafts, setDrafts] = useState<Record<string, string>>({
    'chn-c2': 'Drafting the rollout timeline for the team...',
    'chn-c3': 'Looking into the design tokens update for next sprint.',
  });

  const saveDraft = useCallback((key: string, content: string) => {
    setDrafts((prev) => {
      if (!content.trim()) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: content };
    });
  }, []);

  const deleteDraft = useCallback((key: string) => {
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }, []);

  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [currentUser, setCurrentUser] = useState<Member>(INITIAL_CURRENT_USER);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>(INITIAL_PENDING_INVITES);

  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(
    INITIAL_NOTIFICATION_PREFERENCES
  );

  // Modals
  const [isCreateChannelOpen, setCreateChannelOpen] = useState(false);
  const [isCreateWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [isInviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [isChannelMembersOpen, setChannelMembersOpen] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Date.now().toString();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  }, [workspaces, activeWorkspaceId]);

  const createWorkspace = useCallback((name: string, domain?: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name,
      slug,
      avatarText: initials || 'WS',
      domain: domain || `teamflow.io/${slug}`,
      plan: 'pro',
      memberCount: 1,
    };

    setWorkspaces((prev) => [...prev, newWs]);
    setActiveWorkspaceId(newWs.id);
    showToast(`Workspace "${name}" created successfully.`, 'success');
  }, [showToast]);

  const renameWorkspace = useCallback((name: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === activeWorkspaceId ? { ...w, name } : w))
    );
    showToast(`Workspace renamed to "${name}".`, 'success');
  }, [activeWorkspaceId, showToast]);

  const deleteWorkspace = useCallback((id: string) => {
    setWorkspaces((prev) => {
      const remaining = prev.filter((w) => w.id !== id);
      if (remaining.length > 0) {
        setActiveWorkspaceId(remaining[0].id);
      }
      return remaining;
    });
    showToast('Workspace was permanently removed.', 'info');
  }, [showToast]);

  const createChannel = useCallback(
    (name: string, topic: string, description: string, isPrivate: boolean) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const newChannel: Channel = {
        id: `chn-${Date.now()}`,
        slug,
        name: slug,
        topic,
        description,
        isPrivate,
        memberIds: [currentUser.id],
        unreadCount: 0,
        createdAt: new Date().toISOString(),
      };
      setChannels((prev) => [...prev, newChannel]);
      showToast(`Channel #${slug} created.`, 'success');
      return newChannel;
    },
    [currentUser.id, showToast]
  );

  const editChannel = useCallback((id: string, updates: Partial<Channel>) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
    showToast('Channel settings updated.', 'success');
  }, [showToast]);

  const deleteChannel = useCallback((id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    setMessages((prev) => prev.filter((m) => m.channelId !== id));
    showToast('Channel deleted.', 'info');
  }, [showToast]);

  const leaveChannel = useCallback((id: string) => {
    setChannels((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, memberIds: c.memberIds.filter((m) => m !== currentUser.id) } : c
      )
    );
    showToast('You left the channel.', 'info');
  }, [currentUser.id, showToast]);

  const toggleMuteChannel = useCallback((id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isMuted: !c.isMuted } : c))
    );
  }, []);

  const toggleFavoriteChannel = useCallback((id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite } : c))
    );
  }, []);

  const addMemberToChannel = useCallback((channelId: string, memberId: string) => {
    setChannels((prev) =>
      prev.map((c) => {
        if (c.id === channelId && !c.memberIds.includes(memberId)) {
          return { ...c, memberIds: [...c.memberIds, memberId] };
        }
        return c;
      })
    );
    showToast('Member added to channel.', 'success');
  }, [showToast]);

  const removeMemberFromChannel = useCallback((channelId: string, memberId: string) => {
    setChannels((prev) =>
      prev.map((c) => {
        if (c.id === channelId) {
          return { ...c, memberIds: c.memberIds.filter((m) => m !== memberId) };
        }
        return c;
      })
    );
    showToast('Member removed from channel.', 'info');
  }, [showToast]);

  const createOrGetDm = useCallback(
    (participantIds: string[]) => {
      const existing = dms.find((d) => {
        const setA = new Set(d.participantIds);
        const setB = new Set(participantIds);
        if (setA.size !== setB.size) return false;
        for (const item of setA) if (!setB.has(item)) return false;
        return true;
      });
      if (existing) return existing;

      const newDm: DMConversation = {
        id: `dm-${Date.now()}`,
        participantIds,
        unreadCount: 0,
        lastMessageAt: 'Just now',
      };
      setDms((prev) => [newDm, ...prev]);
      return newDm;
    },
    [dms]
  );

  const sendMessage = useCallback(
    ({
      channelId,
      conversationId,
      content,
      attachments = [],
      parentId,
    }: {
      channelId?: string;
      conversationId?: string;
      content: string;
      attachments?: Attachment[];
      parentId?: string;
    }) => {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newMsg: Message = {
        id: `msg-${Date.now()}`,
        channelId,
        conversationId,
        senderId: currentUser.id,
        content,
        createdAt: timeString,
        timestampMs: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
        reactions: [],
        parentId,
      };

      setMessages((prev) => [...prev, newMsg]);

      if (parentId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === parentId
              ? {
                  ...m,
                  replyCount: (m.replyCount || 0) + 1,
                  lastReplyAt: timeString,
                }
              : m
          )
        );
      }

      return newMsg;
    },
    [currentUser.id]
  );

  const editMessage = useCallback((messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              content: newContent,
              editedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : m
      )
    );
    showToast('Message edited', 'info');
  }, [showToast]);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      // Also remove replies if this was a parent or clean up
      return prev.filter((m) => m.id !== messageId && m.parentId !== messageId);
    });
    showToast('Message deleted', 'info');
  }, [showToast]);

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const existingReaction = msg.reactions.find((r) => r.emoji === emoji);
          let updatedReactions = [...msg.reactions];

          if (existingReaction) {
            const hasReacted = existingReaction.users.includes(currentUser.id);
            if (hasReacted) {
              // remove user
              const newUsers = existingReaction.users.filter((u) => u !== currentUser.id);
              if (newUsers.length === 0) {
                updatedReactions = updatedReactions.filter((r) => r.emoji !== emoji);
              } else {
                updatedReactions = updatedReactions.map((r) =>
                  r.emoji === emoji ? { ...r, count: newUsers.length, users: newUsers } : r
                );
              }
            } else {
              // add user
              const newUsers = [...existingReaction.users, currentUser.id];
              updatedReactions = updatedReactions.map((r) =>
                r.emoji === emoji ? { ...r, count: newUsers.length, users: newUsers } : r
              );
            }
          } else {
            // New reaction
            updatedReactions.push({
              emoji,
              count: 1,
              users: [currentUser.id],
            });
          }

          return { ...msg, reactions: updatedReactions };
        })
      );
    },
    [currentUser.id]
  );

  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return messages.find((m) => m.id === activeThreadId) || null;
  }, [messages, activeThreadId]);

  const openThread = useCallback((message: Message) => {
    setActiveThreadId(message.id);
  }, []);

  const closeThread = useCallback(() => {
    setActiveThreadId(null);
  }, []);

  const updateCurrentUser = useCallback((updates: Partial<Member>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
    setMembers((prev) =>
      prev.map((m) => (m.id === INITIAL_CURRENT_USER.id ? { ...m, ...updates } : m))
    );
    showToast('Profile updated successfully.', 'success');
  }, [showToast]);

  const updateMemberRole = useCallback((memberId: string, role: MemberRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m))
    );
    showToast('Member role updated.', 'success');
  }, [showToast]);

  const removeMember = useCallback((memberId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    showToast('Member removed from workspace.', 'info');
  }, [showToast]);

  const inviteMember = useCallback((email: string, role: MemberRole) => {
    const newInvite: PendingInvite = {
      id: `inv-${Date.now()}`,
      email,
      role,
      invitedAt: 'Today',
      inviteLink: `https://teamflow.io/join/acme-flow?token=inv_${Math.random().toString(36).substring(2, 8)}`,
    };
    setPendingInvites((prev) => [newInvite, ...prev]);
    showToast(`Invitation sent to ${email}`, 'success');
    return newInvite;
  }, [showToast]);

  const revokeInvite = useCallback((inviteId: string) => {
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    showToast('Invitation revoked.', 'info');
  }, [showToast]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const markNotificationAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    showToast('All notifications marked as read.', 'info');
  }, [showToast]);

  const updateNotificationPreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setNotificationPreferences((prev) => ({ ...prev, ...updates }));
    showToast('Notification preferences saved.', 'success');
  }, [showToast]);

  const value: AppContextType = {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    channels,
    createChannel,
    editChannel,
    deleteChannel,
    leaveChannel,
    toggleMuteChannel,
    toggleFavoriteChannel,
    addMemberToChannel,
    removeMemberFromChannel,
    dms,
    createOrGetDm,
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    activeThread,
    openThread,
    closeThread,
    drafts,
    saveDraft,
    deleteDraft,
    members,
    currentUser,
    updateCurrentUser,
    updateMemberRole,
    removeMember,
    pendingInvites,
    inviteMember,
    revokeInvite,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    notificationPreferences,
    updateNotificationPreferences,
    isCreateChannelOpen,
    setCreateChannelOpen,
    isCreateWorkspaceOpen,
    setCreateWorkspaceOpen,
    isInviteMemberOpen,
    setInviteMemberOpen,
    isChannelMembersOpen,
    setChannelMembersOpen,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    toast,
    showToast,
    hideToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
