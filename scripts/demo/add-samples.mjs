// Fills the interiors demo's golden database with the things the briefing and Atelier AI ask about: quotations in
// every state, a couple of overdue tasks, a running-late cafe counter (order + milestone), a missed kitchen install and
// today's attendance. Goes through lib/quotations.js, so numbers, stages, follow-up tasks and stage invoices come out
// exactly as the app makes them. Run once per golden; safe to re-run (each piece is skipped when it's already there).
//
//   India: TURSO_URL=libsql://sav-demo-golden-pujan.aws-ap-south-1.turso.io node scripts/demo/add-samples.mjs
//   US (on the us-demo branch): MARKET=NA NEXT_PUBLIC_MARKET=NA TURSO_URL=libsql://sav-us-demo-golden-pujan.aws-ap-south-1.turso.io node scripts/demo/add-samples.mjs
//
// Token: TURSO_GROUP_TOKEN (savdemo group) from the environment or the gitignored .demo-secrets. Visitors see the data
// after the next nightly reset (or a manual one). Writes only to the database in TURSO_URL.
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';

// lib/ imports the Next way ('./brand', '@/lib/x'); plain Node needs the '.js' and the alias spelled out.
const root = new URL('../../', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s.startsWith('@/')) s = ${JSON.stringify(root)} + s.slice(2);
  if ((s.startsWith('.') || s.startsWith('file:')) && !/\\.[mc]?js(on)?$/.test(s)) s += '.js';
  return next(s, c);
}`)}`);

if (!process.env.TURSO_URL?.includes('golden')) throw new Error('TURSO_URL must be a demo golden database');
if (!process.env.TURSO_GROUP_TOKEN && existsSync('.demo-secrets')) {
  const m = /^TURSO_GROUP_TOKEN=(.+)$/m.exec(readFileSync('.demo-secrets', 'utf8'));
  if (m) process.env.TURSO_GROUP_TOKEN = m[1];
}
process.env.TURSO_AUTH_TOKEN = process.env.TURSO_GROUP_TOKEN;
process.env.SKIP_MIGRATE = '1'; // golden is migrated on every deploy
delete process.env.GOLDEN_TURSO_URL; // outside a request: plain TURSO_URL
process.env.NEXT_PUBLIC_DEMO = process.env.DEMO_MODE = '1'; // made-up letterheads (AI/Q/… not the client's prefix)

const US = process.env.MARKET === 'NA';
const { queryOne, queryAll, execute } = await import('../../lib/db.js');
const Q = await import('../../lib/quotations.js');
const { todayISO } = await import('../../lib/date.js');
const today = todayISO();
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const owner = { username: 'owner' };
const log = (...a) => console.log(' ', ...a);

