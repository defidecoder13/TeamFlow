/**
 * Shared line-icon set for the authenticated app — HugeIcons.
 *
 * Every export keeps the original `{ className }` API (default `h-4 w-4`,
 * decorative via `aria-hidden`, inherits text color via `currentColor`), so
 * consumers render identically while the glyphs come from
 * `@hugeicons/core-free-icons` (stroke style, 1.8 weight to match the
 * Stitch line language). Per-icon ESM imports keep bundles tree-shaken.
 */

import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  AtSignIcon,
  Attachment01Icon,
  Bookmark02Icon,
  BubbleChatIcon,
  Calendar01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Delete02Icon,
  Download01Icon,
  EyeIcon as EyeGlyph,
  FilterIcon as FilterGlyph,
  HashtagIcon,
  HelpCircleIcon,
  Home01Icon,
  Link01Icon,
  LockPasswordIcon,
  Logout01Icon,
  Menu01Icon,
  MoreHorizontalIcon as MoreHorizontalGlyph,
  MoreVerticalIcon as MoreVerticalGlyph,
  Notification01Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  Search01Icon,
  SentIcon,
  Settings01Icon,
  SmileIcon,
  Sun01Icon,
  Upload01Icon,
  UserAdd01Icon,
  UserIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';

function AppIcon({ icon, className }: { icon: IconSvgElement; className?: string }) {
  return (
    <HugeiconsIcon
      icon={icon}
      className={className ?? 'h-4 w-4'}
      color="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  );
}

export function HomeIcon({ className }: { className?: string }) {
  return <AppIcon icon={Home01Icon} className={className} />;
}

export function ThreadsIcon({ className }: { className?: string }) {
  return <AppIcon icon={BubbleChatIcon} className={className} />;
}

export function MentionsIcon({ className }: { className?: string }) {
  return <AppIcon icon={AtSignIcon} className={className} />;
}

export function SavedIcon({ className }: { className?: string }) {
  return <AppIcon icon={Bookmark02Icon} className={className} />;
}

export function HashIcon({ className }: { className?: string }) {
  return <AppIcon icon={HashtagIcon} className={className} />;
}

export function LockIcon({ className }: { className?: string }) {
  return <AppIcon icon={LockPasswordIcon} className={className} />;
}

export function PersonIcon({ className }: { className?: string }) {
  return <AppIcon icon={UserIcon} className={className} />;
}

export function UserPlusIcon({ className }: { className?: string }) {
  return <AppIcon icon={UserAdd01Icon} className={className} />;
}

export function MembersIcon({ className }: { className?: string }) {
  return <AppIcon icon={UserMultiple02Icon} className={className} />;
}

export function UsersIcon({ className }: { className?: string }) {
  return <AppIcon icon={UserMultiple02Icon} className={className} />;
}

export function SearchIcon({ className }: { className?: string }) {
  return <AppIcon icon={Search01Icon} className={className} />;
}

export function BellIcon({ className }: { className?: string }) {
  return <AppIcon icon={Notification01Icon} className={className} />;
}

export function PlusIcon({ className }: { className?: string }) {
  return <AppIcon icon={PlusSignIcon} className={className} />;
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return <AppIcon icon={ArrowDown01Icon} className={className} />;
}

export function ArrowDownIcon({ className }: { className?: string }) {
  return <AppIcon icon={ArrowDown01Icon} className={className} />;
}

export function SettingsIcon({ className }: { className?: string }) {
  return <AppIcon icon={Settings01Icon} className={className} />;
}

export function HelpIcon({ className }: { className?: string }) {
  return <AppIcon icon={HelpCircleIcon} className={className} />;
}

export function SignOutIcon({ className }: { className?: string }) {
  return <AppIcon icon={Logout01Icon} className={className} />;
}

export function PencilIcon({ className }: { className?: string }) {
  return <AppIcon icon={PencilEdit02Icon} className={className} />;
}

export function TrashIcon({ className }: { className?: string }) {
  return <AppIcon icon={Delete02Icon} className={className} />;
}

export function CloseIcon({ className }: { className?: string }) {
  return <AppIcon icon={Cancel01Icon} className={className} />;
}

export function SmileyIcon({ className }: { className?: string }) {
  return <AppIcon icon={SmileIcon} className={className} />;
}

export function SunIcon({ className }: { className?: string }) {
  return <AppIcon icon={Sun01Icon} className={className} />;
}

export function CalendarIcon({ className }: { className?: string }) {
  return <AppIcon icon={Calendar01Icon} className={className} />;
}

export function ClockIcon({ className }: { className?: string }) {
  return <AppIcon icon={Clock01Icon} className={className} />;
}

export function MenuIcon({ className }: { className?: string }) {
  return <AppIcon icon={Menu01Icon} className={className} />;
}

export function SendIcon({ className }: { className?: string }) {
  return <AppIcon icon={SentIcon} className={className} />;
}

export function LinkIcon({ className }: { className?: string }) {
  return <AppIcon icon={Link01Icon} className={className} />;
}

export function AttachmentIcon({ className }: { className?: string }) {
  return <AppIcon icon={Attachment01Icon} className={className} />;
}

export function CheckCircleIcon({ className }: { className?: string }) {
  return <AppIcon icon={CheckmarkCircle01Icon} className={className} />;
}

export function EyeIcon({ className }: { className?: string }) {
  return <AppIcon icon={EyeGlyph} className={className} />;
}

export function DownloadIcon({ className }: { className?: string }) {
  return <AppIcon icon={Download01Icon} className={className} />;
}

export function UploadIcon({ className }: { className?: string }) {
  return <AppIcon icon={Upload01Icon} className={className} />;
}

export function FilterIcon({ className }: { className?: string }) {
  return <AppIcon icon={FilterGlyph} className={className} />;
}

export function MoreHorizontalIcon({ className }: { className?: string }) {
  return <AppIcon icon={MoreHorizontalGlyph} className={className} />;
}

export function MoreVerticalIcon({ className }: { className?: string }) {
  return <AppIcon icon={MoreVerticalGlyph} className={className} />;
}
