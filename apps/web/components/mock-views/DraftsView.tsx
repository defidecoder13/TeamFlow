'use client';

import React from 'react';
import { useShell } from '../../lib/shell-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useDrafts } from '../../lib/use-drafts';
import type { DraftListItem } from '../../lib/drafts';
import { FileEdit, Trash2, ArrowRight, RefreshCw } from 'lucide-react';

function containerLabel(draft: DraftListItem): string {
  if (draft.container.type === 'channel') {
    return `#${draft.container.name}`;
  }
  if (draft.container.type === 'thread') {
    return draft.container.name.startsWith('#')
      ? draft.container.name
      : `@${draft.container.name}`;
  }
  return `@${draft.container.name}`;
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
        <FileEdit className="w-6 h-6" />
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

function resumePath(draft: DraftListItem): string | null {
  if (draft.container.type === 'channel' && draft.container.slug) {
    return `/app/channels/${draft.container.slug}`;
  }
  // Thread + DM drafts: open the container (thread roots resume into feed/thread).
  if (draft.targetKind === 'THREAD' && draft.container.slug) {
    return `/app/channels/${draft.container.slug}?message=${encodeURIComponent(draft.targetId)}`;
  }
  if (draft.container.id) {
    return `/app/dms/${draft.container.id}`;
  }
  return null;
}

export const DraftsView: React.FC = () => {
  const shell = useShell();
  const { push } = useRouter();
  const workspaceId = shell.currentWorkspace?.id ?? null;
  const drafts = useDrafts(workspaceId);

  const readyDrafts =
    drafts.state.status === 'ready' ? drafts.state.drafts : ([] as DraftListItem[]);

  const handleResume = (draft: DraftListItem) => {
    const path = resumePath(draft);
    if (path) push(path);
  };

  const handleDiscard = (draft: DraftListItem) => {
    void drafts.discard(draft.id);
  };

  const headerCount =
    drafts.state.status === 'ready' ? drafts.state.drafts.length : null;

  let body: React.ReactNode;
  if (shell.session.status === 'loading') {
    body = (
      <div
        role="status"
        aria-label="Loading drafts"
        className="p-12 text-center text-[13px] text-[#4F5360]"
      >
        Loading drafts…
      </div>
    );
  } else if (shell.session.status === 'unauthenticated') {
    body = (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired. Sign in again to view your drafts."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  } else if (shell.session.status !== 'authenticated') {
    body = (
      <div role="status" className="p-12 text-center text-[13px] text-[#4F5360]">
        {shell.session.status === 'error'
          ? shell.session.message
          : 'Please sign in to view your drafts.'}
      </div>
    );
  } else if (!workspaceId) {
    body = (
      <div role="status" className="p-12 text-center text-[13px] text-[#4F5360]">
        Select a workspace to view drafts.
      </div>
    );
  } else if (drafts.state.status === 'loading' || drafts.state.status === 'idle') {
    body = (
      <div
        role="status"
        aria-label="Loading drafts"
        className="p-12 text-center text-[13px] text-[#4F5360]"
      >
        Loading drafts…
      </div>
    );
  } else if (drafts.state.status === 'unauthenticated') {
    body = (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired. Sign in again to view your drafts."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  } else if (drafts.state.status === 'error') {
    body = (
      <StatusPanel
        title="Couldn’t load drafts"
        message={drafts.state.message}
        actionLabel="Try again"
        onAction={drafts.retry}
      />
    );
  } else if (readyDrafts.length === 0) {
    body = (
      <div className="p-12 text-center bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs">
        <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mx-auto mb-3">
          <FileEdit className="w-6 h-6" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#171A21]">No drafts</h2>
        <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm mx-auto">
          Any unsent messages you leave in channels or direct messages are autosaved here.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        {drafts.discardError && (
          <p role="alert" className="text-[12px] text-[#B42318] text-center">
            {drafts.discardError}
          </p>
        )}
        {readyDrafts.map((draft) => {
          const destLabel = containerLabel(draft);

          return (
            <div
              key={draft.id}
              className="p-4 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs hover:border-[#D2D0CC] hover:shadow-xs transition-all"
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#F1F0EE] text-[#171A21] border border-[#E4E2DF]">
                    {destLabel}
                  </span>
                  <span className="text-[12px] text-[#737782]">Autosaved</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDiscard(draft)}
                  disabled={drafts.isDiscarding}
                  className="p-1 text-[#737782] hover:text-[#C94A45] rounded hover:bg-rose-50 transition-colors disabled:opacity-60"
                  title="Discard draft"
                  aria-label="Discard draft"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[14px] text-[#171A21] leading-relaxed line-clamp-3">
                {draft.body}
              </p>

              <div className="mt-3 pt-3 border-t border-[#ECEAE7] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleDiscard(draft)}
                  disabled={drafts.isDiscarding}
                  className="px-3 py-1.5 text-[12px] font-medium text-[#737782] hover:text-[#171A21] rounded-[6px] hover:bg-[#F1F0EE] transition-colors disabled:opacity-60"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => handleResume(draft)}
                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[6px] flex items-center gap-1 transition-colors shadow-2xs"
                >
                  <span>Resume message</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 bg-[#FAF9F8] overflow-y-auto">
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#F6F5F3] text-[#171A21] shrink-0 border border-[#E4E2DF]">
            <FileEdit className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-[15px] font-semibold text-[#171A21] tracking-tight">Drafts</h1>
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
