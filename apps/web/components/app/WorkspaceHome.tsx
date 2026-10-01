/**
 * Workspace Home content for /app — matching the new design project.
 *
 * Implements:
 * - Editorial composition with HomeEditorialIllustration
 * - Date-aware overview header and dynamic personal greeting
 * - Contextual workspace statement
 * - Real channel creation dialog & team invitation link
 * - 3 clean onboarding guidance cards (invite members, create channel, search workspace)
 * - Honest empty recent activity state with channel creation trigger
 * - 100% connected to real TeamFlow session, workspace store, and dialogs.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Hash, UserPlus, Users, FolderPlus, Search, ArrowRight } from 'lucide-react';
import type { SessionUser } from '../../lib/auth-guard';
import type { Channel } from '../../lib/channels';
import { firstNameOf, formatToday, getGreeting } from '../../lib/greeting';
import { CreateChannelDialog } from './CreateChannelDialog';
import { InviteMemberDialog } from './InviteMemberDialog';
import { HomeEditorialIllustration } from './HomeEditorialIllustration';

export function WorkspaceHome({
  user,
  workspace,
  now = new Date(),
}: {
  user: SessionUser;
  workspace: { id: string; name: string };
  now?: Date;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const firstName = firstNameOf(user.name) || user.name || 'there';

  const handleCreated = (channel: Channel) => {
    setCreateOpen(false);
    router.push(`/app/channels/${channel.slug}`);
  };

  return (
    <main
      id="main-content"
      className="flex-1 overflow-y-auto bg-[#FAF9F8] flex flex-col selection:bg-[#EEF2FF] selection:text-[#3157D5]"
    >
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 flex flex-col items-center text-center">
        {/* Date / Overview pill */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#737782] mb-3">
          <span>Overview</span> · {formatToday(now)}
        </p>

        {/* Subtle Editorial Vector Illustration */}
        <HomeEditorialIllustration className="w-full max-w-[340px] mb-5" />

        {/* Dynamic Personal Greeting & Workspace Context */}
        <div className="space-y-2 mb-6">
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#171A21] tracking-tight leading-tight">
            {getGreeting(now)}, {firstName}
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#4F5360] font-normal leading-relaxed">
            You’re in <span className="font-medium text-[#171A21]">{workspace.name}</span>.
            <br className="hidden sm:inline" /> Let’s make progress together.
          </p>
        </div>

        {/* Two Primary Action CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 bg-[#2E3440] hover:bg-[#1E222A] text-white text-[13px] font-medium rounded-[8px] transition-colors flex items-center gap-2 shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
          >
            <Hash className="w-4 h-4 text-neutral-300" />
            <span>Create a channel</span>
          </button>

          <Link
            href="/app/settings/members"
            className="px-4 py-2 bg-white hover:bg-[#F6F5F3] text-[#171A21] border border-[#E4E2DF] hover:border-[#D2D0CC] text-[13px] font-medium rounded-[8px] transition-colors flex items-center gap-2 shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
          >
            <UserPlus className="w-4 h-4 text-[#4F5360]" />
            <span>Invite your team</span>
          </Link>
        </div>

        {/* 3 Quick-start Guidance Cards */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 text-left mb-10">
          {/* Card 1: Members */}
          <div className="bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[12px] p-4.5 flex flex-col justify-between shadow-2xs transition-all group">
            <div>
              <div className="w-8 h-8 rounded-[8px] bg-[#FAF9F8] border border-[#E4E2DF] flex items-center justify-center text-[#171A21] mb-3">
                <Users className="w-4 h-4 text-[#4F5360]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#171A21]">Bring your team together</h2>
              <p className="mt-1 text-[12px] text-[#737782] leading-relaxed">
                Invite teammates and start collaborating.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F1F0EE]">
              <Link
                href="/app/settings/members"
                className="text-[12px] font-medium text-[#3157D5] hover:underline flex items-center gap-1"
              >
                <span>Invite members</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Card 2: Channels */}
          <div className="bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[12px] p-4.5 flex flex-col justify-between shadow-2xs transition-all group">
            <div>
              <div className="w-8 h-8 rounded-[8px] bg-[#FAF9F8] border border-[#E4E2DF] flex items-center justify-center text-[#171A21] mb-3">
                <FolderPlus className="w-4 h-4 text-[#4F5360]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#171A21]">Keep work organized</h2>
              <p className="mt-1 text-[12px] text-[#737782] leading-relaxed">
                Create focused spaces for every topic.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F1F0EE]">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="text-[12px] font-medium text-[#3157D5] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Create a channel</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* Card 3: Search */}
          <div className="bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[12px] p-4.5 flex flex-col justify-between shadow-2xs transition-all group">
            <div>
              <div className="w-8 h-8 rounded-[8px] bg-[#FAF9F8] border border-[#E4E2DF] flex items-center justify-center text-[#171A21] mb-3">
                <Search className="w-4 h-4 text-[#4F5360]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#171A21]">Find work faster</h2>
              <p className="mt-1 text-[12px] text-[#737782] leading-relaxed">
                Search conversations, people, and files.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F1F0EE] space-y-1">
              <Link
                href="/app/search"
                className="text-[12px] font-medium text-[#3157D5] hover:underline flex items-center gap-1"
              >
                <span>Search workspace</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/app/search"
                className="text-[11px] text-[#737782] hover:text-[#3157D5] block truncate"
              >
                Try permission-aware search
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Activity Section */}
        <section aria-labelledby="recent-activity-heading" className="w-full text-left">
          <div className="flex items-center justify-between mb-3">
            <h2 id="recent-activity-heading" className="text-[14px] font-semibold text-[#171A21]">
              Recent activity
            </h2>
          </div>
          <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-[#E4E2DF] bg-white/70 p-8 text-center">
            <p className="text-[13px] font-medium text-[#171A21]">Nothing here yet.</p>
            <p className="mt-1 max-w-xs text-[12px] text-[#737782] leading-relaxed">
              Your recent conversations and updates will appear here.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 px-3.5 py-1.5 bg-white hover:bg-[#F6F5F3] text-[#171A21] border border-[#E4E2DF] text-[12px] font-medium rounded-[7px] transition-colors shadow-2xs cursor-pointer"
            >
              Create a channel
            </button>
          </div>
        </section>
      </div>

      {createOpen ? (
        <CreateChannelDialog
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}

      {inviteOpen ? (
        <InviteMemberDialog
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onClose={() => setInviteOpen(false)}
          onCreated={() => setInviteOpen(false)}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}
    </main>
  );
}