// Sample lines, India (₹, GST 18%) and US ($, Texas sales tax 8.25%).
const TAX = US ? 8.25 : 18;
const L = {
  tvWall: { description: 'Decorative TV wall panel\n\n12 mm BWR plywood backing, 1 mm laminate, concealed cable routing. Measured by finished front elevation.', unit: 'sqft', dims: US ? "8' × 6'" : "6' × 5'", qty: US ? 48 : 30, rate: US ? 58 : 1650 },
  crockery: { description: 'Crockery unit with glass shutters\n\n18 mm BWR plywood carcass, fluted glass shutters, profile lights. Measured by front elevation.', unit: 'sqft', dims: US ? "6' × 7'" : "5' × 7'", qty: US ? 42 : 35, rate: US ? 72 : 2100 },
  sofaBack: { description: 'Upholstered wall panel behind sofa\n\nFabric over foam on plywood, fixed with French cleats.', unit: 'sqft', dims: "10' × 4'", qty: 40, rate: US ? 45 : 1250 },
  wardrobe: { description: 'Full-height hinged wardrobe, laminate finish\n\n18 mm BWR plywood carcass and shutters, soft-close hinges, hanging rod. Measured by front elevation, depth up to 600 mm.', unit: 'sqft', dims: US ? "8' × 8'" : "7'6\" × 8'", qty: US ? 64 : 60, rate: US ? 62 : 1850 },
  bed: { description: 'Queen bed with hydraulic storage\n\nPlywood storage box, laminate finish, gas-lift mechanism. Mattress excluded.', unit: 'nos', dims: "6' × 6'6\"", qty: 1, rate: US ? 1950 : 58500 },
  dining: { description: 'Dining table, 6-seater, solid wood\n\nSolid hardwood top 40 mm, tapered legs, PU matt finish.', unit: 'nos', dims: "6' × 3'", qty: 1, rate: US ? 2400 : 68000 },
  cubbies: { description: 'Classroom cubby storage, rounded edges\n\n18 mm plywood, 2 mm edge band, open cubbies for 12 children per unit.', unit: 'nos', dims: "6' × 3' × 1'4\"", qty: 6, rate: US ? 780 : 22500 },
  benches: { description: 'Low bench seating with storage\n\nPlywood frame, laminate top, child-safe rounded corners.', unit: 'rft', dims: '24', qty: 24, rate: US ? 95 : 2600 },
  outdoor: { description: 'Outdoor bench seating, treated pine\n\nPressure-treated pine slats on powder-coated steel frame, weatherproof finish.', unit: 'rft', dims: '18', qty: 18, rate: US ? 140 : 3800 },
  planters: { description: 'Planter boxes with drip line\n\nGalvanised steel, powder-coated, with drip irrigation point.', unit: 'nos', dims: "3' × 1'6\"", qty: 6, rate: US ? 260 : 7200 },
  study: { description: 'Study unit with overhead shelves\n\n18 mm plywood, laminate finish, cable cut-outs, two drawers.', unit: 'sqft', dims: "5' × 7'", qty: 35, rate: US ? 55 : 1500 },
};
const items = (keys, section) => keys.map((k) => ({ section, ...L[k], gst_pct: TAX }));

// One quotation per title: create, fill, then walk it to its state.
async function quote({ client, project, title, lines, then }) {
  const have = await queryOne('SELECT id FROM quotations WHERE title = ? AND client_id = ? AND is_deleted_record = 0 ORDER BY revision LIMIT 1', [title, client]);
  let id = have?.id;
  if (!id) id = await Q.createQuotation({ client_id: client, title }, owner);
  const q = await Q.loadQuotation(id);
  if (!q.items.length) await Q.saveQuotation(id, { ...q, project_id: project, items: lines, stages: q.stages });
  if (q.status === 'draft' && then) await then(id);
  const after = await Q.loadQuotation(id);
  log(`${after.quote_no} ${title}: ${after.status}`);
  return id;
}

console.log(`Adding samples to ${new URL(process.env.TURSO_URL).hostname} (today ${today})`);

// 1. Quotations, one in each state.
const N = US
  ? { walker: 'Walker ranch — living and dining', carter: 'Carter house — loose furniture', greenleaf: 'Greenleaf classrooms — storage and seating', foster: 'Foster primary bedroom', brewnest: 'Brewnest patio seating add-on', brooks: 'Brooks apartment — study nook' }
  : { walker: 'Rathod villa — living and dining', carter: 'Mehta bungalow — loose furniture', greenleaf: 'Greenleaf classrooms — storage and seating', foster: 'Kapadia master bedroom', brewnest: 'Brewnest outdoor seating add-on', brooks: 'Joshi apartment — study unit' };

await quote({ client: 8, title: N.walker, lines: [...items(['tvWall', 'crockery'], 'Living room'), ...items(['sofaBack'], 'Living room')],
  then: (id) => Q.sendQuotation(id, owner) });
await quote({ client: 1, project: 1, title: N.carter, lines: items(['dining', 'bed'], 'Furniture'),
  then: async (id) => {
    await Q.decideQuotation(id, 'accepted');
    const first = (await Q.loadQuotation(id)).stages[0];
    await Q.raiseStageInvoice(id, first.id);
  } });
