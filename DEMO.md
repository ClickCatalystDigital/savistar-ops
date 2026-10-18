# Public demo — interiors-erp.ahromlabs.com

Added 2026-10-13 on the `workers-demo` branch. Same code as the live Savistar app on Render; mirrors SB Ops' demo (shanti-ops).

## Next 15 + React 19, two targets

- **Upgrade.** Next 14.2 → 15.5, React 18 → 19. `getSessionUser()` / `getUserFromRequest()` (`lib/auth.js`) are async, every caller awaits them, and route handlers read `const params = await ctx.params`.
- **Render (live):** unchanged commands, `next build` / `next start`. Nothing Workers-specific runs there.
- **Workers (demo):** `npm run cf:build` sets `SAV_TARGET=workers` (`next.config.js` swaps `lib/db-client.js` for `lib/db-client.workers.js`, libsql's web client) and `NEXT_PUBLIC_DEMO=1`, then OpenNext. `scripts/demo/patch-yoga.mjs`, `strip-route-manifests.mjs` and `relative-wasm-imports.mjs` are copied from shanti-ops (react-pdf's wasm and the Worker size limit). The build drops `public/logos` from the demo's assets.

## Demo-only behaviour (inert without `DEMO_MODE=1`)

- **Made-up names.** `lib/brand.js` (product Designer Ops for Acme Interiors / Acme Furniture, vs Savistar Ops for Savistar Interiors / Saag Furniture) and `lib/companies.js` (sample letterheads, no logos, an obviously fake GSTIN). Stored keys stay `savistar` / `saag`.
- **Entry.** `/demo` → `POST /api/demo/lead` (separate leads DB, `LEADS_TURSO_URL`) → `POST /api/demo/enter` as `owner`, `manager` or `office` (`lib/demo-roles.js`).
- **Guard.** `middleware.js` `demoGuard`: `/login` → `/demo`, `/api/login` 404, writes to `/api/users`, `/api/attachments` and `/api/documents` refused. `SESSION_SECRET` is required (no fallback) when `DEMO_MODE=1`.
- **AI assistant (Designer AI).** Two questions per visitor: `/api/demo/lead` sets `demo_lead` to a random token stored on the lead row, and `demo_leads.ai_used` counts questions (lib/demo-leads.js), so the nightly reset doesn't refill them; a failed answer gives the question back. Then the button locks and shows an overlay pointing to Ahrom Labs. The guard allows only `/api/assistant/chat`, `briefing`, `starters` and `feedback`: no AI settings, key, model list or logs. The key is the Worker secret `OPENROUTER_API_KEY` (a separate, credit-capped OpenRouter key); without it the button is hidden. Data questions are always on (the data is made up). GA events `interiors_demo_ai_question` / `interiors_demo_ai_limit`.
- **Layout.** Demo banner, GA consent (`components/DemoAnalytics.jsx`, shared ahromlabs.com cookie), noindex except `/demo`. `SKIP_MIGRATE=1`: the demo DB is built ahead of time.

## Data and deploy

- **Turso group `savdemo`:** `sav-demo` (what the Worker uses), `sav-demo-golden` (the copy it is reset from), `sav-demo-leads`.
- **Seeding.** `scripts/demo/seed.mjs` runs against a Node build pointed at an empty golden DB (see the file's header). Always run `scripts/demo/scrub-check.mjs` before publishing a golden DB.
- **Reset.** `workers/demo-reset-cron` recreates `sav-demo` from golden at 03:30 IST. Deploy with `npx wrangler deploy -c wrangler.jsonc` from its folder. Manual run: `POST https://savistar-ops-demo-reset.pujan-5d8.workers.dev` with header `x-trigger-key` (`RESET_TRIGGER_KEY` in the gitignored `.demo-secrets`).
- **Deploy the demo:** `npm run cf:deploy` (worker `savistar-ops-interiors-demo`). It first runs `scripts/demo/migrate.mjs` (the app's own `migrate()` on the golden and live demo DBs), so a schema change in `lib/db.js` reaches the demo and survives the nightly reset. Once this branch is merged, a push to `main` runs `.github/workflows/deploy.yml`: the Node build, then the demo (migrate + deploy), then a check that Render serves the same commit, each confirmed through the public `/api/version`. Secrets and the `CLIENT_URL` variable are listed at the top of the workflow. Secrets: `TURSO_AUTH_TOKEN` (`savdemo` group token) and `SESSION_SECRET` (its own).
- **Dates drift.** Data is dated at seed time; re-seed every month or two.

## Fix found on the way

`users.avatar_color`, `avatar_font` and `avatar_image_key` existed on the live DB but not in `migrate()`, so a new database failed `GET /api/users/assignable`. They are now added in `migrate()`; on the live DB this does nothing.
