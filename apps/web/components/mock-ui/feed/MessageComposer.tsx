import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../../lib/mock-context';
import type { AttachmentDraft } from '../../../lib/mock-types';
import type { MentionMember } from '../../../lib/mentions';
import type { DraftTargetKind } from '../../../lib/drafts';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE_BYTES,
  validateAttachmentFile,
} from '../../../lib/attachments';
import { getApiBaseUrl } from '../../../lib/config';
import { saveWorkspaceDraft } from '../../../lib/drafts';
import { Avatar } from '@/components/ui/Avatar';
import {
  Bold,
  Italic,
  Code,
  List,
  Link2,
  Smile,
  AtSign,
  Paperclip,
  Send,
  X,
  AlertCircle,
} from 'lucide-react';

export type SendMessageResult = {
  ok: boolean;
  error?: string;
  messageId?: string;
};

/** Optional server-backed draft persistence (Audit 13). */
export interface DraftContext {
  workspaceId: string;
  targetKind: Extract<DraftTargetKind, 'CHANNEL' | 'DIRECT_MESSAGE'>;
  targetId: string;
}

interface MessageComposerProps {
  placeholder?: string;
  onSendMessage: (body: string, files: File[]) => Promise<SendMessageResult>;
  mentionMembers?: MentionMember[];
  onTypingChange?: (text: string) => void;
  onSendComplete?: () => void;
  draftContext?: DraftContext | null;
}

const DRAFT_SAVE_DEBOUNCE_MS = 600;

