import React from 'react';

export const MessageListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div
      role="status"
      aria-label="Loading messages"
      className="p-4 space-y-6 animate-pulse"
    >
      <span className="sr-only">Loading conversation history...</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-start gap-3">
          {/* Avatar Skeleton */}
          <div className="w-9 h-9 rounded-[8px] bg-[#eeedf7] shrink-0" />

          {/* Content Skeleton */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-28 bg-[#eeedf7] rounded" />
              <div className="h-3 w-14 bg-[#f4f2fd] rounded" />
            </div>

            <div className="space-y-1.5 max-w-2xl">
              <div
                className="h-4 bg-[#f4f2fd] rounded"
                style={{ width: `${85 - (index % 3) * 15}%` }}
              />
              {index % 2 === 0 && (
                <div
                  className="h-4 bg-[#f4f2fd] rounded"
                  style={{ width: `${60 - (index % 2) * 10}%` }}
                />
              )}
            </div>

            {/* Reaction Skeleton */}
            {index % 2 === 1 && (
              <div className="flex items-center gap-1.5 pt-1">
                <div className="h-6 w-12 bg-[#eeedf7] rounded-[6px]" />
                <div className="h-6 w-14 bg-[#eeedf7] rounded-[6px]" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
