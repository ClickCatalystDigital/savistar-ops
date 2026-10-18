// lib/client.js

'use client';

import { toast } from 'sonner';

export async function api(url, options = {}) {
  // FormData bodies (file uploads) pass through untouched — the browser sets the multipart header.
  const isForm = options.body instanceof FormData;
  const res = await fetch(url, {
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...options,
    body: isForm ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  // Lets the nav's "due" count follow task changes made on the page (components/Nav.jsx).
  if (url.startsWith('/api/tasks') && options.method && options.method !== 'GET') window.dispatchEvent(new Event('tasks-changed'));
  return data;
}

// Thin wrapper over sonner so all existing showToast(message, type) call sites keep working.
export function showToast(message, type = 'success') {
  if (type === 'error') return toast.error(message);
  if (type === 'warning') return toast.warning(message);
  return toast.success(message);
}

// Re-exported from lib/format so existing client imports keep working.
export { formatDate, capitalize, formatMoney } from './format';
