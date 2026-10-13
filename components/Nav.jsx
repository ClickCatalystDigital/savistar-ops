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

const LINKS = [
  { href: '/', label: 'Home', icon: LayoutDashboardIcon },
  { href: '/clients', label: 'Clients', icon: UsersIcon },
  { href: '/projects', label: 'Projects', icon: FolderKanbanIcon },
  { href: '/orders', label: 'Orders', icon: ArmchairIcon },
  { href: '/people', label: 'People', icon: HardHatIcon },
  { href: '/vendors', label: 'Vendors', icon: TruckIcon },
  { href: '/finance', label: 'Finance', icon: WalletIcon },
];

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', manager: 'Manager', user: 'Staff' };

export default function Nav({ user }) {
  const pathname = usePathname();
  const links = LINKS;
  const router = useRouter();
  const [theme, setTheme] = useState('light');
  const [pwOpen, setPwOpen] = useState(false);

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
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-muted-foreground">{BRAND.word}</span><span className="text-primary">OPS</span>
            </h1>
          </Link>

          {/* Desktop tabs */}
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {links.map(l => (
              <Link key={l.href} href={l.href}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive(l) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Menu"><SettingsIcon /></Button>
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
                <span className="truncate">{l.label}</span>
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
