import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingHero } from './NewLandingHero';

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

beforeEach(() => {
  mockMatchMedia(false);
});

describe('NewLandingHero', () => {
  it('renders eyebrow, exactly one H1, supporting copy, and micro trust', () => {
    render(<NewLandingHero />);
    expect(screen.getByText('Introducing TeamFlow 2.0')).toBeInTheDocument();
    expect(screen.getByText('Built for deep team focus')).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(/a calmer way/i);
    expect(h1).toHaveTextContent(/to work together/i);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/without the notification fatigue/i)).toBeInTheDocument();
    expect(screen.getByText(/no credit card/i)).toBeInTheDocument();
  });

  it('Start for free links to /sign-up and See how it works scrolls to features', () => {
    render(<NewLandingHero />);
    expect(screen.getByRole('link', { name: /start for free/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
    // Secondary action is a real anchor — no dead or disabled controls.
    expect(screen.getByRole('link', { name: /see how it works/i })).toHaveAttribute(
      'href',
      '#features',
    );
    expect(screen.queryByRole('button', { name: /book a demo/i })).toBeNull();
  });

  it('renders the workspace mockup with sidebar, channel, and thread content', () => {
    render(<NewLandingHero />);
    const mockup = screen.getByTestId('hero-mockup');
    expect(mockup).toBeInTheDocument();
    expect(mockup).toHaveAttribute('aria-hidden', 'true');
    // Sidebar
    expect(screen.getByText('Acme Studio')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Quiet mode active')).toBeInTheDocument();
    // Channel vocabulary only — no "Spaces" terminology.
    const mockupText = screen.getByTestId('hero-mockup').textContent ?? '';
    expect(mockupText).toMatch(/brand-redesign-v2/);
    expect(mockupText.match(/brand-redesign-v2/g)?.length).toBeGreaterThanOrEqual(2);
    expect(mockupText).toMatch(/Channels/);
    expect(mockupText).not.toMatch(/Spaces/);
    expect(screen.getByText(/ready for another review/i)).toBeInTheDocument();
    expect(screen.getByText(/looks good from my side/i)).toBeInTheDocument();
    // Thread reply card (real product concept — no assistant UI)
    expect(screen.getByText(/replied in thread/i)).toBeInTheDocument();
    expect(screen.getByText(/scheduled for thursday/i)).toBeInTheDocument();
    expect(screen.queryByText('TeamFlow Copilot')).toBeNull();
    // Composer
    expect(screen.getByText(/reply to #brand-redesign-v2/i)).toBeInTheDocument();
  });

  it('keeps decorative elements hidden, headline solid, and CTAs focusable', () => {
    render(<NewLandingHero />);
    const glow = document.querySelector('[data-testid="new-hero"] .blur-3xl');
    expect(glow?.getAttribute('aria-hidden')).toBe('true');
    // Headline is solid ink — no gradient-text treatment.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.querySelector('.bg-clip-text')).toBeNull();
    expect(screen.getByRole('link', { name: /start for free/i }).className).toMatch(
      /focus-visible:outline/,
    );
  });

  it('renders gateway pills linking to real sections', () => {
    render(<NewLandingHero />);
    const list = screen.getByRole('list', { name: /what teamflow brings together/i });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Channels' })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: 'Threads' })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '#solutions');
  });

  it('renders immediately under reduced motion', () => {
    mockMatchMedia(true);
    render(<NewLandingHero />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('hero-mockup')).toBeInTheDocument();
  });
});
