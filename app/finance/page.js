'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api, showToast, formatDate, formatMoney, capitalize } from '@/lib/client';
import { todayISO } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
import {
  PlusIcon, PencilIcon, PaperclipIcon, UploadIcon, ArrowLeftIcon,
  Loader2Icon, FileTextIcon, ExternalLinkIcon,
} from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { BRAND } from '@/lib/brand';

export default function FinancePage() {
  const [me, setMe] = useState(null);
  useEffect(() => { api('/api/me').then(setMe).catch(() => {}); }, []);

  if (!me) return null;

  // Staff get a cash-only view scoped to entries they created themselves — no Bank tab,
  // no company-wide totals. Owners/admins/managers keep the full book, same as before.
  const staff = me.role === 'user';

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div>
        <h1 className="page-title">Finance</h1>
        <p className="text-sm text-muted-foreground">
          {staff ? 'Cash entries you\'ve added' : `One combined book — ${BRAND.studioShort} & ${BRAND.workshopShort}`}
        </p>
      </div>
      {staff ? <CashTab scoped /> : (
        <Tabs defaultValue="cash">
          <TabsList>
            <TabsTrigger value="cash">Cash</TabsTrigger>
            <TabsTrigger value="bank">Bank</TabsTrigger>
          </TabsList>
          <TabsContent value="cash" className="mt-4"><CashTab /></TabsContent>
          <TabsContent value="bank" className="mt-4"><BankTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ---------------- Cash ledger ---------------- */

const EMPTY_TXN = { date: todayISO(), kind: 'debit', amount: '', party: '', description: '' };

// Cash "Party" typeahead over vendors + clients — falls back to free text for anything else
// (staff reimbursements, misc). Suffix only shown when a name collides across both lists.
function partyCollisions(vendors, clients) {
  const vendorNames = new Set(vendors.map(v => v.name));
  return new Set(clients.filter(c => vendorNames.has(c.name)).map(c => c.name));
}

function resolveParty(text, vendors, clients) {
  const clean = (text || '').trim();
  const suffix = clean.match(/ — (Vendor|Client)$/)?.[1];
  const stripped = clean.replace(/ — (Vendor|Client)$/, '');
  if (suffix !== 'Client') {
    const v = vendors.find(x => x.name === stripped);
    if (v) return { party: v.name, party_type: 'vendor', party_id: v.id };
  }
  if (suffix !== 'Vendor') {
    const c = clients.find(x => x.name === stripped);
    if (c) return { party: c.name, party_type: 'client', party_id: c.id };
  }
  return { party: clean, party_type: null, party_id: null };
}

function displayParty(t, vendors, clients) {
  if (!t.party_type || !t.party) return t.party || '';
  const collides = partyCollisions(vendors, clients).has(t.party);
  return collides ? `${t.party} — ${capitalize(t.party_type)}` : t.party;
}

function CashTab({ scoped = false }) {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TXN);
  const [editing, setEditing] = useState(null); // txn id being edited
  const [attachFor, setAttachFor] = useState(null); // txn to manage attachments for
  const [busy, setBusy] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [clients, setClients] = useState([]);

  const load = useCallback(async () => {
    setData(await api(`/api/cash${month ? `?month=${month}` : ''}`));
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/api/vendors').then(setVendors).catch(() => {});
    api('/api/clients').then(setClients).catch(() => {});
  }, []);

  const collisions = partyCollisions(vendors, clients);
  const partySuggestions = [
    ...vendors.map(v => collisions.has(v.name) ? `${v.name} — Vendor` : v.name),
    ...clients.map(c => collisions.has(c.name) ? `${c.name} — Client` : c.name),
  ];

  async function save() {
    setBusy(true);
    try {
      const body = { ...form, amount: Number(form.amount), ...resolveParty(form.party, vendors, clients) };
      if (editing) {
        await api(`/api/cash/${editing}`, { method: 'PUT', body });
        showToast('Transaction updated');
      } else {
        await api('/api/cash', { method: 'POST', body });
        showToast('Transaction added');
      }
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_TXN);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function remove(t) {
    if (!confirm(`Delete this ${t.kind} of ₹${t.amount.toLocaleString('en-IN')}?`)) return;
    try {
      await api(`/api/cash/${t.id}`, { method: 'DELETE' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!data) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;

  const monthCredit = data.rows.filter(r => r.kind === 'credit').reduce((s, r) => s + r.amount, 0);
  const monthDebit = data.rows.filter(r => r.kind === 'debit').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>{scoped ? 'Your balance (all time)' : 'Cash balance (all time)'}</CardDescription></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${data.balance < 0 ? 'text-destructive' : ''}`}>{formatMoney(Math.abs(data.balance)) || '₹0'}{data.balance < 0 ? ' (short)' : ''}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{scoped ? 'Your credits' : 'Credits'} {month ? `in ${month}` : '(shown)'}</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatMoney(monthCredit) || '₹0'}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{scoped ? 'Your debits' : 'Debits'} {month ? `in ${month}` : '(shown)'}</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatMoney(monthDebit) || '₹0'}</p></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
        {month && <Button variant="ghost" size="sm" onClick={() => setMonth('')}>All months</Button>}
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setEditing(null); setForm(EMPTY_TXN); } }}>
          <DialogTrigger asChild>
            <Button className="ml-auto"><PlusIcon data-icon="inline-start" />Add transaction</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit transaction' : 'New cash transaction'}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Date</Label>
                  <DateInput value={form.date} onChange={v => setForm({ ...form, date: v })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Type</Label>
                  <Select value={form.kind} onValueChange={v => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="credit">Credit (in)</SelectItem>
                        <SelectItem value="debit">Debit (out)</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Amount (₹)</Label>
                  <Input type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Party</Label>
                <Input list="party-suggestions" placeholder="Who paid / was paid" value={form.party} onChange={e => setForm({ ...form, party: e.target.value })} />
                <datalist id="party-suggestions">
                  {partySuggestions.map(p => <option key={p} value={p} />)}
                </datalist>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Input placeholder="What this was for" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.amount}>{busy ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Party / description</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Files</TableHead>
              <TableHead className="text-right" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No transactions{month ? ` in ${month}` : ''}.</TableCell></TableRow>
            )}
            {data.rows.map(t => (
              <TableRow key={t.id} className="group">
                <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                <TableCell>
                  <span className="font-medium">{t.party || '—'}</span>
                  {t.description && <span className="text-muted-foreground"> · {t.description}</span>}
                </TableCell>
                <TableCell className="text-right font-medium text-green-700 dark:text-green-500">
                  {t.kind === 'credit' ? `₹${t.amount.toLocaleString('en-IN')}` : ''}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {t.kind === 'debit' ? `₹${t.amount.toLocaleString('en-IN')}` : ''}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setAttachFor(t)}>
                    <PaperclipIcon data-icon="inline-start" />{t.attachment_count || ''}
                  </Button>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100"
                    onClick={() => { setEditing(t.id); setForm({ date: t.date, kind: t.kind, amount: t.amount, party: displayParty(t, vendors, clients), description: t.description || '' }); setOpen(true); }}
                    aria-label="Edit">
                    <PencilIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => remove(t)} aria-label="Delete">
                    <TrashIcon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AttachmentsDialog
        entity={attachFor ? { type: 'cash_transaction', id: attachFor.id, label: `${capitalize(attachFor.kind)} ₹${attachFor.amount.toLocaleString('en-IN')} · ${formatDate(attachFor.date)}` } : null}
        onClose={() => { setAttachFor(null); load(); }}
      />
    </div>
  );
}

/* Attachment manager for any entity (view, upload, delete). */
function AttachmentsDialog({ entity, onClose }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (entity) {
      api(`/api/attachments?entity_type=${entity.type}&entity_id=${entity.id}`).then(setFiles).catch(() => setFiles([]));
    }
  }, [entity?.type, entity?.id]);

  if (!entity) return null;

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', entity.type);
      fd.append('entity_id', entity.id);
      await api('/api/attachments', { method: 'POST', body: fd });
      setFiles(await api(`/api/attachments?entity_type=${entity.type}&entity_id=${entity.id}`));
      showToast('File attached');
    } catch (err) { showToast(err.message, 'error'); }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(id) {
    await api(`/api/attachments?id=${id}`, { method: 'DELETE' });
    setFiles(files.filter(f => f.id !== id));
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attachments</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{entity.label}</p>
        <div className="flex flex-col gap-2">
          {files.length === 0 && <p className="py-2 text-sm text-muted-foreground">No files attached.</p>}
          {files.map(f => (
            <div key={f.id} className="group flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <a href={f.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline">{f.name || f.file_url}</a>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => remove(f.id)} aria-label="Delete file">
                <TrashIcon />
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <input ref={inputRef} type="file" className="hidden" onChange={upload} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} type="button">
              {busy ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
              Upload file
            </Button>
          </label>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Bank statements ---------------- */

function BankTab() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null); // doc id under review
  const [bankName, setBankName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setDocs(await api('/api/documents'));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Poll while any statement is still being read.
  useEffect(() => {
    if (!docs.some(d => d.status === 'reading')) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [docs, load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return showToast('Choose a statement PDF first', 'warning');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bank_name', bankName);
      await api('/api/documents', { method: 'POST', body: fd });
      showToast('Uploaded — reading transactions…');
      fileRef.current.value = '';
      setBankName('');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function remove(d) {
    if (!confirm(`Delete statement "${d.original_filename}"?`)) return;
    try {
      await api(`/api/documents/${d.id}`, { method: 'DELETE' });
      if (selected === d.id) setSelected(null);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (selected) {
    return <StatementReview docId={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex flex-col gap-2">
            <Label>Bank name</Label>
            <Input placeholder="e.g. HDFC Current" value={bankName} onChange={e => setBankName(e.target.value)} className="w-48" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Statement PDF</Label>
            <Input type="file" accept="application/pdf" ref={fileRef} className="w-64" />
          </div>
          <Button onClick={upload} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            Upload & extract
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            The PDF is stored securely and transactions are extracted automatically for review.
          </p>
        </CardContent>
      </Card>

      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bank / file</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Closing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No statements uploaded yet.</TableCell></TableRow>
            )}
            {docs.map(d => (
              <TableRow key={d.id} className="group">
                <TableCell>
                  <button className="text-left font-medium text-primary hover:underline" onClick={() => setSelected(d.id)}>
                    {d.bank_name || 'Bank'}
                  </button>
                  <p className="max-w-56 truncate text-xs text-muted-foreground">{d.original_filename}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {d.statement_from ? `${formatDate(d.statement_from)} – ${formatDate(d.statement_to)}` : '—'}
                </TableCell>
                <TableCell className="text-right">{d.opening_balance != null ? `₹${d.opening_balance.toLocaleString('en-IN')}` : '—'}</TableCell>
                <TableCell className="text-right">{d.closing_balance != null ? `₹${d.closing_balance.toLocaleString('en-IN')}` : '—'}</TableCell>
                <TableCell>
                  {d.status === 'reading' && <Badge variant="outline"><Loader2Icon className="animate-spin" data-icon="inline-start" />Reading…</Badge>}
                  {d.status === 'pending' && <Badge>Review</Badge>}
                  {d.status === 'approved' && <Badge variant="secondary">Approved</Badge>}
                  {d.status === 'extract_failed' && <Badge variant="destructive">{d.extract_error || 'Failed'}</Badge>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {d.file_url && (
                    <Button asChild variant="ghost" size="icon-sm" aria-label="Open PDF">
                      <a href={d.file_url} target="_blank" rel="noreferrer"><ExternalLinkIcon /></a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => remove(d)} aria-label="Delete">
                    <TrashIcon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatementReview({ docId, onBack }) {
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const lineFileRef = useRef(null);
  const [attachIndex, setAttachIndex] = useState(null);

  const load = useCallback(async () => {
    setDoc(await api(`/api/documents/${docId}`));
  }, [docId]);
  useEffect(() => { load(); }, [load]);

  async function save(status) {
    setBusy(true);
    try {
      await api(`/api/documents/${docId}`, { method: 'PUT', body: { line_items: doc.line_items, bank_name: doc.bank_name, status: status || doc.status } });
      showToast(status === 'approved' ? 'Statement approved' : 'Saved');
      if (status === 'approved') onBack();
      else load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  function setComment(i, comment) {
    const items = [...doc.line_items];
    items[i] = { ...items[i], comment };
    setDoc({ ...doc, line_items: items });
  }

  async function uploadLineFile(e) {
    const file = e.target.files?.[0];
    if (!file || attachIndex == null) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('line_index', attachIndex);
      await api(`/api/documents/${docId}/line-attachment`, { method: 'POST', body: fd });
      showToast('Receipt attached');
      load();
    } catch (err) { showToast(err.message, 'error'); }
    setAttachIndex(null);
    if (lineFileRef.current) lineFileRef.current.value = '';
  }

  if (!doc) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;

  const totalCredit = doc.line_items.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalDebit = doc.line_items.filter(l => l.amount < 0).reduce((s, l) => s - l.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back"><ArrowLeftIcon /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{doc.bank_name || 'Bank'} · {doc.account_no || 'account'}</h2>
          <p className="text-sm text-muted-foreground">
            {doc.statement_from ? `${formatDate(doc.statement_from)} – ${formatDate(doc.statement_to)}` : 'Period unknown'} · {doc.line_items.length} transactions
          </p>
        </div>
        <Button variant="outline" onClick={() => save()} disabled={busy}>Save notes</Button>
        {doc.status !== 'approved' && <Button onClick={() => save('approved')} disabled={busy}>Approve</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Opening balance', doc.opening_balance],
          ['Closing balance', doc.closing_balance],
          ['Deposits', doc.total_credit ?? totalCredit],
          ['Withdrawals', doc.total_debit ?? totalDebit],
        ].map(([label, val]) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
            <CardContent><p className="text-lg font-bold">{val != null ? `₹${Number(val).toLocaleString('en-IN')}` : '—'}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-64">Note</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doc.line_items.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                <TableCell className="max-w-md">
                  <p className="truncate text-sm" title={l.description}>{l.description}</p>
                </TableCell>
                <TableCell className={`whitespace-nowrap text-right font-medium ${l.amount > 0 ? 'text-green-700 dark:text-green-500' : ''}`}>
                  {l.amount > 0 ? '+' : ''}₹{Math.abs(l.amount).toLocaleString('en-IN')}
                </TableCell>
                <TableCell>
                  <Input value={l.comment || ''} placeholder="Internal note…" onChange={e => setComment(i, e.target.value)} className="h-8" />
                </TableCell>
                <TableCell className="text-right">
                  {l.attachment_url ? (
                    <Button asChild variant="ghost" size="icon-sm" aria-label="Open receipt">
                      <a href={l.attachment_url} target="_blank" rel="noreferrer"><FileTextIcon /></a>
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon-sm" onClick={() => { setAttachIndex(i); lineFileRef.current?.click(); }} aria-label="Attach receipt">
                      <PaperclipIcon className="text-muted-foreground" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <input ref={lineFileRef} type="file" className="hidden" onChange={uploadLineFile} />
    </div>
  );
}
