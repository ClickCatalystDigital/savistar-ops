'use client';

import { PageTitle } from '@/components/page-title';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StickyNote } from '@/components/sticky-note';
import { api, showToast, formatDate } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { StatusStamp, Swatches } from '@/components/project-art';
import { projectMaterials } from '@/lib/materials';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import { PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', client_id: '', start_date: '', notes: '', materials: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    setProjects(await api('/api/projects'));
  }
  useEffect(() => {
    load();
    api('/api/clients').then(setClients).catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api('/api/projects', {
        method: 'POST',
        body: { ...form, client_id: form.client_id ? Number(form.client_id) : null },
      });
      showToast('Project created');
      setOpen(false);
      setForm({ name: '', client_id: '', start_date: '', notes: '', materials: '' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <PageTitle>Projects</PageTitle>
          <p className="text-sm text-muted-foreground">{BRAND.studioShort} interior design projects</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusIcon data-icon="inline-start" />New project</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Project name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mehta Residence — 3BHK" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {clients.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Start date</Label>
                <DateInput value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Materials</Label>
                <Input value={form.materials} onChange={e => setForm({ ...form, materials: e.target.value })} placeholder="e.g. warm oak, brass, white lacquer" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.length === 0 && (
          <StickyNote className="col-span-full my-6">No projects yet.</StickyNote>
        )}
        {projects.map(p => {
          const pct = p.milestones_total ? Math.round((p.milestones_done / p.milestones_total) * 100) : 0;
          const materials = projectMaterials(p);
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className={cn('h-full transition-transform hover:-translate-y-0.5', (p.cover_url || materials.length) && 'pt-0')}>
                {/* Mood-board top: the newest photo with the palette as a thin band under it. */}
                {p.cover_url && <img src={p.cover_url} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
                <Swatches items={materials} className={p.cover_url ? 'h-2.5' : 'h-10'} />
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-sans text-base">{p.name}</CardTitle>
                    <StatusStamp status={p.status} className="mt-1 shrink-0" />
                  </div>
                  <CardDescription>{p.client_name || 'No client'} · started {formatDate(p.start_date)}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.milestones_done}/{p.milestones_total} milestones · {p.orders_count} order{p.orders_count === 1 ? '' : 's'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
