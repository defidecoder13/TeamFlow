'use client';

import React, { useState, useRef } from 'react';
import { Avatar } from './Avatar';
import {
  PROFESSIONAL_AVATARS,
  type ProfessionalAvatar,
} from '../../lib/avatar-catalog';
import { Upload, Sparkles, User, Check } from 'lucide-react';

export type AvatarType = 'uploaded' | 'professional' | 'initials';

export interface AvatarSelectorProps {
  name: string;
  avatarUrl: string;
  avatarType?: AvatarType;
  title?: string;
  onChange: (updates: {
    avatarUrl: string;
    avatarType: AvatarType;
  }) => void;
  className?: string;
}

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({
  name,
  avatarUrl,
  avatarType = 'professional',
  title,
  onChange,
  className = '',
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(avatarUrl);
  const [currentType, setCurrentType] = useState<AvatarType>(avatarType);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectProfessional = (prof: ProfessionalAvatar) => {
    setCurrentUrl(prof.url);
    setCurrentType('professional');
    onChange({
      avatarUrl: prof.url,
      avatarType: 'professional',
    });
  };

  const handleSelectInitials = () => {
    setCurrentUrl('');
    setCurrentType('initials');
    onChange({
      avatarUrl: '',
      avatarType: 'initials',
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use FileReader for instant zero-latency circular preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCurrentUrl(result);
        setCurrentType('uploaded');
        onChange({
          avatarUrl: result,
          avatarType: 'uploaded',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Live Circular Preview & Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-5 bg-[#FAF9F8] border border-[#E4E2DF] rounded-[14px]">
        {/* Large Live Circular Avatar Preview */}
        <div className="relative shrink-0">
          <Avatar
            name={name || 'You'}
            src={currentType === 'initials' ? null : currentUrl}
            size={84}
            presence="online"
            showPresence
            className="shadow-sm ring-4 ring-white"
          />
        </div>

        {/* Live Metadata */}
        <div className="flex-1 text-center sm:text-left min-w-0">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h3 className="text-[16px] font-semibold text-[#171A21] truncate">
              {name || 'New Member'}
            </h3>
            <span className="px-2 py-0.5 text-[11px] font-medium bg-white text-[#737782] border border-[#E4E2DF] rounded-full uppercase tracking-wider">
              {currentType}
            </span>
          </div>
          <p className="text-[13px] text-[#4F5360] mt-0.5 truncate">
            {title || 'Team Member'}
          </p>
          <p className="text-[12px] text-[#737782] mt-2 leading-relaxed">
            Your circular avatar represents you across direct messages, channels, threads, and notifications.
          </p>
        </div>
      </div>

      {/* 2. Choose Photo Source (Upload / Professional / Initials) */}
      <div className="space-y-3">
        <label className="block text-[13px] font-semibold text-[#171A21]">
          Profile picture
        </label>
        <p className="text-[12px] text-[#4F5360]">
          Upload a photo from your computer or choose a curated avatar.
        </p>

        {/* Action Tabs / Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`p-3 rounded-[10px] border text-left flex items-center gap-3 transition-all cursor-pointer ${
              currentType === 'uploaded'
                ? 'bg-white border-[#3157D5] ring-2 ring-[#EEF2FF] shadow-xs'
                : 'bg-white border-[#E4E2DF] hover:border-[#D2D0CC] hover:bg-[#FAF9F8]'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#F1F0EE] text-[#171A21] flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#171A21]">Upload photo</p>
              <p className="text-[11px] text-[#737782] truncate">JPG, PNG or WebP</p>
            </div>
          </button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
            aria-label="Upload profile photo"
          />

          {/* Initials / Default Button */}
          <button
            type="button"
            onClick={handleSelectInitials}
            className={`p-3 rounded-[10px] border text-left flex items-center gap-3 transition-all cursor-pointer ${
              currentType === 'initials'
                ? 'bg-white border-[#3157D5] ring-2 ring-[#EEF2FF] shadow-xs'
                : 'bg-white border-[#E4E2DF] hover:border-[#D2D0CC] hover:bg-[#FAF9F8]'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#F1F0EE] text-[#171A21] flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#171A21]">Use initials</p>
              <p className="text-[11px] text-[#737782] truncate">Default monogram</p>
            </div>
          </button>

          {/* Professional Tag Indicator */}
          <div
            className={`p-3 rounded-[10px] border flex items-center gap-3 bg-white ${
              currentType === 'professional'
                ? 'border-[#3157D5] ring-2 ring-[#EEF2FF]'
                : 'border-[#E4E2DF]'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#EEF2FF] text-[#3157D5] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#171A21]">Professional</p>
              <p className="text-[11px] text-[#737782] truncate">Curated options</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Professional Avatars Grid */}
      <div className="space-y-2.5">
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-[#737782]">
          Or choose from curated portraits
        </label>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5">
          {PROFESSIONAL_AVATARS.map((prof) => {
            const isSelected = currentType === 'professional' && currentUrl === prof.url;
            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => handleSelectProfessional(prof)}
                title={`${prof.name} — ${prof.role}`}
                className={`relative group aspect-square rounded-full p-0.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-[#3157D5] ring-offset-2 scale-105'
                    : 'hover:scale-105 hover:opacity-90'
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden border border-[#E4E2DF] shadow-2xs">
                  <img
                    src={prof.url}
                    alt={prof.name}
                    className="w-full h-full object-cover rounded-full aspect-square"
                  />
                </div>
                {isSelected && (
                  <div className="absolute inset-0 bg-[#3157D5]/20 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-[#3157D5] text-white flex items-center justify-center shadow-xs">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AvatarSelector;
