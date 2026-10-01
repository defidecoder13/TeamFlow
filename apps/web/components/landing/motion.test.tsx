import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInViewOnce, usePrefersReducedMotion, useScrollReveal } from './motion';

function mockMatchMedia(matches: boolean) {
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

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

function mockIntersectionObserver() {
  const observed: Element[] = [];
  let callback: ObserverCallback | null = null;
  const disconnect = vi.fn();
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((cb: ObserverCallback) => {
      callback = cb;
      return {
        observe: (el: Element) => observed.push(el),
        unobserve: vi.fn(),
        disconnect,
      };
    }),
  });
  return {
    observed,
    disconnect,
    fire: (isIntersecting: boolean) => {
      act(() => {
        callback?.([{ isIntersecting }]);
      });
    },
  };
}

beforeEach(() => {
  mockMatchMedia(false);
});

describe('usePrefersReducedMotion', () => {
  it('reflects the media query', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    mockMatchMedia(true);
    const { result: reduced } = renderHook(() => usePrefersReducedMotion());
    expect(reduced.current).toBe(true);
  });
});

describe('useInViewOnce', () => {
  it('is visible immediately when IntersectionObserver is unavailable', () => {
    const original = window.IntersectionObserver;
    // @ts-expect-error — simulate environments without IntersectionObserver
    delete window.IntersectionObserver;
    const { result } = renderHook(() => useInViewOnce());
    expect(result.current.inView).toBe(true);
    expect(result.current.ref.current).toBeNull();
    window.IntersectionObserver = original;
  });

  it('stays hidden until intersecting, then disconnects', () => {
    const io = mockIntersectionObserver();
    function Probe() {
      const { ref, inView } = useInViewOnce<HTMLDivElement>();
      return <div ref={ref}>{inView ? 'in' : 'out'}</div>;
    }
    render(<Probe />);
    expect(screen.getByText('out')).toBeInTheDocument();
    io.fire(false);
    expect(screen.getByText('out')).toBeInTheDocument();
    io.fire(true);
    expect(screen.getByText('in')).toBeInTheDocument();
    expect(io.disconnect).toHaveBeenCalled();
  });
});

describe('useScrollReveal', () => {
  it('is visible immediately under reduced motion without observing', () => {
    mockMatchMedia(true);
    const observe = vi.fn();
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        observe,
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useScrollReveal());
    expect(result.current.visible).toBe(true);
    expect(result.current.reduced).toBe(true);
  });

  it('follows intersection otherwise', () => {
    const io = mockIntersectionObserver();
    function Probe() {
      const { ref, visible } = useScrollReveal<HTMLDivElement>();
      return <div ref={ref}>{visible ? 'shown' : 'hidden'}</div>;
    }
    render(<Probe />);
    expect(screen.getByText('hidden')).toBeInTheDocument();
    io.fire(true);
    expect(screen.getByText('shown')).toBeInTheDocument();
  });
});
