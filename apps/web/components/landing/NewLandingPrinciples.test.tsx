import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingPrinciples } from './NewLandingPrinciples';

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

describe('NewLandingPrinciples', () => {
  it('renders three honest principles and nothing invented', () => {
    render(<NewLandingPrinciples />);
    expect(screen.getByText("Real-time when you're online")).toBeInTheDocument();
    expect(screen.getByText("Calm when you're not")).toBeInTheDocument();
    expect(screen.getByText('Search that respects permissions')).toBeInTheDocument();
    expect(screen.getByTestId('principles')).toBeInTheDocument();
    // No invented brands, metrics, or social proof.
    const text = screen.getByTestId('principles').textContent ?? '';
    expect(text).not.toMatch(/trusted by|acme|vesper|horizon|monolith|pulse/i);
    expect(text).not.toMatch(/%|members|teams building/i);
  });

  it('uses no images and contains no links or buttons', () => {
    render(<NewLandingPrinciples />);
    const section = screen.getByTestId('principles');
    expect(section.querySelector('img')).toBeNull();
    expect(section.querySelector('svg')).toBeNull();
    expect(section.querySelector('a, button')).toBeNull();
  });

  it('has a responsive three-column grid and renders under reduced motion', () => {
    render(<NewLandingPrinciples />);
    const list = screen.getByRole('list');
    expect(list.className).toMatch(/grid-cols-1/);
    expect(list.className).toMatch(/md:grid-cols-3/);
    mockMatchMedia(true);
    render(<NewLandingPrinciples />);
    expect(screen.getAllByTestId('principles').length).toBeGreaterThan(0);
  });
});
