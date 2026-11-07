'use client';

// Cue Cards: what you can say to the assistant, by area, with the capability ladder on top (lib/cue-cards.js).
// "Ask" opens the assistant with that prompt (the 'assistant:ask' event, components/assistant/assistant-widget.jsx).
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRightIcon, SearchIcon, WandSparklesIcon } from 'lucide-react';
import { PageTitle } from '@/components/page-title';
import { StickyNote } from '@/components/sticky-note';
import { Input } from '@/components/ui/input';
import { LoadSwap, CardsSkeleton } from '@/components/load-swap';
import { api, showToast } from '@/lib/client';
import { cn } from '@/lib/utils';

const TONE = { know: 'bg-sky-500/80', diagnose: 'bg-amber-500/80', predict: 'bg-violet-400/60', optimize: 'bg-emerald-400/60', execute: 'bg-primary' };

const ask = (q) => window.dispatchEvent(new CustomEvent('assistant:ask', { detail: { q } }));

export default function CueCardsPage() {
  const [data, setData] = useState(null);
  const [level, setLevel] = useState(null);
  const [area, setArea] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/api/assistant/cue-cards').then(setData).catch((e) => showToast(e.message, 'error')); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.cards || []).filter((c) => (!level || c.level === level) && (!area || c.area === area) && (!s || c.q.toLowerCase().includes(s)));
  }, [data, level, area, q]);
  const byLevel = Object.fromEntries((data?.levels || []).map((l) => [l.key, l]));
  const count = (k) => (data?.cards || []).filter((c) => c.level === k).length;

  return (
    <div className="container flex flex-col gap-5 py-6">
      <div>
        <PageTitle>Cue Cards</PageTitle>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Things you can say to the assistant (the button at the bottom right). Pick a card and press Ask, or say it your own way:
          it understands plain words, short forms{process.env.NEXT_PUBLIC_MARKET === 'NA' ? '' : ' and Hinglish'}.
        </p>
      </div>

      {/* The ladder: what the assistant can do, from explaining to acting. Tap a live step to see only its cards. */}
      <LoadSwap ready={!!data} skeleton={<CardsSkeleton cards={5} className="grid grid-cols-2 gap-3 md:grid-cols-5" />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {data?.levels.map((l) => {
            const live = l.status === 'live', on = level === l.key;
            return (
              <button key={l.key} type="button" disabled={!live} onClick={() => setLevel(on ? null : l.key)} aria-pressed={on}
                className={cn('paper-surface flex flex-col gap-1.5 rounded-xl p-3.5 text-left transition-all',
                  live ? 'hover:-translate-y-0.5' : 'cursor-default opacity-60', on && 'ring-2 ring-primary')}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-hand text-lg">
                    <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-semibold text-white', TONE[l.key])}>L{l.n}</span>
                    {l.label}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10.5px]', live ? 'bg-success/15 text-success' : 'border border-dashed text-muted-foreground')}>
                    {live ? `${count(l.key)} cards` : 'Coming'}
                  </span>
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{l.blurb}</span>
              </button>
            );
          })}
        </div>
      </LoadSwap>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search prompts: quote, attendance, cash…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ key: null, label: 'All' }, ...(data?.areas || [])].map((a) => (
            <button key={a.key || 'all'} type="button" onClick={() => setArea(a.key)}
              className={cn('shrink-0 rounded-full border px-3 py-1 text-xs transition-colors', area === a.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <LoadSwap ready={!!data} skeleton={<CardsSkeleton cards={9} />}>
        {shown.length === 0 && <StickyNote className="my-8">No prompts match. Try another word, or just ask the assistant in your own words.</StickyNote>}
        <div className="flex flex-col gap-7">
          {(data?.areas || []).map((a) => {
            const cards = shown.filter((c) => c.area === a.key);
            if (!cards.length) return null;
            return (
              <section key={a.key} className="flex flex-col gap-3">
                <h2 className="marker w-fit font-hand text-xl">{a.label}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cards.map((c) => <Cue key={c.q} c={c} level={byLevel[c.level]} />)}
                </div>
              </section>
            );
          })}
        </div>
      </LoadSwap>
    </div>
  );
}

function Cue({ c, level }) {
  const doing = c.level === 'execute';
  return (
    <div className="paper-surface group flex flex-col gap-3 rounded-xl p-4">
      <p className="flex-1 font-serif text-[15px] italic leading-snug">“{c.q}”</p>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn('size-2 rounded-full', TONE[c.level])} />
          L{level?.n} {level?.label}{doing ? ' · confirms first' : ''}
        </span>
        <button type="button" onClick={() => ask(c.q)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 font-hand text-[13px] text-primary transition-colors hover:bg-muted">
          {doing ? <WandSparklesIcon className="size-3.5" /> : <ArrowUpRightIcon className="size-3.5" />} Ask
        </button>
      </div>
    </div>
  );
}
