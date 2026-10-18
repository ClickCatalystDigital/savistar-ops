'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2Icon, ArrowRightIcon, ArrowUpIcon, ChevronRightIcon } from 'lucide-react';
import { FEATURES } from '@/lib/demo-features';
import { track } from '@/components/DemoAnalytics';

// Public demo entry (app/demo/page.js). Same flow as SB Ops' demo.

const FIELDS = [
  ['name', 'Your name', 'text', true], ['company', 'Company', 'text', true], ['email', 'Work email', 'email', true],
  ['phone', 'Phone (optional)', 'tel', false], ['business', 'What does your firm do? (optional)', 'text', false],
];

export default function DemoEntry({ roles, hasLead }) {
  const [step, setStep] = useState(hasLead ? 'roles' : 'form');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  // Owner pass (lib/demo-leads.js): /demo#pass=… goes straight to the roles. The secret is wiped from the address bar
  // and is only ever sent in a POST body.
  useEffect(() => {
    const pass = new URLSearchParams(window.location.hash.slice(1)).get('pass');
    if (!pass) return;
    history.replaceState(null, '', window.location.pathname);
    api('/api/demo/pass', { method: 'POST', body: { pass } }).then(() => setStep('roles')).catch((e) => setError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy('form'); setError('');
    try {
      await api('/api/demo/lead', { method: 'POST', body: form });
      track('interiors_demo_form_sent');
      setStep('roles');
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  }
  async function enter(username) {
    setBusy(username); setError('');
    try {
      const r = await api('/api/demo/enter', { method: 'POST', body: { username } });
      track('interiors_demo_login', { role: username });
      window.location.assign(r.home || '/');
    } catch (err) { setError(err.message); setBusy(null); }
  }

  return (
    <>
    {/* Slim header: who made this and where to read more (not the full ahromlabs.com navbar, so the form stays the focus). */}
    <header className="border-b">
      <div className="container flex h-14 items-center justify-between gap-4 text-sm">
        <a href="https://ahromlabs.com" className="font-semibold tracking-tight">Ahrom Labs</a>
        <nav className="flex items-center gap-4 text-muted-foreground sm:gap-6">
          <a href="https://ahromlabs.com/industries/interior-design-and-furniture" className="hover:text-foreground">How it was built</a>
          <a href="https://ahromlabs.com/#contact" className="hover:text-foreground">Contact</a>
        </nav>
      </div>
    </header>
    <main id="top" className="container grid min-h-[calc(100vh-3.5rem)] gap-10 py-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <section className="order-2 min-w-0 space-y-6 lg:order-none">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ahrom Labs · live demo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Operations for an interior design studio and its furniture workshop</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Walk through a working copy with sample data for Acme Interiors and Acme Furniture, two made-up sister companies:
            projects on site, workshop orders, vendor POs and a shared finance book. Click anything; changes reset every night.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {/* Each feature links to its own section below (#in-detail), for visitors and search engines. */}
          {FEATURES.map(([Icon, title, text, id]) => (
            <li key={title}>
              <a href={`#${id}`} className="group -m-2 flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="flex items-center gap-1 text-sm font-medium">{title}<ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          How it was built for a real studio and workshop:{' '}
          <a href="https://ahromlabs.com/industries/interior-design-and-furniture" className="font-medium text-foreground underline-offset-2 hover:underline">software for interior design firms and furniture workshops</a>
        </p>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{step === 'form' ? 'Open the demo' : 'Choose who to be'}</h2>
          <p className="text-sm text-muted-foreground">
            {step === 'form' ? 'Tell us who you are. No password, no card.' : 'Each login sees what that role works with. Switch any time from the banner.'}
          </p>
        </CardHeader>
        <CardContent>
          {step === 'form' ? (
            <form onSubmit={submit} className="space-y-4">
              {FIELDS.map(([key, label, type, required]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input id={key} type={type} required={required} value={form[key] || ''}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy === 'form'}>
                {busy === 'form' ? <Loader2Icon className="animate-spin" /> : <ArrowRightIcon />} Continue
              </Button>
              <p className="text-xs text-muted-foreground">We use these details only to follow up about this system.</p>
            </form>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map(r => (
                <button key={r.username} type="button" disabled={!!busy} onClick={() => enter(r.username)}
                  className="rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50 disabled:opacity-60">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {r.label}{busy === r.username && <Loader2Icon className="size-3.5 animate-spin" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.blurb}</span>
                </button>
              ))}
              {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </main>

    <section id="in-detail" aria-labelledby="in-detail-heading" className="container border-t py-14">
      <h2 id="in-detail-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">What Designer Ops does, in detail</h2>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Designer Ops is one operations system for an interior design studio and its furniture workshop: projects and site
        visits, workshop orders, vendors and freight, people and payroll, GST invoices and a shared finance book. Every
        feature below runs in the live demo above with sample data.
      </p>
      <div className="mt-10 grid gap-x-12 gap-y-12 lg:grid-cols-2">
        {FEATURES.map(([Icon, , , id, heading, body]) => (
          <article key={id} id={id} className="scroll-mt-8">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><Icon className="size-5 text-primary" /></span>
              <h3 className="text-lg font-semibold tracking-tight">{heading}</h3>
            </div>
            {body.map((p, i) => <p key={i} className="mt-3 text-sm leading-relaxed text-muted-foreground">{p}</p>)}
            <a href="#top" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline">
              <ArrowUpIcon className="size-3" /> Try it in the demo
            </a>
          </article>
        ))}
      </div>
    </section>
    </>
  );
}
