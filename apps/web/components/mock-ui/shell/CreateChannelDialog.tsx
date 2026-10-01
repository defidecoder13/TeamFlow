import React, { useState, useRef } from 'react';
import { Dialog } from '../primitives/Dialog';
import { AuthField } from '../primitives/AuthField';
import { useApp } from '../../../lib/mock-context';
import { useShell } from '../../../lib/shell-context';
import { useRouter } from '../../../lib/mock-hooks/useRouter';
import { MAX_CHANNEL_NAME_LENGTH, MAX_CHANNEL_TOPIC_LENGTH } from '../../../lib/channels';
import { Hash, Lock } from 'lucide-react';

export const CreateChannelDialog: React.FC = () => {
  const { isCreateChannelOpen, setCreateChannelOpen, showToast } = useApp();
  const { createChannel, currentWorkspace } = useShell();
  const { push } = useRouter();

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleanName) {
      setError('Channel name is required');
      nameInputRef.current?.focus();
      return;
    }
    if (cleanName.length < 2) {
      setError('Channel name must be at least 2 characters');
      nameInputRef.current?.focus();
      return;
    }
    if (cleanName.length > MAX_CHANNEL_NAME_LENGTH) {
      setError(`Channel name must be ${MAX_CHANNEL_NAME_LENGTH} characters or fewer`);
      nameInputRef.current?.focus();
      return;
    }
    if (topic.trim().length > MAX_CHANNEL_TOPIC_LENGTH) {
      setError(`Topic must be ${MAX_CHANNEL_TOPIC_LENGTH} characters or fewer`);
      return;
    }
    if (!currentWorkspace) {
      setError('Select a workspace first.');
      return;
    }

    setIsSubmitting(true);
    const result = await createChannel({
      name: cleanName,
      description: description.trim() || undefined,
      topic: topic.trim() || undefined,
      type: isPrivate ? 'PRIVATE' : 'PUBLIC',
    });
    setIsSubmitting(false);

    if (!result.ok) {
      if (result.kind === 'validation') {
        setError(result.message ?? 'Invalid channel details.');
      } else if (result.kind === 'conflict') {
        setError(result.message ?? 'A channel with that name already exists.');
      } else if (result.kind === 'unauthenticated') {
        setError('Your session expired. Please sign in again.');
      } else if (result.kind === 'forbidden') {
        setError('You do not have permission to create channels here.');
      } else {
        setError(result.message ?? "We couldn't create the channel. Please try again.");
      }
      nameInputRef.current?.focus();
      return;
    }

    showToast(`Channel #${result.channel.slug} created.`, 'success');
    setName('');
    setTopic('');
    setDescription('');
    setIsPrivate(false);
    setError('');
    setCreateChannelOpen(false);

    push(`/app/channels/${result.channel.slug}`);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setTopic('');
    setDescription('');
    setIsPrivate(false);
    setError('');
    setCreateChannelOpen(false);
  };

  return (
    <Dialog
      isOpen={isCreateChannelOpen}
      onClose={handleClose}
      title="Create a channel"
      description="Channels are where your team communicates. They are best organized around a topic — #product-launch, for example."
      initialFocusRef={nameInputRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          ref={nameInputRef}
          label="Name"
          prefixText="#"
          placeholder="e.g. plan-q4"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
          error={error}
          hint="Names must be lowercase, without spaces or periods."
          required
        />

        <AuthField
          label="Topic (optional)"
          placeholder="What is this channel about?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="channel-desc" className="text-[13px] font-semibold text-[#171A21]">
            Description (optional)
          </label>
          <textarea
            id="channel-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide context for what should be shared here"
            className="w-full px-3 py-2 text-[14px] text-[#171A21] placeholder:text-[#737782] bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#EEF2FF] focus-visible:border-[#3157D5] resize-none"
          />
        </div>

        {/* Privacy toggle */}
        <div className="pt-2 border-t border-[#E4E2DF]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-[8px] bg-[#F6F5F3] text-[#171A21] mt-0.5">
                {isPrivate ? <Lock className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#171A21]">
                  {isPrivate ? 'Make private' : 'Make public'}
                </p>
                <p className="text-[12px] text-[#4F5360] leading-relaxed">
                  {isPrivate
                    ? 'When a channel is private, it can only be viewed or joined by invitation.'
                    : 'Anyone in this workspace will be able to browse and join this channel.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isPrivate}
              onClick={() => setIsPrivate(!isPrivate)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] ${
                isPrivate ? 'bg-[#171A21]' : 'bg-[#E4E2DF]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isPrivate ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E4E2DF]">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors active:scale-[0.98] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#3157D5] disabled:opacity-60"
          >
            {isSubmitting ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
