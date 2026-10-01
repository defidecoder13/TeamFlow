import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Toast: React.FC = () => {
  const { toast, hideToast } = useApp();

  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0" />,
    info: <Info className="w-4 h-4 text-[#1f44e4] shrink-0" />,
  };

  const borderStyles = {
    success: 'border-emerald-200 bg-white',
    error: 'border-red-200 bg-white',
    info: 'border-[#e3e1ec] bg-white',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-[12px] shadow-[0_8px_24px_rgba(26,27,34,0.12)] border text-[#1a1b22] text-[13px] font-medium animate-in fade-in slide-in-from-bottom-2 duration-200 bg-white"
    >
      <div className={`p-1 rounded-full ${borderStyles[toast.type || 'info']}`}>
        {icons[toast.type || 'info']}
      </div>
      <span>{toast.message}</span>
      <button
        onClick={hideToast}
        aria-label="Dismiss message"
        className="ml-2 p-1 text-[#5f5e61] hover:text-[#1a1b22] rounded-[6px] hover:bg-[#e8e7f1] transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
