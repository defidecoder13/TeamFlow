/**
 * Delete-channel dialog (Phase 4K.5).
 *
 * Hard delete is destructive (cascades messages). Requires typing slug/name.
 */

'use client';

import { useRef, useState } from 'react';
import { Dialog } from './dialog';
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
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

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
    <Dialog
      open
      onClose={onClose}
      labelledBy="delete-channel-title"
      size="sm"
      dismissable={!deleting}
      initialFocusRef={cancelBtnRef}
    >
      <div>
        <h2
          id="delete-channel-title"
          className="text-[17px] font-semibold tracking-tight text-[#171A21]"
        >
          Delete #{channel.name}?
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#737782]">
          This will permanently delete the channel and all its messages. This cannot be undone.
        </p>
        <div className="mt-4">
          <label
            htmlFor="confirm-channel-delete"
            className="text-[13px] font-medium text-[#171A21]"
          >
            Type <span className="font-semibold text-[#171A21]">{channel.slug}</span> to confirm
          </label>
          <input
            id="confirm-channel-delete"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={channel.slug}
            disabled={deleting}
            className="mt-1.5 h-10 w-full rounded-[8px] border border-[#E4E2DF] bg-white px-3 text-sm text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#C94A45] focus-visible:ring-1 focus-visible:ring-[#C94A45] disabled:opacity-60"
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-[8px] bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-[#C94A45]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2 pt-2 border-t border-[#E4E2DF]">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="inline-flex h-[42px] flex-1 items-center justify-center rounded-lg border border-[#E4E2DF] bg-white px-4 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!matches || deleting}
            className="inline-flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#C94A45] px-4 text-sm font-medium text-white transition-colors hover:bg-[#B33E3A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete channel'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
