'use client';

import { PageTitle } from '@/components/page-title';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, showToast, formatDate, capitalize } from '@/lib/client';
import { poDisplayStatus, PO_STATUS_LABELS } from '@/lib/po';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { ArrowLeftIcon, PencilIcon, StarIcon } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';

const STATUSES = ['pending', 'in_progress', 'done', 'delivered', 'cancelled'];

export default function OrderDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    try { setO(await api(`/api/orders/${id}`)); }
    catch (e) { showToast(e.message, 'error'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(status) {
    try {
      await api(`/api/orders/${id}`, { method: 'PUT', body: { ...o, status } });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await api(`/api/orders/${id}`, { method: 'PUT', body: { ...o, ...edit, qty: Number(edit.qty) || 1 } });
      showToast('Order updated');
      setEditOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`Delete order "${o.item}"?`)) return;
    try {
      await api(`/api/orders/${id}`, { method: 'DELETE' });
      router.push('/orders');
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!o) return <div className="container py-10 text-muted-foreground">Loading…</div>;

  // Group work logs by employee for the "who built this" summary.
  const byEmployee = {};
  for (const w of o.workLogs) {
    (byEmployee[w.employee_name] ||= []).push(w);
  }

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/orders"><ArrowLeftIcon /></Link></Button>
        <div className="min-w-0 flex-1">
          <PageTitle className="truncate">{o.item} × {o.qty}</PageTitle>
          <p className="text-sm text-muted-foreground">
            {o.client_name && <Link href={`/clients/${o.client_id}`} className="text-primary hover:underline">{o.client_name}</Link>}
            {o.client_name && o.project_name && ' · '}
            {o.project_name && <Link href={`/projects/${o.project_id}`} className="text-primary hover:underline">{o.project_name}</Link>}
            {!o.client_name && !o.project_name && 'No client / project linked'}
            {' '}· due {formatDate(o.due_date)}
            {o.delivered_at && ` · delivered ${formatDate(o.delivered_at)}`}
          </p>
        </div>
        <Select value={o.status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Dialog open={editOpen} onOpenChange={op => { setEditOpen(op); if (op) setEdit({ item: o.item, qty: o.qty, description: o.description || '', start_date: o.start_date || '', due_date: o.due_date || '', status: o.status, client_id: o.client_id, project_id: o.project_id }); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><PencilIcon data-icon="inline-start" />Edit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit order</DialogTitle></DialogHeader>
            {edit && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 flex flex-col gap-2">
                    <Label>Item</Label>
                    <Input value={edit.item} onChange={e => setEdit({ ...edit, item: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Qty</Label>
                    <Input type="number" min="1" value={edit.qty} onChange={e => setEdit({ ...edit, qty: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Start date</Label>
                    <DateInput value={edit.start_date} onChange={v => setEdit({ ...edit, start_date: v })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Due date</Label>
                    <DateInput value={edit.due_date} onChange={v => setEdit({ ...edit, due_date: v })} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description</Label>
                  <Textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} />
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" className="text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={remove}><TrashIcon data-icon="inline-start" />Delete</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {o.description && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{o.description}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Work history</CardTitle>
          </CardHeader>
          <CardContent>
            {o.workLogs.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No work logged. Log daily work from the <Link href="/people" className="text-primary hover:underline">People</Link> tab.
              </p>
            )}
            {o.workLogs.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Part / work done</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.workLogs.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(w.date)}</TableCell>
                      <TableCell className="font-medium">{w.employee_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {w.start_time && w.end_time ? `${w.start_time}–${w.end_time}` : w.start_time || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{w.description || '—'}</TableCell>
                      <TableCell className="text-right">
                        {w.rating ? (
                          <span className="inline-flex items-center gap-0.5 text-sm">
                            {w.rating}<StarIcon className="size-3.5 fill-current text-amber-500" />
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>People on this order</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Object.keys(byEmployee).length === 0 && <p className="text-sm text-muted-foreground">Nobody yet.</p>}
              {Object.entries(byEmployee).map(([name, logs]) => (
                <div key={name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">{logs.length} day{logs.length === 1 ? '' : 's'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Vendor material</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {o.vendorPos.length === 0 && <p className="text-sm text-muted-foreground">No vendor POs linked.</p>}
              {o.vendorPos.map(vp => {
                const st = poDisplayStatus(vp);
                return (
                  <Link key={vp.id} href={`/vendors/${vp.vendor_id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted">
                    <span className="truncate">
                      <span className="font-medium">{vp.item} × {vp.qty_ordered}</span>
                      <span className="text-muted-foreground"> · {vp.vendor_name}</span>
                    </span>
                    <Badge variant={st === 'cancelled' ? 'destructive' : st === 'open' ? 'outline' : 'secondary'}>
                      {PO_STATUS_LABELS[st]}
                    </Badge>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
