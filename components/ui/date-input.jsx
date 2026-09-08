'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Calendar } from './calendar';

// DD/MM/YYYY masked text input with a calendar popover. value/onChange are ISO
// (YYYY-MM-DD) so every existing caller (todayISO(), DB columns) is unaffected —
// only the displayed text changes.
function isoToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToIso(text) {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
  if (dt.getFullYear() != y || dt.getMonth() + 1 != mo || dt.getDate() != d) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function isoToDate(iso) {
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

function dateToIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DateInput({ value, onChange, className, ...props }) {
  const [text, setText] = React.useState(isoToDisplay(value));
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setText(isoToDisplay(value)); }, [value]);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
      : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setText(formatted);
    const iso = displayToIso(formatted);
    if (iso) onChange(iso);
  }

  function handleBlur() {
    if (!displayToIso(text)) setText(isoToDisplay(value)); // revert incomplete/invalid entry
  }

  function handleSelect(date) {
    if (!date) return; // day-picker fires undefined when toggling a selected day off
    onChange(dateToIso(date));
    setOpen(false);
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        className="pr-9"
        {...props}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 size-8 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={isoToDate(value)}
            defaultMonth={isoToDate(value) || new Date()}
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
