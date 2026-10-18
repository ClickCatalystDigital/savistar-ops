'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, showToast, formatDate, capitalize } from '@/lib/client';
import { todayISO } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { PlusIcon, KanbanSquareIcon, ListIcon } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { UserAvatar } from '@/components/user-avatar';
import { StickyNote } from '@/components/sticky-note';
import { cn } from '@/lib/utils';

const STATUS_VARIANT = { pending: 'outline', in_progress: 'default', done: 'secondary', delivered: 'secondary', cancelled: 'destructive' };
const BOARD = ['pending', 'in_progress', 'done', 'delivered'];

// Who logged work on an order this week, as overlapping initials.
function WorkerStack({ names }) {
  const list = names ? names.split(',') : [];
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex -space-x-1.5" title={list.join(', ')}>
      {list.slice(0, 4).map(n => <UserAvatar key={n} user={{ display_name: n, username: n }} size="size-6" textSize="text-[10px]" className="ring-2 ring-background" />)}
      {list.length > 4 && <span className="figures flex size-6 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-background">+{list.length - 4}</span>}
    </span>
  );
}

// A workshop job ticket: perforated stub at the bottom with the due date. Drag it to another column
// to change its status (the order page's status menu does the same without a mouse).
function Ticket({ o }) {
  const overdue = ['pending', 'in_progress'].includes(o.status) && o.due_date && o.due_date < todayISO();
  return (
    <Link href={`/orders/${o.id}`} draggable onDragStart={e => e.dataTransfer.setData('text/order-id', String(o.id))}
      className="paper-surface block cursor-grab rounded-lg transition-transform hover:-translate-y-0.5 active:cursor-grabbing">
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug">{o.item}</p>
          <span className="figures shrink-0 text-lg leading-none text-muted-foreground">×{o.qty}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{o.client_name || 'No client'}{o.project_name ? ` · ${o.project_name}` : ''}</p>
      </div>
      <div className="flex items-center justify-between border-t-2 border-dotted border-border px-3 py-2">
        <span className={cn('figures text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
          {o.due_date ? `Due ${formatDate(o.due_date).slice(0, 6)}` : 'No due date'}
        </span>
        <WorkerStack names={o.recent_workers} />
      </div>
    </Link>
  );
}

const EMPTY = { item: '', qty: 1, client_id: '', project_id: '', description: '', start_date: '', due_date: '' };

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('board');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load(f = view === 'board' ? 'all' : filter) {
    setOrders(await api(`/api/orders?status=${f}`));
  }
  useEffect(() => { load(); }, [filter, view]);
  useEffect(() => {
    api('/api/clients').then(setClients).catch(() => {});
    api('/api/projects').then(setProjects).catch(() => {});
  }, []);

  const [over, setOver] = useState(null);
  async function moveTo(status, e) {
    setOver(null);
    const o = orders.find(x => String(x.id) === e.dataTransfer.getData('text/order-id'));
    if (!o || o.status === status) return;
    setOrders(orders.map(x => (x.id === o.id ? { ...x, status } : x)));
    try {
      await api(`/api/orders/${o.id}`, { method: 'PUT', body: { client_id: o.client_id, project_id: o.project_id, item: o.item, qty: o.qty, description: o.description, status, start_date: o.start_date, due_date: o.due_date } });
      showToast(`${o.item} → ${capitalize(status)}`);
    } catch (err) { showToast(err.message, 'error'); }
    load();
  }

  async function save() {
    setBusy(true);
    try {
      await api('/api/orders', {
        method: 'POST',
        body: {
          ...form,
          qty: Number(form.qty) || 1,
          client_id: form.client_id ? Number(form.client_id) : null,
          project_id: form.project_id ? Number(form.project_id) : null,
        },
      });
      showToast('Order created');
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="text-sm text-muted-foreground">{BRAND.workshopShort} furniture workshop orders</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusIcon data-icon="inline-start" />New order</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New order</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-2">
                  <Label>Item</Label>
                  <Input placeholder="e.g. Dining chair" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Qty</Label>
                  <Input type="number" min="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {clients.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{BRAND.studioShort} project</Label>
                  <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Start date</Label>
                  <DateInput value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Due date</Label>
                  <DateInput value={form.due_date} onChange={v => setForm({ ...form, due_date: v })} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea placeholder="Wood type, finish, dimensions…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.item.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
      {view === 'list' ? (
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
        </TabsList>
      </Tabs>
      ) : <span />}
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="board"><KanbanSquareIcon data-icon="inline-start" />Board</TabsTrigger>
          <TabsTrigger value="list"><ListIcon data-icon="inline-start" />List</TabsTrigger>
        </TabsList>
      </Tabs>
      </div>

      {view === 'board' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD.map(s => {
            const col = orders.filter(o => o.status === s);
            return (
              <section key={s} onDragOver={e => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={e => moveTo(s, e)}
                className={cn('flex flex-col gap-3 rounded-xl bg-muted/40 p-3 transition-colors', over === s && 'bg-accent ring-2 ring-primary/40')}>
                <h2 className="flex items-center justify-between font-hand text-lg">
                  {capitalize(s)} <span className="figures text-xs text-muted-foreground">{col.length}</span>
                </h2>
                {col.length === 0 && <p className="py-4 text-center font-hand text-sm text-muted-foreground">Nothing here</p>}
                {col.map(o => <Ticket key={o.id} o={o} />)}
              </section>
            );
          })}
        </div>
      )}
      {view === 'board' && orders.some(o => o.status === 'cancelled') && (
        <p className="text-xs text-muted-foreground">{orders.filter(o => o.status === 'cancelled').length} cancelled, in the List view.</p>
      )}

      {view === 'list' && orders.length === 0 && <StickyNote className="my-10">No orders here yet.</StickyNote>}
      {view === 'list' && orders.length > 0 && (
      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Client / Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Working this week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map(o => {
              const overdue = ['pending', 'in_progress'].includes(o.status) && o.due_date && o.due_date < todayISO();
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.item} × {o.qty}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.client_name || '—'}{o.project_name ? ` · ${o.project_name}` : ''}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[o.status] || 'outline'}>{capitalize(o.status)}</Badge>
                  </TableCell>
                  <TableCell className={cn('figures text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>{formatDate(o.due_date)}</TableCell>
                  <TableCell><WorkerStack names={o.recent_workers} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}
