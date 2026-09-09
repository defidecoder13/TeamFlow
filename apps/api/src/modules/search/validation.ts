/**
 * Search request validation (Phase 4G.3).
 *
 * Strict schemas: only documented parameters pass. Client-supplied
 * workspace/channel/role context is never accepted — identity and
 * authorization always resolve server-side from the session.
 */

import { z } from 'zod';
import { decodeSearchCursor } from './cursor';

export const MAX_SEARCH_QUERY_LENGTH = 200;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 50;
export const MAX_IN_FILTER_LENGTH = 120;

export const searchTypeSchema = z.enum(['messages', 'users', 'channels'], {
  error: 'Search type must be messages, users, or channels.',
});

export const searchThreadSchema = z.enum(['include', 'only', 'exclude'], {
  error: 'Thread filter must be include, only, or exclude.',
});

export type SearchType = z.infer<typeof searchTypeSchema>;
export type SearchThreadFilter = z.infer<typeof searchThreadSchema>;

export type SearchInFilter =
  { kind: 'channel'; slug: string } | { kind: 'dm'; conversationId: string };

/**
 * Parse an `in:` filter value (`channel:<slug>` | `dm:<conversationId>`).
 * Returns null for any other shape — the caller maps that to 400 without
 * touching the database, so malformed filters can never probe for existence.
 */
export function parseInFilter(value: string): SearchInFilter | null {
  if (value.startsWith('channel:')) {
    const slug = value.slice('channel:'.length).trim();
    if (slug.length === 0 || slug.length > MAX_IN_FILTER_LENGTH) {
      return null;
    }
    return { kind: 'channel', slug };
  }
  if (value.startsWith('dm:')) {
    const conversationId = value.slice('dm:'.length).trim();
    if (conversationId.length === 0 || conversationId.length > MAX_IN_FILTER_LENGTH) {
      return null;
    }
    return { kind: 'dm', conversationId };
  }
  return null;
}

export const searchQuerySchema = z
  .object({
    q: z
      .string({ error: 'Enter a search term.' })
      .trim()
      .min(1, 'Enter a search term.')
      .max(MAX_SEARCH_QUERY_LENGTH, 'Search term is too long (200 characters or fewer).'),
    type: searchTypeSchema.default('messages'),
    in: z
      .string()
      .trim()
      .min(1, 'Invalid search scope.')
      .max(3 + MAX_IN_FILTER_LENGTH, 'Invalid search scope.')
      .optional()
      .refine((value) => value === undefined || parseInFilter(value) !== null, {
        message: 'Invalid search scope. Use in:channel:<slug> or in:dm:<conversationId>.',
      }),
    from: z
      .string()
      .trim()
      .min(1, 'Invalid author filter.')
      .max(120, 'Invalid author filter.')
      .optional(),
    after: z.iso.datetime({ error: 'Invalid after date. Use ISO-8601.' }).optional(),
    before: z.iso.datetime({ error: 'Invalid before date. Use ISO-8601.' }).optional(),
    thread: searchThreadSchema.default('include'),
    limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || decodeSearchCursor(value) !== null, {
        message: 'Invalid pagination cursor.',
      }),
  })
  .strict()
  .refine(
    (data) => data.after === undefined || data.before === undefined || data.after <= data.before,
    { message: 'Invalid date range: after must not be later than before.' },
  );

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
