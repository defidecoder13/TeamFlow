import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  role?: 'dialog' | 'alertdialog';
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  showCloseButton = true,
  role = 'dialog',
  initialFocusRef,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement | null;

      // Scroll lock
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Focus first focusable element or provided initialFocusRef
      const timer = setTimeout(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (dialogRef.current) {
          const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            dialogRef.current.focus();
          }
        }
      }, 50);

      // Inert background
      const mainAppRoot = document.getElementById('root');
      if (mainAppRoot) {
        mainAppRoot.setAttribute('aria-hidden', 'true');
      }

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        if (mainAppRoot) {
          mainAppRoot.removeAttribute('aria-hidden');
        }
        // Focus restore
        if (previouslyFocusedElement.current) {
          previouslyFocusedElement.current.focus();
        }
      };
    }
  }, [isOpen, initialFocusRef]);

  // Trap focus & Escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[maxWidth];

  const titleId = `dialog-title-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const descId = description ? `dialog-desc-${title.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      aria-modal="true"
      role={role}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="document"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={`w-full ${widthClasses} bg-white rounded-t-[20px] sm:rounded-[18px] border border-[#E4E2DF] shadow-[0_20px_60px_rgba(20,24,32,0.16)] overflow-hidden flex flex-col max-h-[90vh] transition-all transform duration-200 ease-out sm:scale-100 scale-100 outline-none`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3.5 border-b border-[#E4E2DF] bg-[#FAF9F8]">
          <div>
            <h2 id={titleId} className="text-[17px] font-semibold text-[#171A21] tracking-tight text-balance">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-[13px] text-[#4F5360] mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] active:scale-[0.98] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};
