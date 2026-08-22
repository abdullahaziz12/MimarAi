# MimarAi V0 Deployment & Setup Guide

This guide details the exact steps to deploy the MimarAi V0 Foundations stack (Supabase, Render backend, Vercel frontend, and Keep-Alive ping).

---

## 1. Supabase Setup (Database)

1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Name your project (e.g. `mimarai-prod`), set a strong database password, and select your preferred region.
3. Once the database is provisioned, go to the **SQL Editor** in the Supabase Dashboard.
4. Copy and paste the contents of `docs/supabase_schema.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS projects (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name TEXT NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now()
   );
   ```
5. Click **Run** to execute the script and create the `projects` table.
6. Navigate to **Project Settings** -> **API** to retrieve:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **anon / public key** or **service_role key** (keep secure)

---

## 2. Backend Deployment (Render - Persistent Web Service)

> [!IMPORTANT]
> Deploy as a **Web Service** on Render (not a static site or cron job) so it runs as a persistent service ready for future MCP and pipeline capabilities.

1. Push this repository to GitHub.
2. Log in to [Render](https://render.com) and click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Name**: `mimarai-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. In **Environment Variables**, add:
   - `SUPABASE_URL` = `https://<your-project>.supabase.co`
   - `SUPABASE_KEY` = `<your-supabase-service-or-anon-key>`
   - `FRONTEND_URL` = `https://<your-vercel-domain>.vercel.app` (or `*` for initial setup)
6. Click **Create Web Service**.
7. Once deployed, test the health check:
   - `https://<render-service-name>.onrender.com/health` -> `{"status":"ok"}`
   - `https://<render-service-name>.onrender.com/health/db` -> `{"status":"ok","db":"connected",...}`

---

## 3. Frontend Deployment (Vercel)

1. Log in to [Vercel](https://vercel.com) and click **Add New...** -> **Project**.
2. Import your GitHub repository.
3. In **Project Settings**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click edit and select `frontend`.
4. In **Environment Variables**, add:
   - `NEXT_PUBLIC_BACKEND_URL` = `https://<render-service-name>.onrender.com`
5. Click **Deploy**.
6. Once deployed, your landing page is live at `/` and the Blueprint Wizard is at `/app`.

---

## 4. Keep-Alive Ping Setup (Prevent Render Cold-Starts)

Render free tier instances spin down after 15 minutes of inactivity. Setting up a keep-alive ping ensures instant responses.

1. Sign up for free at [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com).
2. Create a new monitor / cron job:
   - **Title**: `MimarAi Backend Keep-Alive`
   - **URL**: `https://<render-service-name>.onrender.com/health`
   - **Schedule**: Every 10 to 14 minutes (e.g. `*/12 * * * *`)
   - **Request Method**: `GET`
3. Enable notifications to alert if the backend ever goes down.

---

## 5. End-to-End Verification Checklist

- [ ] `https://<render-service-name>.onrender.com/health` returns `{"status":"ok"}`
- [ ] `https://<render-service-name>.onrender.com/health/db` returns `{"status":"ok","db":"connected"}`
- [ ] Vercel frontend loads at `https://<vercel-domain>.vercel.app`
- [ ] Wizard loads at `https://<vercel-domain>.vercel.app/app` and connects to backend health check
- [ ] All 7 screens function seamlessly with zero client errors
