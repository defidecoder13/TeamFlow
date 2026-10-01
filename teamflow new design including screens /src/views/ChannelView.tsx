import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../hooks/useRouter';
import { MessageFeed } from '../components/feed/MessageFeed';
import { MessageComposer } from '../components/feed/MessageComposer';
import { ThreadPanel } from '../components/feed/ThreadPanel';
import { ChannelMembersDialog } from '../components/shell/ChannelMembersDialog';
import { Dialog } from '../components/primitives/Dialog';
import { AuthField } from '../components/primitives/AuthField';
import {
  Hash,
  Lock,
  Users,
  MoreVertical,
  Edit2,
  LogOut,
  Trash2,
  Star,
  BellOff,
  AlertTriangle,
} from 'lucide-react';
import { Attachment } from '../types';

export const ChannelView: React.FC<{ slug: string }> = ({ slug }) => {
  const {
    channels,
    messages,
    sendMessage,
    openThread,
    activeThread,
    editChannel,
    deleteChannel,
    leaveChannel,
    toggleFavoriteChannel,
    toggleMuteChannel,
    setChannelMembersOpen,
    currentUser,
  } = useApp();

  const { push } = useRouter();

  // Find channel by slug
  const channel = channels.find((c) => c.slug === slug);

  // Overflow menu state
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isLeaveOpen, setLeaveOpen] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Loading & error simulation states
  const [isLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  if (!channel) {
    return (
      <main id="main-content" className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#FAF9F8]">
        <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mb-3">
          <Hash className="w-6 h-6" />
        </div>
        <h1 className="text-[20px] font-semibold text-[#171A21]">Channel not found</h1>
        <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm">
          The channel #{slug} does not exist or you do not have permission to view it.
        </p>
        <button
          type="button"
          onClick={() => push('/app')}
          className="mt-4 px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors"
        >
          Return to home
        </button>
      </main>
    );
  }

  // Messages in this channel (root messages only)
  const channelMessages = messages.filter(
    (m) => m.channelId === channel.id && !m.parentId
  );

  const handleSendMessage = (content: string, attachments: Attachment[]) => {
    sendMessage({
      channelId: channel.id,
      content,
      attachments,
    });
  };

  const handleOpenEdit = () => {
    setEditName(channel.name);
    setEditTopic(channel.topic);
    setEditDescription(channel.description);
    setEditError('');
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = editName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!clean) {
      setEditError('Channel name cannot be empty');
      editInputRef.current?.focus();
      return;
    }
    editChannel(channel.id, {
      name: clean,
      slug: clean,
      topic: editTopic.trim(),
      description: editDescription.trim(),
    });
    setEditOpen(false);
    if (clean !== channel.slug) {
      push(`/app/channels/${clean}`);
    }
  };

  const handleDeleteConfirm = () => {
    deleteChannel(channel.id);
    setDeleteOpen(false);
    push('/app');
  };

  const handleLeaveConfirm = () => {
    leaveChannel(channel.id);
    setLeaveOpen(false);
    push('/app');
  };

  return (
    <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 bg-white overflow-hidden relative">
      {/* Channel Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#F6F5F3] text-[#171A21] shrink-0 border border-[#E4E2DF]">
            {channel.isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold text-[#171A21] truncate leading-tight">
                {channel.name}
              </h1>
              {channel.isPrivate && (
                <span className="text-[11px] font-medium text-[#737782] bg-[#F1F0EE] px-1.5 py-0.5 rounded border border-[#E4E2DF]">
                  Private
                </span>
              )}
            </div>
            {channel.topic && (
              <p className="text-[12px] text-[#737782] truncate max-w-md hidden sm:block">
                {channel.topic}
              </p>
            )}
          </div>
        </div>

        {/* Right Header Actions: Members Trigger + Channel Menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Members button (works for ALL channel types per spec) */}
          <button
            type="button"
            onClick={() => setChannelMembersOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            aria-label={`View ${channel.memberIds.length} members in #${channel.name}`}
          >
            <Users className="w-3.5 h-3.5 text-[#737782]" />
            <span className="tabular-nums font-semibold">{channel.memberIds.length}</span>
          </button>

          {/* Star toggle */}
          <button
            type="button"
            onClick={() => toggleFavoriteChannel(channel.id)}
            className={`p-2 rounded-[8px] transition-colors ${
              channel.isFavorite
                ? 'text-amber-500 fill-amber-500'
                : 'text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE]'
            }`}
            title={channel.isFavorite ? 'Remove star' : 'Star channel'}
            aria-label={channel.isFavorite ? 'Remove star' : 'Star channel'}
          >
            <Star className="w-4 h-4" />
          </button>

          {/* Channel Actions Overflow Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!isMenuOpen)}
              className="p-2 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
              aria-label="Channel actions menu"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-56 bg-white border border-[#E4E2DF] rounded-[10px] shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  role="menuitem"
                  onClick={handleOpenEdit}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#737782]" />
                  <span>Edit channel #{channel.name}</span>
                </button>

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    toggleMuteChannel(channel.id);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors"
                >
                  <BellOff className="w-3.5 h-3.5 text-[#737782]" />
                  <span>{channel.isMuted ? `Unmute #${channel.name}` : `Mute #${channel.name}`}</span>
                </button>

                <div className="my-1 border-t border-[#E4E2DF]" />

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setLeaveOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#C94A45] hover:bg-rose-50 rounded-[6px] flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#C94A45]" />
                  <span>Leave #{channel.name}</span>
                </button>

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#C94A45] hover:bg-rose-50 rounded-[6px] flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#C94A45]" />
                  <span>Delete #{channel.name}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body: Message Feed + Thread Panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Feed */}
          <MessageFeed
            messages={channelMessages}
            isLoading={isLoading}
            error={feedError}
            onRetry={() => setFeedError(null)}
            onOpenThread={openThread}
            emptyTitle={`Welcome to #${channel.name}`}
            emptyDescription={
              channel.description || 'This is the start of the conversation. Send a message to get started.'
            }
          />

          {/* Composer */}
          <div className="p-3 sm:p-4 bg-white border-t border-[#E4E2DF]">
            <MessageComposer
              placeholder={`Message #${channel.name}`}
              onSendMessage={handleSendMessage}
            />
          </div>
        </div>

        {/* Thread Side Panel (desktop) or sheet */}
        {activeThread && <ThreadPanel />}
      </div>

      {/* Members Dialog */}
      <ChannelMembersDialog channel={channel} />

      {/* Edit Channel Dialog */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit channel #${channel.name}`}
        description="Update channel topic, details, or handle."
        initialFocusRef={editInputRef}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <AuthField
            ref={editInputRef}
            label="Channel name"
            prefixText="#"
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              if (editError) setEditError('');
            }}
            error={editError}
            required
          />

          <AuthField
            label="Topic"
            value={editTopic}
            onChange={(e) => setEditTopic(e.target.value)}
            placeholder="What is this channel about?"
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-desc" className="text-[13px] font-semibold text-[#171A21]">
              Description
            </label>
            <textarea
              id="edit-desc"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 text-[14px] text-[#171A21] bg-white border border-[#E4E2DF] rounded-[8px] outline-none resize-none focus-visible:border-[#3157D5] focus-visible:ring-2 focus-visible:ring-[#EEF2FF]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E4E2DF]">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-[13px] font-semibold text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors shadow-2xs"
            >
              Save changes
            </button>
          </div>
        </form>
      </Dialog>

      {/* Leave Channel Confirm Dialog with consequence-repeating label */}
      <Dialog
        isOpen={isLeaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={`Leave #${channel.name}?`}
        description={`Are you sure you want to leave #${channel.name}? You will no longer receive notifications or updates from this channel.`}
        role="alertdialog"
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setLeaveOpen(false)}
            className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors"
          >
            Stay in #{channel.name}
          </button>
          <button
            type="button"
            onClick={handleLeaveConfirm}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors"
          >
            Leave #{channel.name}
          </button>
        </div>
      </Dialog>

      {/* Delete Channel Confirm Dialog with consequence-repeating label */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete #${channel.name}?`}
        description={`This will permanently delete #${channel.name} and all ${channelMessages.length} messages and attachments. This action cannot be undone.`}
        role="alertdialog"
      >
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-[8px] text-[13px] text-[#C94A45] mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>All messages in this channel will be purged immediately.</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteConfirm}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors"
          >
            Permanently delete #{channel.name}
          </button>
        </div>
      </Dialog>
    </main>
  );
};
