/**
 * Workspace Home content for /app (Phase 1D).
 *
 * Identity (name) is real session data. Everything else is honest shell:
 * upcoming actions are disabled with explanations, and Recent activity is a
 * genuine empty state — never fake data.
 */

import type { SessionUser } from '../../lib/auth-guard';
import { firstNameOf, formatToday, getGreeting } from '../../lib/greeting';

function UpcomingButton({ label, title }: { label: string; title: string }) {
  return (
    <button
      type="button"
      disabled
      title={title}
      className="inline-flex h-9 items-center justify-center rounded-lg bg-stone-900 px-3.5 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
    >
      {label}
    </button>
  );
}

function OnboardingCard({
  title,
  description,
  action,
  actionTitle,
}: {
  title: string;
  description: string;
  action: string;
  actionTitle: string;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h3 className="text-[13px] font-semibold text-stone-900">{title}</h3>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-stone-500">{description}</p>
      <button
        type="button"
        disabled
        title={actionTitle}
        className="mt-3 inline-flex items-center text-[13px] font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {action}
        <span aria-hidden="true" className="ml-1">
          →
        </span>
      </button>
    </section>
  );
}

function EmptyActivityMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 72"
      className="h-auto w-full max-w-[120px]"
    >
      <g fill="none" stroke="#d6d3d1" strokeWidth="1.5">
        <rect x="8" y="8" width="104" height="14" rx="7" />
        <rect x="8" y="29" width="76" height="14" rx="7" />
        <rect x="8" y="50" width="90" height="14" rx="7" />
      </g>
    </svg>
  );
}

export function WorkspaceHome({ user, now = new Date() }: { user: SessionUser; now?: Date }) {
  const displayName = firstNameOf(user.name) || 'there';
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">
        Overview · {formatToday(now)}
      </p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-stone-900">
        {getGreeting(now)}, {displayName}
      </h1>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-stone-500">
        Your workspace is ready. Bring your team together and start the conversation.
      </p>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <UpcomingButton label="Invite your team" title="Invitations arrive in a later phase" />
        <button
          type="button"
          disabled
          title="Channel creation arrives in a later phase"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3.5 text-[13px] font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Create a channel
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <OnboardingCard
          title="Bring your team together"
          description="Invite teammates and start collaborating."
          action="Invite members"
          actionTitle="Invitations arrive in a later phase"
        />
        <OnboardingCard
          title="Keep work organized"
          description="Create focused spaces for every topic."
          action="Create a channel"
          actionTitle="Channel creation arrives in a later phase"
        />
        <OnboardingCard
          title="Find work faster"
          description="Search conversations, people, and files."
          action="Explore search"
          actionTitle="Search arrives in a later phase"
        />
      </div>

      <section aria-labelledby="recent-activity-heading" className="mt-8">
        <h2 id="recent-activity-heading" className="text-[13px] font-semibold text-stone-900">
          Recent activity
        </h2>
        <div className="mt-3 flex flex-col items-center rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
          <EmptyActivityMark />
          <p className="mt-4 text-sm font-medium text-stone-700">Nothing here yet.</p>
          <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-stone-500">
            Your recent conversations and updates will appear here.
          </p>
        </div>
      </section>
    </div>
  );
}
