import React, { useState, useRef } from 'react';
import { Dialog } from '../primitives/Dialog';
import { AuthField } from '../primitives/AuthField';
import { useApp } from '../../context/AppContext';
import { MemberRole } from '../../types';
import { Copy, Check, Link as LinkIcon } from 'lucide-react';

export const InviteMemberDialog: React.FC = () => {
  const { isInviteMemberOpen, setInviteMemberOpen, inviteMember, activeWorkspace } = useApp();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const inviteLink = `https://${activeWorkspace.domain}/join?token=inv_tf_${activeWorkspace.slug}_2026`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('A valid work email is required');
      emailInputRef.current?.focus();
      return;
    }

    inviteMember(email.trim(), role);
    setEmail('');
    setError('');
    setInviteMemberOpen(false);
  };

  const handleClose = () => {
    setEmail('');
    setError('');
    setInviteMemberOpen(false);
  };

  return (
    <Dialog
      isOpen={isInviteMemberOpen}
      onClose={handleClose}
      title={`Invite teammates to ${activeWorkspace.name}`}
      description="Teammates will receive an invitation email and can instantly join your public channels."
      initialFocusRef={emailInputRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          ref={emailInputRef}
          type="email"
          label="Email address"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
          }}
          error={error}
          required
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-[13px] font-semibold text-[#171A21]">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="w-full px-3 py-2 text-[14px] text-[#171A21] bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#EEF2FF] focus-visible:border-[#3157D5]"
          >
            <option value="member">Member — Can browse public channels and post</option>
            <option value="admin">Admin — Can manage channels and invite members</option>
            <option value="guest">Guest — Single or multi-channel access</option>
          </select>
        </div>

        {/* Shareable link box */}
        <div className="p-3.5 bg-[#FAF9F8] rounded-[10px] border border-[#E4E2DF] space-y-2">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#171A21]">
            <LinkIcon className="w-3.5 h-3.5 text-[#3157D5]" />
            <span>Or share an instant invitation link</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteLink}
              className="flex-1 px-2.5 py-1.5 text-[12px] bg-white border border-[#E4E2DF] rounded-[6px] text-[#4F5360] select-all outline-none"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-white hover:bg-[#F1F0EE] text-[#171A21] border border-[#E4E2DF] rounded-[6px] transition-colors shrink-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#737782]" />
                  <span>Copy</span>
                </>
              )}
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
            className="px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors active:scale-[0.98] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#3157D5]"
          >
            Send invitation
          </button>
        </div>
      </form>
    </Dialog>
  );
};
