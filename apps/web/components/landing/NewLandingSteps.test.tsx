import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingSteps } from './NewLandingSteps';

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

describe('NewLandingSteps', () => {
  it('renders the three-step sequence in order with one CTA', () => {
    render(<NewLandingSteps />);
    expect(
      screen.getByRole('heading', { level: 2, name: /get started in minutes/i }),
    ).toBeInTheDocument();
    const list = screen.getByRole('list');
    const items = list.querySelectorAll(':scope > li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/create your workspace/i);
    expect(items[1]).toHaveTextContent(/invite your team/i);
    expect(items[2]).toHaveTextContent(/talk in channels/i);
    expect(screen.getByRole('link', { name: /start for free/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
    expect(screen.getByTestId('steps')).toBeInTheDocument();
  });

  it('renders immediately under reduced motion', () => {
    mockMatchMedia(true);
    render(<NewLandingSteps />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });
});
