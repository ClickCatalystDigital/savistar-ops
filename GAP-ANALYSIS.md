# Gap analysis — work of 18 Oct 2026

## What shipped today

| Where | What | State |
|---|---|---|
| **savistar-ops** (PR #3 + 2 follow-ups on `main`) | **Atelier AI**: Jev routing, 23 read-only look-ups on this app's own data, follow-ups, period comparisons, two-part questions, briefing, "your usual", thumbs + misses list, personas with a number guard, reminders (drafted tasks) and private notes, butterfly button, Settings → Users / My assistant, phone and iPad layouts | **Demo: live.** **Live app: not yet** (see 1) |
| savistar-ops demo | 2 free questions per visitor, lock + overlay, owner pass (PIN), Ahrom Labs logo | Live, tested |
| **reel-inventory** demo | Owner pass (PIN), logo | Live, tested; lstechnologies.in redeployed (pass inert there) |
| **shanti-ops** demo | Owner pass (PIN), logo | Live, tested; shantiops.onrender.com redeployed (pass inert there) |
| Docs | DEMO-VIDEO.md (recording script), README/DEMO.md/SYSTEM.md sections, eval scripts | Done |

Evidence: 55/55 eval questions and 57 unseen real-world phrasings route correctly (demo data, real Jev); persona
number guard check passes; staff scoping, notes privacy, demo limits and pass try-limits tested; all builds pass.

---

## Gaps, most important first

### Must do before calling it done

1. **The live Savistar app is still on f5bee4f — none of today's AI is live for the client.** Render didn't deploy
   on push for PR #2 or PR #3 (shanti-ops' Render service does auto-deploy, so it's this one service). Today's
   deploy run 39110358370 failed only at the Render check.
   → Render → savistar-ops → **Manual Deploy → Deploy latest commit** (4e61ce1). Then **Settings → Build & Deploy**:
   check the repository is `ClickCatalystDigital/savistar-ops` (the org was renamed; a stale link would explain no
   webhook) and Auto-Deploy is *On Commit*. After it's live: open the app as an owner, Settings → My assistant →
   Test connection, and ask three real questions.

2. **The live data hasn't met the assistant yet.** Every test ran on demo data. Real client and project names,
   real volumes and real wording will differ.
   → For the first week, check Settings → My assistant → "Questions it couldn't answer" every few days and add
   look-ups or keywords from it.

3. **`demo-data` branch is unpushed** (d1fa317, 7492940 on top of c47f2bb), plus an uncommitted README → SYSTEM.md
   rename in the main checkout. The demo still runs the older seed, so the photos/palettes in DEMO-VIDEO.md
   aren't there yet.
   → Merge `origin/main` into `demo-data` (README.md changed on main since; commit the rename after the merge),
   push, re-seed the golden DB (DEMO.md), run `scrub-check.mjs`, trigger the reset Worker.

### Should do soon

4. **The two "free" demos run a different assistant.** reel-inventory and shanti-ops have their own (older) AI —
   no personas, notes, butterfly or the real-world phrasing fixes. Fine for now; worth porting the routing fixes
   (named-record rescue, keyword agreement, two-part split) since they're small and generic.

5. **Eval isn't in CI.** `scripts/assistant-eval.mjs` needs a running server and costs a few cents, so it only
   runs by hand. `scripts/check-persona-numbers.mjs` is free and could run in the `checks` job today.

6. **Jev is an alpha API** (`/api/alpha/decisions`, `typesafe/jev-1.13` pinned). If OpenRouter changes or drops
   it, the keyword router takes over (lower quality, never wrong data). Watch OpenRouter's changelog; keep the pin.

7. **Owner pass trade-off.** A 4-digit PIN with caps (5 wrong per IP, 200 per day overall). Someone who wants to can
   burn the 200 and switch the pass off for that UTC day (an annoyance, not a breach). If that ever happens, change
   `DEMO_PASS` to anything new. Remember: set it as a **Secret**, never a Text variable (a deploy wipes those — that
   is what happened today).

8. **Cost visibility.** Personas add a writing-model call per data question; the demo's 100-questions/day cap is
   shared by all visitors (owner pass included). OpenRouter credit is shown in Settings, but nothing alerts when it
   runs low. → Set a low-credit email alert in OpenRouter for both keys.

### Nice to have / known limits

9. Reminders: "next Friday" means the coming Friday; no time of day; only for yourself. Notes can't be edited
   (delete and re-add). Notes are off in the demo.
10. Very terse two-word fragments can still route oddly; the misses list is the feedback loop.
11. The app's top nav overflows at exactly iPad-portrait width (768px) — pre-existing, not from today.
12. Staff can see payroll on the People tab (by design per SYSTEM.md), but the assistant refuses payroll to staff.
    Stricter, not a leak — decide which one you want and make them match.
13. Housekeeping: worktrees `~/Developer/savistar-ops-assistant`, `ls-inventory-pass`, `shanti-ops-pass` and their
    `assistant` / `demo-pass` branches are merged and can be removed; `.claude/launch.json` has two test configs
    (`assistant-dev`, `assistant-demo`) you may keep or drop.

---

## Suggested order for tomorrow

1. Render manual deploy + fix the repo link (10 min) → test the AI on live data.
2. Push `demo-data`, re-seed, reset the demo (30 min) → record the video from DEMO-VIDEO.md using the 7878 pass.
3. One week later: read the misses list, add what's missing, port the routing fixes to the other two demos.
