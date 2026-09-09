/**
 * Search filter tests (Phase 4G.4): option rendering and change payloads.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchFilters, type FilterSelection } from './SearchFilters';

const SELECTION: FilterSelection = {
  type: 'messages',
  in: undefined,
  from: undefined,
  afterInput: '',
  beforeInput: '',
  thread: 'include',
};

const MEMBERS = [
  { value: 'u-1', label: 'Ada Lovelace' },
  { value: 'u-2', label: 'Grace Hopper' },
];

const SCOPES = [
  { value: 'channel:general', label: '#general' },
  { value: 'dm:dm-1', label: 'Grace Hopper' },
];

describe('SearchFilters', () => {
  it('switches result type with pressed state', () => {
    const onChange = vi.fn();
    render(
      <SearchFilters
        selection={SELECTION}
        memberOptions={MEMBERS}
        inOptions={SCOPES}
        onChange={onChange}
      />,
    );
    const people = screen.getByRole('button', { name: 'People' });
    expect(people).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Messages' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(people);
    expect(onChange).toHaveBeenCalledWith({ type: 'users' });
  });

  it('emits author, scope, thread, and date patches', () => {
    const onChange = vi.fn();
    render(
      <SearchFilters
        selection={SELECTION}
        memberOptions={MEMBERS}
        inOptions={SCOPES}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Filter by author'), { target: { value: 'u-2' } });
    expect(onChange).toHaveBeenCalledWith({ from: 'u-2' });

    fireEvent.change(screen.getByLabelText('Filter by conversation'), {
      target: { value: 'dm:dm-1' },
    });
    expect(onChange).toHaveBeenCalledWith({ in: 'dm:dm-1' });

    fireEvent.change(screen.getByLabelText('Thread replies'), { target: { value: 'only' } });
    expect(onChange).toHaveBeenCalledWith({ thread: 'only' });

    fireEvent.change(screen.getByLabelText('After date'), { target: { value: '2026-09-01' } });
    expect(onChange).toHaveBeenCalledWith({ afterInput: '2026-09-01' });

    fireEvent.change(screen.getByLabelText('Before date'), { target: { value: '2026-09-09' } });
    expect(onChange).toHaveBeenCalledWith({ beforeInput: '2026-09-09' });
  });

  it('hides message-only filters for directory pools', () => {
    render(
      <SearchFilters
        selection={{ ...SELECTION, type: 'users' }}
        memberOptions={MEMBERS}
        inOptions={SCOPES}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Filter by author')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by conversation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute('aria-pressed', 'true');
  });
});
