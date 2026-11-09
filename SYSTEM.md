# SAVISTAR-OPS

Operations platform for **Savistar** (interior design — projects with milestones, site visits,
client conversations) and **Saag** (furniture workshop — orders, employees, vendors). Same owners,
one app, one combined finance book.

Next.js 15 (App Router) · shadcn/ui · Turso (libSQL, local SQLite fallback) · JWT auth ·
Cloudflare R2 for files · OpenRouter for bank-statement extraction and the AI assistant (Jev routing) · `@react-pdf/renderer` for
invoice PDFs.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

First run auto-creates the schema and seeds four logins — change these passwords via the nav
menu (Change password, visible to everyone) right after first login:

| Username | Password | Role |
|----------|----------|------|
| `hari` | `hari123` | Owner |
| `sachi` | `sachi123` | Owner |
| `admin` | `admin123` | Admin |
| `dristi` | `dristi123` | Staff (office) — Cash-only Finance access |

Copy `env.example` to `.env.local` and fill what you need — everything degrades gracefully:
without `R2_*` file uploads are disabled, without `OPENROUTER_API_KEY` bank extraction is disabled,
without `TURSO_URL` data goes to `./savistar-ops-local.db`.

## Tabs

- **Home** — month calendar (tasks, project milestones, site visits, order due dates) +
  today/overdue tasks; weather (via Open-Meteo, using browser geolocation) on the header and
  per-day calendar cells; a daily quote-of-the-day
- **Clients** — shared client list for both companies; conversation log per client (optionally
  pinned to a project); per-client invoicing with GST PDF export (CGST/SGST split, company
  letterhead selector for Savistar/Saag)
- **Quotes** — quotations built from the studio's own **BOQ library** (Quotes → BOQ library: started from
  Ahrom Labs' central library in `lib/boq-library.js`, reworded and extended by the studio; their edits are never
  overwritten, see `lib/boq-sync.js`). The editor has rooms, quantities from site dimensions (`lib/dims.js`), past
  quoted rates per item, line checks that never block (`lib/boq-check.js`), payment stages that become draft invoices
  once accepted, revisions (R2 keeps the number; R1 is kept as superseded), autosave, and a PDF with a summary page.
  Sending adds a follow-up task. CGST/SGST or IGST by where the site is (invoices too). Plan: `QUOTATIONS-PLAN.md`
- **Projects** (Savistar) — milestones checklist, site visits, linked Saag orders & vendor POs, conversations
- **Orders** (Saag) — workshop orders; work history shows who worked on what part, when
- **People** — employees (salary or daily wage), daily worksheet (attendance in/out + per-order work log with
  part description and rating), expenses/advances, payroll (computed: days × rate − advances)
- **Vendors** — per-route freight rate card with automatic overcharge flags; POs with partial
  delivery / return tracking (outstanding = ordered − delivered + returned), filterable by
  date/site/item, with bulk mark delivered/returned
- **Finance** — Cash: manual credit/debit ledger with file attachments — staff see their own
  entries only (a scoped view, no company-wide totals). Bank: upload statement PDF → AI extracts
  transactions → review with per-line notes and receipt attachments — fully hidden from staff,
  every bank API route rejects them
- **Settings** — user management (owner/admin/manager only), including avatar upload (.webp,
  stored in R2). Roles: owner, admin, manager, user (staff); deleting records requires
  owner/admin/manager

## Roles

- **owner / admin / manager** — full access to every tab including Finance; can assign tasks to
  anyone, see everyone's tasks on Home, manage users in Settings. "Owner" and "admin" carry
  identical permissions — the labels just distinguish the business owners from a general admin login
- **user (staff)** — everything except Settings and Bank statements; Finance is scoped to their
  own Cash entries only. Home only shows tasks assigned to them, and they can only create tasks
  for themselves (not assign to others)

Everyone, regardless of role, can change their own password from the nav menu (⚙ → Change password).

