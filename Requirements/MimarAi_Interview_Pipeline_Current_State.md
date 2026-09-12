# MimarAI Interview Pipeline: Current State

**Verification date:** 2026-09-11

## Verification Scope

This document describes executable code and SQL files currently present in this repository. It does not treat roadmap or reference documents as implementation evidence. The deployed Supabase database was not queried from this workspace, so live-schema claims are explicitly marked **UNVERIFIED** where applicable.

The repository contains two frontend applications:

- The active authenticated application is the Next.js application under `frontend/` and the FastAPI backend under `backend/`.
- A separate legacy/demo Vite application is under the repository root `src/`, with mock interview data and no connection to the FastAPI interview endpoints. It is documented separately below.

## 1. Interview Pipeline File Inventory

### Active Next.js/FastAPI pipeline

| File                                                  | What the code does                                                                                                                                                                                                  | Stage(s) evidenced by code                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `backend/main.py`                                     | Defines authentication, project draft creation, project status persistence, Step 0 classification, provider calls, full dual-model generation, comments, feature rejection, and dependency ordering.                | Classification, fixed inputs persistence, full dual-model generation       |
| `backend/test_security.py`                            | Tests project UUID/ownership validation, invalid-project rejection before Gemini, classifier token matching, comment ownership, and mocked provider health. It does not test the full interview UI.                 | Supporting tests for classification and handoff security                   |
| `frontend/src/app/app/page.jsx`                       | Protects `/app` behind the Supabase user session, restores browser `sessionStorage`, and renders `InterviewScreen` alongside downstream screens.                                                                    | Interview entry and state restoration                                      |
| `frontend/src/app/page.jsx`                           | Fetches authenticated draft projects from `/api/projects/drafts`; clicking a draft copies its ID, idea text, Step 0 state, and fixed inputs into the Zustand store before navigating to `/app`.                     | Draft resume before classification                                         |
| `frontend/src/components/screens/InterviewScreen.jsx` | Sends user idea text to Step 0 classification, interprets `OFF_TOPIC`, `TOO_VAGUE`, and `READY`, manages counters/fallback UI, renders fixed-input controls, and starts full generation.                            | Classification, vague/off-topic fallback, fixed inputs, generation handoff |
| `frontend/src/store/mimarStore.js`                    | Stores project/interview state; creates a draft if needed; calls `/api/interview/classify`; persists fixed inputs; calls `/generate`; stores generation results and moves to Plan.                                  | Classification, fixed inputs, full generation handoff                      |
| `frontend/src/components/FixedInputsCollection.jsx`   | Provides four select controls: stack, database, deployment, and APIs/services.                                                                                                                                      | Fixed inputs collection                                                    |
| `frontend/src/components/StartTriggerGate.jsx`        | Renders the explicit generation button after the interview screen has `ready` status and all four fixed inputs are truthy.                                                                                          | Generation handoff UI                                                      |
| `frontend/src/components/ExamplePromptFallback.jsx`   | Renders three starter descriptions after the frontend reaches vague or off-topic fallback state. It only places the selected description into the text input; classification occurs later when the user submits it. | Vague/off-topic fallback                                                   |
| `frontend/src/context/AuthContext.jsx`                | Loads the Supabase session and exposes `session.access_token` to the interview component and store.                                                                                                                 | Authentication prerequisite                                                |
| `frontend/src/lib/backendConfig.js`                   | Resolves `NEXT_PUBLIC_BACKEND_URL` and throws when it is absent.                                                                                                                                                    | Backend request configuration                                              |
| `frontend/src/components/ReviewCommentSheet.jsx`      | Opens the interview screen in revision mode from downstream review comments and invokes revision pipeline logic.                                                                                                    | Downstream revision, not initial interview classification                  |
| `frontend/src/components/screens/PlanScreen.jsx`      | Displays the generation response from the full pipeline and supplies the downstream review surface.                                                                                                                 | Post-interview handoff                                                     |
| `docs/supabase_schema.sql`                            | Defines a minimal V0 `projects` table with `id`, `name`, and `created_at`; its note says RLS/ownership are not included in this file.                                                                               | Database artifact, not sufficient evidence of the deployed schema          |
| `scripts/v2_migration.sql`                            | Adds project Step 0/fixed-input columns and creates `rate_limits` with RLS.                                                                                                                                         | Persisted classification state and classification rate limiting            |
| `scripts/v3_migration.sql`                            | Creates comments, generation state, plan history, and generation rate limits, with RLS policies.                                                                                                                    | Downstream review and generation persistence                               |
| `frontend/.env.example`                               | Documents frontend backend and Supabase public variables.                                                                                                                                                           | Runtime configuration                                                      |
| `backend/.env.example`                                | Documents backend Supabase, frontend-origin, and service configuration variables.                                                                                                                                   | Runtime configuration                                                      |
| `backend/render.yaml`                                 | Configures Render deployment variables including model names and provider keys.                                                                                                                                     | Runtime deployment configuration                                           |

