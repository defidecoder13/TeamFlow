/**
 * Invite-member dialog (Phase 2F-B).
 *
 * Focused responsibilities: email input with validation, POST through the
 * invitation client, safe errors, and a development-only success state with
 * a copyable local acceptance link (email delivery does not exist yet).
 * Only `email` is ever sent — role/expiry/ownership stay server-side.
 * The raw token lives only in this component's memory for the success view:
 * never localStorage, never logged.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthError } from '../auth/AuthError';
import { AuthField } from '../auth/AuthField';
import { AuthSubmitButton } from '../auth/AuthSubmitButton';
import { getApiBaseUrl } from '../../lib/config';
import { createInvitation, type CreatedInvitation } from '../../lib/invitations';
import { validateEmail } from '../../lib/validation';

const CREATE_FALLBACK_MESSAGE = "We couldn't create the invitation. Please try again.";

interface InviteMemberDialogProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onCreated: () => void;
  onUnauthenticated: () => void;
}

export function InviteMemberDialog({
  workspaceId,
  workspaceName,
  onClose,
  onCreated,
  onUnauthenticated,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const emailError = touched ? validateEmail(email) : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !creating) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [creating, onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (creating) {
      return;
    }
    setTouched(true);
    if (validateEmail(email)) {
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const result = await createInvitation(getApiBaseUrl(), workspaceId, email.trim());
      if (result.ok) {
        setCreated(result.invitation);
        onCreated();
        return;
      }
      if (result.kind === 'unauthenticated') {
        onUnauthenticated();
        return;
      }
      setFormError(result.kind === 'failed' ? CREATE_FALLBACK_MESSAGE : result.message);
    } catch {
      setFormError(CREATE_FALLBACK_MESSAGE);
    } finally {
      setCreating(false);
    }
  }

  function invitationUrl(token: string): string {
    return `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`;
  }

  async function handleCopy(url: string) {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/25 p-4"
      onClick={() => {
        if (!creating) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        {created ? (
          <div>
            <h2
              id="invite-dialog-title"
              className="text-base font-semibold tracking-tight text-zinc-900"
            >
              Invitation created
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              {created.email} can now join {workspaceName}. Email delivery isn&apos;t configured yet
              — share this development link instead.
            </p>
            <label
              htmlFor="invitation-link"
              className="mb-1.5 mt-4 block text-[13px] font-medium text-zinc-700"
            >
              Development invitation link
            </label>
            <input
              id="invitation-link"
              type="text"
              readOnly
              value={invitationUrl(created.token)}
              onFocus={(event) => event.target.select()}
              className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 font-mono text-xs text-stone-700 outline-none focus:border-zinc-900"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(invitationUrl(created.token))}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              >
                {copied ? 'Copied' : 'Copy invitation link'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400"
              >
                Done
              </button>
            </div>
            {copyFailed ? (
              <p role="status" className="mt-2 text-[13px] text-stone-500">
                Copy didn&apos;t work — select the link above manually.
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <h2
              id="invite-dialog-title"
              className="text-base font-semibold tracking-tight text-zinc-900"
            >
              Invite a member
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              They&apos;ll join {workspaceName} as a member.
            </p>
            <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
              <AuthError message={formError} />
              <AuthField
                id="invite-email"
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                autoFocus
                value={email}
                error={emailError}
                disabled={creating}
                placeholder="person@example.com"
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={creating}
                  onClick={onClose}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-50"
                >
                  Cancel
                </button>
                <div className="flex-1">
                  <AuthSubmitButton pending={creating} pendingLabel="Inviting…">
                    Invite member
                  </AuthSubmitButton>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
