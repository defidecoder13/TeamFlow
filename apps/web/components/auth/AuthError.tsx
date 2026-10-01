/**
 * Authentication-level error notice (server/auth failures, not field errors).
 * Announced to assistive technology via role="alert".
 */

export function AuthError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-[#F8D7DA] bg-[#FDF2F2] px-3.5 py-3 text-[13px] leading-snug text-[#991B1B]"
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 16 16"
        className="mt-0.5 h-4 w-4 shrink-0 text-[#BA1A1A]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 5v3.5" strokeLinecap="round" />
        <circle cx="8" cy="10.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
