'use client';

import { useEffect } from 'react';
import { ArrowUpRightIcon, XIcon } from 'lucide-react';
import { StickyNote } from '@/components/sticky-note';

// Demo only: shown when a visitor has used their free questions (lib/demo-leads.js AI_QUESTIONS), and again each
// time they click the locked button. Same as reel-inventory's AiLimitOverlay, on paper.
export function AiLimitOverlay({ name, limit, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4 print:hidden" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ai-limit-title" className="paper-surface relative w-full max-w-sm rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <XIcon className="size-4" />
        </button>
        <StickyNote className="mx-0 -rotate-3 px-4 py-2 text-sm">{limit} of {limit} used</StickyNote>
        <h2 id="ai-limit-title" className="mt-4 font-hand text-2xl">That was your {limit} free questions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {name} answers from live projects, invoices, workshop orders, people and vendors. To set it up on your own data,
          or to ask more here, get in touch with Ahrom Labs.
        </p>
        <a href="https://ahromlabs.com/#contact" target="_blank" rel="noreferrer"
          className="mt-5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90">
          Set it up for your business <ArrowUpRightIcon className="size-4" />
        </a>
        <button type="button" onClick={onClose} className="mt-2 h-10 w-full rounded-lg text-sm text-muted-foreground hover:bg-muted">
          Keep exploring the demo
        </button>
      </div>
    </div>
  );
}
