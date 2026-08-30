# MIMARAI FRONTEND MASTER REFERENCE

This document is a source-grounded reverse-engineering reference for the active MimarAi frontend, based on the code under `frontend/src`. It intentionally documents only what is observable in the shipped source and distinguishes verified facts from inferred behavior.

## 1. Scope and source of truth

### Active frontend app
- The active application is the Next.js app under `frontend/`, not the root Vite app at the repository root.
- Evidence:
  - `frontend/package.json` declares Next.js 14.2.5 and React 18.3.1
  - `frontend/src/app/...` contains the actual app router pages and route guards
  - the root `src/main.jsx` + `vite.config.js` are a separate Vite demo shell and are not the active production frontend flow

### Primary implementation files
- App router shell: `frontend/src/app/layout.jsx`
- Landing page: `frontend/src/app/page.jsx`
- Protected wizard page: `frontend/src/app/app/page.jsx`
- Auth page: `frontend/src/app/login/page.jsx`
- Auth provider: `frontend/src/context/AuthContext.jsx`
- Wizard state machine: `frontend/src/store/mimarStore.js`
- Key screen components: `frontend/src/components/screens/*.jsx`
- Header/nav shell: `frontend/src/components/AppHeader.jsx`, `AppNav.jsx`
- Contact page: `frontend/src/app/contact/page.jsx`
- Password reset page: `frontend/src/app/reset-password/page.jsx`
- Route middleware: `frontend/src/middleware.js`

## 2. Architecture summary

### Stack
- Framework: Next.js 14.2.5
- UI library: React 18.3.1
- State management: Zustand (`useMimarStore`)
- Auth provider: Supabase Auth via `@supabase/supabase-js` and `@supabase/ssr`
- Backend connectivity: fetch calls to a configured `NEXT_PUBLIC_BACKEND_URL` or hardcoded Render URL fallback

### High-level product shape
MimarAi is a guided, multi-step “blueprint wizard” for AI-assisted software architecture planning. The flow is sequential and lock-based:
1. Interview / idea intake
2. Implementation plan review
3. Project structure review
4. Schema and architecture review
5. Rendered diagram review
6. Final consolidated plan review
7. MCP server handoff

This is a stateful workflow with review comments, revision re-entry, and acceptance gates. It is not a standard CRUD dashboard; it behaves like a deterministic architecture review workflow.

## 3. Route map

### Public routes
| Route | Purpose | Verified behavior |
|---|---|---|
| `/` | Landing page / marketing overview | Renders hero, workflow cards, CTA to `/app`, draft resume list for logged-in users |
| `/login` | Login / sign-up / password reset / Google OAuth | Uses Supabase auth; redirects to `/` if already logged in |
| `/contact` | Contact form | Client-side validation + POST to `/api/contact`, with fallback to external backend |
| `/reset-password` | Password reset form | Submits to Supabase `updateUser` |

### Protected / app routes
| Route | Purpose | Verified behavior |
|---|---|---|
| `/app` | Main blueprint wizard | Requires authenticated user; redirects to `/login?redirectTo=/app` if not logged in |
| `/app` page shell | Renders all wizard screens in one page | Uses `currentScreen` from Zustand; shows all screen components simultaneously with active/inactive CSS |

### Route guard behavior
- `frontend/src/middleware.js` runs before requests to `/app/:path*` and `/login`.
- If a request hits `/app` without a valid Supabase user, it redirects to `/login` with a redirect parameter.
- If a request hits `/login` while already signed in, it redirects to `/app`.
- The page-level auth gate in `frontend/src/app/app/page.jsx` also re-checks `useAuth()` and redirects to login if no user.

## 4. Authentication and session model

### Auth provider
`frontend/src/context/AuthContext.jsx` defines `AuthProvider` and `useAuth()`.

Verified behaviors:
- Calls `supabase.auth.getSession()` on mount
- Subscribes to `supabase.auth.onAuthStateChange()`
- Stores `session`, `user`, and `profile` in React state
- Attempts to load a `profiles` row from Supabase
- Falls back to a local profile object if the row is missing or the table is unavailable
- Provides `updateProfileName()`, `refreshProfile()`, and `logout()`

### Name sanitization and onboarding
- `sanitizeName()` strips HTML/markup and truncates to 60 characters.
- `OnboardingNameModal` shows only when the user is logged in and has no stored profile name.
- This is treated as a mandatory onboarding step before continuing.

### Login flows
`frontend/src/app/login/page.jsx` implements:
- email/password login
- sign-up
- forgot-password email reset
- Google OAuth via `signInWithOAuth({ provider: 'google' })`
- resend verification email
- unauthenticated user gating and redirect handling

