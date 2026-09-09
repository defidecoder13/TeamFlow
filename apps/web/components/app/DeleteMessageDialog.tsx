'use client';

import { useEffect, useRef } from 'react';

interface DeleteMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
  error?: string | null;
}

export function DeleteMessageDialog({
  isOpen,
  onClose,
  onConfirm,
  deleting = false,
  error = null,
}: DeleteMessageDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    cancelBtnRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleting) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, deleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/25 p-4"
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        aria-describedby="delete-message-desc"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <h2
          id="delete-message-title"
          className="text-base font-semibold tracking-tight text-zinc-900"
        >
          Delete message?
        </h2>
        <p id="delete-message-desc" className="mt-2 text-[13px] leading-relaxed text-stone-600">
          Are you sure you want to delete this message? This action cannot be undone.
        </p>
        {error && (
          <div role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-[12px] text-red-700">
            {error}
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
