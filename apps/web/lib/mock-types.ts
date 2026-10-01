export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';

export type PresenceStatus = 'online' | 'away' | 'offline';

export type AvatarType = 'uploaded' | 'professional' | 'initials';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatarUrl: string;
  avatarType?: AvatarType;
  title: string;
  presence: PresenceStatus;
  statusText?: string;
  isCurrentUser?: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: MemberRole;
  invitedAt: string;
  inviteLink: string;
}

export interface Attachment {
  id: string;
  name: string;
  sizeBytes: number;
  url: string;
  type: string;
}

export interface AttachmentDraft {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number; // 0-100
  error?: string;
  file?: File;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[]; // memberIds
}

export interface Message {
  id: string;
  channelId?: string;
  conversationId?: string;
  senderId: string;
  content: string;
  createdAt: string; // ISO or formatted
  timestampMs: number;
  attachments?: Attachment[];
  reactions: Reaction[];
  replyCount?: number;
  lastReplyAt?: string;
  isPinned?: boolean;
  editedAt?: string;
  parentId?: string; // If in thread
}

export interface Channel {
  id: string;
  slug: string;
  name: string;
  topic: string;
  description: string;
  isPrivate: boolean;
  memberIds: string[];
  unreadCount: number;
  isMuted?: boolean;
  isFavorite?: boolean;
  createdAt: string;
}

export interface DMConversation {
  id: string;
  participantIds: string[];
  unreadCount: number;
  lastMessageAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  avatarText: string;
  domain: string;
  plan: 'free' | 'pro' | 'enterprise';
  memberCount: number;
  logoUrl?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  targetUrl: string;
  type: 'mention' | 'dm' | 'reply' | 'invite';
}

export interface NotificationPreferences {
  mentions: 'all' | 'mentions_only' | 'none';
  dms: 'all' | 'mentions_only' | 'none';
  threadReplies: 'all' | 'mentions_only' | 'none';
  emailDigest: boolean;
  desktopNotifications: boolean;
  soundEnabled: boolean;
}
