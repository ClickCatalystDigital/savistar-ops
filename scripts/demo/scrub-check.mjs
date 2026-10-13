// Fails if any text in a demo database mentions Savistar, Saag, their owners/staff, address or GSTIN.
// Run before publishing a golden database:
//   DB_URL=... DB_TOKEN=... node scripts/demo/scrub-check.mjs
import { createClient } from '@libsql/client/web';

const DENY = ['savistar', 'saag', 'hari', 'sachi', 'dristi', 'haripriya', 'afafs7926q', 'shree narayan darshan', 'hebatpur'];
const SKIP = new Set(['invoices.company']); // stored keys 'savistar'/'saag'; shown as BRAND names (lib/brand.js)
const db = createClient({ url: process.env.DB_URL, authToken: process.env.DB_TOKEN });
const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => r.name);
let hits = 0;
for (const t of tables) {
  const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows.filter((c) => /TEXT|CHAR|^$/i.test(c.type)).map((c) => c.name);
  for (const c of cols) {
    if (SKIP.has(`${t}.${c}`)) continue;
    for (const w of DENY) {
      const r = await db.execute({ sql: `SELECT COUNT(*) n, MIN(substr("${c}",1,80)) ex FROM "${t}" WHERE "${c}" LIKE ?`, args: [`%${w}%`] });
      if (Number(r.rows[0].n)) { hits += Number(r.rows[0].n); console.log(`${t}.${c} ~ "${w}": ${r.rows[0].n} (e.g. ${r.rows[0].ex})`); }
    }
  }
}
console.log(`${tables.length} tables scanned, ${hits} hit(s)`);
process.exit(hits ? 1 : 0);
