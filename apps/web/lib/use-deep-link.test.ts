/**
 * Deep-link tests (Phase 4G.5): param parsing/consumption, scroll helper
 * safety, and the seek state machine (idle/seeking/found/missing, page cap,
 * error handling, duplicate-effect protection).
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeDeepLinkParams,
  MAX_SEEK_PAGES,
  scrollToMessage,
  useDeepLink,
  useSeekMessage,
} from './use-deep-link';

function setSearch(query: string) {
  window.history.replaceState(null, '', `/app/channels/general${query}`);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/app/channels/general');
});

describe('useDeepLink', () => {
  it('reads message and reply params', () => {
    setSearch('?message=m-1&reply=r-2');
    const { result } = renderHook(() => useDeepLink());
    expect(result.current).toEqual({ messageId: 'm-1', replyId: 'r-2' });
  });

  it('returns empty links without params and ignores blanks', () => {
    const { result } = renderHook(() => useDeepLink());
    expect(result.current).toEqual({ messageId: null, replyId: null });

    setSearch('?message=%20&reply=');
    const { result: second } = renderHook(() => useDeepLink());
    expect(second.current).toEqual({ messageId: null, replyId: null });
  });
});

describe('consumeDeepLinkParams', () => {
  it('drops handled params without adding history entries', () => {
    setSearch('?message=m-1&reply=r-2&other=keep');
    const lengthBefore = window.history.length;
    consumeDeepLinkParams();
    expect(window.location.search).toBe('?other=keep');
    expect(window.history.length).toBe(lengthBefore);
  });

  it('is a no-op without deep-link params', () => {
    setSearch('?other=keep');
    consumeDeepLinkParams();
    expect(window.location.search).toBe('?other=keep');
  });
});

describe('scrollToMessage', () => {
  it('returns false for missing or hostile ids without throwing', () => {
    expect(scrollToMessage('absent-id')).toBe(false);
    expect(scrollToMessage('"><img src=x onerror=alert(1)>')).toBe(false);
    expect(scrollToMessage('')).toBe(false);
  });

  it('returns true when the anchor exists', () => {
    const element = document.createElement('div');
    element.setAttribute('data-message-id', 'm-1');
    document.body.appendChild(element);
    try {
      expect(scrollToMessage('m-1')).toBe(true);
    } finally {
      element.remove();
    }
  });
});

describe('useSeekMessage', () => {
  const base = {
    hasMore: true,
    isLoadingOlder: false,
    loadOlderError: null as string | null,
    loadOlder: () => {},
  };

  it('is idle without an active target', () => {
    const { result } = renderHook(() =>
      useSeekMessage({ ...base, active: false, targetId: 'm-1', messages: [] }),
    );
    expect(result.current).toBe('idle');

    const { result: noTarget } = renderHook(() =>
      useSeekMessage({ ...base, active: true, targetId: null, messages: [] }),
    );
    expect(noTarget.current).toBe('idle');
  });

  it('reports found immediately when the target is loaded', () => {
    const loadOlder = vi.fn();
    const { result } = renderHook(() =>
      useSeekMessage({
        ...base,
        active: true,
        targetId: 'm-2',
        messages: [{ id: 'm-1' }, { id: 'm-2' }],
        loadOlder,
      }),
    );
    expect(result.current).toBe('found');
    expect(loadOlder).not.toHaveBeenCalled();
  });

  it('pages back until the target loads, then stops', () => {
    const loadOlder = vi.fn();
    const { result, rerender } = renderHook(
      ({ messages, hasMore, isLoadingOlder }) =>
        useSeekMessage({
          active: true,
          targetId: 'm-9',
          messages,
          hasMore,
          isLoadingOlder,
          loadOlderError: null,
          loadOlder,
        }),
      {
        initialProps: {
          messages: [{ id: 'm-1' }] as Array<{ id: string }>,
          hasMore: true,
          isLoadingOlder: false,
        },
      },
    );
    expect(result.current).toBe('seeking');
    expect(loadOlder).toHaveBeenCalledTimes(1);

    // Loading in flight: no duplicate trigger.
    rerender({ messages: [{ id: 'm-1' }], hasMore: true, isLoadingOlder: true });
    expect(result.current).toBe('seeking');
    expect(loadOlder).toHaveBeenCalledTimes(1);

    // Page arrived without the target: exactly one more request.
    rerender({ messages: [{ id: 'm-1' }, { id: 'm-2' }], hasMore: true, isLoadingOlder: false });
    expect(result.current).toBe('seeking');
    expect(loadOlder).toHaveBeenCalledTimes(2);

    // Target arrives: found, no further requests.
    rerender({
      messages: [{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-9' }],
      hasMore: true,
      isLoadingOlder: false,
    });
    expect(result.current).toBe('found');
    expect(loadOlder).toHaveBeenCalledTimes(2);
  });

  it('resolves missing on exhausted history, errors, or the page cap', () => {
    const loadOlder = vi.fn();
    const { result, rerender } = renderHook(
      ({ messages, hasMore, loadOlderError }) =>
        useSeekMessage({
          active: true,
          targetId: 'gone',
          messages,
          hasMore,
          isLoadingOlder: false,
          loadOlderError,
          loadOlder,
        }),
      {
        initialProps: {
          messages: [{ id: 'm-1' }] as Array<{ id: string }>,
          hasMore: true,
          loadOlderError: null as string | null,
        },
      },
    );
    expect(result.current).toBe('seeking');

    rerender({ messages: [{ id: 'm-1' }], hasMore: false, loadOlderError: null });
    expect(result.current).toBe('missing');

    rerender({ messages: [{ id: 'm-1' }], hasMore: true, loadOlderError: 'boom' });
    expect(result.current).toBe('missing');
  });

  it('stops paging at the cap even with endless history', () => {
    const loadOlder = vi.fn();
    let messages: Array<{ id: string }> = [{ id: 'm-0' }];
    let loading = false;
    const { result, rerender } = renderHook(() =>
      useSeekMessage({
        active: true,
        targetId: 'never',
        messages,
        hasMore: true,
        isLoadingOlder: loading,
        loadOlderError: null,
        loadOlder,
      }),
    );
    expect(result.current).toBe('seeking');
    for (let page = 0; page < MAX_SEEK_PAGES + 3; page++) {
      messages = [...messages, { id: `m-page-${page}` }];
      loading = true;
      rerender();
      loading = false;
      rerender();
    }
    expect(loadOlder).toHaveBeenCalledTimes(MAX_SEEK_PAGES);
    expect(result.current).toBe('missing');
  });
});
