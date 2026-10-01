import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Attachment, AttachmentDraft, Member } from '../../types';
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

interface MessageComposerProps {
  placeholder?: string;
  onSendMessage: (content: string, attachments: Attachment[]) => void;
  parentId?: string;
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const MessageComposer: React.FC<MessageComposerProps> = ({
  placeholder = 'Send a message...',
  onSendMessage,
}) => {
  const { members, showToast } = useApp();
  const [content, setContent] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<AttachmentDraft[]>([]);

  // Mention autocomplete state
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [content]);

  // Filter members for mention
  const filteredMentions = members.filter(
    (m) =>
      m.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      m.title.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setContent(val);
    setCursorPos(pos);

    // Check if user is typing an @mention
    const textBeforeCursor = val.slice(0, pos);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/);

    if (lastAtMatch) {
      setIsMentionOpen(true);
      setMentionQuery(lastAtMatch[1]);
      setMentionIndex(0);
    } else {
      setIsMentionOpen(false);
    }
  };

  const insertMention = (member: Member) => {
    const textBeforeCursor = content.slice(0, cursorPos);
    const textAfterCursor = content.slice(cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    const handle = `@${member.name.split(' ')[0].toLowerCase()}`;
    const newText = textBeforeCursor.slice(0, lastAtIndex) + handle + ' ' + textAfterCursor;

    setContent(newText);
    setIsMentionOpen(false);

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

    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS - draftAttachments.length;
    if (remainingSlots <= 0) {
      showToast(`Maximum ${MAX_ATTACHMENTS} attachments per message`, 'error');
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    const newDrafts: AttachmentDraft[] = filesToAdd.map((file) => {
      const isTooLarge = file.size > MAX_FILE_SIZE_BYTES;
      return {
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        sizeBytes: file.size,
        progress: isTooLarge ? 0 : 30,
        error: isTooLarge ? 'File exceeds 25 MB limit' : undefined,
        file,
      };
    });

    setDraftAttachments((prev) => [...prev, ...newDrafts]);

    // Simulate upload completion
    newDrafts.forEach((draft) => {
      if (!draft.error) {
        setTimeout(() => {
          setDraftAttachments((prev) =>
            prev.map((d) => (d.id === draft.id ? { ...d, progress: 100 } : d))
          );
        }, 600);
      }
    });

    // Reset input
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

  const handleSend = () => {
    const trimmed = content.trim();
    const hasPendingError = draftAttachments.some((d) => d.error);
    if (hasPendingError) {
      showToast('Please remove files with errors before sending', 'error');
      return;
    }

    const validAttachments: Attachment[] = draftAttachments
      .filter((d) => !d.error && d.progress === 100)
      .map((d) => ({
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: d.name,
        sizeBytes: d.sizeBytes,
        url: '#',
        type: d.file?.type || 'application/octet-stream',
      }));

    if (!trimmed && validAttachments.length === 0) return;

    onSendMessage(trimmed, validAttachments);
    setContent('');
    setDraftAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const canSend = (content.trim().length > 0 || draftAttachments.length > 0) && !draftAttachments.some((d) => d.error);

  return (
    <div className="relative p-3 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs focus-within:border-[#3157D5] focus-within:ring-2 focus-within:ring-[#EEF2FF] transition-all">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="sr-only"
        aria-label="Attach files"
      />

      {/* Mention Autocomplete Listbox */}
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
              <img
                src={member.avatarUrl}
                alt=""
                className="w-5 h-5 rounded-full object-cover bg-[#ECEAE7]"
              />
              <div className="min-w-0 flex-1">
                <span className="font-semibold block truncate">{member.name}</span>
                <span className="text-[11px] text-[#737782] block truncate">{member.title}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Attachment Drafts Preview Bar */}
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

      {/* Textarea */}
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

      {/* Formatting & Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#ECEAE7] mt-1">
        {/* Left: formatting shortcuts */}
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

          {/* Mention trigger */}
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

          {/* Emoji quick insert */}
          <button
            type="button"
            onClick={() => setContent((prev) => prev + '✨ ')}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Add emoji"
            aria-label="Add emoji"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>

          {/* Attachment trigger */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-[6px] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
            title="Attach file (up to 25MB)"
            aria-label="Attach file"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={`px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium flex items-center gap-1.5 transition-all active:scale-[0.98] ${
            canSend
              ? 'bg-[#2E3440] text-white hover:bg-[#1E222A] shadow-2xs cursor-pointer'
              : 'bg-[#ECEAE7] text-[#A5A8AE] cursor-not-allowed'
          }`}
          aria-label="Send message"
        >
          <span>Send</span>
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
