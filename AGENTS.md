Guidepost is job search management tool built on NextJS, Typescript, SerpAPI, Supabase, and Gemini. It automatically finds job listings matching users' resumes, scores them, and tracks applications through a dashboard. It is deployed on Vercel and uses its built-in cron for daily ingestion.

## Commands

- `npm run dev` / `npm run build` — Next.js 16 (Turbopack)
- `npm test` — Vitest, 171 unit tests under `src/**/*.test.ts`
- `npm run lint` — ESLint (eslint-config-next)
- `npx tsc --noEmit` — typecheck

## Conventions & constraints

- **Auth is proxy-based**: `src/proxy.ts` redirects unauthenticated users to `/login` and blocks non-GET `/api/` calls for the demo account (`demo@guidepostai.app`, public credentials by design). Route handlers rely on Supabase RLS for per-user scoping — always use `createClient()` from `src/lib/supabase/server` for user-scoped queries.
- **Service-role client** (`src/lib/supabase/service.ts`) bypasses RLS — cron and backups only, never in user-facing routes. When querying shared tables with it, filter `user_id` explicitly.
- **Cron endpoint** `/api/cron/daily-search` is excluded from the proxy matcher and authorized via `CRON_SECRET` bearer token. It also runs the DB backup, backup pruning (30d), dismissed-job cleanup (3mo), and log pruning (14d).
- **Storage buckets**: `resumes` (per-user folder `<user_id>/`), `pipeline-logs` and `db-backups` are service-role-only — never grant `authenticated` policies on them (backups contain all users' data).
- **Gemini**: `generateWithFallback()` in `src/lib/gemini.ts` provides the 3-model fallback chain; match scoring batches 5 jobs per call. Failed scoring defaults to 50.
- **SerpAPI budget**: max 8 calls per search run, 1 page per query (250/mo free tier).
- **Demo account**: writes blocked at proxy; also blocked from `/api/logs`. Seed via `npx tsx scripts/seed-demo.ts`.
- **DB schema**: fresh installs use `supabase/setup.sql`; `supabase/migrations/` is the incremental history for existing deployments (latest: 008 per-user search filters).
- **Search filters are per user**: `search_filters` has one row per user (unique `user_id`, no `resume_id`), edited at `/filters` via `/api/filters`, and applied to all of the user's active resumes. Input is validated by `parseSearchFilterInput()` (`src/lib/search-filter-input.ts`).
- **Job titles** live in `resumes.parsed_data.job_titles` and are editable via `PATCH /api/resumes/[id]` (`normalizeJobTitles()`, max 8). Only the first 4 are used as search queries.
- **Docs**: `README.md` is public-facing; `DEPLOY.md` has deploy steps; `TODO.md` tracks findings/tasks (canonical structure — user list, severity sections, completed).
