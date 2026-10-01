import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingPrivacy } from './NewLandingPrivacy';

function mockMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  mockMatchMedia(false);
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((cb: IntersectionObserverCallback) => {
      setTimeout(() => {
        cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      }, 0);
      return new MockObserver() as unknown as IntersectionObserver;
    }),
  });
});

describe('NewLandingPrivacy', () => {
  it('renders three permission facts with icons hidden from assistive tech', () => {
    render(<NewLandingPrivacy />);
    expect(
      screen.getByRole('heading', { level: 2, name: /private by default/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Workspace-scoped')).toBeInTheDocument();
    expect(screen.getByText('Membership-gated search')).toBeInTheDocument();
    expect(screen.getByText('Owner controls')).toBeInTheDocument();
    expect(screen.getByTestId('privacy')).toBeInTheDocument();
    const svgs = screen.getByTestId('privacy').querySelectorAll('svg');
    expect(svgs.length).toBe(3);
    for (const svg of Array.from(svgs)) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('renders immediately under reduced motion', () => {
    mockMatchMedia(true);
    render(<NewLandingPrivacy />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });
});
