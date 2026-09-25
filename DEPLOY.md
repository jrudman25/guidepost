# Guidepost -- Deployment Guide

## Prerequisites

- [Supabase](https://supabase.com) project (free tier)
- [Vercel](https://vercel.com) account (Hobby tier)
- [SerpAPI](https://serpapi.com) key (free tier, 250 searches/month)
- [Google AI Studio](https://aistudio.google.com) key (Gemini, free tier)

## 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Navigate to **SQL Editor** and run the full contents of:
   ```
   supabase/setup.sql
   ```
   This creates all tables, indexes, RLS policies, and the status-change trigger.
   (The `supabase/migrations/` directory is the incremental history; do not run it
   on a fresh install.)

3. Go to **Storage** and create three private buckets:

   | Bucket | Purpose | Access |
   |---|---|---|
   | `resumes` | PDF resume files | authenticated, scoped to own folder |
   | `pipeline-logs` | Daily search run logs | service role only (no user policy) |
   | `db-backups` | Database snapshots | service role only (no user policy) |

   **Important:** do NOT grant `authenticated` users access to `pipeline-logs` or
   `db-backups`. Backups contain every user's data, and the demo account's
   credentials are public by design.

   For `resumes`, scope access to each user's own folder (uploads are stored
   under `<user_id>/`):

   ```sql
   create policy "Users manage their own resume files"
   on storage.objects for all to authenticated
   using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
   with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
   ```

4. Copy your **Project URL**, **anon key**, and **service role key** from
   **Settings > API**.

## 2. Environment Variables

Set these in your Vercel project dashboard under **Settings > Environment Variables**:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only; required by the daily cron) |
| `SERPAPI_API_KEY` | SerpAPI key for Google Jobs searches |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `CRON_SECRET` | Random string to secure cron endpoint (generate with `openssl rand -hex 32`) |

## 3. Deploy to Vercel

```bash
# Option A: Connect to GitHub
# Push to GitHub and import into Vercel dashboard

# Option B: CLI deploy
npm i -g vercel
vercel
```

Vercel auto-detects Next.js -- no special build settings needed.

## 4. Post-Deploy

- **Cron job**: `vercel.json` configures a daily search at 16:00 UTC (`0 16 * * *`). Vercel Cron is available on all plans.
- **Auth**: Visit your deployed URL, enter your email, and click the magic link to sign in. Sign-ups are disabled by default; create users under **Supabase > Authentication > Users**.
- **Supabase auth redirect**: Add your Vercel URL to **Supabase > Authentication > URL Configuration > Redirect URLs** (e.g. `https://your-app.vercel.app/**`).
- **(Optional) Demo account**: create a user `demo@guidepostai.app` and run `npx tsx scripts/seed-demo.ts` to populate sample data. Non-GET API requests from the demo account are blocked by the app proxy.

## Local Development

```bash
# Install dependencies
npm install

# Copy env file and fill in values
cp .env.local.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