### Password rules
- `frontend/src/lib/passwordValidation.js` is used for validation and strength scoring.
- The login and reset pages show rule-check lists and strength meter states.

### Important auth caveat
The app uses Supabase for auth, but the route guards and user data are resilient to missing profile rows and partially missing backend services. This makes the app tolerant of demo and missing-DB conditions, but it also means some flows are intentionally defensive rather than strictly backend-authoritative.

## 5. Wizard state machine

The canonical state machine is `useMimarStore` in `frontend/src/store/mimarStore.js`.

### Screen and stage constants
- `SCREEN_ORDER = ['interview', 'plan', 'structure', 'diagram', 'render', 'final', 'mcp']`
- `STAGE_ORDER = ['features', 'structure', 'diagram', 'final']`

#### Screen-to-stage mapping
- `interview: null`
- `plan: 'features'`
- `structure: 'structure'`
- `diagram: 'diagram'`
- `render: 'final'`
- `final: 'final'`
- `mcp: 'final'`

### Core state flags
The store contains explicit progress flags such as:
- `interviewDone`
- `planGenerated`
- `planAccepted`
- `structureGenerated`
- `structureAccepted`
- `diagramJsonGenerated`
- `diagramJsonAccepted`
- `diagramRendered`
- `diagramAccepted`
- `finalPlanGenerated`
- `finalAccepted`

### Locking and transition rules
`showScreen()` enforces allowed progression:
- `plan` requires `planGenerated`
- `structure` requires `planAccepted`
- `diagram` requires `structureAccepted`
- `render` requires `diagramJsonAccepted`
- `final` requires `diagramAccepted`
- `mcp` requires `finalAccepted`

This creates a progressive, locked architecture pipeline. Re-entry to earlier screens is allowed in revision mode but not without the correct state conditions.

### Comments and review sheets
Each screen has a review sheet and pending comment store:
- `planComments`
- `structureComments`
- `diagramJsonComments`
- `finalComments`

`addComment()` and `deleteComment()` write to the appropriate stage store, and `ReviewCommentSheet` collects those comments for later AI revision.

### Revision flow
`runRevisionPipeline(targetStage)` is triggered when comments are submitted from a review sheet. It:
- validates target stage metadata
- constructs a targeted revision messaging flow
- calls backend endpoints for plan-stage revision when applicable
- clears the target comment bucket after completion
- redirects back to the appropriate screen

### Project persistence
The store persists session state in `sessionStorage` under `mimarai_saved_state` via `saveProjectState()` and restores it via `restoreProjectState()`.

Important notes:
- The project state is session-scoped, not a permanent DB record by default.
- `mcpToken` is intentionally not persisted across sessions.
- Some UI history is cleaned on restore to remove stale error messages.

## 6. User flow: the blueprint wizard

### 1. Interview screen
File: `frontend/src/components/screens/InterviewScreen.jsx`

Verified features:
- Text area for software idea input
- Step 0 classification lifecycle
- `classifyIdeaStep0()` triggers backend classification and local fallback logic
- Handles statuses: `idle`, `classifying`, `ready`, `vague_fallback`, `off_topic_fallback`, `error`
- Performs idea validation for length and message quality
- Supports example prompt fallback cards when classification fails or the idea is off-topic
- Includes `FixedInputsCollection` with four required architecture selections:
  - stack
  - database
  - deployment
  - apis
- Includes `StartTriggerGate` to start the generation pipeline once the idea is classified as ready and fixed inputs are complete

### Classification and fallback behavior
The reducer uses a backend route at:
- `${NEXT_PUBLIC_BACKEND_URL}/api/interview/classify`

If the backend fails or is unavailable, it falls back to a local classifier that detects:
- greeting / trivial input
- too-vague input
- off-topic input
- ready input

This is explicitly implemented as a resilient local fallback, with a flag named `ALLOW_LOCAL_FALLBACK_DEMO` in the generation path. The default in source is `false`, but the code includes deliberate graceful fallback logic.

### Starting generation
`handleStartGeneration()` calls `runIdeaPipeline(ideaText)`.

`runIdeaPipeline()`:
- stamps operation state and status messages
- creates a draft project entry if no `projectId` exists
- calls backend route `${NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId || 'local-draft-101'}/generate`
- updates the message history with progress steps
- sets `interviewDone = true` and `planGenerated = true`
- transitions to `showScreen('plan')`

### 2. Plan review screen
File: `frontend/src/components/screens/PlanScreen.jsx`

Verified features:
- Renders generated feature list, objective, and fixed input summary
- Allows per-feature comment composition
- Allows feature rejection with `toggleFeatureReject()`
- Requires at least one active feature to remain before acceptance
- `acceptPlan()` checks for pending comments before locking
- On accept, triggers a dependency-order generation API if available and then transitions to `structure`

