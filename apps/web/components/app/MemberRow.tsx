/**
 * Single workspace member row (Phase 2E).
 *
 * Real data only: avatar (image or generated initials via the shared
 * UserAvatar), name, email, and role pill. A subtle "You" badge marks the
 * current user. No avatars are fabricated or hotlinked.
 */

import type { WorkspaceMember } from '../../lib/members';
import type { PresenceStatus } from '../../lib/presence';
import { UserAvatar } from './UserAvatar';

const ROLE_STYLES: Record<WorkspaceMember['role'], string> = {
  OWNER: 'bg-zinc-900 text-white',
  ADMIN: 'bg-stone-200 text-zinc-700',
  MEMBER: 'bg-stone-100 text-stone-500',
};

interface MemberRowProps {
  member: WorkspaceMember;
  isCurrentUser: boolean;
  presenceStatus?: PresenceStatus;
}

export function MemberRow({ member, isCurrentUser, presenceStatus }: MemberRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <UserAvatar
        name={member.user.name}
        image={member.user.image}
        size="md"
        presenceStatus={presenceStatus}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <span className="truncate">{member.user.name}</span>
          {isCurrentUser ? (
            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
              You
            </span>
          ) : null}
        </p>
        <p className="truncate text-[13px] text-stone-500">{member.user.email}</p>
      </div>
      <span
        className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${ROLE_STYLES[member.role]}`}
      >
        {member.role}
      </span>
    </li>
  );
}
