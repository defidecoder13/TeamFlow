import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingSearch } from './NewLandingSearch';

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

describe('NewLandingSearch', () => {
  it('renders heading and supporting copy about permission-aware search', () => {
    render(<NewLandingSearch />);
    expect(
      screen.getByRole('heading', { level: 2, name: /anything your team already knows/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/same workspace and channel permissions/i)).toBeInTheDocument();
    expect(screen.getByTestId('search-spotlight')).toBeInTheDocument();
    // No assistant framing anywhere.
    const text = screen.getByTestId('search-spotlight').textContent ?? '';
    expect(text).not.toMatch(/copilot|AI vision|synthesis|artificial intelligence/i);
  });

  it('renders all three search truths', () => {
    render(<NewLandingSearch />);
    expect(screen.getByText('Answers with sources')).toBeInTheDocument();
    expect(screen.getByText('Narrow by channel, person, or date')).toBeInTheDocument();
    expect(screen.getByText('Private by default')).toBeInTheDocument();
    expect(screen.getByText(/nothing leaks across workspaces/i)).toBeInTheDocument();
  });

  it('renders the search panel with query, results, and permission note', () => {
    render(<NewLandingSearch />);
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
    expect(screen.getByTestId('search-query')).toBeInTheDocument();
    expect(screen.getByText('calm direction')).toBeInTheDocument();
    expect(screen.getByTestId('search-results')).toBeInTheDocument();
    expect(screen.getByText('#brand-redesign-v2')).toBeInTheDocument();
    expect(screen.getByText(/2 replies/i)).toBeInTheDocument();
    expect(screen.getByText('calm-direction-spec.fig')).toBeInTheDocument();
    expect(screen.getByText(/respect workspace and channel permissions/i)).toBeInTheDocument();
  });

  it('links to the real sign-in route and uses no remote images', () => {
    render(<NewLandingSearch />);
    expect(screen.getByRole('link', { name: /search your workspace/i })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    const section = screen.getByTestId('search-spotlight');
    expect(section.querySelector('img')).toBeNull();
    expect(section.querySelector('svg')).not.toBeNull();
    const grid = section.querySelector('.lg\\:grid-cols-12');
    expect(grid).not.toBeNull();
  });

  it('keeps panel content accessible and renders under reduced motion', () => {
    render(<NewLandingSearch />);
    const section = screen.getByTestId('search-spotlight');
    expect(section).toHaveAttribute('aria-labelledby', 'search-spotlight-heading');
    // Meaningful content is NOT aria-hidden
    expect(screen.getByTestId('search-panel').closest('[aria-hidden="true"]')).toBeNull();
    cleanup();
    mockMatchMedia(true);
    render(<NewLandingSearch />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
  });
});
