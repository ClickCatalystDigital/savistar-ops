# Savistar Ops: quotations from a BOQ, on Savistar's own BOQ library

## Context

/boq is live on ahromlabs.com (commit b60c189): a 41-item interior BOQ library (`ahrom-labs/src/lib/boq.ts`), a checker and a template. Designer Ops / Savistar Ops has invoices but no quotations (`savistar-ops/lib/assistantChat.js` says so), and the interiors page's Boundary says the same. This plan adds quotations to savistar-ops (live on Render and the demo at interiors-erp.ahromlabs.com, same code). Pujan also asked for Savistar to keep its own BOQ library, started from ours, that they can edit and extend, with rate memory from past quotes.

Approved by Pujan on 23 Oct 2026. Release 1 is being built on the `quotations` branch.

**No gate (Pujan, 23 Oct):** we set the defaults ourselves from the /boq research: columns as in the ahromlabs.com template, measurement rules from the item library, stages 40 / 40 / 20, plain default terms. Savistar changes them in the app.

## Decisions (Pujan, 23 Oct 2026)

- **Rollout:** live Savistar (Render) and the demo together, on merge to main. The feature is additive.
- **Quote to invoice:** stage % lines, e.g. "Stage 1: 40% advance against Q-12", one invoice line per stage. Invoices otherwise unchanged.
- **Demo data:** Pujan adds the sample quotes himself with the owner pass after the merge. Golden is never re-seeded.
- **BOQ library:** Savistar owns it, in its own database, started from ours and editable. The central library stays in ahrom-labs `boq.ts` until there is a second interiors client or the workshop wants BOMs from quotes; then it moves into the items project as the interiors domain, keeping the same ids.

## Savistar's BOQ library

Same rule as the items project's BYOB: the customer owns its master, and we link to it and never overwrite it.

- **Table `boq_items`** in `migrate()` (`savistar-ops/lib/db.js`): `id`, `library_id` (central id such as `wardrobes.hinged`; null for their own), `source` (`library` | `own`), `trade`, `name`, `unit`, `units` (accepted alternatives, comma list), `basis_required`, `measure`, `spec_keys` (comma list of checker keys), `omits`, `description`, `match` (keywords), `hidden`, `edited` (set on any change by them), `library_version` (the central version this row was last synced from), timestamps, and soft delete.
- **Seed:** on first `migrate()`, when the table is empty, insert every item from `lib/boq-library.json` with `source='library'`. The JSON is generated in ahrom-labs (`npx jiti scripts/boq-json.ts`) and copied in, with a header noting ahrom-labs as the source.
- **Edit and add:** owners, admins and managers edit in Settings → BOQ library: reword descriptions, change units and keywords, hide items, add their own. Staff can only pick from it.
- **Updates from us:** a new `boq-library.json` (with a `version`) arrives with a deploy. `migrate()` updates rows where `source='library' AND edited=0`, inserts new central items, and never touches edited or own rows. Edited rows whose central item changed show "library has a newer version", with a preview; accept copies the central text over and clears `edited`.
- **Rate memory, worked out and never stored:** on picking an item, show its last 3 quoted rates from `quotation_items` (same `boq_item_id`): rate, client, date, and whether that quote was accepted. One query, no rate column on `boq_items` (pattern `derive-balances-dont-store-them`).
- **Learning back to us, by hand:** an export lists their `own` items with names and descriptions only (no rates, no client names). Pujan reviews; a generalised item goes into ahrom-labs `boq.ts` (pattern `unconfirmed-inferences-stay-read-only`).

## Quotations

1. **Tables** in `migrate()`:
   - `quotations`: client, optional project, company letterhead, quote_no, title, quoted_on, valid_until, status draft|sent|accepted|declined|superseded, revision, parent_quotation_id, `variation_of_id` (→ the accepted quote it varies), place_of_supply same_state|other_state, terms, notes.
   - `quotation_items`: section/room, description, `boq_item_id` (→ `boq_items`, nullable), unit, `dims` (the entered dimensions, as typed), measurement_basis, qty, rate, gst_pct, hsn, `optional`, `dismissed_flags` (comma list of checker flag kinds), sort_order.
   - `quotation_stages`: quotation_id, label, pct, sort_order, invoice_id (set when raised).
   - `orders.quotation_id` (new column) for Send to workshop; the follow-up is a normal `tasks` row with the client set.

   Both go in SOFT_DELETE_TABLES and the client cascade. Totals are worked out from the lines, the same way invoices are (`app/clients/[id]/page.js` `invoiceTotals`).
