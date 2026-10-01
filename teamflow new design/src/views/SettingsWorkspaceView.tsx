import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../hooks/useRouter';
import { AuthField } from '../components/primitives/AuthField';
import { Dialog } from '../components/primitives/Dialog';
import { Building2, AlertTriangle, Check, ShieldAlert } from 'lucide-react';

export const SettingsWorkspaceView: React.FC = () => {
  const { activeWorkspace, renameWorkspace, deleteWorkspace, showToast } = useApp();
  const { push } = useRouter();

  const [workspaceName, setWorkspaceName] = useState(activeWorkspace.name);
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Danger zone delete modal
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) {
      setNameError('Workspace name cannot be empty');
      nameInputRef.current?.focus();
      return;
    }
    if (workspaceName.trim().length < 2) {
      setNameError('Workspace name must be at least 2 characters');
      nameInputRef.current?.focus();
      return;
    }
    renameWorkspace(workspaceName.trim());
    setNameError('');
  };

  const handleDeleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmInput.trim() !== activeWorkspace.name) {
      setDeleteError(`Please type "${activeWorkspace.name}" to confirm`);
      confirmInputRef.current?.focus();
      return;
    }

    deleteWorkspace(activeWorkspace.id);
    setDeleteOpen(false);
    push('/app');
  };

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#F7F6F5] p-4 sm:p-8">
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
              {activeWorkspace.avatarText}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#171A21]">
                {activeWorkspace.name}
              </h2>
              <span className="text-[12px] text-[#737782] uppercase tracking-wider font-semibold">
                {activeWorkspace.plan} edition
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveName} className="space-y-4">
            <AuthField
              ref={nameInputRef}
              label="Workspace name"
              value={workspaceName}
              onChange={(e) => {
                setWorkspaceName(e.target.value);
                if (nameError) setNameError('');
              }}
              error={nameError}
              hint="This is the name displayed to teammates in menus and email invites."
              required
            />

            {/* Slug immutable single line per spec */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="workspace-slug-immutable" className="text-[13px] font-semibold text-[#171A21]">
                Workspace URL (Immutable)
              </label>
              <div className="flex items-center rounded-[8px] border border-[#E4E2DF] bg-[#F6F5F3] px-3 py-2 text-[14px] text-[#737782] select-all">
                <span className="font-normal font-sans">https://{activeWorkspace.domain}</span>
              </div>
              <p className="text-[12px] text-[#737782]">
                Workspace slug paths are locked to preserve permalinks and API tokens.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors active:scale-[0.98] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#3157D5]"
              >
                Save changes
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
                Permanently remove {activeWorkspace.name}, including all channels, message history, and member access. This cannot be undone.
              </p>
            </div>

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
          </div>
        </div>
      </div>

      {/* Delete Workspace Type-to-Confirm Dialog */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${activeWorkspace.name}?`}
        description={`This action is permanent and irreversible. All channels, messages, attachments, and settings will be permanently erased.`}
        role="alertdialog"
        initialFocusRef={confirmInputRef}
      >
        <form onSubmit={handleDeleteSubmit} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-[8px] text-[13px] text-[#C94A45] space-y-1">
            <p className="font-semibold">Warning: Destructive Action</p>
            <p>
              To confirm deletion, type <strong className="underline">{activeWorkspace.name}</strong> below.
            </p>
          </div>

          <AuthField
            ref={confirmInputRef}
            label="Confirmation"
            placeholder={activeWorkspace.name}
            value={confirmInput}
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
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-[13px] font-medium text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors"
            >
              Delete {activeWorkspace.name}
            </button>
          </div>
        </form>
      </Dialog>
    </main>
  );
};
