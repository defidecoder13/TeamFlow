/**
 * Edit-channel dialog (Phase 3B).
 *
 * Minimal metadata editing: name and description only. Slug, workspace,
 * creator, and type are immutable here (enforced server-side as well).
 * Permission display is the parent's job; the backend stays authoritative
 * (403 surfaces as a safe message).
 */

'use client';

import { useEffect, useState } from 'react';
import { AuthError } from '../auth/AuthError';
import { AuthField } from '../auth/AuthField';
import { AuthSubmitButton } from '../auth/AuthSubmitButton';
import { getApiBaseUrl } from '../../lib/config';
import {
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  updateChannel,
  type Channel,
} from '../../lib/channels';

const UPDATE_FALLBACK_MESSAGE = "We couldn't update the channel. Please try again.";
const FORBIDDEN_MESSAGE = 'You do not have permission to edit this channel.';

function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Channel name is required.';
  }
  if (trimmed.length > MAX_CHANNEL_NAME_LENGTH) {
    return `Use ${MAX_CHANNEL_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

function validateDescription(value: string): string | null {
  if (value.trim().length > MAX_CHANNEL_DESCRIPTION_LENGTH) {
    return `Use ${MAX_CHANNEL_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  return null;
}

interface EditChannelDialogProps {
  workspaceId: string;
  channel: Channel;
  onClose: () => void;
  onUpdated: (channel: Channel) => void;
  onUnauthenticated: () => void;
}

export function EditChannelDialog({
  workspaceId,
  channel,
  onClose,
  onUpdated,
  onUnauthenticated,
}: EditChannelDialogProps) {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? '');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameError = touched ? validateName(name) : null;
  const descriptionError = touched ? validateDescription(description) : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [saving, onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setTouched(true);
    if (validateName(name) || validateDescription(description)) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const trimmedDescription = description.trim();
      const result = await updateChannel(getApiBaseUrl(), workspaceId, channel.slug, {
        name: name.trim(),
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      });
      if (result.ok) {
        onUpdated(result.channel);
        return;
      }
      if (result.kind === 'unauthenticated') {
        onUnauthenticated();
        return;
      }
      if (result.kind === 'forbidden') {
        setFormError(FORBIDDEN_MESSAGE);
        return;
      }
      if (result.kind === 'notFound' || result.kind === 'failed') {
        setFormError(UPDATE_FALLBACK_MESSAGE);
        return;
      }
      setFormError(result.message);
    } catch {
      setFormError(UPDATE_FALLBACK_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/25 p-4"
      onClick={() => {
        if (!saving) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-channel-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <h2
          id="edit-channel-title"
          className="text-base font-semibold tracking-tight text-zinc-900"
        >
          Edit channel
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
          Only the name and description can be changed here.
        </p>
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <AuthError message={formError} />
          <AuthField
            id="edit-channel-name"
            label="Channel name"
            type="text"
            autoComplete="off"
            required
            autoFocus
            maxLength={MAX_CHANNEL_NAME_LENGTH}
            value={name}
            error={nameError}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <AuthField
            id="edit-channel-description"
            label="Description (optional)"
            type="text"
            autoComplete="off"
            value={description}
            error={descriptionError}
            disabled={saving}
            maxLength={MAX_CHANNEL_DESCRIPTION_LENGTH}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <AuthSubmitButton pending={saving} pendingLabel="Saving…">
                Save changes
              </AuthSubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
