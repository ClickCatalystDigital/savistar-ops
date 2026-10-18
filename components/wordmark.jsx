import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

// "DesignerOps" / "SavistarOps" as one handwritten word, Ops in the brand blue. No marker
// stroke, so it never reads as a page title.
export function Wordmark({ className }) {
  return (
    <span className={cn('font-hand leading-none text-foreground', className)}>
      {BRAND.word.charAt(0) + BRAND.word.slice(1).toLowerCase()}<span className="text-primary">Ops</span>
    </span>
  );
}