## AI assistant

A butterfly button in the corner opens **Atelier AI** (owners can rename it in Settings → My assistant), a read-only chat over the
app's data that can also make changes as cards (below). Ported from reel-inventory's LS AI: Jev (`typesafe/jev-1.13`, via OpenRouter) only *chooses*
the kind of question, the look-up, company, period and follow-up; code matches the names (clients,
projects, orders, vendors, people) and runs a fixed, parameterised query (`lib/assistantTools.js`, 27
look-ups that use the same maths as the tabs). Answers are ledger tables, optionally with a short
summary from a writing model. A look-up never changes data.

- **Settings → My assistant** (owners and admins): name, OpenRouter key (encrypted with `SETTINGS_ENC_KEY`, only the
  last 4 shown), credit, model, answer mode, daily question limit, and the switch for data questions
  (on by default). Until a key is saved there, `OPENROUTER_API_KEY` is used. A list of questions it
  couldn't answer or that were thumbed down shows what to add next.
- **Everyone** can ask. Staff get only their own tasks and their own cash entries; payroll, advances,
  the bank, money position and project profit are refused.
- **Bank and profit** (owners, admins, managers): bank balance and bank transactions read every extracted
  statement, reviewed or not; lines from unapproved ones are marked “not reviewed”, hidden lines are left out and
  a line on two overlapping statements counts once. Money position = cash + latest bank closings + unpaid
  invoices (vendor payables left out). Project profit = billed − materials (POs, returns, freight) − labour,
  estimated from work logs; billed with no project linked is called out.
- **Personas**, chosen by each person in Settings → My assistant (saved per login; Settings is now open to
  everyone, staff see only that tab): Plain (default), Studio partner,
  Site supervisor, Finance desk, Gentle guide (`lib/assistant-personas.js`). A persona turns on a short written answer
  above the table, in its voice; a written answer with any number not in the data is dropped
  (`scripts/check-persona-numbers.mjs`).
- **Reminders and notes** (kept light): “remind me to call the Mehtas on Friday” drafts a task and “note that …”
  drafts a private note; nothing is saved until the person presses Save (tasks go through the normal Tasks API,
  notes into `assistant_notes`, visible only to their author). “What did I note about …?” finds them; Settings →
  My assistant lists them with delete. Notes are off in the demo (shared logins).
