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
import { PlusIcon } from 'lucide-react';
import { BRAND } from '@/lib/brand';

const STATUS_VARIANT = { pending: 'outline', in_progress: 'default', done: 'secondary', delivered: 'secondary', cancelled: 'destructive' };
const EMPTY = { item: '', qty: 1, client_id: '', project_id: '', description: '', start_date: '', due_date: '' };

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load(f = filter) {
    setOrders(await api(`/api/orders?status=${f}`));
  }
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    api('/api/clients').then(setClients).catch(() => {});
    api('/api/projects').then(setProjects).catch(() => {});
  }, []);

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
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
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

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border">
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
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No orders.</TableCell></TableRow>
            )}
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
                    <Badge variant={STATUS_VARIANT[o.status] || 'outline'}>{capitalize(o.status).replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className={overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>{formatDate(o.due_date)}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{o.recent_workers || '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
