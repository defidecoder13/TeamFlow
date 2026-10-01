import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import { SettingsProfileView } from './SettingsProfileView';

const {
  updateProfileMock,
  showToastMock,
  sessionSetUserMock,
  sessionState,
  shellRef,
  getApiBaseUrlMock,
  pushMock,
} = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  showToastMock: vi.fn(),
  sessionSetUserMock: vi.fn(),
  sessionState: {
    value: { status: 'loading' } as SessionState & { setUser?: unknown; refresh?: unknown },
  },
  shellRef: { value: {} as Record<string, unknown> },
  getApiBaseUrlMock: vi.fn(() => 'http://localhost:4000'),
  pushMock: vi.fn(),
}));

vi.mock('../../lib/profile', () => ({
  updateProfile: updateProfileMock,
  validateProfileName: (value: string) => {
    const t = value.trim();
    if (!t) return 'Display name is required.';
    if (t.length > 100) return 'Use 100 characters or fewer.';
    return null;
  },
  validateProfileImage: (value: string) => {
    const t = value.trim();
    if (!t) return null;
    try {
      const url = new URL(t);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Enter a valid image URL.';
      }
    } catch {
      return 'Enter a valid image URL.';
    }
    if (t.length > 2048) return 'Image URL must be 2048 characters or fewer.';
    return null;
  },
}));

vi.mock('../../lib/config', () => ({
  getApiBaseUrl: getApiBaseUrlMock,
}));

vi.mock('../../lib/mock-context', () => ({
  useApp: () => ({ showToast: showToastMock }),
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const user: {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
} = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

function setShell(overrides: Record<string, unknown> = {}) {
  shellRef.value = {
    session: {
      status: 'authenticated',
      user,
      setUser: sessionSetUserMock,
      refresh: vi.fn(),
    },
    currentUser: user,
    currentWorkspace: { id: 'ws-1', name: 'Acme Flow', slug: 'acme-flow' },
    members: {
      state: {
        status: 'ready',
        members: [
          {
            id: 'mem-1',
            role: 'OWNER',
            createdAt: '2026-09-01T00:00:00.000Z',
            user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
          },
        ],
      },
      retry: vi.fn(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateProfileMock.mockReset();
  sessionState.value = { status: 'loading' };
  setShell();
});

describe('SettingsProfileView', () => {
  it('shows a loading state until the session resolves', () => {
    shellRef.value = {
      ...shellRef.value,
      session: sessionState.value,
      currentUser: null,
    };
    render(<SettingsProfileView />);
    expect(screen.getByRole('status', { name: /loading profile/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('shows an unauthenticated message when there is no session user', async () => {
    const user = userEvent.setup();
    shellRef.value = {
      ...shellRef.value,
      session: { status: 'unauthenticated' },
      currentUser: null,
    };
    render(<SettingsProfileView />);
    expect(screen.getByRole('status', { name: /loading profile/i })).toHaveTextContent(
      /please sign in/i,
    );

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('reflects real session identity and workspace membership join date', async () => {
    render(<SettingsProfileView />);

    expect(screen.getByLabelText(/full name/i)).toHaveValue('Ada Lovelace');
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Acme Flow')).toBeInTheDocument();
    expect(screen.getByText(/joined september 2026/i)).toBeInTheDocument();
  });

  it('omits workspace and join rows when there is no workspace', () => {
    setShell({ currentWorkspace: null, members: { state: { status: 'idle' }, retry: vi.fn() } });
    render(<SettingsProfileView />);

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Acme Flow')).not.toBeInTheDocument();
    expect(screen.queryByText(/joined/i)).not.toBeInTheDocument();
  });

  it('does not render mock-only fields (title, status) or mock identity', () => {
    render(<SettingsProfileView />);

    expect(screen.queryByLabelText(/title or role/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status message/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/alex chen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/focusing on v2 architecture/i)).not.toBeInTheDocument();
  });

  it('validates empty name before calling the API', async () => {
    render(<SettingsProfileView />);
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/display name is required/i)).toBeInTheDocument();
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('saves name and image via PATCH /api/me and updates shell session', async () => {
    const updated = {
      ...user,
      name: 'Ada L.',
      image: 'https://example.com/ada.jpg',
    };
    updateProfileMock.mockResolvedValue({ ok: true, user: updated });

    render(<SettingsProfileView />);
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada L.');
    await userEvent.type(screen.getByLabelText(/custom photo url/i), 'https://example.com/ada.jpg');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith('http://localhost:4000', {
        name: 'Ada L.',
        image: 'https://example.com/ada.jpg',
      });
    });

    expect(sessionSetUserMock).toHaveBeenCalledWith(updated);
    expect(showToastMock).toHaveBeenCalledWith('Profile updated successfully.', 'success');
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
  });

  it('sends image:null when using initials', async () => {
    updateProfileMock.mockResolvedValue({ ok: true, user: { ...user, image: null } });

    setShell({
      currentUser: { ...user, image: 'https://example.com/old.jpg' },
      session: {
        status: 'authenticated',
        user: { ...user, image: 'https://example.com/old.jpg' },
        setUser: sessionSetUserMock,
        refresh: vi.fn(),
      },
    });
    render(<SettingsProfileView />);

    await userEvent.click(screen.getByRole('button', { name: /use initials/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith('http://localhost:4000', {
        name: 'Ada Lovelace',
        image: null,
      });
    });
  });

  it('surfaces API validation errors without updating session', async () => {
    updateProfileMock.mockResolvedValue({
      ok: false,
      kind: 'validation',
      message: 'Use a shorter name (100 characters or fewer).',
    });

    render(<SettingsProfileView />);
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(/use a shorter name/i),
    ).toBeInTheDocument();
    expect(sessionSetUserMock).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('handles unauthenticated save responses', async () => {
    updateProfileMock.mockResolvedValue({ ok: false, kind: 'unauthenticated' });

    render(<SettingsProfileView />);
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Nope');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/must be signed in/i)).toBeInTheDocument();
    expect(sessionSetUserMock).not.toHaveBeenCalled();
  });

  it('disables submit while saving', async () => {
    let resolveSave: (v: unknown) => void = () => {};
    updateProfileMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<SettingsProfileView />);
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Busy');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });

    resolveSave({ ok: true, user });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });
  });
});
