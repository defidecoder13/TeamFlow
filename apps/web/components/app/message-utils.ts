'use client';

/**
 * Format a message timestamp using a simple, human-readable convention.
 * - Today: "HH:MM"
 * - Yesterday: "Yesterday HH:MM"
 * - Older: "MM/DD/YYYY HH:MM"
 */
export function formatMessageTime(iso: string | Date): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (msgDate.getTime() === today.getTime()) {
    return time;
  }
  if (msgDate.getTime() === yesterday.getTime()) {
    return `Yesterday ${time}`;
  }
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}/${day}/${d.getFullYear()} ${time}`;
}

/**
 * Heuristic for consecutive message grouping: same author and a small
 * time gap means we can skip repeating avatar/name. The UI layer is
 * free to use or ignore this hint; this is only a helper.
 */
export function isConsecutiveSameAuthor(
  previous: { authorId: string; createdAt: string | Date | null } | null,
  current: { authorId: string; createdAt: string | Date | null },
  maxGapMinutes = 5,
): boolean {
  if (!previous) return false;
  if (previous.authorId !== current.authorId) return false;
  if (!previous.createdAt || !current.createdAt) return false;

  const prevMs = new Date(previous.createdAt).getTime();
  const currMs = new Date(current.createdAt).getTime();
  const gapMinutes = (currMs - prevMs) / (1000 * 60);
  return gapMinutes >= 0 && gapMinutes <= maxGapMinutes;
}

/**
 * Format relative time for thread replies (e.g. "just now", "2m ago", "1h ago", "3d ago").
 */
export function formatRelativeTime(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (Number.isNaN(diffMs)) return '';
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Generate human-readable thread summary text.
 * e.g. "3 replies · Last reply 2m ago" or "1 reply · Last reply just now" or "1 reply"
 */
export function formatThreadSummary(
  replyCount: number,
  latestReplyAt?: string | Date | null,
): string {
  if (replyCount <= 0) return '';
  const countLabel = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  if (!latestReplyAt) return countLabel;
  const relTime = formatRelativeTime(latestReplyAt);
  return relTime ? `${countLabel} · Last reply ${relTime}` : countLabel;
}
