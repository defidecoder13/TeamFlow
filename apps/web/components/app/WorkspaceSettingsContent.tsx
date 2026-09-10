/**
 * Workspace Settings content (Phase 4K.5).
 *
 * Rename (OWNER/ADMIN) + Danger zone delete (OWNER-only with type-to-confirm).
 * Slug is displayed read-only — renaming does NOT change slug/URL.
 */

'use client';

import { useEffect, useState } from 'react';
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
    if (err) return;
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
      setSaveError('Could not connect to API server.');
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
      return;
    }
    if (result.kind === 'notFound') {
      setSaveError('Workspace not found. It may have been deleted.');
      return;
    }
    if (result.kind === 'validation') {
      setSaveError(result.message);
      return;
    }
    setSaveError('Could not update workspace. Please try again.');
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
      // Treat as gone — clean local state
      onDeleted(workspace.id);
      return;
    }
    setDeleteError(result.message ?? 'Could not delete workspace. Please try again.');
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">
          Workspace settings
        </p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-stone-900">Workspace</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-stone-500">
          Manage your workspace name and danger zone.
        </p>
      </div>

      <section
        aria-labelledby="rename-heading"
        className="rounded-xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <h2 id="rename-heading" className="text-[13px] font-semibold text-stone-900">
          Workspace name
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
          Renaming does not change the workspace URL. The slug stays{' '}
          <span className="font-mono text-stone-700">{workspace.slug}</span>.
        </p>

        <div className="mt-4 grid gap-2">
          <label htmlFor="workspace-slug" className="text-[13px] font-medium text-stone-700">
            Workspace URL slug (read-only)
          </label>
          <input
            id="workspace-slug"
            value={workspace.slug}
            readOnly
            aria-readonly="true"
            className="h-9 w-full rounded-md border border-stone-200 bg-stone-50 px-3 font-mono text-sm text-stone-500"
          />
          <p className="text-xs text-stone-500">
            The URL slug is immutable and stays the same after renaming.
          </p>
        </div>

        <form onSubmit={handleRename} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="workspace-name" className="text-[13px] font-medium text-stone-700">
              Workspace name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (saveSuccess) setSaveSuccess(null);
              }}
              onBlur={() => setTouched(true)}
              maxLength={100}
              disabled={!canRename || saving}
              aria-invalid={validationError ? 'true' : undefined}
              className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder:text-stone-400 hover:border-stone-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-stone-50 disabled:text-stone-500"
              placeholder="Enter workspace name"
            />
            {validationError ? (
              <p role="alert" className="mt-1.5 text-xs text-red-600">
                {validationError}
              </p>
            ) : null}
            {!canRename ? (
              <p className="mt-1.5 text-xs text-stone-500">
                Only owners and admins can rename this workspace.
              </p>
            ) : null}
          </div>

          {saveError ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {saveSuccess}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!canRename || saving || !hasNameChanged || !!validationError}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {hasNameChanged && canRename ? (
              <span className="text-xs text-stone-500">Slug will not change.</span>
            ) : null}
          </div>
        </form>
      </section>

      <section
        aria-labelledby="danger-heading"
        className="rounded-xl border border-red-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <h2 id="danger-heading" className="text-[13px] font-semibold text-red-700">
          Danger zone
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
          Deleting a workspace is permanent and removes all channels, messages, and memberships.
          Your user account will remain.
        </p>

        {!canDelete ? (
          <p className="mt-4 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
            Only the workspace owner can delete this workspace.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label
              htmlFor="confirm-workspace-name"
              className="text-[13px] font-medium text-stone-700"
            >
              Type <span className="font-semibold text-stone-900">{workspace.name}</span> to confirm
            </label>
            <input
              id="confirm-workspace-name"
              type="text"
              autoComplete="off"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspace.name}
              disabled={deleting}
              className="h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-60"
            />
            {deleteError ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!confirmMatches || deleting}
              aria-label="Delete workspace"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete workspace'}
            </button>
            <p className="text-xs text-stone-500">This cannot be undone.</p>
          </div>
        )}
      </section>
    </div>
  );
}
