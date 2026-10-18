'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, showToast, formatMoney, capitalize } from '@/lib/client';
import { todayISO, todayMonth } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { PlusIcon, CheckIcon } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';

export default function PeoplePage() {
  return (
    <div className="container flex flex-col gap-4 py-6">
      <div>
        <h1 className="page-title">People</h1>
        <p className="text-sm text-muted-foreground">Workshop employees — attendance, daily work, payroll</p>
      </div>
      <Tabs defaultValue="worksheet">
        <TabsList>
          <TabsTrigger value="worksheet">Daily worksheet</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="worksheet" className="mt-4"><Worksheet /></TabsContent>
        <TabsContent value="employees" className="mt-4"><Employees /></TabsContent>
        <TabsContent value="payroll" className="mt-4"><Payroll /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Daily worksheet ---------------- */

function Worksheet() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);

  const load = useCallback(async () => {
    setData(await api(`/api/worksheet?date=${date}`));
  }, [date]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/api/orders?status=all').then(o => setOrders(o.filter(x => ['pending', 'in_progress'].includes(x.status)))).catch(() => {});
  }, []);

  if (!data) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <DateInput value={date} onChange={setDate} className="w-44" />
        <p className="text-sm text-muted-foreground">
          {data.rows.filter(r => r.attendance?.status === 'present').length} present ·{' '}
          {data.rows.filter(r => r.attendance?.status === 'half').length} half day ·{' '}
          {data.rows.filter(r => r.attendance?.status === 'absent').length} absent ·{' '}
          {data.rows.filter(r => !r.attendance).length} unmarked
        </p>
      </div>
      {data.rows.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No active employees. Add them in the Employees tab.</p>
      )}
      <div className="flex flex-col gap-3">
        {data.rows.map(row => (
          <WorksheetRow key={row.employee.id} row={row} date={date} orders={orders} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

function WorksheetRow({ row, date, orders, onSaved }) {
  const { employee: e, attendance: a, workLogs } = row;
  const [att, setAtt] = useState({ status: a?.status || '', in_time: a?.in_time || '', out_time: a?.out_time || '' });
  const [log, setLog] = useState({ order_id: '', start_time: '', end_time: '', description: '', rating: '' });
  const [addingLog, setAddingLog] = useState(false);

  useEffect(() => {
    setAtt({ status: a?.status || '', in_time: a?.in_time || '', out_time: a?.out_time || '' });
  }, [a?.status, a?.in_time, a?.out_time, date]);

  async function saveAttendance(next) {
    try {
      await api('/api/attendance', { method: 'POST', body: { employee_id: e.id, date, ...next } });
      onSaved();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function addLog() {
    try {
      await api('/api/work-logs', {
        method: 'POST',
        body: {
          employee_id: e.id, date,
          order_id: log.order_id ? Number(log.order_id) : null,
          start_time: log.start_time || null, end_time: log.end_time || null,
          description: log.description || null,
          rating: log.rating ? Number(log.rating) : null,
        },
      });
      setLog({ order_id: '', start_time: '', end_time: '', description: '', rating: '' });
      setAddingLog(false);
      onSaved();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteLog(id) {
    await api(`/api/work-logs/${id}`, { method: 'DELETE' });
    onSaved();
  }

  const absent = att.status === 'absent';

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/people/${e.id}`} className="min-w-32 font-medium text-primary hover:underline">{e.name}</Link>
          <span className="text-xs text-muted-foreground">{e.profession || '—'}</span>
          <div className="ml-auto flex items-center gap-2">
            <Select value={att.status} onValueChange={v => { setAtt({ ...att, status: v }); saveAttendance({ ...att, status: v }); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Mark…" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="half">Half day</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {!absent && att.status && (
              <>
                <Input type="time" value={att.in_time} onChange={ev => setAtt({ ...att, in_time: ev.target.value })}
                  onBlur={() => saveAttendance(att)} className="w-28" aria-label="In time" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="time" value={att.out_time} onChange={ev => setAtt({ ...att, out_time: ev.target.value })}
                  onBlur={() => saveAttendance(att)} className="w-28" aria-label="Out time" />
              </>
            )}
          </div>
        </div>

        {!absent && (
          <div className="flex flex-col gap-2 border-t pt-3">
            {workLogs.map(w => (
              <div key={w.id} className="group flex items-center gap-2 text-sm">
                <Badge variant="outline" className="shrink-0">{w.order_item || 'No order'}</Badge>
                <span className="text-xs text-muted-foreground">
                  {w.start_time && w.end_time ? `${w.start_time}–${w.end_time}` : ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{w.description || '—'}</span>
                {w.rating && <span className="text-xs">★ {w.rating}</span>}
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => deleteLog(w.id)} aria-label="Delete log">
                  <TrashIcon />
                </Button>
              </div>
            ))}
            {!addingLog ? (
              <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setAddingLog(true)}>
                <PlusIcon data-icon="inline-start" />Log work
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={log.order_id} onValueChange={v => setLog({ ...log, order_id: v })}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Order" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {orders.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.item} × {o.qty}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input type="time" value={log.start_time} onChange={ev => setLog({ ...log, start_time: ev.target.value })} className="w-28" aria-label="Start" />
                <Input type="time" value={log.end_time} onChange={ev => setLog({ ...log, end_time: ev.target.value })} className="w-28" aria-label="End" />
                <Input placeholder="Part / work done (e.g. chair legs turning)" value={log.description}
                  onChange={ev => setLog({ ...log, description: ev.target.value })} className="min-w-48 flex-1" />
                <Select value={log.rating} onValueChange={v => setLog({ ...log, rating: v })}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="★" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>★ {n}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={addLog}><CheckIcon data-icon="inline-start" />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingLog(false)}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Employees ---------------- */

const EMPTY_EMP = { name: '', profession: '', phone: '', pay_type: 'daily', pay_rate: '', joined_at: '' };

function Employees() {
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_EMP);
  const [busy, setBusy] = useState(false);

  async function load() { setEmployees(await api('/api/employees')); }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await api('/api/employees', { method: 'POST', body: { ...form, pay_rate: Number(form.pay_rate) || 0 } });
      showToast('Employee added');
      setOpen(false);
      setForm(EMPTY_EMP);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusIcon data-icon="inline-start" />Add employee</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New employee</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Profession</Label>
                  <Input placeholder="Carpenter, polisher…" value={form.profession} onChange={e => setForm({ ...form, profession: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Joined</Label>
                  <DateInput value={form.joined_at} onChange={v => setForm({ ...form, joined_at: v })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Pay type</Label>
                  <Select value={form.pay_type} onValueChange={v => setForm({ ...form, pay_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="daily">Daily wage</SelectItem>
                        <SelectItem value="salary">Monthly salary</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{form.pay_type === 'daily' ? 'Rate per day (₹)' : 'Salary per month (₹)'}</Label>
                  <Input type="number" min="0" value={form.pay_rate} onChange={e => setForm({ ...form, pay_rate: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Profession</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead>Today</TableHead>
              <TableHead>Current order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No employees yet.</TableCell></TableRow>
            )}
            {employees.map(e => (
              <TableRow key={e.id} className={e.active ? '' : 'opacity-50'}>
                <TableCell>
                  <Link href={`/people/${e.id}`} className="font-medium text-primary hover:underline">{e.name}</Link>
                  {!e.active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.profession || '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatMoney(e.pay_rate)}{e.pay_type === 'daily' ? '/day' : '/mo'}
                </TableCell>
                <TableCell>
                  {e.today_status
                    ? <Badge variant={e.today_status === 'present' ? 'default' : e.today_status === 'half' ? 'secondary' : 'destructive'}>{capitalize(e.today_status)}</Badge>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.last_order_id
                    ? <Link href={`/orders/${e.last_order_id}`} className="text-primary hover:underline">{e.last_order_item}</Link>
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ---------------- Payroll ---------------- */

function Payroll() {
  const [period, setPeriod] = useState(todayMonth());
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setData(await api(`/api/payroll?period=${period}`));
  }, [period]);
  useEffect(() => { load(); }, [load]);

  async function recordPayment(r) {
    if (!confirm(`Record payment of ₹${r.net.toLocaleString('en-IN')} to ${r.name} for ${period}?`)) return;
    try {
      await api('/api/payroll', {
        method: 'POST',
        body: { employee_id: r.id, period, gross: r.gross, deductions: r.advances, net: r.net },
      });
      showToast('Payment recorded');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!data) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-44" />
      <div className="paper-surface overflow-hidden rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Days present</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Advances</TableHead>
              <TableHead className="text-right">Net payable</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No employees.</TableCell></TableRow>
            )}
            {data.rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/people/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>
                  <span className="ml-2 text-xs text-muted-foreground">{r.pay_type === 'daily' ? `₹${r.pay_rate}/day` : `₹${r.pay_rate}/mo`}</span>
                </TableCell>
                <TableCell className="text-right">{r.days_present}</TableCell>
                <TableCell className="text-right">₹{r.gross.toLocaleString('en-IN')}</TableCell>
                <TableCell className="text-right text-destructive">{r.advances ? `−₹${r.advances.toLocaleString('en-IN')}` : '—'}</TableCell>
                <TableCell className="text-right font-medium">₹{r.net.toLocaleString('en-IN')}</TableCell>
                <TableCell className="text-right">
                  {r.payment_id
                    ? <Badge variant="secondary">Paid ₹{Number(r.paid_net).toLocaleString('en-IN')}</Badge>
                    : <Button size="sm" variant="outline" onClick={() => recordPayment(r)}>Record payment</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Gross = days present × daily rate (or flat monthly salary). Net = gross − advances taken in the month.
      </p>
    </div>
  );
}
