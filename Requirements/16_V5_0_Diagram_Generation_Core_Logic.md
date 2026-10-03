# V5.0 — Diagram Generation (Core): Full Implementation Logic
(Source: MimarAi Locked Interview & Generation Pipeline, Rev. 2, Section 6.1-6.5, 6.7)

## Where This Fits
Next top-level version after V4 (Structure Generation). This is V5.0 — the CORE generation, 
validation, review, and rendering flow only. The "Ask AI" conversational editing feature 
(Locked Plan Section 6.6) is explicitly split out as a separate, later version (V5.1) — do 
NOT build it in this session.

## Prerequisite Gate
Trigger condition: `projects.structure_state.status == "accepted"` (this already exists 
from V4 — do not rebuild it, just check it). If not met, reject with a clear error.

## Trigger Mechanism (decided)
Diagram generation does NOT auto-chain from the backend side of `structure/accept`. It is 
its own explicit, isolated endpoint. The FRONTEND is responsible for calling it immediately 
after a successful `structure/accept` response, creating the "feels automatic, no new 
questions asked" UX the spec calls for — without backend-side side-effect chaining, which 
is harder to test and debug. This keeps every stage in this pipeline following the same 
one-endpoint-per-stage pattern already established throughout V3 and V4.

### Decoupled Endpoints Architecture (Reliability-Driven Deviation)
To prevent CloudFront/Back4App proxy gateway timeouts (30.0s hard timeout cap), diagram 
generation is decoupled into two consecutive, timeout-resilient endpoints:
1. `POST /api/projects/{id}/diagram/generate` — Pure drafting stage: generates Model A and 
   Model B 4-artifact drafts and computes `diff_conflicts`. Returns ~10–14s.
2. `POST /api/projects/{id}/diagram/validate` — Auditing & fix stage: executes Groq 6-check 
   validation, single fix pass if flaws found, re-validates, and persists evidence. Returns ~8–12s.
Frontend orchestrates these two calls sequentially before transitioning into review.

## Generation — 4 Artifacts, Same Dual-Draft Pattern (Section 6.2)
Using the locked features, accepted structure, and fixed_inputs (tech stack, database), 
Model A drafts FOUR artifacts in one generation pass:
1. **Database schema JSON** — tables, columns, data types, primary keys, foreign keys, 
   relationships.
2. **Architecture JSON** — services/layers, protocols (HTTPS, gRPC, WebSocket), ports.
3. **Exception Handling JSON** — expected failure modes per feature (invalid input, 
   not-found, conflict, timeout, dependency failure) and the handling rule for each 
   (validation layer, standardized error response shape, retry/no-retry, what gets logged).
4. **Security JSON** — access-control rule for every route/table (which roles may call it), 
   plus cross-cutting requirements: authentication method, secrets handling, transport 
   security, row-level security policies where the database supports them.

Model B independently drafts its own version of all four, without seeing Model A's draft — 
same pattern as features and structure. The four drafts are diffed and merged; conflicting 
definitions are surfaced, but the final call stays with Model A's draft (Model B remains 
checker, not decision-maker) — same asymmetric role as prior stages.

**Known tracked limitation:** since Model A is currently substituted with Groq's 
llama-versatile (the existing tracked Gemini outage workaround), the two "independent" 
drafts will currently be identical, same as observed in V4. Do not report this as "PASS" — 
label it "EXPECTED (TRACKED SUBSTITUTION)" per the same convention established in V4's live 
test report. Do not attempt to fix or mask this in V5 — it's the same pre-existing, 
already-tracked issue.

## Validation Checks (Section 6.3)

### Schema / Architecture
- **Referential integrity** — every foreign key links to a valid primary key.
- **Feature coverage** — every feature's data is represented in some table.
- **Protocol/tech-stack consistency** — architecture's protocols match the chosen tech 
  stack.
- **No conflicting dependencies** — services don't depend on each other illogically.

### Exception Handling
- **Coverage** — every feature has at least one defined failure mode and handling rule.
- **Consistency** — error-response shape and logging behavior follow one standard, not ad 
  hoc per feature.

### Security
- **Coverage** — every route/table touching sensitive/role-scoped data has an explicit 
  access-control rule.
- **Consistency with Structure** — role names/scopes referenced here match roles defined in 
  Features (e.g. Role-Based Access Control feature, if present).
- **No conflicting policies** — no two rules grant and deny the same role on the same 
  resource.

