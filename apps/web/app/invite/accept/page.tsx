/**
 * Invitation acceptance route (Phase 2F-B, development flow).
 *
 * `GET /invite/accept?token=…` — email delivery does not exist, so creators
 * share this local link directly. Flow: missing token → error; unauthenticated
 * → sign-in prompt preserving the token via a safe `?next=`; authenticated →
 * explicit Accept action POSTs the token (identity comes from the session);
 * success shows the real workspace with an Open-workspace action.
 */

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { getApiBaseUrl } from '../../../lib/config';
import { acceptInvitation } from '../../../lib/invitations';
import { useSessionUser } from '../../../lib/use-session-user';

type AcceptState =
  | { status: 'idle' }
  | { status: 'accepting' }
  | { status: 'accepted'; workspaceName: string }
  | { status: 'invalid' }
  | { status: 'forbidden'; sessionEmail: string }
  | { status: 'failed' };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbf8ff] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
        <div className="mt-1.5 text-sm leading-relaxed text-zinc-500">{children}</div>
      </div>
    </main>
  );
}

function AcceptInvitationView({ token }: { token: string }) {
  const session = useSessionUser();
  const [state, setState] = useState<AcceptState>({ status: 'idle' });

  if (session.status === 'loading') {
    return (
      <Panel title="Checking your invitation">
        <p role="status">Loading…</p>
      </Panel>
    );
  }

  if (session.status === 'unauthenticated') {
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    return (
      <Panel title="You’re invited to TeamFlow">
        <p>Sign in to accept this workspace invitation.</p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Sign in to accept
        </Link>
      </Panel>
    );
  }

  if (session.status === 'error') {
    return (
      <Panel title="Couldn’t load your session">
        <p>{session.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Try again
        </button>
      </Panel>
    );
  }

  async function handleAccept() {
    setState({ status: 'accepting' });
    try {
      const result = await acceptInvitation(getApiBaseUrl(), token);
      if (result.ok) {
        setState({ status: 'accepted', workspaceName: result.workspace.name });
        return;
      }
      if (result.kind === 'unauthenticated') {
        window.location.reload();
        return;
      }
      if (result.kind === 'invalid') {
        setState({ status: 'invalid' });
        return;
      }
      if (result.kind === 'forbidden') {
        const sessionEmail =
          session.status === 'authenticated' ? session.user.email : 'your account';
        setState({ status: 'forbidden', sessionEmail });
        return;
      }
      setState({ status: 'failed' });
    } catch {
      setState({ status: 'failed' });
    }
  }

  if (state.status === 'accepted') {
    return (
      <Panel title="You’ve joined the workspace">
        <p>
          Welcome to <span className="font-medium text-zinc-900">{state.workspaceName}</span>.
        </p>
        <Link
          href="/app"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Open workspace
        </Link>
      </Panel>
    );
  }

  if (state.status === 'invalid') {
    return (
      <Panel title="Invitation unavailable">
        <p>This invitation is invalid or has expired. Ask the sender for a new one.</p>
      </Panel>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <Panel title="Wrong account">
        <p>
          This invitation was sent to a different email address. You&apos;re signed in as{' '}
          {state.sessionEmail}.
        </p>
      </Panel>
    );
  }

  if (state.status === 'failed') {
    return (
      <Panel title="Couldn’t accept the invitation">
        <p>Something went wrong. Please try again.</p>
        <button
          type="button"
          onClick={() => setState({ status: 'idle' })}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Try again
        </button>
      </Panel>
    );
  }

  const accepting = state.status === 'accepting';
  return (
    <Panel title="You’re invited to TeamFlow">
      <p>Accept to join the workspace as a member.</p>
      <button
        type="button"
        disabled={accepting}
        onClick={() => void handleAccept()}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {accepting ? 'Accepting…' : 'Accept invitation'}
      </button>
    </Panel>
  );
}

function AcceptRoute() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  if (!token) {
    return (
      <Panel title="Invitation unavailable">
        <p>This invitation link is missing its token. Ask the sender for a new link.</p>
      </Panel>
    );
  }
  return <AcceptInvitationView token={token} />;
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <Panel title="Checking your invitation">
          <p role="status">Loading…</p>
        </Panel>
      }
    >
      <AcceptRoute />
    </Suspense>
  );
}
