import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamFlowLogo } from './TeamFlowLogo';

describe('TeamFlowLogo', () => {
  it('renders mark and wordmark', () => {
    render(<TeamFlowLogo />);
    expect(screen.getByText('TeamFlow')).toBeInTheDocument();
    // SVG mark
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 20 20');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides wordmark when showWordmark false', () => {
    render(<TeamFlowLogo showWordmark={false} />);
    expect(screen.queryByText('TeamFlow')).not.toBeInTheDocument();
    // aria-label on container
    expect(screen.getByLabelText('TeamFlow')).toBeInTheDocument();
  });

  it('is monochrome currentColor and ~20px', () => {
    render(<TeamFlowLogo size={20} />);
    const svg = document.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
    // Color is inherited (currentColor) — no hardcoded identity color.
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.innerHTML).toMatch(/currentColor/);
    expect(svg.getAttribute('class') ?? '').not.toMatch(/#151515/);
  });
});
