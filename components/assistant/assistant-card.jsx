'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, SearchIcon } from 'lucide-react';
import { Butterfly } from './butterfly';
import { api, showToast } from '@/lib/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const price = (v) => (v === null ? 'varies' : v === 0 ? 'free' : `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`);
const LOW_CREDIT = 0.05;

// The to-do list for improving the assistant: questions it could not answer, or that were thumbed down, in the last 30 days.
function MissedQuestions() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  function toggle() {
    setOpen((o) => !o);
    if (rows === null) api('/api/assistant/misses').then(setRows).catch(() => setRows([]));
  }
  return (
    <div className="flex flex-col gap-2 border-t border-dashed pt-4">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="font-hand text-base">Questions it couldn’t answer</span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </button>
      {open && (rows === null ? <div className="h-16 animate-pulse rounded-lg bg-muted/50" /> : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None in the last 30 days.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <li key={`${r.question}-${r.why}`} className="flex items-start gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">{r.question}</span>
              <span className="shrink-0 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">{r.why}</span>
              <span className="figures w-10 shrink-0 text-right text-xs text-muted-foreground">{r.times}×</span>
            </li>
          ))}
        </ul>
      ))}
      <p className="text-xs text-muted-foreground">Questions people asked that it got wrong or couldn't look up: use them to decide which look-ups to add next.</p>
    </div>
  );
}

