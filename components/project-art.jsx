import { cn } from '@/lib/utils';
import { capitalize } from '@/lib/format';

// A rubber stamp for projects that are no longer simply active.
const STAMP = { completed: 'text-success', cancelled: 'text-danger', on_hold: 'text-warning' };

export function StatusStamp({ status, className }) {
  if (!STAMP[status]) return null;
  return (
    <span className={cn('pointer-events-none inline-block -rotate-6 select-none rounded-sm border-2 border-current px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[0.2em] opacity-75',
      STAMP[status], className)}>
      {capitalize(status)}
    </span>
  );
}

// Material chips as a strip of colour, like samples pinned to a board.
export function Swatches({ items, className }) {
  if (!items.length) return null;
  return (
    <div className={cn('flex overflow-hidden', className)}>
      {items.map(m => (
        <span key={m.name} title={m.name} style={{ backgroundColor: m.hex }} className="min-w-0 flex-1" />
      ))}
    </div>
  );
}
