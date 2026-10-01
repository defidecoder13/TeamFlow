import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSetupStep } from './ProfileSetupStep';

const { updateProfileMock, getApiBaseUrlMock, pushMock, replaceMock } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  getApiBaseUrlMock: vi.fn(() => 'http://localhost:4000'),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('../../lib/profile', () => ({
  updateProfile: updateProfileMock,
  validateProfileImage: (value: string) => {
    const t = value.trim();
    if (!t) return null;
    if (t.startsWith('data:image/')) {
      if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(t)) {
        return 'Enter a valid image.';
      }
      return null;
    }
    try {
      const url = new URL(t);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Enter a valid image URL.';
    } catch {
      return 'Enter a valid image URL.';
    }
    return null;
  },
}));

vi.mock('../../lib/config', () => ({
  getApiBaseUrl: getApiBaseUrlMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
}));

const savedUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
  emailVerified: false,
};

beforeEach(() => {
  updateProfileMock.mockReset();
  getApiBaseUrlMock.mockReset();
  getApiBaseUrlMock.mockReturnValue('http://localhost:4000');
  pushMock.mockReset();
  replaceMock.mockReset();
});

describe('ProfileSetupStep', () => {
  it('renders the approved step header and avatar selector actions', () => {
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /choose your profile photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to teamflow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use initials/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload profile photo/i)).toBeInTheDocument();
  });

  it('saves the selected professional avatar via PATCH /api/me then navigates to /app', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({ ok: true, user: savedUser });
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    await user.click(screen.getByRole('button', { name: /continue to teamflow/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));
    expect(updateProfileMock).toHaveBeenCalledWith('http://localhost:4000', {
      image: savedUser.image,
    });
    expect(pushMock).toHaveBeenCalledWith('/app');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('saves initials as image: null', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({ ok: true, user: { ...savedUser, image: null } });
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    await user.click(screen.getByRole('button', { name: /use initials/i }));
    await user.click(screen.getByRole('button', { name: /continue to teamflow/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith('http://localhost:4000', {
      image: null,
    }));
    expect(pushMock).toHaveBeenCalledWith('/app');
  });

  it('skip navigates to /app without saving', async () => {
    const user = userEvent.setup();
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    await user.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(pushMock).toHaveBeenCalledWith('/app');
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('shows a safe error and stays on the step when save fails', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({
      ok: false,
      kind: 'failed',
      message: "We couldn't update your profile. Please try again.",
    });
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    await user.click(screen.getByRole('button', { name: /continue to teamflow/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't update your profile/i,
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when the session is unauthenticated', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({ ok: false, kind: 'unauthenticated' });
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    await user.click(screen.getByRole('button', { name: /continue to teamflow/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/sign-in'));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while saving', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockReturnValue(new Promise(() => {}));
    render(<ProfileSetupStep name="Ada Lovelace" email="ada@example.com" />);

    const continueBtn = screen.getByRole('button', { name: /continue to teamflow/i });
    await user.click(continueBtn);

    expect(await screen.findByRole('button', { name: /setting up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeDisabled();
    expect(updateProfileMock).toHaveBeenCalledTimes(1);
  });
});
