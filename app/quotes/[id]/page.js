'use client';

// The quotation editor (QUOTATIONS-PLAN.md): rooms of lines picked from the studio's BOQ library,
// quantities from site dimensions, inline checks that never block, payment stages that later become
// invoices, and autosave. Draft and sent quotes are editable; accepted, declined and superseded ones
// are read-only (revise to change; variations come in release 2).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, showToast, formatDate } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { QuoteStatus } from '@/components/quote-status';
import { BRAND } from '@/lib/brand';
import { UNITS, UNIT_LABEL, checkLine, matchItem, linesFromPaste } from '@/lib/boq-check';
import { qtyFromDims } from '@/lib/dims';
import { quoteTotals, roomTotals, lineAmount, displayStatus, amountInWords } from '@/lib/quote-math';
import { todayISO } from '@/lib/date';
import {
  ArrowLeftIcon, BookOpenIcon, ClipboardPasteIcon, CopyIcon, DownloadIcon, FilePlusIcon, PlusIcon, SendIcon,
  CheckIcon, XIcon, GitBranchIcon, TriangleAlertIcon, Trash2Icon, LayersIcon, ReceiptTextIcon,
} from 'lucide-react';

const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let keySeq = 0;
const withKey = (it) => ({ ...it, _k: ++keySeq });
const blankLine = (section) => withKey({ section, description: '', unit: '', dims: '', measurement_basis: '', qty: '', rate: '', gst_pct: 18, boq_item_id: null, dismissed_flags: '' });

