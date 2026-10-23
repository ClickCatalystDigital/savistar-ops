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
app's data. Ported from reel-inventory's LS AI: Jev (`typesafe/jev-1.13`, via OpenRouter) only *chooses*
the kind of question, the look-up, company, period and follow-up; code matches the names (clients,
projects, orders, vendors, people) and runs a fixed, parameterised query (`lib/assistantTools.js`, 27
look-ups that use the same maths as the tabs). Answers are ledger tables, optionally with a short
summary from a writing model. It never changes data.

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
- `scripts/assistant-eval.mjs` runs 55 questions (incl. fragments, typos and Hinglish) against a server with the demo data.

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
