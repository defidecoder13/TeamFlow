/**
 * Start Direct Message Dialog (Phase 4F.3 & Phase 4F.6).
 *
 * Allows starting or navigating to a 1-to-1 direct conversation with any
 * member of the current workspace, or creating a group direct message with
 * 2 to 19 other workspace members.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../../lib/config';
import { useSessionUser } from '../../lib/use-session-user';
import { useWorkspaceMembers } from '../../lib/use-workspace-members';
import {
  createGroupConversation,
  createOrGetDirectConversation,
  type DirectConversation,
} from '../../lib/messages';
import { AuthError } from '../auth/AuthError';

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isSubmitting, onClose]);

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
    if (isSubmitting || selectedUserIds.length < 2) return;
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
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-dm-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="start-dm-title"
              className="text-base font-semibold tracking-tight text-zinc-900"
            >
              New direct message
            </h2>
            <p className="mt-1 text-sm text-zinc-500">in {workspaceName}</p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="mt-3 flex rounded-lg bg-stone-100 p-0.5"
          role="tablist"
          aria-label="Conversation mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'direct'}
            onClick={() => {
              setMode('direct');
              setError(null);
            }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === 'direct'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-stone-600 hover:text-zinc-900'
            }`}
          >
            Direct Message
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'group'}
            onClick={() => {
              setMode('group');
              setError(null);
            }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === 'group'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-stone-600 hover:text-zinc-900'
            }`}
          >
            Group Message
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <AuthError message={error} />

          {mode === 'group' && (
            <div>
              <label
                htmlFor="group-name-input"
                className="block text-xs font-medium text-stone-700 mb-1"
              >
                Group name <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                id="group-name-input"
                type="text"
                disabled={isSubmitting}
                placeholder="e.g. Project Launch"
                maxLength={100}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-stone-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
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
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-stone-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
            />
          </div>

          {mode === 'group' && (
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Selected: {selectedUserIds.length} / 19</span>
              <span>(min 2 others required)</span>
            </div>
          )}

          <div
            tabIndex={0}
            aria-label="Members"
            className="max-h-64 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50/50 p-1 focus:outline-none"
          >
            {membersState.status === 'loading' ? (
              <div className="space-y-2 p-3">
                <div className="h-8 animate-pulse rounded bg-stone-200" />
                <div className="h-8 animate-pulse rounded bg-stone-200" />
                <div className="h-8 animate-pulse rounded bg-stone-200" />
              </div>
            ) : membersState.status === 'error' ? (
              <div className="p-4 text-center">
                <p className="text-sm text-stone-500">Failed to load members.</p>
                <button
                  type="button"
                  onClick={retryMembers}
                  className="mt-2 text-xs font-medium text-zinc-900 underline"
                >
                  Try again
                </button>
              </div>
            ) : otherMembers.length === 0 ? (
              <p className="p-4 text-center text-sm text-stone-500">
                No other members in this workspace to message.
              </p>
            ) : filteredMembers.length === 0 ? (
              <p className="p-4 text-center text-sm text-stone-500">
                No members match &quot;{search}&quot;.
              </p>
            ) : (
              <ul className="space-y-1" role="listbox">
                {filteredMembers.map((m) => {
                  const initial =
                    m.user.name.trim().charAt(0).toUpperCase() ||
                    m.user.email.trim().charAt(0).toUpperCase() ||
                    '?';
                  const isSelected = selectedUserIds.includes(m.user.id);
                  return (
                    <li key={m.id} role="option" aria-selected={isSelected}>
                      {mode === 'direct' ? (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => void handleSelect(m.user.id)}
                          className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white hover:shadow-xs disabled:opacity-50"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-stone-700"
                          >
                            {initial}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {m.user.name}
                            </p>
                            <p className="truncate text-xs text-stone-500">{m.user.email}</p>
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => toggleMemberSelection(m.user.id)}
                          className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white hover:shadow-xs disabled:opacity-50 ${
                            isSelected ? 'bg-white shadow-xs ring-1 ring-zinc-900/10' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            tabIndex={-1}
                            aria-label={`Select ${m.user.name}`}
                            className="h-4 w-4 rounded border-stone-300 text-zinc-900 focus:ring-zinc-900"
                          />
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-stone-700"
                          >
                            {initial}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {m.user.name}
                            </p>
                            <p className="truncate text-xs text-stone-500">{m.user.email}</p>
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

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-50"
          >
            Cancel
          </button>
          {mode === 'group' && (
            <button
              type="button"
              disabled={isSubmitting || selectedUserIds.length < 2}
              onClick={() => void handleCreateGroup()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-xs transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create Group'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
