/**
 * Leave-channel dialog (Phase 4K.5).
 */

'use client';

import { useState } from 'react';
import { getApiBaseUrl } from '../../lib/config';
import { leaveChannel, type Channel } from '../../lib/channels';

interface ChannelLeaveDialogProps {
  workspaceId: string;
  channel: Channel;
  onClose: () => void;
  onLeft: (channelId: string) => void;
  onUnauthenticated: () => void;
}

export function ChannelLeaveDialog({
  workspaceId,
  channel,
  onClose,
  onLeft,
  onUnauthenticated,
}: ChannelLeaveDialogProps) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    if (leaving) return;
    setLeaving(true);
    setError(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setLeaving(false);
      setError('Could not connect to API server.');
      return;
    }
    const result = await leaveChannel(apiBase, workspaceId, channel.slug);
    setLeaving(false);
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
      onLeft(channel.id);
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    if (result.kind === 'notFound') {
      setError('Channel not found or you are no longer a member.');
      return;
    }
    setError(result.message ?? 'Could not leave channel. Please try again.');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/25 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-channel-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <h2
          id="leave-channel-title"
          className="text-base font-semibold tracking-tight text-zinc-900"
        >
          Leave #{channel.name}?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
          You will no longer see this channel in your sidebar. You can rejoin if someone adds you
          back
          {channel.type === 'PRIVATE' ? ' (private channel).' : '.'}
        </p>
        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={leaving}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleLeave()}
            disabled={leaving}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {leaving ? 'Leaving…' : 'Leave channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
