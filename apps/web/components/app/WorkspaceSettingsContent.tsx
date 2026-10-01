/**
 * Workspace Settings content (Phase 4K.5).
 *
 * Rename (OWNER/ADMIN) + Danger zone delete (OWNER-only with type-to-confirm).
 * Slug is displayed read-only — renaming does NOT change slug/URL.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { AuthField } from '../auth/AuthField';
import { getApiBaseUrl } from '../../lib/config';
import { deleteWorkspace, updateWorkspace, validateWorkspaceName } from '../../lib/workspaces';
import type { WorkspaceRole } from '../../lib/workspaces';

interface WorkspaceSettingsContentProps {
  workspace: { id: string; name: string; slug: string };
  currentUserRole: WorkspaceRole | null | undefined;
  onRenamed: (workspace: {
    id: string;
    name: string;
    slug: string;
    role: WorkspaceRole;
    createdAt: string;
    updatedAt: string;
  }) => void;
  onDeleted: (workspaceId: string) => void;
  onUnauthenticated: () => void;
}

export function WorkspaceSettingsContent({
  workspace,
  currentUserRole,
  onRenamed,
  onDeleted,
  onUnauthenticated,
}: WorkspaceSettingsContentProps) {
  const canRename = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';
  const canDelete = currentUserRole === 'OWNER';

  const [name, setName] = useState(workspace.name);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setName(workspace.name);
    setTouched(false);
    setSaveError(null);
    setSaveSuccess(null);
    setConfirmName('');
    setDeleteError(null);
  }, [workspace.id, workspace.name]);

  const validationError = touched ? validateWorkspaceName(name) : null;
  const trimmedName = name.trim();
  const hasNameChanged = trimmedName !== workspace.name;
  const confirmMatches = confirmName === workspace.name;

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!canRename || saving) return;
    setTouched(true);
    const err = validateWorkspaceName(name);
    if (err) {
      nameInputRef.current?.focus();
      return;
    }
    if (!hasNameChanged) {
      setSaveSuccess('No changes to save.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setSaving(false);
      setSaveError('Could not connect to API server. Check your connection and try again.');
      saveErrorRef.current?.focus();
      return;
    }
    const result = await updateWorkspace(apiBase, workspace.id, trimmedName);
    setSaving(false);
    if (result.ok) {
      setSaveSuccess('Workspace name updated.');
      onRenamed(result.workspace);
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    if (result.kind === 'forbidden') {
      setSaveError('You do not have permission to rename this workspace.');
      saveErrorRef.current?.focus();
      return;
    }
    if (result.kind === 'notFound') {
      setSaveError('Workspace not found. It may have been deleted.');
      saveErrorRef.current?.focus();
      return;
    }
    if (result.kind === 'validation') {
      setSaveError(result.message);
      nameInputRef.current?.focus();
      return;
    }
    setSaveError('Could not update workspace. Check your connection and try again.');
    saveErrorRef.current?.focus();
  }

  async function handleDelete() {
    if (!canDelete || deleting) return;
    if (!confirmMatches) return;
    setDeleting(true);
    setDeleteError(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setDeleting(false);
      setDeleteError('Could not connect to API server.');
      return;
    }
    const result = await deleteWorkspace(apiBase, workspace.id);
    setDeleting(false);
    if (result.ok) {
      onDeleted(workspace.id);
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    if (result.kind === 'forbidden') {
      setDeleteError('You do not have permission to delete this workspace.');
      return;
    }
    if (result.kind === 'notFound') {
      onDeleted(workspace.id);
      return;
    }
    setDeleteError(result.message ?? 'Could not delete workspace. Please try again.');
  }

  const initial = workspace.name.trim().charAt(0).toUpperCase() || 'W';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
          Workspace settings
        </h1>
        <p className="text-[14px] text-[#4F5360] mt-1">
          Configure primary metadata, team domain slug, and administrative controls.
        </p>
      </div>

      <section
        aria-labelledby="rename-heading"
        className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs space-y-6"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-[#E4E2DF]">
          <div className="w-10 h-10 rounded-[8px] bg-[#2E3440] text-white font-bold flex items-center justify-center text-[14px]">
            {initial}
          </div>
          <div>
            <h2 id="rename-heading" className="text-[15px] font-semibold text-[#171A21]">
              {workspace.name}
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[#4F5360]">
              Renaming does not change the workspace URL — the slug below is immutable.
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="workspace-slug" className="text-[13px] font-semibold text-[#171A21]">
            Workspace URL (Immutable)
          </label>
          <div className="flex items-center rounded-[8px] border border-[#E4E2DF] bg-[#F6F5F3] px-3 py-2 text-[14px] text-[#737782] select-all">
            <input
              id="workspace-slug"
              value={workspace.slug}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className="bg-transparent border-none outline-none text-[#737782] w-full cursor-default text-[14px]"
            />
          </div>
          <p className="text-[12px] text-[#737782]">
            Workspace slug paths are locked to preserve permalinks and API tokens.
          </p>
        </div>

        <form onSubmit={handleRename} noValidate className="space-y-4">
          <div>
            <AuthField
              ref={nameInputRef}
              id="workspace-name"
              label="Workspace name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (saveSuccess) setSaveSuccess(null);
              }}
              onBlur={() => setTouched(true)}
              maxLength={100}
              disabled={!canRename || saving}
              error={validationError}
              placeholder="Enter workspace name"
            />
            {!canRename ? (
              <p className="mt-1.5 text-xs text-[#737782]">
                Only owners and admins can rename this workspace.
              </p>
            ) : null}
          </div>

          {saveError ? (
            <p
              ref={saveErrorRef}
              tabIndex={-1}
              role="alert"
              className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 outline-none"
            >
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p role="status" className="rounded-[8px] bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              {saveSuccess}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={!canRename || saving}
              aria-busy={saving}
              className="inline-flex h-9 items-center justify-center rounded-[8px] bg-[#2E3440] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98] motion-reduce:active:scale-100 shadow-2xs"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <section
        aria-labelledby="danger-heading"
        className="border border-rose-200 bg-white rounded-[12px] p-6 shadow-2xs space-y-4"
      >
        <div className="flex items-center gap-2 text-[#C94A45]">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <h2 id="danger-heading" className="text-[16px] font-semibold text-[#C94A45]">
            Danger zone
          </h2>
        </div>
        <p className="text-[13px] leading-relaxed text-[#4F5360]">
          Deleting a workspace is permanent and removes all channels, messages, and memberships.
          Your user account will remain.
        </p>

        {!canDelete ? (
          <p className="mt-4 rounded-[8px] bg-[#F6F5F3] border border-[#E4E2DF] px-3 py-2 text-xs text-[#737782]">
            Only the workspace owner can delete this workspace.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label
              htmlFor="confirm-workspace-name"
              className="text-[13px] font-medium text-[#4F5360]"
            >
              Type <span className="font-semibold text-[#171A21]">{workspace.name}</span> to confirm
            </label>
            <input
              id="confirm-workspace-name"
              type="text"
              autoComplete="off"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspace.name}
              disabled={deleting}
              className="h-10 w-full rounded-[8px] border border-[#E4E2DF] bg-white px-3 text-[14px] text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#C94A45] focus:ring-2 focus:ring-rose-100 disabled:opacity-60 transition-all"
            />
            {deleteError ? (
              <p role="alert" className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={!confirmMatches || deleting}
                aria-label={`Delete ${workspace.name}`}
                className="inline-flex h-9 items-center justify-center rounded-[8px] bg-[#C94A45] px-4 text-[13px] font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98] motion-reduce:active:scale-100 shadow-2xs"
              >
                {deleting ? 'Deleting…' : 'Delete workspace'}
              </button>
              <p className="text-xs text-[#737782]">This cannot be undone.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
