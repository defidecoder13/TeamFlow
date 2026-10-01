'use client';

import { useRef } from 'react';
import { Dialog } from './dialog';

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

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      role="alertdialog"
      labelledBy="delete-message-title"
      describedBy="delete-message-desc"
      size="sm"
      dismissable={!deleting}
      initialFocusRef={cancelBtnRef}
    >
      <h2
        id="delete-message-title"
        className="text-[17px] font-semibold tracking-tight text-[#171A21]"
      >
        Delete message?
      </h2>
      <p id="delete-message-desc" className="mt-1.5 text-[13px] leading-relaxed text-[#737782]">
        Are you sure you want to delete this message? This action cannot be undone.
      </p>
      {error && (
        <div role="alert" className="mt-3 rounded-[8px] bg-rose-50 border border-rose-200 p-2.5 text-[12px] text-[#C94A45]">
          {error}
        </div>
      )}
      <div className="mt-5 flex items-center justify-end gap-2.5 pt-2 border-t border-[#E4E2DF]">
        <button
          ref={cancelBtnRef}
          type="button"
          onClick={onClose}
          disabled={deleting}
          className="rounded-[8px] border border-[#E4E2DF] px-3.5 py-2 text-[13px] font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={deleting}
          className="rounded-[8px] bg-[#C94A45] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#B33E3A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] disabled:opacity-50"
        >
          {deleting ? 'Deleting message…' : 'Delete message'}
        </button>
      </div>
    </Dialog>
  );
}
