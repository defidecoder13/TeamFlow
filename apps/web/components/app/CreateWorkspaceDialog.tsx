/**
 * CreateWorkspaceDialog — modal matching the new design project.
 *
 * Implements the new design layout, input styling, and buttons while
 * connecting to the real TeamFlow workspace creation API and store.
 */

'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from './dialog';
import { AuthError } from '../auth/AuthError';
import { getApiBaseUrl } from '../../lib/config';
import { createWorkspace, type WorkspaceSummary } from '../../lib/workspaces';
import { useWorkspaces } from '../../lib/use-workspaces';
import { X } from 'lucide-react';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (workspace: WorkspaceSummary) => void;
}

export function CreateWorkspaceDialog({ open, onClose, onCreated }: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const { addWorkspace } = useWorkspaces();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Workspace name is required');
      nameInputRef.current?.focus();
      return;
    }
    if (cleanName.length < 2) {
      setError('Workspace name must be at least 2 characters');
      nameInputRef.current?.focus();
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const result = await createWorkspace(getApiBaseUrl(), cleanName);
      if (result.ok) {
        addWorkspace(result.workspace);
        onCreated?.(result.workspace);
        setName('');
        setDomain('');
        setError(null);
        onClose();
        router.push('/app');
        return;
      }
      if (result.kind === 'unauthenticated') {
        onClose();
        router.replace('/sign-in');
        return;
      }
      setError(result.kind === 'failed' ? "Couldn't create workspace" : result.message);
    } catch {
      setError("Couldn't create workspace. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDomain('');
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      labelledBy="create-workspace-modal-title"
      size="md"
      dismissable={!creating}
      initialFocusRef={nameInputRef}
    >
      <div className="-m-5 sm:-m-6">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3.5 border-b border-[#E4E2DF] bg-[#FAF9F8] rounded-t-[18px]">
          <div>
            <h2
              id="create-workspace-modal-title"
              className="text-[17px] font-semibold text-[#171A21] tracking-tight"
            >
              Create a workspace
            </h2>
            <p className="text-[13px] text-[#4F5360] mt-0.5 leading-relaxed">
              Workspaces are shared spaces where your teams, channels, and projects collaborate.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] active:scale-[0.98] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <AuthError message={error} />

          <div className="space-y-1.5">
            <label
              htmlFor="create-ws-name"
              className="text-[13px] font-semibold text-[#171A21]"
            >
              Workspace name
            </label>
            <input
              ref={nameInputRef}
              id="create-ws-name"
              type="text"
              placeholder="e.g. Acme Corp or Stellar Labs"
              value={name}
              disabled={creating}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
                if (!domain) {
                  const slug = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '');
                  setDomain(slug);
                }
              }}
              required
              className="w-full px-3 py-2 text-[14px] text-[#171A21] placeholder:text-[#737782] bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] focus:border-[#3157D5] focus:ring-2 focus:ring-[#EEF2FF] rounded-[8px] outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="create-ws-url"
              className="text-[13px] font-semibold text-[#171A21]"
            >
              Workspace URL
            </label>
            <div className="flex items-center rounded-[8px] border border-[#E4E2DF] bg-white overflow-hidden focus-within:border-[#3157D5] focus-within:ring-2 focus-within:ring-[#EEF2FF] transition-all">
              <span className="px-3 py-2 text-[13px] text-[#737782] bg-[#FAF9F8] border-r border-[#E4E2DF] select-none font-medium">
                teamflow.io/
              </span>
              <input
                id="create-ws-url"
                type="text"
                placeholder="acme-corp"
                value={domain}
                disabled={creating}
                onChange={(e) => setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 px-3 py-2 text-[14px] text-[#171A21] placeholder:text-[#737782] outline-none bg-transparent"
              />
            </div>
            <p className="text-[11px] text-[#737782]">
              Letters, numbers, and dashes only. You can change this later.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E4E2DF]">
            <button
              type="button"
              disabled={creating}
              onClick={handleClose}
              className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] disabled:opacity-50 rounded-[8px] transition-colors active:scale-[0.98] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              {creating ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
