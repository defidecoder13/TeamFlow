'use client';

import React from 'react';
import { useShell } from '../../lib/shell-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useThreads } from '../../lib/use-threads';
import type { ThreadListItem } from '../../lib/threads';
import { formatMessageTime, formatRelativeTime } from '../app/message-utils';
import { MessageSquare, ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

function containerLabel(thread: ThreadListItem): string {
  if (thread.container.type === 'channel') {
    return `#${thread.container.name}`;
  }
  return thread.container.name || 'Direct message';
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
    <main
      id="main-content"
      className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#FAF9F8]"
    >
      <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mb-3">
        <MessageSquare className="w-6 h-6" />
      </div>
      <h1 className="text-[16px] font-semibold text-[#171A21]">{title}</h1>
      <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm">{message}</p>
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
    </main>
  );
}

export const ThreadsView: React.FC = () => {
  const shell = useShell();
  const { push } = useRouter();
  const workspaceId = shell.currentWorkspace?.id ?? null;
  const threads = useThreads(workspaceId);

  const readyThreads =
    threads.state.status === 'ready' ? threads.state.threads : ([] as ThreadListItem[]);

  const handleOpen = (thread: ThreadListItem) => {
    if (thread.container.type === 'channel' && thread.container.slug) {
      push(`/app/channels/${thread.container.slug}?message=${encodeURIComponent(thread.id)}`);
      return;
    }
    if (thread.container.type === 'directMessage' && thread.container.id) {
      push(`/app/dms/${thread.container.id}?message=${encodeURIComponent(thread.id)}`);
      return;
    }
  };

  const headerCount =
    threads.state.status === 'ready' ? threads.state.threads.length : null;

  let body: React.ReactNode;
  if (shell.session.status === 'loading') {
    body = (
      <div
        role="status"
        aria-label="Loading threads"
        className="p-12 text-center text-[13px] text-[#4F5360]"
      >
        Loading threads…
      </div>
    );
  } else if (shell.session.status === 'unauthenticated') {
    body = (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired. Sign in again to view your threads."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  } else if (shell.session.status !== 'authenticated') {
    body = (
      <div role="status" className="p-12 text-center text-[13px] text-[#4F5360]">
        {shell.session.status === 'error'
          ? shell.session.message
          : 'Please sign in to view your threads.'}
      </div>
    );
  } else if (!workspaceId) {
    body = (
      <div role="status" className="p-12 text-center text-[13px] text-[#4F5360]">
        Select a workspace to view threads.
      </div>
    );
  } else if (threads.state.status === 'loading' || threads.state.status === 'idle') {
    body = (
      <div
        role="status"
        aria-label="Loading threads"
        className="p-12 text-center text-[13px] text-[#4F5360]"
      >
        Loading threads…
      </div>
    );
  } else if (threads.state.status === 'unauthenticated') {
    body = (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired. Sign in again to view your threads."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  } else if (threads.state.status === 'error') {
    body = (
      <StatusPanel
        title="Couldn’t load threads"
        message={threads.state.message}
        actionLabel="Try again"
        onAction={threads.retry}
      />
    );
  } else if (readyThreads.length === 0) {
    body = (
      <div className="p-12 text-center bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs">
        <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mx-auto mb-3">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#171A21]">No active threads</h2>
        <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm mx-auto">
          Replies to messages in channels or direct messages will appear here for easy reference.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        {readyThreads.map((thread) => {
          const destLabel = containerLabel(thread);

          return (
            <div
              key={thread.id}
              role="button"
              tabIndex={0}
              aria-label={`Open thread in ${destLabel}`}
              onClick={() => handleOpen(thread)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleOpen(thread);
                }
              }}
              className="p-4 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs hover:border-[#D2D0CC] hover:shadow-xs transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#F1F0EE] text-[#171A21] border border-[#E4E2DF]">
                    {destLabel}
                  </span>
                  <span className="text-[12px] text-[#737782]">
                    Started by {thread.author.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[12px] text-[#737782]">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="tabular-nums">{formatMessageTime(thread.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Avatar
                  name={thread.author.name}
                  src={thread.author.image}
                  size={30}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-[#171A21] line-clamp-2 leading-relaxed font-normal">
                    {thread.body}
                  </p>

                  {thread.latestReply && (
                    <div className="mt-2 text-[12px] text-[#4F5360] bg-[#FAF9F8] p-2 rounded-[6px] border border-[#E4E2DF]/60 flex items-center justify-between">
                      <span className="truncate">
                        <strong className="text-[#171A21]">
                          {thread.latestReply.author.name}:
                        </strong>{' '}
                        {thread.latestReply.body}
                      </span>
                      <span className="text-[#737782] text-[11px] tabular-nums shrink-0 ml-2">
                        {formatMessageTime(thread.latestReply.createdAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#ECEAE7] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3157D5]">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
                    </span>
                  </span>
                  {thread.latestReplyAt && (
                    <span className="text-[12px] text-[#737782]">
                      · Last activity {formatRelativeTime(thread.latestReplyAt)}
                    </span>
                  )}
                </div>

                <span className="text-[12px] font-medium text-[#4F5360] group-hover:text-[#171A21] flex items-center gap-1 transition-colors">
                  <span>View thread</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          );
        })}

        {threads.state.hasMore && (
          <div className="pt-2">
            {threads.loadMoreError && (
              <p role="alert" className="text-[12px] text-[#B42318] mb-2 text-center">
                {threads.loadMoreError}
              </p>
            )}
            <button
              type="button"
              onClick={threads.loadMore}
              disabled={threads.isLoadingMore}
              className="w-full px-4 py-2 text-[13px] font-medium text-[#171A21] bg-white border border-[#E4E2DF] rounded-[8px] hover:bg-[#F6F5F3] transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              {threads.isLoadingMore ? 'Loading…' : 'Load more'}
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
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-[15px] font-semibold text-[#171A21] tracking-tight">Threads</h1>
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
