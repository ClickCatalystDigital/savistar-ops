'use client';

import { PageTitle } from '@/components/page-title';
import { NewButton } from '@/components/new-button';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { materialsIn } from '@/lib/materials';
import { StickyNote } from '@/components/sticky-note';
import { api, showToast, formatMoney } from '@/lib/client';
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
import { AlertTriangleIcon } from 'lucide-react';

const EMPTY = { name: '', phone: '', material: '', notes: '' };

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() { setVendors(await api('/api/vendors')); }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await api('/api/vendors', { method: 'POST', body: form });
      showToast('Vendor added');
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
          <PageTitle>Vendors</PageTitle>
          <p className="text-sm text-muted-foreground">Material suppliers — orders, deliveries, freight rates</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><NewButton label="New vendor" /></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New vendor</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Material supplied</Label>
                <Input placeholder="e.g. Plywood, hardware, glass" value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-center">Open POs</TableHead>
              <TableHead className="text-center">Freight overcharges</TableHead>
              <TableHead className="text-right">Total expense</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8"><StickyNote>No vendors yet. Add your first supplier.</StickyNote></TableCell></TableRow>
            )}
            {vendors.map(v => (
              <TableRow key={v.id}>
                <TableCell>
                  <Link href={`/vendors/${v.id}`} className="font-medium text-primary hover:underline">{v.name}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="flex items-center gap-2">
                    {/* A sample chip of what they supply; dashed when it isn't a material we know. */}
                    {materialsIn(v.material, 1).map(m => <span key={m.name} className="size-4 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: m.hex }} />)}
                    {!materialsIn(v.material, 1).length && <span className="size-4 rounded-sm border border-dashed border-muted-foreground/40" />}
                    {v.material || '—'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{v.phone || '—'}</TableCell>
                <TableCell className="text-center">{v.open_pos > 0 ? <Badge variant="secondary">{v.open_pos}</Badge> : '—'}</TableCell>
                <TableCell className="text-center">
                  {v.overcharges > 0 ? (
                    <Badge variant="destructive"><AlertTriangleIcon data-icon="inline-start" />{v.overcharges}</Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right font-medium">{formatMoney(v.total_expense) || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
