import { cn } from '@/lib/utils';

// The assistant's mark: an inked butterfly with a watercolour wash on its wings, drawn like the rest of the app
// (thin ink line, paper). Wings rest open and flap now and then; inside a `.group` they flutter on hover
// (globals.css .butterfly). `open` keeps them still (the panel header).
const RIGHT_WINGS = (
  <>
    {/* forewing, pointed at the tip; hindwing, rounded with a small tail */}
    <path d="M12.5 10.9C13.4 7.6 16.2 4.4 20.4 4.1c1-.1 1.4.7 1.1 1.6-.8 2.5-2.7 5-5.4 6.3-1.2.6-2.4.9-3.6.9" />
    <path d="M12.5 13.2c2.1.1 4.1.9 4.9 2.5.7 1.4.3 2.9-.9 3.2-.7.2-1.2 0-1.5.6-.4.9-1 1-1.5.3-.7-1-1-3.4-1-5" />
    <path d="M13.1 11.6c1.9-1.7 4-3.9 6.3-6.2" fill="none" strokeWidth=".7" strokeOpacity=".55" />
    <circle cx="19.3" cy="6.4" r=".55" className="fill-current stroke-none" fillOpacity=".6" />
  </>
);

export function Butterfly({ className, open = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      className={cn('butterfly overflow-visible', open && 'butterfly-open', className)}>
      <g className="wing">{RIGHT_WINGS}</g>
      <g className="wing"><g transform="matrix(-1 0 0 1 24 0)">{RIGHT_WINGS}</g></g>
      <path d="M12 9c.5 0 .75 1 .75 4.2s-.3 5.6-.75 5.6-.75-2.4-.75-5.6.25-4.2.75-4.2z" fillOpacity=".75" />
      <circle cx="12" cy="8.1" r=".8" fillOpacity=".75" />
      <path d="M11.7 7.5C11.3 5.7 10.3 4.4 9.1 3.9M12.3 7.5c.4-1.8 1.4-3.1 2.6-3.6" fill="none" strokeWidth="1" />
    </svg>
  );
}