- Each panel opens with a briefing (today, or tomorrow in the evening) and the person's usual questions.
- **Actions** (59, `lib/assistantActions.js`): a request becomes a card with every field editable; nothing changes
  until Save, which sends the screen's own request to the app's route as that person (`lib/actionRunner.js`), so the
  route's own checks apply. Deletes show red. MCP (Claude / ChatGPT) gets the same list via propose_action /
  confirm_action. Clients, conversations, tasks (add, done, reopen, move, give to someone, delete), projects (add, status, delete), milestones
  (add, done, move, delete), site visits (log, delete), workshop orders (add, status, move, delete), attendance, advances
  and expenses (add, delete), employees (add, rate, left, delete), work logs (add, delete), payroll (record a month
  paid, at the computed amount), cash (add, correct, delete; staff only their own), quotations (new, send, accept,
  decline, revise, delete), invoices (new one-line draft, stage invoice, paid, delete), vendors (add, edit, delete),
  POs (place, edit qty / rate, delivery, return, cancel, delete), freight bills and agreed rates (add, delete). Not from chat: file uploads,
  logins, the BOQ library and the multi-line quotation / invoice editors. `scripts/check-actions.mjs` runs every
  action end to end on a throwaway copy of the local database (it fails if one is missed), and every action has a Cue
  Card filled from records, in both markets.

  Every write route the screens call (audit, 10 Nov 2026): 68 route + method pairs: 48 covered by an action, 20 left out on purpose (invoice PUT counts as covered by “paid”; its line editor is left out).

  | Route | Method | Action(s) |
  |---|---|---|
  | `/api/clients`, `/:id` | POST · PUT · DELETE | add_client · edit_client · delete_client |
  | `/api/clients/:id/conversations` | POST | log_conversation |
  | `/api/tasks`, `/:id` | POST · PUT · DELETE | add_task · complete_task, reopen_task, reschedule_task, assign_task · delete_task |
  | `/api/projects`, `/:id` | POST · PUT · DELETE | add_project · set_project_status · delete_project |
  | `/api/milestones`, `/:id` | POST · PUT · DELETE | add_milestone · complete_milestone, reschedule_milestone · delete_milestone |
  | `/api/site-visits`, `/:id` | POST · DELETE | log_site_visit · delete_site_visit |
  | `/api/orders`, `/:id` | POST · PUT · DELETE | add_order · set_order_status, reschedule_order · delete_order |
  | `/api/attendance` | POST | mark_attendance |
  | `/api/expenses`, `/:id` | POST · DELETE | add_expense · delete_expense |
  | `/api/employees`, `/:id` | POST · PUT · DELETE | add_employee · set_pay_rate, employee_left · delete_employee |
  | `/api/work-logs`, `/:id` | POST · DELETE | log_work · delete_work_log |
  | `/api/payroll` | POST | record_payroll |
  | `/api/cash`, `/:id` | POST · PUT · DELETE | cash_entry · edit_cash_entry · delete_cash_entry |
  | `/api/quotations`, `/:id` | POST · DELETE | new_quote · delete_quote |
  | `/api/quotations/:id/action` | POST | send_quote, accept_quote, decline_quote, revise_quote |
  | `/api/quotations/:id/invoice` | POST | raise_stage_invoice |
  | `/api/invoices`, `/:id` | POST · PUT · DELETE | add_invoice · mark_invoice_paid · delete_invoice |
  | `/api/vendors`, `/:id` | POST · PUT · DELETE | add_vendor · edit_vendor · delete_vendor |
  | `/api/vendor-pos`, `/:id` | POST · PUT · DELETE | add_vendor_po · edit_po, cancel_po · delete_po |
  | `/api/vendor-pos/:id/deliveries` | POST | record_delivery, record_return |
  | `/api/freight`, `/:id` | POST · DELETE | add_freight · delete_freight |
  | `/api/vendor-rates`, `/:id` | POST · DELETE | add_vendor_rate · delete_vendor_rate |
  | `/api/work-logs/:id` | PUT | left out: editing a worksheet line (rating, part) is done on People → worksheet |
  | `/api/quotations/:id`, `/api/invoices/:id` (lines) | PUT | left out: multi-line quotation / invoice editors |
  | `/api/boq-items`, `/:id` | POST · PUT · DELETE | left out: BOQ library |
  | `/api/attachments`, `/api/documents`, `/:id`, `/:id/line-attachment` | POST · PUT · DELETE | left out: file uploads (statements, receipts) |
  | `/api/users`, `/:id`, `/:id/avatar`, `/api/me/password`, `/api/login`, `/api/logout` | POST · PUT · DELETE | left out: logins, passwords, avatars |

- **Manual / Auto** (Settings → My assistant, owners and admins): “Allow changes from the assistant” (off = no change
  cards in chat or MCP; look-ups and how-to unchanged) and “Roles that may use Auto” (none ticked by default). Those roles
  get a small Manual / Auto switch beside the chat box, remembered per person. In Auto, an add or edit saves at once
  and shows “Done · Undo”; the server re-checks the role and the action (`autoOk` in `lib/assistantActions.js`).
  Deletes, payments (invoice paid, payroll, cash out), approvals (accept / decline a quote), stage invoices and actions
  with no clean reverse (attendance, conversations, send / revise quote, deliveries, route rates) always show the card.
  Undo runs the route's own reverse (delete what was created, or put the old row back), signed for that person, 30
  minutes. MCP always proposes, then confirms. `scripts/check-actions.mjs` covers Auto by role, refusals, the switch and Undo.