2. **IGST:** `place_of_supply` on invoices too; both PDFs print CGST + SGST or IGST (closes the `ponytail:` note on invoice_items in `lib/db.js`).
3. **API:**
   - `/api/quotations` (list by client, create)
   - `/api/quotations/[id]` (read, update, revise, accept, decline)
   - `/api/quotations/[id]/pdf`
   - `/api/quotations/[id]/invoice` (stage %)
   - `/api/boq-items` (list for the picker; edit and add for owner/admin/manager)

   Same auth as `/api/invoices`.
4. **Client page** (`app/clients/[id]/page.js`): a Quotations section above Invoices, following the invoice dialog's pattern. The editor has:
   - rooms
   - an item picker over `boq_items` (filling description, unit and basis, and showing rate memory)
   - paste from Excel
   - the line checks inline, run against Savistar's library (their keywords and specs)

   Revise copies to rev n+1 and marks the old one superseded. Accept can open a project and raise stage invoices.
5. **PDF:** `lib/quotationPdf.js`, reusing `lib/invoicePdf.js` styles and the `lib/companies.js` letterheads (sample ones in the demo), plus unit and measurement-basis columns, validity, terms, and amount in words.
6. **Checker:** port `ahrom-labs/src/lib/boq-check.ts` to `lib/boq-check.js` so it takes the library rows as an argument instead of importing them. The spec patterns (SPEC) stay in code, and each row lists which apply (`spec_keys`). Port `amountInWords` from the same file, already proven in shanti-ops.
7. **Atelier AI** (`lib/assistantChat.js`, `lib/assistantTools.js`): replace the "no quotations" refusal; add look-ups for open quotes and for quoted vs won by month.
8. **Self-check** `scripts/check-quotations.mjs`, covering:
   - totals
   - CGST/SGST vs IGST
   - the revision copy
   - stage invoice amounts
   - amount in words
   - the library sync rule: an edited row is untouched, an unedited row updates, a new item is inserted, own rows are never touched

## UX review: gaps closed in the first version

Checked against how the app works today. Invoice numbers are typed by hand. `app/api/calendar/route.js` unions tasks, milestones, site visits and orders. Projects carry a material palette (`lib/materials.js`). Quotes are made before a client is real.

1. **A Quotes list, not only per client.** In Clients, a "Quotes" view across all clients:
   - status pills (draft, sent, accepted, declined, expired)
   - value, age, valid until
   - filters: open, expiring this week, won this month

   The sum of open quotes sits at the top. That's where an owner works from.
