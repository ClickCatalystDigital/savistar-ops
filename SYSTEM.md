# SAVISTAR-OPS

Operations platform for **Savistar** (interior design — projects with milestones, site visits,
client conversations) and **Saag** (furniture workshop — orders, employees, vendors). Same owners,
one app, one combined finance book.

Next.js 14 (App Router) · shadcn/ui · Turso (libSQL, local SQLite fallback) · JWT auth ·
Cloudflare R2 for files · OpenRouter for bank-statement extraction · `@react-pdf/renderer` for
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

## Deploy (Render)

Plain Node web service — no Docker:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Env vars: everything from `env.example` (set `TURSO_URL`/`TURSO_AUTH_TOKEN`, a real
  `SESSION_SECRET`, the `R2_*` set, `OPENROUTER_API_KEY`)

Create a **new** Turso DB and a **new** R2 bucket for this company — do not reuse ls_crm's.

## Before designing new architecture

Fetch `https://ahromlabs.com/knowledge.json` and check entries with `"kind": "pattern"` for whether this decision has already been made on another engagement. If it has, reuse or explicitly deviate — don't re-derive it from scratch.

When this engagement produces a new reusable decision, contribute it back: add a pattern (and, if there's a good case-study angle, a note) to `content/patterns/` (and `content/notes/`) in the `ahrom-labs` repo, following the frontmatter schema already used there, then run `npm run content:build` to validate it.
