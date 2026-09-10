import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContent } from './ProfileContent';

const { updateProfileMock } = vi.hoisted(() => ({ updateProfileMock: vi.fn() }));
vi.mock('../../lib/profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/profile')>()),
  updateProfile: updateProfileMock,
}));

const USER = {
  id: 'u1',
  name: 'Alice',
  email: 'alice@example.com',
  image: null,
  emailVerified: true,
};

beforeEach(() => {
  updateProfileMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('ProfileContent', () => {
  it('renders avatar preview and fields', () => {
    render(<ProfileContent user={USER} onUpdated={vi.fn()} onUnauthenticated={vi.fn()} />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Alice');
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
  });

  it('validates name required', async () => {
    const user = userEvent.setup();
    render(<ProfileContent user={USER} onUpdated={vi.fn()} onUnauthenticated={vi.fn()} />);
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/display name is required/i)).toBeInTheDocument();
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('validates image url', async () => {
    const user = userEvent.setup();
    render(<ProfileContent user={USER} onUpdated={vi.fn()} onUnauthenticated={vi.fn()} />);
    await user.type(screen.getByLabelText(/avatar image url/i), 'not-a-url');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/valid image url/i)).toBeInTheDocument();
  });

  it('saves successfully and calls onUpdated', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const updated = { ...USER, name: 'Alice Updated', image: 'https://example.com/a.jpg' };
    updateProfileMock.mockResolvedValue({ ok: true, user: updated });
    render(<ProfileContent user={USER} onUpdated={onUpdated} onUnauthenticated={vi.fn()} />);
    const nameInput = screen.getByLabelText(/display name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Updated');
    await user.type(screen.getByLabelText(/avatar image url/i), 'https://example.com/a.jpg');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(updateProfileMock).toHaveBeenCalledWith('http://localhost:4000', {
      name: 'Alice Updated',
      image: 'https://example.com/a.jpg',
    });
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('maps validation error', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({ ok: false, kind: 'validation', message: 'Bad name' });
    render(<ProfileContent user={USER} onUpdated={vi.fn()} onUnauthenticated={vi.fn()} />);
    await user.clear(screen.getByLabelText(/display name/i));
    await user.type(screen.getByLabelText(/display name/i), 'Bob');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad name');
  });
});
