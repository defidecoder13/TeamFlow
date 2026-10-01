import React, { useState, useRef } from 'react';
import { Dialog } from '../primitives/Dialog';
import { AuthField } from '../primitives/AuthField';
import { useApp } from '../../../lib/mock-context';
import { useShell } from '../../../lib/shell-context';

export const CreateWorkspaceDialog: React.FC = () => {
  const { isCreateWorkspaceOpen, setCreateWorkspaceOpen, showToast } = useApp();
  const { createWorkspace } = useShell();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) {
      setError('Workspace name is required');
      nameInputRef.current?.focus();
      return;
    }
    if (name.trim().length < 2) {
      setError('Workspace name must be at least 2 characters');
      nameInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    const result = await createWorkspace({
      name: name.trim(),
      slug: domain.trim() || undefined,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      if (result.kind === 'validation') {
        setError(result.message ?? 'Invalid workspace details.');
      } else if (result.kind === 'conflict') {
        setError(result.message ?? 'That workspace URL is already taken.');
      } else if (result.kind === 'unauthenticated') {
        setError('Your session expired. Please sign in again.');
      } else {
        setError(result.message ?? "We couldn't create the workspace. Please try again.");
      }
      nameInputRef.current?.focus();
      return;
    }

    showToast(`Workspace "${result.workspace.name}" created successfully.`, 'success');
    setName('');
    setDomain('');
    setError('');
    setCreateWorkspaceOpen(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setDomain('');
    setError('');
    setCreateWorkspaceOpen(false);
  };

  return (
    <Dialog
      isOpen={isCreateWorkspaceOpen}
      onClose={handleClose}
      title="Create a workspace"
      description="Workspaces are shared spaces where your teams, channels, and projects collaborate."
      initialFocusRef={nameInputRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          ref={nameInputRef}
          label="Workspace name"
          placeholder="e.g. Acme Corp or Stellar Labs"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
            if (!domain) {
              const slug = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
              setDomain(slug);
            }
          }}
          error={error}
          required
        />

        <AuthField
          label="Workspace URL"
          prefixText="teamflow.io/"
          placeholder="acme-corp"
          value={domain}
          onChange={(e) => setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          hint="Letters, numbers, and dashes only. You can change this later."
        />

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
            {isSubmitting ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