### 3. Structure review screen
File: `frontend/src/components/screens/StructureScreen.jsx`

Verified features:
- File-tree view with folder toggles for routes and models
- File rows mapped to feature tags
- Comment editing per file row
- Status counts for file totals and mapped features
- `acceptStructure()` transitions to `diagram`

### 4. Diagram review screen
File: `frontend/src/components/screens/DiagramScreen.jsx`

Verified features:
- Renders “Table cards” and “Service cards” for schema and architecture JSON review
- Displays users / loans / optional audit_logs tables
- Displays service cards such as API Gateway, Auth Service, Loan Service
- Allows comment composition on each table/service
- `acceptDiagramJson()` transitions to `render`

### 5. Rendered diagrams screen
File: `frontend/src/components/screens/RenderScreen.jsx`

Verified features:
- Uses inline SVG to draw architecture and ERD diagrams
- Lets user switch between architecture and ERD views
- Contains an Ask AI drawer for diagram modification requests
- `classifyAskRequest()` classifies user requests as `cosmetic` or `structural`
- `acceptRenderDiagram()` transitions to `final`

### 6. Final consolidated plan
File: `frontend/src/components/screens/FinalScreen.jsx`

Verified features:
- Aggregates final project features, structure mapping, and selected design outputs
- Allows comments on final plan blocks
- `acceptFinalPlan()` transitions to `mcp`

### 7. MCP screen
File: `frontend/src/components/screens/McpScreen.jsx`

Verified features:
- Generates a fresh per-session token on first activation
- Copies token to clipboard
- Allows token regeneration
- Copies agent connection config snippets for Claude Code, Cursor, and a generic agent profile
- Download plan JSON package
- Runs a local drift check simulation with `sleep(1400)` and status updates

Important: the token is generated in the frontend and is masked in the UI, and the connection snippets intentionally point at the Render-hosted MCP backend URL.

## 7. Landing page and overall app shell

### Landing page
`frontend/src/app/page.jsx` is the main landing page. It includes:
- sticky nav
- marketing hero with CTA buttons
- workflow overview section
- architecture explanations
- MCP server explanation
- “Continue pending draft project” cards for logged-in users
- draft restoration via `useMimarStore` and `router.push('/app')`
- toast handling via `sessionStorage`

### App shell and header
`frontend/src/app/app/page.jsx` owns the wizard app shell.

It renders:
- `AppHeader`
- `OpLockBar`
- `AppNav`
- all screen components
- toast notification container
- `OnboardingNameModal`

`AppHeader` includes:
- current step label based on `currentScreen`
- global stage rail with `features`, `structure`, `diagram`, and `final`
- stop-generation button that aborts active controllers and returns to `/`

`AppNav` locks earlier screens until the required prior acceptance state is reached.

## 8. Backend and API dependencies

### Verified backend routes used by the frontend
The code calls several backend endpoints with fetch. The main ones are:
- `GET ${BACKEND_URL}/api/projects/drafts` for resumed drafts on landing page
- `POST ${BACKEND_URL}/api/projects/draft` to create a draft when a user idea is submitted
- `POST ${BACKEND_URL}/api/interview/classify` to classify a raw idea
- `POST ${BACKEND_URL}/api/projects/${projectId}/generate` to generate the initial feature plan
- `POST ${BACKEND_URL}/api/projects/${projectId}/comments/batch-fix` to revise plan comments
- `POST ${BACKEND_URL}/api/projects/${projectId}/dependency-order` to derive dependency order
- `POST ${BACKEND_URL}/api/projects/${projectId}/status` to update generation or fixed-input status

### Backends and fallback logic
The front-end uses a helper pattern like:
- prefer `process.env.NEXT_PUBLIC_BACKEND_URL`
- fallback to `http://localhost:8000` in local dev
- otherwise use `https://mimaraibackend-603zdm1j.b4a.run`

This means the app is configured for a deployed backend but also includes local and demo-friendly fallbacks.

### Contact form API
`frontend/src/app/api/contact/route.js` is a server route that:
- validates incoming input
- attempts to persist to Supabase `contact_messages`
- attempts to send notification email and user confirmation email via Gmail SMTP
- returns `status: 'ok'` with `db_saved` and `email_sent` flags

The route also includes fallback credentials and environment variable defaults for Supabase and Gmail. This is a security review item and should be validated against runtime secrets management.

## 9. Styling and UX behavior

### Design system
The app uses custom CSS, not a large component library. The design system is heavily themed around:
- dark architectural blueprints
- cyan/blue accents
- orange action highlights
- grid-based CAD aesthetic
- monospace labels and stage badges

