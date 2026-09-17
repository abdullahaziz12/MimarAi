# V3.8 — Lightweight Confirm Draft: Full Implementation Logic

## Where This Fits
Runs after Fixed Inputs Collection and the "Ready to generate" trigger tap, but BEFORE the 
expensive full dual-model generation (Steps 1-6). Still part of V3, not a separate 
top-level version. This is the last new stage before the full generation pipeline itself.

## Purpose
Catch a fundamental misunderstanding — wrong domain assumption, a missed stated feature — 
before spending the full dual-model, multi-call, fully-structured generation on a 
misunderstood premise. This is the step that prevents wasted expensive regeneration cycles.

## Trigger Condition
Fires after the user taps "Ready to generate," replacing the direct jump straight into 
Step 1 (Parallel Draft) that exists today. This stage sits between the trigger tap and the 
actual start of full generation.

## Call Type
**Single model only, one call — not dual.** This is a hard constraint: the entire value of 
this stage is being fast and cheap relative to the full pipeline. Do not call both Gemini 
and Groq here; pick one (use whichever this codebase's existing lightweight-call pattern 
favors — consistent with Contradiction Scan's choice).

### Prompt intent
Given the full effective idea context (already assembled via 
`assemble_effective_idea_context` — reuse it, do not rebuild context assembly a third 
time), produce a plain bullet-point list of the features the model understood from the 
idea. No structured schema, no business rules, no acceptance criteria — just a quick 
sanity-check summary a human can skim in a few seconds.

### Response shape
```json
{
  "draft_features": [
    "Bullet point feature summary 1",
    "Bullet point feature summary 2"
  ]
}
```

## Flow
1. After the trigger tap, call this stage instead of immediately starting full generation.
2. Show the bullet list to the user with a simple confirm/reject UI: "Looks right → 
   Generate full plan" / "Something's off → tell me what."
3. **If confirmed**: proceed immediately to full generation (Steps 1-6), using the same 
   effective idea context.
4. **If rejected**: the user provides a correction in free text. This correction is 
   appended to the idea context (same folding mechanism as everything else), and this 
   lightweight step re-runs once more with the corrected context.
5. **Cap at 2 attempts total.** If the user rejects a second time, do not loop again — 
   proceed to full generation regardless, but set a flag (`lightweight_draft_flagged: 
   true`) so Step 3's validation (Groq) in the full pipeline treats this generation with 
   extra scrutiny (this flag existing is sufficient for this session — actually changing 
   Step 3's validation behavior based on it is optional/future work, not required now, but 
   the flag must be set and persisted so it's available if that validation enhancement 
   happens later).

## Failure Handling (fail-closed)
- One retry on a malformed or failed provider response.
- If it still fails after retry: show a clear, user-facing error with a manual retry 
  option — same fail-closed pattern as every other AI-call stage in this pipeline.
- Never silently skip this stage and jump straight to full generation without the user 
  ever seeing a confirm step — that defeats the entire purpose of this stage.

## Data Model
New jsonb column on `projects`: `lightweight_draft`

```json
{
  "attempts": [
    {
      "draft_features": ["...", "..."],
      "user_response": "confirmed" | "rejected",
      "correction_text": "string or null",
      "created_at": "ISO timestamp"
    }
  ],
  "final_status": "confirmed" | "proceeded_after_cap",
  "lightweight_draft_flagged": true | false
}
```

## Backend Endpoint
`POST /api/projects/{project_id}/lightweight-draft`
- Auth + ownership check (same pattern as every other endpoint).
- Request body: `{"attempt": 1 | 2, "correction_text": "string or null"}`
- Generates the single-model bullet list, persists the attempt, returns it.

`POST /api/projects/{project_id}/lightweight-draft/respond`
- Request body: `{"response": "confirmed" | "rejected", "correction_text": "string or 
  null"}`
- If confirmed: marks `final_status: "confirmed"`, signals frontend to proceed to full 
  generation.
- If rejected and this was attempt 1: signals frontend to re-call the draft endpoint with 
  attempt 2 and the correction text folded in.
- If rejected and this was attempt 2 (cap reached): sets `final_status: 
  "proceeded_after_cap"` and `lightweight_draft_flagged: true`, signals frontend to proceed 
  to full generation anyway.

## Effective Idea Context Integration
Reuse `assemble_effective_idea_context` (already extended once for Persona/NFR in V3.4/ 
V3.5) for both generating the lightweight draft itself AND for folding in any correction 
text the user provides on rejection. Do not create a separate context-assembly path for 
this stage.

## Frontend Behavior
- After the trigger tap, show the bullet-list draft with the confirm/reject UI instead of 
  immediately showing a generation-in-progress state.
- On confirm, proceed to the existing full-generation flow exactly as it works today.
- On reject, show a text input for the correction, submit it, show the re-generated draft 
  (attempt 2), same confirm/reject choice.
- After attempt 2, if rejected again, show a brief message explaining the plan will 
  proceed with the given context and get extra validation scrutiny, then proceed to full 
  generation automatically.

## Explicitly Not In Scope Here
- Requirement Quality Standard (V3.9) — separate future work. Note: `lightweight_draft_ 
  flagged` is set in this session but actually wiring it into Step 3's validation logic is 
  optional/deferred, as stated above.
- Any change to the feature schema.
- Any change to Structure, Diagram, Final, or MCP screens.
- Admin Portal or any other roadmap item unrelated to this session.

## Rollback Note
This stage sits between the trigger tap and full generation — reverting this branch's 
merge commit restores the direct trigger-tap-to-full-generation flow that exists today, 
with no impact on any earlier stage (Contradiction Scan, Density Check, Clarifying 
Questions, Persona/NFR Capture all remain unaffected either way).

## Manual Steps Required (flag explicitly in the final report)
This session requires a new Supabase migration (one new jsonb column, `lightweight_draft`, 
on `projects`). This must be run manually in the Supabase SQL Editor by the project owner 
after Antigravity provides the exact SQL — Antigravity must NOT assume it can run this 
migration itself against the live database, and must clearly output the exact SQL block 
needed.
