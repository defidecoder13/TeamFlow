/**
 * Presence Registry unit tests (Phase 4I.1).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PresenceRegistry } from './presence';

describe('PresenceRegistry', () => {
  let registry: PresenceRegistry;

  beforeEach(() => {
    registry = new PresenceRegistry();
  });

  it('Case A: single socket connect marks user ONLINE with changed=true', () => {
    const t = registry.addSocket('user-1', 'sock-1');
    expect(t.userId).toBe('user-1');
    expect(t.previousStatus).toBe('OFFLINE');
    expect(t.currentStatus).toBe('ONLINE');
    expect(t.changed).toBe(true);
    expect(registry.isUserOnline('user-1')).toBe(true);
    expect(registry.getSocketCount('user-1')).toBe(1);
    expect(registry.getPresence('user-1')).toEqual({
      userId: 'user-1',
      status: 'ONLINE',
      lastSeenAt: null,
    });
  });

  it('Case B: second socket connect for same user keeps status ONLINE with changed=false', () => {
    registry.addSocket('user-1', 'sock-1');
    const t2 = registry.addSocket('user-1', 'sock-2');

    expect(t2.userId).toBe('user-1');
    expect(t2.previousStatus).toBe('ONLINE');
    expect(t2.currentStatus).toBe('ONLINE');
    expect(t2.changed).toBe(false);
    expect(registry.getSocketCount('user-1')).toBe(2);
  });

  it('Case C: first socket disconnects when multiple sockets exist keeps user ONLINE with changed=false', () => {
    registry.addSocket('user-1', 'sock-1');
    registry.addSocket('user-1', 'sock-2');

    const dt = registry.removeSocket('sock-1');
    expect(dt).not.toBeNull();
    expect(dt?.previousStatus).toBe('ONLINE');
    expect(dt?.currentStatus).toBe('ONLINE');
    expect(dt?.changed).toBe(false);
    expect(registry.isUserOnline('user-1')).toBe(true);
    expect(registry.getSocketCount('user-1')).toBe(1);
  });

  it('Case D: second/last socket disconnects transitions user to OFFLINE with changed=true and sets lastSeenAt', () => {
    registry.addSocket('user-1', 'sock-1');
    registry.addSocket('user-1', 'sock-2');

    registry.removeSocket('sock-1');
    const dt2 = registry.removeSocket('sock-2');

    expect(dt2).not.toBeNull();
    expect(dt2?.previousStatus).toBe('ONLINE');
    expect(dt2?.currentStatus).toBe('OFFLINE');
    expect(dt2?.changed).toBe(true);
    expect(dt2?.lastSeenAt).toBeDefined();
    expect(typeof dt2?.lastSeenAt).toBe('string');
    expect(registry.isUserOnline('user-1')).toBe(false);
    expect(registry.getSocketCount('user-1')).toBe(0);

    const presence = registry.getPresence('user-1');
    expect(presence.status).toBe('OFFLINE');
    expect(presence.lastSeenAt).toBe(dt2?.lastSeenAt);
  });

  it('Case E: repeated disconnect of same socket returns null and does not corrupt state', () => {
    registry.addSocket('user-1', 'sock-1');
    const first = registry.removeSocket('sock-1');
    expect(first?.changed).toBe(true);

    const second = registry.removeSocket('sock-1');
    expect(second).toBeNull();
    expect(registry.getSocketCount('user-1')).toBe(0);
    expect(registry.isUserOnline('user-1')).toBe(false);
  });

  it('Case F: reconnect creates new socket and transitions back to ONLINE', () => {
    registry.addSocket('user-1', 'sock-1');
    registry.removeSocket('sock-1');
    expect(registry.isUserOnline('user-1')).toBe(false);

    const reconnect = registry.addSocket('user-1', 'sock-reconnected');
    expect(reconnect.previousStatus).toBe('OFFLINE');
    expect(reconnect.currentStatus).toBe('ONLINE');
    expect(reconnect.changed).toBe(true);
    expect(registry.isUserOnline('user-1')).toBe(true);
  });

  it('Case G: handles multiple users independently', () => {
    registry.addSocket('user-1', 'sock-u1');
    registry.addSocket('user-2', 'sock-u2');

    expect(registry.isUserOnline('user-1')).toBe(true);
    expect(registry.isUserOnline('user-2')).toBe(true);

    registry.removeSocket('sock-u1');
    expect(registry.isUserOnline('user-1')).toBe(false);
    expect(registry.isUserOnline('user-2')).toBe(true);

    const list = registry.getPresences(['user-1', 'user-2', 'user-3']);
    expect(list).toHaveLength(3);
    expect(list[0].status).toBe('OFFLINE');
    expect(list[1].status).toBe('ONLINE');
    expect(list[2].status).toBe('OFFLINE');
  });

  it('Case H: duplicate addSocket call for same socketId is idempotent and does not increase socket count', () => {
    const t1 = registry.addSocket('user-1', 'sock-1');
    expect(t1.changed).toBe(true);
    expect(registry.getSocketCount('user-1')).toBe(1);

    const t2 = registry.addSocket('user-1', 'sock-1');
    expect(t2.changed).toBe(false);
    expect(registry.getSocketCount('user-1')).toBe(1);
    expect(registry.isUserOnline('user-1')).toBe(true);
  });

  it('Case I: rapid reconnect cycle properly resets lastSeenAt to null', () => {
    registry.addSocket('user-1', 'sock-1');
    const off = registry.removeSocket('sock-1');
    expect(off?.changed).toBe(true);
    expect(off?.currentStatus).toBe('OFFLINE');
    expect(off?.lastSeenAt).toBeDefined();

    const on = registry.addSocket('user-1', 'sock-2');
    expect(on.changed).toBe(true);
    expect(on.currentStatus).toBe('ONLINE');
    expect(registry.getPresence('user-1')).toEqual({
      userId: 'user-1',
      status: 'ONLINE',
      lastSeenAt: null,
    });
  });

  it('Case J: three sockets lifecycle (A disconnects, B disconnects, C remains -> ONLINE, C disconnects -> OFFLINE)', () => {
    registry.addSocket('user-1', 'sock-a');
    registry.addSocket('user-1', 'sock-b');
    registry.addSocket('user-1', 'sock-c');
    expect(registry.getSocketCount('user-1')).toBe(3);
    expect(registry.isUserOnline('user-1')).toBe(true);

    const remA = registry.removeSocket('sock-a');
    expect(remA?.changed).toBe(false);
    expect(remA?.currentStatus).toBe('ONLINE');
    expect(registry.getSocketCount('user-1')).toBe(2);

    const remB = registry.removeSocket('sock-b');
    expect(remB?.changed).toBe(false);
    expect(remB?.currentStatus).toBe('ONLINE');
    expect(registry.getSocketCount('user-1')).toBe(1);

    const remC = registry.removeSocket('sock-c');
    expect(remC?.changed).toBe(true);
    expect(remC?.currentStatus).toBe('OFFLINE');
    expect(registry.getSocketCount('user-1')).toBe(0);
    expect(registry.isUserOnline('user-1')).toBe(false);
  });
});
