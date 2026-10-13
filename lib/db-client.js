// The database client for a Node server (Render, local dev). The Cloudflare Workers demo build swaps
// this file for db-client.workers.js (next.config.js, SAV_TARGET=workers).
import { createClient } from '@libsql/client';

export function makeClient() {
  if (process.env.TURSO_URL) {
    return createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
  }
  return createClient({ url: 'file:./savistar-ops-local.db', intMode: 'number' });
}
