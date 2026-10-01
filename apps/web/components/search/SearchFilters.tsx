'use client';

import { Filter } from 'lucide-react';
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
  'h-8 max-w-44 truncate rounded-[6px] border border-[#E4E2DF] bg-[#F6F5F3] px-2 text-[12px] text-[#171A21] outline-none transition-colors hover:border-[#D2D0CC] focus:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5]';

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
    <div className="flex flex-col gap-2.5" role="group" aria-label="Search filters">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Result type">
        {RESULT_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selection.type === option.value}
            onClick={() => onChange({ type: option.value })}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-[8px] border transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#3157D5] ${
              selection.type === option.value
                ? 'bg-white border-[#171A21] text-[#171A21] shadow-2xs font-semibold'
                : 'bg-transparent border-[#E4E2DF] text-[#737782] hover:text-[#171A21] hover:bg-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {selection.type === 'messages' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-[#E4E2DF] rounded-[10px] text-[13px] w-full">
            <div className="flex items-center gap-1.5 text-[#737782]">
              <Filter className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">Filters:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[12px] text-[#737782]" htmlFor="search-filter-from">
                From:
              </label>
              <select
                id="search-filter-from"
                aria-label="Filter by author"
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

              <label className="text-[12px] text-[#737782]" htmlFor="search-filter-in">
                In:
              </label>
              <select
                id="search-filter-in"
                aria-label="Filter by conversation"
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

              <label className="text-[12px] text-[#737782]" htmlFor="search-filter-thread">
                Thread:
              </label>
              <select
                id="search-filter-thread"
                aria-label="Thread replies"
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
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[12px] text-[#737782]" htmlFor="search-filter-after">
                After:
              </label>
              <input
                id="search-filter-after"
                aria-label="After date"
                type="date"
                value={selection.afterInput}
                max={selection.beforeInput || undefined}
                onChange={(event) => onChange({ afterInput: event.target.value })}
                className="h-8 rounded-[6px] border border-[#E4E2DF] bg-[#F6F5F3] px-2 text-[12px] text-[#171A21] outline-none transition-colors hover:border-[#D2D0CC] focus:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              />
              <label className="text-[12px] text-[#737782]" htmlFor="search-filter-before">
                Before:
              </label>
              <input
                id="search-filter-before"
                aria-label="Before date"
                type="date"
                value={selection.beforeInput}
                min={selection.afterInput || undefined}
                onChange={(event) => onChange({ beforeInput: event.target.value })}
                className="h-8 rounded-[6px] border border-[#E4E2DF] bg-[#F6F5F3] px-2 text-[12px] text-[#171A21] outline-none transition-colors hover:border-[#D2D0CC] focus:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
