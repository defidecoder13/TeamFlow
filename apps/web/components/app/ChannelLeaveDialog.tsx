/**
 * Leave-channel dialog (Phase 4K.5).
 */

'use client';

import { useRef, useState } from 'react';
import { Dialog } from './dialog';
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
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

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
    if (result.kind === 'forbidden') {
      setError('You do not have permission to leave this channel.');
      return;
    }
    if (result.kind === 'notFound') {
      setError('Channel not found or you are no longer a member.');
      return;
    }
    setError(result.message ?? 'Could not leave channel. Please try again.');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="leave-channel-title"
      size="sm"
      dismissable={!leaving}
      initialFocusRef={cancelBtnRef}
    >
      <div>
        <h2
          id="leave-channel-title"
          className="text-[17px] font-semibold tracking-tight text-[#171A21]"
        >
          Leave #{channel.name}?
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#737782]">
          You will no longer see this channel in your sidebar. You can rejoin if someone adds you
          back
          {channel.type === 'PRIVATE' ? ' (private channel).' : '.'}
        </p>
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
            disabled={leaving}
            className="inline-flex h-[42px] flex-1 items-center justify-center rounded-lg border border-[#E4E2DF] bg-white px-4 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleLeave()}
            disabled={leaving}
            className="inline-flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#C94A45] px-4 text-sm font-medium text-white transition-colors hover:bg-[#B33E3A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] disabled:opacity-50"
          >
            {leaving ? 'Leaving…' : 'Leave channel'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