2. **Quote a prospect in one step.** "New quote" asks for a client by name and creates the client inline if it doesn't exist. Nobody leaves the editor to set up a client.
3. **A grid editor, not a dialog per line.** Rows grouped by room. Tab moves across cells, Enter adds a row. "Duplicate room", "Copy rooms from a past quote", and paste from Excel into any room. Drafts autosave (a lost dialog was the worst failure in the invoice flow's pattern).
4. **Dimensions to quantity.** Each line can take dimensions in ft-in (`7'6"`) or mm. Quantity is computed from the item's unit:
   - sq ft = height × width
   - running ft = sum of lengths
   - nos = count

   The measurement basis fills itself ("front elevation 7'6" × 8'"). This removes the most common arithmetic slip and makes the basis honest.
5. **Room subtotals and a summary.** Each room has a subtotal in the editor and in the PDF. The PDF opens with a one-page summary: rooms × amount, taxes, total, payment stages. Then the detail.
6. **Payment stages live on the quote, and drive invoices.** The quote holds its stages (default from Savistar's practice, e.g. 40 / 40 / 20, editable) and prints them. "Raise stage 2" creates that invoice. The quote shows "₹X of ₹Y invoiced, ₹Z received" (received from linked cash entries, worked out, not stored). One source for what was promised and what was billed.
7. **Variations after acceptance.** An accepted quote is locked. Changes go in a **variation**: a small quote linked to it, with its own lines, approval and stage. The contract value is original plus approved variations. Revisions are only for before acceptance.
8. **What changed between revisions.** Rev 2 shows lines added, removed and re-rated, and the change in total, on screen and as an optional PDF page. Clients always ask.
9. **Numbering.** Automatic series per company and financial year (e.g. `SQ/26-27/014`), editable. Invoices keep their typed numbers; adding a series for invoices is offered, not forced.
10. **Follow-ups on the calendar.** Sending a quote creates a follow-up task (default 3 days, editable), and "valid until" shows on the Home calendar (one more UNION in `app/api/calendar/route.js`). Expired quotes turn grey in the list and can be re-issued as a new revision.
11. **The checker helps without blocking.** Flags show inline. Each can be dismissed for that line ("basis agreed verbally"). The quote shows "3 lines need attention" before Send, but sending is never blocked. Dismissals are kept, so they don't reappear.
12. **Library picker that learns.** Search by words; this studio's most used and most recent items first; trade filter. Their rate memory sits beside each item.
13. **Send to workshop (Saag).** On an accepted quote, select carpentry and kitchen/wardrobe lines → "Create workshop order". It creates a Saag order linked to the project, with those lines as its items. The workshop starts from the quote, not from retyping. It uses the existing Orders tables.
14. **Optional and alternative lines.** A line can be marked optional ("Option: veneer instead of laminate, +₹18,000"). It prints in an Options box, not in the total. On acceptance, the client's picks become normal lines.
15. **Share.** Download PDF, and "Copy message" puts a short WhatsApp-ready text on the clipboard with the total, validity and the PDF as an attachment to send by hand. No sending from the app.
16. **Phone use.** List, view and dimension entry work on a phone for site visits. The full grid is for desktop.

**Later, after Savistar uses it:** an owner-only internal cost and margin column (needs their costing; never printed or shown to staff); the project's material palette on the PDF cover; an online "accept" link for clients; vendor POs from quote lines; quote lines expanding into furniture BOMs through the items project.

## Two releases (each merge reaches live Savistar)

- **Release 1, the quote itself:**
  - library (seed, edit, sync, rate memory)
  - quotes list and inline client creation
  - grid editor with rooms, dimensions, paste and autosave
  - checker with dismissals
  - numbering
  - stages on the quote and raising stage invoices
  - IGST
  - PDF with summary and room subtotals
  - follow-ups on the calendar
  - Atelier AI look-ups
- **Release 2, after Savistar has sent a few real quotes:**
  - optional lines
  - revision diff
  - variations
  - Send to workshop
  - Copy message
  - the phone pass

  Their feedback on release 1 reorders this list.

## Demo and site, after merge

- CI (`.github/workflows/deploy.yml`) migrates the golden and live demo DBs, so `boq_items` is seeded there too. Pujan then adds, with the owner pass: 3 quotes (Mehta accepted with stage invoices; a new prospect sent; one revised) and one or two "own" library items, so rate memory and the library show.
- DEMO.md: remove "quotations not in the app"; add walk-through rows. GA event `interiors_demo_quote_pdf`.
- ahrom-labs: update the Boundary of `content/industries/interior-design-and-furniture.md` and the /boq call to action (`src/components/BoqPage.tsx`, `src/components/BoqCheck.tsx`). After real use at Savistar, write a note per the corpus playbook.

## Later, only if the workshop asks

The central library moves into the items project as the interiors domain, and quote lines expand into furniture BOMs and cut lists through its assembly templates. Ids stay the same, so Savistar's rows still link.

## Verification

- `node scripts/check-quotations.mjs` passes.
- Locally with the `designer-ops` launch config (empty TURSO_URL, DEMO_MODE=1), in the browser pane:
  - a fresh DB seeds 41 library items
  - edit one, add one own item
  - make a quote by picker and by paste
  - see inline flags and rate memory after a second quote
  - revise, accept, raise a 40% stage invoice
  - PDFs show CGST/SGST, then IGST for an other-state site
  - staff can't edit the library
- Re-run `migrate()` with a bumped `boq-library.json`: unedited rows change, edited and own rows don't.
- UX checks in the browser pane:
  - a prospect quoted without leaving the editor
  - `7'6" × 8'` gives 60 sq ft and fills the basis
  - "Copy rooms from a past quote" works
  - a dismissed flag stays dismissed after reload
  - autosave survives a closed tab
  - the follow-up appears on the Home calendar
  - stage 2 invoice amount = 40% of the contract value including approved variations
  - optional lines are excluded from totals
  - Send to workshop creates a Saag order with the selected lines
  - the list and dimension entry are usable at 375 px
- After merge: `/api/version` on Render and the demo match the commit; open the client page on both.