// Searchable model list (there are hundreds of models, so a plain select is unusable).
function ModelPicker({ models, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const picked = models?.find((m) => m.id === value);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (models ?? []).filter((m) => !t || m.name.toLowerCase().includes(t) || m.id.toLowerCase().includes(t)).slice(0, 60);
  }, [models, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{picked ? picked.name : value}</span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(30rem,90vw)] p-0">
        <div className="relative border-b p-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="border-0 pl-8 shadow-none focus-visible:ring-0" placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {models === null ? <p className="p-3 text-sm text-muted-foreground">Loading models…</p>
            : shown.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No model matches “{q}”.</p>
            : shown.map((m) => (
              <button key={m.id} type="button" onClick={() => { onChange(m.id); setOpen(false); }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                <CheckIcon className={cn('mt-0.5 size-4 shrink-0', m.id === value ? 'text-primary' : 'opacity-0')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.id} · in {price(m.in)} / out {price(m.out)} per million</span>
                </span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const MODES = [
  { value: 'show', title: 'Show the data', body: 'Jev picks the right look-up and the answer is a table, exactly as stored. Nothing is reworded. Cheapest.' },
  { value: 'write', title: 'Show, then write', body: 'Same look-up, then the writing model adds a short summary of the rows above the table.' },
];

// Settings → AI (owners and admins): OpenRouter key, live credit, writing model, answer mode, daily limit,
// data-questions switch. The decision model (Jev) is fixed on purpose. Port of reel-inventory's AssistantCard.
export function AssistantCard() {
  const router = useRouter();
  const [s, setS] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [models, setModels] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [mode, setMode] = useState('show');
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);

  function adopt(next) {
    setS(next); setName(next.name); setModel(next.model); setMode(next.mode); setCap(String(next.cap));
  }

  async function load() {
    try { adopt(await api('/api/assistant/settings')); } catch { setHidden(true); } // managers: no AI card
  }

  useEffect(() => {
    load();
    api('/api/assistant/models').then(setModels).catch(() => setModels([]));
  }, []);

  async function put(body, done) {
    setBusy(true);
    try {
      adopt(await api('/api/assistant/settings', { method: 'PUT', body }));
      if (done) showToast(done);
      return true;
    } catch (e) { showToast(e.message, 'error'); return false; }
    finally { setBusy(false); }
  }

  async function save() {
    const body = {};
    if (keyInput.trim()) body.key = keyInput.trim();
    if (name.trim() !== s.name) body.name = name.trim();
    if (model !== s.model) body.model = model;
    if (mode !== s.mode) body.mode = mode;
    if (await put(body, 'AI settings saved')) {
      setKeyInput('');
      if (body.name) router.refresh(); // the button and panel take the new name
    }
  }

  async function removeKey() {
    if (confirm('Remove the saved OpenRouter key? The assistant stops working until a new key is saved.')) await put({ key: '' }, 'Key removed');
  }

  async function runTest() {
    setTesting(true); setTest(null);
    try {
      // plain fetch (not api()) so a credit/key error keeps its link and shows inline
      const res = await fetch('/api/assistant/test', { method: 'POST' });
      setTest(await res.json());
      load();
    } catch { setTest({ error: 'Could not reach the server.' }); }
    finally { setTesting(false); }
  }

  if (hidden) return null;
  if (!s) return <Card><CardContent><div className="h-40 animate-pulse rounded-lg bg-muted/50" /></CardContent></Card>;

  const dirty = !!keyInput.trim() || name.trim() !== s.name || model !== s.model || mode !== s.mode;
  const lowCredit = s.balance && s.balance.left <= LOW_CREDIT;
  const picked = models?.find((m) => m.id === model);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="group"><Butterfly className="size-7 -rotate-6 text-primary" /></span> {s.name}
        </CardTitle>
        <CardDescription className="max-w-2xl">
          Ask about projects, clients, orders, people, vendors and money in plain words. Jev (the decision model) picks a fixed,
          read-only look-up; it never writes queries or changes anything. Everyone can use it; staff only see what their tabs show them.
        </CardDescription>
        <CardAction>
          <Button onClick={save} disabled={busy || !dirty}>{busy && <Loader2Icon className="animate-spin" />} Save</Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="flex max-w-sm flex-col gap-2">
          <Label>Name</Label>
          <Input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Atelier AI" />
          <p className="text-xs text-muted-foreground">What everyone sees on the button and the chat panel.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>OpenRouter key</Label>
            <div className="flex gap-2">
              <Input type="password" autoComplete="off" value={keyInput}
                placeholder={s.hasKey ? `Saved (…${s.keyLast4}). Paste a new key to replace it` : 'sk-or-…'}
                onChange={(e) => setKeyInput(e.target.value)} />
              {s.hasKey && <Button variant="ghost" onClick={removeKey} disabled={busy}>Remove</Button>}
            </div>
            <p className="text-xs text-muted-foreground">
              Stored encrypted and never shown again. Create one at openrouter.ai → Keys.
              {s.envKey && ' Until one is saved here, the server’s OPENROUTER_API_KEY (the bank-statement key) is used.'}
            </p>

            {s.hasKey && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                {s.balance ? (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn('figures font-medium', lowCredit && 'text-destructive')}>${s.balance.left.toFixed(2)} left{lowCredit ? ' (too low to answer)' : ''}</span>
                    <span className="figures text-xs text-muted-foreground">${s.balance.used.toFixed(2)} used of ${s.balance.bought.toFixed(2)}</span>
                  </div>
                ) : <span className="text-muted-foreground">Credit could not be read. Check the key.</span>}
                <div className="flex items-center gap-3 text-xs">
                  <button type="button" className="underline underline-offset-2" onClick={load}>Refresh</button>
                  <a href={s.creditsUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Add credit</a>
                </div>
              </div>
            )}

            {(s.hasKey || s.envKey) && (
              <div className="flex flex-col items-start gap-2">
                <Button variant="outline" size="sm" onClick={runTest} disabled={testing}>{testing && <Loader2Icon className="animate-spin" />} Test connection</Button>
                {test && (
                  <p className={cn('text-xs', test.ok ? 'text-success' : 'text-destructive')}>
                    {test.ok ? <>Working: Jev answered in <span className="figures">{test.ms} ms</span> for <span className="figures">${test.cost?.toFixed(5)}</span>.</>
                      : <>{test.error} {test.link && <a href={test.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">{test.linkLabel || 'Open'}</a>}</>}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Writing model</Label>
            <ModelPicker models={models} value={model} onChange={setModel} />
            <p className="text-xs text-muted-foreground">
              {picked
                ? `${picked.id} · input ${price(picked.in)}, output ${price(picked.out)} per million tokens${picked.context ? ` · reads up to ${picked.context.toLocaleString('en-IN')} tokens` : ''}`
                : 'Used only in “Show, then write” mode and for how-to answers.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>How data answers are produced</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <button key={m.value} type="button" onClick={() => setMode(m.value)}
                className={cn('rounded-lg border p-3 text-left transition-colors', mode === m.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                <p className="font-hand text-base">{m.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.body}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Decision model: <span className="figures">{s.jevModel}</span> (fixed). It picks the look-up, company and period, matches names,
            and turns down requests to change data or unrelated topics.
            Anyone who picks a persona in the chat panel (Studio partner, Site supervisor, Finance desk, Gentle guide) gets
            “Show, then write” for themselves, in that voice; a written answer with a number that isn't in the data is dropped.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Questions per day</Label>
              <span className="figures text-xs text-muted-foreground">{s.usedToday} used today</span>
            </div>
            <div className="flex gap-2">
              <Input type="number" min={1} max={10000} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} className="w-32" />
              <Button variant="outline" disabled={busy || cap === String(s.cap)} onClick={() => put({ cap: Number(cap) }, 'Daily limit saved')}>Save limit</Button>
            </div>
            <p className="text-xs text-muted-foreground">A safety cap on everyone's questions together (resets at midnight IST).</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed p-3">
            <Switch checked={s.dataAccess.on} disabled={busy} className="mt-0.5"
              onCheckedChange={(on) => put({ dataAccess: on }, on ? 'Data questions switched on' : 'Data questions switched off')} />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Answer questions about business data</span>
              <span className="text-xs text-muted-foreground">
                {s.dataAccess.on
                  ? 'On. Names in a question (clients, projects, vendors) are sent to OpenRouter to match it; the rows are sent only in “Show, then write” mode.'
                  : 'Off. The assistant only explains how the app works; nothing from the database is sent to OpenRouter.'}
              </span>
            </span>
          </label>
        </div>

        <MissedQuestions />
      </CardContent>
    </Card>
  );
}
