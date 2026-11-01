'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { api, showToast, formatDate } from '@/lib/client';
import { toISODate } from '@/lib/date';
import { cn } from '@/lib/utils';
import quotes from '@/lib/quotes.json';
import { fetchWeather, weatherByDate, describeWeatherCode } from '@/lib/weather';
import { getWeatherIconSrc } from '@/lib/weatherIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, FolderKanbanIcon, MapPinIcon, ArmchairIcon, ListTodoIcon, Trash2Icon, CalendarIcon, UserIcon, SunIcon, CloudSunIcon, CloudIcon, CloudFogIcon, CloudDrizzleIcon, CloudRainIcon, CloudRainWindIcon, CloudSnowIcon, CloudLightningIcon } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { Architects_Daughter, Fira_Code } from 'next/font/google';
import { LOCALE } from '@/lib/market';

// Three-tier type system: Architects Daughter is chrome-only (labels, titles, the
// greeting) — never for content someone has to actually read. Georgia carries real
// data (task/milestone/visit text, notes, dropdown items) since it was designed to
// stay legible at small screen sizes, unlike a single-weight handwriting font.
// Fira Code's monospaced digits keep day numbers and due dates unambiguous.
const architectsDaughter = Architects_Daughter({ weight: '400', subsets: ['latin'], display: 'swap' });
const firaCode = Fira_Code({ weight: '500', subsets: ['latin'], display: 'swap' });
const GEORGIA_STYLE = { fontFamily: 'Georgia, "Times New Roman", serif' };

const fmtISO = toISODate;

// Default mirrors Tailwind's `lg` breakpoint (1024px) — the same width where the two-column
// desktop layout collapses to a single stacked column. A few pieces of state (not just
// CSS) need to know which side of that line they're on, e.g. how many event pills to
// show per day cell. Also called with a narrower query for the phone-only agenda layouts.
function useIsMobile(query = '(max-width: 1023px)') {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return isMobile;
}

// Shared between the year-view dot indicators and the legend below the calendar — keep colors in sync.
const EVENT_KIND_ORDER = ['task', 'milestone', 'visit', 'order'];
// const EVENT_KIND_DOT = {
//   task: 'bg-primary',
//   milestone: 'bg-amber-500',
//   visit: 'bg-teal-500',
//   order: 'bg-violet-500',
// };
// // Lighter fills for the year-view day bubbles.
// const EVENT_KIND_LIGHT = {
//   task: 'bg-primary/35',
//   milestone: 'bg-amber-500/35',
//   visit: 'bg-teal-500/35',
//   order: 'bg-violet-500/35',
// };


const EVENT_KIND_DOT = {
  task: 'bg-primary',
  milestone: 'bg-milestone',
  visit: 'bg-visit',
  order: 'bg-order',
};
// Lighter fills for the year-view day bubbles.
const EVENT_KIND_LIGHT = {
  task: 'bg-primary/35',
  milestone: 'bg-milestone/35',
  visit: 'bg-visit/35',
  order: 'bg-order/35',
};

// Maps the string icon name in WEATHER_CODES (lib/weather.js) to an actual component —
// kept here rather than in that file so weather.js stays framework-free.
const WEATHER_ICONS = {
  Sun: SunIcon,
  CloudSun: CloudSunIcon,
  Cloud: CloudIcon,
  CloudFog: CloudFogIcon,
  CloudDrizzle: CloudDrizzleIcon,
  CloudRain: CloudRainIcon,
  CloudRainWind: CloudRainWindIcon,
  CloudSnow: CloudSnowIcon,
  CloudLightning: CloudLightningIcon,
};

// Warm, faintly grained surface shared by both dashboard cards. Two dot layers at
// different scales/offsets avoid an obvious repeating grid; the shadow lifts it
// off the page like a sheet resting on the surface below.
// const PAPER_STYLE = {
//   backgroundColor: '#faf7f1',
//   backgroundImage: `
//     radial-gradient(ellipse at center, transparent 68%, rgba(0,0,0,0.015) 100%),
//     radial-gradient(circle at 24% 18%, rgba(255,255,255,0.16) 0%, transparent 38%),
//     radial-gradient(circle at 78% 82%, rgba(0,0,0,0.010) 0%, transparent 42%),
//     radial-gradient(rgba(90,75,40,0.024) 0.55px, transparent 0.65px),
//     radial-gradient(rgba(255,255,255,0.10) 0.5px, transparent 0.6px),
//     linear-gradient(180deg, #fcfaf6 0%, #f8f5ee 100%)
//   `,
//   backgroundSize: `
//     100% 100%,
//     100% 100%,
//     100% 100%,
//     5px 5px,
//     9px 9px,
//     100% 100%
//   `,
//   backgroundPosition: `
//     center,
//     center,
//     center,
//     0 0,
//     2px 3px,
//     center
//   `,
//   border: '1px solid rgba(120,100,70,0.08)',
//   boxShadow: `
//     inset 0 1px 0 rgba(255,255,255,.82),
//     inset 0 -1px 0 rgba(0,0,0,.025),
//     0 3px 8px rgba(0,0,0,.05),
//     0 20px 40px -20px rgba(0,0,0,.20)
//   `,
// };



// Vintage spiral-bound rings — pure SVG, so no external image asset is needed.
function RingArt() {
  return (
    <>
      {/* the loop — stops right at the hole, implying it continues behind, unseen */}
      <path d="M3.5 15 C3.5 5 5.5 2 8 2 C10.5 2 12.5 5 12.5 15"
        fill="none" stroke="#1f2937" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5 14.5 C5 6.5 6.3 4 8 4 C9.7 4 11 6.5 11 14.5"
        fill="none" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      {/* punched hole in the card where the wire disappears */}
      <ellipse cx="8" cy="16.3" rx="4.4" ry="2.3" fill="#0f172a" fillOpacity="0.7" />
      <ellipse cx="8" cy="15.6" rx="4.4" ry="1.6" fill="#0f172a" fillOpacity="0.3" />
    </>
  );
}

// Same ring, rotated 90° for a left-edge (vertical) mount — coordinates are the
// original RingArt points with x/y swapped, so the loop hangs left instead of down
// and the punched hole sits on the right, over the card's left edge.
function RingArtVertical() {
  return (
    <>
      <path d="M15 3.5 C5 3.5 2 5.5 2 8 C2 10.5 5 12.5 15 12.5"
        fill="none" stroke="#1f2937" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14.5 5 C6.5 5 4 6.3 4 8 C4 9.7 6.5 11 14.5 11"
        fill="none" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="16.3" cy="8" rx="2.3" ry="4.4" fill="#0f172a" fillOpacity="0.7" />
      <ellipse cx="15.6" cy="8" rx="1.6" ry="4.4" fill="#0f172a" fillOpacity="0.3" />
    </>
  );
}

