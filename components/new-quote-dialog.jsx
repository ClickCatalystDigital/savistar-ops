'use client';

// "New quote": pick a client, or type a new name and the client is created with the quote, so nobody
// leaves to set up a prospect first. Opens the editor on the new draft.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, showToast } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { BRAND } from '@/lib/brand';

export function NewQuoteDialog({ open, onOpenChange, client = null }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState([]);
  const [picked, setPicked] = useState(client);
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('savistar');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setPicked(client); setQ(''); setTitle(''); setPhone(''); } }, [open, client]);
  useEffect(() => {
    if (picked || !q.trim()) { setMatches([]); return; }
    const t = setTimeout(async () => setMatches((await api(`/api/clients?q=${encodeURIComponent(q.trim())}`)).slice(0, 6)), 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  const exact = matches.find((m) => m.name.toLowerCase() === q.trim().toLowerCase());

  async function create() {
    setBusy(true);
    try {
      // A typed name that matches a client exactly is that client, not a duplicate.
      const known = picked || exact;
      const body = known ? { client_id: known.id } : { new_client_name: q.trim(), new_client_phone: phone };
      const { id } = await api('/api/quotations', { method: 'POST', body: { ...body, company, title } });
      onOpenChange(false);
      router.push(`/quotes/${id}`);
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New quotation</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nq-client">Client</Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{picked.name}</span>
                {!client && <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setQ(''); }}>Change</Button>}
              </div>
            ) : (
              <>
                <Input id="nq-client" autoFocus placeholder="Type a name: an existing client, or a new prospect" value={q} onChange={(e) => setQ(e.target.value)} />
                {matches.length > 0 && (
                  <div className="flex flex-col rounded-md border">
                    {matches.map((m) => (
                      <button key={m.id} type="button" className="px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setPicked(m)}>
                        {m.name}<span className="text-muted-foreground">{m.phone ? ` · ${m.phone}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                {q.trim() && !exact && (
                  <div className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                    <span>A new client <b>{q.trim()}</b> will be created with this quote.</span>
                    <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Letterhead</Label>
              <Select value={company} onValueChange={setCompany}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="savistar">{BRAND.studioShort}</SelectItem>
                  <SelectItem value="saag">{BRAND.workshopShort}</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nq-title">For</Label>
              <Input id="nq-title" placeholder="e.g. 3 BHK interiors" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy || (!picked && !q.trim())}>{busy ? 'Creating…' : 'Create and open'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
