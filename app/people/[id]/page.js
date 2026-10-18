'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { StickyNote } from '@/components/sticky-note';
import { useParams, useRouter } from 'next/navigation';
import { api, showToast, formatDate, capitalize } from '@/lib/client';
import { todayISO, todayMonth } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { ArrowLeftIcon, PencilIcon, PlusIcon, StarIcon } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';

export default function EmployeeDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [emp, setEmp] = useState(null);
  const [month, setMonth] = useState(todayMonth());
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [expOpen, setExpOpen] = useState(false);
  const [exp, setExp] = useState({ date: todayISO(), kind: 'advance', amount: '', description: '' });

  const load = useCallback(async () => {
    try { setEmp(await api(`/api/employees/${id}?month=${month}`)); }
    catch (e) { showToast(e.message, 'error'); }
  }, [id, month]);
  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    setBusy(true);
    try {
      await api(`/api/employees/${id}`, { method: 'PUT', body: { ...edit, pay_rate: Number(edit.pay_rate) || 0 } });
      showToast('Employee updated');
      setEditOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`Delete ${emp.name}? Attendance and work history will be removed.`)) return;
    try {
      await api(`/api/employees/${id}`, { method: 'DELETE' });
      router.push('/people');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function addExpense() {
    setBusy(true);
    try {
      await api('/api/expenses', { method: 'POST', body: { employee_id: Number(id), ...exp, amount: Number(exp.amount) } });
      showToast(`${capitalize(exp.kind)} recorded`);
      setExpOpen(false);
      setExp({ date: todayISO(), kind: 'advance', amount: '', description: '' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function deleteExpense(xid) {
    await api(`/api/expenses/${xid}`, { method: 'DELETE' });
    load();
  }

  if (!emp) return <div className="container py-10 text-muted-foreground">Loading…</div>;

  const present = emp.attendance.filter(a => a.status === 'present').length + 0.5 * emp.attendance.filter(a => a.status === 'half').length;
  const absent = emp.attendance.filter(a => a.status === 'absent').length;
  const hours = emp.workLogs.reduce((sum, w) => {
    if (!w.start_time || !w.end_time) return sum;
    const [sh, sm] = w.start_time.split(':').map(Number);
    const [eh, em] = w.end_time.split(':').map(Number);
    return sum + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  }, 0);
  const ratings = emp.workLogs.filter(w => w.rating);
  const avgRating = ratings.length ? (ratings.reduce((s, w) => s + w.rating, 0) / ratings.length).toFixed(1) : null;

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link href="/people"><ArrowLeftIcon /></Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="page-title truncate">{emp.name}</h1>
            {!emp.active && <Badge variant="outline">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {emp.profession || 'No profession'} · {emp.pay_type === 'daily' ? `₹${emp.pay_rate}/day` : `₹${emp.pay_rate}/month`}
            {emp.phone && ` · ${emp.phone}`} · joined {formatDate(emp.joined_at)}
          </p>
        </div>
        <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (o) setEdit({ name: emp.name, profession: emp.profession || '', phone: emp.phone || '', pay_type: emp.pay_type, pay_rate: emp.pay_rate, active: !!emp.active, joined_at: emp.joined_at || '' }); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><PencilIcon data-icon="inline-start" />Edit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit employee</DialogTitle></DialogHeader>
            {edit && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Name</Label>
                    <Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Profession</Label>
                    <Input value={edit.profession} onChange={e => setEdit({ ...edit, profession: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Pay type</Label>
                    <Select value={edit.pay_type} onValueChange={v => setEdit({ ...edit, pay_type: v })}>
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
                    <Label>{edit.pay_type === 'daily' ? 'Rate per day (₹)' : 'Salary per month (₹)'}</Label>
                    <Input type="number" min="0" value={edit.pay_rate} onChange={e => setEdit({ ...edit, pay_rate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Phone</Label>
                    <Input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Status</Label>
                    <Select value={edit.active ? 'active' : 'inactive'} onValueChange={v => setEdit({ ...edit, active: v === 'active' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive (left)</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" className="text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={remove}><TrashIcon data-icon="inline-start" />Delete</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{present} days present</Badge>
          <Badge variant="outline">{absent} absent</Badge>
          <Badge variant="outline">{hours.toFixed(1)} h logged</Badge>
          {avgRating && <Badge variant="outline">★ {avgRating} avg</Badge>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Work this month</CardTitle></CardHeader>
          <CardContent>
            {emp.workLogs.length === 0 && <StickyNote className="my-6">No work logged in {month}.</StickyNote>}
            {emp.workLogs.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Work done</TableHead>
                    <TableHead className="text-right">★</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.workLogs.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(w.date)}</TableCell>
                      <TableCell>
                        {w.order_id
                          ? <Link href={`/orders/${w.order_id}`} className="text-primary hover:underline">{w.order_item}</Link>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {w.start_time && w.end_time ? `${w.start_time}–${w.end_time}` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{w.description || '—'}</TableCell>
                      <TableCell className="text-right">
                        {w.rating ? (
                          <span className="inline-flex items-center gap-0.5 text-sm">
                            {w.rating}<StarIcon className="size-3.5 fill-current text-amber-500" />
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Expenses & advances</CardTitle>
              <Dialog open={expOpen} onOpenChange={setExpOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><PlusIcon data-icon="inline-start" />Add</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record expense / advance</DialogTitle></DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <Label>Type</Label>
                        <Select value={exp.kind} onValueChange={v => setExp({ ...exp, kind: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="advance">Advance (deducted from pay)</SelectItem>
                              <SelectItem value="expense">Expense (company cost)</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Date</Label>
                        <DateInput value={exp.date} onChange={v => setExp({ ...exp, date: v })} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Amount (₹)</Label>
                      <Input type="number" min="0" value={exp.amount} onChange={e => setExp({ ...exp, amount: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Description</Label>
                      <Input placeholder="e.g. tool purchase, festival advance" value={exp.description} onChange={e => setExp({ ...exp, description: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setExpOpen(false)}>Cancel</Button>
                    <Button onClick={addExpense} disabled={busy || !exp.amount}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {emp.expenses.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded.</p>}
              {emp.expenses.map(x => (
                <div key={x.id} className="group flex items-center gap-2 text-sm">
                  <Badge variant={x.kind === 'advance' ? 'destructive' : 'outline'}>{capitalize(x.kind)}</Badge>
                  <span className="font-medium">₹{x.amount.toLocaleString('en-IN')}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{x.description || ''}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(x.date)}</span>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => deleteExpense(x.id)} aria-label="Delete">
                    <TrashIcon />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {emp.payments.length === 0 && <p className="text-sm text-muted-foreground">No payroll payments recorded.</p>}
              {emp.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{p.period}</span>
                  <span>₹{p.net.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(p.paid_on)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
