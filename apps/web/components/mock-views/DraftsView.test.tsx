import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceSummary } from '../../lib/workspaces';
import type { DraftsState } from '../../lib/use-drafts';
import type { DraftListItem } from '../../lib/drafts';
import { DraftsView } from './DraftsView';

const {
  shellRef,
  pushMock,
  draftsState,
  discardMock,
  retryMock,
  isDiscardingRef,
  discardErrorRef,
} = vi.hoisted(() => ({
  shellRef: { value: {} as Record<string, unknown> },
  pushMock: vi.fn(),
  draftsState: { value: { status: 'idle' } as DraftsState },
  discardMock: vi.fn(),
  retryMock: vi.fn(),
  isDiscardingRef: { value: false },
  discardErrorRef: { value: null as string | null },
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/drafts' }),
}));

vi.mock('../../lib/use-drafts', () => ({
  useDrafts: () => ({
    state: draftsState.value,
    discard: discardMock,
    isDiscarding: isDiscardingRef.value,
    discardError: discardErrorRef.value,
    retry: retryMock,
  }),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const WORKSPACE: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Acme Flow',
  slug: 'acme-flow',
  role: 'OWNER',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function channelDraft(overrides: Partial<DraftListItem> = {}): DraftListItem {
  return {
    id: 'draft-1',
    body: 'Reminder: ship the audit notes before standup',
    targetKind: 'CHANNEL',
    targetId: 'ch-1',
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
    updatedAt: new Date('2026-09-23T12:00:00.000Z'),
    container: { type: 'channel', id: 'ch-1', name: 'general', slug: 'general' },
    ...overrides,
  };
}

function setShell(
  overrides: {
    session?: SessionState;
    currentWorkspace?: WorkspaceSummary | null;
  } = {},
) {
  shellRef.value = {
    session: overrides.session ?? ({ status: 'authenticated' } as SessionState),
    currentWorkspace:
      overrides.currentWorkspace === undefined ? WORKSPACE : overrides.currentWorkspace,
    currentUser: USER,
  };
}

beforeEach(() => {
  pushMock.mockReset();
  discardMock.mockReset().mockResolvedValue(true);
  retryMock.mockReset();
  isDiscardingRef.value = false;
  discardErrorRef.value = null;
  draftsState.value = { status: 'loading' };
  setShell();
});

describe('DraftsView (Audit 13)', () => {
  it('shows a loading status while the session is loading', () => {
    setShell({ session: { status: 'loading' } });
    draftsState.value = { status: 'loading' };
    render(<DraftsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading drafts/i);
    expect(screen.queryByText(/^No drafts$/i)).not.toBeInTheDocument();
  });

  it('asks the user to sign in when unauthenticated', async () => {
    const user = userEvent.setup();
    setShell({ session: { status: 'unauthenticated' } });
    draftsState.value = { status: 'unauthenticated' };
    render(<DraftsView />);

    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/^No drafts$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('surfaces the session error message when the session fetch fails', () => {
    setShell({ session: { status: 'error', message: 'Could not load session.' } });
    render(<DraftsView />);

    expect(screen.getByRole('status')).toHaveTextContent('Could not load session.');
  });

  it('asks for a workspace when none is selected', () => {
    setShell({ currentWorkspace: null });
    draftsState.value = { status: 'idle' };
    render(<DraftsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/select a workspace/i);
  });

  it('renders the honest empty state copy', () => {
    draftsState.value = { status: 'ready', drafts: [] };
    render(<DraftsView />);

    expect(screen.getByText(/^No drafts$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/any unsent messages you leave in channels or direct messages/i),
    ).toBeInTheDocument();
  });

  it('shows a retry action when the drafts request fails', async () => {
    const user = userEvent.setup();
    draftsState.value = { status: 'error', message: 'Could not load drafts.' };
    render(<DraftsView />);

    expect(screen.getByText(/couldn.t load drafts/i)).toBeInTheDocument();
    expect(screen.getByText('Could not load drafts.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('renders real draft cards with destination, body, and actions', () => {
    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    render(<DraftsView />);

    expect(screen.getByText('#general')).toBeInTheDocument();
    expect(screen.getByText(/ship the audit notes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume message/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /discard draft/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/^No drafts$/i)).not.toBeInTheDocument();
  });

  it('labels DM drafts with an @ destination', () => {
    draftsState.value = {
      status: 'ready',
      drafts: [
        channelDraft({
          targetKind: 'DIRECT_MESSAGE',
          targetId: 'dm-9',
          container: { type: 'directMessage', id: 'dm-9', name: 'Bob' },
        }),
      ],
    };
    render(<DraftsView />);

    expect(screen.getByText('@Bob')).toBeInTheDocument();
  });

  it('resumes a channel draft into the channel path', async () => {
    const user = userEvent.setup();
    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    render(<DraftsView />);

    await user.click(screen.getByRole('button', { name: /resume message/i }));
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general');
  });

  it('resumes a DM draft into the conversation path', async () => {
    const user = userEvent.setup();
    draftsState.value = {
      status: 'ready',
      drafts: [
        channelDraft({
          targetKind: 'DIRECT_MESSAGE',
          targetId: 'dm-9',
          container: { type: 'directMessage', id: 'dm-9', name: 'Bob' },
        }),
      ],
    };
    render(<DraftsView />);

    await user.click(screen.getByRole('button', { name: /resume message/i }));
    expect(pushMock).toHaveBeenCalledWith('/app/dms/dm-9');
  });

  it('resumes a thread draft with a message deep link', async () => {
    const user = userEvent.setup();
    draftsState.value = {
      status: 'ready',
      drafts: [
        channelDraft({
          targetKind: 'THREAD',
          targetId: 'msg-root',
          container: { type: 'thread', id: 'ch-1', name: '#general', slug: 'general' },
        }),
      ],
    };
    render(<DraftsView />);

    await user.click(screen.getByRole('button', { name: /resume message/i }));
    expect(pushMock).toHaveBeenCalledWith(
      '/app/channels/general?message=msg-root',
    );
  });

  it('discards a draft from the icon button', async () => {
    const user = userEvent.setup();
    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    render(<DraftsView />);

    await user.click(screen.getByRole('button', { name: /discard draft/i }));
    expect(discardMock).toHaveBeenCalledWith('draft-1');
  });

  it('discards a draft from the Discard footer action', async () => {
    const user = userEvent.setup();
    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    render(<DraftsView />);

    const footer = screen.getAllByRole('button', { name: /^Discard$/i });
    await user.click(footer[0]);
    expect(discardMock).toHaveBeenCalledWith('draft-1');
  });

  it('shows the header count only when drafts are ready', () => {
    draftsState.value = { status: 'loading' };
    const { rerender } = render(<DraftsView />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    rerender(<DraftsView />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows the loading status while drafts are fetching', () => {
    draftsState.value = { status: 'loading' };
    render(<DraftsView />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading drafts/i);
  });

  it('asks for sign-in when the drafts request returns unauthenticated', async () => {
    const user = userEvent.setup();
    draftsState.value = { status: 'unauthenticated' };
    render(<DraftsView />);
    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('surfaces a discard error without hiding the list', async () => {
    discardErrorRef.value = 'Failed to discard draft.';
    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    render(<DraftsView />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to discard draft.');
    expect(screen.getByText('#general')).toBeInTheDocument();
  });

  it('hides empty state once data arrives', async () => {
    draftsState.value = { status: 'loading' };
    const { rerender } = render(<DraftsView />);
    expect(screen.queryByText(/^No drafts$/i)).not.toBeInTheDocument();

    draftsState.value = { status: 'ready', drafts: [channelDraft()] };
    rerender(<DraftsView />);
    await waitFor(() =>
      expect(screen.getByText(/ship the audit notes/i)).toBeInTheDocument(),
    );
  });
});
