Guidepost is job search management tool built on NextJS, Typescript, SerpAPI, Supabase, and Gemini. It automatically finds job listings matching users' resumes, scores them, and tracks applications through a dashboard. It is deployed on Vercel and uses its built-in cron for daily ingestion.

## Commands

- `npm run dev` / `npm run build` — Next.js 16 (Turbopack)
- `npm test` — Vitest, 234 unit tests under `src/**/*.test.ts`
- `npm run lint` — ESLint (eslint-config-next)
- `npx tsc --noEmit` — typecheck

## Conventions & constraints

- **Auth is proxy-based**: `src/proxy.ts` redirects unauthenticated users to `/login` and blocks non-GET `/api/` calls for the demo account (`demo@guidepostai.app`, public credentials by design). Route handlers rely on Supabase RLS for per-user scoping — always use `createClient()` from `src/lib/supabase/server` for user-scoped queries.
- **Service-role client** (`src/lib/supabase/service.ts`) bypasses RLS — cron and backups only, never in user-facing routes. When querying shared tables with it, filter `user_id` explicitly.
- **Cron endpoint** `/api/cron/daily-search` is excluded from the proxy matcher and authorized via `CRON_SECRET` bearer token. It also runs the DB backup, backup pruning (30d), dismissed-job cleanup (3mo), and log pruning (14d).
- **Storage buckets**: `resumes` (per-user folder `<user_id>/`), `pipeline-logs` and `db-backups` are service-role-only — never grant `authenticated` policies on them (backups contain all users' data).
- **Gemini** (`@google/genai` SDK; the old `@google/generative-ai` is archived): `generateWithFallback()` in `src/lib/gemini.ts` provides the 3-model fallback chain; match scoring batches 5 jobs per call (descriptions truncated at 4000 chars). Scoring uses JSON mode (`responseJsonSchema` option on `generateWithFallback()`); 429s fall through to the next model. Failed jobs get one retry in the same run; if still failed they return `failed: true` and are not inserted, so they get rescored if they reappear.
- **SerpAPI budget**: max 8 calls per search run, 1 call per page, up to 2 pages per query (250/mo free tier). Listing age is applied by appending Google's date phrase to `q` (e.g. "in the last week"); no `uds` discovery call. `allocateQueryBudget()` (`src/lib/search/query-budget.ts`) splits the 8 calls round-robin across users, then their resumes; leftover calls fetch page 2 (`next_page_token`) of the queries with the most new page-1 candidates. A single user uses all 8 calls/day (~240-248/mo on cron alone). SerpAPI now returns metadata in an `extensions` string array; read it via `getJobExtensions()`.
- **Dedup**: by URL plus `buildJobDedupKey(title, company, location)` to catch reposts with rotating apply URLs.
- **Demo email**: use `DEMO_EMAIL` from `src/lib/demo-account.ts` (SQL policies keep the literal).
- **Demo account**: writes blocked at proxy AND by restrictive RLS policies on all tables + storage.objects (migration 009, keyed on JWT email); also blocked from `/api/logs`. Seed via `npx tsx scripts/seed-demo.ts` (service role, since RLS denies demo writes). `/api/logs` reads `pipeline-logs` via the service client because the bucket has no authenticated policies.
- **DB schema**: fresh installs use `supabase/setup.sql`; `supabase/migrations/` is the incremental history for existing deployments (latest: 011 accepted/declined application statuses).
- **Application statuses**: `applied → screening → interview → offer`, then terminal `accepted`, `declined`, `rejected`, `ghosted`. Accepted/declined are offer outcomes — the status-change trigger maps them to `furthest_stage = 'offer'`; declined is NOT in the rejection funnel (it's a user decision, not a company rejection).
- **Search filters are per user**: `search_filters` has one row per user (unique `user_id`, no `resume_id`), edited at `/filters` via `/api/filters`, and applied to all of the user's active resumes. Input is validated by `parseSearchFilterInput()` (`src/lib/search-filter-input.ts`).
- **Job titles** live in `resumes.parsed_data.job_titles` and are editable via `PATCH /api/resumes/[id]` (`normalizeJobTitles()`, max 8). Up to 4 are searched per run; with more than 4, a daily rotation (`dayIndex()`) picks which window of 4.
- **Docs**: `README.md` is public-facing; `DEPLOY.md` has deploy steps; `TODO.md` tracks findings/tasks (canonical structure — user list, severity sections, completed).
