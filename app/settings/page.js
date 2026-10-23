'use client';

import { PageTitle } from '@/components/page-title';
import { NewButton } from '@/components/new-button';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, showToast, capitalize } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { KeyRoundIcon, UploadIcon, XIcon, CheckIcon, PaletteIcon, UsersIcon } from 'lucide-react';
import { Butterfly } from '@/components/assistant/butterfly';
import { TrashIcon } from '@heroicons/react/24/outline';
import { UserAvatar, AVATAR_FONTS, AVATAR_SWATCHES, AVATAR_PRESETS, PORTRAIT_SWATCHES } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { AssistantCard } from '@/components/assistant/assistant-card';
import { PersonaCard } from '@/components/assistant/persona-card';
import { NotesCard } from '@/components/assistant/notes-card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const EMPTY = { username: '', password: '', display_name: '', role: 'user' };

export default function SettingsPage() {
  const [users, setUsers] = useState([]);
  const [forbidden, setForbidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [pwFor, setPwFor] = useState(null);
  const [pw, setPw] = useState('');
  const [avatarFor, setAvatarFor] = useState(null);
  const [avatarColor, setAvatarColor] = useState('#3b82f6');
  const [avatarFont, setAvatarFont] = useState('sans');
  const [avatarPreset, setAvatarPreset] = useState('');
  const router = useRouter();
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [me, setMe] = useState(null);
  const [aiName, setAiName] = useState('Atelier AI');
  const [tab, setTab] = useState(null);

  // Local object URL so a newly-chosen file previews immediately, before it's uploaded.
  useEffect(() => {
    if (!avatarFile) { setAvatarPreviewUrl(null); return; }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function handleFileSelect(file) {
    if (!file) return;
    if (file.type !== 'image/webp') { showToast('Please choose a .webp file', 'error'); return; }
    setAvatarFile(file);
    setAvatarPreset(''); // an uploaded picture replaces the portrait
  }

  async function load() {
    try {
      setUsers(await api('/api/users'));
      setForbidden(false);
    } catch {
      setForbidden(true);
    }
  }
  useEffect(() => {
    load();
    api('/api/me').then(setMe).catch(() => {});
    api('/api/assistant/persona').then((d) => d.name && setAiName(d.name)).catch(() => {});
  }, []);
  // The team-wide AI setup (on My assistant) is for owners and admins; the demo hides it (its settings are not open there).
  const showAi = ['owner', 'admin'].includes(me?.role) && process.env.NEXT_PUBLIC_DEMO !== '1';

  async function save() {
    setBusy(true);
    try {
      await api('/api/users', { method: 'POST', body: form });
      showToast('User created');
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function setRole(u, role) {
    await api(`/api/users/${u.id}`, { method: 'PUT', body: { role } });
    load();
  }

  async function toggleActive(u) {
    await api(`/api/users/${u.id}`, { method: 'PUT', body: { active: !u.active } });
    load();
  }

  async function changePw() {
    setBusy(true);
    try {
      await api(`/api/users/${pwFor.id}`, { method: 'PUT', body: { password: pw } });
      showToast('Password changed');
      setPwFor(null);
      setPw('');
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  function openAvatarEditor(u) {
    setAvatarFor(u);
    setAvatarColor(u.avatar_color || '#3b82f6');
    setAvatarFont(u.avatar_font || 'sans');
    setAvatarPreset(u.avatar_preset || '');
    setAvatarFile(null);
    setCustomColorOpen(false);
  }

  async function saveAvatarSettings() {
    setAvatarBusy(true);
    try {
      await api(`/api/users/${avatarFor.id}`, { method: 'PUT', body: { avatar_color: avatarColor, avatar_font: avatarFont, avatar_preset: avatarPreset } });
      if (avatarFile) {
        const fd = new FormData();
        fd.append('file', avatarFile);
        // Raw fetch, not api() — a FormData body can't be JSON.stringify'd.
        // If lib/client.js sends auth via a header rather than cookies, add it here too.
        const res = await fetch(`/api/users/${avatarFor.id}/avatar`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Image upload failed');
        }
      }
      // A portrait replaces an uploaded picture, otherwise the picture would keep hiding it.
      if (avatarPreset && !avatarFile && avatarFor.avatar_url) {
        const res = await fetch(`/api/users/${avatarFor.id}/avatar`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('Could not remove the uploaded picture');
      }
      showToast('Avatar updated');
      setAvatarFor(null);
      load();
      router.refresh(); // the nav avatar is rendered on the server
    } catch (e) { showToast(e.message, 'error'); }
    setAvatarBusy(false);
  }

  async function removeAvatarImage() {
    setAvatarBusy(true);
    try {
      const res = await fetch(`/api/users/${avatarFor.id}/avatar`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Could not remove image');
      setAvatarFile(null);
      setAvatarFor(f => ({ ...f, avatar_image_key: null, avatar_url: null }));
      showToast('Image removed');
      load();
      router.refresh();
    } catch (e) { showToast(e.message, 'error'); }
    setAvatarBusy(false);
  }

  async function remove(u) {
    if (!confirm(`Delete user ${u.username}?`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  // Users: owners, admins, managers (the users API refuses staff). My assistant: everyone.
  const canUsers = !forbidden;

  return (
    <div className="container flex flex-col gap-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <PageTitle>Settings</PageTitle>
          <p className="text-sm text-muted-foreground">{canUsers ? 'Users, access & your assistant' : 'Your assistant'}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {canUsers && (tab ?? 'users') === 'users' && <DialogTrigger asChild><NewButton label="New user" /></DialogTrigger>}
          <DialogContent>
            <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Username</Label>
                  <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Display name</Label>
                  <Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="user">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.username.trim() || !form.password}>{busy ? 'Creating…' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab ?? (canUsers ? 'users' : 'me')} onValueChange={setTab}>
        <TabsList>
          {canUsers && <TabsTrigger value="users"><UsersIcon data-icon="inline-start" />Users</TabsTrigger>}
          <TabsTrigger value="me"><Butterfly className="size-4 text-primary" />My assistant</TabsTrigger>
        </TabsList>
        {canUsers && <TabsContent value="users" className="mt-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><UsersIcon aria-hidden strokeWidth={1.6} className="size-6 -rotate-3 text-primary/80" /> Users</CardTitle>
          <CardDescription>Staff can use every tab: on Finance they see only their own cash entries, here only My assistant. Only owners, admins and managers can delete records or manage users. Everyone can change their own password from the nav menu.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" aria-label="Avatar" />
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id} className="group">
                  <TableCell>
                    <button type="button" onClick={() => openAvatarEditor(u)} aria-label="Edit avatar"
                      className="block rounded-full transition-opacity hover:opacity-80">
                      <UserAvatar user={u} size="size-9" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{u.display_name || u.username}</span>
                    <span className="ml-2 text-xs text-muted-foreground">@{u.username}</span>
                  </TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={v => setRole(u, v)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="user">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(u)}>
                      <Badge variant={u.active ? 'secondary' : 'destructive'}>{u.active ? 'Active' : 'Deactivated'}</Badge>
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setPwFor(u)} aria-label="Change password"><KeyRoundIcon /></Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => remove(u)} aria-label="Delete user">
                      <TrashIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>}
        {/* Everything about the assistant: your voice and notes; owners and admins also set it up for the team here. */}
        <TabsContent value="me" className="mt-2 flex flex-col gap-4">
          <PersonaCard aiName={aiName} />
          {process.env.NEXT_PUBLIC_DEMO !== '1' && <NotesCard aiName={aiName} />}
          {showAi && <AssistantCard />}
        </TabsContent>
      </Tabs>

      <Dialog open={!!pwFor} onOpenChange={o => !o && setPwFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change password — {pwFor?.username}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-2">
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={e => setPw(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwFor(null)}>Cancel</Button>
            <Button onClick={changePw} disabled={busy || !pw}>Change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!avatarFor} onOpenChange={o => !o && setAvatarFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Avatar — {avatarFor?.username}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="flex justify-center">
              <UserAvatar
                user={{
                  ...avatarFor,
                  avatar_color: avatarColor,
                  avatar_font: avatarFont,
                  avatar_preset: avatarPreset,
                  avatar_url: avatarFile ? avatarPreviewUrl : (avatarPreset ? null : avatarFor?.avatar_url),
                }}
                size="size-16" textSize="text-xl" className="ring-1 ring-border" />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Portrait <span className="font-normal text-muted-foreground">(sits on the letter color)</span></Label>
              <div className="grid max-h-48 grid-cols-6 justify-items-center gap-2 overflow-y-auto rounded-xl border bg-muted/30 p-2.5">
                <button type="button" onClick={() => setAvatarPreset('')} aria-label="No portrait, show the letter"
                  className={cn('flex size-10 items-center justify-center rounded-full text-sm text-white transition-transform',
                    !avatarPreset ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'opacity-70 hover:scale-105 hover:opacity-100')}
                  style={{ backgroundColor: avatarColor }}>
                  {(avatarFor?.display_name || avatarFor?.username || '?').charAt(0).toUpperCase()}
                </button>
                {AVATAR_PRESETS.map(id => (
                  <button key={id} type="button" onClick={() => { setAvatarPreset(id); setAvatarFile(null); }} aria-label={`Portrait ${id}`}
                    className={cn('size-10 overflow-hidden rounded-full transition-transform',
                      avatarPreset === id ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-105')}
                    style={{ backgroundColor: avatarColor }}>
                    <img src={`/avatars/${id}.webp`} alt="" loading="lazy" className="block size-full" draggable={false} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{avatarPreset ? 'Background color' : 'Letter color'}</Label>
              {avatarPreset && (
                <div className="flex flex-wrap items-center gap-2">
                  {PORTRAIT_SWATCHES.map(s => (
                    <button key={s.hex} type="button" title={s.name}
                      onClick={() => { setAvatarColor(s.hex); setCustomColorOpen(false); }}
                      aria-label={`Use ${s.name}`}
                      className={cn('relative size-7 shrink-0 rounded-full transition-transform',
                        s.light && 'ring-1 ring-inset ring-black/10',
                        avatarColor === s.hex ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-110')}
                      style={{ backgroundColor: s.hex }}>
                      {avatarColor === s.hex && <CheckIcon className={cn('absolute inset-0 m-auto size-3.5', s.light ? 'text-neutral-800' : 'text-white')} strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {AVATAR_SWATCHES.map(hex => (
                  <button key={hex} type="button"
                    onClick={() => { setAvatarColor(hex); setCustomColorOpen(false); }}
                    aria-label={`Use color ${hex}`}
                    className={cn('relative size-7 shrink-0 rounded-full transition-transform',
                      avatarColor === hex ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-110')}
                    style={{ backgroundColor: hex }}>
                    {avatarColor === hex && <CheckIcon className="absolute inset-0 m-auto size-3.5 text-white" strokeWidth={3} />}
                  </button>
                ))}
                <button type="button" onClick={() => setCustomColorOpen(v => !v)}
                  aria-label="Choose a custom color"
                  className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-foreground hover:text-foreground',
                    customColorOpen && 'border-foreground text-foreground')}>
                  <PaletteIcon className="size-3.5" />
                </button>
              </div>
              {customColorOpen && (
                <input type="color" value={avatarColor} onChange={e => setAvatarColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-md border" />
              )}
            </div>

            {!avatarPreset && <div className="flex flex-col gap-2">
              <Label>Letter font</Label>
              <div className="flex gap-2">
                {AVATAR_FONTS.map(f => (
                  <button key={f.value} type="button" onClick={() => setAvatarFont(f.value)}
                    className={cn('flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-xs transition-colors',
                      avatarFont === f.value ? 'border-foreground bg-muted' : 'border-border text-muted-foreground hover:bg-muted/50')}>
                    <span className={cn('text-lg leading-none text-foreground', f.className)}>Aa</span>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>}

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2">
              <Label>Custom image <span className="font-normal text-muted-foreground">(.webp, replaces the portrait)</span></Label>
              <label
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={e => { e.preventDefault(); setDragActive(false); handleFileSelect(e.dataTransfer.files?.[0]); }}
                className={cn('flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors',
                  dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/40 hover:bg-muted/40')}>
                <UploadIcon className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Click to upload</span> or drag a .webp file
                </span>
                <input type="file" accept="image/webp" className="sr-only"
                  onChange={e => handleFileSelect(e.target.files?.[0])} />
              </label>

              {avatarFile && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                  <span className="truncate text-foreground">{avatarFile.name}</span>
                  <button type="button" onClick={() => setAvatarFile(null)} aria-label="Remove selected file"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              )}
              {!avatarFile && !avatarPreset && avatarFor?.avatar_url && (
                <Button variant="outline" size="sm" onClick={removeAvatarImage} disabled={avatarBusy} className="w-fit">
                  Remove current image
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvatarFor(null)}>Cancel</Button>
            <Button onClick={saveAvatarSettings} disabled={avatarBusy}>{avatarBusy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
