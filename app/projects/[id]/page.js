'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, showToast, formatDate, capitalize } from '@/lib/client';
import { todayISO } from '@/lib/date';
import { poDisplayStatus, PO_STATUS_LABELS } from '@/lib/po';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import { ArrowLeftIcon, PlusIcon, PencilIcon, MapPinIcon, SendIcon } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { BRAND } from '@/lib/brand';
import { StatusStamp } from '@/components/project-art';
import { projectMaterials } from '@/lib/materials';
import { cn } from '@/lib/utils';

export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ title: '', due_date: '' });
  const [newVisit, setNewVisit] = useState({ visit_date: '', notes: '' });
  const [visitOpen, setVisitOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    try { setP(await api(`/api/projects/${id}`)); }
    catch (e) { showToast(e.message, 'error'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function addMilestone() {
    try {
      await api('/api/milestones', { method: 'POST', body: { project_id: Number(id), ...newMilestone } });
      setNewMilestone({ title: '', due_date: '' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function toggleMilestone(m) {
    await api(`/api/milestones/${m.id}`, { method: 'PUT', body: { status: m.status === 'done' ? 'pending' : 'done' } });
    load();
  }

  async function deleteMilestone(mid) {
    await api(`/api/milestones/${mid}`, { method: 'DELETE' });
    load();
  }

  async function addVisit() {
    try {
      await api('/api/site-visits', { method: 'POST', body: { project_id: Number(id), ...newVisit } });
      showToast('Site visit logged');
      setVisitOpen(false);
      setNewVisit({ visit_date: '', notes: '' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function sendMessage() {
    if (!p.client_id) return showToast('Link a client to this project first', 'warning');
    setBusy(true);
    try {
      await api(`/api/clients/${p.client_id}/conversations`, { method: 'POST', body: { body: msg, project_id: Number(id) } });
      setMsg('');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await api(`/api/projects/${id}`, { method: 'PUT', body: edit });
      showToast('Project updated');
      setEditOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`Delete project "${p.name}"? Milestones and visits will be removed.`)) return;
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      router.push('/projects');
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!p) return <div className="container py-10 text-muted-foreground">Loading…</div>;

  const done = p.milestones.filter(m => m.status === 'done').length;
  const materials = projectMaterials({ ...p, order_items: p.orders.map(o => o.item).join('; ') });

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/projects"><ArrowLeftIcon /></Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="page-title truncate">{p.name}</h1>
            {p.status === 'active' ? <Badge>Active</Badge> : <StatusStamp status={p.status} className="ml-2 shrink-0" />}
          </div>
          <p className="text-sm text-muted-foreground">
            {p.client_name ? <Link href={`/clients/${p.client_id}`} className="text-primary hover:underline">{p.client_name}</Link> : 'No client'}
            {' '}· started {formatDate(p.start_date)} · {done}/{p.milestones.length} milestones done
          </p>
        </div>
        <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (o) setEdit({ client_id: p.client_id, name: p.name, status: p.status, start_date: p.start_date || '', notes: p.notes || '', address: p.address || '', materials: p.materials || '' }); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><PencilIcon data-icon="inline-start" />Edit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
            {edit && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Status</Label>
                    <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Start date</Label>
                    <DateInput value={edit.start_date} onChange={v => setEdit({ ...edit, start_date: v })} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Address (site location)</Label>
                  <Textarea placeholder="Shown in the Site visits tab" value={edit.address} onChange={e => setEdit({ ...edit, address: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Materials</Label>
                  <Input placeholder="e.g. warm oak, brass, white lacquer" value={edit.materials} onChange={e => setEdit({ ...edit, materials: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Notes</Label>
                  <Textarea value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} />
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

      {materials.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {materials.map(m => (
            <span key={m.name} className="paper-surface flex items-center gap-2 rounded-md py-1 pl-1 pr-2.5 text-xs">
              <span className="size-5 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: m.hex }} />
              <span className="font-hand">{m.name}</span>
            </span>
          ))}
        </div>
      )}

      {p.notes && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{p.notes}</p>}

      <Tabs defaultValue="milestones">
        <TabsList>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="orders">Orders & materials</TabsTrigger>
          <TabsTrigger value="visits">Site visits</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
        </TabsList>

        <TabsContent value="milestones" className="mt-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="New milestone…" value={newMilestone.title}
                  onChange={e => setNewMilestone({ ...newMilestone, title: e.target.value })} className="flex-1" />
                <DateInput value={newMilestone.due_date}
                  onChange={v => setNewMilestone({ ...newMilestone, due_date: v })} className="sm:w-44" />
                <Button onClick={addMilestone} disabled={!newMilestone.title.trim()}><PlusIcon data-icon="inline-start" />Add</Button>
              </div>
              {p.milestones.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No milestones yet — add the plan above.</p>}
              {/* A dotted timeline: filled dot = done, ring = to do, red ring = overdue. */}
              <ol className="relative ml-3 flex flex-col border-l-2 border-dashed border-milestone/40">
                {p.milestones.map(m => {
                  const overdue = m.status !== 'done' && m.due_date && m.due_date < todayISO();
                  const isDone = m.status === 'done';
                  return (
                    <li key={m.id} className="group relative flex items-center gap-3 rounded-md py-2 pl-6 pr-2 hover:bg-muted/60">
                      <button type="button" role="checkbox" aria-checked={isDone} aria-label={`Mark "${m.title}" ${isDone ? 'not done' : 'done'}`}
                        onClick={() => toggleMilestone(m)}
                        className={cn('absolute -left-[9px] flex size-4 items-center justify-center rounded-full border-2 bg-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          isDone ? 'border-milestone bg-milestone' : overdue ? 'border-destructive' : 'border-milestone hover:bg-milestone/30')} />
                      <span className={isDone ? 'flex-1 text-sm text-muted-foreground line-through' : 'flex-1 text-sm'}>{m.title}</span>
                      {m.due_date && (
                        <span className={cn('figures text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                          {formatDate(m.due_date)}
                        </span>
                      )}
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => deleteMilestone(m.id)} aria-label="Delete milestone">
                        <TrashIcon />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{BRAND.workshopShort} orders for this project</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {p.orders.length === 0 && <p className="text-sm text-muted-foreground">No orders linked. Create one from the Orders tab and pick this project.</p>}
                {p.orders.map(o => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted">
                    <span className="truncate font-medium">{o.item} × {o.qty}</span>
                    <Badge variant={o.status === 'delivered' ? 'secondary' : 'default'}>{capitalize(o.status)}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Vendor orders</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {p.vendorPos.length === 0 && <p className="text-sm text-muted-foreground">No vendor POs linked. Create one from the Vendors tab and pick this project.</p>}
                {p.vendorPos.map(vp => {
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
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Site visits</CardTitle>
                <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
                  <DialogTrigger asChild><Button size="sm"><MapPinIcon data-icon="inline-start" />Log visit</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Log site visit</DialogTitle></DialogHeader>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <Label>Date</Label>
                        <DateInput value={newVisit.visit_date} onChange={v => setNewVisit({ ...newVisit, visit_date: v })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Notes</Label>
                        <Textarea placeholder="What was discussed / measured / decided…" value={newVisit.notes} onChange={e => setNewVisit({ ...newVisit, notes: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setVisitOpen(false)}>Cancel</Button>
                      <Button onClick={addVisit} disabled={!newVisit.visit_date}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {p.visits.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No site visits logged.</p>}
                {p.visits.map(v => (
                  <div key={v.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{formatDate(v.visit_date)}</p>
                      <p className="text-xs text-muted-foreground">{v.visited_by}</p>
                    </div>
                    {v.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{v.notes}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle>Site address</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.address || 'No address on file.'}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="conversations" className="mt-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-2">
                <Textarea placeholder="Log a client conversation for this project…" value={msg} onChange={e => setMsg(e.target.value)} />
                <Button size="sm" className="self-end" onClick={sendMessage} disabled={busy || !msg.trim()}>
                  <SendIcon data-icon="inline-start" />Log
                </Button>
              </div>
              {p.conversations.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">No conversations for this project yet.</p>}
              {p.conversations.map(cv => (
                <div key={cv.id} className="rounded-lg border p-3">
                  <p className="whitespace-pre-wrap text-sm">{cv.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{cv.created_by || 'unknown'} · {formatDate(cv.created_at)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
