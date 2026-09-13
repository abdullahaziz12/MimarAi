# V3.1 — Contradiction Scan: Full Implementation Logic

## Where This Fits
Runs immediately after Step 0 classification returns `READY`, before Fixed Inputs 
collection. Not a separate top-level version — this is part of V3, the ongoing 
deepening of the existing interview pipeline.

## Purpose
Detect self-contradictory requirements inside the user's idea text before generation 
runs — e.g. "offline-first" + "real-time sharing," or "no user accounts" + "personalized 
saved preferences." Catching this here prevents the dual-model generation pipeline from 
either silently picking one side of the contradiction or producing a plan that satisfies 
neither requirement well.

## Trigger Condition
Fires exactly once per idea submission, only when Step 0 has already returned `READY`. 
Does not run on `OFF_TOPIC` or `TOO_VAGUE` — no point scanning an idea that isn't even 
specific enough yet.

## Call Type
One lightweight Groq call — same cost/latency tier as Step 0 classification, NOT a full 
generation call. Given only the idea text (no fixed inputs needed at this stage, since 
fixed inputs haven't been collected yet).

### Prompt intent
Ask the model to look specifically for internal contradictions in the stated 
requirements — not vagueness (that's Step 0's job), not missing information (that's a 
future stage's job) — only genuine logical conflicts between two stated or clearly 
implied requirements.

### Response shape
No contradiction:
```json
{"contradiction": false}
```

Contradiction found:
```json
{
  "contradiction": true,
  "explanation": "Plain-language description of the conflict.",
  "conflicting_parts": ["requirement A as stated", "requirement B as stated"]
}
```

## Resolution Flow
1. If `contradiction: false` → proceed immediately to Fixed Inputs. No user-facing 
   interruption at all.
2. If `contradiction: true` → show the user the `explanation` and ask them to resolve it 
   in their own words (free-text reply, same UI pattern as the existing TOO_VAGUE 
   follow-up).
3. The user's revised answer is appended as additional context and the scan re-runs.
4. **Round cap: 2 rounds total**, identical mechanism to the existing TOO_VAGUE round-cap 
   (Step 0) — do not build a second, separate counter. Reuse the same cap logic/field 
   pattern already established.
5. After round 2, if still contradictory, stop asking and proceed to Fixed Inputs 
   anyway — but flag the project internally (`contradiction_unresolved: true` or similar) 
   so the eventual generated plan can be marked "Adjusted — Please Review" per the 
   existing Locked Plan pattern for unresolved issues (Section 8 of the Locked Plan).

## Failure Handling (fail-closed, not fail-open)
- One retry on a malformed or failed Groq response.
- If it still fails after retry: show a clear, user-facing error with a manual retry 
  option.
- Never silently skip the scan.
- Never default to `contradiction: false` on failure — an unscanned idea should not be 
  treated the same as a scanned-and-clean idea.

## Data Model
New table: `contradiction_checks`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| round | int | 1 or 2 |
| found | bool | |
| explanation | text | null if `found = false` |
| resolved_answer | text | the user's follow-up reply, if any |
| created_at | timestamptz | |

RLS: same `owner_id`-based ownership pattern already used on every other project-scoped 
table in this codebase (comments, plan_history, etc.) — a user can only read/write 
contradiction_checks rows belonging to their own projects.

## Backend Endpoint
`POST /api/projects/{project_id}/contradiction-scan`
- Requires auth (Bearer token) — same `get_current_user()` dependency as every other 
  endpoint.
- Requires the same combined `owner_id` + `project_id` ownership check already enforced 
  elsewhere (classify, generate, comments, etc.) — this is a known required pattern in 
  this codebase after a prior security remediation found a real gap from missing it once.
- Request body: `{"idea_text": "string", "round": int}` (round tracks which attempt this 
  is, mirroring how Step 0 tracks `round_count`).
- Persists the result row to `contradiction_checks` on every call, whether or not a 
  contradiction was found.

## Frontend Behavior
- Called automatically right after a `READY` classification result, before 
  `FixedInputsCollection` renders.
- If `contradiction: false`, this is invisible to the user — no UI, no delay perceived 
  beyond the one API call.
- If `contradiction: true`, render the explanation and a follow-up text input, visually 
  consistent with the existing TOO_VAGUE follow-up UI already built in `InterviewScreen`.
- After 2 rounds, if still unresolved, proceed to Fixed Inputs without further blocking — 
  do not trap the user in a loop.

## Explicitly Not In Scope Here
- Density Check, Clarifying Questions, Persona Capture, NFR Capture, Lightweight Confirm 
  Draft — separate future stages, not part of this file.
- Any change to the feature schema or Requirement Quality Standard.
- Any change to Structure, Diagram, Final, or MCP screens.

## Rollback Note
If this stage causes errors in the live app after deployment, the fix is to revert this 
branch's merge commit and return to the previous working version where Step 0 goes 
directly to Fixed Inputs with no contradiction scan — this stage is additive and does not 
modify any existing Step 0 or Fixed Inputs logic, so a clean revert should be low-risk.
