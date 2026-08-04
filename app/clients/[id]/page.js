'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, showToast, formatDate, capitalize } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { ArrowLeftIcon, PencilIcon, SendIcon, PlusIcon, XIcon, DownloadIcon } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';

const rupees = n => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const EMPTY_ITEM = { description: '', hsn: '', gst_pct: 18, qty: 1, unit_price: 0 };
const EMPTY_INVOICE = { company: 'savistar', project_id: 'none', invoice_no: '', title: '', client_pan: '', submitted_on: '', due_date: '', payment_terms: '', status: 'draft', notes: '', items: [{ ...EMPTY_ITEM }] };

function invoiceTotals(items) {
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);
  const tax = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0) * (Number(i.gst_pct) || 0) / 100, 0);
  return { subtotal, cgst: tax / 2, sgst: tax / 2, total: subtotal + tax };
}

export default function ClientDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState(null);
  const [msg, setMsg] = useState('');
  const [msgProject, setMsgProject] = useState('none');
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);
  const [invoice, setInvoice] = useState(EMPTY_INVOICE);

  const load = useCallback(async () => {
    try { setClient(await api(`/api/clients/${id}`)); }
    catch (e) { showToast(e.message, 'error'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function sendMessage() {
    setBusy(true);
    try {
      await api(`/api/clients/${id}/conversations`, {
        method: 'POST',
        body: { body: msg, project_id: msgProject === 'none' ? null : Number(msgProject) },
      });
      setMsg('');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await api(`/api/clients/${id}`, { method: 'PUT', body: edit });
      showToast('Client updated');
      setEditOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  function openNewInvoice() {
    setInvoiceId(null);
    setInvoice(EMPTY_INVOICE);
    setInvoiceOpen(true);
  }

  async function openEditInvoice(inv) {
    const full = await api(`/api/invoices/${inv.id}`);
    setInvoiceId(inv.id);
    setInvoice({
      company: full.company || 'savistar',
      project_id: full.project_id ? String(full.project_id) : 'none',
      invoice_no: full.invoice_no || '',
      title: full.title || '',
      client_pan: full.client_pan || '',
      submitted_on: full.submitted_on || '',
      due_date: full.due_date || '',
      payment_terms: full.payment_terms || '',
      status: full.status,
      notes: full.notes || '',
      items: full.items.length ? full.items : [{ ...EMPTY_ITEM }],
    });
    setInvoiceOpen(true);
  }

  function updateItem(i, patch) {
    setInvoice(v => ({ ...v, items: v.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  }
  function addItem() {
    setInvoice(v => ({ ...v, items: [...v.items, { ...EMPTY_ITEM }] }));
  }
  function removeItem(i) {
    setInvoice(v => ({ ...v, items: v.items.filter((_, idx) => idx !== i) }));
  }

  async function saveInvoice() {
    setBusy(true);
    try {
      const body = { ...invoice, client_id: Number(id), project_id: invoice.project_id === 'none' ? null : Number(invoice.project_id) };
      if (invoiceId) await api(`/api/invoices/${invoiceId}`, { method: 'PUT', body });
      else await api('/api/invoices', { method: 'POST', body });
      showToast(invoiceId ? 'Invoice updated' : 'Invoice created');
      setInvoiceOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function deleteInvoice() {
    if (!confirm('Delete this invoice?')) return;
    try {
      await api(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
      showToast('Invoice deleted');
      setInvoiceOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function remove() {
    if (!confirm(`Delete ${client.name}? This removes their conversations too.`)) return;
    try {
      await api(`/api/clients/${id}`, { method: 'DELETE' });
      showToast('Client deleted');
      router.push('/clients');
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!client) return <div className="container py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/clients"><ArrowLeftIcon /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[client.phone, client.email, client.address].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
        </div>
        <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (o) setEdit({ name: client.name, phone: client.phone || '', email: client.email || '', address: client.address || '', notes: client.notes || '' }); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><PencilIcon data-icon="inline-start" />Edit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit client</DialogTitle></DialogHeader>
            {edit && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Phone</Label>
                    <Input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Email</Label>
                    <Input value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Address</Label>
                  <Input value={edit.address} onChange={e => setEdit({ ...edit, address: e.target.value })} />
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

      {client.notes && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{client.notes}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Conversations */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Conversations</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Textarea placeholder="Log a call, meeting or message…" value={msg} onChange={e => setMsg(e.target.value)} />
              <div className="flex items-center gap-2">
                {client.projects.length > 0 && (
                  <Select value={msgProject} onValueChange={setMsgProject}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">No project</SelectItem>
                        {client.projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" onClick={sendMessage} disabled={busy || !msg.trim()} className="ml-auto">
                  <SendIcon data-icon="inline-start" />Log
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {client.conversations.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No conversations logged yet.</p>}
              {client.conversations.map(cv => (
                <div key={cv.id} className="rounded-lg border p-3">
                  <p className="whitespace-pre-wrap text-sm">{cv.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {cv.created_by || 'unknown'} · {formatDate(cv.created_at)}
                    {cv.project_name && <> · <Badge variant="outline" className="align-middle">{cv.project_name}</Badge></>}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Projects & Orders */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Savistar projects</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {client.projects.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
              {client.projects.map(p => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  <span className="truncate font-medium">{p.name}</span>
                  <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{capitalize(p.status)}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Saag orders</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {client.orders.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
              {client.orders.map(o => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  <span className="truncate font-medium">{o.item} × {o.qty}</span>
                  <Badge variant={o.status === 'delivered' ? 'secondary' : 'default'}>{capitalize(o.status).replace('_', ' ')}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Invoices</CardTitle>
          <Button size="sm" onClick={openNewInvoice}><PlusIcon data-icon="inline-start" />New invoice</Button>
        </CardHeader>
        <CardContent>
          {client.invoices.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No invoices yet.</p>}
          {client.invoices.length > 0 && (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.invoices.map(inv => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => openEditInvoice(inv)}>
                    <TableCell className="font-medium">{inv.invoice_no || `#${inv.id}`}</TableCell>
                    <TableCell>{formatDate(inv.submitted_on)}</TableCell>
                    <TableCell>{formatDate(inv.due_date)}</TableCell>
                    <TableCell><Badge variant={inv.status === 'paid' ? 'secondary' : 'default'}>{capitalize(inv.status)}</Badge></TableCell>
                    <TableCell className="text-right">{rupees(inv.subtotal + inv.tax)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{invoiceId ? 'Edit invoice' : 'New invoice'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="flex flex-col gap-2">
                <Label>Company</Label>
                <Select value={invoice.company} onValueChange={v => setInvoice({ ...invoice, company: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="savistar">Savistar</SelectItem>
                      <SelectItem value="saag">Saag</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Invoice no.</Label>
                <Input value={invoice.invoice_no} onChange={e => setInvoice({ ...invoice, invoice_no: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Submitted on</Label>
                <DateInput value={invoice.submitted_on} onChange={v => setInvoice({ ...invoice, submitted_on: v })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Due date</Label>
                <DateInput value={invoice.due_date} onChange={v => setInvoice({ ...invoice, due_date: v })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select value={invoice.status} onValueChange={v => setInvoice({ ...invoice, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Invoice for</Label>
                <Input value={invoice.title} onChange={e => setInvoice({ ...invoice, title: e.target.value })} placeholder="e.g. Transport Invoice" />
              </div>
              {client.projects.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Project</Label>
                  <Select value={invoice.project_id} onValueChange={v => setInvoice({ ...invoice, project_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">No project</SelectItem>
                        {client.projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label>Payment terms</Label>
                <Input value={invoice.payment_terms} onChange={e => setInvoice({ ...invoice, payment_terms: e.target.value })} placeholder="e.g. 50% advance" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Client PAN</Label>
                <Input value={invoice.client_pan} onChange={e => setInvoice({ ...invoice, client_pan: e.target.value })} placeholder="Optional" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Line items</Label>
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-full">Description</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead className="w-20">GST %</TableHead>
                      <TableHead className="w-16">Qty</TableHead>
                      <TableHead className="w-28">Unit price</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell><Input value={it.description} onChange={e => updateItem(i, { description: e.target.value })} placeholder="Item description" /></TableCell>
                        <TableCell><Input value={it.hsn} onChange={e => updateItem(i, { hsn: e.target.value })} className="w-24" /></TableCell>
                        <TableCell><Input type="number" value={it.gst_pct} onChange={e => updateItem(i, { gst_pct: e.target.value })} /></TableCell>
                        <TableCell><Input type="number" value={it.qty} onChange={e => updateItem(i, { qty: e.target.value })} /></TableCell>
                        <TableCell><Input type="number" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></TableCell>
                        <TableCell className="text-right text-sm">{rupees((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" onClick={() => removeItem(i)} disabled={invoice.items.length === 1}><XIcon /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" size="sm" className="self-start" onClick={addItem}><PlusIcon data-icon="inline-start" />Add item</Button>
            </div>

            <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm sm:w-56">
              {(() => { const t = invoiceTotals(invoice.items); return (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupees(t.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{rupees(t.cgst)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{rupees(t.sgst)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Grand total</span><span>{rupees(t.total)}</span></div>
                </>
              ); })()}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Notes</Label>
              <Textarea value={invoice.notes} onChange={e => setInvoice({ ...invoice, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {invoiceId ? (
              <div className="flex gap-2">
                <Button variant="ghost" className="text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={deleteInvoice}><TrashIcon data-icon="inline-start" />Delete</Button>
                <Button variant="outline" asChild><a href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer"><DownloadIcon data-icon="inline-start" />PDF</a></Button>
              </div>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
              <Button onClick={saveInvoice} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
