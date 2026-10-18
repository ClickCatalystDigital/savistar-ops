'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpIcon, ArrowUpRightIcon, ChevronDownIcon, LockIcon, RotateCcwIcon, ThumbsDownIcon, ThumbsUpIcon, XIcon } from 'lucide-react';
import { Butterfly } from './butterfly';
import { PERSONA_BY_KEY } from '@/lib/assistant-personas';
import { cn } from '@/lib/utils';
import { DEMO } from '@/lib/brand';
import { STARTERS } from '@/lib/assistant-starters';
import { StickyNote } from '@/components/sticky-note';
import { track } from '@/components/DemoAnalytics';
import { ResultCard, safePath } from './result-card';
import { DraftCard } from './draft-card';
import { AiLimitOverlay } from './ai-limit-overlay';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const todayKey = () => new Date().toLocaleDateString('en-CA');
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const replyText = (r) => [r.title, r.summary, r.text].filter(Boolean).join(' — ');

function Thinking() {
  return (
    <p className="flex items-center gap-2 font-hand text-sm text-muted-foreground">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary/50" style={{ animationDelay: `${i * 120}ms` }} />)}
      </span>
      Looking that up…
    </p>
  );
}

// The assistant: a paper button in the corner opens a sheet with the conversation. Answers come from fixed, read-only
// look-ups (lib/assistantTools.js); the conversation lives here, in the browser — the server keeps only a one-line
// question log. Port of reel-inventory's AssistantWidget in the app's paper look.
export function AssistantWidget({ user, aiName }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [briefOpen, setBriefOpen] = useState(true);
  const [usual, setUsual] = useState([]);
  const [defaults, setDefaults] = useState(STARTERS);
  // Public demo: free questions left for this visitor (null until known), and the "that was your free questions" overlay.
  const [demoAi, setDemoAi] = useState(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const locked = DEMO && demoAi?.left === 0;
  // This person's persona (chosen in Settings → My assistant): per login on the live app; in the browser on the demo.
  const [persona, setPersona] = useState('plain');
  const loadedAt = useRef(0); // the briefing is time-aware: reload it when the panel opens after 10+ minutes
  const endRef = useRef(null);
  const lastAnswerRef = useRef(null);
  const inputRef = useRef(null);
  const idRef = useRef(1);
  const contextRef = useRef(null); // what the last table answer was about, for follow-ups ("and last month?")

  // The conversation survives a reload (this tab only, per login; gone when the tab closes). Unsaved reminder/note
  // drafts are left out, so a restored card can never be saved twice.
  const chatKey = `ai_chat:${user.username}`;
  const restored = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(chatKey) || 'null');
      if (saved?.msgs?.length) { setMsgs(saved.msgs); contextRef.current = saved.context || null; idRef.current = Math.max(...saved.msgs.map((m) => m.id)) + 1; }
    } catch { /* storage blocked */ }
    restored.current = true;
  }, [chatKey]);
  useEffect(() => {
    if (!restored.current) return;
    try { sessionStorage.setItem(chatKey, JSON.stringify({ msgs: msgs.filter((m) => m.reply?.type !== 'draft').slice(-30), context: contextRef.current })); } catch { /* storage blocked or full */ }
  }, [msgs, chatKey]);
  const name = (user.display_name || user.username || '').split(' ')[0];
  const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

  // A new answer scrolls to its start (so the headline shows, not the bottom of a long table); your own message
  // and the "looking that up" line scroll to the end.
  useEffect(() => {
    const lastIsAnswer = msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant' && !busy;
    if (lastIsAnswer && lastAnswerRef.current) lastAnswerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (isPhone()) document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  // Read on every open, so a change made in Settings applies straight away.
  useEffect(() => {
    if (!open) return;
    if (DEMO) { const p = store.get('ai_persona'); setPersona(PERSONA_BY_KEY[p] ? p : 'plain'); return; }
    fetch('/api/assistant/persona').then((r) => (r.ok ? r.json() : null)).then((d) => d && setPersona(d.persona)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!DEMO) return;
    fetch('/api/demo/ai').then((r) => (r.ok ? r.json() : null)).then((d) => d && setDemoAi(d)).catch(() => {});
  }, []);
  const showLimit = () => { setLimitOpen(true); track('interiors_demo_ai_limit'); };

  // Once a day a sticky note appears beside the button.
  useEffect(() => {
    if (store.get('ai_greeted') === todayKey()) return;
    const on = setTimeout(() => { setTeaser(true); store.set('ai_greeted', todayKey()); }, 1500);
    const off = setTimeout(() => setTeaser(false), 11000);
    return () => { clearTimeout(on); clearTimeout(off); };
  }, []);

  // Briefing + "your usual" questions load when the panel opens.
  useEffect(() => {
    if (!open || Date.now() - loadedAt.current < 600000) return;
    loadedAt.current = Date.now();
    fetch('/api/assistant/briefing').then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) return;
      setBriefing(b);
      setBriefOpen(store.get('ai_brief_hidden') !== `${b.day}|${b.part}`);
    }).catch(() => {});
    fetch('/api/assistant/starters').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setUsual(d.usual ?? []);
      if (d.defaults?.length) setDefaults(d.defaults);
    }).catch(() => {});
  }, [open]);

  function toggleBrief() {
    setBriefOpen((o) => {
      if (briefing) store.set('ai_brief_hidden', o ? `${briefing.day}|${briefing.part}` : '');
      return !o;
    });
  }

  const send = useCallback(async (raw) => {
    const q = (raw ?? text).trim();
    if (!q || busy) return;
    if (locked) { showLimit(); return; }
    const next = [...msgs, { id: idRef.current++, role: 'user', content: q }];
    setMsgs(next); setText(''); setBusy(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const history = next.filter((m) => !m.error).slice(-6)
        .map((m) => ({ role: m.role, content: m.content || (m.reply ? replyText(m.reply) : '') })).filter((m) => m.content);
      const res = await fetch('/api/assistant/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, path: pathname, context: contextRef.current, persona }),
      });
      const data = await res.json().catch(() => null);
      if (DEMO && res.status === 429 && data?.demoLimit) { setDemoAi((d) => (d ? { ...d, left: 0 } : d)); showLimit(); }
      if (DEMO && res.ok) { setDemoAi((d) => (d && !d.pass ? { ...d, left: Math.max(0, d.left - 1) } : d)); track('interiors_demo_ai_question'); }
      if (!res.ok || !data?.reply) {
        setMsgs((m) => [...m, { id: idRef.current++, role: 'assistant', error: { text: data?.error || 'Something went wrong. Please try again.', link: data?.link, linkLabel: data?.linkLabel } }]);
      } else {
        setMsgs((m) => [...m, { id: idRef.current++, role: 'assistant', reply: data.reply, content: replyText(data.reply) }]);
        if (data.reply.type === 'table') contextRef.current = data.reply.context ?? null;
        else if (data.reply.type === 'text') contextRef.current = null;
      }
    } catch {
      setMsgs((m) => [...m, { id: idRef.current++, role: 'assistant', error: { text: 'Could not reach the server. Check your connection and try again.' } }]);
    } finally { setBusy(false); }
  }, [msgs, text, busy, pathname, locked, persona]);

  // Thumbs on an answer: one log row; a thumbs-down also lands in Settings → My assistant → "Questions it couldn't answer".
  const rate = useCallback((id, question, tool, good) => {
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, fb: good } : x)));
    fetch('/api/assistant/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, tool, good }) }).catch(() => {});
  }, []);

  const reset = () => { setMsgs([]); contextRef.current = null; };
  const closeOnPhone = () => isPhone() && setOpen(false);

  // The demo shows the assistant only when it has its own AI key (and once the visitor's count is known).
  if (DEMO && !demoAi?.enabled) return null;
  const limitOverlay = limitOpen && demoAi ? <AiLimitOverlay name={aiName} limit={demoAi.limit} onClose={() => setLimitOpen(false)} /> : null;

  if (!open) {
    return (
      <>
        {limitOverlay}
        {teaser && (
          <button type="button" onClick={() => { setTeaser(false); setOpen(true); }}
            className="fixed right-20 bottom-[calc(9.75rem+env(safe-area-inset-bottom))] z-40 animate-in fade-in slide-in-from-right-2 duration-300 md:right-24 md:bottom-7 print:hidden">
            <StickyNote className="max-w-[13rem] px-4 py-3 text-left text-[15px]">
              {greeting()}, {name}! Your briefing is ready — or ask me how a project is going.
            </StickyNote>
          </button>
        )}
        {/* A paper disc with a stitched rim; the butterfly opens its wings on hover and the name slides out in hand. */}
        <button type="button" onClick={() => { setTeaser(false); if (locked) showLimit(); else setOpen(true); }} aria-label={locked ? `${aiName}: free questions used` : `Open ${aiName}`}
          className={cn('paper-surface group fixed right-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full transition-all duration-300 print:hidden',
            'hover:-translate-y-0.5 hover:rotate-[-4deg] active:scale-95 md:right-6 md:bottom-6')}>
          <span aria-hidden className="pointer-events-none absolute inset-1 rounded-full border border-dashed border-primary/25 transition-colors group-hover:border-primary/45" />
          <Butterfly className="size-8 text-primary" />
          <span aria-hidden className="pointer-events-none absolute right-full mr-3 hidden translate-x-2 rotate-[-3deg] whitespace-nowrap rounded-sm bg-[#fbf0b2] px-2.5 py-1 font-hand text-[15px] text-stone-700 opacity-0 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)] transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 md:block dark:bg-[#4d4726] dark:text-stone-100">
            {aiName}
          </span>
          {locked && (
            <span className="absolute -top-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-background bg-foreground text-background">
              <LockIcon className="size-3" />
            </span>
          )}
        </button>
      </>
    );
  }

  const suggestions = (m) => [...(m.reply.chips ?? []), ...(m.reply.options ?? [])];

  return (
    <>
    {limitOverlay}
    <div role="dialog" aria-label={`${aiName} assistant`}
      className={cn('paper-surface fixed z-50 flex flex-col overflow-hidden print:hidden',
        'inset-0 pt-[env(safe-area-inset-top)] animate-in fade-in slide-in-from-bottom-3 duration-200',
        'md:inset-auto md:right-6 md:bottom-6 md:h-[min(44rem,calc(100dvh-3rem))] md:w-[28rem] md:rounded-xl md:pt-0')}>
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-dashed px-4 py-2.5">
        <Butterfly open className="size-7 shrink-0 -rotate-6 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="marker w-fit font-hand text-xl leading-tight">{aiName}</p>
          {DEMO && demoAi && <p className="figures text-[11px] text-muted-foreground">{demoAi.pass ? 'Owner pass · no limit' : `${demoAi.left} of ${demoAi.limit} free questions left`}</p>}
        </div>
        <button type="button" onClick={reset} disabled={busy || !msgs.length} aria-label="New conversation" title="New conversation"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30">
          <RotateCcwIcon className="size-4" />
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" title="Close"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <XIcon className="size-4" />
        </button>
      </div>

      {/* conversation */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {msgs.length === 0 && (
          <div className="flex min-h-full flex-col justify-center gap-5 pb-2">
            <div>
              <p className="font-hand text-2xl">{PERSONA_BY_KEY[persona]?.hello?.(name) || `${greeting()}, ${name}`}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Ask about projects, clients, orders, people, vendors or money.</p>
            </div>
            {briefing && (
              <div className="-rotate-[0.6deg] rounded-sm bg-[#fbf0b2] text-stone-700 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)] dark:bg-[#4d4726] dark:text-stone-100">
                <button type="button" onClick={toggleBrief} aria-expanded={briefOpen} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block font-hand text-[15px]">{briefing.part === 'morning' ? 'Morning' : briefing.part === 'afternoon' ? 'Afternoon' : 'Evening'} briefing</span>
                    <span className="block text-[13px] leading-snug opacity-80">{briefing.headline}</span>
                  </span>
                  <ChevronDownIcon className={cn('size-4 shrink-0 opacity-60 transition-transform', briefOpen && 'rotate-180')} />
                </button>
                {briefOpen && (
                  <ul className="border-t border-stone-700/15 px-1 pb-1 text-[13px] dark:border-stone-100/15">
                    {briefing.items.map((it) => {
                      const row = (
                        <>
                          <span className="flex-1 opacity-80">{it.label}</span>
                          <span className={cn('figures text-[12px]', it.tone === 'warn' && 'text-[#b4521c] dark:text-[#f0a46b]')}>{it.value}</span>
                          {safePath(it.link) && <ArrowUpRightIcon className="size-3 shrink-0 opacity-40" />}
                        </>
                      );
                      return (
                        <li key={it.label}>
                          {safePath(it.link)
                            ? <Link href={it.link} onClick={closeOnPhone} className="flex items-center gap-2 rounded px-2.5 py-1.5 transition-colors hover:bg-stone-700/5 dark:hover:bg-stone-100/5">{row}</Link>
                            : <div className="flex items-center gap-2 px-2.5 py-1.5">{row}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            <div>
              {usual.length > 0 && (
                <>
                  <p className="mb-1.5 font-hand text-sm text-muted-foreground">Your usual</p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {usual.map((q) => (
                      <button key={q} type="button" onClick={() => send(q)} className="rounded-full bg-primary px-3 py-1.5 text-left text-xs text-primary-foreground transition-opacity hover:opacity-85">{q}</button>
                    ))}
                  </div>
                </>
              )}
              <p className="mb-1 font-hand text-sm text-muted-foreground">Try asking</p>
              <div className="flex flex-col">
                {defaults.filter((q) => !usual.includes(q)).map((q) => (
                  <button key={q} type="button" onClick={() => send(q)}
                    className="group flex items-center gap-2 border-b border-[color-mix(in_oklab,var(--info)_14%,transparent)] py-2 text-left text-[13.5px]">
                    <span className="flex-1 text-foreground/80 transition-colors group-hover:text-primary">{q}</span>
                    <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {msgs.map((m, idx) => m.role === 'user' ? (
            <div key={m.id} className="max-w-[85%] self-end rounded-lg rounded-br-sm bg-accent px-3.5 py-2 text-[13.5px] leading-relaxed text-accent-foreground">
              {m.content}
            </div>
          ) : (
            <div key={m.id} ref={idx === msgs.length - 1 ? lastAnswerRef : undefined} className="flex min-w-0 scroll-mt-2 flex-col gap-2">
              {m.error ? (
                <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive">
                  {m.error.text}
                  {m.error.link && (m.error.link.startsWith('http')
                    ? <a href={m.error.link} target="_blank" rel="noreferrer" className="mt-1.5 block font-medium underline underline-offset-2">{m.error.linkLabel || 'Open'}</a>
                    : safePath(m.error.link) && <Link href={m.error.link} onClick={closeOnPhone} className="mt-1.5 block font-medium underline underline-offset-2">{m.error.linkLabel || 'Open'}</Link>)}
                </div>
              ) : m.reply?.type === 'table' ? (
                <>
                  <ResultCard reply={m.reply} onNavigate={closeOnPhone} />
                  <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
                    <span className="mr-1 font-hand text-[13px]">{m.fb === undefined ? 'Was this right?' : 'Thanks!'}</span>
                    {[true, false].map((good) => {
                      const Icon = good ? ThumbsUpIcon : ThumbsDownIcon;
                      const q = [...msgs.slice(0, idx)].reverse().find((x) => x.role === 'user')?.content ?? '';
                      return (
                        <button key={String(good)} type="button" disabled={m.fb !== undefined} onClick={() => rate(m.id, q, m.reply.tool, good)}
                          aria-label={good ? 'Good answer' : 'Wrong answer'}
                          className={cn('grid size-7 place-items-center rounded-md transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent', m.fb === good && (good ? 'text-success' : 'text-destructive'))}>
                          <Icon className="size-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : m.reply?.type === 'draft' ? (
                <>
                  <p className="text-[13.5px]">{m.reply.text}</p>
                  <DraftCard draft={m.reply.draft} user={user.username} onNavigate={closeOnPhone} />
                </>
              ) : m.reply ? (
                <>
                  <div className="border-l-2 border-[color-mix(in_oklab,var(--weekend)_45%,transparent)] py-0.5 pl-3 text-[13.5px] leading-relaxed">
                    {m.reply.title && <p className="font-hand text-sm text-primary/80">{m.reply.title}</p>}
                    <p className="whitespace-pre-wrap">{m.reply.text}</p>
                  </div>
                  {m.reply.link && safePath(m.reply.link.path) && (
                    <Link href={m.reply.link.path} onClick={closeOnPhone} className="inline-flex w-fit items-center gap-1 rounded-full border border-dashed px-3 py-1 font-hand text-[13px] text-primary transition-colors hover:bg-muted">
                      {m.reply.link.label} <ArrowUpRightIcon className="size-3" />
                    </Link>
                  )}
                  {suggestions(m).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {suggestions(m).map((c) => (
                        <button key={c.label} type="button" disabled={busy} onClick={() => send(c.send)}
                          className="rounded-full border bg-card px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50">
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ))}
          {busy && <Thinking />}
          <div ref={endRef} />
        </div>
      </div>

      {/* composer */}
      <form className="border-t border-dashed px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2 rounded-lg border bg-card p-1.5 transition-shadow focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
          <textarea ref={inputRef} value={text} rows={1} maxLength={600} placeholder="Ask about a project, order, invoice…"
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] outline-none placeholder:text-muted-foreground/70 md:text-sm" />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:bg-muted disabled:text-muted-foreground">
            <ArrowUpIcon className="size-4" />
          </button>
        </div>
      </form>
    </div>
    </>
  );
}
