import React, { useEffect, useRef } from 'react';
import { useApp } from '../../../lib/mock-context';
import { Sidebar } from './Sidebar';
import { X } from 'lucide-react';

export const MobileDrawer: React.FC = () => {
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useApp();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobileSidebarOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setMobileSidebarOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isMobileSidebarOpen, setMobileSidebarOpen]);

  if (!isMobileSidebarOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 md:hidden flex"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation drawer"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer content: exactly one sidebar */}
      <div
        ref={drawerRef}
        className="relative z-10 flex flex-col h-full w-72 max-w-[85vw] bg-[#F7F6F5] shadow-2xl animate-in slide-in-from-left duration-300 ease-out border-r border-[#E4E2DF]"
      >
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#E4E2DF] bg-[#F7F6F5]">
          <span className="text-[12px] font-semibold text-[#737782] uppercase tracking-wider">
            Navigation
          </span>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1 rounded-[6px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <Sidebar onNavigateMobile={() => setMobileSidebarOpen(false)} />
        </div>
      </div>
    </div>
  );
};
