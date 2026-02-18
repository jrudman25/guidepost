# Guidepost

A full-stack job search management tool that automatically finds job listings matching your resume, scores them with AI, and tracks your applications through a unified dashboard.

## What It Does

1. **Upload a resume** (PDF) -- Gemini extracts your skills, titles, experience, and industries
2. **Configure search filters** -- location, remote preference, keywords, excluded companies, listing age
3. **Auto-discover jobs** -- a daily cron job queries Google Jobs via SerpAPI and deduplicates results
4. **AI match scoring** -- each listing is scored 0-100 against your resume with a written explanation
5. **Track applications** -- move jobs through a pipeline (applied, screening, interview, offer, rejected, ghosted)
6. **Dashboard analytics** -- response rate, weekly volume, status breakdown, and skill demand trends

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI | Google Gemini 2.5 Flash (resume parsing, job matching) |
| Job Data | SerpAPI (Google Jobs engine) |
| Styling | Tailwind CSS 4 + Shadcn UI |
| Charts | Recharts |
| Testing | Vitest (41 unit tests) |
| Hosting | Vercel (with Cron for daily search) |

## Architecture

```
src/
  app/
    (app)/              # Authenticated pages (dashboard, resumes, inbox, applications)
    api/                # REST endpoints (resumes, jobs, applications, stats, cron)
    login/              # Magic link authentication
  components/           # Resume card, upload dropzone, sidebar, Shadcn primitives
  lib/
    search/             # Core search pipeline
      query-builder.ts  #   Resume data + filters -> optimized search queries
      serpapi.ts         #   SerpAPI client + job normalization
      matcher.ts         #   Gemini-powered match scoring (0-100)
      execute.ts         #   Orchestrator (called by API route + cron)
    resume-parser.ts    # Gemini-powered PDF resume extraction
    supabase/           # Server + browser Supabase client helpers
    types.ts            # Shared TypeScript interfaces
  middleware.ts         # Auth guard (redirects unauthenticated users to /login)
```

### Key Design Decisions

- **Shared search executor** -- the cron job and the manual "Search Now" button both call the same `executeJobSearch` function directly, avoiding HTTP round-trips and auth issues
- **Database-level status tracking** -- a PostgreSQL `BEFORE UPDATE` trigger automatically logs every application status change to a `status_history` table and updates `status_updated_at`, keeping the API layer simple
- **URL-based deduplication** -- a unique index on `job_listings.url` prevents the same listing from appearing twice across searches
- **Graceful AI fallbacks** -- if Gemini fails during match scoring, the job defaults to a score of 50 instead of being dropped


Test coverage includes the query builder, SerpAPI client, Gemini resume parser, and AI match scorer.

## License

MIT
