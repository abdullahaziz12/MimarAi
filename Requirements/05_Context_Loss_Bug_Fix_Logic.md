# Bug Fix — Interview Pipeline Context Loss on Generation

## Root Cause (verified via direct code trace, not guessed)
`runIdeaPipeline()` in `frontend/src/store/mimarStore.js` always sends only `s.ideaText` — 
the original raw idea text captured when the draft was first created — to 
`/api/projects/{project_id}/generate`. This value is never updated after Contradiction 
Scan (V3.1) or Clarifying Questions (V3.3) run.

Both of those stages persist their results server-side (`step0_state.last_contradiction_result` 
/ `resolved_answer`, and `clarifying_qa` folded into `step0_state`), but nothing ever folds 
that persisted data back into the string that generation actually reads. This is not 
specific to retries — it has been true since V3.1/V3.3 were built. A failed-then-retried 
generation just makes the missing context more visible to the user, because they already 
saw themselves answer these questions in the chat.

## Fix Location and Approach
Fix this on the **backend**, inside the `/generate` route handler (or a helper it calls), 
not in the frontend. The frontend continues to send only `idea_text` and `fixed_inputs` 
exactly as it does today — no frontend changes required for this fix.

### What the backend must do differently
Before constructing the prompts sent to Gemini/Groq for feature generation, the `/generate` 
handler must:

1. Fetch the project's current `step0_state` (already loaded as part of the existing 
   ownership/project-fetch step in this handler).
2. Extract, if present:
   - The contradiction resolution context: `step0_state.last_contradiction_result` 
     (specifically its `explanation` and `conflicting_parts`, and any `resolved_answer` 
     that was submitted during the contradiction round-2 flow).
   - The clarifying Q&A: `step0_state.clarifying_qa` (or fetched fresh from the 
     `clarifying_questions` table if that's more current — prefer the table as the 
     authoritative source since it's the actual persisted answer record).
3. Construct a single, coherent **effective idea context** string that combines:
   - The original idea text (from the request body or the project's stored `idea_text` — 
     prefer the project's stored value as authoritative, since the frontend's copy could be 
     stale).
   - Any contradiction resolution detail, phrased as clarification/amendment to the 
     original idea (e.g. "Regarding an earlier ambiguity: the user clarified that ...").
   - Each clarifying question and its answer, phrased as additional stated requirements 
     (e.g. "Additional detail provided: Q: '...' A: '...'").
4. Use this combined context — not the raw request-body `idea_text` alone — as the actual 
   idea input to Steps 1-6 of the dual-model generation pipeline (Gemini/Groq drafting, 
   validation, fix pass).
5. This combined context should also be what gets persisted into `generation_state` as 
   `idea_objective`'s source material, so the final plan's synthesized objective reflects 
   the full picture, not just the original one-line idea.

### Why this must not simply overwrite the stored `idea_text`
Do not overwrite the project's original `idea_text` column with this combined string. Keep 
`idea_text` as the original user input (useful for display, history, and re-running 
Contradiction Scan or Density Check against the true original input if ever needed). The 
combined context should be assembled fresh, in-memory, at generation time — treat it as a 
derived value, not a stored one, unless a separate column is explicitly added for it later.

## Idempotency and Retry Behavior
Because this fold happens server-side on every `/generate` call using the project's current 
persisted state, a retry after failure will automatically include the same accumulated 
context as the original attempt — the fix is inherently retry-safe with no special-casing 
needed for "is this a retry." If the user answers more clarifying questions or resolves a 
new contradiction between attempts, the retry will naturally pick up that newer context too, 
since it's read fresh from the database each time.

## Failure Handling
If fetching `step0_state` or the `clarifying_questions` table fails for some reason (e.g. 
transient DB error), this must not silently drop the context and proceed with just the raw 
idea text — that would reintroduce a milder version of the same bug. Instead:
- Retry the fetch once.
- If it still fails, fail the `/generate` request with a clear error rather than silently 
  generating a plan against incomplete context that the user believes is complete.

## Explicitly Not In Scope Here
- No frontend changes.
- No change to how Contradiction Scan or Clarifying Questions themselves work or persist 
  data — this fix only changes how their already-persisted output is *read and used* at 
  generation time.
- No change to the feature schema or Requirement Quality Standard.
- This fix does not address Bug A1/A2 or any other previously identified issue — those are 
  separate and already fixed.

## Verification Requirements
1. Reproduce the original bug first: submit an idea, resolve a contradiction, answer 
   clarifying questions, then trigger `/generate` — inspect the actual prompt sent to 
   Gemini/Groq (via logging or a debug breakpoint) and confirm today it does NOT include 
   the contradiction/clarifying context. This establishes a "before" baseline.
2. After the fix, repeat the same sequence and confirm the actual prompt sent to 
   Gemini/Groq DOES include the folded context — paste the real assembled context string 
   used in a real live generation call.
3. Test the retry case specifically: force a generation failure (e.g. temporarily break a 
   provider call), retry, and confirm the retry's prompt still contains the full folded 
   context — not just the original idea text.
4. Confirm `idea_text` in the database remains unchanged (still the original raw text) 
   after generation — only the in-memory context used for the AI call should be enriched, 
   not the stored column.

## Rollback Note
This change is isolated to the `/generate` handler's context-assembly step. If it causes 
issues after deployment, reverting the merge commit restores the previous (buggy but known) 
behavior of sending only the raw `idea_text`, with no impact on Contradiction Scan, Density 
Check, or Clarifying Questions themselves, since none of those stages are modified by this 
fix.