Relevant CSS files:
- `frontend/src/styles/app.css`
- `frontend/src/styles/landing.css`
- `frontend/src/styles/auth.css`
- `frontend/src/app/globals.css`

### UX behaviors
The product explicitly uses:
- locked wizard progression
- review-comment sheets
- inline comment compositing
- acceptance badges and stage rails
- toasts for state changes
- skeleton-like status messages in the interview and render flows

## 10. State transitions and acceptance gates

The actual progression is:

1. User enters idea
2. Step 0 classification marks it as `READY` or fallback state
3. Fixed inputs are selected
4. Generate plan
5. Review/adjust features
6. Accept plan -> unlock structure
7. Review structure -> accept -> unlock diagram
8. Review schema JSON -> accept -> render diagram
9. Review rendered blueprint -> accept -> unlock final plan
10. Review final spec -> accept -> unlock MCP
11. MCP screen offers agent config and drift check

This is the actual state machine visible in `mimarStore.js` and the screen-specific accept functions.

## 11. Known issues and caveats

These are documented as code-observed facts and implementation caveats, not redesign suggestions.

### 1. Root Vite app is not the live frontend
The repository root includes a separate React + Vite app, but the real active frontend app is under `frontend/` and its app router routes. This has created confusion in the repo structure.

### 2. Backend dependency is partial and resilient
Several flows intentionally degrade gracefully when the backend is down or the service is misconfigured. This includes:
- local classification fallback
- graceful generation error handling
- session-only state restoration
- UI-only MCP simulation where needed

This makes the app usable in local/demo contexts but also means some workflows are not fully backend-authoritative.

### 3. Local and hardcoded fallback values exist in source
Some API routes include fallback values for environment variables or credentials. This should be audited before production deployment.

### 4. Cross-route and project state are session-scoped
The app preserves wizard state in `sessionStorage`, which is useful for continuity but not equivalent to a durable project database state.

### 5. No real backend verification for some AI operations
The code clearly shows strong UI logic and generation pipeline orchestration, but calls to external AI services are not independently verified in this reverse-engineering pass. The front-end code is the primary evidence source.

### 6. MCP token generation happens in the browser
The token is generated on the client as a fresh per-session value. This is deliberate in the UI, but it means the token is not a server-issued durable secret and should be treated as a UI-scoped project token rather than a long-term production credential system.

## 12. Inferred vs verified behavior

### Verified behavior
- Next.js + React + Zustand + Supabase architecture under `frontend/`
- protected `/app` route guard via middleware and page-level logic
- multi-step blueprint wizard with explicit acceptance gates
- per-stage comment review and revision flow
- session state persistence in `sessionStorage`
- login, sign-up, password reset, and Google OAuth support

### Inferred or implementation-assistive behavior
The following are not independently verified as deployed end-to-end services, but they are observable as frontend intent and fallback logic:
- backend generation service executes dual-model validation in the pipeline
- final project plan is intended to be downloadable and sent to an MCP server
- drift-check and MCP server integration are designed for external backend support, not fully verified in this pass

This separation matters: the UI expresses an AI architecture studio workflow, and the frontend implements the orchestration and UX around it, but the exact backend execution of every “AI pipeline” call should be treated as an external system dependency unless separately verified.

## 13. Key files to inspect first

If a developer needs to understand the app quickly, the best entry points are:
1. `frontend/src/store/mimarStore.js`
2. `frontend/src/app/app/page.jsx`
3. `frontend/src/context/AuthContext.jsx`
4. `frontend/src/app/login/page.jsx`
5. `frontend/src/components/screens/InterviewScreen.jsx`
6. `frontend/src/components/screens/PlanScreen.jsx`
7. `frontend/src/components/screens/StructureScreen.jsx`
8. `frontend/src/components/screens/DiagramScreen.jsx`
9. `frontend/src/components/screens/RenderScreen.jsx`
10. `frontend/src/components/screens/McpScreen.jsx`

## 14. Final summary

The active MimarAi frontend is a protected, stateful blueprint-generation app driven by a sequential wizard architecture and a central Zustand store. The front-end is implemented around authenticated access, staged feature review, structure/schema validation, rendered blueprint review, final plan acceptance, and an MCP handoff.

The project is strongly designed as a planning-and-verification layer for AI coding agents, and the code clearly reflects that purpose. The app is intentionally resilient to backend outages and missing data, but that resilience also means the UX is occasionally a demo/prototype shell around an external AI pipeline rather than a purely server-authoritative production system.

This document is intentionally conservative: it reports what is directly supported by code while flagging areas that require backend verification, secret review, or end-to-end deployment testing.
