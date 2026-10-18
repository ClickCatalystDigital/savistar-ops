# Designer Ops — YouTube demo flow

**Length:** about 6–7 minutes · **Site:** interiors-erp.ahromlabs.com · **Sample company:** Acme Interiors (studio) + Acme Furniture (workshop)

One story runs through the whole video: *a design studio and its own furniture workshop, run from one place.* Each
scene answers "where does this live today?" (WhatsApp, Excel, a notebook) with one screen. The AI comes last, as the
payoff: by then the viewer has seen the data, so the answers mean something.

---

## Before you record

- [ ] PR #3 merged and deployed; `/api/version` on the demo shows the merge commit.
- [ ] Demo Worker has its `OPENROUTER_API_KEY` secret (otherwise the butterfly button is hidden).
- [ ] `demo-data` branch pushed, golden DB re-seeded and reset, so Clients, invoices, palettes and photos are the new ones.
- [ ] **Questions:** a demo visitor gets only 2 AI questions. For the recording, either run a local copy of the demo
      data (`DEMO_MODE=1` dev server, see DEMO.md) or record the AI part signed in to a non-demo copy, so you can ask 10+.
- [ ] Browser at 1440×900, light mode, zoom 110%. Hide the bookmarks bar. Decline the analytics banner before you start.
- [ ] Rehearse once: Jev answers in about 1–2 seconds, write mode (personas) in 3–5.

---

## 0 · Hook (0:00–0:15)

> "This is how an interior design studio with its own furniture workshop runs everything — projects, clients,
> the workshop floor, vendors and money — in one app. And at the end, an assistant you can just *ask*."

On screen: Home, already signed in as **Meera Shah (owner)**. Hover the butterfly in the corner once: wings flutter,
"Atelier AI" slides out on a sticky note. Don't open it yet.

## 1 · Getting in (0:15–0:35)

- `/demo` → the short form → pick **Owner**.
- Say: "Three sample logins — owner, manager and office staff — each sees what their role allows."

## 2 · Home (0:35–1:05)

- Month calendar: tasks, project milestones, site visits and workshop due dates in one view.
- Today and overdue tasks on the right; tick one done.
- Say: "The morning question — *what's on today?* — answered before you open anything else."

## 3 · Clients (1:05–1:50)

- **Clients → Anand & Priya Mehta.**
- The conversation log reads like a notebook: every call and site discussion, pinned to the project.
- Two invoices: stage 1 paid, stage 2 sent and outstanding. Open the **GST PDF**: Acme Interiors letterhead, CGST/SGST split.
- Say: "No more scrolling WhatsApp to find what the client said."

## 4 · Projects (1:50–2:40)

- **Projects → Mehta bungalow**: milestones half done, the dotted timeline, site visits with the address, linked
  workshop orders and vendor POs, the material palette and photo mood board.
- Back to Projects: point at the stamps. **Kapadia living room** completed, **Trivedi clinic** on hold, **Vora penthouse** cancelled.
- Say: "One page per project — design, site, workshop and purchases together."

## 5 · Orders: the workshop (2:40–3:15)

- The board: pending → in progress → done → delivered. Drag one ticket across.
- Open **Cafe counter with fluted front**: the work history shows who worked on which part, on which day, and the rating.

## 6 · People (3:15–3:50)

- The daily worksheet: one tap for P / ½ / A, in and out times, each person's work on an order with a rating.
- Payroll: computed from days × rate minus advances. Point at Imran's advance being recovered.

## 7 · Vendors (3:50–4:20)

- **Shree Plywood Traders**: a partial delivery with a return. Outstanding = ordered − delivered + returned, automatically.
- **Sardar Transport**: the Gandhinagar trip is flagged red, *above the rate card*.
- Say: "It catches the overcharge so you don't have to."

## 8 · Finance and roles (4:20–4:45)

- Cash book with receipts that match the invoices, and the running balance.
- Switch login to **office (Kavya Patel)**: same Finance tab, only her own entries; Home shows only her tasks.
- Say: "Everyone sees what their role should — enforced on the server, not just hidden in the UI."

---

## 9 · Atelier AI (4:45–6:45) — the payoff

Switch back to **owner**. Click the butterfly.

**The opening:** a briefing on a sticky note: what's on the calendar today, overdue tasks, late orders, unpaid
invoices, clients gone quiet. Say: *"Before I've asked anything, it has told me what needs attention."*

Then ask, in this order (each one has been tested on the sample data):

| # | Ask | Why it lands |
|---|---|---|
| 1 | **How is the Mehta bungalow going?** | A whole project on one card: milestones, next step, site visits, orders, POs, invoiced vs paid. *"That's a 10-minute status call."* |
| 2 | **Who owes us money?** | Unpaid invoices with GST and days late, for both companies. |
| 3 | **Did Sardar Transport overcharge us?** | Finds the overcharge and the exact rupees above the rate card. |
| 4 | **Which clients haven't we spoken to in a while?** | Active clients with no conversation in 14 days. The one nobody remembers to check. |
| 5 | **How much did we invoice this month compared to last month?** | A side-by-side with the change, split by company and GST. Follow with **"and last month?"** to show it remembers the context. |
| 6 | **Who worked on the cafe counter?** | The workshop's work history: people, days, hours, average rating. |
| 7 | **Which workshop orders are late, and which milestones are overdue?** | Two answers from one question. |
| 8 | **Are we delivering orders on time?** | Average days from start to delivery and the on-time share. |
| 9 | **Remind me to call the Mehtas on Friday** | Drafts a task with the date and the client attached; press **Save** and it's on Home. *"It doesn't do anything without you."* |

**Two trust moments** (short, but they sell it to a business owner):

- **Mark the Mehta invoice paid** → *"I can only look things up — I can't change anything."*
- **What profit did we make on the Kapadia job?** → it says plainly that projects don't carry their costs, instead of
  making a number up. Say: *"It would rather say 'I don't know' than guess with your money."*

**Personality (15 seconds):** Settings → **My assistant** → pick **Finance desk**. Ask **Who owes us money?** again: the
same table, now with a short accountant-style summary on top. Say: *"Same numbers, your preferred voice — and if a
written answer ever contains a number that isn't in the data, it's thrown away."*

## 10 · Close (6:45–7:00)

> "Projects, clients, workshop, people, vendors and money in one place — and an assistant that answers from your
> real data, without ever touching it. Try the demo at interiors-erp.ahromlabs.com, or talk to us at ahromlabs.com
> about setting it up for your studio."

---

## Questions to keep in reserve (all tested)

- What's on this week? · Anything due tomorrow?
- Which projects are on hold?
- What material is still to be delivered?
- How much have we spent with vendors?
- Payroll for last month · Advances not recovered yet
- Who's doing the best work?
- Who is in today?
- How do I log a site visit? (how-to answers from the app's own guide)

## Avoid on camera

- Bank statements (not part of the assistant; the demo blocks uploads anyway).
- "Note that …" on the demo: notes are off there, because demo logins are shared. Show reminders instead.
- Very short fragments like "late orders and overdue milestones": full sentences route best.