export const MessageComposer: React.FC<MessageComposerProps> = ({
  placeholder = 'Send a message...',
  onSendMessage,
  mentionMembers = [],
  onTypingChange,
  onSendComplete,
  draftContext = null,
}) => {
  const { showToast } = useApp();
  const [content, setContent] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<AttachmentDraft[]>([]);
  const [isSending, setIsSending] = useState(false);

  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draftWorkspaceId = draftContext?.workspaceId ?? null;
  const draftTargetKind = draftContext?.targetKind ?? null;
  const draftTargetId = draftContext?.targetId ?? null;
  const draftKey =
    draftWorkspaceId && draftTargetKind && draftTargetId
      ? `${draftWorkspaceId}:${draftTargetKind}:${draftTargetId}`
      : null;
  const draftLoadedRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [content]);

  // Load an existing draft when the composer target changes (Audit 13).
  useEffect(() => {
    if (!draftWorkspaceId || !draftTargetKind || !draftTargetId || !draftKey) return;
    if (draftLoadedRef.current === draftKey) return;
    draftLoadedRef.current = draftKey;
    let cancelled = false;
    setContent('');
    void (async () => {
      try {
        const apiBase = getApiBaseUrl();
        const { fetchWorkspaceDrafts } = await import('../../../lib/drafts');
        const result = await fetchWorkspaceDrafts(apiBase, draftWorkspaceId);
        if (cancelled || !result.ok) return;
        const match = result.data.drafts.find(
          (d) => d.targetKind === draftTargetKind && d.targetId === draftTargetId,
        );
        if (match) {
          setContent(match.body);
        }
      } catch {
        // Draft load is best-effort; composer stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftWorkspaceId, draftTargetKind, draftTargetId, draftKey]);

  // Debounced autosave; empty body clears the server row (Audit 13).
  useEffect(() => {
    if (!draftWorkspaceId || !draftTargetKind || !draftTargetId || !draftKey) return;
    if (draftLoadedRef.current !== draftKey) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const apiBase = getApiBaseUrl();
          await saveWorkspaceDraft(apiBase, draftWorkspaceId, {
            targetKind: draftTargetKind,
            targetId: draftTargetId,
            body: contentRef.current,
          });
        } catch {
          // Autosave is best-effort; user can still send.
        }
      })();
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [content, draftWorkspaceId, draftTargetKind, draftTargetId, draftKey]);

  // Clear the draft timer on unmount so a pending save does not fire late.
  useEffect(
    () => () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    },
    [],
  );

  const filteredMentions = mentionMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      (m.email ?? '').toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setContent(val);
    setCursorPos(pos);
    onTypingChange?.(val);

    const textBeforeCursor = val.slice(0, pos);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);

    if (lastAtMatch) {
      setIsMentionOpen(true);
      setMentionQuery(lastAtMatch[1]);
      setMentionIndex(0);
    } else {
      setIsMentionOpen(false);
    }
  };

  const insertMention = (member: MentionMember) => {
    const textBeforeCursor = content.slice(0, cursorPos);
    const textAfterCursor = content.slice(cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    const handle = `@${member.name.split(' ')[0].toLowerCase()}`;
    const newText = textBeforeCursor.slice(0, lastAtIndex) + handle + ' ' + textAfterCursor;

    setContent(newText);
    setIsMentionOpen(false);
    onTypingChange?.(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = lastAtIndex + handle.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMentionOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS_PER_MESSAGE - draftAttachments.length;
    if (remainingSlots <= 0) {
      showToast(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      showToast(
        `Only ${remainingSlots} more attachment${remainingSlots === 1 ? '' : 's'} allowed`,
        'error',
      );
    }

    const newDrafts: AttachmentDraft[] = [];
    for (const file of filesToAdd) {
      const validation = validateAttachmentFile(file);
      if (!validation.ok) {
        showToast(validation.error, 'error');
        continue;
      }
      newDrafts.push({
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: file.name,
        sizeBytes: file.size,
        progress: 100,
        file,
      });
    }

    if (newDrafts.length > 0) {
      setDraftAttachments((prev) => [...prev, ...newDrafts]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDraft = (draftId: string) => {
    setDraftAttachments((prev) => prev.filter((d) => d.id !== draftId));
  };

  const wrapSelection = (before: string, after: string = before) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selected = content.slice(start, end);
    const replacement = `${before}${selected || 'text'}${after}`;
    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          start + before.length,
          start + replacement.length - after.length
        );
      }
    }, 10);
  };

  const handleSend = async () => {
    if (isSending) return;
    const trimmed = content.trim();
    const hasPendingError = draftAttachments.some((d) => d.error);
    if (hasPendingError) {
      showToast('Please remove files with errors before sending', 'error');
      return;
    }

    const files = draftAttachments
      .filter((d) => !d.error && d.file)
      .map((d) => d.file as File);

    if (!trimmed && files.length === 0) return;

    const body = trimmed || (files.length > 0 ? '(Attachment)' : '');
    setIsSending(true);
    try {
      const result = await onSendMessage(body, files);
      if (result.ok) {
        setContent('');
        setDraftAttachments([]);
        if (draftContext) {
          if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
          // Keep the key marked loaded so the empty content does not re-fetch
          // the row we are about to clear.
          if (draftKey) draftLoadedRef.current = draftKey;
          try {
            await saveWorkspaceDraft(getApiBaseUrl(), draftContext.workspaceId, {
              targetKind: draftContext.targetKind,
              targetId: draftContext.targetId,
              body: '',
            });
          } catch {
            // Best-effort clear after a successful send.
          }
        }
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        onSendComplete?.();
        if (result.error) {
          showToast(result.error, 'error');
        }
      } else if (result.error) {
        showToast(result.error, 'error');
      }
    } catch {
      showToast('Could not send message.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const canSend =
    (content.trim().length > 0 || draftAttachments.length > 0) &&
    !draftAttachments.some((d) => d.error) &&
    !isSending;

  return (
    <div className="relative p-3 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs focus-within:border-[#3157D5] focus-within:ring-2 focus-within:ring-[#EEF2FF] transition-all">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="sr-only"
        aria-label="Attach files"
      />

      {isMentionOpen && filteredMentions.length > 0 && (
        <div
          role="listbox"
          aria-label="Team members mention"
          className="absolute bottom-full left-2 mb-2 w-64 bg-white border border-[#E4E2DF] rounded-[10px] shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1 z-50 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-[#737782] border-b border-[#ECEAE7] mb-1">
            Mention teammate
          </div>
          {filteredMentions.map((member, idx) => (
            <button
              key={member.id}
              role="option"
              aria-selected={mentionIndex === idx}
              type="button"
              onClick={() => insertMention(member)}
              onMouseEnter={() => setMentionIndex(idx)}
              className={`w-full text-left px-2 py-1.5 rounded-[6px] text-[13px] flex items-center gap-2 transition-colors ${
                mentionIndex === idx ? 'bg-[#EEF2FF] text-[#3157D5]' : 'text-[#4F5360] hover:bg-[#F1F0EE]'
              }`}
            >
              <Avatar name={member.name} src={member.image ?? null} size={22} />
              <div className="min-w-0 flex-1">
                <span className="font-semibold block truncate">{member.name}</span>
                <span className="text-[11px] text-[#737782] block truncate">
                  {member.email ?? ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {draftAttachments.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2 pt-1 border-b border-[#ECEAE7] pb-2">
          {draftAttachments.map((draft) => (
            <div
              key={draft.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12px] border ${
                draft.error
                  ? 'bg-red-50 border-red-200 text-[#C94A45]'
                  : 'bg-[#F6F5F3] border-[#E4E2DF] text-[#171A21]'
              }`}
            >
              {draft.error ? (
                <AlertCircle className="w-3.5 h-3.5 text-[#C94A45] shrink-0" />
              ) : (
                <Paperclip className="w-3.5 h-3.5 text-[#737782] shrink-0" />
              )}
              <div className="max-w-[140px] truncate">
                <span className="font-medium">{draft.name}</span>
                {draft.error ? (
                  <span className="block text-[10px] text-[#C94A45]">{draft.error}</span>
                ) : draft.progress < 100 ? (
                  <span className="block text-[10px] text-[#737782]">Uploading...</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeDraft(draft.id)}
                className="p-0.5 rounded hover:bg-black/10 text-[#737782] hover:text-[#171A21]"
                aria-label={`Remove ${draft.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={2}
        value={content}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Compose message"
        className="w-full text-[14px] text-[#171A21] placeholder:text-[#737782] bg-transparent outline-none resize-none leading-relaxed min-h-[44px]"
      />

      <div className="flex items-center justify-between pt-2 border-t border-[#ECEAE7] mt-1">
        <div className="flex items-center gap-0.5 text-[#737782]">
          <button
            type="button"
            onClick={() => wrapSelection('**')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Bold (**)"
            aria-label="Bold text"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('_')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Italic (_)"
            aria-label="Italic text"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('`')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Code (`)"
            aria-label="Inline code"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('- ')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="List (-)"
            aria-label="Bulleted list"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('[', '](url)')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Link"
            aria-label="Insert link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-[#E4E2DF] mx-1" />

          <button
            type="button"
            onClick={() => {
              setContent((prev) => prev + '@');
              setIsMentionOpen(true);
              textareaRef.current?.focus();
            }}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Mention teammate (@)"
            aria-label="Mention teammate"
          >
            <AtSign className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setContent((prev) => prev + '✨ ')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Add emoji"
            aria-label="Add emoji"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title={`Attach file (up to ${MAX_ATTACHMENTS_PER_MESSAGE} files, ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB each)`}
            aria-label="Attach file"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className={`px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium flex items-center gap-1.5 transition-all active:scale-[0.98] ${
            canSend
              ? 'bg-[#2E3440] text-white hover:bg-[#1E222A] shadow-2xs cursor-pointer'
              : 'bg-[#ECEAE7] text-[#A5A8AE] cursor-not-allowed'
          }`}
          aria-label="Send message"
        >
          <span>{isSending ? 'Sending…' : 'Send'}</span>
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
