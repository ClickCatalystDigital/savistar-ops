'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRightIcon, CheckIcon, CopyIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

// Paths an answer may link to: the tabs and a record's own page (same rule as lib/assistantTools.js safePath).
export const safePath = (p) => (typeof p === 'string' && /^\/(clients|projects|orders|people|vendors|finance|settings)?(\/\d+)?$/.test(p) ? p : null);

const NUMERIC = ['int', 'money', 'delta', 'money_delta'];
const inr = (v) => `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
function cell(v, type) {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return inr(Number(v));
  if (type === 'int') return Number(v).toLocaleString('en-IN');
  if (type === 'date') { const d = formatDate(String(v)); return d.endsWith(` ${new Date().getFullYear()}`) ? d.slice(0, -5) : d; } // this year's dates without the year
  if (type === 'delta' || type === 'money_delta') {
    const n = Number(v);
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${type === 'money_delta' ? inr(Math.abs(n)) : Math.abs(n).toLocaleString('en-IN')}`;
  }
  return String(v);
}

// A data answer on a sheet of paper: the look-up's name in hand, the headline, the parameters understood (so they can
// be checked at a glance), the rows as a ledger, and a link to the screen with the full picture.
export function ResultCard({ reply, onNavigate }) {
  const [copied, setCopied] = useState(false);
  const cols = (reply.columns || []).filter((c) => c.key);
  const kv = cols.length === 2 && !cols[0].label && !cols[1].label; // a fact sheet (one project), not a table
  const rows = reply.rows || [];
  const link = reply.link && safePath(reply.link.path) ? reply.link : null;

  async function copy() {
    const tsv = [cols.map((c) => c.label).join('\t'), ...rows.map((r) => cols.map((c) => String(r[c.key] ?? '')).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="w-full overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 shadow-[0_6px_16px_-10px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3">
          <div>
            <p className="font-hand text-sm text-primary/80">{reply.toolLabel}</p>
            <p className="text-[13px] text-muted-foreground">{reply.title}</p>
          </div>
          <p className="text-[15px] leading-snug font-medium">{reply.summary}</p>
          {reply.params?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {reply.params.map((p) => (
                <span key={p.label} className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                  {p.label} <span className="truncate text-foreground">{p.value}</span>
                </span>
              ))}
            </div>
          )}
          {reply.text && <p className="border-l-2 border-[color-mix(in_oklab,var(--weekend)_45%,transparent)] pl-2.5 text-[13.5px] leading-relaxed">{reply.text}</p>}
        </div>

        {rows.length > 0 && (
          <div className="max-h-72 overflow-auto border-t">
            <Table className="text-xs">
              {!kv && (
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    {cols.map((c) => <TableHead key={c.key} className={cn('h-8 px-3 font-hand text-[13px] font-normal text-muted-foreground', NUMERIC.includes(c.type) && 'text-right')}>{c.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
              )}
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    {cols.map((c, j) => (
                      <TableCell key={c.key} className={cn('px-3 py-1.5 align-top whitespace-normal',
                        NUMERIC.includes(c.type) && 'text-right whitespace-nowrap',
                        c.type === 'date' && 'figures whitespace-nowrap text-muted-foreground',
                        (c.type === 'delta' || c.type === 'money_delta') && Number(r[c.key]) > 0 && 'text-success',
                        (c.type === 'delta' || c.type === 'money_delta') && Number(r[c.key]) < 0 && 'text-destructive',
                        j === 0 && (kv ? 'w-36 font-hand text-[13px] text-muted-foreground' : 'font-medium'))}>
                        {cell(r[c.key], c.type)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-dashed px-3 py-1.5">
          <div className="min-w-0 text-[11px] leading-snug text-muted-foreground">
            {reply.truncated && <p>Showing {rows.length} of {reply.total?.toLocaleString('en-IN')}.</p>}
            {reply.note && <p>{reply.note}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {rows.length > 0 && !kv && (
              <button type="button" onClick={copy} title="Copy table" aria-label="Copy table" className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
              </button>
            )}
            {link && (
              <Link href={link.path} onClick={onNavigate} className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-hand text-[13px] text-primary transition-colors hover:bg-muted">
                {link.label} <ArrowUpRightIcon className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
      {reply.cards?.map((c, i) => <ResultCard key={i} reply={c} onNavigate={onNavigate} />)}
    </div>
  );
}
