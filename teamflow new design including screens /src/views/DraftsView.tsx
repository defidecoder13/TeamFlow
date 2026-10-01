import React from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../hooks/useRouter';
import { FileEdit, Trash2, ArrowRight } from 'lucide-react';

export const DraftsView: React.FC = () => {
  const { drafts, deleteDraft, channels, dms, members, currentUser } = useApp();
  const { push } = useRouter();

  const draftEntries = Object.entries(drafts);

  const getDestination = (key: string) => {
    if (key.startsWith('chn-')) {
      const channel = channels.find((c) => c.id === key);
      return {
        name: channel ? `#${channel.name}` : '#channel',
        slug: channel?.slug,
        type: 'channel',
      };
    }
    if (key.startsWith('dm-')) {
      const dm = dms.find((d) => d.id === key);
      const otherId = dm?.participantIds.find((id) => id !== currentUser.id);
      const other = members.find((m) => m.id === otherId);
      return {
        name: other ? `@${other.name}` : 'Direct message',
        id: dm?.id,
        type: 'dm',
      };
    }
    return { name: 'Conversation', type: 'unknown' };
  };

  const handleResume = (key: string) => {
    const dest = getDestination(key);
    if (dest.type === 'channel' && dest.slug) {
      push(`/app/channels/${dest.slug}`);
    } else if (dest.type === 'dm' && dest.id) {
      push(`/app/dms/${dest.id}`);
    }
  };

  return (
    <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 bg-[#FAF9F8] overflow-y-auto">
      {/* Minimal Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#F6F5F3] text-[#171A21] shrink-0 border border-[#E4E2DF]">
            <FileEdit className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-[15px] font-semibold text-[#171A21] tracking-tight">Drafts</h1>
        </div>
        {draftEntries.length > 0 && (
          <span className="text-[11px] font-semibold text-[#737782] bg-[#F1F0EE] px-2 py-0.5 rounded-[6px] border border-[#E4E2DF] tabular-nums">
            {draftEntries.length}
          </span>
        )}
      </header>

      {/* Body */}
      <div className="p-6 max-w-4xl w-full mx-auto">
        {draftEntries.length === 0 ? (
          <div className="p-12 text-center bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mx-auto mb-3">
              <FileEdit className="w-6 h-6" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#171A21]">No drafts</h2>
            <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm mx-auto">
              Any unsent messages you leave in channels or direct messages are autosaved here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {draftEntries.map(([key, text]) => {
              const dest = getDestination(key);

              return (
                <div
                  key={key}
                  className="p-4 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs hover:border-[#D2D0CC] hover:shadow-xs transition-all"
                >
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#F1F0EE] text-[#171A21] border border-[#E4E2DF]">
                        {dest.name}
                      </span>
                      <span className="text-[12px] text-[#737782]">Autosaved</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteDraft(key)}
                      className="p-1 text-[#737782] hover:text-[#C94A45] rounded hover:bg-rose-50 transition-colors"
                      title="Discard draft"
                      aria-label="Discard draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[14px] text-[#171A21] leading-relaxed line-clamp-3">
                    {text}
                  </p>

                  <div className="mt-3 pt-3 border-t border-[#ECEAE7] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => deleteDraft(key)}
                      className="px-3 py-1.5 text-[12px] font-medium text-[#737782] hover:text-[#171A21] rounded-[6px] hover:bg-[#F1F0EE] transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResume(key)}
                      className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[6px] flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <span>Resume message</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
