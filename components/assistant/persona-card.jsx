'use client';

import { useEffect, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEMO } from '@/lib/brand';
import { showToast } from '@/lib/client';
import { PERSONAS, PERSONA_BY_KEY } from '@/lib/assistant-personas';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Butterfly } from './butterfly';

// Settings → My assistant (everyone): how the assistant talks to you. Saved per login; on the demo, whose logins are
// shared, it stays in this browser. Each card shows how the same project update would read.
export function PersonaCard({ aiName = 'the assistant' }) {
  const [persona, setPersona] = useState(null);

  useEffect(() => {
    if (DEMO) { let p = null; try { p = localStorage.getItem('ai_persona'); } catch { /* storage blocked */ } setPersona(PERSONA_BY_KEY[p] ? p : 'plain'); return; }
    fetch('/api/assistant/persona').then((r) => (r.ok ? r.json() : { persona: 'plain' })).then((d) => setPersona(d.persona)).catch(() => setPersona('plain'));
  }, []);

  async function choose(key) {
    const prev = persona;
    setPersona(key);
    if (DEMO) { try { localStorage.setItem('ai_persona', key); } catch { /* storage blocked */ } return; }
    const res = await fetch('/api/assistant/persona', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: key }) }).catch(() => null);
    if (res?.ok) showToast(`${aiName} will talk as ${PERSONA_BY_KEY[key].label}`);
    else { setPersona(prev); showToast('Could not save your choice', 'error'); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="group"><Butterfly className="size-7 -rotate-6 text-primary" /></span> How {aiName} talks to you
        </CardTitle>
        <CardDescription className="max-w-2xl">
          Your own choice; it doesn't change anyone else's. A persona adds a short written answer above each table, in its
          voice. The numbers always come straight from the data, and {aiName} only ever looks things up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {persona === null ? <div className="h-40 animate-pulse rounded-lg bg-muted/50" /> : (
          <div role="radiogroup" aria-label="Persona" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PERSONAS.map((p) => {
              const on = p.key === persona;
              return (
                <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => choose(p.key)}
                  className={cn('flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all',
                    on ? 'border-primary bg-primary/5 shadow-sm' : 'hover:-translate-y-px hover:border-foreground/20 hover:bg-muted/40')}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 font-hand text-lg leading-tight">{p.label}</span>
                    <CheckIcon className={cn('size-4 text-primary', !on && 'opacity-0')} />
                  </span>
                  <span className="text-xs text-muted-foreground">{p.blurb}</span>
                  <span className="border-l-2 border-[color-mix(in_oklab,var(--weekend)_45%,transparent)] pl-2.5 text-[13px] leading-snug text-foreground/80 italic">
                    “{p.sample}”
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
