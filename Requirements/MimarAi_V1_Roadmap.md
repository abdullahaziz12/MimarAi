# MimarAi — V1: Authentication Roadmap

**Status note:** The Login / Sign Up page UI (email+password form, Log In/Sign Up toggle, Google button, themed to match `app.css`) has already been built and corrected. This roadmap covers everything else needed to make that UI actually functional, secure, and properly wired end-to-end — Supabase configuration, route protection, backend verification, profile/settings, and security hardening.

**Goal:** Every project is tied to a real, authenticated, isolated user. No pipeline screen is reachable without a valid session — enforced at the middleware level, not just in the UI. No visual changes to any pipeline screen (Interview through MCP) happen in V1 — only the auth gate in front of them and the ownership layer underneath.

**Depends on:** V0 complete (Vercel + Render + Supabase all live and talking to each other), login/signup page UI complete.

---

## Phase 1 — Supabase Auth Provider Configuration

- Confirm the **Email** provider is enabled in Supabase (sign-up + sign-in + password reset) — should already be on by default, verify settings match: confirmation-required on sign-up, reasonable email-rate-limits
- Confirm the **Google** provider is enabled in Supabase → Authentication → Providers:
  - Google Cloud Console OAuth client (Web application type) created, with the Supabase-provided redirect URI (`https://<project>.supabase.co/auth/v1/callback`) added as an authorized redirect
  - Google Client ID + Client Secret entered into Supabase's Google provider config
- Set Supabase Auth's **Site URL** and **Redirect URLs** to the live Vercel domain (plus `localhost` for local dev)
- Review/customize the confirmation and password-reset email templates (default templates are acceptable for V1)

---

## Phase 2 — Database Schema: Profiles & Ownership

