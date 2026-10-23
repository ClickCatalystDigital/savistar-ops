'use client';

import { PageTitle } from '@/components/page-title';
import { NewButton } from '@/components/new-button';
import { useEffect, useRef, useState, useCallback } from 'react';
import { StickyNote } from '@/components/sticky-note';
import { api, showToast, formatDate, capitalize } from '@/lib/client';
import { todayISO } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
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
  PencilIcon, PaperclipIcon, UploadIcon, ArrowLeftIcon,
  Loader2Icon, FileTextIcon, ExternalLinkIcon,
  ChevronLeftIcon, ChevronRightIcon, CopyIcon, EyeIcon, EyeOffIcon,
  WalletIcon, LandmarkIcon, ArrowDownLeftIcon, ArrowUpRightIcon, TriangleAlertIcon, CheckIcon,
} from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

// Full Indian grouping, paise only when there are any (₹2,89,607.50, ₹12,000).
const rupees = (n) => Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

const TONES = {
  in: { edge: 'bg-success', chip: 'bg-success/10 text-success' },
  out: { edge: 'bg-danger', chip: 'bg-danger/10 text-danger' },
  balance: { edge: 'bg-info', chip: 'bg-info/10 text-info' },
  short: { edge: 'bg-danger', chip: 'bg-danger/10 text-danger' },
};

