import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, slugify, withSlugSuffix } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Acme Studio')).toBe('acme-studio');
  });

  it('strips unsupported characters and collapses hyphens', () => {
    expect(slugify('  Acme__Studio!!  ')).toBe('acme-studio');
    expect(slugify('a---b')).toBe('a-b');
  });

  it('removes leading and trailing hyphens', () => {
    expect(slugify('--Acme--')).toBe('acme');
  });

  it('falls back for names with no usable characters', () => {
    expect(slugify('!!!')).toBe('workspace');
    expect(slugify('   ')).toBe('workspace');
  });

  it('is deterministic for the same input', () => {
    expect(slugify('Acme Studio')).toBe(slugify('Acme Studio'));
  });

  it('caps length without trailing hyphens', () => {
    const slug = slugify(`${'a'.repeat(MAX_SLUG_LENGTH + 20)}-`);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('withSlugSuffix', () => {
  it('appends numeric collision suffixes', () => {
    expect(withSlugSuffix('acme-studio', 2)).toBe('acme-studio-2');
    expect(withSlugSuffix('acme-studio', 3)).toBe('acme-studio-3');
  });

  it('keeps the result within the length cap', () => {
    const base = 'a'.repeat(MAX_SLUG_LENGTH);
    const suffixed = withSlugSuffix(base, 2);
    expect(suffixed.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(suffixed.endsWith('-2')).toBe(true);
  });
});
