import React from 'react';
import { useRouter } from '../hooks/useRouter';
import { useApp } from '../context/AppContext';
import { User, Users, Building2, Bell, ArrowRight } from 'lucide-react';

export const SettingsIndexView: React.FC = () => {
  const { push } = useRouter();
  const { activeWorkspace, members } = useApp();

  const settingsCards = [
    {
      title: 'Profile & account',
      description: 'Manage your public display name, avatar, bio, and role title in this workspace.',
      icon: <User className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/profile',
      meta: 'Alex Chen',
    },
    {
      title: 'Teammates & permissions',
      description: 'Invite new coworkers, assign administrative roles, or review pending invitations.',
      icon: <Users className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/members',
      meta: `${members.length} members`,
    },
    {
      title: 'Workspace settings',
      description: `Configure name, vanity URL, retention policies, and administrative controls for ${activeWorkspace.name}.`,
      icon: <Building2 className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/workspace',
      meta: `${activeWorkspace.plan} plan`,
    },
    {
      title: 'Notifications & alerts',
      description: 'Tune email digest frequencies, desktop push triggers, and @-mention alert rules.',
      icon: <Bell className="w-5 h-5 text-[#3157D5]" />,
      url: '/app/settings/notifications',
      meta: 'All active',
    },
  ];

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#F7F6F5] p-4 sm:p-8">
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