If a flaw is found in any of the four artifacts: Model A gets a single fix pass, then Model 
B re-validates — same capped, one-cycle pattern used everywhere else in this pipeline (no 
new loop mechanism).

## User Review — Schema & Architecture ONLY (Section 6.4)
- The clean schema and architecture JSON are shown to the user for review BEFORE rendering.
- Reuses the existing comment mechanism with `stage: "diagram"` (already a valid value in 
  the `CommentStage` Literal from the recent comment-system fix — no schema change needed 
  there).
- **No "Reject" option** — same rule as structure (Section 5.4): only Comment/Adjust, since 
  this is fully AI-generated content with no user-originated counterpart.
- **Exception Handling and Security JSON are NOT shown at this review stage.** They are 
  generated and validated in the same background pass, but have no dedicated review screen 
  here. This is intentional, not a gap — their first user-facing appearance is Final Review 
  (a later version, V6, not part of this session). State this explicitly in any 
  implementation notes so it isn't mistaken for a missing feature.

## Rendering — JSON to Visual Diagram (Section 6.5)
The accepted schema and architecture JSON are converted into a visual diagram by a 
**separate, deterministic, non-AI rendering step** — the AI never draws the diagram itself, 
only produces structured data.

**Implementation decision:** the JSON-to-Mermaid-syntax conversion happens in the BACKEND, 
as a pure Python function (no AI call). The accept/generation response includes both the 
structured JSON and a `mermaid_syntax` string field, so the frontend only needs to render 
the Mermaid string, not duplicate conversion logic. Two diagrams are produced this way: the 
Database ERD (from schema JSON) and the System Architecture Diagram (from architecture 
JSON). Exception Handling and Security are never rendered as diagrams — there's no natural 
graph form for them, consistent with Section 6.5's note.

## Accepting the Diagram (Section 6.7)
A single "Accept the Diagram" action confirms the schema and architecture the user actually 
reviewed. Only on this action does the JSON merge into the implementation plan — not on 
every comment/adjustment.

Exception Handling and Security JSON — already validated in the background — merge into the 
plan at the SAME moment as schema/architecture acceptance, without their own separate 
accept step. They simply become part of the plan the first time the user reaches Final 
Review (V6, later).

## Data Model
New jsonb column on `projects`: `diagram_state`

```json
{
  "attempts": [
    {
      "model_a_draft": {"schema": {...}, "architecture": {...}, "exception_handling": {...}, "security": {...}},
      "model_b_draft": {"schema": {...}, "architecture": {...}, "exception_handling": {...}, "security": {...}},
      "diff_conflicts": [...],
      "validation_result": {...},
      "created_at": "ISO timestamp"
    }
  ],
  "accepted_schema": {...} | null,
  "accepted_architecture": {...} | null,
  "accepted_exception_handling": {...} | null,
  "accepted_security": {...} | null,
  "mermaid_erd": "string | null",
  "mermaid_architecture": "string | null",
  "status": "draft" | "accepted"
}
```

## Backend Endpoints
- `POST /api/projects/{project_id}/diagram/generate` — runs the dual-draft (4 artifacts) + 
  diff + validate + fix cycle. Requires `structure_state.status == "accepted"`.
- `POST /api/projects/{project_id}/diagram/accept` — locks in schema + architecture (the 
  ones the user reviewed) AND the already-validated exception_handling + security together, 
  generates the two Mermaid strings, merges into the plan.
- `GET /api/projects/{project_id}/diagram` — fetch current draft/accepted state, including 
  Mermaid strings if accepted.
- Comments on diagram reuse the EXISTING comments endpoints with `stage: "diagram"` — no 
  new comment infrastructure.

## Explicitly Not In Scope Here (V5.1 or later)
- "Ask AI" conversational editing (Section 6.6) — cosmetic-vs-structural classification, 
  forced-override with confirmation, "Manually Amended" propagation into Features/Structure. 
  Separate session, V5.1.
- Final Review screen (Section 7, V6) — where Exception Handling/Security are first shown 
  to the user.
- Any change to Feature Generation (V3) or Structure Generation (V4).

## Rollback Note
Fully additive — new column, new endpoints, reuse of existing comment system. If reverted, 
no impact on V3/V4 behavior.

## Manual Steps Required
New Supabase migration needed for the `diagram_state` jsonb column. Antigravity must 
provide exact SQL for manual execution — do not run it yourself.
