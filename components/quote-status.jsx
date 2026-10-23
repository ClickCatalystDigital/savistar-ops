import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL } from '@/lib/quote-math';

// One look per quotation status, wherever quotes are listed.
const VARIANT = { draft: 'secondary', sent: 'default', accepted: 'outline', declined: 'destructive', expired: 'destructive', superseded: 'ghost' };
export function QuoteStatus({ status }) {
  return (
    <Badge variant={VARIANT[status] || 'secondary'} className={status === 'accepted' ? 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400' : undefined}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}
