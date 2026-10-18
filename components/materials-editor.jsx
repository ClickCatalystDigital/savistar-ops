'use client';

import { useState } from 'react';
import { XIcon, PlusIcon } from 'lucide-react';
import { projectMaterials, parseMaterial, formatMaterials, MATERIAL_NAMES } from '@/lib/materials';

// The project's material palette, edited in place: click a chip's colour to pick another, × to drop
// it, type to add (known materials are suggested and come with their colour). Each change saves.
// While the project has no list of its own, the chips are the ones read from its notes and orders;
// the first change saves them as its own list.
export function MaterialsEditor({ project, onSave }) {
  const items = projectMaterials(project, Infinity);
  const own = Boolean(project.materials?.trim());
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState({}); // colour being picked, by index; saved when the picker closes

  const save = next => onSave(formatMaterials(next));
  const add = () => {
    const names = draft.split(',').map(s => s.trim()).filter(Boolean)
      .filter(n => !items.some(m => m.name.toLowerCase() === n.toLowerCase()));
    if (names.length) save([...items, ...names.map(parseMaterial)]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {items.map((m, i) => (
          <span key={m.name} className="paper-surface group flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 text-xs">
            <label className="relative size-5 cursor-pointer rounded-sm ring-1 ring-black/10 focus-within:ring-2 focus-within:ring-ring" style={{ backgroundColor: preview[i] || m.hex }} title={`Pick a colour for ${m.name}`}>
              <input type="color" value={preview[i] || m.hex} aria-label={`Colour for ${m.name}`} className="absolute inset-0 size-full cursor-pointer opacity-0"
                onChange={e => setPreview({ ...preview, [i]: e.target.value })}
                onBlur={() => { if (preview[i]) { save(items.map((x, j) => (j === i ? { ...x, hex: preview[i], picked: true } : x))); setPreview({}); } }} />
            </label>
            <span className="font-hand text-sm">{m.name}</span>
            <button type="button" aria-label={`Remove ${m.name}`} onClick={() => save(items.filter((_, j) => j !== i))}
              className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <form onSubmit={e => { e.preventDefault(); add(); }} className="flex items-center gap-1">
          <input list="material-names" value={draft} onChange={e => setDraft(e.target.value)} onBlur={add}
            placeholder={items.length ? 'Add material' : 'Add materials, e.g. oak, brass'} aria-label="Add a material"
            className="h-8 w-40 rounded-md border border-dashed bg-transparent px-2 text-xs placeholder:text-muted-foreground focus:border-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" aria-label="Add" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><PlusIcon className="size-4" /></button>
          <datalist id="material-names">{MATERIAL_NAMES.map(n => <option key={n} value={n} />)}</datalist>
        </form>
      </div>
      {!own && items.length > 0 && (
        <p className="text-xs text-muted-foreground">Picked up from the notes and orders. Any change saves them as this project&apos;s own palette.</p>
      )}
      {own && (
        <button type="button" onClick={() => onSave('')} className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Clear and read from the notes again
        </button>
      )}
    </div>
  );
}
