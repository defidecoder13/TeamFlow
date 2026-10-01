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
import { Dialog } from './dialog';
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
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const emailError = touched ? validateEmail(email) : null;

  // Move focus to the success heading when the view swaps, so screen
  // reader users don't miss the transition sighted users see.
  useEffect(() => {
    if (created) {
      successHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [created]);

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
    <Dialog
      open
      onClose={onClose}
      labelledBy="invite-dialog-title"
      size="sm"
      dismissable={!creating}
    >
      <div>
        {created ? (
          <div>
            <h2
              id="invite-dialog-title"
              tabIndex={-1}
              ref={successHeadingRef}
              className="text-[17px] font-semibold tracking-tight text-[#171A21] outline-none"
            >
              Invitation created
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#737782]">
              {created.email} can now join {workspaceName}. Email delivery isn&apos;t configured yet
              — share this development link instead.
            </p>
            <label
              htmlFor="invitation-link"
              className="mb-1.5 mt-4 block text-[13px] font-medium text-[#171A21]"
            >
              Development invitation link
            </label>
            <input
              id="invitation-link"
              type="text"
              readOnly
              value={invitationUrl(created.token)}
              onFocus={(event) => event.target.select()}
              className="h-10 w-full break-all rounded-lg border border-[#E4E2DF] bg-[#FAF9F8] px-3 text-xs text-[#171A21] outline-none focus:border-[#3157D5] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(invitationUrl(created.token))}
                className="inline-flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#2E3440] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5] active:scale-[0.98]"
              >
                {copied ? 'Copied' : 'Copy invitation link'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-[42px] items-center justify-center rounded-lg border border-[#E4E2DF] bg-white px-4 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                Done
              </button>
            </div>
            {copyFailed ? (
              <p role="status" className="mt-2 text-[13px] text-[#C94A45]">
                Copy didn&apos;t work — select the link above manually.
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <h2
              id="invite-dialog-title"
              className="text-[17px] font-semibold tracking-tight text-[#171A21]"
            >
              Invite a member
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#737782]">
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
              <div className="flex gap-2 pt-2 border-t border-[#E4E2DF]">
                <button
                  type="button"
                  disabled={creating}
                  onClick={onClose}
                  className="inline-flex h-[42px] items-center justify-center rounded-lg border border-[#E4E2DF] bg-white px-4 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
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
    </Dialog>
  );
}
