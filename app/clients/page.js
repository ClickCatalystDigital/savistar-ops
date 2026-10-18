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
import { UserAvatar } from '@/components/user-avatar';
import { StickyNote } from '@/components/sticky-note';
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

      {/* A rolodex: one card per client, latest conversation on it. */}
      {clients.length === 0 && <StickyNote className="my-10">{q ? 'Nobody by that name.' : 'No clients yet. Add the first one.'}</StickyNote>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {clients.map(c => (
          <Link key={c.id} href={`/clients/${c.id}`}
            className="paper-surface flex flex-col gap-3 rounded-xl p-4 transition-transform hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <UserAvatar user={{ display_name: c.name, username: c.name }} size="size-10" textSize="text-sm" />
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="figures text-xs text-muted-foreground">{c.phone || 'No phone'}</p>
              </div>
            </div>
            {c.last_note
              ? <p className="line-clamp-2 font-serif text-sm italic text-muted-foreground">“{c.last_note}”<span className="figures not-italic"> · {formatDate(c.last_note_at)}</span></p>
              : <p className="text-sm text-muted-foreground/70">No conversations yet</p>}
            <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {c.active_project && <Badge variant="outline" className="max-w-full truncate">{c.active_project}</Badge>}
              <span className="ml-auto">{c.projects_count} project{c.projects_count === 1 ? '' : 's'} · {c.orders_count} order{c.orders_count === 1 ? '' : 's'}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
