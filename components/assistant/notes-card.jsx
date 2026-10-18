'use client';

import { useEffect, useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { NotebookPenIcon } from 'lucide-react';
import { api, showToast } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StickyNote } from '@/components/sticky-note';

// Settings → My assistant: the private notes this person asked the assistant to keep, with delete.
export function NotesCard({ aiName = 'the assistant' }) {
  const [notes, setNotes] = useState(null);
  const load = () => api('/api/assistant/notes').then(setNotes).catch(() => setNotes([]));
  useEffect(() => { load(); }, []);

  async function remove(id) {
    try { await api(`/api/assistant/notes?id=${id}`, { method: 'DELETE' }); load(); } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><NotebookPenIcon aria-hidden strokeWidth={1.6} className="size-6 -rotate-3 text-primary/80" /> Your notes</CardTitle>
        <CardDescription>Things you asked {aiName} to note (“note that …”). Only you can see them; ask “what did I note about …?” to find one.</CardDescription>
      </CardHeader>
      <CardContent>
        {notes === null ? <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
          : notes.length === 0 ? <StickyNote>No notes yet. Try “note that Mrs Mehta prefers WhatsApp”.</StickyNote>
          : (
            <ul className="divide-y rounded-lg border text-sm">
              {notes.map((n) => (
                <li key={n.id} className="group flex items-start gap-3 px-3 py-2">
                  <span className="figures w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">{formatDate(String(n.created_at).slice(0, 10))}</span>
                  <span className="min-w-0 flex-1">{n.body}{n.client && <span className="ml-2 text-xs text-muted-foreground">· {n.client}</span>}</span>
                  <button type="button" onClick={() => remove(n.id)} aria-label="Delete note" className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <TrashIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}
