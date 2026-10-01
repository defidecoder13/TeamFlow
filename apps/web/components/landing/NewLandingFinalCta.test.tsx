import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingFinalCta } from './NewLandingFinalCta';

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

describe('NewLandingFinalCta', () => {
  it('renders exact copy with one h2 and both CTAs', () => {
    render(<NewLandingFinalCta />);
    expect(screen.getByText('Ready when you are')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /bring clarity to your workspace today/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/one calm workspace/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get started free/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByTestId('final-cta')).toBeInTheDocument();
  });

  it('contains no forms, OAuth buttons, or trust badges', () => {
    render(<NewLandingFinalCta />);
    const section = screen.getByTestId('final-cta');
    expect(section.querySelector('form, input')).toBeNull();
    expect(section.textContent).not.toMatch(/apple|google|github|oauth/i);
    expect(section.textContent).not.toMatch(/soc2|gdpr|sla|99\.99/i);
    expect(section.textContent).not.toMatch(/under 2 minutes|thousands/i);
    expect(section.querySelector('img')).toBeNull();
  });

  it('uses the dark panel with visible focus states and renders under reduced motion', () => {
    render(<NewLandingFinalCta />);
    const panel = screen.getByTestId('final-cta-panel');
    expect(panel.className).toMatch(/bg-\[#151515\]/);
    expect(screen.getByRole('link', { name: /get started free/i }).className).toMatch(
      /focus-visible:outline/,
    );
    expect(screen.getByTestId('final-cta')).toHaveAttribute('aria-labelledby', 'final-cta-heading');
  });
});