// width: the mounting wrapper's live pixel width (tracked via ResizeObserver by the
// caller) — caps the ring count so they don't crowd together on narrow (mobile) widths,
// while still landing on 16 at typical desktop widths, same as the old fixed count.
function SpiralRings({ width = 0 }) {
  const MIN_PITCH = 24; // ring width (16px) + a comfortable minimum gap
  const count = width ? Math.max(4, Math.min(16, Math.floor((width - 32) / MIN_PITCH))) : 16;
  const rings = Array.from({ length: count });
  return (
    <>
      {/* full ring, behind the card — the card's own background hides this everywhere
          except the two slivers redrawn on top of it below */}
      <div className="pointer-events-none absolute inset-x-4 top-0 z-10 flex -translate-y-2 justify-between opacity-60" aria-hidden="true">
        {rings.map((_, i) => (
          <svg key={i} width="16" height="22" viewBox="0 0 16 22" className="shrink-0 drop-shadow-sm">
            <RingArt />
          </svg>
        ))}
      </div>
      {/* sliver 1: the loop, redrawn in front, but only down to the card's top edge */}
      <div className="pointer-events-none absolute inset-x-4 top-0 z-40 flex -translate-y-2 justify-between opacity-60" aria-hidden="true">
        {rings.map((_, i) => (
          <svg key={i} width="16" height="22" viewBox="0 0 16 22" className="shrink-0 drop-shadow-sm"
            style={{ clipPath: 'inset(0 0 64% 0)' }}>
            <RingArt />
          </svg>
        ))}
      </div>
      {/* sliver 2: the punched hole, redrawn in front again, a few px inside the card
          — this is the piece the previous clip was accidentally cutting off */}
      <div className="pointer-events-none absolute inset-x-4 top-0 z-40 flex -translate-y-2 justify-between opacity-60" aria-hidden="true">
        {rings.map((_, i) => (
          <svg key={i} width="16" height="22" viewBox="0 0 16 22" className="shrink-0 drop-shadow-sm"
            style={{ clipPath: 'inset(59% 0 0 0)' }}>
            <RingArt />
          </svg>
        ))}
      </div>
    </>
  );
}

// Left-edge mount for a portrait card (Tasks) — same three-layer trick as SpiralRings,
// rotated: rings stack down the left edge instead of across the top, and the clip-paths
// crop left/right instead of top/bottom.
// height: the mounting wrapper's live pixel height (tracked via ResizeObserver by the
// caller) — rings are generated to fill it edge-to-edge instead of a fixed guessed count.
function SpiralRingsVertical({ height = 0 }) {
  const RING_SPACING = 20; // svg height (16px) + gap-1 (4px)
  const TOP_OFFSET = 16; // matches the wrapper's top-4
  const count = Math.max(1, Math.floor((height - TOP_OFFSET) / RING_SPACING));
  const rings = Array.from({ length: count });
  return (
    <>
      <div className="pointer-events-none absolute left-0 top-4 z-10 flex -translate-x-2 flex-col gap-1 opacity-60" aria-hidden="true">
        {rings.map((_, i) => (
          <svg key={i} width="22" height="16" viewBox="0 0 22 16" className="shrink-0 drop-shadow-sm">
            <RingArtVertical />
          </svg>
        ))}
      </div>
      <div className="pointer-events-none absolute left-0 top-4 z-40 flex -translate-x-2 flex-col gap-1 opacity-60" aria-hidden="true">
        {rings.map((_, i) => (
          <svg key={i} width="22" height="16" viewBox="0 0 22 16" className="shrink-0 drop-shadow-sm"
            style={{ clipPath: 'inset(0 64% 0 0)' }}>
            <RingArtVertical />
          </svg>
        ))}
      </div>
      <div className="pointer-events-none absolute left-0 top-4 z-40 flex -translate-x-2 flex-col gap-1 opacity-60" aria-hidden="true">
        {rings.map((_, i) => (
          <svg key={i} width="22" height="16" viewBox="0 0 22 16" className="shrink-0 drop-shadow-sm"
            style={{ clipPath: 'inset(0 0 0 59%)' }}>
            <RingArtVertical />
          </svg>
        ))}
      </div>
    </>
  );
}

