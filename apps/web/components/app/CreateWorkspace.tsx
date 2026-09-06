/**
 * Workspace creation form (Phase 2D).
 *
 * Focused responsibilities: controlled name input, client-side validation,
 * submit state, POST through the workspace client, safe errors, and a
 * success callback with the real API response. Ownership and slug stay
 * server-side — only `name` is ever sent.
 */

'use client';

import { useState } from 'react';
import { AuthError } from '../auth/AuthError';
import { AuthField } from '../auth/AuthField';
import { AuthSubmitButton } from '../auth/AuthSubmitButton';
import { getApiBaseUrl } from '../../lib/config';
import {
  MAX_WORKSPACE_NAME_LENGTH,
  createWorkspace,
  validateWorkspaceName,
  type WorkspaceSummary,
} from '../../lib/workspaces';

const CREATE_FALLBACK_MESSAGE = "We couldn't create the workspace. Please try again.";

interface CreateWorkspaceProps {
  onCreated: (workspace: WorkspaceSummary) => void;
  onUnauthenticated: () => void;
}

export function CreateWorkspace({ onCreated, onUnauthenticated }: CreateWorkspaceProps) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const nameError = touched ? validateWorkspaceName(name) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (creating) {
      return;
    }
    setTouched(true);
    if (validateWorkspaceName(name)) {
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const result = await createWorkspace(getApiBaseUrl(), name.trim());
      if (result.ok) {
        onCreated(result.workspace);
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
    <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4 text-left">
      <AuthError message={formError} />
      <AuthField
        id="workspace-name"
        label="Workspace name"
        type="text"
        autoComplete="off"
        required
        autoFocus
        maxLength={MAX_WORKSPACE_NAME_LENGTH}
        placeholder="e.g. Acme Studio"
        value={name}
        error={nameError}
        disabled={creating}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => setTouched(true)}
      />
      <div className="pt-1">
        <AuthSubmitButton pending={creating} pendingLabel="Creating workspace…">
          Create workspace
        </AuthSubmitButton>
      </div>
    </form>
  );
}
