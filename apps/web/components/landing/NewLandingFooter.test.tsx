import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewLandingFooter } from './NewLandingFooter';

describe('NewLandingFooter', () => {
  it('renders brand, honest navigation, auth links, and copyright', () => {
    render(<NewLandingFooter />);
    expect(screen.getByRole('link', { name: /teamflow home/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /footer navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^product$/i })).toHaveAttribute('href', '#product');
    expect(screen.getByRole('link', { name: /^features$/i })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: /^solutions$/i })).toHaveAttribute(
      'href',
      '#solutions',
    );
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByRole('link', { name: /start free/i })).toHaveAttribute('href', '/sign-up');
    expect(screen.getByText(/© 2026 teamflow\. all rights reserved/i)).toBeInTheDocument();
    expect(screen.getByTestId('landing-footer')).toBeInTheDocument();
  });

  it('contains no dead or unsupported links', () => {
    render(<NewLandingFooter />);
    const footer = screen.getByTestId('landing-footer');
    const hrefs = Array.from(footer.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    const allowed = ['#product', '#features', '#solutions', '/', '/sign-in', '/sign-up'];
    for (const href of hrefs) {
      expect(href).not.toBe('#');
      expect(allowed).toContain(href);
    }
    // No dead destinations: pricing/docs/legal/social/changelog.
    for (const label of [
      /^pricing$/i,
      /^docs$/i,
      /changelog/i,
      /careers/i,
      /press/i,
      /security/i,
      /compliance/i,
      /github/i,
      /discord/i,
      /privacy/i,
      /terms/i,
    ]) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
    expect(footer.querySelector('img')).toBeNull();
  });

  it('uses semantic footer landmark with visible focus states', () => {
    render(<NewLandingFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toMatch(/focus-visible:outline/);
    }
  });
});
