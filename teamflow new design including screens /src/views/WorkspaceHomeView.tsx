import React from 'react';
import { useApp } from '../context/AppContext';
import { HomeEditorialIllustration } from '../components/home/HomeEditorialIllustration';
import { Hash, UserPlus } from 'lucide-react';

export const WorkspaceHomeView: React.FC = () => {
  const {
    activeWorkspace,
    currentUser,
    setCreateChannelOpen,
    setInviteMemberOpen,
  } = useApp();

  // Extract first name
  const firstName = currentUser.name.split(' ')[0] || currentUser.name;

  // Time-aware greeting: Good morning / afternoon / evening
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <main
      id="main-content"
      className="flex-1 overflow-y-auto bg-[#FAF9F8] flex flex-col items-center justify-center selection:bg-[#EEF2FF] selection:text-[#3157D5]"
    >
      <div className="w-full max-w-xl mx-auto px-4 sm:px-6 py-12 flex flex-col items-center text-center">
        {/* Subtle Editorial Vector Illustration */}
        <HomeEditorialIllustration className="w-full max-w-[380px] mb-5" />

        {/* Dynamic Personal Greeting & Workspace Context */}
        <div className="space-y-2 mb-6">
          <h1 className="text-[28px] sm:text-[32px] font-semibold text-[#171A21] tracking-tight leading-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-[15px] text-[#4F5360] font-normal leading-relaxed">
            You’re in <span className="font-medium text-[#171A21]">{activeWorkspace.name}</span>.
            <br className="hidden sm:inline" /> Let’s make progress together.
          </p>
        </div>

        {/* Two Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setCreateChannelOpen(true)}
            className="px-4 py-2 bg-[#2E3440] hover:bg-[#1E222A] text-white text-[13px] font-medium rounded-[8px] transition-colors flex items-center gap-2 shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
          >
            <Hash className="w-4 h-4 text-neutral-300" />
            <span>Create a channel</span>
          </button>

          <button
            type="button"
            onClick={() => setInviteMemberOpen(true)}
            className="px-4 py-2 bg-white hover:bg-[#F6F5F3] text-[#171A21] border border-[#E4E2DF] hover:border-[#D2D0CC] text-[13px] font-medium rounded-[8px] transition-colors flex items-center gap-2 shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#4F5360]" />
            <span>Invite your team</span>
          </button>
        </div>
      </div>
    </main>
  );
};
