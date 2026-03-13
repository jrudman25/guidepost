# Guidepost

A full-stack job search management tool that automatically finds job listings matching your resume, scores them with AI, and tracks your applications through a unified dashboard.

## What It Does

1. **Upload a resume** (PDF) — Gemini extracts your skills, titles, experience, and industries
2. **Configure search filters** — location, remote preference, seniority level, keywords, excluded companies, listing age
3. **Auto-discover jobs** — a daily cron job queries Google Jobs via SerpAPI, deduplicates results, and filters by your preferences
4. **AI match scoring** — jobs are scored 0–100 in batches against your resume with written explanations
5. **Track applications** — move jobs through a pipeline (applied → screening → interview → offer / rejected / ghosted) with "furthest stage reached" tracking for granular rejection analytics
6. **Search, sort & filter** — debounced search bars and sort dropdowns (by score, date, title, company) on both the job inbox and applications pages, combined with tab/status filters and paginated results
7. **Saved job reminders** — amber badge on the sidebar shows saved count, and saved job cards display color-coded aging indicators (green ≤3 days, amber 4–7 days, red >7 days)
8. **Dashboard analytics** — response rate, average time to hear back, weekly volume, status breakdown, rejection funnel by pipeline stage, and a skills profile
9. **Pipeline logs** — persistent daily logs of every search run (SerpAPI results, Gemini model used, scoring, errors) viewable in-app
10. **Automated backups** — daily database snapshots to Supabase Storage with 30-day retention
11. **Demo mode** — read-only guest account with sample data for showcasing the app

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| AI | Google Gemini (3 Flash → 2.5 Flash → 3.1 Flash Lite fallback chain) |
| Job Data | SerpAPI (Google Jobs engine) |
| Styling | Tailwind CSS 4 + Shadcn UI |
| Charts | Recharts |
| Testing | Vitest (115 unit tests) |
| Hosting | Vercel (with Cron for daily search) |

## Architecture

```
src/
  app/
    (app)/                # Authenticated pages
      page.tsx            #   Dashboard with analytics + rejection funnel
      inbox/              #   Job inbox with search, sort, filtering, pagination, bulk actions
      resumes/            #   Resume management + search filter config
      applications/       #   Application pipeline tracker with search + sort
      logs/               #   Pipeline log viewer (admin only)
    api/
      jobs/               #   CRUD + bulk update + manual search trigger
      resumes/            #   Upload, delete, filter management
      applications/       #   Application CRUD with status history
      stats/              #   Dashboard analytics
      logs/               #   Pipeline log list + detail
      cron/daily-search/  #   Vercel Cron entrypoint
      auth/               #   Supabase auth callback
    login/                # Magic link authentication + demo login
  components/             # Resume card, upload dropzone, sidebar, Shadcn primitives
  lib/
    search/               # Core search pipeline
      query-builder.ts    #   Resume data + filters -> optimized search queries
      serpapi.ts           #   SerpAPI client + pagination + job normalization
      matcher.ts           #   Gemini batch scoring (5 jobs per API call)
      location-filter.ts   #   Post-fetch geographic filter + remote keyword detection
      execute.ts           #   Orchestrator with structured pipeline logging
    resume-parser.ts      # Gemini-powered PDF resume extraction
    gemini.ts             # Shared Gemini client with automatic model fallback
    pipeline-logger.ts    # Structured log collection, markdown formatting, storage persistence
    db-backup.ts          # Daily database snapshots to Supabase Storage
    supabase/             # Server, browser, and service role client helpers
    date-utils.ts         # Timezone-safe date formatting
    types.ts              # Shared TypeScript interfaces
  proxy.ts              # Auth guard + demo account write protection (Next.js 16 proxy)
```

## Key Design Decisions

- **Batch AI scoring** — multiple jobs are scored in a single Gemini API call (batches of 5) to stay within rate limits while maintaining score quality
- **Shared search executor** — the cron job and the "Search Now" button both call `executeJobSearch` directly, avoiding HTTP round-trips and auth issues
- **Row Level Security** — Supabase RLS policies enforce per-user data isolation at the database level; the demo account's data is completely separate
- **Structured pipeline logging** — search runs produce categorized markdown logs (SerpAPI results, filtering summaries, score distributions, errors) persisted to Supabase Storage with 14-day retention
- **Database-level status tracking** — a PostgreSQL `BEFORE UPDATE` trigger logs every application status change to `status_history`, updates `status_updated_at`, and auto-advances `furthest_stage` (the highest pipeline stage reached, used for rejection funnel analytics)
- **Batched deduplication** — URL-based dedup uses a single `IN` query per search instead of per-job queries, with a `Set` for O(1) cross-query tracking
- **Graceful AI fallbacks** — a three-model fallback chain (Gemini 3 Flash → 2.5 Flash → 3.1 Flash Lite) ensures API calls succeed even during outages; if all models fail during scoring, jobs default to a score of 50
- **Post-fetch location filtering** — non-remote jobs from distant locations are filtered after SerpAPI returns but before Gemini scoring, using keyword-based remote detection and state/city matching against the user's location filter
- **Saved job aging** — saved cards show a color-coded "Saved X days ago" badge (green/amber/red) to discourage letting saved listings go stale
- **Demo account isolation** — middleware blocks all non-GET requests for the demo user; pipeline logs and admin features are hidden from demo sessions

## Daily Cron Pipeline

The daily cron job (`/api/cron/daily-search`) runs the following steps in order:

1. **Database backup** — snapshot all critical tables to Supabase Storage
2. **Prune old backups** — delete backup files older than 30 days
3. **Clean up dismissed jobs** — remove jobs dismissed more than 3 months ago
4. **Prune old pipeline logs** — delete log files older than 14 days
5. **Execute job search** — query SerpAPI, deduplicate, batch-score with Gemini, insert new jobs
6. **Persist pipeline logs** — write the run's log to Supabase Storage

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side, bypasses RLS) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `SERPAPI_API_KEY` | SerpAPI key for Google Jobs searches |
| `CRON_SECRET` | Secret for authenticating Vercel Cron requests |

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.local.example .env.local

# Run development server
npm run dev

# Run tests
npm test
```

### Supabase Setup

1. **Database schema** — Run `supabase/setup.sql` in the Supabase SQL Editor. This creates all tables, indexes, RLS policies, and the status change trigger.

2. **Storage buckets** — Create three private buckets in Supabase Storage:

   | Bucket | Purpose | Allowed MIME |
   |--------|---------|--------------|
   | `resumes` | PDF resume files | `application/pdf` |
   | `pipeline-logs` | Daily search run logs | `text/markdown` |
   | `db-backups` | Database snapshots | `application/json` |

   For each bucket, add Storage policies granting `authenticated` users SELECT, INSERT, UPDATE, and DELETE access.

3. **Authentication** — Enable email/password auth in Supabase Auth settings. Add `http://localhost:3000**` to the Redirect URLs list.

4. **(Optional) Demo account** — To set up a read-only demo mode:
   - Create a user with email `demo@guidepostai.app` in Supabase Auth
   - Run `npx tsx scripts/seed-demo.ts` to populate sample data (this only affects the demo account via RLS)

> **Note:** The `supabase/migrations/` directory contains the historical incremental migrations used during development. For fresh installs, use `supabase/setup.sql` instead.

## License

MIT
