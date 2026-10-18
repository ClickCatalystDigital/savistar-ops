'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRightIcon, BellIcon, NotebookPenIcon } from 'lucide-react';
import { api } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';

// A reminder or note the assistant drafted. Nothing is saved until the person presses Save: a reminder becomes their
// own task through the normal Tasks API (Home and the calendar show it), a note goes to their private notes.
export function DraftCard({ draft, user, onNavigate }) {
  const task = draft.kind === 'task';
  const [title, setTitle] = useState(task ? draft.title : draft.body);
  const [due, setDue] = useState(draft.due || '');
  const [state, setState] = useState('draft'); // draft | saving | saved | cancelled
  const [error, setError] = useState(null);

  async function save() {
    setState('saving'); setError(null);
    try {
      if (task) await api('/api/tasks', { method: 'POST', body: { title: title.trim(), due_date: due, assigned_to: user, client_id: draft.client?.id ?? null } });
      else await api('/api/assistant/notes', { method: 'POST', body: { body: title.trim(), client_id: draft.client?.id ?? null } });
      setState('saved');
    } catch (e) { setError(e.message); setState('draft'); }
  }

  if (state === 'saved') {
    return (
      <p className="flex flex-wrap items-center gap-x-2 border-l-2 border-[color-mix(in_oklab,var(--success)_55%,transparent)] py-0.5 pl-3 text-[13.5px]">
        {task ? <>Added to your tasks for <span className="figures">{formatDate(due)}</span>.</> : 'Noted. Only you can see it.'}
        <Link href={task ? '/' : '/settings'} onClick={onNavigate} className="inline-flex items-center gap-0.5 font-hand text-[13px] text-primary">
          {task ? 'Open Home' : 'Your notes'} <ArrowUpRightIcon className="size-3" />
        </Link>
      </p>
    );
  }
  if (state === 'cancelled') return <p className="text-[13px] text-muted-foreground">Not saved.</p>;

  const Icon = task ? BellIcon : NotebookPenIcon;
  return (
    <div className="-rotate-[0.4deg] rounded-sm bg-[#fbf0b2] p-3.5 text-stone-700 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)] dark:bg-[#4d4726] dark:text-stone-100">
      <p className="mb-2 flex items-center gap-1.5 font-hand text-[15px]"><Icon className="size-4" /> {task ? 'New reminder' : 'New note'}</p>
      {task
        ? <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Reminder" className="bg-background/70" />
        : <Textarea value={title} maxLength={1000} rows={2} onChange={(e) => setTitle(e.target.value)} aria-label="Note" className="bg-background/70" />}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {task && <DateInput value={due} onChange={setDue} className="h-8 w-40 bg-background/70" />}
        {draft.client && <span className="rounded-full border border-current/25 px-2 py-0.5">Client: {draft.client.label}</span>}
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={() => setState('cancelled')} className="rounded-md px-3 py-1.5 text-[13px] opacity-70 hover:opacity-100">Cancel</button>
        <button type="button" onClick={save} disabled={state === 'saving' || !title.trim() || (task && !due)}
          className="rounded-md bg-primary px-3 py-1.5 text-[13px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {state === 'saving' ? 'Saving…' : task && !due ? 'Pick a date' : 'Save'}
        </button>
      </div>
    </div>
  );
}
