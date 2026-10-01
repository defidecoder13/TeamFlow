'use client';

interface ConversationEmptyStateProps {
  channelName: string;
}

export function ConversationEmptyState({ channelName }: ConversationEmptyStateProps) {
  const cleanName = channelName.replace(/^#/, '');
  return (
    <div className="flex flex-1 flex-col justify-end px-4 py-3 sm:px-6">
      <div className="border-b border-[#e3e1ec]/60 px-2 pb-4 pt-2">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4f2fd] text-[18px] font-bold text-[#1a1b22]">
          #
        </div>
        <h2 className="text-base font-bold text-[#1a1b22]">Welcome to #{cleanName}</h2>
        <p className="mt-0.5 text-xs text-[#5f5e61]">
          This is the start of the #{cleanName} channel. Start the conversation by sending the first
          message.
        </p>
      </div>
    </div>
  );
}
