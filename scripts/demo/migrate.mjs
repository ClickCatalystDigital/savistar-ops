// Brings the demo databases' schema up to the current code before a demo deploy (npm run cf:deploy):
// the demo runs with SKIP_MIGRATE=1, so a column added in lib/db.js would otherwise never reach it,
// and the nightly reset would keep restoring the old golden copy. Golden first, then the live demo DB.
// migrate() is idempotent (CREATE ... IF NOT EXISTS, addColumn), and seeds nothing on a database with users.
// Token: TURSO_GROUP_TOKEN (savdemo group) from the environment or the gitignored .demo-secrets.
import { existsSync, readFileSync } from 'node:fs';

const DBS = ['libsql://sav-demo-golden-pujan.aws-ap-south-1.turso.io', 'libsql://sav-demo-pujan.aws-ap-south-1.turso.io'];
if (!process.env.TURSO_GROUP_TOKEN && existsSync('.demo-secrets')) {
  for (const line of readFileSync('.demo-secrets', 'utf8').split('\n')) {
    const m = /^TURSO_GROUP_TOKEN=(.+)$/.exec(line);
    if (m) process.env.TURSO_GROUP_TOKEN = m[1];
  }
}
if (!process.env.TURSO_GROUP_TOKEN) throw new Error('TURSO_GROUP_TOKEN is required (savdemo group token)');
delete process.env.SKIP_MIGRATE;
process.env.TURSO_AUTH_TOKEN = process.env.TURSO_GROUP_TOKEN;

for (const url of DBS) {
  process.env.TURSO_URL = url;
  // A fresh module instance per database: lib/db.js keeps one client per process.
  const { initDB } = await import(`../../lib/db.js?db=${encodeURIComponent(url)}`);
  const t = Date.now();
  await initDB();
  console.log(`demo migrate: ${new URL(url).hostname} up to date (${Date.now() - t} ms)`);
}
process.exit(0);
