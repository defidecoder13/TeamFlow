/**
 * Delete-channel dialog (Phase 4K.5).
 *
 * Hard delete is destructive (cascades messages). Requires typing slug/name.
 */

'use client';

import { useState } from 'react';
import { getApiBaseUrl } from '../../lib/config';
import { deleteChannel, type Channel } from '../../lib/channels';

interface ChannelDeleteDialogProps {
  workspaceId: string;
  channel: Channel;
  onClose: () => void;
  onDeleted: (channelId: string) => void;
  onUnauthenticated: () => void;
}

export function ChannelDeleteDialog({
  workspaceId,
  channel,
  onClose,
  onDeleted,
  onUnauthenticated,
}: ChannelDeleteDialogProps) {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirm === channel.slug || confirm === channel.name;

  async function handleDelete() {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setDeleting(false);
      setError('Could not connect to API server.');
      return;
    }
    const result = await deleteChannel(apiBase, workspaceId, channel.slug);
    setDeleting(false);
    if (result.ok) {
      try {
        window.dispatchEvent(
          new CustomEvent('teamflow:channel:removed', {
            detail: { channelId: channel.id, workspaceId },
          }),
        );
      } catch {
        // ignore
      }
      onDeleted(channel.id);
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    if (result.kind === 'forbidden') {
      setError('You do not have permission to delete this channel.');
      return;
    }
    if (result.kind === 'notFound') {
      setError('Channel not found. It may have been deleted already.');
      return;
    }
    setError(result.message ?? 'Could not delete channel. Please try again.');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/25 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-channel-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <h2
          id="delete-channel-title"
          className="text-base font-semibold tracking-tight text-zinc-900"
        >
          Delete #{channel.name}?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
          This will permanently delete the channel and all its messages. This cannot be undone.
        </p>
        <div className="mt-4">
          <label
            htmlFor="confirm-channel-delete"
            className="text-[13px] font-medium text-stone-700"
          >
            Type <span className="font-semibold text-stone-900">{channel.slug}</span> to confirm
          </label>
          <input
            id="confirm-channel-delete"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={channel.slug}
            disabled={deleting}
            className="mt-1.5 h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-60"
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!matches || deleting}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