const g = await quote({ client: 7, title: N.greenleaf, lines: items(['cubbies', 'benches'], 'Classrooms'),
  then: (id) => Q.sendQuotation(id, owner, 0) });
// The school asked for a smaller first phase: revision 2, four cubby units instead of six, sent again.
if (!(await queryOne("SELECT id FROM quotations WHERE parent_quotation_id = ? AND is_deleted_record = 0", [g]))) {
  const r2 = await Q.reviseQuotation(g, owner);
  const q2 = await Q.loadQuotation(r2);
  await Q.saveQuotation(r2, { ...q2, items: q2.items.map((it) => (it.description.startsWith('Classroom cubby') ? { ...it, qty: 4 } : it)), stages: q2.stages });
  await Q.sendQuotation(r2, owner);
  log(`${q2.quote_no} R2 ${N.greenleaf}: sent (R1 superseded)`);
}
await quote({ client: 6, title: N.foster, lines: items(['wardrobe', 'bed'], 'Bedroom'),
  then: async (id) => { await Q.sendQuotation(id, owner, 0); await Q.decideQuotation(id, 'declined'); } });
const b = await quote({ client: 3, title: N.brewnest, lines: items(['outdoor', 'planters'], 'Patio'),
  then: (id) => Q.sendQuotation(id, owner, 0) });
// Sent three weeks ago and never answered: past its validity, so it shows as expired.
await execute('UPDATE quotations SET quoted_on = ?, sent_on = ?, valid_until = ? WHERE id = ? AND status = ?', [day(-21), day(-21), day(-6), b, 'sent']);
await quote({ client: 2, project: 4, title: N.brooks, lines: items(['study'], 'Study') });

// 2. Two overdue tasks.
const tasks = US
  ? [['Send revised closet shutter samples to Kevin Brooks', -3, 'manager', 2], ['Chase Brewnest for the phase 2 payment', -2, 'owner', 3]]
  : [['Send revised wardrobe shutter samples to Kiran Joshi', -3, 'manager', 2], ['Chase Brewnest for the stage 2 payment', -2, 'owner', 3]];
for (const [title, d, who, client] of tasks) {
  if (await queryOne('SELECT id FROM tasks WHERE title = ?', [title])) continue;
  await execute("INSERT INTO tasks (title, due_date, assigned_to, client_id, created_by, status) VALUES (?, ?, ?, ?, 'owner', 'open')", [title, day(d), who, client]);
  log(`task: ${title} (due ${day(d)})`);
}

// 3. Running late: the cafe counter (order #4 and its milestone, 2 days) and the kitchen install (1 day).
await execute("UPDATE orders SET due_date = ? WHERE id = 4 AND status = 'in_progress'", [day(-2)]);
await execute("UPDATE milestones SET due_date = ? WHERE id = 11 AND status != 'done'", [day(-2)]);
await execute("UPDATE milestones SET due_date = ? WHERE id = 14 AND status != 'done'", [day(-1)]);
log('late: counter order #4 and its milestone, kitchen install milestone');

// 4. Today's attendance: five of six marked (copied from each person's last day), one still to mark.
if (!(await queryOne('SELECT id FROM attendance WHERE date = ? AND is_deleted_record = 0', [today]))) {
  const staff = await queryAll('SELECT id FROM employees WHERE active = 1 AND is_deleted_record = 0 ORDER BY id');
  for (const { id } of staff.slice(0, 5)) {
    const last = await queryOne("SELECT status, in_time, out_time FROM attendance WHERE employee_id = ? AND status = 'present' ORDER BY date DESC LIMIT 1", [id]);
    await execute('INSERT INTO attendance (employee_id, date, status, in_time, out_time) VALUES (?, ?, ?, ?, ?)', [id, today, 'present', last?.in_time ?? null, null]);
  }
  log(`attendance: ${Math.min(5, staff.length)} of ${staff.length} marked today`);
}

console.log('Done.');
process.exit(0);
