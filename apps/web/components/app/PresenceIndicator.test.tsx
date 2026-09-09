/**
 * Component tests for PresenceIndicator (Phase 4I.3).
 *
 * Verifies accessible labels, role="status", title tooltips, and visual class assignments.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresenceIndicator } from './PresenceIndicator';

describe('PresenceIndicator', () => {
  it('renders ONLINE status with accessible label and green styling', () => {
    render(<PresenceIndicator status="ONLINE" />);
    const indicator = screen.getByRole('status', { name: 'Online' });
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('title', 'Online');
    expect(indicator).toHaveAttribute('data-testid', 'presence-indicator-online');
    expect(indicator).toHaveClass('bg-emerald-500');
  });

  it('renders OFFLINE status with accessible label and muted styling', () => {
    render(<PresenceIndicator status="OFFLINE" />);
    const indicator = screen.getByRole('status', { name: 'Offline' });
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('title', 'Offline');
    expect(indicator).toHaveAttribute('data-testid', 'presence-indicator-offline');
    expect(indicator).toHaveClass('bg-stone-300');
  });

  it('renders AWAY status with accessible label and amber styling', () => {
    render(<PresenceIndicator status="AWAY" />);
    const indicator = screen.getByRole('status', { name: 'Away' });
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('title', 'Away');
    expect(indicator).toHaveAttribute('data-testid', 'presence-indicator-away');
    expect(indicator).toHaveClass('bg-amber-500');
  });

  it('supports sm and md sizes properly', () => {
    const { rerender } = render(<PresenceIndicator status="ONLINE" size="sm" />);
    expect(screen.getByRole('status', { name: 'Online' })).toHaveClass('h-2', 'w-2');

    rerender(<PresenceIndicator status="ONLINE" size="md" />);
    expect(screen.getByRole('status', { name: 'Online' })).toHaveClass('h-2.5', 'w-2.5');
  });
});
