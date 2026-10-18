'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SunIcon, MoonIcon, SettingsIcon, LogOutIcon, LayoutDashboardIcon,
  UsersIcon, FolderKanbanIcon, ArmchairIcon, HardHatIcon, TruckIcon, WalletIcon, KeyRoundIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, showToast } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { BRAND } from '@/lib/brand';
import { UserAvatar } from '@/components/user-avatar';
import { toISODate } from '@/lib/date';

// Grouped the way the business is: the studio's side, the workshop's side, then money.
// The desktop bar draws a divider where `group` changes.
const LINKS = [
  { href: '/', label: 'Home', icon: LayoutDashboardIcon, group: 'home' },
  { href: '/clients', label: 'Clients', icon: UsersIcon, group: 'studio' },
  { href: '/projects', label: 'Projects', icon: FolderKanbanIcon, group: 'studio' },
  { href: '/orders', label: 'Orders', icon: ArmchairIcon, group: 'workshop' },
  { href: '/people', label: 'People', icon: HardHatIcon, group: 'workshop' },
  { href: '/vendors', label: 'Vendors', icon: TruckIcon, group: 'workshop' },
  { href: '/finance', label: 'Finance', icon: WalletIcon, group: 'money' },
];

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', manager: 'Manager', user: 'Staff' };

export default function Nav({ user }) {
  const pathname = usePathname();
  const links = LINKS;
  const router = useRouter();
  const [theme, setTheme] = useState('light');
  const [pwOpen, setPwOpen] = useState(false);
  const [due, setDue] = useState(null);
  const [today, setToday] = useState(null);

  // Open tasks due today or overdue for this login, shown next to the date. Refreshes on navigation
  // and whenever a task is added, ticked or moved (lib/client.js fires tasks-changed).
  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setToday(now);
      api(`/api/tasks?who=mine&today=${toISODate(now)}`).then(r => setDue(r.length)).catch(() => {});
    };
    refresh();
    window.addEventListener('tasks-changed', refresh);
    return () => window.removeEventListener('tasks-changed', refresh);
  }, [pathname]);

  const isActive = l => (l.href === '/' ? pathname === '/' : pathname.startsWith(l.href));

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* Top bar: a tinted strip with folder tabs; the active tab is cut from the page below. */}
      <header className="sticky top-0 z-40 border-b bg-secondary/80 backdrop-blur supports-[backdrop-filter]:bg-secondary/65">
        <div className="container flex h-14 items-center gap-4">
          <Link href="/" className="flex items-baseline gap-1.5" aria-label={`${BRAND.app} home`}>
            <span className="font-hand text-2xl leading-none text-foreground">{BRAND.word.charAt(0) + BRAND.word.slice(1).toLowerCase()}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">Ops</span>
          </Link>

          {/* Desktop tabs */}
          <nav className="ml-2 hidden h-full items-end gap-0.5 md:flex">
            {links.map((l, i) => (
              <div key={l.href} className="flex h-full items-end">
                {i > 0 && links[i - 1].group !== l.group && <span aria-hidden className="mx-2 mb-3 h-4 w-px bg-border" />}
                <Link href={l.href}
                  aria-current={isActive(l) ? 'page' : undefined}
                  className={cn('-mb-px rounded-t-lg border border-transparent px-3 pb-2 pt-1.5 text-sm font-medium transition-colors',
                    isActive(l)
                      ? 'border-border border-b-background bg-background text-foreground'
                      : 'text-muted-foreground hover:text-foreground')}>
                  {l.label}
                </Link>
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {today && (
              <Link href="/" className="hidden items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:flex">
                <span className="figures">{today.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                {due > 0 && <span className="figures rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">{due} due</span>}
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <UserAvatar user={user} size="size-8" className="ring-2 ring-background" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user?.display_name || user?.username}</div>
                  <div className="text-xs text-muted-foreground">@{user?.username} · {ROLE_LABELS[user?.role] || user?.role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={toggleTheme}>
                    {theme === 'dark' ? <SunIcon data-icon="inline-start" /> : <MoonIcon data-icon="inline-start" />}
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={e => { e.preventDefault(); setPwOpen(true); }}>
                    <KeyRoundIcon data-icon="inline-start" />Change password
                  </DropdownMenuItem>
                  {user?.role !== 'user' && (
                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <SettingsIcon data-icon="inline-start" />Settings
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={logout} variant="destructive">
                    <LogOutIcon data-icon="inline-start" />Logout
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {links.map(l => {
            const Icon = l.icon;
            const active = isActive(l);
            return (
              <Link key={l.href} href={l.href}
                className={cn('flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className={cn('size-5', active && 'fill-primary/10')} />
                <span className={cn('truncate', active && 'marker')}>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}

function ChangePasswordDialog({ open, onOpenChange }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setPw('');
    setConfirm('');
  }

  async function save() {
    if (pw !== confirm) return showToast('Passwords do not match', 'error');
    setBusy(true);
    try {
      await api('/api/me/password', { method: 'PUT', body: { password: pw } });
      showToast('Password changed');
      onOpenChange(false);
      reset();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input id="new-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-pw">Confirm password</Label>
            <Input id="confirm-pw" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !pw || !confirm}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
