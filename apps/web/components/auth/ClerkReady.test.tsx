import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClerkReady } from './ClerkReady';

const { clerkLoaded } = vi.hoisted(() => ({ clerkLoaded: { value: false } }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: clerkLoaded.value }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  clerkLoaded.value = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClerkReady', () => {
  it('shows a branded skeleton while Clerk loads (never blank)', () => {
    render(
      <ClerkReady label="Loading sign in">
        <div>clerk-card</div>
      </ClerkReady>,
    );

    expect(screen.getByRole('status', { name: /loading sign in/i })).toBeInTheDocument();
    expect(screen.queryByText('clerk-card')).toBeNull();
  });

  it('renders children once Clerk is ready', () => {
    clerkLoaded.value = true;
    render(
      <ClerkReady label="Loading sign in">
        <div>clerk-card</div>
      </ClerkReady>,
    );

    expect(screen.getByText('clerk-card')).toBeInTheDocument();
  });

  it('explains with a retry when Clerk never loads', () => {
    render(
      <ClerkReady label="Loading sign in">
        <div>clerk-card</div>
      </ClerkReady>,
    );

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load sign in/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