// A KPI as a paper ledger slip: handwritten label, Fira Code figure, a coloured tab on the edge.
function Stat({ label, value, tone, icon: Icon, hint, hero }) {
  const t = TONES[tone];
  return (
    <div className="paper-surface relative flex flex-col gap-3 overflow-hidden rounded-xl py-4 pr-4 pl-5">
      <span aria-hidden className={cn('absolute top-4 bottom-4 left-0 w-[3px] rounded-r-full', t.edge)} />
      <div className="flex items-start justify-between gap-3">
        <span className="font-hand text-[0.95rem] leading-tight text-muted-foreground">{label}</span>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', t.chip)}><Icon className="size-4" /></span>
      </div>
      <p className={cn('figures w-fit text-2xl tracking-tight sm:text-[1.65rem]', hero && value != null && 'marker', tone === 'short' && 'text-danger')}>
        {value == null ? <span className="text-muted-foreground">—</span> : (
          <><span className="mr-0.5 text-[0.7em] text-muted-foreground">{value < 0 ? '−₹' : '₹'}</span>{rupees(value)}</>
        )}
      </p>
      {hint && <p className="figures -mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const accountLabel = (a) => `${a.bank_name || 'Bank'} · …${String(a.account_no).slice(-4)}`;
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// One account's statements in date order, with what's missing or doubled between neighbours.
// Sharing a boundary day ("01 Jul – 01 Aug" then "01 Aug – …") is normal bank printing, not an overlap.
function accountTimeline(stmts) {
  const out = [];
  stmts.forEach((s, i) => {
    const prev = stmts[i - 1];
    if (prev?.statement_to && s.statement_from) {
      if (s.statement_from > addDays(prev.statement_to, 1)) {
        out.push({ kind: 'gap', from: addDays(prev.statement_to, 1), to: addDays(s.statement_from, -1) });
      } else if (s.statement_from < prev.statement_to) {
        out.push({ kind: 'overlap', from: s.statement_from, to: s.statement_to && s.statement_to < prev.statement_to ? s.statement_to : prev.statement_to });
      }
    }
    out.push({ kind: 'statement', ...s });
  });
  return out;
}

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
        <PageTitle>Finance</PageTitle>
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

  // Balance after each row: rows are newest first and, without a month filter, complete,
  // so walk back from the all-time balance.
  let after = data.balance;
  const running = data.rows.map(t => { const b = after; after -= t.kind === 'credit' ? t.amount : -t.amount; return b; });

  const credits = data.rows.filter(r => r.kind === 'credit');
  const debits = data.rows.filter(r => r.kind === 'debit');
  const monthCredit = credits.reduce((s, r) => s + r.amount, 0);
  const monthDebit = debits.reduce((s, r) => s + r.amount, 0);
  const creditCount = credits.length, debitCount = debits.length;
  // Without a month filter the rows are the complete book (see `running` above).
  const periodLabel = month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : 'all time';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={scoped ? 'Your cash in hand' : 'Cash in hand'} hero
          value={data.balance} tone={data.balance < 0 ? 'short' : 'balance'} icon={WalletIcon}
          hint={data.balance < 0 ? `short by ₹${rupees(data.balance)}` : scoped ? 'your entries, all time' : 'every entry, all time'} />
        <Stat
          label={`${scoped ? 'You received' : 'Money in'} · ${periodLabel}`}
          value={monthCredit} tone="in" icon={ArrowDownLeftIcon}
          hint={plural(creditCount, 'credit')} />
        <Stat
          label={`${scoped ? 'You paid out' : 'Money out'} · ${periodLabel}`}
          value={monthDebit} tone="out" icon={ArrowUpRightIcon}
          hint={plural(debitCount, 'debit')} />
      </div>

      <div className="flex items-center gap-2">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
        {month && <Button variant="ghost" size="sm" onClick={() => setMonth('')}>All months</Button>}
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setEditing(null); setForm(EMPTY_TXN); } }}>
          <DialogTrigger asChild>
            <NewButton label="New transaction" className="ml-auto" />
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
              {!month && <TableHead className="text-right">Balance</TableHead>}
              <TableHead className="text-right">Files</TableHead>
              <TableHead className="text-right" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8"><StickyNote>No transactions{month ? ` in ${month}` : ''}.</StickyNote></TableCell></TableRow>
            )}
            {data.rows.map((t, i) => (
              <TableRow key={t.id} className="group">
                <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                <TableCell>
                  <span className="font-medium">{t.party || '—'}</span>
                  {t.description && <span className="text-muted-foreground"> · {t.description}</span>}
                </TableCell>
                <TableCell className="text-right font-medium text-green-700 dark:text-green-500">
                  {t.kind === 'credit' ? `₹${t.amount.toLocaleString('en-IN')}` : ''}
                </TableCell>
                <TableCell className="text-right font-medium text-red-700 dark:text-red-400">
                  {t.kind === 'debit' ? `₹${t.amount.toLocaleString('en-IN')}` : ''}
                </TableCell>
                {!month && (
                  <TableCell className={cn('text-right text-muted-foreground', running[i] < 0 && 'text-destructive')}>
                    {running[i] < 0 ? '−' : ''}₹{Math.abs(running[i]).toLocaleString('en-IN')}
                  </TableCell>
                )}
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

const PAGE_SIZES = [10, 20, 30, 50, 100];

function BankTab() {
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [month, setMonth] = useState(''); // YYYY-MM: statements whose period overlaps it
  const [account, setAccount] = useState('all'); // extracted account_no
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null); // doc id under review
  const [bankName, setBankName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [pwPrompt, setPwPrompt] = useState(null); // { message } once the server says a password is needed
  const [pwValue, setPwValue] = useState('');
  const [remember, setRemember] = useState(true);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page, pageSize });
    if (month) q.set('month', month);
    if (account !== 'all') q.set('account', account);
    const data = await api(`/api/documents?${q}`);
    if (!data.rows.length && page > 1) return setPage(p => p - 1); // last row on this page was deleted
    setDocs(data.rows);
    setTotal(data.total);
    setAccounts(data.accounts);
  }, [page, pageSize, month, account]);
  useEffect(() => { load(); }, [load]);

  function changePageSize(v) { setPageSize(Number(v)); setPage(1); }
  function changeMonth(v) { setMonth(v); setPage(1); }
  function changeAccount(v) { setAccount(v); setPage(1); }

  // Poll while any statement is still being read.
  useEffect(() => {
    if (!docs.some(d => d.status === 'reading')) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [docs, load]);

  // password=null tries without one (or with whatever's already saved for this bank);
  // the server replies `password_required` if the PDF is encrypted and that doesn't work.
  async function doUpload(password) {
    const file = fileRef.current?.files?.[0];
    if (!file) return showToast('Choose a statement PDF first', 'warning');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bank_name', bankName);
      if (password) {
        fd.append('password', password);
        fd.append('remember', remember ? 'true' : 'false');
      }
      const res = await fetch('/api/documents', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'password_required') { setPwPrompt({ message: data.error }); return; }
        throw new Error(data.error || 'Something went wrong');
      }
      showToast('Uploaded — reading transactions…');
      fileRef.current.value = '';
      setBankName('');
      setPwPrompt(null);
      setPwValue('');
      if (page === 1) load(); else setPage(1); // new upload sorts first; jump there if we weren't already
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const upload = () => doUpload(null);
  const submitPassword = () => pwValue && doUpload(pwValue);

  async function remove(d) {
    if (!confirm(`Delete statement "${d.original_filename}"?`)) return;
    try {
      await api(`/api/documents/${d.id}`, { method: 'DELETE' });
      if (selected === d.id) setSelected(null);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (selected) {
    return <StatementReview docId={selected} onOpen={setSelected} onBack={() => { setSelected(null); load(); }} />;
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

      <Dialog open={!!pwPrompt} onOpenChange={o => { if (!o) { setPwPrompt(null); setPwValue(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Password needed</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{pwPrompt?.message}</p>
            <div className="flex flex-col gap-2">
              <Label>PDF password</Label>
              <Input
                type="password" autoFocus value={pwValue}
                onChange={e => setPwValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitPassword(); }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="remember-pw" checked={remember && !!bankName.trim()} onCheckedChange={setRemember} disabled={!bankName.trim()} />
              <Label htmlFor="remember-pw" className="text-sm font-normal">
                {bankName.trim()
                  ? `Remember for "${bankName.trim()}" — don't ask again`
                  : 'Add a bank name above to remember this password'}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwPrompt(null); setPwValue(''); }}>Cancel</Button>
            <Button onClick={submitPassword} disabled={busy || !pwValue}>
              {busy ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              Unlock & upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={account} onValueChange={changeAccount}>
          <SelectTrigger className="w-60" aria-label="Account"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.account_no} value={a.account_no}>
                  {accountLabel(a)} <span className="figures text-xs text-muted-foreground">({a.statements})</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input type="month" value={month} onChange={e => changeMonth(e.target.value)} className="w-44" aria-label="Statements covering month" />
        {(month || account !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setMonth(''); setAccount('all'); setPage(1); }}>Clear filters</Button>
        )}
      </div>

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
              <TableRow><TableCell colSpan={6} className="py-8"><StickyNote>{month || account !== 'all' ? 'No statements match these filters.' : 'No statements uploaded yet.'}</StickyNote></TableCell></TableRow>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={changePageSize}>
              <SelectTrigger className="h-8 w-[4.5rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZES.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {total} total</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Button variant="outline" size="icon-sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)} aria-label="Next page">
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatementReview({ docId, onBack, onOpen }) {
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false); // unsaved notes, hide toggles or amount fixes
  const [fixing, setFixing] = useState(false); // amount cells editable, to correct a misread line
  const stripRef = useRef(null);
  // Bring the open statement's chip into view (it's often the newest, at the far right).
  useEffect(() => {
    const chip = stripRef.current?.querySelector('[data-current]');
    if (chip) stripRef.current.scrollLeft = chip.offsetLeft - (stripRef.current.clientWidth - chip.offsetWidth) / 2;
  }, [doc?.id]);
  const leave = (go) => { if (!dirty || confirm('Discard unsaved changes on this statement?')) { setDirty(false); go(); } };
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
      setDirty(false);
      showToast(status === 'approved' ? 'Statement approved' : 'Saved');
      if (status === 'approved') onBack();
      else load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  function setComment(i, comment) {
    const items = [...doc.line_items];
    items[i] = { ...items[i], comment };
    setDoc({ ...doc, line_items: items }); setDirty(true);
  }

  function setAmount(i, amount) {
    const items = [...doc.line_items];
    items[i] = { ...items[i], amount: Math.round(amount * 100) / 100 };
    setDoc({ ...doc, line_items: items }); setDirty(true);
  }

  function toggleIgnored(i) {
    const items = [...doc.line_items];
    items[i] = { ...items[i], ignored: !items[i].ignored };
    setDoc({ ...doc, line_items: items }); setDirty(true);
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

  const visibleItems = doc.line_items.filter(l => !l.ignored);
  const hiddenCount = doc.line_items.length - visibleItems.length;
  const totalCredit = visibleItems.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalDebit = visibleItems.filter(l => l.amount < 0).reduce((s, l) => s - l.amount, 0);

  // Do the extracted lines reach the statement's own closing balance? Every line counts, hidden ones too
  // (those are real lines of this statement, hidden only because another upload repeats them).
  const allIn = doc.line_items.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const allOut = doc.line_items.filter(l => l.amount < 0).reduce((s, l) => s - l.amount, 0);
  const reached = doc.opening_balance != null ? Math.round((Number(doc.opening_balance) + allIn - allOut) * 100) / 100 : null;
  const off = reached != null && doc.closing_balance != null ? Math.round((reached - Number(doc.closing_balance)) * 100) / 100 : null;
  const addsUp = off == null || Math.abs(off) < 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => leave(onBack)} aria-label="Back"><ArrowLeftIcon /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{doc.bank_name || 'Bank'} · {doc.account_no || 'account'}</h2>
          <p className="text-sm text-muted-foreground">
            {doc.statement_from ? `${formatDate(doc.statement_from)} – ${formatDate(doc.statement_to)}` : 'Period unknown'} · {visibleItems.length} transaction{visibleItems.length === 1 ? '' : 's'}
            {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
          </p>
        </div>
        <Button variant="outline" onClick={() => save()} disabled={busy}>Save changes</Button>
        {doc.status !== 'approved' && <Button onClick={() => save('approved')} disabled={busy}>Approve</Button>}
      </div>

      {doc.account_statements?.length > 1 && (
        <div className="paper-surface flex flex-col gap-2 rounded-xl px-4 py-3">
          <span className="font-hand text-[0.95rem] text-muted-foreground">
            Statements for this account <span className="figures text-xs">({doc.account_statements.length})</span>
          </span>
          <div ref={stripRef} className="scrollbar-none relative -mx-1 flex gap-2 overflow-x-auto scroll-smooth px-1 pb-1">
            {accountTimeline(doc.account_statements).map((t, i) => t.kind === 'statement' ? (
              <button key={t.id} type="button" disabled={t.id === doc.id} data-current={t.id === doc.id || undefined}
                onClick={() => leave(() => onOpen(t.id))}
                className={cn('figures flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                  t.id === doc.id ? 'border-primary bg-primary/10 text-primary' : 'bg-background/60 hover:border-primary/50 hover:text-primary')}>
                <span aria-hidden className={cn('size-1.5 rounded-full', t.status === 'approved' ? 'bg-success' : t.status === 'pending' ? 'bg-info' : 'bg-muted-foreground')} />
                {formatDate(t.statement_from)} – {t.statement_to ? formatDate(t.statement_to) : '?'}
              </button>
            ) : (
              <span key={`${t.kind}-${i}`}
                className={cn('figures flex shrink-0 items-center rounded-full border border-dashed px-3 py-1 text-xs',
                  t.kind === 'gap' ? 'border-danger/50 text-danger' : 'border-warning/60 text-amber-700 dark:text-amber-500')}
                title={t.kind === 'gap' ? 'No statement uploaded for these dates' : 'Two statements cover these dates — check the duplicate flags'}>
                {t.kind === 'gap' ? 'Missing' : 'Overlap'} {formatDate(t.from)}{t.to !== t.from ? ` – ${formatDate(t.to)}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {off != null && (!addsUp || fixing) && (
        <div className="paper-surface flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full',
            addsUp ? 'bg-success/10 text-success' : 'bg-warning/15 text-amber-700 dark:text-amber-500')}>
            {addsUp ? <CheckIcon className="size-4" /> : <TriangleAlertIcon className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-hand text-[1.05rem] leading-snug">
              {addsUp ? 'The lines add up to the closing balance now.' : <>The lines don&apos;t add up: off by <span className="figures text-[0.9em]">₹{rupees(off)}</span></>}
            </p>
            <p className="figures text-xs text-muted-foreground">
              ₹{rupees(Number(doc.opening_balance))} opening + ₹{rupees(allIn)} in − ₹{rupees(allOut)} out = {reached < 0 ? '−' : ''}₹{rupees(reached)} · statement closes at {doc.closing_balance < 0 ? '−' : ''}₹{rupees(Number(doc.closing_balance))}
            </p>
            {!addsUp && (
              <p className="mt-1 text-xs text-muted-foreground">
                A line&apos;s amount or in/out was probably misread. Compare with the PDF and fix it; until it adds up the assistant flags this statement in its bank answers.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {doc.file_url && (
              <Button asChild variant="outline" size="sm"><a href={doc.file_url} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />Open PDF</a></Button>
            )}
            <Button size="sm" variant={fixing ? 'default' : 'outline'} onClick={() => setFixing(f => !f)}>
              {fixing ? 'Done fixing' : <><PencilIcon data-icon="inline-start" />Fix amounts</>}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Closing balance" hero
          value={doc.closing_balance} tone={doc.closing_balance < 0 ? 'short' : 'balance'} icon={LandmarkIcon}
          hint={doc.opening_balance != null && doc.closing_balance != null
            ? `from ₹${rupees(doc.opening_balance)} · net ${doc.closing_balance >= doc.opening_balance ? '+' : '−'}₹${rupees(Math.round((doc.closing_balance - doc.opening_balance) * 100) / 100)}`
            : null} />
        <Stat
          label="Deposits" value={doc.total_credit != null ? Math.abs(doc.total_credit) : totalCredit}
          tone="in" icon={ArrowDownLeftIcon} hint={plural(visibleItems.filter(l => l.amount > 0).length, 'credit')} />
        <Stat
          label="Withdrawals" value={doc.total_debit != null ? Math.abs(doc.total_debit) : totalDebit}
          tone="out" icon={ArrowUpRightIcon} hint={plural(visibleItems.filter(l => l.amount < 0).length, 'debit')} />
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
              <TableRow key={i} className={cn(l.ignored && 'opacity-50')}>
                <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                <TableCell className="max-w-md">
                  <p className={cn('truncate text-sm', l.ignored && 'line-through')} title={l.description}>{l.description}</p>
                  {l.duplicate_of && (
                    <Badge variant="outline" className="mt-1 gap-1 text-amber-700 dark:text-amber-500"
                      title="Possible duplicate: the same date, amount and description appear on another statement, usually because two uploads overlap">

                      <CopyIcon className="size-3" data-icon="inline-start" />
                      Also in {l.duplicate_of.bank_name || l.duplicate_of.original_filename || 'another statement'}
                      {l.duplicate_of.statement_from && ` · ${formatDate(l.duplicate_of.statement_from)} – ${formatDate(l.duplicate_of.statement_to)}`}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className={`whitespace-nowrap text-right font-medium ${l.amount > 0 ? 'text-green-700 dark:text-green-500' : ''}`}>
                  {fixing ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="xs" className="w-10" onClick={() => setAmount(i, -l.amount)}
                        aria-label={l.amount > 0 ? 'Money in; switch to out' : 'Money out; switch to in'} title="Switch in / out">
                        {l.amount > 0 ? 'In' : 'Out'}
                      </Button>
                      <Input type="number" min="0" step="0.01" inputMode="decimal" aria-label="Amount"
                        value={Math.abs(l.amount)} onChange={e => setAmount(i, (l.amount > 0 ? 1 : -1) * (Number(e.target.value) || 0))}
                        className="figures h-8 w-28 text-right" />
                    </div>
                  ) : <>{l.amount > 0 ? '+' : ''}₹{Math.abs(l.amount).toLocaleString('en-IN')}</>}
                </TableCell>
                <TableCell>
                  <Input value={l.comment || ''} placeholder="Internal note…" onChange={e => setComment(i, e.target.value)} className="h-8" disabled={l.ignored} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(l.duplicate_of || l.ignored) && (
                      <Button variant="ghost" size="icon-sm" onClick={() => toggleIgnored(i)} aria-label={l.ignored ? 'Unhide transaction' : 'Hide duplicate transaction'}>
                        {l.ignored ? <EyeIcon className="text-muted-foreground" /> : <EyeOffIcon className="text-amber-700 dark:text-amber-500" />}
                      </Button>
                    )}
                    {l.attachment_url ? (
                      <Button asChild variant="ghost" size="icon-sm" aria-label="Open receipt">
                        <a href={l.attachment_url} target="_blank" rel="noreferrer"><FileTextIcon /></a>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon-sm" onClick={() => { setAttachIndex(i); lineFileRef.current?.click(); }} aria-label="Attach receipt">
                        <PaperclipIcon className="text-muted-foreground" />
                      </Button>
                    )}
                  </div>
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
