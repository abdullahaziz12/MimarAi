# V3.10 — Admin Portal: Full Implementation Logic

## Where This Fits
Independent of the V3 interview-pipeline stages — this is a separate, parallel track that 
can be built any time, not blocked by V3.4/V3.5/V3.8/V3.9/V3.11. Purpose: give the project 
owner a real dashboard of actual usage data (users, activity, success rate, AI-call usage) 
for demo/credibility purposes (e.g. showing judges real traction) and for the owner's own 
operational visibility.

## Honesty Check Before Building — Read This First
Two of the four requested metrics can be built from data that already exists. Two require 
NEW instrumentation that doesn't exist yet. Do not let the UI imply all four are equally 
"real-time accurate" if two are actually derived from newly-added, still-thin data. Be 
explicit about this in the final report.

| Metric | Data source | New instrumentation needed? |
|---|---|---|
| Total users + new-user trend | `auth.users` (via Supabase service role) | No — derivable from existing auth data |
| Success rate (successful generations vs attempts) | `generation_rate_limits` + `projects.generation_state` presence | Partially — needs a small new event log for accuracy (see below) |
| Time spent / session activity | Nothing currently tracks this | Yes — new session-tracking table + frontend heartbeat |
| AI-call usage/cost tracking | `rate_limits` + `generation_rate_limits` give counts only, no per-call cost | Yes — new event log table; true dollar cost requires provider pricing config, which does not exist yet, so this should ship as "call counts," not "$ cost," unless pricing is explicitly supplied |

## Access Control
Email-allowlist based, per the owner's decision — not role-based initially.

### Data Model
New table: `admin_allowlist`
| Column | Type | Notes |
|---|---|---|
| email | text PK | |
| added_by | text | which admin added this email |
| added_at | timestamptz | |

The project owner's own email is the first/seed row (inserted manually via the same 
manual-SQL-handoff process used for every migration in this project — Antigravity provides 
the exact `INSERT` statement, the owner runs it).

### Enforcement
- New backend dependency function `require_admin(user)`: after normal `get_current_user()` 
  auth, additionally check the authenticated user's email exists in `admin_allowlist`. If 
  not, return 403.
- Every admin endpoint (see below) uses this dependency, layered on top of standard auth — 
  never a separate, weaker auth path.
- Frontend: a protected `/admin` route that calls a `GET /api/admin/me` check on load; if 
  403, redirect away — do not attempt to hide the route by obscurity alone, since the 
  backend check is the actual security boundary, not the frontend route guard.

## New Data Model for Metrics

### Success-rate accuracy — new lightweight event log
New table: `generation_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| user_id | UUID | |
| status | text | `"success"` \| `"failure"` |
| failure_reason | text | nullable — e.g. `"provider_error"`, `"validation_failed"` |
| created_at | timestamptz | |

Insert one row every time `/generate` completes, whether success or failure. This is a 
small, additive logging call inside the existing `/generate` handler — not a new pipeline 
stage, just an audit trail. Success rate = successful rows / total rows, over a chosen time 
window.

### Time-spent tracking — new session table
New table: `user_sessions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID | |
| started_at | timestamptz | |
| last_seen_at | timestamptz | updated on heartbeat |
| ended_at | timestamptz | nullable |

Frontend sends a lightweight heartbeat (e.g. every 60 seconds while the tab is active) to 
`POST /api/session/heartbeat`, which creates a session row on first heartbeat and updates 
`last_seen_at` on subsequent ones. A session is considered ended if no heartbeat arrives 
for some timeout window (e.g. 5 minutes) — compute this at query time (session duration = 
`last_seen_at - started_at`), not via a background job, to keep this simple.

**Be explicit in the report: this gives an approximation of active time, not perfectly 
precise analytics** — acceptable for a demo/credibility dashboard, not claimed as 
enterprise-grade analytics.

### AI-call usage tracking — new event log
New table: `ai_call_log`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID | |
| project_id | UUID | nullable |
| provider | text | `"groq"` \| `"gemini"` |
| stage | text | e.g. `"classify"`, `"contradiction_scan"`, `"generation_draft"`, etc. |
| success | bool | |
| latency_ms | int | |
| created_at | timestamptz | |

Insert one row per actual provider call, across every stage that makes one (classification, 
contradiction scan, clarifying questions, lightweight draft, full generation's multiple 
calls). This requires touching each of those call sites to add a logging line — scope this 
as a mechanical, additive change (wrap existing call functions, don't rewrite their logic).

**Report this as call-count/frequency data, not as dollar cost**, unless the project owner 
separately supplies actual per-provider pricing to multiply against — do not invent or 
guess pricing numbers.

## Admin API Endpoints
All require `require_admin`.

- `GET /api/admin/me` — returns whether the current user is an admin (used by frontend 
  route guard).
- `GET /api/admin/users` — total user count, new users in the last 7/30 days (from 
  `auth.users.created_at`).
- `GET /api/admin/success-rate?window=7d` — aggregate from `generation_events`.
- `GET /api/admin/sessions?window=7d` — aggregate active-time stats from `user_sessions`.
- `GET /api/admin/ai-usage?window=7d` — aggregate call counts from `ai_call_log`, broken 
  down by provider and stage.

## Frontend
A simple `/admin` dashboard page with four sections matching the four endpoints above. 
Keep this visually simple — tables and basic numbers/charts are sufficient; this does not 
need to match the polish of the main product UI for this session.

## Explicitly Not In Scope Here
- Role-based permissions beyond a flat allowlist (e.g. no "read-only admin" vs "full 
  admin" distinction).
- Real dollar-cost calculation without actual pricing data supplied.
- Any change to the V3 interview pipeline itself.
- Building this as a separately-hosted app — this lives inside the existing frontend/backend 
  as an additional protected route and additional endpoints.

## Rollback Note
Fully additive — new tables, new endpoints, new frontend route. Reverting removes the admin 
portal entirely with no impact on the interview pipeline or any existing user-facing 
feature, since nothing else reads from these new tables.

## Manual Steps Required
1. New Supabase migration (4 new tables: `admin_allowlist`, `generation_events`, 
   `user_sessions`, `ai_call_log`) — Antigravity must provide exact SQL, owner runs it 
   manually, per the established process.
2. Owner must manually insert their own email into `admin_allowlist` via a provided 
   `INSERT` statement before the admin portal can be accessed at all.
