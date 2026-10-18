import { cn } from '@/lib/utils';

// Empty states as a handwritten sticky note.
export function StickyNote({ children, className }) {
  return (
    <div className={cn('mx-auto w-fit max-w-xs -rotate-2 rounded-sm bg-[#fbf0b2] px-5 py-4 text-center font-hand text-base leading-snug text-stone-700 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)] dark:bg-[#4d4726] dark:text-stone-100',
      className)}>
      {children}
    </div>
  );
}
