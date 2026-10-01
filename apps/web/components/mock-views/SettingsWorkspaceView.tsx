'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/mock-context';
import { useShell } from '../../lib/shell-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { AuthField } from '../mock-ui/primitives/AuthField';
import { Dialog } from '../mock-ui/primitives/Dialog';
import { getApiBaseUrl } from '../../lib/config';
import {
  deleteWorkspace,
  updateWorkspace,
  validateWorkspaceName,
} from '../../lib/workspaces';
import { ShieldAlert } from 'lucide-react';

export const SettingsWorkspaceView: React.FC = () => {
  const { showToast } = useApp();
  const { session, currentWorkspace, workspaces } = useShell();
  const { push } = useRouter();

  const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const hydratedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!currentWorkspace) return;
    if (hydratedForId.current === currentWorkspace.id) return;
    setWorkspaceName(currentWorkspace.name);
    setNameError('');
    setSaveSuccess(false);
    setFormError(null);
    hydratedForId.current = currentWorkspace.id;
  }, [currentWorkspace]);

  const currentRole = currentWorkspace?.role ?? null;
  const canRename = currentRole === 'OWNER' || currentRole === 'ADMIN';
  const canDelete = currentRole === 'OWNER';

  const avatarText =
    (currentWorkspace?.name ?? 'W').trim().charAt(0).toUpperCase() || 'W';
  const trimmedName = workspaceName.trim();
  const hasNameChanged =
    currentWorkspace !== null && trimmedName !== currentWorkspace.name;

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || isSaving || !canRename) return;

    const err = validateWorkspaceName(workspaceName);
    setNameError(err ?? '');
    if (err) {
      nameInputRef.current?.focus();
      return;
    }
    setFormError(null);
    setSaveSuccess(false);

    if (!hasNameChanged) {
      setSaveSuccess(true);
      return;
    }

    setIsSaving(true);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSaving(false);
      setFormError('Could not connect to API server. Check your connection and try again.');
      return;
    }

    const result = await updateWorkspace(apiBase, currentWorkspace.id, trimmedName);
    setIsSaving(false);

    if (result.ok) {
      workspaces.updateWorkspace(result.workspace);
      setSaveSuccess(true);
      showToast('Workspace renamed successfully.', 'success');
      return;
    }
    if (result.kind === 'unauthenticated') {
      setFormError('You must be signed in to rename this workspace.');
      return;
    }
    if (result.kind === 'forbidden') {
      setFormError('You do not have permission to rename this workspace.');
      return;
    }
    if (result.kind === 'notFound') {
      setFormError('Workspace not found. It may have been deleted.');
      return;
    }
    if (result.kind === 'validation') {
      setNameError(result.message);
      nameInputRef.current?.focus();
      return;
    }
    setFormError("We couldn't update the workspace. Please try again.");
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || isDeleting || !canDelete) return;

    if (confirmInput.trim() !== currentWorkspace.name) {
      setDeleteError(`Please type "${currentWorkspace.name}" to confirm`);
      confirmInputRef.current?.focus();
      return;
    }

    setDeleteError('');
    setIsDeleting(true);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsDeleting(false);
      setDeleteError('Could not connect to API server.');
      return;
    }

    const result = await deleteWorkspace(apiBase, currentWorkspace.id);
    setIsDeleting(false);

    if (result.ok || result.kind === 'notFound') {
      workspaces.removeWorkspace(currentWorkspace.id);
      setDeleteOpen(false);
      setConfirmInput('');
      showToast(`Deleted ${currentWorkspace.name}`, 'success');
      push('/app');
      return;
    }
    if (result.kind === 'unauthenticated') {
      setDeleteError('You must be signed in to delete this workspace.');
      return;
    }
    if (result.kind === 'forbidden') {
      setDeleteError('You do not have permission to delete this workspace.');
      return;
    }
    setDeleteError(result.message ?? 'Could not delete workspace. Please try again.');
  };

  if (session.status === 'loading') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
              Workspace settings
            </h1>
            <p className="text-[14px] text-[#4F5360] mt-1">
              Configure primary metadata, team domain slug, and administrative controls.
            </p>
          </div>
          <div
            role="status"
            aria-label="Loading workspace settings"
            className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs text-[13px] text-[#737782]"
          >
            Loading workspace settings…
          </div>
        </div>
      </main>
    );
  }

  if (session.status !== 'authenticated' || !currentWorkspace) {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
              Workspace settings
            </h1>
          </div>
          <div role="status" className="text-[13px] text-[#4F5360]">
            {session.status === 'unauthenticated' || session.status === 'error'
              ? 'Please sign in to manage workspace settings.'
              : 'Select a workspace to configure its settings.'}
            {session.status === 'unauthenticated' ? (
              <button
                type="button"
                onClick={() => push('/sign-in')}
                className="mt-3 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                Go to sign in
              </button>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
            Workspace settings
          </h1>
          <p className="text-[14px] text-[#4F5360] mt-1">
            Configure primary metadata, team domain slug, and administrative controls.
          </p>
        </div>

        {/* General Settings Card */}
        <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-[#E4E2DF]">
            <div className="w-10 h-10 rounded-[8px] bg-[#2E3440] text-white font-bold flex items-center justify-center text-[14px]">
              {avatarText}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#171A21]">
                {currentWorkspace.name}
              </h2>
              <span className="text-[12px] text-[#737782] uppercase tracking-wider font-semibold">
                {currentWorkspace.slug}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveName} noValidate className="space-y-4">
            <AuthField
              ref={nameInputRef}
              label="Workspace name"
              value={workspaceName}
              disabled={!canRename || isSaving}
              onChange={(e) => {
                setWorkspaceName(e.target.value);
                if (nameError) setNameError('');
                if (saveSuccess) setSaveSuccess(false);
                if (formError) setFormError(null);
              }}
              error={nameError}
              hint={
                canRename
                  ? 'This is the name displayed to teammates in menus and email invites.'
                  : 'Only owners and admins can rename this workspace.'
              }
              required
            />

            {/* Slug immutable single line per spec */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="workspace-slug-immutable"
                className="text-[13px] font-semibold text-[#171A21]"
              >
                Workspace URL (Immutable)
              </label>
              <div className="flex items-center rounded-[8px] border border-[#E4E2DF] bg-[#F6F5F3] px-3 py-2 text-[14px] text-[#737782] select-all">
                <span className="font-normal font-sans" id="workspace-slug-immutable">
                  {currentWorkspace.slug}
                </span>
              </div>
              <p className="text-[12px] text-[#737782]">
                Workspace slug paths are locked to preserve permalinks and API tokens.
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700"
              >
                {formError}
              </div>
            )}
            {saveSuccess && (
              <div
                role="status"
                className="rounded-[8px] bg-emerald-50 border border-emerald-200 px-3 py-2 text-[13px] text-emerald-700"
              >
                Workspace name updated.
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={!canRename || isSaving}
                aria-busy={isSaving}
                className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors active:scale-[0.98] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#3157D5] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Red Danger Zone */}
        <div className="border border-rose-200 bg-white rounded-[12px] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-[#C94A45]">
            <ShieldAlert className="w-5 h-5" />
            <h2 className="text-[16px] font-semibold">Danger zone</h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div>
              <p className="text-[14px] font-semibold text-[#171A21]">
                Delete this workspace
              </p>
              <p className="text-[13px] text-[#4F5360] max-w-md mt-0.5">
                Permanently remove {currentWorkspace.name}, including all channels, message
                history, and member access. This cannot be undone.
              </p>
              {!canDelete && (
                <p className="mt-2 text-[12px] text-[#737782]">
                  Only the workspace owner can delete this workspace.
                </p>
              )}
            </div>

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  setConfirmInput('');
                  setDeleteError('');
                  setDeleteOpen(true);
                }}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-[#C94A45] border border-rose-200 text-[13px] font-medium rounded-[8px] transition-colors shrink-0 self-start sm:self-auto active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#C94A45]"
              >
                Delete workspace
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Workspace Type-to-Confirm Dialog */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => {
          if (!isDeleting) setDeleteOpen(false);
        }}
        title={`Delete ${currentWorkspace.name}?`}
        description={`This action is permanent and irreversible. All channels, messages, attachments, and settings will be permanently erased.`}
        role="alertdialog"
        initialFocusRef={confirmInputRef}
      >
        <form onSubmit={handleDeleteSubmit} noValidate className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-[8px] text-[13px] text-[#C94A45] space-y-1">
            <p className="font-semibold">Warning: Destructive Action</p>
            <p>
              To confirm deletion, type{' '}
              <strong className="underline">{currentWorkspace.name}</strong> below.
            </p>
          </div>

          <AuthField
            ref={confirmInputRef}
            label="Confirmation"
            placeholder={currentWorkspace.name}
            value={confirmInput}
            disabled={isDeleting}
            onChange={(e) => {
              setConfirmInput(e.target.value);
              if (deleteError) setDeleteError('');
            }}
            error={deleteError}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E2DF]">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 text-[13px] font-medium text-[#47464b] hover:text-[#1a1b22] rounded-[8px] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting}
              aria-busy={isDeleting}
              className="px-4 py-2 text-[13px] font-medium text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : `Delete ${currentWorkspace.name}`}
            </button>
          </div>
        </form>
      </Dialog>
    </main>
  );
};
