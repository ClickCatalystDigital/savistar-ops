'use client';

import { useEffect, useRef } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The one "New …" button each page has for creating its main record (New project, New order, …).
// Desktop: a primary button with an N shortcut hint; press N anywhere outside a text field to open it.
// Phone: the same button turns into a round + floating above the tab bar, within thumb reach.
// Works as a DialogTrigger child (props and ref pass through).
export function NewButton({ label, className, ref, ...props }) {
  const own = useRef(null);
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || document.querySelector('[role=dialog]')) return;
      if (!own.current?.offsetParent && getComputedStyle(own.current || document.body).position !== 'fixed') return; // hidden (inactive tab)
      e.preventDefault();
      own.current.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Button
      ref={node => { own.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
      aria-keyshortcuts="N"
      className={cn('gap-2 shadow-sm',
        'max-md:fixed max-md:right-4 max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:size-14 max-md:rounded-full max-md:p-0 max-md:shadow-lg',
        className)}
      {...props}>
      <PlusIcon className="max-md:size-6" />
      <span className="max-md:sr-only">{label}</span>
      <kbd className="hidden rounded border border-primary-foreground/30 px-1 font-sans text-[10px] leading-4 text-primary-foreground/80 md:inline">N</kbd>
    </Button>
  );
}
