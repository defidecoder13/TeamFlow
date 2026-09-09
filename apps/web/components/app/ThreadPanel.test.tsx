import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadPanel } from './ThreadPanel';
import type { Message } from '../../lib/messages';
import type { ThreadMessagesState } from '../../lib/use-thread-messages';

const {
  threadState,
  isLoadingOlderState,
  loadOlderErrorState,
  retryMock,
  loadOlderMock,
  sendMock,
  editMock,
  removeMock,
  useThreadMessagesMock,
} = vi.hoisted(() => ({
  threadState: {
    value: {
      status: 'ready',
      messages: [] as Message[],
      hasMore: false,
      nextCursor: null,
    } as ThreadMessagesState,
  },
  isLoadingOlderState: { value: false },
  loadOlderErrorState: { value: null as string | null },
  retryMock: vi.fn(),
  loadOlderMock: vi.fn(),
  sendMock: vi.fn().mockResolvedValue({ ok: true }),
  editMock: vi.fn().mockResolvedValue({ ok: true }),
  removeMock: vi.fn().mockResolvedValue({ ok: true }),
  useThreadMessagesMock: vi.fn(),
}));

vi.mock('../../lib/use-thread-messages', () => ({
  useThreadMessages: (...args: unknown[]) => {
    useThreadMessagesMock(...args);
    return {
      state: threadState.value,
      isLoadingOlder: isLoadingOlderState.value,
      loadOlderError: loadOlderErrorState.value,
      retry: retryMock,
      loadOlder: loadOlderMock,
      send: sendMock,
      edit: editMock,
      remove: removeMock,
    };
  },
}));

const ROOT_MESSAGE: Message = {
  id: 'm-root-1',
  channelId: 'ch-1',
  authorId: 'u-author',
  body: 'Initial question for discussion',
  createdAt: new Date('2026-09-06T10:00:00.000Z'),
  updatedAt: new Date('2026-09-06T10:00:00.000Z'),
  editedAt: null,
  deletedAt: null,
  replyCount: 2,
  latestReplyAt: new Date('2026-09-06T10:15:00.000Z'),
  author: { id: 'u-author', name: 'Alan Turing', image: null },
};

function makeReply(id: string, body: string, authorId = 'u-other'): Message {
  return {
    id,
    channelId: 'ch-1',
    parentMessageId: 'm-root-1',
    authorId,
    body,
    createdAt: new Date('2026-09-06T10:05:00.000Z'),
    updatedAt: new Date('2026-09-06T10:05:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: {
      id: authorId,
      name: authorId === 'u-author' ? 'Alan Turing' : 'Grace Hopper',
      image: null,
    },
  };
}

