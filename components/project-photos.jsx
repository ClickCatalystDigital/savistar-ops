'use client';

import { useRef, useState } from 'react';
import { ImagePlusIcon, XIcon } from 'lucide-react';
import { api, showToast } from '@/lib/client';
import { DEMO } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { StickyNote } from '@/components/sticky-note';
import { cn } from '@/lib/utils';

// A project's photos as a mood board of pinned prints. Stored as attachments (entity_type 'project',
// R2); the newest is the cover on the Projects grid. Click a print to open it full size.
export function ProjectPhotos({ projectId, photos, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function upload(files) {
    setBusy(true);
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      form.append('entity_type', 'project');
      form.append('entity_id', String(projectId));
      try { await api('/api/attachments', { method: 'POST', body: form }); }
      catch (e) { showToast(`${file.name}: ${e.message}`, 'error'); }
    }
    setBusy(false);
    onChange();
  }

  async function remove(photo) {
    if (!confirm(`Remove ${photo.name || 'this photo'}?`)) return;
    try { await api(`/api/attachments?id=${photo.id}`, { method: 'DELETE' }); onChange(); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Site photos, renders and references. The newest one is the cover on the Projects page.</p>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />
        <Button variant="outline" size="sm" disabled={busy || DEMO} title={DEMO ? 'Uploads are off in the demo' : undefined} onClick={() => input.current.click()}>
          <ImagePlusIcon data-icon="inline-start" />{busy ? 'Uploading…' : 'Add photos'}
        </Button>
      </div>
      {photos.length === 0
        ? <StickyNote className="my-6">No photos yet. Add site photos or renders.</StickyNote>
        : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((ph, i) => (
              <figure key={ph.id} className={cn('group relative bg-white p-2 pb-1 shadow-[0_8px_18px_-8px_rgba(0,0,0,0.35)] transition-transform hover:rotate-0 dark:bg-stone-200', i % 3 === 0 ? '-rotate-1' : i % 3 === 1 ? 'rotate-1' : 'rotate-[0.5deg]')}>
                <a href={ph.file_url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden bg-muted">
                  <img src={ph.file_url} alt={ph.name || 'Project photo'} loading="lazy" className="size-full object-cover" />
                </a>
                <figcaption className="truncate px-0.5 py-1.5 font-hand text-sm text-stone-600">
                  {i === 0 && <span className="mr-1.5 rounded-sm bg-primary px-1 py-0.5 font-sans text-[10px] text-primary-foreground">Cover</span>}
                  {ph.name}
                </figcaption>
                {!DEMO && (
                  <button type="button" aria-label={`Remove ${ph.name || 'photo'}`} onClick={() => remove(ph)}
                    className="absolute -right-2 -top-2 hidden rounded-full bg-background p-1 shadow ring-1 ring-border group-hover:block focus-visible:block">
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}
    </div>
  );
}
