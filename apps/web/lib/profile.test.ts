import { describe, expect, it, vi } from 'vitest';
import { updateProfile, validateProfileImage, validateProfileName } from './profile';

describe('validateProfileName', () => {
  it('requires non-blank', () => {
    expect(validateProfileName('')).toBe('Display name is required.');
    expect(validateProfileName('   ')).toBe('Display name is required.');
  });
  it('enforces max 100', () => {
    expect(validateProfileName('a'.repeat(100))).toBeNull();
    expect(validateProfileName('a'.repeat(101))).toBe('Use 100 characters or fewer.');
  });
  it('accepts normal', () => expect(validateProfileName('Alice')).toBeNull());
});

describe('validateProfileImage', () => {
  it('allows empty (remove)', () => {
    expect(validateProfileImage('')).toBeNull();
    expect(validateProfileImage('   ')).toBeNull();
  });
  it('rejects non-url', () => {
    expect(validateProfileImage('not-a-url')).toBe('Enter a valid image URL.');
    expect(validateProfileImage('ftp://example.com/a.jpg')).toBe('Enter a valid image URL.');
  });
  it('rejects too long', () => {
    expect(validateProfileImage('https://example.com/' + 'a'.repeat(2048))).toMatch(/2048/);
  });
  it('accepts https', () =>
    expect(validateProfileImage('https://example.com/avatar.jpg')).toBeNull());
  it('accepts a well-formed jpeg data URL under the cap', () => {
    const payload = 'data:image/jpeg;base64,' + 'AAAA'.repeat(10);
    expect(validateProfileImage(payload)).toBeNull();
  });
  it('rejects malformed or oversized data URLs', () => {
    expect(validateProfileImage('data:image/svg+xml;base64,AAAA')).toBe('Enter a valid image.');
    expect(validateProfileImage('data:image/jpeg;base64,not base64!!')).toBe('Enter a valid image.');
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(400_001);
    expect(validateProfileImage(huge)).toBe('Profile photo is too large.');
  });
});

describe('updateProfile', () => {
  const apiBase = 'http://localhost:4000';
  const user = {
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    image: null,
    emailVerified: true,
  };
  it('sends name+image and returns user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 200, ok: true, json: async () => ({ user }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      updateProfile(apiBase, { name: 'Alice Updated', image: 'https://example.com/a.jpg' }),
    ).resolves.toEqual({ ok: true, user });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body).toEqual({ name: 'Alice Updated', image: 'https://example.com/a.jpg' });
    vi.unstubAllGlobals();
  });
  it('handles validation 400, unauthenticated 401, notFound 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ error: { message: 'Bad' } }),
      }),
    );
    await expect(updateProfile(apiBase, { name: '' })).resolves.toMatchObject({
      ok: false,
      kind: 'validation',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(updateProfile(apiBase, { name: 'A' })).resolves.toMatchObject({
      ok: false,
      kind: 'unauthenticated',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(updateProfile(apiBase, { name: 'A' })).resolves.toMatchObject({
      ok: false,
      kind: 'notFound',
    });
    vi.unstubAllGlobals();
  });
  it('reports failed on network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(updateProfile(apiBase, { name: 'A' })).resolves.toMatchObject({
      ok: false,
      kind: 'failed',
    });
    vi.unstubAllGlobals();
  });
});
