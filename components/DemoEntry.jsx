'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2Icon, ArrowRightIcon, Building2Icon, HammerIcon, MapPinIcon, ClipboardListIcon, TruckIcon, WalletIcon, ReceiptIcon, UsersIcon } from 'lucide-react';
import { track } from '@/components/DemoAnalytics';

// Public demo entry (app/demo/page.js). Same flow as SB Ops' demo. Only things this app does today.
const FEATURES = [
  [Building2Icon, 'Two companies, one system', 'A design studio and its furniture workshop share clients, vendors and people, each with its own work.'],
  [ClipboardListIcon, 'Projects with milestones', 'Every design job carries its milestones, site visits, linked workshop orders and vendor POs.'],
  [HammerIcon, 'Workshop orders', 'Furniture orders with a work history of who worked on what, and when.'],
  [MapPinIcon, 'One calendar', 'Tasks, milestones, site visits and order due dates in one place.'],
  [TruckIcon, 'Vendors and freight', 'Vendor POs with partial deliveries and returns; freight bills checked against a rate card.'],
  [WalletIcon, 'One finance book', 'A cash ledger across both companies; office staff see only the entries they made.'],
  [ReceiptIcon, 'GST invoices', "Invoices under the right company's letterhead and GSTIN, exported as PDF."],
  [UsersIcon, 'People and payroll', 'Daily worksheet, attendance, advances and expenses, and payroll from them.'],
];

const FIELDS = [
  ['name', 'Your name', 'text', true], ['company', 'Company', 'text', true], ['email', 'Work email', 'email', true],
  ['phone', 'Phone (optional)', 'tel', false], ['business', 'What does your firm do? (optional)', 'text', false],
];

export default function DemoEntry({ roles, hasLead }) {
  const [step, setStep] = useState(hasLead ? 'roles' : 'form');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy('form'); setError('');
    try {
      await api('/api/demo/lead', { method: 'POST', body: form });
      track('generate_lead', { form: 'demo' });
      setStep('roles');
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  }
  async function enter(username) {
    setBusy(username); setError('');
    try {
      const r = await api('/api/demo/enter', { method: 'POST', body: { username } });
      track('demo_role_selected', { role: username });
      window.location.assign(r.home || '/');
    } catch (err) { setError(err.message); setBusy(null); }
  }

  return (
    <main className="container grid min-h-screen gap-10 py-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
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
          {FEATURES.map(([Icon, title, text]) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{text}</p></div>
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
  );
}