export default function QuoteEditor() {
  const { id } = useParams();
  const router = useRouter();
  const [q, setQ] = useState(null);
  const [items, setItems] = useState([]);
  const [stages, setStages] = useState([]);
  const [lib, setLib] = useState([]);
  const [projects, setProjects] = useState([]);
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [rates, setRates] = useState({});               // boq_item_id → last quoted rates
  const [picker, setPicker] = useState(null);           // { key } of the line choosing an item
  const [paste, setPaste] = useState(null);             // { section, text }
  const [copyOpen, setCopyOpen] = useState(false);
  const [dialog, setDialog] = useState(null);           // 'send' | 'accept'
  const [openFlags, setOpenFlags] = useState({});
  const dirty = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/quotations/${id}`);
      setQ(data);
      setItems(data.items.map(withKey));
      setStages(data.stages);
      setSaveState('saved');
      dirty.current = false;
      const c = await api(`/api/clients/${data.client_id}`);
      setProjects(c.projects);
    } catch (e) { showToast(e.message, 'error'); }
  }, [id]);
  useEffect(() => { load(); api('/api/boq-items').then(setLib).catch(() => {}); }, [load]);

  const editable = q && (q.status === 'draft' || q.status === 'sent');
  const libById = useMemo(() => new Map(lib.map((r) => [r.id, r])), [lib]);

  // ---- autosave ---------------------------------------------------------------------------------
  const payload = useCallback(() => ({
    project_id: q?.project_id, company: q?.company, quote_no: q?.quote_no, title: q?.title, quoted_on: q?.quoted_on,
    valid_until: q?.valid_until, place_of_supply: q?.place_of_supply, terms: q?.terms, notes: q?.notes,
    items: items.map(({ _k, ...it }) => it), stages,
  }), [q, items, stages]);

  const save = useCallback(async (opts = {}) => {
    if (!dirty.current || !editable) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/quotations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), keepalive: !!opts.keepalive });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Not saved');
      dirty.current = false;
      setSaveState('saved');
    } catch (e) { setSaveState('error'); if (!opts.keepalive) showToast(e.message, 'error'); }
  }, [id, payload, editable]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => save(), 1200);
    return () => clearTimeout(t);
  }, [q, items, stages, save]);
  // Closing the tab mid-edit still saves the last change.
  useEffect(() => {
    const flush = () => save({ keepalive: true });
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [save]);

  const touch = () => { dirty.current = true; setSaveState('dirty'); };
  const setField = (patch) => { touch(); setQ((v) => ({ ...v, ...patch })); };
  const setLine = (key, patch) => { touch(); setItems((list) => list.map((it) => (it._k === key ? { ...it, ...patch } : it))); };

  // Dimensions → quantity, in the line's unit. The typed dimensions print on the PDF as how it was measured.
  function setDims(line, dims) {
    const qty = qtyFromDims(dims, line.unit);
    setLine(line._k, qty == null ? { dims } : { dims, qty });
  }
  function setUnit(line, unit) {
    const qty = line.dims ? qtyFromDims(line.dims, unit) : null;
    setLine(line._k, qty == null ? { unit } : { unit, qty });
  }

  function addLine(section, afterKey) {
    touch();
    const line = blankLine(section);
    setItems((list) => {
      if (!afterKey) return [...list, line];
      const i = list.findIndex((it) => it._k === afterKey);
      return [...list.slice(0, i + 1), line, ...list.slice(i + 1)];
    });
    requestAnimationFrame(() => document.querySelector(`[data-desc="${line._k}"]`)?.focus());
  }
  const removeLine = (key) => { touch(); setItems((list) => list.filter((it) => it._k !== key)); };
  const renameRoom = (from, to) => { touch(); setItems((list) => list.map((it) => ((it.section || 'General') === from ? { ...it, section: to } : it))); };
  const duplicateRoom = (name) => { touch(); setItems((list) => [...list, ...list.filter((it) => (it.section || 'General') === name).map((it) => withKey({ ...it, section: `${name} (copy)` }))]); };
  const removeRoom = (name) => { if (confirm(`Remove ${name} and its lines?`)) { touch(); setItems((list) => list.filter((it) => (it.section || 'General') !== name)); } };
  function addRoom() {
    const name = prompt('Room name, e.g. Kitchen, Master bedroom');
    if (name?.trim()) addLine(name.trim());
  }

  async function pick(line, row) {
    setLine(line._k, { boq_item_id: row.id, description: row.description || row.name, unit: line.unit || row.unit, dismissed_flags: '' });
    setPicker(null);
    loadRates(row.id);
  }
  async function loadRates(itemId) {
    if (!itemId || rates[itemId]) return;
    try { const r = await api(`/api/boq-items/${itemId}/rates?exclude=${id}`); setRates((m) => ({ ...m, [itemId]: r })); } catch {}
  }
  useEffect(() => { for (const it of items) if (it.boq_item_id) loadRates(it.boq_item_id); /* once per item */ }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPaste() {
    const lines = linesFromPaste(paste.text, lib, paste.section);
    if (!lines.length) { showToast('No lines found. Copy the cells themselves from Excel.', 'error'); return; }
    touch();
    setItems((list) => [...list.filter((it) => String(it.description || '').trim()), ...lines.map((l) => withKey({ gst_pct: 18, dims: '', dismissed_flags: '', ...l }))]);
    setPaste(null);
    showToast(`${lines.length} line${lines.length === 1 ? '' : 's'} added`);
  }

  async function copyFrom(otherId) {
    try {
      const other = await api(`/api/quotations/${otherId}`);
      touch();
      setItems((list) => [...list.filter((it) => String(it.description || '').trim()), ...other.items.map(({ id: _, quotation_id: __, ...it }) => withKey(it))]);
      setCopyOpen(false);
      showToast(`Copied ${other.items.length} lines from ${other.quote_no || `#${other.id}`}`);
    } catch (e) { showToast(e.message, 'error'); }
  }

  const dismiss = (line, key) => setLine(line._k, { dismissed_flags: [...String(line.dismissed_flags || '').split(',').filter(Boolean), key].join(',') });

  async function act(action, extra = {}) {
    await save();
    try {
      const res = await api(`/api/quotations/${id}/action`, { method: 'POST', body: { action, ...extra } });
      setDialog(null);
      if (action === 'revise') { router.push(`/quotes/${res.id}`); return; }
      showToast({ send: 'Marked as sent; follow-up added to your tasks', accept: 'Accepted', decline: 'Marked declined' }[action]);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function raise(stage) {
    try {
      await api(`/api/quotations/${id}/invoice`, { method: 'POST', body: { stage_id: stage.id } });
      showToast(`Draft invoice created for "${stage.label}". Open it on the client page to send.`);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function remove() {
    if (!confirm('Delete this quotation?')) return;
    try { await api(`/api/quotations/${id}`, { method: 'DELETE' }); router.push('/quotes'); } catch (e) { showToast(e.message, 'error'); }
  }

  // ---- derived ----------------------------------------------------------------------------------
  const counted = items.filter((it) => String(it.description || '').trim());
  const totals = q ? quoteTotals(counted, q.place_of_supply) : null;
  const rooms = roomTotals(items);
  const flagsFor = (it) => (String(it.description || '').trim() ? checkLine(it, libById.get(Number(it.boq_item_id)) || matchItem(it.description, lib)) : []);
  const attention = counted.filter((it) => flagsFor(it).length).length;
  const stagePct = stages.reduce((s, st) => s + (Number(st.pct) || 0), 0);
  const invoiced = stages.reduce((s, st) => s + (st.invoice_id ? Number(st.invoice_total) || 0 : 0), 0);
  const paid = stages.reduce((s, st) => s + (st.invoice_status === 'paid' ? Number(st.invoice_total) || 0 : 0), 0);

  if (!q) return <div className="container py-10 text-muted-foreground">Loading…</div>;
  const shown = displayStatus(q, todayISO());
  const ref = `${q.quote_no || `#${q.id}`}${q.revision > 1 ? ` R${q.revision}` : ''}`;

  return (
    <div className="container flex flex-col gap-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/quotes" aria-label="All quotes"><ArrowLeftIcon /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="page-title flex flex-wrap items-center gap-2"><span className="figures">{ref}</span> <QuoteStatus status={shown} /></h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/clients/${q.client_id}`} className="hover:underline">{q.client.name}</Link>
            {q.title && ` · ${q.title}`}
            <span className="ml-2 text-xs">{editable ? { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Not saved, retrying on next change' }[saveState] : 'Read-only'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={`/api/quotations/${id}/pdf`} onClick={() => save()}><DownloadIcon data-icon="inline-start" />PDF</a></Button>
          {editable && <Button size="sm" variant="outline" onClick={() => setDialog('send')}><SendIcon data-icon="inline-start" />{q.status === 'sent' ? 'Sent again' : 'Mark as sent'}</Button>}
          {editable && <Button size="sm" onClick={() => setDialog('accept')}><CheckIcon data-icon="inline-start" />Accepted</Button>}
          {editable && <Button size="sm" variant="ghost" onClick={() => confirm('Mark this quotation as declined?') && act('decline')}><XIcon data-icon="inline-start" />Declined</Button>}
          {(q.status === 'sent' || q.status === 'declined' || q.status === 'draft') && <Button size="sm" variant="ghost" onClick={() => act('revise')}><GitBranchIcon data-icon="inline-start" />Revise</Button>}
          {q.status === 'draft' && <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}><Trash2Icon data-icon="inline-start" />Delete</Button>}
        </div>
      </div>

      {q.revisions.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Revisions:{' '}
          {q.revisions.map((r, i) => (
            <span key={r.id}>{i > 0 && ' · '}{r.id === q.id ? <b>R{r.revision}</b> : <Link className="hover:underline" href={`/quotes/${r.id}`}>R{r.revision} ({r.status})</Link>}</span>
          ))}
        </p>
      )}

      {/* Quote details */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1.5">
            <Label>Letterhead</Label>
            <Select value={q.company} onValueChange={(v) => setField({ company: v })} disabled={!editable}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="savistar">{BRAND.studioShort}</SelectItem>
                <SelectItem value="saag">{BRAND.workshopShort}</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Quote no.</Label><Input value={q.quote_no || ''} onChange={(e) => setField({ quote_no: e.target.value })} disabled={!editable} /></div>
          <div className="flex flex-col gap-1.5"><Label>Dated</Label><DateInput value={q.quoted_on || ''} onChange={(v) => setField({ quoted_on: v })} disabled={!editable} /></div>
          <div className="flex flex-col gap-1.5"><Label>Valid until</Label><DateInput value={q.valid_until || ''} onChange={(v) => setField({ valid_until: v })} disabled={!editable} /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Site is in</Label>
            <Select value={q.place_of_supply} onValueChange={(v) => setField({ place_of_supply: v })} disabled={!editable}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="same_state">Our state (CGST + SGST)</SelectItem>
                <SelectItem value="other_state">Another state (IGST)</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Project</Label>
            <Select value={q.project_id ? String(q.project_id) : 'none'} onValueChange={(v) => setField({ project_id: v === 'none' ? null : Number(v) })} disabled={!editable}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="none">No project yet</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-3 lg:col-span-6"><Label>For</Label><Input value={q.title || ''} placeholder="e.g. 3 BHK interiors, Mehta bungalow" onChange={(e) => setField({ title: e.target.value })} disabled={!editable} /></div>
        </CardContent>
      </Card>

      {/* Lines, room by room */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Lines</h2>
        {attention > 0 && <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400"><TriangleAlertIcon />{attention} line{attention === 1 ? '' : 's'} need attention</Badge>}
        {editable && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPaste({ section: '', text: '' })}><ClipboardPasteIcon data-icon="inline-start" />Paste from Excel</Button>
            <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)}><LayersIcon data-icon="inline-start" />Copy rooms from a past quote</Button>
            <Button size="sm" onClick={addRoom}><PlusIcon data-icon="inline-start" />Add room</Button>
          </div>
        )}
      </div>

      {rooms.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No lines yet. Add a room, paste a BOQ from Excel, or copy rooms from a past quote.
        </div>
      )}

      {rooms.map((room) => (
        <Card key={room.name}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
            {editable
              ? <Input className="h-8 max-w-64 font-semibold" defaultValue={room.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== room.name && renameRoom(room.name, e.target.value.trim())} aria-label="Room name" />
              : <CardTitle>{room.name}</CardTitle>}
            <span className="figures ml-auto text-sm font-medium">{rupees(room.subtotal)}</span>
            {editable && (
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" title="Paste lines into this room" onClick={() => setPaste({ section: room.name, text: '' })}><ClipboardPasteIcon /></Button>
                <Button size="icon-sm" variant="ghost" title="Duplicate room" onClick={() => duplicateRoom(room.name)}><CopyIcon /></Button>
                <Button size="icon-sm" variant="ghost" title="Remove room" onClick={() => removeRoom(room.name)}><Trash2Icon /></Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 pb-2" />
                  <th className="pb-2">Description</th>
                  <th className="w-36 pb-2">Dimensions</th>
                  <th className="w-28 pb-2">Unit</th>
                  <th className="w-20 pb-2">Qty</th>
                  <th className="w-28 pb-2">Rate</th>
                  <th className="w-16 pb-2">GST %</th>
                  <th className="w-28 pb-2 text-right">Amount</th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody>
                {room.items.map((it) => {
                  const flags = flagsFor(it);
                  const libRow = libById.get(Number(it.boq_item_id));
                  const memory = it.boq_item_id ? rates[it.boq_item_id] : null;
                  return (
                    <tr key={it._k} className="border-t align-top">
                      <td className="py-2 pr-1">
                        <Button size="icon-sm" variant="ghost" title={libRow ? `From library: ${libRow.name}` : 'Pick from the BOQ library'} onClick={() => editable && setPicker({ key: it._k })} disabled={!editable}>
                          <BookOpenIcon className={libRow ? 'text-primary' : 'text-muted-foreground'} />
                        </Button>
                      </td>
                      <td className="py-2 pr-2">
                        <Textarea data-desc={it._k} rows={2} className="min-h-0 resize-y text-sm" value={it.description} disabled={!editable}
                          placeholder="What, made of what, how big, what finish" onChange={(e) => setLine(it._k, { description: e.target.value })} />
                        {libRow && <p className="mt-1 text-xs text-muted-foreground">{libRow.name}{libRow.measure ? ` · ${libRow.measure}` : ''}</p>}
                        {flags.length > 0 && (
                          <div className="mt-1 text-xs">
                            <button type="button" className="inline-flex items-center gap-1 text-amber-700 hover:underline dark:text-amber-400" onClick={() => setOpenFlags((m) => ({ ...m, [it._k]: !m[it._k] }))}>
                              <TriangleAlertIcon className="size-3" />{flags.length} to check
                            </button>
                            {openFlags[it._k] && (
                              <ul className="mt-1 flex flex-col gap-1">
                                {flags.map((f) => (
                                  <li key={f.key} className="flex items-start gap-2 text-muted-foreground">
                                    <span className="flex-1">{f.text}</span>
                                    {editable && <button type="button" className="shrink-0 hover:underline" onClick={() => dismiss(it, f.key)}>Dismiss</button>}
                                  </li>
                                ))}
                                {libRow?.description && editable && it.description !== libRow.description && (
                                  <li><button type="button" className="text-primary hover:underline" onClick={() => setLine(it._k, { description: libRow.description })}>Use the library line (fill its [brackets])</button></li>
                                )}
                              </ul>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Input value={it.dims || ''} placeholder={it.unit === 'rft' || it.unit === 'rm' ? `12', 8'6"` : it.unit === 'nos' ? '2 + 1' : `7'6" x 8'`} disabled={!editable}
                          onChange={(e) => setDims(it, e.target.value)} title="Height × width for area, lengths for running ft. ft-in, mm or m." />
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={it.unit || ''} onValueChange={(v) => setUnit(it, v)} disabled={!editable}>
                          <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                          <SelectContent><SelectGroup>{UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>)}</SelectGroup></SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-2"><Input type="number" inputMode="decimal" value={it.qty} disabled={!editable} onChange={(e) => setLine(it._k, { qty: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <Input type="number" inputMode="decimal" value={it.rate} disabled={!editable} onChange={(e) => setLine(it._k, { rate: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && editable) { e.preventDefault(); addLine(it.section || '', it._k); } }} />
                        {memory?.length > 0 && (
                          <p className="mt-1 text-[11px] leading-tight text-muted-foreground" title={memory.map((m) => `₹${m.rate} · ${m.client_name} · ${formatDate(m.quoted_on)} · ${m.status}`).join('\n')}>
                            Last ₹{Number(memory[0].rate).toLocaleString('en-IN')} · {memory[0].client_name}{memory[0].status === 'accepted' ? ' ✓' : ''}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-2"><Input type="number" value={it.gst_pct} disabled={!editable} onChange={(e) => setLine(it._k, { gst_pct: e.target.value })} /></td>
                      <td className="figures py-2 pr-2 pt-4 text-right">{rupees(lineAmount(it))}</td>
                      <td className="py-2">{editable && <Button size="icon-sm" variant="ghost" title="Remove line" onClick={() => removeLine(it._k)}><XIcon /></Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editable && <Button size="sm" variant="ghost" className="mt-2" onClick={() => addLine(room.name === 'General' ? '' : room.name)}><PlusIcon data-icon="inline-start" />Add line</Button>}
          </CardContent>
        </Card>
      ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Payment stages */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Payment stages</CardTitle>
            {stages.some((s) => s.invoice_id) && <span className="text-xs text-muted-foreground">{rupees(invoiced)} of {rupees(totals.total)} invoiced · {rupees(paid)} paid</span>}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {stages.map((st, i) => (
              <div key={st.id ?? `n${i}`} className="flex flex-wrap items-center gap-2">
                <Input className="min-w-48 flex-1" value={st.label} disabled={!editable || !!st.invoice_id} onChange={(e) => { touch(); setStages((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))); }} />
                <Input className="w-20" type="number" value={st.pct} disabled={!editable || !!st.invoice_id} onChange={(e) => { touch(); setStages((l) => l.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x))); }} aria-label="Percent" />
                <span className="figures w-32 text-right text-sm">{rupees(Math.round(totals.total * (Number(st.pct) || 0)) / 100)}</span>
                {st.invoice_id
                  ? <Link href={`/clients/${q.client_id}`} className="text-xs text-primary hover:underline"><ReceiptTextIcon className="mr-1 inline size-3" />{st.invoice_no || 'Invoice'} · {st.invoice_status}</Link>
                  : q.status === 'accepted'
                    ? <Button size="sm" variant="outline" onClick={() => raise(st)}><FilePlusIcon data-icon="inline-start" />Raise invoice</Button>
                    : editable && <Button size="icon-sm" variant="ghost" onClick={() => { touch(); setStages((l) => l.filter((_, j) => j !== i)); }} aria-label="Remove stage"><XIcon /></Button>}
              </div>
            ))}
            {editable && <Button size="sm" variant="ghost" className="self-start" onClick={() => { touch(); setStages((l) => [...l, { label: '', pct: 0 }]); }}><PlusIcon data-icon="inline-start" />Add stage</Button>}
            {stagePct !== 100 && <p className="text-xs text-amber-700 dark:text-amber-400">Stages add up to {stagePct}%, not 100%.</p>}
            {q.status !== 'accepted' && <p className="text-xs text-muted-foreground">Once the quote is accepted, each stage can be raised as a draft invoice.</p>}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader><CardTitle>Total</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="figures">{rupees(totals.subtotal)}</span></div>
            {totals.taxes.map((t) => <div key={t.label} className="flex justify-between"><span className="text-muted-foreground">{t.label}</span><span className="figures">{rupees(t.amount)}</span></div>)}
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="figures">{rupees(totals.total)}</span></div>
            {totals.total > 0 && <p className="text-xs text-muted-foreground">{amountInWords(totals.total)}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Terms</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea rows={6} value={q.terms || ''} disabled={!editable} onChange={(e) => setField({ terms: e.target.value })} />
          <div className="flex flex-col gap-1.5"><Label>Internal notes (not on the PDF)</Label><Textarea rows={2} value={q.notes || ''} disabled={!editable} onChange={(e) => setField({ notes: e.target.value })} /></div>
        </CardContent>
      </Card>

      {/* Item picker */}
      <ItemPicker open={!!picker} lib={lib} onClose={() => setPicker(null)} onPick={(row) => pick(items.find((it) => it._k === picker.key), row)} />

      {/* Paste */}
      <Dialog open={!!paste} onOpenChange={(o) => !o && setPaste(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Paste from Excel{paste?.section ? ` into ${paste.section}` : ''}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Select the cells in Excel (with a header row: Description, Unit, Qty, Rate), copy, and paste below. A row with only a name, like KITCHEN, starts a new room.</p>
          <Textarea rows={10} className="font-mono text-xs" value={paste?.text || ''} onChange={(e) => setPaste((p) => ({ ...p, text: e.target.value }))} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaste(null)}>Cancel</Button>
            <Button onClick={applyPaste} disabled={!paste?.text.trim()}>Add lines</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy rooms */}
      <CopyRoomsDialog open={copyOpen} onClose={() => setCopyOpen(false)} currentId={Number(id)} onCopy={copyFrom} />

      {/* Send */}
      <SendDialog open={dialog === 'send'} attention={attention} onClose={() => setDialog(null)} onSend={(days) => act('send', { follow_up_days: days })} />

      {/* Accept */}
      <AcceptDialog open={dialog === 'accept'} hasProject={!!q.project_id} onClose={() => setDialog(null)} onAccept={(createProject) => act('accept', { create_project: createProject })} />
    </div>
  );
}

function ItemPicker({ open, lib, onClose, onPick }) {
  const [s, setS] = useState('');
  const [trade, setTrade] = useState('');
  useEffect(() => { if (open) { setS(''); setTrade(''); } }, [open]);
  const trades = [...new Set(lib.filter((r) => !r.hidden).map((r) => r.trade))];
  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = lib.filter((r) => !r.hidden && (!trade || r.trade === trade) && words.every((w) => `${r.name} ${r.match} ${r.trade}`.toLowerCase().includes(w)));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader><DialogTitle>Pick from the BOQ library</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Search: wardrobe, false ceiling, skirting…" value={s} onChange={(e) => setS(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          <Button size="xs" variant={!trade ? 'default' : 'outline'} onClick={() => setTrade('')}>All</Button>
          {trades.map((t) => <Button key={t} size="xs" variant={trade === t ? 'default' : 'outline'} onClick={() => setTrade(t)}>{t}</Button>)}
        </div>
        <div className="-mx-2 flex-1 overflow-y-auto">
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => onPick(r)} className="flex w-full flex-col items-start rounded-md px-2 py-2 text-left hover:bg-muted">
              <span className="text-sm font-medium">{r.name} <span className="font-normal text-muted-foreground">· {UNIT_LABEL[r.unit] || r.unit}{r.source === 'own' ? ' · yours' : ''}{r.used ? ` · used ${r.used}×` : ''}</span></span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{r.trade}{r.measure ? ` · ${r.measure}` : ''}</span>
            </button>
          ))}
          {rows.length === 0 && <p className="px-2 py-6 text-sm text-muted-foreground">Nothing matches. Add it to the library from Quotes → BOQ library.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyRoomsDialog({ open, onClose, currentId, onCopy }) {
  const [list, setList] = useState([]);
  const [s, setS] = useState('');
  useEffect(() => { if (open) api('/api/quotations').then((r) => setList(r.filter((x) => x.id !== currentId && x.status !== 'superseded'))).catch(() => {}); }, [open, currentId]);
  const shown = list.filter((x) => !s.trim() || [x.client_name, x.quote_no, x.title].some((v) => (v || '').toLowerCase().includes(s.toLowerCase())));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogHeader><DialogTitle>Copy rooms from a past quote</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">All its lines are added here, room by room, with their rates. Edit or remove what doesn&apos;t fit.</p>
        <Input placeholder="Client, number…" value={s} onChange={(e) => setS(e.target.value)} />
        <div className="-mx-2 flex-1 overflow-y-auto">
          {shown.map((x) => (
            <button key={x.id} type="button" onClick={() => onCopy(x.id)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
              <span><span className="figures font-medium">{x.quote_no || `#${x.id}`}</span> · {x.client_name}{x.title ? ` · ${x.title}` : ''}</span>
              <span className="figures text-muted-foreground">₹{Math.round(x.subtotal).toLocaleString('en-IN')}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="px-2 py-6 text-sm text-muted-foreground">No other quotes yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendDialog({ open, attention, onClose, onSend }) {
  const [days, setDays] = useState(3);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark as sent</DialogTitle></DialogHeader>
        {attention > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{attention} line{attention === 1 ? '' : 's'} still need attention. You can send anyway.</p>}
        <p className="text-sm text-muted-foreground">Download the PDF and send it to the client the way you usually do. A follow-up task is added for you.</p>
        <div className="flex items-center gap-2 text-sm">
          Follow up in <Input type="number" className="w-20" value={days} onChange={(e) => setDays(e.target.value)} /> days (0 for none)
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSend(Number(days) || 0)}><SendIcon data-icon="inline-start" />Mark as sent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptDialog({ open, hasProject, onClose, onAccept }) {
  const [createProject, setCreateProject] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Client accepted</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">The quotation is locked as accepted. Its payment stages can then be raised as invoices.</p>
        {!hasProject && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={createProject} onCheckedChange={(v) => setCreateProject(!!v)} /> Open a project for it
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onAccept(!hasProject && createProject)}><CheckIcon data-icon="inline-start" />Accepted</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
