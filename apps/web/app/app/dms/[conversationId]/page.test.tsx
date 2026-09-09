import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../../../lib/use-session-user';
import type { WorkspacesState } from '../../../../lib/use-workspaces';
import type { DirectConversationState } from '../../../../lib/use-direct-conversation';
import type { DirectMessagesState } from '../../../../lib/use-direct-messages';
import DirectMessagePage from './page';
import type { Message, DirectConversation } from '../../../../lib/messages';

const {
  replaceMock,
  sessionState,
  workspacesState,
  convState,
  messagesState,
  isLoadingOlderState,
  loadOlderErrorState,
  editMock,
  loadOlderMock,
  removeMock,
  sendMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  sessionState: { value: { status: 'loading' } as SessionState },
  workspacesState: { value: { status: 'idle' } as WorkspacesState },
  convState: { value: { status: 'loading' } as DirectConversationState },
  messagesState: {
    value: {
      status: 'ready',
      messages: [] as Message[],
      hasMore: false,
      nextCursor: null,
    } as DirectMessagesState,
  },
  isLoadingOlderState: { value: false },
  loadOlderErrorState: { value: null as string | null },
  editMock: vi.fn().mockResolvedValue({ ok: true }),
  loadOlderMock: vi.fn(),
  removeMock: vi.fn().mockResolvedValue({ ok: true }),
  sendMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ conversationId: 'dm-1' }),
  usePathname: () => '/app/dms/dm-1',
}));

vi.mock('../../../../lib/use-session-user', () => ({
  useSessionUser: () => sessionState.value,
}));

vi.mock('../../../../lib/use-workspaces', () => ({
  useWorkspaces: () => ({
    state: workspacesState.value,
    retry: vi.fn(),
    addWorkspace: vi.fn(),
  }),
}));

vi.mock('../../../../lib/use-direct-conversation', () => ({
  useDirectConversation: () => ({
    state: convState.value,
    retry: vi.fn(),
    setConversation: vi.fn(),
  }),
}));

vi.mock('../../../../lib/use-direct-conversations', () => ({
  useDirectConversations: () => ({
    state: { status: 'ready', conversations: [] },
    retry: vi.fn(),
    addConversation: vi.fn(),
  }),
}));

vi.mock('../../../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: { status: 'ready', channels: [] },
    retry: vi.fn(),
    addChannel: vi.fn(),
    updateChannelState: vi.fn(),
  }),
}));

vi.mock('../../../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: vi.fn() }),
}));

vi.mock('../../../../lib/use-direct-messages', () => ({
  useDirectMessages: () => ({
    state: messagesState.value,
    retry: vi.fn(),
    loadOlder: loadOlderMock,
    send: sendMock,
    edit: editMock,
    remove: removeMock,
    normalizeMessages: vi.fn((msgs) => msgs),
    isLoadingOlder: isLoadingOlderState.value,
    loadOlderError: loadOlderErrorState.value,
  }),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const WORKSPACE = {
  id: 'ws-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  role: 'OWNER' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const CONVERSATION: DirectConversation = {
  id: 'dm-1',
  workspaceId: 'ws-1',
  type: 'DIRECT',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  participants: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
    { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
  ],
  peer: { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
};

const MESSAGE_1: Message = {
  id: 'msg-1',
  channelId: null,
  directMessageConversationId: 'dm-1',
  parentMessageId: null,
  authorId: 'u-2',
  body: 'Hello Ada!',
  replyCount: 0,
  latestReplyAt: null,
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  editedAt: null,
  deletedAt: null,
  author: { id: 'u-2', name: 'Alan Turing', image: null },
};

beforeEach(() => {
  replaceMock.mockReset();
  window.history.replaceState(null, '', '/app/dms/dm-1');
  sendMock.mockReset().mockResolvedValue({ ok: true });
  editMock.mockReset().mockResolvedValue({ ok: true });
  removeMock.mockReset().mockResolvedValue({ ok: true });
  loadOlderMock.mockReset();

  sessionState.value = { status: 'authenticated', user: USER };
  workspacesState.value = {
    status: 'ready',
    workspaces: [WORKSPACE],
    current: WORKSPACE,
  };
  convState.value = { status: 'ready', conversation: CONVERSATION };
  messagesState.value = {
    status: 'ready',
    messages: [MESSAGE_1],
    hasMore: false,
    nextCursor: null,
  };
  isLoadingOlderState.value = false;
  loadOlderErrorState.value = null;
});

describe('DirectMessagePage', () => {
  it('renders peer header, location, and message list', () => {
    render(<DirectMessagePage />);

    expect(screen.getAllByText('Alan Turing').length).toBeGreaterThan(0);
    expect(screen.getByText('alan@example.com')).toBeInTheDocument();
    expect(screen.getByText('Hello Ada!')).toBeInTheDocument();
  });

  it('renders empty state when conversation has no messages', () => {
    messagesState.value = {
      status: 'ready',
      messages: [],
      hasMore: false,
      nextCursor: null,
    };

    render(<DirectMessagePage />);

    expect(
      screen.getByText(/this is the start of your direct message history with alan turing/i),
    ).toBeInTheDocument();
  });

  it('sends a direct message via the composer', async () => {
    const user = userEvent.setup();
    render(<DirectMessagePage />);

    const textarea = screen.getByPlaceholderText(/message alan turing/i);
    await user.type(textarea, 'Hi Alan!{Enter}');

    expect(sendMock).toHaveBeenCalledWith('Hi Alan!');
  });

  it('renders not found state when conversation is inaccessible or missing', () => {
    convState.value = { status: 'notFound' };

    render(<DirectMessagePage />);

    expect(screen.getByText(/conversation not found/i)).toBeInTheDocument();
  });

  it('redirects to sign-in when unauthenticated', () => {
    sessionState.value = { status: 'unauthenticated' };

    render(<DirectMessagePage />);

    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });

  describe('search deep links', () => {
    it('highlights a loaded target and consumes the params', async () => {
      window.history.replaceState(null, '', '/app/dms/dm-1?message=msg-1');
      const { container } = render(<DirectMessagePage />);

      await waitFor(() => {
        const row = container.querySelector('[data-message-id="msg-1"]');
        expect(row?.className).toContain('ring-amber-300');
      });
      expect(window.location.search).toBe('');
    });

    it('opens the thread panel for reply links', async () => {
      window.history.replaceState(null, '', '/app/dms/dm-1?message=msg-1&reply=r-9');
      const { container } = render(<DirectMessagePage />);

      await waitFor(() => {
        expect(container.querySelector('[data-selected-thread-id="msg-1"]')).not.toBeNull();
      });
      expect(window.location.search).toBe('');
    });

    it('fails gracefully for missing targets', async () => {
      window.history.replaceState(null, '', '/app/dms/dm-1?message=msg-gone');
      const { container } = render(<DirectMessagePage />);

      await waitFor(() => {
        expect(window.location.search).toBe('');
      });
      expect(container.querySelector('.ring-amber-300')).toBeNull();
    });
  });
});
