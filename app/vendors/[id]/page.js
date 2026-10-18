'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { StickyNote } from '@/components/sticky-note';
import { useParams, useRouter } from 'next/navigation';
import { api, showToast, formatDate, formatMoney } from '@/lib/client';
import { todayISO } from '@/lib/date';
import { poDisplayStatus, PO_STATUS_LABELS } from '@/lib/po';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { ArrowLeftIcon, PlusIcon, PencilIcon, AlertTriangleIcon, PackageCheckIcon } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { BRAND } from '@/lib/brand';

const BLUE_ICON_BTN = 'text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40';
const RED_ICON_BTN = 'text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40';

export default function VendorDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    try { setV(await api(`/api/vendors/${id}`)); }
    catch (e) { showToast(e.message, 'error'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    setBusy(true);
    try {
      await api(`/api/vendors/${id}`, { method: 'PUT', body: edit });
      showToast('Vendor updated');
      setEditOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`Delete vendor "${v.name}"? Rate card, freight log and POs will be removed.`)) return;
    try {
      await api(`/api/vendors/${id}`, { method: 'DELETE' });
      router.push('/vendors');
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!v) return <div className="container py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/vendors"><ArrowLeftIcon /></Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="page-title truncate">{v.name}</h1>
            <span className="text-lg font-semibold text-muted-foreground">{formatMoney(v.total_expense) || '₹0'}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {[v.material, v.phone].filter(Boolean).join(' · ') || 'No details'}
          </p>
        </div>
        <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (o) setEdit({ name: v.name, phone: v.phone || '', material: v.material || '', notes: v.notes || '' }); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><PencilIcon data-icon="inline-start" />Edit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit vendor</DialogTitle></DialogHeader>
            {edit && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Name</Label>
                    <Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Phone</Label>
                    <Input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Material</Label>
                  <Input value={edit.material} onChange={e => setEdit({ ...edit, material: e.target.value })} />
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

      {v.notes && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{v.notes}</p>}

      <Tabs defaultValue="pos">
        <TabsList>
          <TabsTrigger value="pos">Purchase orders</TabsTrigger>
          <TabsTrigger value="freight">Freight & rates</TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="mt-4">
          <PosTab vendorId={Number(id)} pos={v.pos} onChanged={load} />
        </TabsContent>
        <TabsContent value="freight" className="mt-4">
          <FreightTab vendorId={Number(id)} rates={v.rates} freight={v.freight} onChanged={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Purchase orders ---------------- */

const emptyItemRow = () => ({ item: '', qty_ordered: '', rate: '' });
const EMPTY_PO_FORM = () => ({ order_id: '', project_id: '', ordered_on: todayISO(), items: [emptyItemRow()] });

// POs sharing the same site + order date were entered together — group them into one card.
function groupPosForDisplay(pos) {
  const map = new Map();
  for (const po of pos) {
    const key = `${po.ordered_on}__${po.project_id ?? 'none'}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(po);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

function PosTab({ vendorId, pos, onChanged }) {
  const [orders, setOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PO_FORM);
  const [editingPo, setEditingPo] = useState(null); // the PO row being edited
  const [editForm, setEditForm] = useState(null);
  const [delivery, setDelivery] = useState(null); // { poId, date, qty_delivered, qty_returned, notes }
  const [busy, setBusy] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    api('/api/orders?status=all').then(setOrders).catch(() => {});
    api('/api/projects').then(setProjects).catch(() => {});
  }, []);

  const filteredPos = pos.filter(po =>
    (!filterDate || po.ordered_on === filterDate) &&
    (!filterSite || String(po.project_id) === filterSite) &&
    (!search.trim() || po.item.toLowerCase().includes(search.trim().toLowerCase())));
  const siteOptions = [...new Map(pos.filter(po => po.project_id).map(po => [po.project_id, po.project_name])).entries()];
  const selectableIds = filteredPos.filter(po => poDisplayStatus(po) !== 'cancelled').map(po => po.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }
  function toggleOne(id) {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // "Delivered": top up delivered to the full ordered qty, no change to returns.
  async function bulkMarkDelivered() {
    const targets = filteredPos.filter(po => selected.has(po.id));
    setBusy(true);
    try {
      await Promise.all(targets.map(po => {
        const outstanding = Math.max(0, po.qty_ordered - po.delivered);
        if (!outstanding) return null;
        return api(`/api/vendor-pos/${po.id}/deliveries`, { method: 'POST', body: { date: todayISO(), qty_delivered: outstanding, qty_returned: 0 } });
      }));
      showToast('Marked as delivered');
      setSelected(new Set());
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  // "Returned": top up both delivered and returned to the full ordered qty, so the
  // whole line nets out to fully returned regardless of what was already recorded.
  async function bulkMarkReturned() {
    const targets = filteredPos.filter(po => selected.has(po.id));
    setBusy(true);
    try {
      await Promise.all(targets.map(po => {
        const deliverDelta = Math.max(0, po.qty_ordered - po.delivered);
        const returnDelta = Math.max(0, po.qty_ordered - po.returned);
        if (!deliverDelta && !returnDelta) return null;
        return api(`/api/vendor-pos/${po.id}/deliveries`, { method: 'POST', body: { date: todayISO(), qty_delivered: deliverDelta, qty_returned: returnDelta } });
      }));
      showToast('Marked as returned');
      setSelected(new Set());
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  function addItemRow() {
    setForm(f => ({ ...f, items: [...f.items, emptyItemRow()] }));
  }
  function removeItemRow(i) {
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  }
  function updateItemRow(i, field, value) {
    setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [field]: value } : it) }));
  }

  // One PO row per item line — all sharing the same vendor, site, "for order" and date.
  async function createPo() {
    const validItems = form.items.filter(it => it.item.trim() && it.qty_ordered);
    if (!validItems.length) return;
    setBusy(true);
    try {
      await Promise.all(validItems.map(it => api('/api/vendor-pos', {
        method: 'POST',
        body: {
          vendor_id: vendorId, item: it.item, qty_ordered: Number(it.qty_ordered),
          rate: it.rate ? Number(it.rate) : null,
          order_id: form.order_id ? Number(form.order_id) : null,
          project_id: form.project_id ? Number(form.project_id) : null,
          ordered_on: form.ordered_on,
        },
      })));
      showToast(validItems.length > 1 ? `${validItems.length} POs created` : 'PO created');
      setOpen(false);
      setForm(EMPTY_PO_FORM());
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function recordDelivery() {
    setBusy(true);
    try {
      const r = await api(`/api/vendor-pos/${delivery.poId}/deliveries`, {
        method: 'POST',
        body: {
          date: delivery.date,
          qty_delivered: Number(delivery.qty_delivered) || 0,
          qty_returned: Number(delivery.qty_returned) || 0,
          notes: delivery.notes || null,
        },
      });
      showToast(r.outstanding <= 0 ? 'Recorded — PO complete' : `Recorded — ${r.outstanding} still pending`);
      setDelivery(null);
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function cancelPo(po) {
    if (!confirm(`Cancel PO for ${po.item}?`)) return;
    await api(`/api/vendor-pos/${po.id}`, { method: 'PUT', body: { ...po, status: 'cancelled' } });
    onChanged();
  }

  async function saveEditPo() {
    setBusy(true);
    try {
      await api(`/api/vendor-pos/${editingPo.id}`, {
        method: 'PUT',
        body: {
          ...editingPo,
          item: editForm.item,
          qty_ordered: Number(editForm.qty_ordered),
          rate: editForm.rate ? Number(editForm.rate) : null,
          order_id: editForm.order_id ? Number(editForm.order_id) : null,
          project_id: editForm.project_id ? Number(editForm.project_id) : null,
          ordered_on: editForm.ordered_on,
          notes: editForm.notes,
        },
      });
      showToast('PO updated');
      setEditingPo(null);
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function deletePo(po) {
    if (!confirm(`Delete PO for ${po.item}? This can't be undone from here.`)) return;
    try {
      await api(`/api/vendor-pos/${po.id}`, { method: 'DELETE' });
      showToast('PO deleted');
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusIcon data-icon="inline-start" />New PO</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Items</Label>
                {form.items.map((it, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Input placeholder="e.g. 19mm plywood sheet" value={it.item} onChange={e => updateItemRow(i, 'item', e.target.value)} className="flex-1" />
                    <Input type="number" min="1" placeholder="Qty" value={it.qty_ordered} onChange={e => updateItemRow(i, 'qty_ordered', e.target.value)} className="w-20" />
                    <Input type="number" min="0" placeholder="₹ rate" value={it.rate} onChange={e => updateItemRow(i, 'rate', e.target.value)} className="w-24" />
                    {form.items.length > 1 && (
                      <Button variant="ghost" size="icon-sm" className={RED_ICON_BTN} onClick={() => removeItemRow(i)} aria-label="Remove item">
                        <TrashIcon />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={addItemRow}>
                  <PlusIcon data-icon="inline-start" />Add another item
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Ordered on</Label>
                  <DateInput value={form.ordered_on} onChange={v => setForm({ ...form, ordered_on: v })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>For {BRAND.workshopShort} order</Label>
                  <Select value={form.order_id} onValueChange={val => setForm({ ...form, order_id: val })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {orders.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.item} × {o.qty}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Site</Label>
                  <Select value={form.project_id} onValueChange={val => setForm({ ...form, project_id: val })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createPo} disabled={busy || !form.items.some(it => it.item.trim() && it.qty_ordered)}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pos.length === 0 && <StickyNote className="my-6">No purchase orders for this vendor.</StickyNote>}

      {pos.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Order date</Label>
            <DateInput value={filterDate} onChange={setFilterDate} className="w-36" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Site</Label>
            <Select value={filterSite} onValueChange={setFilterSite}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All sites" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {siteOptions.map(([pid, name]) => <SelectItem key={pid} value={String(pid)}>{name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Item</Label>
            <Input placeholder="Search item…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {(filterDate || filterSite || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterDate(''); setFilterSite(''); setSearch(''); }}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {pos.length > 0 && filteredPos.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No POs match your filters.</p>
      )}

      {selectableIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
          <span className="text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : `Select all (${selectableIds.length})`}
          </span>
          {selected.size > 0 && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={bulkMarkDelivered}>Mark as delivered</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={bulkMarkReturned}>Mark as returned</Button>
            </div>
          )}
        </div>
      )}

      {groupPosForDisplay(filteredPos).map(({ key, items }) => {
        const groupExpense = items.reduce((sum, po) =>
          sum + (poDisplayStatus(po) === 'cancelled' ? 0 : po.qty_ordered * (po.rate || 0)), 0);
        const first = items[0];
        return (
          <Card key={key}>
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDate(first.ordered_on)}</span>
                {first.project_name && <>· <Link href={`/projects/${first.project_id}`} className="text-primary hover:underline">{first.project_name}</Link></>}
              </div>

              {items.map((po, i) => {
                const st = poDisplayStatus(po);
                const outstanding = Math.max(0, po.qty_ordered - po.delivered);
                return (
                  <div key={po.id} className={i > 0 ? 'flex flex-col gap-3 border-t pt-3' : 'flex flex-col gap-3'}>
                    <div className="flex flex-wrap items-center gap-2">
                      {st !== 'cancelled' && (
                        <Checkbox checked={selected.has(po.id)} onCheckedChange={() => toggleOne(po.id)} aria-label="Select PO" />
                      )}
                      <span className="font-medium">{po.item} × {po.qty_ordered}</span>
                      {po.rate && <span className="text-sm text-muted-foreground">@ ₹{po.rate}</span>}
                      <Badge variant={st === 'cancelled' ? 'destructive' : st === 'open' ? 'default' : 'secondary'}>
                        {PO_STATUS_LABELS[st]}
                      </Badge>
                      {st === 'open' && outstanding > 0 && <Badge variant="outline">{outstanding} pending</Badge>}
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        {po.order_item && <>for <Link href={`/orders/${po.order_id}`} className="text-primary hover:underline">{po.order_item}</Link></>}
                        <Button variant="ghost" size="icon-sm" className={BLUE_ICON_BTN}
                          onClick={() => { setEditingPo(po); setEditForm({ item: po.item, qty_ordered: po.qty_ordered, rate: po.rate ?? '', order_id: po.order_id ? String(po.order_id) : '', project_id: po.project_id ? String(po.project_id) : '', ordered_on: po.ordered_on, notes: po.notes || '' }); }}
                          aria-label="Edit PO">
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className={RED_ICON_BTN} onClick={() => deletePo(po)} aria-label="Delete PO">
                          <TrashIcon />
                        </Button>
                      </span>
                    </div>

                    {po.deliveries.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {po.deliveries.map(d => (
                          <div key={d.id} className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="w-24 shrink-0">{formatDate(d.date)}</span>
                            {d.qty_delivered > 0 && <span className="text-foreground">+{d.qty_delivered} delivered</span>}
                            {d.qty_returned > 0 && <span className="text-destructive">−{d.qty_returned} returned</span>}
                            {d.notes && <span className="truncate">· {d.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {st !== 'cancelled' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDelivery({ poId: po.id, date: todayISO(), qty_delivered: '', qty_returned: '', notes: '' })}>
                          <PackageCheckIcon data-icon="inline-start" />Record delivery / return
                        </Button>
                        {st === 'open' && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => cancelPo(po)}>Cancel PO</Button>}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end border-t pt-3">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Expense</p>
                  <p className="text-xl font-bold">{formatMoney(groupExpense) || '₹0'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!delivery} onOpenChange={o => !o && setDelivery(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record delivery / return</DialogTitle></DialogHeader>
          {delivery && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Date</Label>
                  <DateInput value={delivery.date} onChange={v => setDelivery({ ...delivery, date: v })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Qty delivered</Label>
                  <Input type="number" min="0" value={delivery.qty_delivered} onChange={e => setDelivery({ ...delivery, qty_delivered: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Qty returned</Label>
                  <Input type="number" min="0" value={delivery.qty_returned} onChange={e => setDelivery({ ...delivery, qty_returned: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Notes</Label>
                <Input placeholder="e.g. 2 sheets damaged, returned" value={delivery.notes} onChange={e => setDelivery({ ...delivery, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelivery(null)}>Cancel</Button>
            <Button onClick={recordDelivery} disabled={busy || (!delivery?.qty_delivered && !delivery?.qty_returned)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPo} onOpenChange={o => !o && setEditingPo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit purchase order</DialogTitle></DialogHeader>
          {editForm && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-2">
                  <Label>Item / material</Label>
                  <Input value={editForm.item} onChange={e => setEditForm({ ...editForm, item: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Qty</Label>
                  <Input type="number" min="1" value={editForm.qty_ordered} onChange={e => setEditForm({ ...editForm, qty_ordered: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Rate per unit (₹)</Label>
                  <Input type="number" min="0" value={editForm.rate} onChange={e => setEditForm({ ...editForm, rate: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Ordered on</Label>
                  <DateInput value={editForm.ordered_on} onChange={v => setEditForm({ ...editForm, ordered_on: v })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>For {BRAND.workshopShort} order</Label>
                  <Select value={editForm.order_id} onValueChange={val => setEditForm({ ...editForm, order_id: val })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {orders.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.item} × {o.qty}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Site</Label>
                  <Select value={editForm.project_id} onValueChange={val => setEditForm({ ...editForm, project_id: val })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Notes</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPo(null)}>Cancel</Button>
            <Button onClick={saveEditPo} disabled={busy || !editForm?.item?.trim() || !editForm?.qty_ordered}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Freight & rate card ---------------- */

function FreightTab({ vendorId, rates, freight, onChanged }) {
  const [rate, setRate] = useState({ from_loc: '', to_loc: '', expected_amount: '' });
  const [charge, setCharge] = useState({ date: todayISO(), from_loc: '', to_loc: '', amount: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState([]);

  useEffect(() => { api('/api/projects').then(setProjects).catch(() => {}); }, []);

  // Suggestions for the From/To fields: known sites + every location already used on this
  // vendor's rate card or freight log. Still a free-text input — typing a new value is fine.
  const locSuggestions = [...new Set([
    ...projects.map(p => p.name),
    ...rates.flatMap(r => [r.from_loc, r.to_loc]),
    ...freight.flatMap(f => [f.from_loc, f.to_loc]),
  ])];

  async function addRate() {
    setBusy(true);
    try {
      await api('/api/vendor-rates', { method: 'POST', body: { vendor_id: vendorId, ...rate, expected_amount: Number(rate.expected_amount) } });
      setRate({ from_loc: '', to_loc: '', expected_amount: '' });
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function deleteRate(id) {
    await api(`/api/vendor-rates/${id}`, { method: 'DELETE' });
    onChanged();
  }

  async function addCharge() {
    setBusy(true);
    try {
      const r = await api('/api/freight', { method: 'POST', body: { vendor_id: vendorId, ...charge, amount: Number(charge.amount) } });
      if (r.overcharged) showToast(`Above rate card! Expected ₹${r.expected_amount.toLocaleString('en-IN')}`, 'warning');
      else showToast('Freight charge logged');
      setCharge({ date: todayISO(), from_loc: '', to_loc: '', amount: '', notes: '' });
      onChanged();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function deleteCharge(id) {
    await api(`/api/freight/${id}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Rate card</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input list="vendor-locs" placeholder="From" value={rate.from_loc} onChange={e => setRate({ ...rate, from_loc: e.target.value })} className="w-28 flex-1" />
            <Input list="vendor-locs" placeholder="To" value={rate.to_loc} onChange={e => setRate({ ...rate, to_loc: e.target.value })} className="w-28 flex-1" />
            <Input type="number" placeholder="₹ expected" value={rate.expected_amount} onChange={e => setRate({ ...rate, expected_amount: e.target.value })} className="w-28" />
            <Button size="sm" onClick={addRate} disabled={busy || !rate.from_loc || !rate.to_loc || !rate.expected_amount}><PlusIcon /></Button>
          </div>
          {rates.length === 0 && <p className="text-sm text-muted-foreground">No routes yet. Add the agreed freight per route — charges above it get flagged.</p>}
          {rates.map(r => (
            <div key={r.id} className="group flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{r.from_loc} → {r.to_loc}</span>
              <span className="ml-auto">₹{r.expected_amount.toLocaleString('en-IN')}</span>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => deleteRate(r.id)} aria-label="Delete rate">
                <TrashIcon />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader><CardTitle>Freight charges</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <DateInput value={charge.date} onChange={v => setCharge({ ...charge, date: v })} className="w-36" />
            <Input list="vendor-locs" placeholder="From" value={charge.from_loc} onChange={e => setCharge({ ...charge, from_loc: e.target.value })} className="w-24 flex-1" />
            <Input list="vendor-locs" placeholder="To" value={charge.to_loc} onChange={e => setCharge({ ...charge, to_loc: e.target.value })} className="w-24 flex-1" />
            <Input type="number" placeholder="₹ charged" value={charge.amount} onChange={e => setCharge({ ...charge, amount: e.target.value })} className="w-28" />
            <Button size="sm" onClick={addCharge} disabled={busy || !charge.from_loc || !charge.to_loc || !charge.amount}><PlusIcon /></Button>
          </div>
          {freight.length === 0 && <p className="text-sm text-muted-foreground">No freight logged yet.</p>}
          {freight.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right" aria-label="Flag" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {freight.map(f => {
                  const over = f.expected_amount != null && f.amount > f.expected_amount;
                  return (
                    <TableRow key={f.id} className="group">
                      <TableCell className="whitespace-nowrap">{formatDate(f.date)}</TableCell>
                      <TableCell>{f.from_loc} → {f.to_loc}</TableCell>
                      <TableCell className={over ? 'text-right font-medium text-destructive' : 'text-right'}>
                        ₹{f.amount.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {f.expected_amount != null ? `₹${f.expected_amount.toLocaleString('en-IN')}` : 'no rate'}
                      </TableCell>
                      <TableCell className="text-right">
                        {over && (
                          <Badge variant="destructive">
                            <AlertTriangleIcon data-icon="inline-start" />+₹{(f.amount - f.expected_amount).toLocaleString('en-IN')}
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon-sm" className="ml-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => deleteCharge(f.id)} aria-label="Delete charge">
                          <TrashIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <datalist id="vendor-locs">
        {locSuggestions.map(l => <option key={l} value={l} />)}
      </datalist>
    </div>
  );
}
