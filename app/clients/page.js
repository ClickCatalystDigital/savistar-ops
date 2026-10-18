'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, showToast, formatDate } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { PlusIcon, SearchIcon } from 'lucide-react';

const EMPTY = { name: '', phone: '', email: '', address: '', notes: '' };

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load(query = '') {
    setClients(await api(`/api/clients${query ? `?q=${encodeURIComponent(query)}` : ''}`));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function save() {
    setBusy(true);
    try {
      await api('/api/clients', { method: 'POST', body: form });
      showToast('Client added');
      setOpen(false);
      setForm(EMPTY);
      load(q);
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Clients</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><PlusIcon data-icon="inline-start" />Add client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-name">Name</Label>
                <Input id="c-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="c-phone">Phone</Label>
                  <Input id="c-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="c-email">Email</Label>
                  <Input id="c-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-address">Address</Label>
                <Input id="c-address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-notes">Notes</Label>
                <Textarea id="c-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search by name or phone…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-center">Projects</TableHead>
              <TableHead className="text-center">Orders</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No clients yet — add the first one.</TableCell></TableRow>
            )}
            {clients.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/clients/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                <TableCell className="text-center">{c.projects_count > 0 ? <Badge variant="secondary">{c.projects_count}</Badge> : '—'}</TableCell>
                <TableCell className="text-center">{c.orders_count > 0 ? <Badge variant="secondary">{c.orders_count}</Badge> : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