describe('ThreadPanel', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    onCloseMock.mockReset();
    retryMock.mockReset();
    loadOlderMock.mockReset();
    sendMock.mockReset().mockResolvedValue({ ok: true });
    editMock.mockReset().mockResolvedValue({ ok: true });
    removeMock.mockReset().mockResolvedValue({ ok: true });
    useThreadMessagesMock.mockReset();

    threadState.value = {
      status: 'ready',
      messages: [],
      hasMore: false,
      nextCursor: null,
    };
    isLoadingOlderState.value = false;
    loadOlderErrorState.value = null;
  });

  it('renders pinned root message and header with author name', () => {
    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Thread' })).toBeInTheDocument();
    expect(screen.getByText('with Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Initial question for discussion')).toBeInTheDocument();
  });

  it('renders deleted pinned root message placeholder if body is null', () => {
    const deletedRoot: Message = { ...ROOT_MESSAGE, body: null, deletedAt: new Date() };
    render(<ThreadPanel rootMessage={deletedRoot} userId="u-current" onClose={onCloseMock} />);

    expect(screen.getByText('Message deleted')).toBeInTheDocument();
  });

  it('renders loading state while thread messages are loading', () => {
    threadState.value = { status: 'loading' };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    expect(screen.getByText('Loading replies...')).toBeInTheDocument();
  });

  it('renders error state and retries on button click', async () => {
    const user = userEvent.setup();
    threadState.value = { status: 'error', message: 'Network disconnected' };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    expect(screen.getByText('Network disconnected')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /^retry$/i });
    await user.click(retryBtn);
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('renders empty replies state when thread has no replies', () => {
    threadState.value = { status: 'ready', messages: [], hasMore: false, nextCursor: null };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    expect(screen.getByText('No replies yet')).toBeInTheDocument();
    expect(screen.getByText('Start the conversation in this thread!')).toBeInTheDocument();
  });

  it('renders thread replies and supports pagination', async () => {
    const user = userEvent.setup();
    const reply1 = makeReply('r-1', 'First reply message');
    const reply2 = makeReply('r-2', 'Second reply message');

    threadState.value = {
      status: 'ready',
      messages: [reply1, reply2],
      hasMore: true,
      nextCursor: 'cur-1',
    };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    expect(screen.getByText('First reply message')).toBeInTheDocument();
    expect(screen.getByText('Second reply message')).toBeInTheDocument();

    const loadOlderBtn = screen.getByRole('button', { name: /load older replies/i });
    await user.click(loadOlderBtn);
    expect(loadOlderMock).toHaveBeenCalledTimes(1);
  });

  it('allows sending a reply via composer', async () => {
    const user = userEvent.setup();
    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    const textarea = screen.getByPlaceholderText('Reply...');
    await user.type(textarea, 'Here is my reply in thread{enter}');

    expect(sendMock).toHaveBeenCalledWith('Here is my reply in thread');
  });

  it('allows author to edit a reply inline', async () => {
    const user = userEvent.setup();
    const myReply = makeReply('r-mine', 'Original reply content', 'u-current');

    threadState.value = {
      status: 'ready',
      messages: [myReply],
      hasMore: false,
      nextCursor: null,
    };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    const editBtn = screen.getByRole('button', { name: 'Edit message' });
    await user.click(editBtn);

    const editTextarea = screen.getByDisplayValue('Original reply content');
    await user.clear(editTextarea);
    await user.type(editTextarea, 'Updated reply content');

    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);

    expect(editMock).toHaveBeenCalledWith('r-mine', 'Updated reply content');
  });

  it('allows author to delete a reply with confirmation dialog', async () => {
    const user = userEvent.setup();
    const myReply = makeReply('r-mine', 'Content to delete', 'u-current');

    threadState.value = {
      status: 'ready',
      messages: [myReply],
      hasMore: false,
      nextCursor: null,
    };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    const deleteBtn = screen.getByRole('button', { name: 'Delete message' });
    await user.click(deleteBtn);

    // Confirmation dialog appears
    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmDeleteBtn);

    expect(removeMock).toHaveBeenCalledWith('r-mine');
  });

  it('closes thread panel when Close button is clicked', async () => {
    const user = userEvent.setup();
    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    const closeBtn = screen.getByRole('button', { name: /close thread/i });
    await user.click(closeBtn);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('closes thread panel on Escape key when no dialog or editor is open', async () => {
    const user = userEvent.setup();
    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    await user.keyboard('{Escape}');

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('cancels inline edit on Escape key without closing thread panel', async () => {
    const user = userEvent.setup();
    const myReply = makeReply('r-mine', 'Original reply', 'u-current');

    threadState.value = {
      status: 'ready',
      messages: [myReply],
      hasMore: false,
      nextCursor: null,
    };

    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    const editBtn = screen.getByRole('button', { name: 'Edit message' });
    await user.click(editBtn);

    expect(screen.getByDisplayValue('Original reply')).toBeInTheDocument();

    // Escape cancels the edit
    await user.keyboard('{Escape}');

    // Edit cancelled
    expect(screen.queryByDisplayValue('Original reply')).toBeNull();
    // Panel was NOT closed
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('passes rootMessage.id and rootMessage.channelId to useThreadMessages', () => {
    render(<ThreadPanel rootMessage={ROOT_MESSAGE} userId="u-current" onClose={onCloseMock} />);

    expect(useThreadMessagesMock).toHaveBeenCalledWith('m-root-1', 'ch-1');
  });
});
