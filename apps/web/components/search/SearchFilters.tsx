'use client';

import type { SearchResultType, SearchThreadFilter } from '../../lib/search';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelection {
  type: SearchResultType;
  in?: string;
  from?: string;
  afterInput: string;
  beforeInput: string;
  thread: SearchThreadFilter;
}

const RESULT_TYPES: Array<{ value: SearchResultType; label: string }> = [
  { value: 'messages', label: 'Messages' },
  { value: 'users', label: 'People' },
  { value: 'channels', label: 'Channels' },
];

const THREAD_OPTIONS: Array<{ value: SearchThreadFilter; label: string }> = [
  { value: 'include', label: 'Threads included' },
  { value: 'only', label: 'Replies only' },
  { value: 'exclude', label: 'No replies' },
];

const selectClassName =
  'h-8 max-w-44 truncate rounded-md border border-stone-200 bg-white px-2 text-[12px] text-stone-700 focus:border-stone-400 focus:outline-none';

/**
 * Structured search filters. Options come from the caller's existing
 * workspace data (members, accessible channels, conversations) — the backend
 * remains authoritative and re-verifies every filter server-side.
 */
export function SearchFilters({
  selection,
  memberOptions,
  inOptions,
  onChange,
}: {
  selection: FilterSelection;
  memberOptions: FilterOption[];
  inOptions: FilterOption[];
  onChange: (patch: Partial<FilterSelection>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Result type">
        {RESULT_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selection.type === option.value}
            onClick={() => onChange({ type: option.value })}
            className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-stone-400 ${
              selection.type === option.value
                ? 'bg-stone-900 text-white'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selection.type === 'messages' && (
          <>
            <label className="sr-only" htmlFor="search-filter-from">
              Filter by author
            </label>
            <select
              id="search-filter-from"
              value={selection.from ?? ''}
              onChange={(event) => onChange({ from: event.target.value || undefined })}
              className={selectClassName}
            >
              <option value="">Anyone</option>
              {memberOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="search-filter-in">
              Filter by conversation
            </label>
            <select
              id="search-filter-in"
              value={selection.in ?? ''}
              onChange={(event) => onChange({ in: event.target.value || undefined })}
              className={selectClassName}
            >
              <option value="">Everywhere</option>
              {inOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="search-filter-thread">
              Thread replies
            </label>
            <select
              id="search-filter-thread"
              value={selection.thread}
              onChange={(event) => onChange({ thread: event.target.value as SearchThreadFilter })}
              className={selectClassName}
            >
              {THREAD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="search-filter-after">
              After date
            </label>
            <input
              id="search-filter-after"
              type="date"
              value={selection.afterInput}
              max={selection.beforeInput || undefined}
              onChange={(event) => onChange({ afterInput: event.target.value })}
              className="h-8 rounded-md border border-stone-200 bg-white px-2 text-[12px] text-stone-700 focus:border-stone-400 focus:outline-none"
            />
            <label className="sr-only" htmlFor="search-filter-before">
              Before date
            </label>
            <input
              id="search-filter-before"
              type="date"
              value={selection.beforeInput}
              min={selection.afterInput || undefined}
              onChange={(event) => onChange({ beforeInput: event.target.value })}
              className="h-8 rounded-md border border-stone-200 bg-white px-2 text-[12px] text-stone-700 focus:border-stone-400 focus:outline-none"
            />
          </>
        )}
      </div>
    </div>
  );
}
