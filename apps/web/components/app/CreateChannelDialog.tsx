/**
 * Create-channel dialog (Phase 3B).
 *
 * Focused responsibilities: name + optional description + visibility,
 * client-side validation mirroring the backend contract, submit state, POST
 * through the channel client, and safe errors. Sends ONLY name/description/
 * type — slug, workspace, and creator stay server-side. Reports the real
 * server response (including its generated slug) to the parent.
 */

'use client';

import { useEffect, useState } from 'react';
import { AuthError } from '../auth/AuthError';
import { AuthField } from '../auth/AuthField';
import { AuthSubmitButton } from '../auth/AuthSubmitButton';
import { getApiBaseUrl } from '../../lib/config';
import {
  createChannel,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  type Channel,
  type ChannelType,
} from '../../lib/channels';

const CREATE_FALLBACK_MESSAGE = "We couldn't create the channel. Please try again.";

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

interface CreateChannelDialogProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
  onUnauthenticated: () => void;
}

export function CreateChannelDialog({
  workspaceId,
  workspaceName,
  onClose,
  onCreated,
  onUnauthenticated,
}: CreateChannelDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChannelType>('PUBLIC');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const nameError = touched ? validateName(name) : null;
  const descriptionError = touched ? validateDescription(description) : null;

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
    if (validateName(name) || validateDescription(description)) {
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const trimmedDescription = description.trim();
      const result = await createChannel(getApiBaseUrl(), workspaceId, {
        name: name.trim(),
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        type,
      });
      if (result.ok) {
        onCreated(result.channel);
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-channel-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <h2
          id="create-channel-title"
          className="text-base font-semibold tracking-tight text-zinc-900"
        >
          Create a channel
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">in {workspaceName}</p>
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <AuthError message={formError} />
          <AuthField
            id="channel-name"
            label="Channel name"
            type="text"
            autoComplete="off"
            required
            autoFocus
            maxLength={MAX_CHANNEL_NAME_LENGTH}
            placeholder="e.g. Engineering"
            value={name}
            error={nameError}
            disabled={creating}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <AuthField
            id="channel-description"
            label="Description (optional)"
            type="text"
            autoComplete="off"
            value={description}
            error={descriptionError}
            disabled={creating}
            maxLength={MAX_CHANNEL_DESCRIPTION_LENGTH}
            placeholder="What is this channel for?"
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <fieldset disabled={creating}>
            <legend className="mb-1.5 text-[13px] font-medium text-zinc-700">
              Who can access this channel?
            </legend>
            <div className="space-y-2">
              {(
                [
                  { value: 'PUBLIC', label: 'Public', hint: 'Everyone in the workspace can join.' },
                  { value: 'PRIVATE', label: 'Private', hint: 'Only invited members can join.' },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={[
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                    type === option.value
                      ? 'border-zinc-900 bg-zinc-900/[0.03]'
                      : 'border-stone-200 hover:border-stone-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="channel-type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => setType(option.value)}
                    className="mt-0.5 h-4 w-4 accent-zinc-900"
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-900">{option.label}</span>
                    <span className="block text-[13px] text-stone-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
              <AuthSubmitButton pending={creating} pendingLabel="Creating channel…">
                Create channel
              </AuthSubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
