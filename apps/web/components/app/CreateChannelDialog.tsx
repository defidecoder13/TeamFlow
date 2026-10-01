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

import { useState } from 'react';
import { Dialog } from './dialog';
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
      if (result.kind === 'forbidden') {
        setFormError('You do not have permission to create channels in this workspace.');
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
    <Dialog
      open
      onClose={onClose}
      labelledBy="create-channel-title"
      size="sm"
      dismissable={!creating}
    >
      <div>
        <h2
          id="create-channel-title"
          className="text-[17px] font-semibold tracking-tight text-[#171A21]"
        >
          Create a channel
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#737782]">in {workspaceName}</p>
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
            <legend className="mb-1.5 text-[13px] font-medium text-[#171A21]">
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
                    'flex cursor-pointer items-start gap-2.5 rounded-[8px] border px-3 py-2.5 transition-colors',
                    type === option.value
                      ? 'border-[#3157D5] bg-[#EEF2FF]/40'
                      : 'border-[#E4E2DF] hover:border-[#D2D0CC]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="channel-type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => setType(option.value)}
                    className="mt-0.5 h-4 w-4 accent-[#171A21]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-[#171A21]">{option.label}</span>
                    <span className="block text-[13px] text-[#737782]">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
              <AuthSubmitButton pending={creating} pendingLabel="Creating channel…">
                Create channel
              </AuthSubmitButton>
            </div>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
