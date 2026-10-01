'use client';

import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * Shared modal + menu primitives for the authenticated app.
 *
 * Every dialog in /app previously managed only Escape and initial focus,
 * leaving the background tabbable and dropping focus on close. These
 * primitives fix that once, for all surfaces:
 *
 * - `Dialog` — portal to `document.body`, focus trap, `inert` background,
 *   focus restore, scroll lock, Escape. Bottom-sheet on phones, centered
 *   card on `sm` and up (matches the ThreadPanel sheet language).
 * - `useMenuKeyboard` — arrow-key navigation, Home/End, Escape + restore,
 *   and Tab-to-close for popover menus (user menu, notification bell,
 *   message actions). Popovers stay modeless: no `inert`, no trap.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-scope stack so nested dialogs trap/close topmost-first, and a
// scroll-lock counter so nested opens don't unlock early.
const openStack: string[] = [];
let scrollLocks = 0;
let previousBodyOverflow: string | null = null;

function getDialogRoot(): HTMLElement {
  let root = document.getElementById('teamflow-dialog-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'teamflow-dialog-root';
    document.body.appendChild(root);
  }
  return root;
}

function setBackgroundInert(inert: boolean) {
  const root = document.getElementById('teamflow-dialog-root');
  for (const child of Array.from(document.body.children)) {
    if (child === root) continue;
    if (child.tagName === 'SCRIPT') continue;
    if (inert) {
      child.setAttribute('inert', '');
    } else {
      child.removeAttribute('inert');
    }
  }
}

function lockScroll() {
  scrollLocks += 1;
  if (scrollLocks === 1) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0 && previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
}

export interface UseModalDialogOptions {
  open: boolean;
  onClose: () => void;
  /** Close on Escape and backdrop click. False while submitting/deleting. */
  dismissable?: boolean;
  /** Focus this element on open instead of the first focusable control. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function useModalDialog({
  open,
  onClose,
  dismissable = true,
  initialFocusRef,
}: UseModalDialogOptions) {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    openStack.push(id);
    lockScroll();
    setBackgroundInert(true);

    // Focus in: explicit target, else whatever autofocus landed, else the
    // first focusable control, else the panel itself.
    const panel = panelRef.current;
    if (panel) {
      const target =
        initialFocusRef?.current ??
        (document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)
          ? document.activeElement
          : null) ??
        (panel.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null) ??
        panel;
      target.focus({ preventScroll: true });
    }

    function onKeyDown(event: KeyboardEvent) {
      // Only the topmost dialog owns Tab and Escape.
      if (openStack[openStack.length - 1] !== id) return;
      if (event.key === 'Escape' && dismissable) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      // No visibility filter here: `offsetParent`/`getClientRects` checks
      // are unreliable in test environments, and dialog panels do not
      // render hidden focusables. The selector already excludes disabled.
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const index = openStack.indexOf(id);
      if (index !== -1) openStack.splice(index, 1);
      if (openStack.length === 0) setBackgroundInert(false);
      unlockScroll();
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, dismissable, id, initialFocusRef]);

  return panelRef;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: 'dialog' | 'alertdialog';
  size?: 'sm' | 'md' | 'lg';
  dismissable?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
} as const;

export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  role = 'dialog',
  size = 'md',
  dismissable = true,
  initialFocusRef,
  children,
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Gate the whole modal lifecycle on mount: on an open-on-first-render
  // the portal (and panel) only exists from the second pass, so the setup
  // effect must run then — otherwise focus never lands and `inert` races.
  const active = open && mounted;
  const panelRef = useModalDialog({ open: active, onClose, dismissable, initialFocusRef });

  // Closed dialogs render nothing (also SSR-safe: no portal before mount).
  if (!active) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#171A21]/40 backdrop-blur-[2px] p-4 transition-opacity duration-200 starting:opacity-0 sm:items-center sm:p-6"
      onClick={() => {
        if (dismissable) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[calc(100dvh-2rem)] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-[14px] border border-[#E4E2DF] bg-white p-5 shadow-xl transition-[opacity,scale] duration-200 ease-out-expo starting:scale-[0.96] starting:opacity-0 focus:outline-none sm:rounded-[14px] sm:p-6`}
        style={{
          overscrollBehavior: 'contain',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
    </div>,
    getDialogRoot(),
  );
}

export interface UseMenuKeyboardOptions {
  open: boolean;
  onClose: () => void;
  /** Ref of the trigger that opened the menu (focus returns here). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * APG menu-button keyboard support for a popover menu container.
 * Attach the returned ref to the `role="menu"` element.
 */
export function useMenuKeyboard({ open, onClose, triggerRef }: UseMenuKeyboardOptions) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;

    // Focus the first item on open so arrows work immediately.
    const items = () =>
      menu
        ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'))
        : [];
    items()[0]?.focus({ preventScroll: true });

    function move(current: HTMLElement | null, delta: number) {
      const list = items();
      if (list.length === 0) return;
      const index = current ? list.indexOf(current) : -1;
      const next = list[(index + delta + list.length) % list.length];
      next.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!menu?.contains(target) && target !== triggerRef?.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        triggerRef?.current?.focus({ preventScroll: true });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(document.activeElement as HTMLElement | null, 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(document.activeElement as HTMLElement | null, -1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        items()[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        const list = items();
        list[list.length - 1]?.focus();
      } else if (event.key === 'Tab') {
        onCloseRef.current();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, triggerRef]);

  return menuRef;
}