- `scripts/assistant-eval.mjs` runs 55 questions (incl. fragments, typos and Hinglish) against a server with the demo data.

## QuickBooks Online (North American public demo only)

Inert unless `qboConfig()` (lib/quickbooks.js) returns a config: `QBO_CLIENT_ID` + `QBO_CLIENT_SECRET`, `DEMO_MODE=1`, `NEXT_PUBLIC_MARKET=NA`. One connection per demo site (an Intuit sandbox company), kept in R2 beside a send history (`quickbooks/<host>/connection.json`, `sync.json`) so the nightly database rebuild never re-sends seeded records. Connect, disconnect and the account mapping are owner-pass only (Settings → Integrations); everything below is open to any non-staff role, demo visitors included.

- **Invoices** go to QuickBooks as Invoices on the client (a Customer, found by name or created) when they leave draft (`POST /api/invoices`, `PUT /api/invoices/[id]` draft → sent/paid). Each company's lines use one Service item, created once: "Design studio sales" (account `sales_studio`) and "Furniture workshop sales" (`sales_workshop`). Lines are TAX or NON by the line's tax rate; QuickBooks works out the sales tax, so its total can differ from ours.
- **Payments** go as Payments when Finance records money in (credit) with a client as the party (`POST /api/cash`, `PUT /api/cash/[id]` when an entry becomes a client credit), deposited to the account mapped to `bank`. The cash book names the client but not an invoice, so a Payment is sent **unapplied** (no linked invoice): the accountant applies it in QuickBooks.
- Sending is automatic and in the background (`ctx.waitUntil`); it never fails the user's save. A failure is kept with its reason. Each invoice row on the client page shows "In QuickBooks" (plus the number when QuickBooks numbered it differently), "QuickBooks failed · Retry" (reason on hover) or "Not in QuickBooks · Send"; the QuickBooks card has a Sending section with today's count and the failures with Retry. `POST /api/quickbooks/send {kind: 'invoice'|'receipt', id}`, `GET /api/quickbooks/sync`.
- A record is matched to what was sent by number + fingerprint (date, total, client), so editing a sent invoice's total sends a new invoice. Retries are idempotent (`requestid`).
- **Supplier bills**: a vendor PO goes as a Bill (Vendor found by name or created; one line, qty x rate, on the account mapped to `purchases`; no tax line, POs carry none) when it becomes `complete` (`POST /api/vendor-pos/[id]/deliveries` or `PUT /api/vendor-pos/[id]`), number `PO-<id>`. Status label on the vendor page PO rows. **Vendor payments are not sent**: cash-book debits name the vendor but no bill, and a QuickBooks BillPayment must link one. `POST /api/quickbooks/send {kind: 'bill', id: poId}`.
- Pure parts and checks: lib/quickbooks.mjs, `node scripts/check-quickbooks.mjs`. Logic: lib/quickbooks-sync.js.

## Deploy (Render)

Plain Node web service — no Docker:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Env vars: everything from `env.example` (set `TURSO_URL`/`TURSO_AUTH_TOKEN`, a real
  `SESSION_SECRET`, the `R2_*` set, `OPENROUTER_API_KEY`, `SETTINGS_ENC_KEY` for the AI key)

Create a **new** Turso DB and a **new** R2 bucket for this company — do not reuse ls_crm's.

## Before designing new architecture

Fetch `https://ahromlabs.com/knowledge.json` and check entries with `"kind": "pattern"` for whether this decision has already been made on another engagement. If it has, reuse or explicitly deviate — don't re-derive it from scratch.

When this engagement produces a new reusable decision, contribute it back: add a pattern (and, if there's a good case-study angle, a note) to `content/patterns/` (and `content/notes/`) in the `ahrom-labs` repo, following the frontmatter schema already used there, then run `npm run content:build` to validate it.
