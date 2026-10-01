import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../hooks/useRouter';
import {
  Search,
  X,
  Hash,
  MessageSquare,
  FileText,
  User,
  Calendar,
  Filter,
  ArrowRight,
} from 'lucide-react';

interface SearchResultItem {
  id: string;
  kind: 'message' | 'channel' | 'person' | 'file';
  title: string;
  description?: string;
  channelId?: string;
  senderId?: string;
  timestamp: string;
  url: string;
  avatarUrl?: string;
}

export const SearchView: React.FC = () => {
  const { messages, channels, members } = useApp();
  const { searchParams, push } = useRouter();

  const query = searchParams.get('q') || '';
  const typeFilter = searchParams.get('type') || 'all'; // all | messages | channels | files | people
  const channelFilter = searchParams.get('in') || '';
  const authorFilter = searchParams.get('from') || '';

  const [inputVal, setInputVal] = useState(query);
  const [displayLimit, setDisplayLimit] = useState(10);

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([k, v]) => {
      if (!v || v === 'all') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
    push(`/app/search?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: inputVal.trim() });
  };

  const handleClearSearch = () => {
    setInputVal('');
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    push(`/app/search?${params.toString()}`);
  };

  // Search Results aggregation
  const results = useMemo<SearchResultItem[]>(() => {
    const cleanQ = query.toLowerCase().trim();

    const matchedMessages = (typeFilter === 'all' || typeFilter === 'messages')
      ? messages
          .filter((m) => {
            if (channelFilter && m.channelId !== channelFilter) return false;
            if (authorFilter && m.senderId !== authorFilter) return false;
            if (!cleanQ) return true;
            return m.content.toLowerCase().includes(cleanQ);
          })
          .map((m) => ({
            id: m.id,
            kind: 'message' as const,
            title: m.content,
            channelId: m.channelId,
            senderId: m.senderId,
            timestamp: m.createdAt,
            url: m.channelId
              ? `/app/channels/${channels.find((c) => c.id === m.channelId)?.slug || 'general'}`
              : '/app/channels/general',
          }))
      : [];

    const matchedChannels = (typeFilter === 'all' || typeFilter === 'channels') && !channelFilter && !authorFilter
      ? channels
          .filter((c) => {
            if (!cleanQ) return true;
            return (
              c.name.toLowerCase().includes(cleanQ) ||
              c.topic.toLowerCase().includes(cleanQ) ||
              c.description.toLowerCase().includes(cleanQ)
            );
          })
          .map((c) => ({
            id: c.id,
            kind: 'channel' as const,
            title: `#${c.name}`,
            description: c.topic || c.description,
            timestamp: c.isPrivate ? 'Private channel' : 'Public channel',
            url: `/app/channels/${c.slug}`,
          }))
      : [];

    const matchedMembers = (typeFilter === 'all' || typeFilter === 'people') && !channelFilter
      ? members
          .filter((m) => {
            if (authorFilter && m.id !== authorFilter) return false;
            if (!cleanQ) return true;
            return (
              m.name.toLowerCase().includes(cleanQ) ||
              m.email.toLowerCase().includes(cleanQ) ||
              m.title.toLowerCase().includes(cleanQ)
            );
          })
          .map((m) => ({
            id: m.id,
            kind: 'person' as const,
            title: m.name,
            description: `${m.title} · ${m.email}`,
            timestamp: m.presence,
            avatarUrl: m.avatarUrl,
            url: `/app/settings/members`,
          }))
      : [];

    const matchedFiles = (typeFilter === 'all' || typeFilter === 'files')
      ? messages
          .filter((m) => m.attachments && m.attachments.length > 0)
          .flatMap((m) => m.attachments || [])
          .filter((att) => {
            if (!cleanQ) return true;
            return att.name.toLowerCase().includes(cleanQ);
          })
          .map((att) => ({
            id: att.id,
            kind: 'file' as const,
            title: att.name,
            description: `${(att.sizeBytes / 1048576).toFixed(1)} MB`,
            timestamp: 'Attachment',
            url: '#',
          }))
      : [];

    return [...matchedMessages, ...matchedChannels, ...matchedMembers, ...matchedFiles];
  }, [query, typeFilter, channelFilter, authorFilter, messages, channels, members]);

  const visibleResults = results.slice(0, displayLimit);

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Search header & input */}
        <div className="space-y-4">
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">Search</h1>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-4 h-4 text-[#737782] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Search across messages, channels, files, or teammates..."
              className="w-full pl-10 pr-24 py-2.5 text-[14px] bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] focus:border-[#3157D5] focus:ring-2 focus:ring-[#EEF2FF] rounded-[10px] outline-none text-[#171A21] placeholder:text-[#737782] shadow-2xs transition-all"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {inputVal && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="p-1 rounded-[6px] hover:bg-[#F1F0EE] text-[#737782] hover:text-[#171A21]"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="px-3 py-1 bg-[#2E3440] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#1E222A] active:scale-95 transition-all shadow-2xs"
              >
                Search
              </button>
            </div>
          </form>

          {/* Type Filter Pills (Single border-selected style per spec) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Search categories">
            {[
              { id: 'all', label: 'All results' },
              { id: 'messages', label: 'Messages' },
              { id: 'channels', label: 'Channels' },
              { id: 'files', label: 'Files' },
              { id: 'people', label: 'People' },
            ].map((tab) => {
              const isSelected = typeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => updateFilters({ type: tab.id })}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-[8px] border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-white border-[#171A21] text-[#171A21] shadow-2xs font-semibold'
                      : 'bg-transparent border-[#E4E2DF] text-[#737782] hover:text-[#171A21] hover:bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Grouped Filter Controls: Who, Where */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-[#E4E2DF] rounded-[10px] text-[13px]">
            <div className="flex items-center gap-1.5 text-[#737782]">
              <Filter className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">Filters:</span>
            </div>

            {/* Where: in channel */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-channel" className="text-[#737782]">In:</label>
              <select
                id="filter-channel"
                value={channelFilter}
                onChange={(e) => updateFilters({ in: e.target.value })}
                className="px-2 py-1 bg-[#F6F5F3] border border-[#E4E2DF] rounded-[6px] text-[#171A21] text-[12px] outline-none"
              >
                <option value="">Any channel</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Who: from author */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-author" className="text-[#737782]">From:</label>
              <select
                id="filter-author"
                value={authorFilter}
                onChange={(e) => updateFilters({ from: e.target.value })}
                className="px-2 py-1 bg-[#F6F5F3] border border-[#E4E2DF] rounded-[6px] text-[#171A21] text-[12px] outline-none"
              >
                <option value="">Anyone</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {(channelFilter || authorFilter) && (
              <button
                type="button"
                onClick={() => updateFilters({ in: '', from: '' })}
                className="text-[12px] text-[#3157D5] hover:underline ml-auto"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* Results count announcer */}
        <div className="flex items-center justify-between text-[13px] text-[#737782] border-b border-[#E4E2DF] pb-2">
          <span role="status" aria-live="polite">
            {results.length === 0 ? 'No results found' : `${results.length} result${results.length === 1 ? '' : 's'} found`}
            {query && <span> for <strong className="text-[#171A21]">"{query}"</strong></span>}
          </span>
          <span className="text-[12px] tabular-nums">
            Showing {Math.min(visibleResults.length, results.length)} of {results.length}
          </span>
        </div>

        {/* Results list / Honest empty */}
        {results.length === 0 ? (
          <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#F6F5F3] text-[#737782] flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#171A21]">
              {query ? `No results found for "${query}"` : 'No items match the selected filters'}
            </h2>
            <p className="text-[13px] text-[#4F5360] max-w-sm mx-auto">
              Check your spelling, try broader keywords, or clear the active channel and member filters.
            </p>
            {query && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors shadow-2xs"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleResults.map((item) => {
              const author = item.senderId
                ? members.find((m) => m.id === item.senderId)
                : undefined;
              const channel = item.channelId
                ? channels.find((c) => c.id === item.channelId)
                : undefined;

              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  onClick={() => push(item.url)}
                  className="p-4 bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[12px] shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-[8px] bg-[#EEF2FF] text-[#3157D5] shrink-0 mt-0.5">
                      {item.kind === 'channel' && <Hash className="w-4 h-4" />}
                      {item.kind === 'message' && <MessageSquare className="w-4 h-4" />}
                      {item.kind === 'person' && <User className="w-4 h-4" />}
                      {item.kind === 'file' && <FileText className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-[#171A21] group-hover:text-[#3157D5] transition-colors truncate">
                          {item.title}
                        </span>
                        {channel && (
                          <span className="text-[12px] text-[#737782]">
                            in #{channel.name}
                          </span>
                        )}
                        {author && (
                          <span className="text-[12px] text-[#737782]">
                            by {author.name}
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[13px] text-[#4F5360] mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      <span className="text-[11px] text-[#737782] tabular-nums mt-1.5 block">
                        {item.timestamp}
                      </span>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[#737782] group-hover:text-[#3157D5] group-hover:translate-x-1 transition-all shrink-0 mt-2" />
                </div>
              );
            })}

            {/* Load more button */}
            {visibleResults.length < results.length && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 10)}
                  className="px-4 py-2 text-[13px] font-medium bg-white border border-[#E4E2DF] hover:bg-[#F1F0EE] text-[#171A21] rounded-[8px] transition-colors shadow-2xs active:scale-[0.98]"
                >
                  Load more results ({results.length - visibleResults.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
