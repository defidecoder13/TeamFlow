import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostLoginTransition } from './PostLoginTransition';

const { shellSession } = vi.hoisted(() => ({
  shellSession: { value: { status: 'loading' } as unknown },
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => ({ session: shellSession.value }),
}));

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  shellSession.value = { status: 'loading' };
  setReferrer('');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PostLoginTransition', () => {
  it('celebrates the first authenticated paint after sign-in, then dismisses', () => {
    setReferrer('http://localhost:3000/sign-in');
    shellSession.value = { status: 'authenticated', user: USER };
    render(<PostLoginTransition />);

    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.getByText(/welcome back, ada/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText('Signed in')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText('Signed in')).toBeNull();
  });

  it('shows a signing-in state first so it appears before the workspace', () => {
    setReferrer('http://localhost:3000/sign-up');
    shellSession.value = { status: 'loading' };
    const { rerender } = render(<PostLoginTransition />);

    expect(screen.getByText('Signing you in…')).toBeInTheDocument();
    expect(screen.queryByText('Signed in')).toBeNull();

    shellSession.value = { status: 'authenticated', user: USER };
    rerender(<PostLoginTransition />);

    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.getByText(/welcome back, ada/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText('Signed in')).toBeNull();
  });

  it('never blocks pointer input while showing', () => {
    setReferrer('http://localhost:3000/sign-up');
    shellSession.value = { status: 'authenticated', user: USER };
    const { container } = render(<PostLoginTransition />);

    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toMatch(/pointer-events-none/);
  });

  it('stays hidden on refresh and in-app navigation', () => {
    shellSession.value = { status: 'authenticated', user: USER };
    setReferrer('http://localhost:3000/app');
    const { unmount } = render(<PostLoginTransition />);
    expect(screen.queryByText('Signed in')).toBeNull();
    unmount();

    setReferrer('');
    render(<PostLoginTransition />);
    expect(screen.queryByText('Signed in')).toBeNull();
  });

  it('stays hidden while unauthenticated', () => {
    setReferrer('http://localhost:3000/sign-in');
    shellSession.value = { status: 'unauthenticated' };
    render(<PostLoginTransition />);

    expect(screen.queryByText('Signed in')).toBeNull();
  });
});
