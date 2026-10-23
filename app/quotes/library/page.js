'use client';

// The studio's BOQ library: it started as Ahrom Labs' central library and is theirs to reword, hide and
// add to. Edited items are never overwritten when the central library improves; if it has, the item
// says so and the central text can be taken back. Owners, admins and managers edit; staff read.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, showToast } from '@/lib/client';
import { PageTitle } from '@/components/page-title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { UNITS, UNIT_LABEL, SPEC } from '@/lib/boq-check';
import { ArrowLeftIcon, DownloadIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from 'lucide-react';

const EMPTY = { trade: '', name: '', unit: 'nos', units: '', basis_required: false, measure: '', spec_keys: '', omits: '', description: '', match: '' };
const APPROVERS = ['owner', 'admin', 'manager'];

export default function BoqLibraryPage() {
  const [rows, setRows] = useState(null);
  const [me, setMe] = useState(null);
  const [s, setS] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [edit, setEdit] = useState(null); // { id?, ...fields }
  const [preview, setPreview] = useState(null);
  const canEdit = APPROVERS.includes(me?.role);

  const load = () => api('/api/boq-items').then(setRows).catch((e) => showToast(e.message, 'error'));
  useEffect(() => { load(); api('/api/me').then(setMe).catch(() => {}); }, []);

  async function save() {
    try {
      const body = { ...edit, match: edit.match || edit.name };
      if (edit.id) await api(`/api/boq-items/${edit.id}`, { method: 'PUT', body });
      else await api('/api/boq-items', { method: 'POST', body });
      showToast(edit.id ? 'Item updated' : 'Item added');
      setEdit(null);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function action(r, a) {
    try { await api(`/api/boq-items/${r.id}`, { method: 'PUT', body: { action: a } }); setPreview(null); load(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function remove(r) {
    if (!confirm(`Remove ${r.name} from your library? Past quotes keep their lines.`)) return;
    try { await api(`/api/boq-items/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { showToast(e.message, 'error'); }
  }

  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (rows || []).filter((r) => (showHidden || !r.hidden) && words.every((w) => `${r.name} ${r.trade} ${r.match}`.toLowerCase().includes(w)));
  const trades = [...new Set(shown.map((r) => r.trade || 'Other'))];
  const own = (rows || []).filter((r) => r.source === 'own').length;

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/quotes" aria-label="Quotes"><ArrowLeftIcon /></Link></Button>
        <PageTitle>BOQ library</PageTitle>
        <div className="ml-auto flex gap-2">
          {canEdit && own > 0 && <Button asChild variant="outline" size="sm"><a href="/api/boq-items/export"><DownloadIcon data-icon="inline-start" />Export your items</a></Button>}
          {canEdit && <Button size="sm" onClick={() => setEdit({ ...EMPTY })}><PlusIcon data-icon="inline-start" />Add item</Button>}
        </div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        The lines your quotes are built from: the unit each is priced in, how it&apos;s measured, what a line must name, and a line to start from.
        It began as Ahrom Labs&apos; library; reword anything to match how you write, hide what you never use, and add your own. Your changes are
        never overwritten.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search items…" value={s} onChange={(e) => setS(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={showHidden} onCheckedChange={(v) => setShowHidden(!!v)} />Show hidden</label>
      </div>

      {trades.map((t) => (
        <section key={t} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t}</h2>
          <div className="flex flex-col divide-y rounded-xl border">
            {shown.filter((r) => (r.trade || 'Other') === t).map((r) => (
              <div key={r.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${r.hidden ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {r.name} <span className="font-normal text-muted-foreground">· {UNIT_LABEL[r.unit] || r.unit}</span>
                    {r.source === 'own' && <Badge variant="outline" className="ml-2">Yours</Badge>}
                    {r.source === 'library' && !!r.edited && <Badge variant="outline" className="ml-2">Reworded</Badge>}
                    {r.central_newer && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-700 dark:text-amber-400">Library has a newer version</Badge>}
                    {r.used > 0 && <span className="ml-2 text-xs text-muted-foreground">used in {r.used} line{r.used === 1 ? '' : 's'}</span>}
                  </p>
                  {r.measure && <p className="text-xs text-muted-foreground">{r.measure}</p>}
                  {r.description && <p className="mt-1 font-mono text-xs text-muted-foreground">{r.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    {r.central_newer && <Button size="icon-sm" variant="ghost" title="Compare with the library version" onClick={() => setPreview(r)}><RotateCcwIcon /></Button>}
                    <Button size="icon-sm" variant="ghost" title="Edit" onClick={() => setEdit({ ...r, basis_required: !!r.basis_required })}><PencilIcon /></Button>
                    <Button size="icon-sm" variant="ghost" title={r.hidden ? 'Show in the picker' : 'Hide from the picker'} onClick={() => action(r, r.hidden ? 'show' : 'hide')}>{r.hidden ? <EyeIcon /> : <EyeOffIcon />}</Button>
                    {r.source === 'own' && <Button size="icon-sm" variant="ghost" title="Remove" onClick={() => remove(r)}><Trash2Icon /></Button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Edit or add */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? `Edit ${edit.name}` : 'Add your own item'}</DialogTitle></DialogHeader>
          {edit && (
            <div className="flex flex-col gap-3">
              {edit.source === 'library' && <p className="text-xs text-muted-foreground">Saving marks it as yours: updates to the central library won&apos;t overwrite it.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Pooja unit" /></div>
                <div className="flex flex-col gap-1.5"><Label>Trade</Label><Input value={edit.trade || ''} onChange={(e) => setEdit({ ...edit, trade: e.target.value })} placeholder="e.g. Carpentry and joinery" list="trades" /></div>
                <div className="flex flex-col gap-1.5">
                  <Label>Priced in</Label>
                  <Select value={edit.unit} onValueChange={(v) => setEdit({ ...edit, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5"><Label>Also quoted in</Label><Input value={edit.units || ''} onChange={(e) => setEdit({ ...edit, units: e.target.value })} placeholder="e.g. rft,nos" /></div>
              </div>
              <datalist id="trades">{[...new Set((rows || []).map((r) => r.trade))].map((t) => <option key={t} value={t} />)}</datalist>
              <div className="flex flex-col gap-1.5"><Label>How it&apos;s measured</Label><Input value={edit.measure || ''} onChange={(e) => setEdit({ ...edit, measure: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!edit.basis_required} onCheckedChange={(v) => setEdit({ ...edit, basis_required: !!v })} />Each line must say how it was measured</label>
              <div className="flex flex-col gap-1.5">
                <Label>A line must name</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SPEC).map(([k, v]) => {
                    const on = String(edit.spec_keys || '').split(',').includes(k);
                    return (
                      <label key={k} className="flex items-center gap-1.5 text-xs">
                        <Checkbox checked={on} onCheckedChange={(c) => {
                          const set = new Set(String(edit.spec_keys || '').split(',').filter(Boolean));
                          if (c) set.add(k); else set.delete(k);
                          setEdit({ ...edit, spec_keys: [...set].join(',') });
                        }} />{v.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-1.5"><Label>Line to start from</Label><Textarea rows={3} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Providing and making … in [18] mm … ; measured by …" /></div>
              <div className="flex flex-col gap-1.5"><Label>Often left out of quotes</Label><Input value={edit.omits || ''} onChange={(e) => setEdit({ ...edit, omits: e.target.value })} placeholder="Separate with ;" /></div>
              <div className="flex flex-col gap-1.5"><Label>Words that find it in a pasted BOQ</Label><Input value={edit.match || ''} onChange={(e) => setEdit({ ...edit, match: e.target.value })} placeholder="e.g. pooja, mandir, temple unit" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={save} disabled={!edit?.name?.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Your wording vs the newer central wording */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{preview?.name}: library has a newer version</DialogTitle></DialogHeader>
          {preview && (
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><p className="mb-1 font-medium">Yours</p><p className="font-mono text-xs text-muted-foreground">{preview.description}</p><p className="mt-1 text-xs text-muted-foreground">{preview.measure}</p></div>
              <div><p className="mb-1 font-medium">Library</p><p className="font-mono text-xs text-muted-foreground">{preview.central.description}</p><p className="mt-1 text-xs text-muted-foreground">{preview.central.measure}</p></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Keep mine</Button>
            <Button onClick={() => action(preview, 'reset')}>Use the library version</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
