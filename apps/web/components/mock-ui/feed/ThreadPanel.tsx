import React, { useEffect, useRef } from 'react';
import type { Message } from '../../../lib/messages';
import { useThreadMessages } from '../../../lib/use-thread-messages';
import { uploadSingleAttachmentDraft, type AttachmentDraft } from '../../../lib/attachments';
import type { MentionMember } from '../../../lib/mentions';
import { MessageItem } from './MessageItem';
import { MessageComposer, type SendMessageResult } from './MessageComposer';
import { X, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';

interface ThreadPanelProps {
  rootMessage: Message;
  channelId?: string | null;
  onClose: () => void;
  mentionMembers?: MentionMember[];
}

export const ThreadPanel: React.FC<ThreadPanelProps> = ({
  rootMessage,
  channelId = null,
  onClose,
  mentionMembers = [],
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const thread = useThreadMessages(rootMessage.id, channelId);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const replies =
    thread.state.status === 'ready'
      ? thread.state.messages.filter((m) => m.id !== rootMessage.id)
      : [];
  const isLoading = thread.state.status === 'loading';
  const error =
    thread.state.status === 'error'
      ? thread.state.message
      : thread.state.status === 'unauthenticated'
        ? 'Session expired.'
        : thread.state.status === 'notFound'
          ? 'Thread no longer available.'
          : null;

  const handleSendReply = async (body: string, files: File[]): Promise<SendMessageResult> => {
    const result = await thread.send(body);
    if (!result.ok || !result.messageId) {
      return { ok: false, error: result.error };
    }

    if (files.length === 0) {
      return result;
    }

    const errors: string[] = [];
    for (const file of files) {
      const draft: AttachmentDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        status: 'idle',
        progress: 0,
      };
      const upload = await uploadSingleAttachmentDraft(result.messageId, draft);
      if (!upload.ok) {
        errors.push(upload.error);
      }
    }

    await thread.refresh();
    if (errors.length > 0) {
      return { ok: true, messageId: result.messageId, error: errors.join(' ') };
    }
    return result;
  };

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label="Thread replies"
      data-selected-thread-id={rootMessage.id}
      className="w-full sm:w-[380px] lg:w-[420px] shrink-0 bg-white border-l border-[#E4E2DF] flex flex-col h-full z-20 shadow-[-4px_0_16px_rgba(20,24,32,0.03)]"
    >
      <div className="h-14 px-4 border-b border-[#E4E2DF] flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#737782]" />
          <h2 className="text-[14px] font-semibold text-[#171A21]">Thread</h2>
          <span className="text-[12px] text-[#737782] tabular-nums">
            ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
          </span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
          aria-label="Close thread panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <MessageItem
          message={rootMessage}
          isThreadRoot
          onEditMessage={thread.edit}
          onDeleteMessage={thread.remove}
          onRemoveAttachment={thread.removeAttachment}
        />

        <div className="px-4 py-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
            {isLoading
              ? 'Loading replies…'
              : replies.length === 0
                ? 'No replies yet'
                : 'Replies'}
          </span>
          <div className="flex-1 h-[1px] bg-[#ECEAE7]" />
        </div>

        {error && (
          <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-[8px] flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 text-[#C94A45] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#C94A45]">{error}</p>
              {thread.state.status === 'error' && (
                <button
                  type="button"
                  onClick={thread.retry}
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#C94A45] hover:underline"
                >
                  <RefreshCw className="w-3 h-3" />
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {thread.isLoadingOlder && (
          <div className="px-4 py-2 text-[12px] text-[#737782]">Loading earlier replies…</div>
        )}
        {thread.loadOlderError && (
          <div className="px-4 py-2 text-[12px] text-[#C94A45]" role="alert">
            {thread.loadOlderError}
          </div>
        )}

        <div className="space-y-1">
          {replies.map((reply) => (
            <MessageItem
              key={reply.id}
              message={reply}
              onEditMessage={thread.edit}
              onDeleteMessage={thread.remove}
              onRemoveAttachment={thread.removeAttachment}
            />
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-[#ECEAE7]/80 bg-white shrink-0">
        <MessageComposer
          placeholder="Reply in thread..."
          onSendMessage={handleSendReply}
          mentionMembers={mentionMembers}
        />
      </div>
    </aside>
  );
};
