/**
 * Time-of-day greeting and date helpers (Phase 1D).
 *
 * Pure functions using the real runtime clock — no static design-mode dates.
 */

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function getDayPart(hour: number): DayPart {
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}

export function getGreeting(now: Date = new Date()): string {
  return `Good ${getDayPart(now.getHours())}`;
}

/** e.g. "Tuesday, September 8" in the runtime locale (en-US default). */
export function formatToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);
}

/** First token of a display name for greetings; '' when blank. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
