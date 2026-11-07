'use client';

// Lists that load in the browser: a skeleton while the data is on its way, then the real content fades in.
// Without it a page shows "No clients yet" for a moment on every visit, which reads as "my data is gone".
// Timing is interior.dev's useSkeletonSwap: nothing for the first 120 ms (fast loads never flash), then the
// skeleton stays at least 380 ms so it never flickers.
import { motion } from 'motion/react';
import { useSkeletonSwap } from '@/components/interior/skeleton-swap';

const bar = 'rounded-[5px] bg-stone-200/80 dark:bg-white/10 animate-pulse';
const WIDTHS = [72, 54, 88, 63, 80, 58];

export function LoadSwap({ ready, skeleton, children }) {
  const { showSkeleton } = useSkeletonSwap({ ready });
  if (showSkeleton) return <div aria-busy="true" aria-label="Loading">{skeleton}</div>;
  if (!ready) return null;
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>{children}</motion.div>;
}

// Table-shaped: a header bar and `rows` lines of `cols` cells.
export function RowsSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3">
      <div className="mb-2 flex gap-6">{Array.from({ length: cols }, (_, c) => <div key={c} className={`${bar} h-2.5 flex-1 opacity-60`} />)}</div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 py-2.5">
          {Array.from({ length: cols }, (_, c) => <div key={c} className={`${bar} h-3 flex-1`} style={{ maxWidth: `${WIDTHS[(r * 3 + c) % WIDTHS.length]}%` }} />)}
        </div>
      ))}
    </div>
  );
}

// Card-shaped (project tiles, client cards): `cards` boxes in the page's own grid.
export function CardsSkeleton({ cards = 6, className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' }) {
  return (
    <div className={className}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="paper-surface flex flex-col gap-3 rounded-xl p-4">
          <div className={`${bar} h-4`} style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }} />
          <div className={`${bar} h-3 w-1/2`} />
          <div className={`${bar} mt-2 h-3 w-3/4`} />
        </div>
      ))}
    </div>
  );
}

// Inside an existing <TableBody>: skeleton rows under the real header while the rows load (same timing).
export function SkeletonTableRows({ ready, rows = 5, cols = 4 }) {
  const { showSkeleton } = useSkeletonSwap({ ready });
  if (!showSkeleton) return null;
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden className="border-b last:border-0">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="p-3"><div className={`${bar} h-3`} style={{ width: `${WIDTHS[(r * 3 + c) % WIDTHS.length]}%` }} /></td>
      ))}
    </tr>
  ));
}

// A whole detail page (one client, project, order…) before it arrives: title, a line under it, then a block.
export function DetailSkeleton() {
  return (
    <LoadSwap ready={false} skeleton={
      <div className="container flex flex-col gap-4 py-6">
        <div className={`${bar} h-7 w-64 max-w-[70%]`} />
        <div className={`${bar} h-3.5 w-80 max-w-[85%]`} />
        <div className="mt-2"><RowsSkeleton rows={5} cols={3} /></div>
      </div>
    } />
  );
}
