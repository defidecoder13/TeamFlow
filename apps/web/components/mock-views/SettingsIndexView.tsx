'use client';

import React from 'react';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useShell } from '../../lib/shell-context';
import { useNotificationPreferences } from '../../lib/use-notification-preferences';
import type { NotificationPreferences } from '../../lib/notification-preferences';
import type { WorkspaceMembersState } from '../../lib/use-workspace-members';
import type { WorkspacesState } from '../../lib/use-workspaces';
import { User, Users, Building2, Bell, ArrowRight } from 'lucide-react';

function membersCardMeta(state: WorkspaceMembersState): string {
  switch (state.status) {
    case 'ready':
      return `${state.members.length} member${state.members.length === 1 ? '' : 's'}`;
    case 'loading':
    case 'idle':
      return '…';
    default:
      return '—';
  }
}

function workspaceCardMeta(
  workspaces: WorkspacesState,
  currentWorkspace: { role: string; slug: string } | null,
): string {
  if (workspaces.status === 'loading' || workspaces.status === 'idle') return '…';
  if (workspaces.status !== 'ready' || !currentWorkspace) return '—';
  return currentWorkspace.role;
}

function notificationsCardMeta(
  status: string,
  preferences: NotificationPreferences | null,
): string {
  if (status === 'loading' || status === 'idle') return '…';
  if (status !== 'ready' || !preferences) return '—';
  const deliveries = [
    preferences.mentionDelivery,
    preferences.dmDelivery,
    preferences.threadReplyDelivery,
  ];
  const active = deliveries.filter((delivery) => delivery === 'ALL').length;
  if (active === deliveries.length) return 'All active';
  if (active === 0) return 'Muted';
  return `${active} of ${deliveries.length} on`;
}

export const SettingsIndexView: React.FC = () => {
  const { push } = useRouter();
  const { session, currentUser, currentWorkspace, workspaces, members } = useShell();
  const notifications = useNotificationPreferences();

  if (session.status === 'loading') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div
          role="status"
          aria-label="Loading settings"
          className="max-w-3xl mx-auto text-[13px] text-[#4F5360]"
        >
          Loading settings…
        </div>
      </main>
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">Settings</h1>
          </div>
          <div role="status" className="text-[13px] text-[#4F5360]">
            {session.status === 'error'
              ? session.message
              : 'Please sign in to manage your settings.'}
          </div>
        </div>
      </main>
    );
  }

  const profileMeta = currentUser?.name?.trim() || '—';
  const workspaceName = currentWorkspace?.name ?? 'this workspace';

  const settingsCards = [
    {
      title: 'Profile & account',
      description: 'Manage your public display name, avatar, and account email.',
      icon: <User className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/profile',
      meta: profileMeta,
    },
    {
      title: 'Teammates & permissions',
      description: 'Invite new coworkers, assign administrative roles, or review pending invitations.',
      icon: <Users className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/members',
      meta: membersCardMeta(members.state),
    },
    {
      title: 'Workspace settings',
      description: `Rename ${workspaceName}, review its slug, or delete the workspace from the danger zone.`,
      icon: <Building2 className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/workspace',
      meta: workspaceCardMeta(workspaces.state, currentWorkspace),
    },
    {
      title: 'Notifications & alerts',
      description: 'Choose whether mentions, direct messages, and thread replies alert you.',
      icon: <Bell className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/notifications',
      meta: notificationsCardMeta(
        notifications.state.status,
        notifications.state.status === 'ready' ? notifications.state.preferences : null,
      ),
    },
  ];

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">Settings</h1>
          <p className="text-[14px] text-[#4F5360] mt-1">
            Manage your personal profile, team members, workspace preferences, and notification rules.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {settingsCards.map((card) => (
            <div
              key={card.title}
              onClick={() => push(card.url)}
              className="p-5 bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[12px] shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-[#EEF2FF] rounded-[8px]">{card.icon}</div>
                  <span className="text-[11px] font-semibold text-[#737782] uppercase tracking-wider bg-[#F6F5F3] px-2 py-0.5 rounded border border-[#E4E2DF]">
                    {card.meta}
                  </span>
                </div>
                <h2 className="text-[15px] font-semibold text-[#171A21] group-hover:text-[#3157D5] transition-colors">
                  {card.title}
                </h2>
                <p className="text-[13px] text-[#4F5360] mt-1 leading-relaxed">
                  {card.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#ECEAE7] flex items-center justify-between text-[12px] font-semibold text-[#3157D5]">
                <span>Manage</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};