- Create a `profiles` table (separate from Supabase's built-in `auth.users`, which should never be queried directly from the frontend): `id` (uuid, references `auth.users.id`, primary key), `name` (text, nullable until onboarding completes), `avatar_color` (text, deterministically derived from `id`), `created_at` (timestamptz)
- Add a Postgres trigger (`handle_new_user` on `auth.users` insert) that auto-creates a matching `profiles` row on sign-up, so the app never has to manually sync the two tables
- Add `owner_id uuid references auth.users(id)` to the `projects` table (created in V0)
- Enable **Row-Level Security** on both `profiles` and `projects`
- RLS policies:
  - `profiles`: `select`/`update` where `id = auth.uid()` — a user can only read/edit their own profile row
  - `projects`: `select`/`insert`/`update`/`delete` where `owner_id = auth.uid()`
- Verify with a two-account SQL-editor test that neither table leaks another user's row

---

## Phase 3 — Frontend Auth Wiring (confirm/complete)

- Confirm the Supabase JS client is configured with the anon key only (never the service key) on the frontend
- Confirm session handling uses Supabase's `onAuthStateChange` listener, with the current user available app-wide via the existing state store
- Confirm the following all work end-to-end against live Supabase, not just render visually:
  - Email/password sign-up → confirmation email actually sent and received
  - Email/password login → session established, error messaging generic (no user enumeration)
  - Google OAuth → redirect out, redirect back, session established
  - Forgot password → reset email sent, reset-password screen works, generic confirmation message regardless of whether the email exists
  - Resend verification email → actually resends, client-side cooldown enforced
- Confirm double-submit prevention and loading states work against real (not simulated) network latency

---

## Phase 4 — Mandatory Name Onboarding (new accounts only)

- After first successful verification (email/password) or first successful Google sign-in, check whether `profiles.name` is null for that user
- If null, show the one-time "What should we call you?" step before allowing access to `/app`
- For Google sign-ups, pre-fill from the Google profile name if available, but still require confirmation through this same step
- Validate and sanitize input server-side before writing to `profiles.name` (max length, strip HTML/script content — this value will render inside the avatar tooltip and Settings screen, so treat it as untrusted user input, not display text)
- Once `profiles.name` is set, this step never shows again for that account

---

## Phase 5 — Route Protection (critical — verify this specifically)

- Implement or confirm **middleware-level** protection (e.g. Next.js `middleware.ts`) for every route under `/app/*`, checking for a valid Supabase session on the server side before the page is served — not a client-side conditional render
- No-session requests to `/app/*` must redirect to `/login` before any protected content renders — test via direct URL entry in an incognito window, not just in-app navigation
- Logged-in users with a valid session must reach `/app` normally with no incorrect redirect loop
- Confirm this holds after a hard refresh and in a fresh tab, not just on client-side route transitions

---

## Phase 6 — Backend Auth Verification

- Add middleware/dependency in FastAPI that verifies the Supabase JWT sent from the frontend on each authenticated request, using the project's JWT secret
- Reject missing/invalid tokens with `401 Unauthorized`
- Extract `user_id` from the verified token and make it available to route handlers, so every future endpoint scopes data to the right user — matching the RLS policies already enforced at the database level
- Add an authenticated test endpoint, `GET /me`, returning the verified user's id/email/name — proves the frontend→backend auth handoff works end-to-end, independent of Supabase's own frontend-side session check

---

## Phase 7 — Header Identity & Settings

- Confirm the header shows the circular initial-letter avatar (color derived from `profiles.avatar_color` / hashed `id`) once logged in, falling back to the email's first letter only in the brief window before onboarding completes
- Confirm the avatar dropdown (Settings, Logout) works and Logout correctly clears the Supabase session and redirects to the landing page
- Confirm the Settings screen's **Change name** and **Change password** actions actually persist to Supabase (not just update local UI state) and re-validate with the same rules used at onboarding/sign-up

---

## Phase 8 — Security Hardening Checklist

- **SQL injection**: confirm every query touching user input goes through the Supabase client library / parameterized calls — no raw string-concatenated SQL anywhere in the backend
- **XSS**: confirm the name field (and any other user-entered text) is sanitized on save and escaped on render everywhere it's displayed (avatar tooltip, Settings, anywhere else)
- **CSRF**: confirm reliance on Supabase's token-based model; any cookie-based session data must be `Secure` + `SameSite=Lax`/`Strict`
- **User enumeration**: confirm login and password-reset error messages are identical regardless of whether the account exists
- **Brute-force protection**: confirm Supabase Auth's built-in rate limiting is active; confirm the frontend adds its own short cooldown after repeated failed login attempts
- **Rate limiting on authenticated backend routes**: not just login — any endpoint touching user/profile data should be rate-limited per user
- **Session handling**: confirm Supabase's refresh-token rotation is enabled; avoid storing raw tokens in `localStorage` where Supabase's own session storage can be used instead
- **HTTPS only**: confirm no mixed-content requests anywhere in the auth flow
- **No secrets in frontend code**: confirm only the Supabase URL + anon key exist in frontend env vars; service role key exists only in backend/Render env vars, never committed

---

## Phase 9 — Project Ownership Wiring

- Update project creation to automatically write `owner_id = auth.uid()`
- Confirm project-fetching relies on RLS rather than manual filtering (redundant `WHERE owner_id = ...` filters are fine for clarity but shouldn't be the only protection)
- Test: two different test accounts (one email/password, one Google) each only ever see their own project(s)

---

## Phase 10 — V1 Exit Checklist

- [ ] Login page fully themed (already done) and fully functional against live Supabase (not just simulated)
- [ ] Google OAuth working end-to-end, including account-linking-by-email edge case
- [ ] Mandatory one-time name step appears exactly once per new account, sanitized and persisted
- [ ] Forgot-password and resend-verification flows both working, generic non-enumerating messaging
- [ ] `/app/*` unreachable without a valid session — verified via direct URL entry in incognito, not just via the landing page button
- [ ] `profiles` and `projects` tables both have RLS enabled and verified with a two-account test
- [ ] Backend `/me` endpoint correctly verifies the Supabase JWT and returns the right user
- [ ] Header avatar + Settings/Logout dropdown fully functional; Settings changes persist to Supabase
- [ ] Full security hardening checklist (Phase 8) confirmed, not just implemented
- [ ] No real secrets anywhere in git history — only in Vercel/Render env-var settings
- [ ] Pipeline screens themselves (Interview–MCP) remain visually and behaviorally unchanged from V0 — only reachability and the header's identity area changed

Once all of the above is checked off, V2 (Step 0 + Interview Shell — real Groq classification call) is next.
