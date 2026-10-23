'use client';

// Every quotation across clients: what's open, what expires this week, what was won this month, and the
// value of all open quotes at the top. Superseded revisions are hidden except under "All".
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageTitle } from '@/components/page-title';
import { NewButton } from '@/components/new-button';
import { StickyNote } from '@/components/sticky-note';
import { QuoteStatus } from '@/components/quote-status';
import { NewQuoteDialog } from '@/components/new-quote-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { api, showToast, formatDate } from '@/lib/client';
import { displayStatus } from '@/lib/quote-math';
import { todayISO, toISODate } from '@/lib/date';
import { BookOpenIcon, SearchIcon } from 'lucide-react';

const rupees = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'expiring', label: 'Expiring this week' },
  { key: 'won', label: 'Won this month' },
  { key: 'all', label: 'All' },
];

export default function QuotesPage() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => { api('/api/quotations').then(setRows).catch((e) => showToast(e.message, 'error')); }, []);

  const today = todayISO();
  const weekOut = toISODate(new Date(Date.now() + 7 * 86400000));
  const month = today.slice(0, 7);
  const list = useMemo(() => (rows || []).map((r) => ({ ...r, shown: displayStatus(r, today), total: r.subtotal + r.tax })), [rows, today]);
  const openOnes = list.filter((r) => r.shown === 'draft' || r.shown === 'sent');
  const shown = list.filter((r) => {
    if (filter === 'open' && !(r.shown === 'draft' || r.shown === 'sent')) return false;
    if (filter === 'expiring' && !(r.shown === 'sent' && r.valid_until && r.valid_until <= weekOut)) return false;
    if (filter === 'won' && !(r.status === 'accepted' && (r.decided_on || '').startsWith(month))) return false;
    if (filter !== 'all' && r.status === 'superseded') return false;
    const s = q.trim().toLowerCase();
    return !s || [r.client_name, r.quote_no, r.title, r.project_name].some((v) => (v || '').toLowerCase().includes(s));
  });
  const wonMonth = list.filter((r) => r.status === 'accepted' && (r.decided_on || '').startsWith(month));

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Quotes</PageTitle>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/quotes/library"><BookOpenIcon data-icon="inline-start" />BOQ library</Link></Button>
          <NewButton label="New quote" onClick={() => setOpen(true)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="paper-surface rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Open quotes</p>
          <p className="figures text-2xl font-semibold">{rupees(openOnes.reduce((s, r) => s + r.total, 0))}</p>
          <p className="text-xs text-muted-foreground">{openOnes.length} draft or sent, incl. GST</p>
        </div>
        <div className="paper-surface rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Won this month</p>
          <p className="figures text-2xl font-semibold">{rupees(wonMonth.reduce((s, r) => s + r.total, 0))}</p>
          <p className="text-xs text-muted-foreground">{wonMonth.length} accepted</p>
        </div>
        <div className="paper-surface rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Expiring this week</p>
          <p className="figures text-2xl font-semibold">{list.filter((r) => r.shown === 'sent' && r.valid_until && r.valid_until <= weekOut).length}</p>
          <p className="text-xs text-muted-foreground">sent quotes past or near their validity</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} onClick={() => setFilter(f.key)}>{f.label}</Button>
        ))}
        <div className="relative ml-auto w-full max-w-xs">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Client, number, project…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {rows && shown.length === 0 && <StickyNote className="my-10">{rows.length ? 'Nothing here for this filter.' : 'No quotations yet. Press New quote to start one.'}</StickyNote>}
      {shown.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="max-md:hidden">For</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="max-md:hidden">Dated</TableHead>
                <TableHead className="max-md:hidden">Valid until</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/quotes/${r.id}`)}>
                  <TableCell className="figures font-medium whitespace-nowrap">{r.quote_no || `#${r.id}`}{r.revision > 1 && <span className="text-muted-foreground"> R{r.revision}</span>}</TableCell>
                  <TableCell>{r.client_name}</TableCell>
                  <TableCell className="max-w-56 truncate max-md:hidden">{r.title || r.project_name || '—'}</TableCell>
                  <TableCell><QuoteStatus status={r.shown} /></TableCell>
                  <TableCell className="max-md:hidden">{formatDate(r.quoted_on)}</TableCell>
                  <TableCell className="max-md:hidden">{formatDate(r.valid_until)}</TableCell>
                  <TableCell className="figures text-right">{rupees(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <NewQuoteDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