function DaySection({ label, icon, onAdd, addColorClass = 'bg-muted-foreground/40 hover:bg-muted-foreground/70', count, children }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className={cn(architectsDaughter.className, 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground')}>
          {icon}
          {label}
        </div>
        {onAdd && (
          <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`}
            className={cn('size-6 rounded-full text-white/75 transition-colors hover:text-white', addColorClass)}>
            <PlusIcon className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {count === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nothing due</p>}
        {children}
      </div>
    </div>
  );
}

function QuickAddRow({ placeholder, onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-1.5 pt-1">
      <Input autoFocus placeholder={placeholder} value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) { onSubmit(value.trim()); setValue(''); } }}
        className="h-8 flex-1 text-sm" />
      <Button size="icon-sm" className="size-8 shrink-0" disabled={!value.trim()}
        onClick={() => { onSubmit(value.trim()); setValue(''); }}>
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
}

// NOTE: assumes shadcn's Calendar component (react-day-picker) is already set up at
// @/components/ui/calendar — this is the standard shadcn "Date Picker" pattern.
// Icon-only: the date defaults to today so there's nothing to show most of the time;
// a small dot appears once a non-default date is picked, and the full date is in the title tooltip.
function DueDatePicker({ value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const isDefault = value === fmtISO(new Date());
  const shortLabel = selected ? `${selected.getDate()}/${selected.getMonth() + 1}` : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon"
          title={value ? format(selected, 'PPP') : 'Pick a date'}
          className={cn('relative size-9 shrink-0 rounded-full',
            !isDefault && 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
            className)}>
          {!isDefault ? (
            <span className={cn(firaCode.className, 'text-[11px] font-semibold leading-none tabular-nums')}>{shortLabel}</span>
          ) : (
            <CalendarIcon className="size-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" style={GEORGIA_STYLE} align="start">
        <Calendar mode="single" selected={selected}
          onSelect={d => { if (d) { onChange(fmtISO(d)); setOpen(false); } }} />
      </PopoverContent>
    </Popover>
  );
}

// Round icon button + a tiny popover list, mirroring DueDatePicker's icon-only, dot-when-set pattern.
function AssignPicker({ users, value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const assigned = users.find(u => u.username === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon"
          title={assigned ? `Assigned to ${assigned.display_name || assigned.username}` : 'Assign to…'}
          className={cn('relative size-9 shrink-0 overflow-hidden rounded-full p-0', className)}>
          {assigned ? <UserAvatar user={assigned} size="size-9" /> : <UserIcon className="size-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" style={GEORGIA_STYLE} align="start">
        <button type="button" onClick={() => { onChange(''); setOpen(false); }}
          className={cn('flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', !value && 'font-medium text-primary')}>
          Unassigned
        </button>
        {users.map(u => (
          <button key={u.id} type="button" onClick={() => { onChange(u.username); setOpen(false); }}
            className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', value === u.username && 'font-medium text-primary')}>
            <UserAvatar user={u} size="size-5" textSize="text-[10px]" />
            {u.display_name || u.username}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function WeatherBadge({ info }) {
  const { label, icon } = describeWeatherCode(info.code);
  const Icon = WEATHER_ICONS[icon] || CloudIcon;
  const hi = Math.round(info.tempMax);
  const lo = Math.round(info.tempMin);
  return (
    <div title={`${label} · ${hi}°/${lo}°`}
      className="flex shrink-0 items-center gap-1 text-info/30">
      <Icon className="size-3 lg:size-4" />
      <span className={cn(firaCode.className, 'text-[10px] font-medium leading-none lg:text-xs')}>{hi}°</span>
    </div>
  );
}

// NOTE: /api/projects is a guess (list of { id, name }). Confirm the real route/shape.
let projectsCache = null;   // resolved list, shared across every mount
let projectsPromise = null; // in-flight request, so parallel mounts share one fetch

function useProjectOptions() {
  const [projects, setProjects] = useState(projectsCache); // null = loading, [] = failed/empty
  useEffect(() => {
    if (projectsCache) return; // already have it
    projectsPromise ||= api('/api/projects').catch(() => []);
    projectsPromise.then(result => {
      projectsCache = result;
      setProjects(result);
    });
  }, []);
  return projects;
}

function MilestoneQuickAdd({ date, onDone }) {
  const projects = useProjectOptions();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !projectId) return;
    setSaving(true);
    try {
      await api('/api/milestones', { method: 'POST', body: { project_id: projectId, title: title.trim(), due_date: date } });
      onDone();
    } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {projects === null ? (
        <p className="px-2 text-xs text-muted-foreground">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="px-2 text-xs text-destructive">Couldn't load projects — check the projects API.</p>
      ) : (
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Project…" /></SelectTrigger>
          <SelectContent style={GEORGIA_STYLE}>
            <SelectGroup>{projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectGroup>
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-1.5">
        <Input autoFocus placeholder="Milestone title…" value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} className="h-8 flex-1 text-sm" />
        <Button size="icon-sm" className="size-8 shrink-0" disabled={!title.trim() || !projectId || saving} onClick={submit}>
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function VisitQuickAdd({ date, onDone }) {
  const projects = useProjectOptions();
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!projectId) return;
    setSaving(true);
    try {
      await api('/api/site-visits', { method: 'POST', body: { project_id: projectId, visit_date: date, notes: notes.trim() || undefined } });
      onDone();
    } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {projects === null ? (
        <p className="px-2 text-xs text-muted-foreground">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="px-2 text-xs text-destructive">Couldn't load projects — check the projects API.</p>
      ) : (
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Project…" /></SelectTrigger>
          <SelectContent style={GEORGIA_STYLE}>
            <SelectGroup>{projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectGroup>
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-1.5">
        <Input autoFocus placeholder="Notes (optional)…" value={notes} onChange={e => setNotes(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} className="h-8 flex-1 text-sm" />
        <Button size="icon-sm" className="size-8 shrink-0" disabled={!projectId || saving} onClick={submit}>
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Time-of-day greeting for the Tasks card — recomputed every minute so it stays
// correct if the tab is left open across a boundary (e.g. noon, midnight).
function getGreeting(hour) {
  if (hour < 5) return 'Burning the midnight oil';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Working late';
}

// Same quote all day for everyone, rolls over at midnight. Hashing the ISO date
// (rather than day-of-year % length) means the order won't repeat identically
// every year as you add more quotes to the file.
function getQuoteOfTheDay(date) {
  const iso = fmtISO(date);
  let hash = 0;
  for (let i = 0; i < iso.length; i++) {
    hash = (hash * 31 + iso.charCodeAt(i)) | 0;
  }
  return quotes[Math.abs(hash) % quotes.length];
}

export default function Dashboard() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [events, setEvents] = useState({ tasks: [], milestones: [], visits: [], orders: [] });
  const [todayTasks, setTodayTasks] = useState([]);
  const [newTask, setNewTask] = useState({ title: '', due_date: fmtISO(new Date()), assigned_to: '' });
  const [dayOpen, setDayOpen] = useState(null); // ISO date whose details are open
  const [me, setMe] = useState(null);
  const [assignableUsers, setAssignableUsers] = useState([]);
  // 'mine' | 'all' — owners/admins default to their own plate. Staff are server-side
  // restricted to their own tasks either way, so they never see the switch.
  const [taskScope, setTaskScope] = useState('mine');
  const [filterUser, setFilterUser] = useState(''); // username to filter by; only meaningful when taskScope === 'all'
  const canAssign = me && me.role !== 'user';

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'year'
  const [dragOverDate, setDragOverDate] = useState(null);
  const [quickAdd, setQuickAdd] = useState(null); // { iso, kind: 'task'|'milestone'|'visit' } | null — which add-form is open, and for which day (the phone week agenda can have several days' agendas on screen at once, so this must be scoped per day, not global)
  const [editingId, setEditingId] = useState(null); // id of the item currently being renamed inline
  const [editValue, setEditValue] = useState('');
  const [greeting, setGreeting] = useState(null); // null until mounted — avoids SSR/client clock hydration mismatch
  const [quote, setQuote] = useState(null); // same lifecycle as greeting — see effect below
  const [coords, setCoords] = useState(null); // { lat, lon } from the browser, once granted
  const [locationStatus, setLocationStatus] = useState('pending'); // 'pending' | 'granted' | 'denied' | 'unsupported'
  const [weather, setWeather] = useState(null); // raw Open-Meteo response
  const draggedTaskRef = useRef(null);
  const taskCardWrapRef = useRef(null);
  const [taskCardHeight, setTaskCardHeight] = useState(0);
  const calendarWrapRef = useRef(null);
  const [calendarWidth, setCalendarWidth] = useState(0);
  const isMobile = useIsMobile();                       // ≤1023 — still only feeds visibleCount below
  const isPhone = useIsMobile('(max-width: 639.98px)');  // <sm — the stacked week agenda / compact month grid

  // Keep the vertical ring count in sync with the Tasks card's real height, so rings
  // stay covered edge-to-edge as tasks are added/removed and the card grows/shrinks.
  useEffect(() => {
    const el = taskCardWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setTaskCardHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Same idea for the horizontal rings on the calendar — measuring real width means the
  // ring count self-adjusts on narrow (mobile) screens instead of assuming desktop width.
  useEffect(() => {
    const el = calendarWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setCalendarWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    api('/api/me').then(setMe).catch(() => {});
  }, []);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setGreeting(getGreeting(now.getHours()));
      setQuote(getQuoteOfTheDay(now));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (canAssign) api('/api/users/assignable').then(setAssignableUsers).catch(() => {});
  }, [canAssign]);

  // new — ask the browser for a location fix once on mount
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) { setLocationStatus('unsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setLocationStatus('granted'); },
      () => setLocationStatus('denied'),
      { maximumAge: 30 * 60_000 } // a fix up to 30 min old is fine for weather purposes
    );
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  // new — fetch weather once coords exist, then refresh hourly, as requested
  const loadWeather = useCallback(async () => {
    if (!coords) return;
    try { setWeather(await fetchWeather(coords.lat, coords.lon)); }
    catch (e) { console.error('Weather fetch failed', e); }
  }, [coords]);

  useEffect(() => { loadWeather(); }, [loadWeather]);
  useEffect(() => {
    const id = setInterval(loadWeather, 60 * 60_000); // hourly
    return () => clearInterval(id);
  }, [loadWeather]);

  // Grid range: full weeks for month view (Monday start), single week for week view.
  const gridDays = useMemo(() => {
    const days = [];
    if (viewMode === 'week') {
      const start = new Date(cursor);
      start.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
      const d = new Date(start);
      for (let i = 0; i < 7; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
      return days;
    }
    if (viewMode === 'year') {
      const d = new Date(cursor.getFullYear(), 0, 1);
      const end = new Date(cursor.getFullYear(), 11, 31);
      while (d <= end) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
      return days;
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const d = new Date(start);
    for (let i = 0; i < 42; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
  }, [cursor, viewMode]);

  function navigateCursor(dir) {
    setCursor(prev => {
      if (viewMode === 'week') { const d = new Date(prev); d.setDate(d.getDate() + dir * 7); return d; }
      if (viewMode === 'year') return new Date(prev.getFullYear() + dir, 0, 1);
      return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
    });
  }

  // Jumping straight to `new Date()` works for all three modes: month/year only read
  // getMonth()/getFullYear() off cursor, and week mode derives its start from cursor's weekday.
  function goToToday() {
    setCursor(new Date());
  }

  const loadCalendar = useCallback(async () => {
    const from = fmtISO(gridDays[0]);
    const to = fmtISO(gridDays[gridDays.length - 1]);
    setLoading(true);
    try {
      setEvents(await api(`/api/calendar?from=${from}&to=${to}&who=${taskScope}`));
    } finally {
      setLoading(false);
    }
  }, [gridDays, taskScope]);

  // The API's ?who= only supports mine|all — there's no per-user filter param — so when
  // taskScope is 'all' we fetch everyone's tasks and narrow to filterUser client-side below.
  const loadToday = useCallback(async () => {
    setTodayTasks(await api(`/api/tasks?scope=today&who=${taskScope}&today=${fmtISO(new Date())}`));
  }, [taskScope]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);
  useEffect(() => { loadToday(); }, [loadToday]);

  const weatherDaily = useMemo(() => weatherByDate(weather), [weather]);
  const currentWeather = useMemo(() => {
    if (!weather?.current) return null;
    return { temp: weather.current.temperature_2m, code: weather.current.weathercode, ...describeWeatherCode(weather.current.weathercode) };
  }, [weather]);

  const byDate = useMemo(() => {
    const map = {};
    const add = (date, item) => { if (date) (map[date] ||= []).push(item); };
    // API's ?who= only supports mine|all, same as loadToday — narrow to filterUser client-side.
    const visibleCalendarTasks = taskScope === 'all' && filterUser
      ? events.tasks.filter(t => t.assigned_to === filterUser)
      : events.tasks;
    for (const t of visibleCalendarTasks) add(t.date, { ...t, kind: 'task' });
    for (const m of events.milestones) add(m.date, { ...m, kind: 'milestone' });
    for (const v of events.visits) add(v.date, { ...v, kind: 'visit', title: `Site visit · ${v.project_name}` });
    for (const o of events.orders) add(o.date, { ...o, kind: 'order', title: `${o.item} × ${o.qty} due` });
    return map;
  }, [events, taskScope, filterUser]);

  async function addTask() {
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: { title: newTask.title, due_date: newTask.due_date, assigned_to: newTask.assigned_to || undefined },
      });
      setNewTask({ title: '', due_date: fmtISO(new Date()), assigned_to: '' });
      loadCalendar();
      loadToday();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function toggleTask(t) {
    await api(`/api/tasks/${t.id}`, { method: 'PUT', body: { status: t.status === 'done' ? 'open' : 'done' } });
    loadCalendar();
    loadToday();
  }

  // NOTE: assumes DELETE /api/tasks/:id, /api/milestones/:id, /api/site-visits/:id exist. Confirm the real routes.
  async function saveEdit(it) {
    const value = editValue.trim();
    setEditingId(null);
    const original = it.kind === 'visit' ? (it.notes || '') : it.title;
    if (value === original) return;
    if (it.kind !== 'visit' && !value) return; // task/milestone titles can't be blank
    const endpoint = it.kind === 'task' ? `/api/tasks/${it.id}`
      : it.kind === 'milestone' ? `/api/milestones/${it.id}`
      : `/api/site-visits/${it.id}`;
    const body = it.kind === 'visit' ? { notes: value || undefined } : { title: value };
    try {
      await api(endpoint, { method: 'PUT', body });
      loadCalendar(); loadToday();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function deleteEvent(kind, id) {
    const endpoint = kind === 'task' ? `/api/tasks/${id}`
      : kind === 'milestone' ? `/api/milestones/${id}`
      : `/api/site-visits/${id}`;
    try {
      await api(endpoint, { method: 'DELETE' });
      loadCalendar(); loadToday();
    } catch (e) { showToast(e.message, 'error'); }
  }

  const todayISO = fmtISO(new Date());
  const visibleTasks = taskScope === 'all' && filterUser
    ? todayTasks.filter(t => t.assigned_to === filterUser)
    : todayTasks;
  const monthLabel = viewMode === 'week'
    ? (() => {
        const start = gridDays[0];
        const end = gridDays[gridDays.length - 1];
        const sameMonth = start.getMonth() === end.getMonth();
        const startStr = start.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
        const endStr = end.toLocaleDateString(LOCALE, sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
        return `${startStr} – ${endStr}`;
      })()
    : cursor.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  const visibleCount = viewMode === 'week' ? (isMobile ? 4 : 12) : (isMobile ? 1 : 3);
  const cellMinH = viewMode === 'week' ? 'h-64 lg:h-[calc(100vh-22rem)] lg:min-h-48' : 'min-h-24';
  const phoneWeek = isPhone && viewMode === 'week';
  const phoneMonth = isPhone && viewMode === 'month';
  // Phone month agenda target: the tapped day while it's still on screen, else today if the
  // viewed month contains it, else the 1st of the viewed month. Derived (not stored) so
  // navigating months can never strand the highlight off-grid.
  const phoneSelected = dayOpen && gridDays.some(d => fmtISO(d) === dayOpen)
    ? dayOpen
    : (todayISO.slice(0, 7) === fmtISO(cursor).slice(0, 7) ? todayISO : fmtISO(cursor));

  // Shared between the normal 7-col grid and the mobile week/month layouts below —
  // same cell markup either way, just a different container around it.
  function renderDayCell(d, i) {
    const iso = fmtISO(d);
    const inMonth = viewMode === 'week' || d.getMonth() === cursor.getMonth();
    const isSaturday = d.getDay() === 6;
    const isSunday = d.getDay() === 0;
    const items = byDate[iso] || [];
    const visible = items.slice(0, visibleCount);
    const hidden = items.slice(visibleCount);
    return (
      <button
        key={iso}
        onClick={() => setDayOpen(iso)}
        onDragOver={e => { if (draggedTaskRef.current) { e.preventDefault(); setDragOverDate(iso); } }}
        onDragLeave={() => setDragOverDate(prev => (prev === iso ? null : prev))}
        onDrop={async e => {
          e.preventDefault();
          const dragged = draggedTaskRef.current;
          draggedTaskRef.current = null;
          setDragOverDate(null);
          if (!dragged || dragged.date === iso) return;
          try {
            await api(`/api/tasks/${dragged.id}`, { method: 'PUT', body: { due_date: iso } });
            loadCalendar();
            loadToday();
          } catch (err) { showToast(err.message, 'error'); }
        }}
        className={cn('group relative flex w-full flex-col items-center gap-1 rounded-2xl p-1 pt-1.5 text-left transition-all duration-150 lg:p-1.5 lg:pt-2',
          cellMinH,
          i >= 7 && 'border-t border-border/60',
          !inMonth && 'opacity-25',
          (isSaturday || isSunday) && inMonth && 'bg-muted/30',
          'cursor-pointer hover:z-10',
          inMonth && 'hover:bg-accent/40 hover:shadow-md',
          dragOverDate === iso && 'z-10 ring-2 ring-primary ring-offset-1')}
      >
        <div className="flex w-full items-center justify-between">
          <span className={cn(architectsDaughter.className, 'relative flex size-6 shrink-0 items-center justify-center rounded-full text-sm transition-colors lg:size-8 lg:text-lg',
            iso === todayISO
              ? 'font-semibold text-primary ring-2 ring-primary'
              : !inMonth
                ? 'text-muted-foreground'
                : isSunday
                  ? 'text-weekend group-hover:bg-weekend/10'
                  : isSaturday
                    ? 'text-weekend/80 group-hover:bg-weekend/10'
                    : 'text-foreground group-hover:bg-primary/10')}>
            {d.getDate()}
            {iso === todayISO && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />}
          </span>
          {weatherDaily[iso] && <WeatherBadge info={weatherDaily[iso]} />}
        </div>
        <div className={cn('flex w-full flex-1 flex-col gap-0.5',
          viewMode === 'week' ? 'overflow-y-auto scrollbar-none' : 'overflow-visible')}>
          {visible.map((it, idx) => {
            const assignee = it.kind === 'task' && taskScope === 'all' && it.assigned_to
              ? assignableUsers.find(u => u.username === it.assigned_to)
              : null;
            const isWeek = viewMode === 'week';
            return (
              <span
                key={idx}
                draggable={it.kind === 'task'}
                onDragStart={e => {
                  if (it.kind !== 'task') return;
                  e.stopPropagation();
                  draggedTaskRef.current = it;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className={cn('flex min-w-0 gap-1 px-1.5 py-0.5 text-[10px] font-medium leading-4 lg:px-2',
                  isWeek ? 'items-start rounded-md py-1' : 'items-center rounded-full',
                  it.kind === 'task' && 'cursor-grab active:cursor-grabbing',
                  it.kind === 'task' && (it.status === 'done' ? 'bg-muted text-muted-foreground line-through' : 'bg-primary/15 text-primary'),
                  it.kind === 'milestone' && 'bg-milestone/15 text-milestone-foreground',
                  it.kind === 'visit' && 'bg-visit/15 text-visit-foreground',
                  it.kind === 'order' && 'bg-order/15 text-order-foreground')}>
                {assignee && (
                  <UserAvatar user={assignee} size="size-3.5" textSize="text-[8px]" initialOnly
                    className={cn('shrink-0', isWeek && 'mt-0.5')} />
                )}
                <span className={cn('min-w-0', isWeek ? 'whitespace-normal break-words' : 'truncate')}>{it.title}</span>
              </span>
            );
          })}
          {hidden.length > 0 && (
            <div className="relative">
              <span className="peer/more block cursor-default px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                +{hidden.length} more
              </span>
              <div className="hidden lg:block invisible absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border bg-popover p-1.5 opacity-0 shadow-lg transition-all duration-150 peer-hover/more:visible peer-hover/more:opacity-100">
                {hidden.map((it, idx) => (
                  <div key={idx} className="truncate rounded-md px-2 py-1 text-xs text-popover-foreground hover:bg-muted">
                    {it.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </button>
    );
  }

  // Phone month view: a compact date grid (no room for pills) — a date and up to four
  // kind dots, reusing the same EVENT_KIND_ORDER/EVENT_KIND_DOT the year view draws with.
  // ponytail: no per-cell WeatherBadge (no room at 41px) — it reappears in the agenda
  // header below the grid instead.
  function renderCompactDayCell(d) {
    const iso = fmtISO(d);
    const inMonth = d.getMonth() === cursor.getMonth();
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const kinds = EVENT_KIND_ORDER.filter(k => byDate[iso]?.some(it => it.kind === k));
    const selected = iso === phoneSelected;
    return (
      <button key={iso} onClick={() => setDayOpen(iso)}
        className={cn('flex h-12 flex-col items-center justify-center gap-1 rounded-xl transition-colors',
          !inMonth && 'opacity-30',
          isWeekend && inMonth && 'bg-muted/30',
          selected && 'bg-primary/10')}>
        <span className={cn(firaCode.className, 'flex size-7 items-center justify-center rounded-full text-sm leading-none',
          iso === todayISO
            ? 'font-semibold text-primary ring-2 ring-primary'
            : selected
              ? 'bg-primary font-semibold text-primary-foreground'
              : !inMonth
                ? 'text-muted-foreground'
                : d.getDay() === 0
                  ? 'text-weekend'
                  : '')}>
          {d.getDate()}
        </span>
        <span className="flex h-1.5 items-center gap-0.5">
          {kinds.map(k => <span key={k} className={cn('size-1.5 rounded-full', EVENT_KIND_DOT[k])} />)}
        </span>
      </button>
    );
  }

  // One source of truth for a single day's items: the desktop day-details Dialog, the
  // phone month view's inline agenda, and each phone week-agenda row all render this.
  // hideEmpty drops sections with nothing in them — only the week agenda wants that,
  // since it can show all 7 days at once and can't afford three "Nothing due" placeholders
  // per empty day.
  function renderDayAgenda(iso, hideEmpty = false) {
    const items = byDate[iso] || [];
    const dayTasks = items.filter(it => it.kind === 'task');
    const dayMilestones = items.filter(it => it.kind === 'milestone');
    const dayVisits = items.filter(it => it.kind === 'visit');
    const dayOrders = items.filter(it => it.kind === 'order');
    const show = n => !hideEmpty || n > 0;
    const adding = k => quickAdd?.iso === iso && quickAdd.kind === k;
    const toggleAdd = k => setQuickAdd(q => (q?.iso === iso && q.kind === k ? null : { iso, kind: k }));
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {show(dayTasks.length) && (
          <DaySection label="Tasks" icon={<ListTodoIcon className="size-3.5 text-primary" />}
            addColorClass="bg-primary/50 hover:bg-primary"
            count={dayTasks.length} onAdd={() => toggleAdd('task')}>
            {dayTasks.map((it, i) => {
              const assignee = it.assigned_to ? assignableUsers.find(u => u.username === it.assigned_to) : null;
              return (
                <div key={i} className={cn('group flex items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors',
                  it.status === 'done' ? 'bg-muted/50 hover:bg-muted' : 'bg-primary/10 hover:bg-primary/15')}>
                  <Checkbox checked={it.status === 'done'} onCheckedChange={() => toggleTask(it)}
className="border-2 border-muted-foreground/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white" />
                  {editingId === it.id ? (
                    <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(it)} onBlur={() => saveEdit(it)}
                      className="h-6 flex-1 text-sm" />
                  ) : (
                    <span onClick={() => { setEditingId(it.id); setEditValue(it.title); }}
                      className={cn('flex-1 cursor-text truncate', it.status === 'done' && 'text-muted-foreground line-through')}>{it.title}</span>
                  )}
                  {it.client_name && <Badge variant="outline" className="shrink-0">{it.client_name}</Badge>}
                  <div className="relative size-6 shrink-0">
                    {assignee && (
                      <UserAvatar user={assignee} size="size-6" textSize="text-[10px]" initialOnly
                        className="absolute inset-0 transition-opacity duration-150 group-hover:opacity-0" />
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => deleteEvent('task', it.id)} aria-label="Delete task"
                      className="absolute inset-0 size-6 shrink-0 opacity-0 text-muted-foreground transition-opacity duration-150 hover:text-destructive group-hover:opacity-100">
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {adding('task') && (
              <QuickAddRow placeholder="New task…" onSubmit={async (title) => {
                try {
                  await api('/api/tasks', { method: 'POST', body: { title, due_date: iso } });
                  setQuickAdd(null);
                  loadCalendar(); loadToday();
                } catch (e) { showToast(e.message, 'error'); }
              }} />
            )}
          </DaySection>
        )}

        {show(dayMilestones.length) && (
          <DaySection label="Milestones" icon={<FolderKanbanIcon className="size-3.5 text-milestone" />}
            addColorClass="bg-milestone/50 hover:bg-milestone"
            count={dayMilestones.length} onAdd={() => toggleAdd('milestone')}>
            {dayMilestones.map((it, i) => (
              <div key={i} className="group flex items-center gap-2 rounded-md bg-milestone/10 px-1 py-1.5 text-sm transition-colors hover:bg-milestone/15">
                {editingId === it.id ? (
                  <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(it)} onBlur={() => saveEdit(it)}
                    className="h-6 flex-1 text-sm" />
                ) : (
                  <span onClick={() => { setEditingId(it.id); setEditValue(it.title); }}
                    className="flex-1 cursor-text truncate">{it.title}</span>
                )}
                <Link href={`/projects/${it.project_id}`} className="shrink-0 text-xs text-primary hover:underline">{it.project_name}</Link>
                <Button variant="ghost" size="icon-sm" onClick={() => deleteEvent('milestone', it.id)} aria-label="Delete milestone"
                  className="size-6 shrink-0 opacity-0 text-muted-foreground transition-opacity hover:text-destructive group-hover:opacity-100">
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
            {adding('milestone') && <MilestoneQuickAdd date={iso} onDone={() => { setQuickAdd(null); loadCalendar(); }} />}
          </DaySection>
        )}

        {show(dayVisits.length) && (
          <DaySection label="Site visits" icon={<MapPinIcon className="size-3.5 text-visit" />}
            addColorClass="bg-visit/50 hover:bg-visit"
            count={dayVisits.length} onAdd={() => toggleAdd('visit')}>
            {dayVisits.map((it, i) => (
              <div key={i} className="group flex items-center gap-2 rounded-md bg-visit/10 px-1 py-1.5 text-sm transition-colors hover:bg-visit/15">
                {editingId === it.id ? (
                  <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(it)} onBlur={() => saveEdit(it)}
                    placeholder="Notes…" className="h-6 flex-1 text-sm" />
                ) : (
                  <span onClick={() => { setEditingId(it.id); setEditValue(it.notes || ''); }}
                    className="flex-1 cursor-text truncate">{it.notes || 'Site visit'}</span>
                )}
                <Link href={`/projects/${it.project_id}`} className="shrink-0 text-xs text-primary hover:underline">{it.project_name}</Link>
                <Button variant="ghost" size="icon-sm" onClick={() => deleteEvent('visit', it.id)} aria-label="Delete visit"
                  className="size-6 shrink-0 opacity-0 text-muted-foreground transition-opacity hover:text-destructive group-hover:opacity-100">
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
            {adding('visit') && <VisitQuickAdd date={iso} onDone={() => { setQuickAdd(null); loadCalendar(); }} />}
          </DaySection>
        )}

        {show(dayOrders.length) && (
          <DaySection label="Order due" icon={<ArmchairIcon className="size-3.5 text-order" />} count={dayOrders.length}>
            {dayOrders.map((it, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-order/10 px-1 py-1.5 text-sm transition-colors hover:bg-order/15">
                <span className="flex-1 truncate">{it.title}</span>
                <Link href={`/orders/${it.id}`} className="shrink-0 text-xs text-primary hover:underline">Open</Link>
              </div>
            ))}
          </DaySection>
        )}
      </div>
    );
  }

  return (
    <div className="container flex flex-col gap-4 py-6" style={GEORGIA_STYLE}>
      <div className="grid gap-4 lg:grid-cols-[7fr_3fr]">
        {/* Calendar */}
        <div ref={calendarWrapRef} className="relative order-3 lg:order-none">
          <SpiralRings width={calendarWidth} />
            <Card
              className="
                paper-surface
                relative
                z-30
                overflow-hidden
                rounded-2xl
                border-none
                before:absolute
                before:inset-0
                before:pointer-events-none
                before:bg-[linear-gradient(135deg,var(--paper-sheen),transparent_28%,transparent_72%,var(--paper-shade))]
                before:content-['']
              "
            >
              <CardHeader className="pb-2">
                <div className="flex w-full flex-wrap items-center justify-between gap-2 lg:flex-nowrap">
                  <h2 className={cn(architectsDaughter.className, 'text-xl tracking-tight text-foreground lg:text-2xl')}>
                    {viewMode === 'year' ? cursor.getFullYear() : monthLabel}
                  </h2>
                  <Tabs value={viewMode} onValueChange={setViewMode}>
                    <TabsList className="h-8">
                      <TabsTrigger value="week" className="px-3 text-xs font-medium">Week</TabsTrigger>
                      <TabsTrigger value="month" className="px-3 text-xs font-medium">Month</TabsTrigger>
                      <TabsTrigger value="year" className="px-3 text-xs font-medium">Year</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
            <CardContent>
              {viewMode !== 'year' && !phoneWeek && (
                <div className="grid grid-cols-7 gap-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => {
                    const isSat = d === 'Sat', isSun = d === 'Sun';
                    return (
                      <div key={d} className={cn(architectsDaughter.className, 'border-b border-border/60 px-1 py-2 text-center text-[11px] font-medium uppercase tracking-wide',
                        isSun ? 'bg-weekend/5 text-weekend/80' : isSat ? 'bg-muted/30 text-muted-foreground/80' : 'text-muted-foreground')}>
                        {d}
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === 'year' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 12 }, (_, m) => {
                    const monthDate = new Date(cursor.getFullYear(), m, 1);
                    const first = new Date(cursor.getFullYear(), m, 1);
                    const start = new Date(first);
                    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
                    const cells = [];
                    const d2 = new Date(start);
                    for (let i = 0; i < 42; i++) { cells.push(new Date(d2)); d2.setDate(d2.getDate() + 1); }
                    return (
                      <button key={m}
                        onClick={() => { setCursor(new Date(cursor.getFullYear(), m, 1)); setViewMode('month'); }}
                        className="flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
                        <span className="text-sm font-semibold tracking-tight text-foreground">
                          {monthDate.toLocaleDateString(LOCALE, { month: 'long' })}
                        </span>
                        <div className="grid grid-cols-7 gap-0.5">
                          {cells.map((cd, i) => {
                            const iso = fmtISO(cd);
                            const inMonth = cd.getMonth() === m;
                            const isToday = iso === todayISO;
                            if (!inMonth) return <span key={i} className="size-4" />;
                            const dayKinds = EVENT_KIND_ORDER.filter(k => byDate[iso]?.some(it => it.kind === k));
                            return (
                              <span key={i} className={cn('relative flex size-4 items-center justify-center rounded-full text-[9px] font-medium leading-none',
                                dayKinds.length === 0 && 'text-muted-foreground',
                                isToday && 'font-semibold text-primary ring-2 ring-primary')}>
                                {dayKinds.length === 1 && (
                                  <span className={cn('absolute inset-0 rounded-full', EVENT_KIND_LIGHT[dayKinds[0]])} />
                                )}
                                {dayKinds.length === 2 && (
                                  <span className="absolute inset-0 flex items-center justify-center">
                                    {dayKinds.map(k => <span key={k} className={cn('size-2 rounded-full', EVENT_KIND_LIGHT[k])} />)}
                                  </span>
                                )}
                                {dayKinds.length === 3 && (
                                  <span className="absolute inset-0 flex flex-col items-center justify-between">
                                    <span className={cn('size-2 rounded-full', EVENT_KIND_LIGHT[dayKinds[0]])} />
                                    <span className="flex">
                                      {dayKinds.slice(1).map(k => <span key={k} className={cn('size-2 rounded-full', EVENT_KIND_LIGHT[k])} />)}
                                    </span>
                                  </span>
                                )}
                                {dayKinds.length > 3 && (
                                  <span className="absolute inset-0 grid grid-cols-2 grid-rows-2 place-items-center">
                                    {dayKinds.map(k => <span key={k} className={cn('size-2 rounded-full', EVENT_KIND_LIGHT[k])} />)}
                                  </span>
                                )}
                                <span className={cn(firaCode.className, 'relative z-10')}>{cd.getDate()}</span>
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : loading ? (
                <div className={cn('grid gap-1', phoneWeek ? 'grid-cols-1' : 'grid-cols-7')}>
                  {gridDays.map((d, i) => (
                    <div key={i} className={cn('animate-pulse rounded-2xl bg-muted/50',
                      isPhone ? 'h-12' : cellMinH,
                      !isPhone && i >= 7 && 'border-t border-border/60')} />
                  ))}
                </div>
              ) : phoneWeek ? (
                // Week view on a phone: 7 narrow grid columns can't fit a readable task title,
                // so stack the week as a full-width agenda instead — one row per day, expanded
                // by default when it has items, collapsed to a thin "Nothing due" row otherwise.
                <div key={fmtISO(gridDays[0])} className="flex flex-col divide-y animate-in fade-in duration-200">
                  {gridDays.map(d => {
                    const iso = fmtISO(d);
                    const items = byDate[iso] || [];
                    const expanded = items.length > 0 || dayOpen === iso;
                    return (
                      <div key={iso} className={cn('py-2', iso === todayISO && 'bg-primary/5')}>
                        {/* Sibling of the agenda below, never its parent — the agenda holds
                            checkboxes/inputs/links that can't nest inside another button. */}
                        <button onClick={() => setDayOpen(p => (p === iso ? null : iso))}
                          className="flex w-full items-center gap-2 px-1 text-left">
                          <span className={cn(firaCode.className, 'flex size-7 shrink-0 items-center justify-center rounded-full text-sm',
                            iso === todayISO && 'font-semibold text-primary ring-2 ring-primary')}>
                            {d.getDate()}
                          </span>
                          <span className={cn(architectsDaughter.className, 'text-sm uppercase tracking-wide',
                            d.getDay() === 0 ? 'text-weekend' : d.getDay() === 6 ? 'text-weekend/80' : 'text-muted-foreground')}>
                            {d.toLocaleDateString(LOCALE, { weekday: 'long' })}
                          </span>
                          {weatherDaily[iso] && <WeatherBadge info={weatherDaily[iso]} />}
                          {!expanded && <span className="ml-auto text-xs text-muted-foreground">Nothing due</span>}
                        </button>
                        {expanded && <div className="mt-2">{renderDayAgenda(iso, dayOpen !== iso)}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div key={fmtISO(gridDays[0]) + viewMode}
                  className="grid grid-cols-7 gap-1 animate-in fade-in duration-200">
                  {gridDays.map((d, i) => (phoneMonth ? renderCompactDayCell(d) : renderDayCell(d, i)))}
                </div>
              )}

              {phoneMonth && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={cn(architectsDaughter.className, 'text-base text-foreground')}>{formatDate(phoneSelected)}</span>
                    {weatherDaily[phoneSelected] && <WeatherBadge info={weatherDaily[phoneSelected]} />}
                  </div>
                  {renderDayAgenda(phoneSelected)}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {/* {[
                    { label: 'Tasks', color: 'bg-primary' },
                    { label: 'Milestones', color: 'bg-amber-500' },
                    { label: 'Site visits', color: 'bg-teal-500' },
                    { label: 'Order due', color: 'bg-violet-500' },
                  ].map(({ label, color }) => ( */}
                  {[
                    { label: 'Tasks', color: 'bg-primary' },
                    { label: 'Milestones', color: 'bg-milestone' },
                    { label: 'Site visits', color: 'bg-visit' },
                    { label: 'Order due', color: 'bg-order' },
                  ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                      <span className={cn('size-2 rounded-full', color)} />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" onClick={() => navigateCursor(-1)} aria-label="Previous">
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={goToToday} aria-label="Go to today"
                    className="bg-muted-foreground/25 font-serif text-base italic text-foreground hover:bg-muted-foreground/40">
                    t
                  </Button>
                  <Button variant="outline" size="icon-sm" onClick={() => navigateCursor(1)} aria-label="Next">
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tasks */}
        <div className="flex h-full flex-col gap-3 order-2 lg:order-none lg:gap-0">
          <div ref={taskCardWrapRef} className="relative order-2 lg:order-none">
            <SpiralRingsVertical height={taskCardHeight} />
            <Card className="paper-surface relative z-30">
            <CardHeader className="pb-2">
              <div className="flex w-full flex-wrap items-center justify-between gap-2 lg:flex-nowrap">
                <CardTitle className={cn(architectsDaughter.className, 'text-xl text-foreground')}>Tasks</CardTitle>
                {canAssign && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Tabs value={taskScope} onValueChange={v => { setTaskScope(v); if (v === 'mine') setFilterUser(''); }}>
                      <TabsList className="h-8">
                        <TabsTrigger value="mine" className="px-3 text-xs font-medium">Mine</TabsTrigger>
                        <TabsTrigger value="all" className="px-3 text-xs font-medium">All</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {taskScope === 'all' && (
                      <Select value={filterUser || '__all__'} onValueChange={v => setFilterUser(v === '__all__' ? '' : v)}>
                        <SelectTrigger className="h-8 w-32 text-xs" aria-label="Filter by user">
                          <SelectValue placeholder="All users" />
                        </SelectTrigger>
                        <SelectContent style={GEORGIA_STYLE}>
                          <SelectGroup>
                            <SelectItem value="__all__">All users</SelectItem>
                            {assignableUsers.map(u => (
                              <SelectItem key={u.id} value={u.username}>{u.display_name || u.username}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Input placeholder="New task…" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && newTask.title.trim() && addTask()} className="min-w-32 flex-1" />
                <DueDatePicker value={newTask.due_date} onChange={v => setNewTask({ ...newTask, due_date: v })} />
                {canAssign && (
                  <AssignPicker users={assignableUsers} value={newTask.assigned_to}
                    onChange={v => setNewTask({ ...newTask, assigned_to: v })} />
                )}
                <Button type="button" size="icon" onClick={addTask} disabled={!newTask.title.trim()} aria-label="Add task"><PlusIcon /></Button>
              </div>
              <div className="flex flex-col gap-1">
                {visibleTasks.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {taskScope === 'mine' && canAssign ? 'Nothing on your plate — check All.' : 'All clear — nothing due.'}
                  </p>
                )}
                {visibleTasks.map(t => {
                  const overdue = t.due_date < todayISO;
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted">
                      <Checkbox checked={t.status === 'done'} onCheckedChange={() => toggleTask(t)} />
                      {editingId === t.id ? (
                        <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit({ ...t, kind: 'task' })}
                          onBlur={() => saveEdit({ ...t, kind: 'task' })}
                          className="h-7 min-w-0 flex-1 text-sm" />
                      ) : (
                        <span onClick={() => { setEditingId(t.id); setEditValue(t.title); }}
                          className="min-w-0 flex-1 cursor-text truncate text-sm">{t.title}</span>
                      )}
                      {canAssign && t.assigned_to && <Badge variant="secondary" className="shrink-0">{t.assigned_to}</Badge>}
                      {t.client_name && <Badge variant="outline" className="shrink-0">{t.client_name}</Badge>}
                      <span className={cn(firaCode.className, 'shrink-0 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                        {overdue ? formatDate(t.due_date) : 'today'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          </div>
          {greeting && (
            <div className="order-1 paper-surface rounded-xl px-3 py-2.5 shadow-sm lg:order-none lg:mt-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn(architectsDaughter.className, 'text-xl text-foreground')}>
                  {greeting}{(me?.display_name || me?.username) && `, ${me.display_name || me.username}`}!
                </p>
                {currentWeather ? (
                  <div className="flex items-center gap-1.5 text-foreground/80" title={currentWeather.label}>
                    <img src={getWeatherIconSrc(currentWeather.code)} alt="" className="size-10 shrink-0" />
                    <span className={cn(firaCode.className, 'text-sm')}>{Math.round(currentWeather.temp)}°C</span>
                  </div>
                ) : locationStatus === 'denied' ? (
                  <Button variant="outline" size="sm" onClick={requestLocation} className="h-7 shrink-0 text-xs">
                    Enable weather
                  </Button>
                ) : null}
              </div>
              {quote && (
                <p className="mt-1 text-xs italic leading-snug text-muted-foreground">
                  "{quote.text}" <span className="not-italic">— {quote.author}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Day details — phone renders the agenda inline (week rows / month panel below the
          grid) instead, so the modal never opens there. */}
      <Dialog open={!!dayOpen && !isPhone} onOpenChange={o => { if (!o) { setDayOpen(null); setQuickAdd(null); } }}>
        <DialogContent className="sm:max-w-2xl" style={GEORGIA_STYLE}>
          <DialogHeader><DialogTitle>{dayOpen ? formatDate(dayOpen) : ''}</DialogTitle></DialogHeader>
          {renderDayAgenda(dayOpen)}
        </DialogContent>
      </Dialog>

    </div>
  );
}
