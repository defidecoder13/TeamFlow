'use client';

import React from 'react';
import { useShell } from '../../lib/shell-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useMentions } from '../../lib/use-mentions';
import type { MentionListItem } from '../../lib/workspace-mentions';
import { formatMessageTime } from '../app/message-utils';
import { AtSign, ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

function containerLabel(mention: MentionListItem): string {
  if (mention.container.type === 'channel') {
    return `#${mention.container.name}`;
  }
  return mention.container.name || 'Direct message';
}

function StatusPanel({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="p-12 text-center bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs">
      <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mx-auto mb-3">
        <AtSign className="w-6 h-6" />
      </div>
      <h2 className="text-[16px] font-semibold text-[#171A21]">{title}</h2>
      <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm mx-auto">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5] inline-flex items-center gap-1.5"
        >
          {actionLabel === 'Try again' ? <RefreshCw className="w-3.5 h-3.5" /> : null}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function emptyStateCopy(userFirstName: string): { title: string; body: string } {
  return {
    title: 'No mentions yet',
    body: `When teammates tag you with @${userFirstName} or reference your handle, their messages will appear here.`,
  };
}

export const MentionsView: React.FC = () => {
  const shell = useShell();
  const { push } = useRouter();
  const workspaceId = shell.currentWorkspace?.id ?? null;
  const mentions = useMentions(workspaceId);

  const readyMentions =
    mentions.state.status === 'ready' ? mentions.state.mentions : ([] as MentionListItem[]);

  const handleOpen = (mention: MentionListItem) => {
    if (mention.container.type === 'channel' && mention.container.slug) {
      push(`/app/channels/${mention.container.slug}?message=${encodeURIComponent(mention.id)}`);
      return;
    }
    if (mention.container.type === 'directMessage' && mention.container.id) {
      push(`/app/dms/${mention.container.id}?message=${encodeURIComponent(mention.id)}`);
    }
  };

  const headerCount =
    mentions.state.status === 'ready' ? mentions.state.mentions.length : null;

  const userFirstName =
    (shell.currentUser?.name ?? 'teammate').split(' ')[0]?.toLowerCase() || 'teammate';

  let body: React.ReactNode;
  if (shell.session.status === 'loading') {
    body = (
      <div
        role="status"
        aria-label="Loading mentions"
        className="p-12 text-center text-[13px] text-[#4F5360]"
      >
        Loading mentions…
      </div>
    );
  } else if (shell.session.status === 'unauthenticated') {
    body = (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired. Sign in again to view your mentions."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  } else if (shell.session.status !== 'authenticated') {
    body = (
      <div role="status" className="p-12 text-center text-[13px] text-[#4F5360]">
        {shell.session.status === 'error'
          ? shell.session.message
          : 'Please sign in to view your mentions.'}
      </div>
    );
  } else if (!workspaceId) {
    body = (
      <div role="status" className="p-12 text-center text-[13px] text-[#4F5360]">
        Select a workspace to view mentions.
      </div>
    );
  } else if (mentions.state.status === 'loading' || mentions.state.status === 'idle') {
    body = (
      <div
        role="status"
        aria-label="Loading mentions"
        className="p-12 text-center text-[13px] text-[#4F5360]"
      >
        Loading mentions…
      </div>
    );
  } else if (mentions.state.status === 'unauthenticated') {
    body = (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired. Sign in again to view your mentions."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  } else if (mentions.state.status === 'error') {
    body = (
      <StatusPanel
        title="Couldn’t load mentions"
        message={mentions.state.message}
        actionLabel="Try again"
        onAction={mentions.retry}
      />
    );
  } else if (readyMentions.length === 0) {
    const copy = emptyStateCopy(userFirstName);
    body = (
      <div className="p-12 text-center bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs">
        <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mx-auto mb-3">
          <AtSign className="w-6 h-6" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#171A21]">{copy.title}</h2>
        <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm mx-auto">{copy.body}</p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        {readyMentions.map((mention) => {
          const destLabel = containerLabel(mention);

          return (
            <div
              key={mention.id}
              role="button"
              tabIndex={0}
              aria-label={`Jump to message in ${destLabel}`}
              onClick={() => handleOpen(mention)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleOpen(mention);
                }
              }}
              className="p-4 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs hover:border-[#D2D0CC] hover:shadow-xs transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#EEF2FF] text-[#3157D5] border border-[#3157D5]/20">
                    {destLabel}
                  </span>
                  <span className="text-[12px] text-[#737782]">{mention.author.name}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[12px] text-[#737782]">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="tabular-nums">{formatMessageTime(mention.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Avatar
                  name={mention.author.name}
                  src={mention.author.image}
                  size={30}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-[#171A21] leading-relaxed">{mention.body}</p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#ECEAE7] flex items-center justify-between">
                <span className="text-[12px] text-[#737782]">
                  {mention.parentMessageId ? 'In thread discussion' : 'In channel feed'}
                </span>

                <span className="text-[12px] font-medium text-[#4F5360] group-hover:text-[#171A21] flex items-center gap-1 transition-colors">
                  <span>Jump to message</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          );
        })}

        {mentions.state.hasMore && (
          <div className="pt-2">
            {mentions.loadMoreError && (
              <p role="alert" className="text-[12px] text-[#B42318] mb-2 text-center">
                {mentions.loadMoreError}
              </p>
            )}
            <button
              type="button"
              onClick={mentions.loadMore}
              disabled={mentions.isLoadingMore}
              className="w-full px-4 py-2 text-[13px] font-medium text-[#171A21] bg-white border border-[#E4E2DF] rounded-[8px] hover:bg-[#F6F5F3] transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              {mentions.isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 bg-[#FAF9F8] overflow-y-auto">
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#F6F5F3] text-[#171A21] shrink-0 border border-[#E4E2DF]">
            <AtSign className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-[15px] font-semibold text-[#171A21] tracking-tight">Mentions</h1>
        </div>
        {headerCount !== null && headerCount > 0 && (
          <span className="text-[11px] font-semibold text-[#737782] bg-[#F1F0EE] px-2 py-0.5 rounded-[6px] border border-[#E4E2DF] tabular-nums">
            {headerCount}
          </span>
        )}
      </header>

      <div className="p-6 max-w-4xl w-full mx-auto">{body}</div>
    </main>
  );
};
