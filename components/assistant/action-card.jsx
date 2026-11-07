'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRightIcon, Trash2Icon, WandSparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';

// A task the assistant prepared (lib/assistantActions.js): every field shown and editable, nothing saved until Save.
// Save sends the fields to /api/assistant/act, which checks them again and runs the app's own route as this person.
export function ActionCard({ draft, onNavigate }) {
  const [values, setValues] = useState(draft.values);
  const [display, setDisplay] = useState(Object.fromEntries(draft.fields.filter((f) => f.type === 'ref').map((f) => [f.name, f.display || ''])));
  const [state, setState] = useState('draft'); // draft | saving | saved | cancelled
  const [error, setError] = useState(draft.errors?.join('. ') || null);
  const [done, setDone] = useState(null);
  const set = (name, v) => setValues((x) => ({ ...x, [name]: v }));
  const del = draft.risk === 'delete';
  const missing = draft.fields.filter((f) => f.required && (values[f.name] == null || values[f.name] === ''));

  async function save() {
    setState('saving'); setError(null);
    try {
      const res = await fetch('/api/assistant/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: draft.action, fields: values }) });
      const out = await res.json().catch(() => ({}));
      if (!out.ok) throw new Error(out.error || 'Could not save');
      setDone(out); setState('saved');
    } catch (e) { setError(e.message); setState('draft'); }
  }

  if (state === 'saved') {
    return (
      <p className="flex flex-wrap items-center gap-x-2 border-l-2 border-[color-mix(in_oklab,var(--success)_55%,transparent)] py-0.5 pl-3 text-[13.5px]">
        Done: {done.summary}.
        {done.link && <Link href={done.link} onClick={onNavigate} className="inline-flex items-center gap-0.5 font-hand text-[13px] text-primary">Open <ArrowUpRightIcon className="size-3" /></Link>}
      </p>
    );
  }
  if (state === 'cancelled') return <p className="text-[13px] text-muted-foreground">Not saved.</p>;

  return (
    <div className={cn('-rotate-[0.4deg] rounded-sm bg-[#fbf0b2] p-3.5 text-stone-700 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)] dark:bg-[#4d4726] dark:text-stone-100', del && 'ring-2 ring-destructive/60')}>
      <p className={cn('mb-2.5 flex items-center gap-1.5 font-hand text-[15px]', del && 'text-destructive')}>{del ? <Trash2Icon className="size-4" /> : <WandSparklesIcon className="size-4" />} {draft.summary}</p>
      {del && <p className="mb-2 text-[12px] text-destructive">This deletes it. Check it is the right one.</p>}
      <div className="flex flex-col gap-2">
        {draft.fields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-[12px]">
            <span className={cn('opacity-75', f.required && (values[f.name] == null || values[f.name] === '') && 'font-medium text-destructive opacity-100')}>{f.label}{f.required ? '' : ' (optional)'}</span>
            <Field f={f} value={values[f.name]} display={display[f.name]} onChange={(v, d) => { set(f.name, v); if (d !== undefined) setDisplay((x) => ({ ...x, [f.name]: d })); }} />
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={() => setState('cancelled')} className="rounded-md px-3 py-1.5 text-[13px] opacity-70 hover:opacity-100">Cancel</button>
        <button type="button" onClick={save} disabled={state === 'saving' || missing.length > 0}
          className={cn('rounded-md px-3 py-1.5 text-[13px] transition-opacity hover:opacity-90 disabled:opacity-50', del ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground')}>
          {state === 'saving' ? 'Saving…' : missing.length ? `Add ${missing[0].label.toLowerCase()}` : del ? 'Delete' : 'Save'}
        </button>
      </div>
    </div>
  );
}

const box = 'h-9 bg-background/70 text-base md:text-sm';

function Field({ f, value, display, onChange }) {
  if (f.type === 'longtext') return <Textarea value={value ?? ''} rows={2} maxLength={1000} onChange={(e) => onChange(e.target.value)} className="bg-background/70 text-base md:text-sm" />;
  if (f.type === 'date') return <DateInput value={value || ''} onChange={(v) => onChange(v)} className={cn(box, 'w-44')} />;
  if (f.type === 'enum') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {f.options.map((o) => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={cn('rounded-full border px-3 py-1 text-[12.5px] transition-colors', value === o.value ? 'border-primary bg-primary text-primary-foreground' : 'border-current/25 bg-background/50 hover:bg-background/80')}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (f.type === 'ref') {
    // Picked: its name, with a way to change it. Not sure: the closest matches. Nothing found: type a name (the server finds it).
    if (value != null && typeof value === 'number') {
      return (
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-current/25 bg-background/50 px-3 py-1 text-[12.5px]">{display || `#${value}`}</span>
          <button type="button" onClick={() => onChange(null, '')} className="text-[12px] underline underline-offset-2 opacity-70">change</button>
        </span>
      );
    }
    return (
      <span className="flex flex-col gap-1.5">
        {f.options?.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {f.options.map((o) => (
              <button key={o.value} type="button" onClick={() => onChange(o.value, o.label)} className="rounded-full border border-current/25 bg-background/50 px-3 py-1 text-[12.5px] hover:bg-background/80">{o.label}</button>
            ))}
          </span>
        )}
        <Input value={value ?? ''} placeholder={`Type the ${f.ref}'s name`} onChange={(e) => onChange(e.target.value || null)} className={box} />
      </span>
    );
  }
  const numeric = f.type === 'money' || f.type === 'number';
  return <Input value={value ?? ''} inputMode={numeric ? 'decimal' : f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : undefined}
    onChange={(e) => onChange(numeric ? (e.target.value === '' ? null : e.target.value) : e.target.value)} className={box} />;
}
