// src/components/user-avatar.jsx

'use client';
import { cn } from '@/lib/utils';

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-orange-500',
  'bg-indigo-500', 'bg-lime-500', 'bg-sky-500', 'bg-pink-500',
];
function fallbackColorClass(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const AVATAR_FONTS = [
  { value: 'sans', label: 'Sans', className: 'font-sans' },
  { value: 'serif', label: 'Serif', className: 'font-serif' },
  { value: 'mono', label: 'Mono', className: 'font-mono' },
];

// Hex equivalents of AVATAR_COLORS above — keeps the picker's palette identical
// to the hash-based fallback colors, so every avatar in the app draws from one set.
export const AVATAR_SWATCHES = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e',
  '#f59e0b', '#06b6d4', '#d946ef', '#f97316',
  '#6366f1', '#84cc16', '#0ea5e9', '#ec4899',
];

// Illustrated avatars in public/avatars/01..30.webp (cut from one sheet, transparent background).
export const AVATAR_PRESETS = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));

// Priority: uploaded image > illustrated preset > custom color+font initial > hash-based fallback color.
export function UserAvatar({ user, size = 'size-9', textSize = 'text-xs', className, initialOnly = false }) {
  if (!user) return null; // e.g. dialog mid-close-animation with no user selected yet

  const label = user.display_name || user.username || '?';
  const initial = label.trim().charAt(0).toUpperCase();
  const fontClass = AVATAR_FONTS.find(f => f.value === user.avatar_font)?.className || 'font-sans';

  if (user.avatar_url && !initialOnly) {
    return (
      <img src={user.avatar_url} alt={label}
        className={cn(size, 'shrink-0 rounded-full object-cover ring-1 ring-border', className)} />
    );
  }

  // Illustrated preset: transparent line drawing over the chosen letter color.
  if (user.avatar_preset && !initialOnly) {
    return (
      <span
        style={user.avatar_color ? { backgroundColor: user.avatar_color } : undefined}
        className={cn(size, 'relative shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]',
          !user.avatar_color && fallbackColorClass(user.username || label), className)}>
        <img src={`/avatars/${user.avatar_preset}.webp`} alt={label} className="size-full object-cover" draggable={false} />
      </span>
    );
  }

  return (
    <span
      style={user.avatar_color ? { backgroundColor: user.avatar_color } : undefined}
      className={cn(size, 'flex shrink-0 items-center justify-center rounded-full text-white',
        fontClass, textSize, !user.avatar_color && fallbackColorClass(user.username || label), className)}>
      {initial}
    </span>
  );
}