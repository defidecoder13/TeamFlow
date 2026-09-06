/**
 * URL-safe workspace slug utilities (Phase 2A).
 *
 * Pure and deterministic: the same name always yields the same base slug.
 * Global uniqueness is enforced by the database unique constraint — callers
 * must treat constraint conflicts (P2002) as the authority and retry with
 * `withSlugSuffix`, never rely on a read-before-write check alone.
 */

export const MAX_SLUG_LENGTH = 60;
const FALLBACK_SLUG = 'workspace';

/** Lowercase, URL-safe slug: spaces/underscores become hyphens, the rest is stripped. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

/** Collision candidate: `acme-studio` → `acme-studio-2`. Length-capped. */
export function withSlugSuffix(base: string, attempt: number): string {
  const suffix = `-${attempt}`;
  const trimmed = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '');
  return `${trimmed.length > 0 ? trimmed : FALLBACK_SLUG}${suffix}`;
}
