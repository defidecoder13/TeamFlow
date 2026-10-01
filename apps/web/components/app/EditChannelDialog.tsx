/**
 * Edit-channel dialog (Phase 3B).
 *
 * Minimal metadata editing: name and description only. Slug, workspace,
 * creator, and type are immutable here (enforced server-side as well).
 * Permission display is the parent's job; the backend stays authoritative
 * (403 surfaces as a safe message).
 */

'use client';

import { useState } from 'react';
import { Dialog } from './dialog';
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
    <Dialog open onClose={onClose} labelledBy="edit-channel-title" size="sm" dismissable={!saving}>
      <div>
        <h2
          id="edit-channel-title"
          className="text-[17px] font-semibold tracking-tight text-[#171A21]"
        >
          Edit channel
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#737782]">
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
          <div className="flex gap-2 pt-2 border-t border-[#E4E2DF]">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="inline-flex h-[42px] items-center justify-center rounded-lg border border-[#E4E2DF] bg-white px-4 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
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
    </Dialog>
  );
}
