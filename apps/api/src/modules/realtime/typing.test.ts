/**
 * Typing State Registry Unit Tests (Phase 4I.4).
 *
 * Tests:
 * 1. Single socket typing:start transitions to isTyping=true with changed=true
 * 2. Repeated typing:start for same socket/container refreshes expiry with changed=false
 * 3. typing:stop transitions to isTyping=false with changed=true
 * 4. Timer expiry triggers callback with transition changed=true
 * 5. Stale timer does not stop refreshed typing session
 * 6. Multi-socket / multi-tab: stop on tab 1 keeps user typing if tab 2 is still active
 * 7. Multi-socket: final socket stop transitions user to not typing
 * 8. Socket disconnect cleans up only that socket's typing states
 * 9. Cross-container isolation (channel vs DM vs another channel)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypingRegistry, type TypingTransition } from './typing';

describe('TypingRegistry (Unit)', () => {
  let registry: TypingRegistry;
  let stoppedEvents: TypingTransition[];

  beforeEach(() => {
    vi.useFakeTimers();
    stoppedEvents = [];
    registry = new TypingRegistry({
      timeoutMs: 3000,
      onUserStoppedTyping: (transition) => stoppedEvents.push(transition),
    });
  });

  afterEach(() => {
    registry.clear();
    vi.useRealTimers();
  });

  it('1. Single socket typing:start transitions to isTyping=true with changed=true', () => {
    const t = registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
    expect(t).toEqual<TypingTransition>({
      userId: 'u-1',
      containerType: 'channel',
      containerId: 'ch-1',
      changed: true,
      isTyping: true,
    });
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(true);
  });

  it('2. Repeated typing:start for same socket/container refreshes timer with changed=false', () => {
    const t1 = registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
    expect(t1.changed).toBe(true);

    vi.advanceTimersByTime(2000);

    // Refresh typing at 2000ms
    const t2 = registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
    expect(t2.changed).toBe(false);
    expect(t2.isTyping).toBe(true);

    // Advance 1500ms (total 3500ms from start, but only 1500ms from refresh)
    vi.advanceTimersByTime(1500);
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(true);
    expect(stoppedEvents).toHaveLength(0);

    // Advance remaining 1501ms (total 3001ms from refresh) -> timeout fires
    vi.advanceTimersByTime(1501);
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(false);
    expect(stoppedEvents).toHaveLength(1);
    expect(stoppedEvents[0]).toEqual<TypingTransition>({
      userId: 'u-1',
      containerType: 'channel',
      containerId: 'ch-1',
      changed: true,
      isTyping: false,
    });
  });

  it('3. Explicit typing:stop transitions to isTyping=false with changed=true', () => {
    registry.startTyping('u-1', 'sock-1', 'direct_message', 'dm-1');
    expect(registry.isUserTyping('u-1', 'direct_message', 'dm-1')).toBe(true);

    const stop = registry.stopTyping('u-1', 'sock-1', 'direct_message', 'dm-1');
    expect(stop).toEqual<TypingTransition>({
      userId: 'u-1',
      containerType: 'direct_message',
      containerId: 'dm-1',
      changed: true,
      isTyping: false,
    });
    expect(registry.isUserTyping('u-1', 'direct_message', 'dm-1')).toBe(false);

    // After timer would have elapsed, no extra timeout event
    vi.advanceTimersByTime(3500);
    expect(stoppedEvents).toHaveLength(0);
  });

  it('4. Multi-socket / multi-tab: stop on tab 1 keeps user typing if tab 2 is still active', () => {
    registry.startTyping('u-1', 'tab-1', 'channel', 'ch-1');
    const t2 = registry.startTyping('u-1', 'tab-2', 'channel', 'ch-1');
    expect(t2.changed).toBe(false);

    // Tab 1 stops typing
    const stopTab1 = registry.stopTyping('u-1', 'tab-1', 'channel', 'ch-1');
    expect(stopTab1.changed).toBe(false);
    expect(stopTab1.isTyping).toBe(true);
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(true);

    // Tab 2 stops typing (final socket)
    const stopTab2 = registry.stopTyping('u-1', 'tab-2', 'channel', 'ch-1');
    expect(stopTab2.changed).toBe(true);
    expect(stopTab2.isTyping).toBe(false);
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(false);
  });

  it('5. Socket disconnect cleans up all typing states for that socket', () => {
    registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
    registry.startTyping('u-1', 'sock-1', 'direct_message', 'dm-1');
    registry.startTyping('u-1', 'sock-2', 'channel', 'ch-1'); // tab 2 also in ch-1

    const transitions = registry.handleSocketDisconnect('sock-1');
    // sock-1 disconnected:
    // in ch-1: sock-2 is still typing, so user is still typing in ch-1 -> changed=false (not in returned transitions)
    // in dm-1: sock-1 was the only socket, so user stopped typing in dm-1 -> changed=true
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toEqual<TypingTransition>({
      userId: 'u-1',
      containerType: 'direct_message',
      containerId: 'dm-1',
      changed: true,
      isTyping: false,
    });

    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(true);
    expect(registry.isUserTyping('u-1', 'direct_message', 'dm-1')).toBe(false);
  });

  it('6. Cross-container isolation', () => {
    registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(true);
    expect(registry.isUserTyping('u-1', 'channel', 'ch-2')).toBe(false);
    expect(registry.isUserTyping('u-1', 'direct_message', 'dm-1')).toBe(false);
  });

  it('7. Rapid event spam: 100 rapid startTyping calls result in only 1 initial changed=true and 1 final timeout callback', () => {
    let changedCount = 0;
    for (let i = 0; i < 100; i++) {
      const t = registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
      if (t.changed) changedCount++;
    }
    expect(changedCount).toBe(1);
    expect(stoppedEvents).toHaveLength(0);

    // After 3000ms from last burst
    vi.advanceTimersByTime(3001);
    expect(stoppedEvents).toHaveLength(1);
    expect(registry.isUserTyping('u-1', 'channel', 'ch-1')).toBe(false);
  });

  it('8. Timeout race: typing:start -> explicit typing:stop -> old timer fires does NOT emit duplicate stopped event', () => {
    registry.startTyping('u-1', 'sock-1', 'channel', 'ch-1');
    const stop = registry.stopTyping('u-1', 'sock-1', 'channel', 'ch-1');
    expect(stop.changed).toBe(true);

    // Old timer expiry
    vi.advanceTimersByTime(5000);
    expect(stoppedEvents).toHaveLength(0);
  });
});
