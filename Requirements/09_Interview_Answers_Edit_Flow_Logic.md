# V3.11 — Interview Answers Edit Flow: Full Implementation Logic

## Where This Fits
This is a post-V3-core addition, built after V3.4/V3.5 (Persona/NFR), V3.8 (Lightweight 
Confirm Draft), and V3.9 (Quality Standard) are all in place. It does not add a new 
pipeline stage — it adds a way to go back and revise answers already given to existing 
stages, before final generation is accepted.

## Problem This Solves
Today, once a user answers a clarifying question, states their personas, or selects NFR 
values, there is no way to change that answer during the interview itself — the only 
existing edit path is the comment system, which only exists AFTER a full plan has already 
been generated. If a user realizes mid-interview that an earlier answer was wrong or 
incomplete, they currently have no way to correct it before spending a full generation run 
on a plan built from that mistake.

## Scope
This session covers editing answers to stages that are **already built**: Contradiction 
Scan's resolution, Clarifying Questions (V3.3), Persona Capture (V3.4), and NFR Capture 
(V3.5). It does NOT re-run Density Check (V3.2) or Step 0 classification when an edit 
happens — editing an answer does not retroactively change which stages were shown/skipped 
originally.

This session does NOT touch the post-generation comment system — that remains the correct 
edit path once a plan actually exists. This is specifically for the pre-generation 
interview phase.

## Trigger / UI Entry Point
Add a simple "Review your answers" affordance, accessible any time before the user taps 
"Ready to generate" (or, if V3.8 is in place, any time before Lightweight Confirm Draft is 
finally confirmed). This does not need to be a separate screen — a collapsible panel or a 
button that opens a summary view is sufficient.

## What the Review/Edit View Shows
Fetch and display, in one place:
- The original idea text (read-only in this view — editing the core idea text itself is 
  out of scope here; that would re-trigger Step 0 classification and Contradiction Scan, 
  which is a bigger change not covered by this session).
- Contradiction resolution, if one occurred: the conflict explanation and the user's 
  `resolved_answer` (editable).
- Each clarifying question asked and its current answer (each editable individually).
- The persona answer (editable).
- The three NFR selections (each editable via the same dropdowns used originally).

## Backend Endpoint — New Read Endpoint
`GET /api/projects/{project_id}/interview-summary`
- Auth + ownership check (same pattern as every other endpoint).
- Aggregates and returns, in one response: contradiction resolution data (from 
  `step0_state.last_contradiction_result`), all rows from `clarifying_questions` for this 
  project, the `personas` object, and the `nfrs` object.
- This is a pure read — no new data model needed beyond what V3.1/V3.3/V3.4/V3.5 already 
  created.

## Backend — Editing Existing Answers (reuse existing endpoints, do not duplicate)
- **Clarifying question answers**: reuse the existing answer-submission endpoint from V3.3 
  (`POST /api/projects/{project_id}/clarifying-questions/answer`), but it must now support 
  being called again for an already-answered `question_id` — this becomes an update 
  (upsert), not an insert-only operation. If the existing endpoint only supports first-time 
  answers, extend it to update in place rather than creating a new duplicate row.
- **Persona answer**: reuse the existing `POST /api/projects/{project_id}/personas` 
  endpoint from V3.4 — calling it again with a new answer should overwrite the stored 
  value, not append or duplicate.
- **NFR selections**: reuse the existing `POST /api/projects/{project_id}/nfrs` endpoint 
  from V3.5 — same overwrite behavior.
- **Contradiction resolution edit**: this one needs care. Editing the `resolved_answer` 
  should update `step0_state.last_contradiction_result.resolved_answer` directly (a simple 
  field update), WITHOUT re-running a new contradiction scan call or re-entering the 
  round-cap loop — this is a manual correction to an already-resolved (or 
  already-proceeded-past-cap) item, not a new scan.

Confirm each of these reused endpoints already behaves as an upsert before assuming this 
works — if any currently reject a second call for the same project as invalid or create a 
duplicate row, that specific endpoint needs a small fix as part of this session to support 
being called again.

## Effective Idea Context — No Extra Work Needed
Because `assemble_effective_idea_context` already reads all of this data fresh from the 
database on every call (built in the context-loss bug fix and extended through V3.4/V3.5/ 
V3.8), an edited answer automatically flows into the next generation attempt with zero 
additional wiring. This session does not need to touch that function at all — confirm this 
via testing rather than modifying it defensively.

## Interaction With Lightweight Confirm Draft (V3.8), If Already Shown
If the user has already seen and confirmed a Lightweight Confirm Draft, and then edits an 
answer via this new review flow, the previously confirmed draft is now based on stale 
context. Per the same invalidation principle already established in the Locked Plan for 
edited inputs after the "Ready to generate" trigger:
- An edit made through this review flow after Lightweight Confirm Draft was already 
  confirmed must reset `lightweight_draft.final_status` to null/unconfirmed, so the next 
  attempt to proceed re-triggers a fresh lightweight draft reflecting the edited context, 
  rather than silently generating against an already-stale confirmed draft.
- This does not require a new mechanism — reuse the same "any edit invalidates the pending 
  trigger" pattern already described in the Locked Plan (Section 1.5.4), applied here to 
  the lightweight draft's confirmed state instead of the initial start-trigger prompt.

## Frontend Behavior
- A "Review your answers" button/panel, available any time before generation is triggered 
  (or before lightweight draft is finally confirmed, if that stage exists in the build).
- Opens a summary view listing every editable item described above.
- Each item is independently editable inline (or via a small edit form) — the user does 
  not need to re-do the entire interview to change one answer.
- On saving any edit, call the corresponding reuse-endpoint above.
- If a Lightweight Confirm Draft had already been confirmed, show a brief notice that the 
  draft will be regenerated to reflect the change.

## Failure Handling
Same fail-closed pattern as every other stage: one retry on a failed save, then a clear 
user-facing error — never silently discard an edit and let the user believe it was saved 
when it wasn't.

## Explicitly Not In Scope Here
- Editing the original idea text itself (would re-trigger Step 0 + Contradiction Scan — 
  out of scope, bigger change).
- Editing Fixed Inputs (stack/database/deployment/apis) — those already have their own 
  existing edit path via the Fixed Inputs screen itself, not part of this review flow.
- Any change to the post-generation comment system.
- Re-running Density Check when an answer changes.
- Admin Portal or any other roadmap item unrelated to this session.

## Rollback Note
This session is additive — one new read endpoint, plus small upsert-support fixes to 
existing endpoints if they don't already support being called twice. If reverted, the 
worst case is that already-edited data in the database remains (since edits are just 
normal field updates, not a special data shape), but no other stage depends on this 
review/edit flow existing, so a revert cleanly removes only the review UI and the new 
summary endpoint.

## Manual Steps Required
No new Supabase migration should be needed — this session only reads/updates existing 
columns and tables (`step0_state`, `clarifying_questions`, `personas`, `nfrs`, 
`lightweight_draft`). If Antigravity determines a migration is genuinely needed, it must 
stop and explain why before proceeding, following the same manual-SQL-handoff process used 
in prior sessions.
