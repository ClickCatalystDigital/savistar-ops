'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sectionFor } from '@/lib/nav';

// Every page's title: the section's icon (same as its nav tab) and the handwritten title.
export function PageTitle({ children, className }) {
  const Icon = sectionFor(usePathname())?.icon;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {Icon && <Icon aria-hidden strokeWidth={1.6} className="size-7 shrink-0 -rotate-3 text-primary/80" />}
      <h1 className={cn('page-title', className)}>{children}</h1>
    </div>
  );
}
