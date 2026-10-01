/**
 * Start Direct Message Dialog (Phase 4F.3 & Phase 4F.6).
 *
 * Allows starting or navigating to a 1-to-1 direct conversation with any
 * member of the current workspace, or creating a group direct message with
 * 2 to 19 other workspace members.
 */

'use client';

import { useMemo, useState } from 'react';
import { Dialog } from './dialog';
import { getApiBaseUrl } from '../../lib/config';
import { useSessionUser } from '../../lib/use-session-user';
import { useWorkspaceMembers } from '../../lib/use-workspace-members';
import {
  createGroupConversation,
  createOrGetDirectConversation,
  type DirectConversation,
} from '../../lib/messages';
import { AuthError } from '../auth/AuthError';
import { CloseIcon } from './icons';

export interface StartDirectMessageDialogProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onSelectConversation: (conversation: DirectConversation) => void;
  onUnauthenticated?: () => void;
}

export function StartDirectMessageDialog({
  workspaceId,
  workspaceName,
  onClose,
  onSelectConversation,
  onUnauthenticated,
}: StartDirectMessageDialogProps) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const session = useSessionUser();
  const currentUserId = session.status === 'authenticated' ? session.user.id : null;

  const { state: membersState, retry: retryMembers } = useWorkspaceMembers(workspaceId);

  const otherMembers = useMemo(() => {
    if (membersState.status !== 'ready') return [];
    return membersState.members.filter((m) => m.user.id !== currentUserId);
  }, [membersState, currentUserId]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return otherMembers;
    return otherMembers.filter(
      (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    );
  }, [otherMembers, search]);

  function toggleMemberSelection(userId: string) {
    if (isSubmitting) return;
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      if (prev.length >= 19) {
        setError('A group conversation cannot exceed 20 participants.');
        return prev;
      }
      setError(null);
      return [...prev, userId];
    });
  }

  async function handleSelect(recipientId: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to API server.');
      return;
    }

    const res = await createOrGetDirectConversation(apiBase, workspaceId, recipientId);
    setIsSubmitting(false);

    if (res.ok) {
      onSelectConversation(res.data);
      onClose();
      return;
    }

    if ('unauthenticated' in res && res.unauthenticated) {
      onUnauthenticated?.();
      return;
    }

    setError(res.message || 'Failed to start conversation. Please try again.');
  }

  async function handleCreateGroup() {
    if (isSubmitting) return;
    if (selectedUserIds.length < 2) {
      setError('Select at least 2 other members to create a group.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to API server.');
      return;
    }

    const res = await createGroupConversation(apiBase, workspaceId, {
      participantIds: selectedUserIds,
      name: groupName.trim() || undefined,
    });
    setIsSubmitting(false);

    if (res.ok) {
      onSelectConversation(res.data);
      onClose();
      return;
    }

    if ('unauthenticated' in res && res.unauthenticated) {
      onUnauthenticated?.();
      return;
    }

    setError(res.message || 'Failed to create group conversation. Please try again.');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="start-dm-title"
      size="md"
      dismissable={!isSubmitting}
    >
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="start-dm-title"
              className="text-[17px] font-semibold tracking-tight text-[#171A21]"
            >
              Start direct message
            </h2>
            <p className="mt-1 text-[13px] text-[#737782]">in {workspaceName}</p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close dialog"
            className="touch-hit rounded-lg p-1.5 text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div
          className="mt-3 flex rounded-[8px] bg-[#FAF9F8] border border-[#E4E2DF] p-0.5"
          role="group"
          aria-label="Conversation mode"
        >
          <button
            type="button"
            aria-pressed={mode === 'direct'}
            onClick={() => {
              setMode('direct');
              setError(null);
            }}
            className={`flex-1 rounded-[6px] py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5] ${
              mode === 'direct'
                ? 'bg-white text-[#171A21] shadow-2xs font-semibold'
                : 'text-[#737782] hover:text-[#171A21]'
            }`}
          >
            Direct message
          </button>
          <button
            type="button"
            aria-pressed={mode === 'group'}
            onClick={() => {
              setMode('group');
              setError(null);
            }}
            className={`flex-1 rounded-[6px] py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5] ${
              mode === 'group'
                ? 'bg-white text-[#171A21] shadow-2xs font-semibold'
                : 'text-[#737782] hover:text-[#171A21]'
            }`}
          >
            Group message
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <AuthError message={error} />

          {mode === 'group' && (
            <div>
              <label
                htmlFor="group-name-input"
                className="block text-xs font-medium text-[#171A21] mb-1"
              >
                Group name <span className="text-[#737782] font-normal">(optional)</span>
              </label>
              <input
                id="group-name-input"
                type="text"
                disabled={isSubmitting}
                placeholder="e.g. Project Launch"
                maxLength={100}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E2DF] bg-white px-3 py-1.5 text-sm text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
              />
            </div>
          )}

          <div>
            <label htmlFor="member-search-input" className="sr-only">
              Search members
            </label>
            <input
              id="member-search-input"
              type="text"
              autoFocus
              disabled={isSubmitting}
              placeholder="Search members by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-[8px] border border-[#E4E2DF] bg-white px-3 py-2 text-sm text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
            />
          </div>

          {mode === 'group' && (
            <div className="flex items-center justify-between text-xs text-[#737782]">
              <span>Selected: {selectedUserIds.length} / 19</span>
              <span>(min 2 others required)</span>
            </div>
          )}

          <div
            tabIndex={0}
            role="region"
            aria-label="Members"
            className="max-h-64 overflow-y-auto rounded-[10px] border border-[#E4E2DF] bg-white p-1 divide-y divide-[#E4E2DF] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            {membersState.status === 'loading' ? (
              <div className="space-y-2 p-3" role="status" aria-label="Loading members">
                <span className="sr-only">Loading members…</span>
                <div aria-hidden="true" className="h-8 animate-pulse rounded bg-[#E4E2DF]" />
                <div aria-hidden="true" className="h-8 animate-pulse rounded bg-[#E4E2DF]" />
                <div aria-hidden="true" className="h-8 animate-pulse rounded bg-[#E4E2DF]" />
              </div>
            ) : membersState.status === 'error' ? (
              <div className="p-4 text-center">
                <p className="text-sm text-[#C94A45]">Failed to load members.</p>
                <button
                  type="button"
                  onClick={retryMembers}
                  className="mt-2 rounded text-xs font-medium text-[#171A21] underline transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                >
                  Try again
                </button>
              </div>
            ) : otherMembers.length === 0 ? (
              <p className="p-4 text-center text-sm text-[#737782]">
                No other members in this workspace to message.
              </p>
            ) : filteredMembers.length === 0 ? (
              <div className="space-y-1 p-4 text-center">
                <p className="text-sm text-[#737782]">No results for &ldquo;{search}&rdquo;.</p>
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="rounded text-xs font-medium text-[#171A21] underline decoration-[#E4E2DF] underline-offset-4 transition-colors hover:decoration-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredMembers.map((m) => {
                  const initial =
                    m.user.name.trim().charAt(0).toUpperCase() ||
                    m.user.email.trim().charAt(0).toUpperCase() ||
                    '?';
                  const isSelected = selectedUserIds.includes(m.user.id);
                  return (
                    <li key={m.id}>
                      {mode === 'direct' ? (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => void handleSelect(m.user.id)}
                          className="flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors hover:bg-[#FAF9F8] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ECEAE7] text-xs font-medium text-[#171A21]"
                          >
                            {initial}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium text-[#171A21]"
                              title={m.user.name}
                            >
                              {m.user.name}
                            </p>
                            <p className="truncate text-xs text-[#737782]" title={m.user.email}>
                              {m.user.email}
                            </p>
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          aria-pressed={isSelected}
                          onClick={() => toggleMemberSelection(m.user.id)}
                          className={`flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors hover:bg-[#FAF9F8] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50 ${
                            isSelected ? 'bg-[#EEF2FF]/50 ring-1 ring-[#3157D5]/20' : ''
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] leading-none ${
                              isSelected
                                ? 'border-[#171A21] bg-[#171A21] text-white'
                                : 'border-[#E4E2DF] bg-white text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ECEAE7] text-xs font-medium text-[#171A21]"
                          >
                            {initial}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium text-[#171A21]"
                              title={m.user.name}
                            >
                              {m.user.name}
                            </p>
                            <p className="truncate text-xs text-[#737782]" title={m.user.email}>
                              {m.user.email}
                            </p>
                          </div>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-[#E4E2DF]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#E4E2DF] bg-white px-4 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
          >
            Cancel
          </button>
          {mode === 'group' && (
            <button
              type="button"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onClick={() => void handleCreateGroup()}
              className="inline-flex h-9 items-center justify-center rounded-[8px] bg-[#2E3440] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create group'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
