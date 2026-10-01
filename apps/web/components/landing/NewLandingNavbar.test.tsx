import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingNavbar } from './NewLandingNavbar';

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
  Object.defineProperty(window, 'scrollY', { writable: true, value: 0 });
});

describe('NewLandingNavbar', () => {
  it('renders logo, nav links, actions, and decorative avatar', () => {
    render(<NewLandingNavbar />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /teamflow home/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^product$/i })).toHaveAttribute('href', '#product');
    expect(screen.getByRole('link', { name: /^features$/i })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: /^solutions$/i })).toHaveAttribute(
      'href',
      '#solutions',
    );
    // No dead routes: Pricing and Docs have no destinations and are omitted.
    expect(screen.queryByRole('link', { name: /^pricing$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^docs$/i })).toBeNull();
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByRole('link', { name: /start free/i })).toHaveAttribute('href', '/sign-up');
    // Product is the active item
    expect(screen.getByRole('link', { name: /^product$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Avatar is decorative, not an interactive control
    const avatar = screen.getByTestId('navbar-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar.tagName).not.toBe('A');
    expect(avatar.tagName).not.toBe('BUTTON');
  });

  it('Start Free is the primary button and Sign In is text-only', () => {
    render(<NewLandingNavbar />);
    const cta = screen.getByRole('link', { name: /start free/i });
    expect(cta.className).toMatch(/bg-black/);
    expect(cta).toHaveTextContent('→');
    const signIn = screen.getByRole('link', { name: /^sign in$/i });
    expect(signIn.className).not.toMatch(/bg-black/);
  });

  it('mobile menu button toggles aria-expanded and opens the dialog', async () => {
    const user = userEvent.setup();
    render(<NewLandingNavbar />);
    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'new-landing-mobile-menu');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-label', 'Close menu');
    const dialog = screen.getByRole('dialog', { name: /mobile navigation/i });
    expect(within(dialog).getByRole('link', { name: /^product$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /^sign in$/i })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    expect(within(dialog).getByRole('link', { name: /start free/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('overlay click closes the menu', async () => {
    const user = userEvent.setup();
    render(<NewLandingNavbar />);
    const button = screen.getByRole('button', { name: /open menu/i });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const overlay = document.querySelector('div[aria-hidden="false"].fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape closes the menu and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<NewLandingNavbar />);
    const button = screen.getByRole('button', { name: /open menu/i });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(button);
  });

  it('hides the mobile menu from sight, pointer, and keyboard when closed', () => {
    render(<NewLandingNavbar />);
    const panel = document.getElementById('new-landing-mobile-menu')!;
    expect(panel.className).toMatch(/invisible/);
    expect(panel.className).toMatch(/pointer-events-none/);
    expect(panel).toHaveAttribute('inert');
  });

  it('uses semantic structure, focus styles, touch targets, and reduced-motion guards', () => {
    render(<NewLandingNavbar />);
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('href');
      expect(link.className).toMatch(/focus-visible:outline/);
    }
    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button.className).toMatch(/h-11/);
    expect(button.className).toMatch(/w-11/);
    // Reduced-motion guards present on animated elements
    expect(button.className).toMatch(/motion-reduce:transition-none/);
    expect(screen.getByRole('link', { name: /start free/i }).className).toMatch(
      /motion-reduce:transition-none/,
    );
  });
});
