'use client';

interface ConversationEmptyStateProps {
  channelName: string;
}

export function ConversationEmptyState({ channelName }: ConversationEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-base font-semibold text-stone-900">Welcome to {channelName}</h2>
        <p className="text-[13px] text-stone-500">
          Start the conversation by sending the first message.
        </p>
      </div>
    </div>
  );
}
