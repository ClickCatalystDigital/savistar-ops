'use client';

import { useEffect, useRef } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// The one "New …" button each page has for creating its main record (New project, New order, …).
// Desktop: a primary button; hovering lifts it, turns the + and shows a tooltip with the N shortcut
// (press N anywhere outside a text field to open it).
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={node => { own.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
          aria-keyshortcuts="N"
          className={cn('gap-2 shadow-sm transition-all hover:-translate-y-px hover:bg-primary hover:shadow-md',
            'max-md:fixed max-md:right-4 max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:size-14 max-md:rounded-full max-md:p-0 max-md:shadow-lg',
            className)}
          {...props}>
          <PlusIcon className="transition-transform duration-200 group-hover/button:rotate-90 max-md:size-6" />
          <span className="max-md:sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-md:hidden">
        {label} <span className="ml-1 opacity-70">· press N</span>
      </TooltipContent>
    </Tooltip>
  );
}
