import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingValuePillars } from './NewLandingValuePillars';

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

describe('NewLandingValuePillars', () => {
  it('renders heading and supporting text with no badge kicker', () => {
    render(<NewLandingValuePillars />);
    expect(
      screen.getByRole('heading', { level: 2, name: /most precious asset/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/another source of noise/i)).toBeInTheDocument();
    expect(screen.queryByText('Peaceful productivity')).toBeNull();
    expect(screen.getByTestId('value-pillars')).toBeInTheDocument();
  });

  it('renders exactly three editorial rows with titles, descriptions, and icons', () => {
    render(<NewLandingValuePillars />);
    expect(screen.getByText('Channels that stay on topic')).toBeInTheDocument();
    expect(screen.getByText('Search with permission built in')).toBeInTheDocument();
    expect(screen.getByText('Real-time and async in harmony')).toBeInTheDocument();
    expect(screen.getByText(/organized around the work that matters/i)).toBeInTheDocument();
    expect(screen.getByText(/limited to what you can see/i)).toBeInTheDocument();
    expect(screen.getByText(/catch up from where you left off/i)).toBeInTheDocument();
    expect(screen.getByTestId('pillar-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('pillar-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('pillar-card-3')).toBeInTheDocument();
    expect(screen.queryByTestId('pillar-card-4')).toBeNull();
    // Product vocabulary only: channels and search, never "Spaces" or assistant UI.
    const sectionText = screen.getByTestId('value-pillars').textContent ?? '';
    expect(sectionText).not.toMatch(/Spaces/);
    expect(sectionText).not.toMatch(/Copilot|AI Intelligence/);
    // Inline SVG icons, hidden from assistive tech
    const svgs = screen.getByTestId('value-pillars').querySelectorAll('svg');
    expect(svgs.length).toBe(3);
    for (const svg of Array.from(svgs)) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('uses hairline-divided rows instead of cards, with no links', () => {
    render(<NewLandingValuePillars />);
    const list = screen.getByTestId('value-pillars').querySelector('ul')!;
    expect(list.className).toMatch(/border-t/);
    expect(screen.getByTestId('pillar-card-1').className).toMatch(/border-b/);
    expect(screen.getByTestId('pillar-card-1').className).toMatch(/md:grid-cols-12/);
    // No fake destinations
    expect(screen.getByTestId('value-pillars').querySelector('a, button')).toBeNull();
  });

  it('renders immediately under reduced motion', () => {
    mockMatchMedia(true);
    render(<NewLandingValuePillars />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('pillar-card-2')).toBeInTheDocument();
  });
});