### Separate legacy/demo Vite pipeline

| File                                 | What the code does                                                                                                                                                                                      | Stage(s) evidenced by code                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/App.jsx`                        | Renders a mock application with landing, interview, conflict, spec, diagram, and MCP screens using imported mock data.                                                                                  | Mock interview navigation                              |
| `src/components/InterviewScreen.jsx` | Uses local React state and mock `interviewSteps`/`taxonomy`; selecting `Long-lived WebSockets` with `Vercel Free Tier` displays a conflict action. It does not call FastAPI, Supabase, Gemini, or Groq. | Mock structured questions, mock contradiction/conflict |
| `src/components/DraftingFooter.jsx`  | Renders the legacy mock app footer and navigation.                                                                                                                                                      | Mock UI only                                           |
| `src/data/mockProjectData.js`        | Supplies sample projects, taxonomy, interview steps, conflicts, and static architecture data.                                                                                                           | Mock data only                                         |

## 2. Stage-by-Stage Build Status

| Stage                                                       | Status                                          | Evidence from current code                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 0 classification (`OFF_TOPIC` / `TOO_VAGUE` / `READY`) | **FULLY BUILT**                                 | `backend.main.classify_idea()` handles request validation, greeting prefilter, deterministic concrete-scope prefilter, Groq classification, rate limiting, and persisted Step 0 state. `InterviewScreen.executeClassification()` handles all three labels and updates UI state.                           |
| Contradiction scan                                          | **NOT STARTED** in the active pipeline          | No contradiction-scan route or function exists in `backend/main.py`; no active Next component invokes such a route. The legacy Vite screen has one hard-coded local conflict condition, but it is not connected to the active pipeline.                                                                   |
| Density check                                               | **NOT STARTED**                                 | No density-check function, route, state field, or active UI stage was found.                                                                                                                                                                                                                              |
| Clarifying questions                                        | **PARTIALLY BUILT**                             | `InterviewScreen` displays generic follow-up text after `TOO_VAGUE`, and uses Groq `sub_case`/`extracted_name` to customize one follow-up. There is no structured question model, question persistence, or dedicated clarifying-question endpoint.                                                        |
| Persona/actor capture                                       | **NOT STARTED**                                 | No active route, state field, table column, or component captures actors/personas.                                                                                                                                                                                                                        |
| Non-functional requirements capture                         | **NOT STARTED**                                 | No active route, state field, table column, or component captures NFRs.                                                                                                                                                                                                                                   |
| Lightweight single-model confirm draft                      | **NOT STARTED**                                 | No separate lightweight confirm-draft endpoint or function exists. The first generation path is the full parallel Gemini/Groq pipeline.                                                                                                                                                                   |
| Fixed inputs collection                                     | **FULLY BUILT** for the implemented four fields | `FixedInputsCollection` renders stack/database/deployment/apis. `setFixedInputs()` persists them through `/api/projects/{project_id}/status`; `runIdeaPipeline()` requires all four fields.                                                                                                               |
| Handoff into full dual-model generation                     | **FULLY BUILT** with backend/provider caveats   | `StartTriggerGate` calls `handleStartGeneration`; `runIdeaPipeline()` calls `/api/projects/{project_id}/generate`; `generate_feature_pipeline()` calls Gemini and Groq in parallel, merges features, validates with Groq, optionally fixes with Gemini, validates again, and persists `generation_state`. |

“Fully built” here means the corresponding code path exists and is internally wired. It does not mean the deployed provider credentials or deployed database schema were verified live.

## 3. Data Model As Actually Present

### Schema files in this repository

`docs/supabase_schema.sql` explicitly defines only:

- `projects.id UUID PRIMARY KEY`
- `projects.name TEXT NOT NULL`
- `projects.created_at TIMESTAMPTZ`

It also explicitly states that no RLS or `owner_id` policies are added in that file.

`scripts/v2_migration.sql` references or creates:

- `projects.status`
- `projects.title`
- `projects.idea_text`
- `projects.step0_state JSONB`
- `projects.fixed_inputs JSONB`
- `rate_limits.user_id UUID PRIMARY KEY REFERENCES auth.users(id)`
- `rate_limits.count INT`
- `rate_limits.window_start TIMESTAMPTZ`
- RLS and an own-row policy on `rate_limits`

`scripts/v3_migration.sql` references or creates:

- `projects.generation_state JSONB`
- `comments.id UUID`
- `comments.project_id UUID REFERENCES projects(id)`
- `comments.stage TEXT`
- `comments.target_feature_id TEXT`
- `comments.text TEXT`
- `comments.status TEXT`
- `comments.created_at TIMESTAMPTZ`
- `plan_history.id UUID`
- `plan_history.project_id UUID REFERENCES projects(id)`
- `plan_history.event TEXT`
- `plan_history.feature_id TEXT`
- `plan_history.note TEXT`
- `plan_history.created_at TIMESTAMPTZ`
- `generation_rate_limits.user_id UUID`
- `generation_rate_limits.pipeline_count INT`
- `generation_rate_limits.pipeline_window_start TIMESTAMPTZ`
- `generation_rate_limits.batch_count INT`
- `generation_rate_limits.batch_window_start TIMESTAMPTZ`
- RLS policies for comments, plan history, and generation rate limits

The backend additionally inserts/selects `projects.owner_id`, but neither `docs/supabase_schema.sql` nor the displayed V2/V3 migration files adds `owner_id`. **UNVERIFIED — the deployed database may have an additional migration not present in this repository.**

### Code/schema mismatches verified from repository files

- `backend/main.py` inserts and filters `projects.owner_id`; the base schema file does not define it.
- `backend/main.py` uses `projects.status`, `idea_text`, `step0_state`, `fixed_inputs`, and `generation_state`; the base schema file does not define them, although V2/V3 migrations do.
- `backend/main.py` uses `rate_limits` and `generation_rate_limits`; these are absent from the base schema file and created by V2/V3 migrations.
- `backend/main.py` uses `comments` and `plan_history`; these are absent from the base schema file and created by V3.
- The frontend landing page reads `draft.title` as a fallback, while the draft creation route writes `name`; `title` is added by V2 but is not populated by `create_draft_project()`.
- **UNVERIFIED — live table columns and deployed RLS policies were not queryable from this workspace.**

### JSON structures used by code

`step0_state` is written with keys:

- `round_count`
- `off_topic_streak`
- `last_label`
- `last_sub_case`
- `extracted_name`
- sometimes `updated_at`

`fixed_inputs` is expected by both frontend and backend to contain:

- `stack`
- `database`
- `deployment`
- `apis`

`generation_state` is written with:

- `idea_objective`
- `fixed_inputs`
- `features`
- `rejected_feature_ids`
- `dependency_order`
- `adjusted_flag`
- `generated_at`

Feature objects are expected to contain `id`, `name`, `description`, and `source`.

## 4. Request/Response Contracts

### `POST /projects/draft` and `/api/projects/draft`

Authentication: `get_current_user()` requires a Bearer token.

Request model:

```json
{
  "idea_text": "string or null"
}
```

The route inserts a project with `owner_id`, `name`, `status: "draft"`, `idea_text`, and an initial `step0_state`, then returns `res.data[0]` from Supabase. The exact database-generated response fields are not hard-coded by the route.

### `GET /projects/drafts` and `/api/projects/drafts`

Authentication: required.

Response on normal query:

```json
{
  "drafts": ["database project rows"]
}
```

On missing backend storage or query exception, it returns `{"drafts": []}`. The frontend landing page uses this route to resume drafts.

### `POST /projects/{project_id}/status` and `/api/projects/{project_id}/status`

Authentication: required. The backend validates a persisted UUID and ownership before updating.

Request model:

```json
{
  "status": "string or null",
  "fixed_inputs": {
    "any": "JSON value"
  }
}
```

Response:

```json
{
  "status": "ok",
  "project_id": "string",
  "updated_status": "string or null"
}
```

The frontend normally sends only `fixed_inputs` while selecting controls and sends `status: "generating"` before generation.

### `POST /interview/classify` and `/api/interview/classify`

Authentication: required. The route rejects missing/local-draft project IDs, validates ownership, applies a database rate limit, then classifies.

Request model:

```json
{
  "idea_text": "string",
  "project_id": "string or null",
  "step0_state": {
    "any": "JSON value"
  }
}
```

Responses for successful classification have this shape:

```json
{
  "status": "ok",
  "label": "OFF_TOPIC | TOO_VAGUE | READY",
  "sub_case": "no_domain | unexplained | null",
  "extracted_name": "string or null",
  "explanation": "string",
  "source": "prefilter | scope_prefilter | groq"
}
```

The route can instead return HTTP 400, 401, 404, 429, 500, 502, 503, or 504 for validation, auth, ownership, provider, configuration, or timeout failures.

### `POST /projects/{project_id}/generate` and `/api/projects/{project_id}/generate`

Authentication: required. A persisted owned project, non-placeholder idea, and all four fixed-input keys are required.

Request model:

```json
{
  "idea_text": "string or null",
  "fixed_inputs": {
    "stack": "string",
    "database": "string",
    "deployment": "string",
    "apis": "string"
  }
}
```

Success response:

```json
{
  "status": "ok",
  "project_id": "string",
  "generation_state": {
    "idea_objective": "string",
    "fixed_inputs": {},
    "features": [],
    "rejected_feature_ids": [],
    "dependency_order": [],
    "adjusted_flag": true,
    "generated_at": "ISO timestamp"
  }
}
```

The route performs parallel Gemini/Groq drafting, Groq validation, an optional Gemini correction, and final Groq validation. Provider failures are converted to generic 502 responses in the orchestration steps.

### `POST /projects/{project_id}/comments/batch-fix`

Authentication and persisted owned UUID project validation: required.

Request model:

```json
{
  "stage": "features",
  "comments": [],
  "current_features": []
}
```

It may load pending comments and current features from the project, calls Gemini, updates `generation_state`, resolves comments, and returns:

```json
{
  "status": "ok",
  "generation_state": {}
}
```

### `POST /projects/{project_id}/features/{feature_id}/reject`

Authentication and owned project validation: required.

No request body is required. It toggles the feature ID in `generation_state.rejected_feature_ids` and returns:

```json
{
  "status": "ok",
  "rejected_feature_ids": []
}
```

### `POST /projects/{project_id}/dependency-order`

Authentication and owned project validation: required.

No request body is required. It uses the active generated features, calls Gemini and Groq, persists the result, and returns:

```json
{
  "status": "ok",
  "dependency_order": ["feature IDs"]
}
```

On provider exceptions, the route catches the exception and returns a fallback order with HTTP 200.

### `GET /projects/{project_id}/comments`

Authentication and owned project validation: required.

Response:

```json
{
  "comments": ["comment rows"]
}
```

### `POST /projects/{project_id}/comments`

Authentication and owned project validation: required.

Request model:

```json
{
  "target_feature_id": "string or null",
  "text": "string",
  "stage": "features"
}
```

Response: the inserted comment row, or `{"status":"created"}` if Supabase returns no row.

## 5. Known Flaws Verified From Code

### 5.1 Base schema does not contain the columns required by the backend

- **Evidence:** `docs/supabase_schema.sql` defines only three `projects` columns, while `backend.main.create_draft_project()` inserts `owner_id`, `status`, `idea_text`, and `step0_state`.
- **Confirmation method:** direct comparison of the SQL file and route code.
- **Impact:** **UNVERIFIED in production** because the deployed Supabase schema was not queried. The repository's base schema alone cannot support the current backend.

### 5.2 The frontend creates multiple draft projects across attempts only when no project ID exists

- **Evidence:** `mimarStore.classifyIdeaStep0()` calls `/api/projects/draft` when `s.projectId` is falsy and stores the returned ID.
- **Confirmation method:** direct code trace.
- **Impact:** a cleared/new local state creates a new server draft; the code has no deduplication or draft cleanup mechanism.

### 5.3 `setFixedInputs()` ignores HTTP failure responses

- **Evidence:** `mimarStore.setFixedInputs()` sends the status request and only attaches `.catch()` for network/rejection errors. It does not inspect `response.ok` or handle a 401/404/500 response.
- **Confirmation method:** direct read of the fetch call.
- **Impact:** the UI can retain fixed inputs locally even when persistence fails; generation later sends the local values and the backend may accept them if the project remains valid.

### 5.4 Draft listing silently converts backend failures into an empty list

- **Evidence:** `backend.get_draft_projects()` returns `{"drafts": []}` on missing storage or database exception; `frontend/src/app/page.jsx` ignores non-OK responses and catches fetch errors with an empty handler.
- **Confirmation method:** direct comparison of route and caller.
- **Impact:** a user can see no drafts without knowing whether there are none or the backend failed.

### 5.5 Dependency ordering fails open with HTTP 200

- **Evidence:** `backend.generate_dependency_order()` catches all exceptions, builds the order in current list order, persists `adjusted_flag`, and returns `{"status":"ok"}`.
- **Confirmation method:** direct read of the exception handler.
- **Impact:** callers cannot distinguish a provider failure from a successfully validated dependency order.

### 5.6 Full generation has incomplete response-shape validation

- **Evidence:** `generate_feature_pipeline()` calls `.get("features")` on Gemini/Groq response dictionaries and accesses `fix_res["features"]`, but does not validate that features are lists or that each feature has the required fields before merging/persisting.
- **Confirmation method:** direct read of provider result handling.
- **Impact:** malformed provider JSON can cause generic 502 behavior or malformed generation state.

### 5.7 Classification provider call has no retry

- **Evidence:** `classify_idea()` sends one Groq HTTP request with an eight-second timeout. It returns 502/504/500 on failures; unlike `call_gemini_api()` and `call_groq_json()`, it has no retry loop.
- **Confirmation method:** direct comparison of the classification call and generation helper functions.
- **Impact:** transient Groq failures stop classification immediately.

### 5.8 Provider model configuration is inconsistent between classification and helper functions

- **Evidence:** classification hard-codes `"openai/gpt-oss-120b"`; `call_groq_json()` reads `GROQ_MODEL`. The classification route therefore ignores the configured `GROQ_MODEL` environment variable.
- **Confirmation method:** direct comparison inside `classify_idea()` and `call_groq_json()`.
- **Impact:** health checks/configuration can report the configured model while Step 0 classification uses a different hard-coded model.

### 5.9 Generation persistence still contains redundant placeholder checks

- **Evidence:** `generate_feature_pipeline()` first rejects `local-draft-*` through `get_owned_project()`, but later persistence/finally blocks still test `not project_id.startswith("local-draft-")`.
- **Confirmation method:** direct trace of the same route.
- **Impact:** no current frontend bypass was found, but the dead compatibility branches obscure the invariant that only persisted projects are allowed.

### 5.10 Frontend generation status update is fire-and-forget

- **Evidence:** `InterviewScreen.handleStartGeneration()` sends `/status` and only logs network rejection; it immediately invokes `runIdeaPipeline()` regardless of status-update response.
- **Confirmation method:** direct read of the handler.
- **Impact:** the status may remain unchanged in the database while generation proceeds; generation itself performs its own project validation.

### 5.11 Backend error messages are inconsistent for missing provider configuration

- **Evidence:** classification returns HTTP 500 for missing `GROQ_API_KEY`; helper functions also raise HTTP 500 for missing provider keys; generation orchestration wraps several provider exceptions as 502.
- **Confirmation method:** direct read of the branches.
- **Impact:** clients cannot consistently distinguish configuration from upstream availability.

### 5.12 Live RLS and live schema are unverified

- **Evidence:** repository SQL files contain different schema generations and policies, and no live Supabase query was made.
- **Confirmation method:** direct file review plus absence of live database access in this task.
- **Impact:** deployment correctness cannot be concluded from repository SQL alone.

## 6. Gap To The Full Deepened Pipeline

The active code currently stops at classification, four fixed inputs, and full dual-model generation. The missing stages are:

1. **Contradiction scan:** new deterministic/provider analysis logic and a new result/state representation are required. The legacy Vite conflict screen is not reusable as active backend behavior because it uses static mock data.
2. **Density check:** requires a defined measurable input and output, a backend function/endpoint, and frontend state/UI for density results.
3. **Clarifying questions:** a small extension could add structured question/answer state around the existing `TOO_VAGUE` flow, but persistence would require a JSONB field or a new table and a request/response contract.
4. **Persona/actor capture:** requires new frontend controls and persistence fields/table columns; no current project JSON key exists for actors.
5. **NFR capture:** requires new frontend controls and persistence fields/table columns; no current project JSON key exists for NFRs.
6. **Lightweight single-model confirm draft:** requires a new backend endpoint/provider helper and a distinct response/state field so it is not confused with `generation_state` from the full pipeline.
7. **Full generation enrichment:** the existing `/generate` endpoint can remain the handoff boundary, but it would need to accept and persist outputs from the new stages. Its request model currently accepts only `idea_text` and `fixed_inputs`.

Smallest additions: structured clarifying-question state and deterministic contradiction/density functions if their inputs remain request-local. New infrastructure: persistence for personas/NFRs and a distinct lightweight-draft contract if these must survive reloads or be audited.

## 7. Recommended Completion Order

1. Verify and reconcile the deployed Supabase schema with the current backend requirements, especially `owner_id`, Step 0 JSONB, fixed inputs, generation state, rate limits, comments, and RLS.
2. Add structured clarifying-question state without duplicating the existing label/counter logic.
3. Add contradiction scanning using the same project/fixed-input context already sent to generation, and persist its result in a defined JSONB structure.
4. Add density checking after clarification, with a defined threshold and a response contract.
5. Add persona/actor capture and NFR capture together, because both are project requirements data and should share persistence/versioning decisions.
6. Add the lightweight single-model confirm draft as a separate endpoint and state field, with provider failure treated as an explicit failed confirmation rather than a successful fallback.
7. Extend the existing `/generate` request/context with the confirmed contradiction, density, persona, and NFR data instead of creating a second full-generation pipeline.
8. Add end-to-end tests covering state restoration, ownership, provider failures, and handoff payloads.

## Final Current-State Assessment

The active interview pipeline is a working Step 0 classifier plus fixed-input gate followed by a full dual-model generation pipeline. It does not currently implement the six additional deepened stages listed in the requested design target. The legacy Vite application contains mock structured interview/conflict UI, but it is not connected to the active authenticated pipeline.

Live Supabase schema/RLS, live provider credentials, and deployed runtime behavior are **UNVERIFIED — no live database/provider deployment query was performed from this workspace**.
