# V3.3 — Clarifying Questions (Deepened): Full Implementation Logic

## Where This Fits
Runs after Density Check (V3.2) computes `density_flags`. Still part of V3, not a 
separate top-level version. This stage upgrades the existing shallow clarifying-question 
behavior (currently just generic `TOO_VAGUE` follow-up text tied to Step 0) into a 
structured, idea-specific, persisted question/answer flow.

## Current State (what already exists, do not duplicate)
The existing `TOO_VAGUE` flow in Step 0 already asks a personalized follow-up question 
based on `sub_case` (`no_domain` vs `unexplained`) and `extracted_name`. **This stage does 
NOT replace that.** The existing TOO_VAGUE flow handles ideas too vague to even classify as 
READY. V3.3 Clarifying Questions runs AFTER an idea is already classified READY and has 
passed Contradiction Scan — it asks deeper, idea-specific follow-ups on an idea that is 
valid but still has gaps, not on an idea too vague to process at all. Do not merge or 
confuse these two flows.

## Trigger Condition
Runs after Density Check produces `density_flags`. Behavior depends on the 
`clarifying_questions` flag value:
- `"skip"` → this stage does not run at all; proceed directly to Persona Capture (V3.4, 
  not yet built) or, until that stage exists, directly to Fixed Inputs.
- `"partial"` → generate a reduced set of questions (aim for 1-2), targeting only the 
  specific gaps the density heuristic didn't already find signals for.
- `"full"` → generate the full set (2-4 questions).

## Call Type
One Groq or Gemini call (either is acceptable — pick whichever this codebase's existing 
lightweight-call pattern uses, consistent with Contradiction Scan's choice of Groq), given 
the idea text and the `density_flags` result, prompted to generate idea-specific questions.

### Prompt intent — critical constraint
The prompt MUST explicitly forbid generic filler questions. Bad output: "What features do 
you want?" or "Can you tell me more about your idea?" Good output, specific to a stated 
idea like "a loan management system": "Is this single-currency or does it need to support 
multiple currencies?" or "Should loan approval require a single approver or a multi-step 
approval chain?"

The prompt should reference what density check already found present, so it doesn't ask 
about things the idea already covered. If `density_flags.personas` came back `"skip"` 
(meaning persona info already exists in the idea text), clarifying questions should not 
re-ask about user types — that ground is already covered.

### Response shape
```json
{
  "questions": [
    "Question text 1",
    "Question text 2"
  ]
}
```
Number of items in the array should match the `partial` (1-2) vs `full` (2-4) count 
determined by the density flag.

## Flow
1. Questions are generated and shown to the user, presented inline in the chat stream — 
   consistent with the existing message-bubble pattern already used for the TOO_VAGUE 
   follow-up and Contradiction Scan follow-up.
2. Questions can be presented one at a time or as a short batch (implementation choice), 
   but however presented, the user's answers are appended as additional idea context — 
   NOT stored as a separate structure that generation has to reconcile. This keeps 
   downstream generation seeing one coherent picture of the idea, consistent with the 
   original spec's design intent.
3. Each question/answer pair is persisted to the new `clarifying_questions` table (see 
   Data Model below) for audit/traceability purposes, even though the answers also get 
   folded into the idea context.
4. There is no round-cap loop here like Contradiction Scan or TOO_VAGUE — this is a single 
   batch of questions asked once, answered once, then the flow proceeds to the next stage. 
   Do not build a resolution-loop mechanism for this stage; it doesn't need one.

## Failure Handling (fail-closed, not fail-open)
- One retry on a malformed or failed provider response.
- If it still fails after retry: show a clear, user-facing error with a manual retry 
  option — same fail-closed pattern already established for Contradiction Scan.
- Never silently skip this stage or proceed with zero questions asked when the 
  `density_flags` value called for `partial` or `full`.

## Data Model
New table: `clarifying_questions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| question | text | |
| answer | text | null until the user responds |
| round | int | always `1` for this stage (no multi-round loop here) |
| created_at | timestamptz | |

RLS: same `owner_id`-based ownership pattern already used on every other project-scoped 
table in this codebase.

This table already appears in the original Deepened Pipeline spec's ERD — if it was 
already created in an earlier migration attempt, verify its existing schema matches this 
before creating a duplicate migration.

## Backend Endpoint
`POST /api/projects/{project_id}/clarifying-questions`
- Requires auth (Bearer token) — same `get_current_user()` dependency as every other 
  endpoint.
- Requires the same combined `owner_id` + `project_id` ownership check already enforced 
  elsewhere.
- Request body: `{"idea_text": "string", "density_flags": {...}}`
- Generates and persists questions (with `answer: null` initially), returns the question 
  list to the frontend.

A second endpoint or the same endpoint (implementation choice) handles receiving answers:
`POST /api/projects/{project_id}/clarifying-questions/answer` (or similar)
- Request body: `{"answers": [{"question_id": "...", "answer": "..."}]}`
- Updates the corresponding rows' `answer` column.
- Appends the answers to the idea context that will be used by later generation.

## Frontend Behavior
- Called automatically after Density Check resolves, only if `clarifying_questions` flag 
  is `"partial"` or `"full"` — if `"skip"`, this stage is invisible and the flow proceeds 
  directly onward.
- Questions render as chat messages, consistent with existing message-bubble UI.
- User answers are captured and sent back via the answer endpoint.
- After all questions are answered, proceed to the next stage (Persona Capture V3.4 once 
  it exists; until then, proceed to Fixed Inputs).

## Explicitly Not In Scope Here
- Persona Capture (V3.4), NFR Capture (V3.5), Lightweight Confirm Draft (V3.8) — separate 
  future stages, not part of this file.
- Any change to the existing TOO_VAGUE Step 0 follow-up flow — that stays exactly as is.
- Any change to the feature schema or Requirement Quality Standard.
- Any change to Structure, Diagram, Final, or MCP screens.

## Rollback Note
This stage is additive — it runs conditionally based on a density flag that, if this stage 
is reverted, simply won't be checked by anything anymore (no other stage currently depends 
on `clarifying_questions` firing). If this causes errors after deployment, reverting this 
branch's merge commit removes the new endpoint(s), the new table, and the conditional call 
into this stage, with Step 0 and Density Check continuing to function exactly as they did 
before this stage existed.
