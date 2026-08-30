# MimarAi — V3: Feature Generation Pipeline Roadmap

**Goal:** Replace the simulated Step 1-6 feature generation (currently `setTimeout` + hardcoded "Loan Desk Studio" content) with the real dual-model (Gemini + Groq) pipeline, the comment system, feature reject/accept controls, and dependency-order generation — exactly as specified in the locked pipeline doc, with every edge case identified during review resolved as its own explicit phase.

**Depends on:** V2 complete (Step 0 classification real, fixed inputs real and persisted, `draft` project exists with idea + fixed_inputs populated).

**Branching:** This version is built on a separate branch, not directly on `main` — see the Antigravity prompt for the exact workflow. `main` stays exactly at its V2-complete state (tagged) until V3 is verified working, so a rollback is always one command away if something breaks.

---

## Phase 1 — Database Schema

- New `comments` table: `id`, `project_id` (FK), `stage` (text: `features` for V3, extensible later), `target_feature_id` (text, nullable — which feature/line the comment is attached to), `text`, `status` (`pending` | `submitted` | `resolved`), `created_at`. A dedicated table, not a jsonb blob on `projects` — cleaner to query and update per-comment.
- New `generation_state` jsonb column on `projects` (or reuse `step0_state`'s sibling pattern): tracks the current feature list, which features are AI-added vs. user-originated, rejected-feature ids, and the dependency order once generated.
- New `plan_history` table (lightweight audit log, not full versioning): `id`, `project_id`, `event` (e.g. `manually_amended`, `comment_batch_applied`), `feature_id` (nullable), `note`, `created_at`. Only the latest plan state is the "real" one; this table exists purely to support "Manually Amended" labeling and traceability, not to let a user browse old versions.
- New `generation_rate_limits` table (same free-tier-friendly counter pattern as V2's `rate_limits`): tracks per-user generation-pipeline runs/day and comment-batch submissions/hour separately, since they have very different cost profiles.
- Add `status` value `locked_generating` (or reuse `generating` — confirm during implementation) to represent "a generation or comment-batch is actively running for this project," used for the concurrency lock in Phase 6.

## Phase 2 — Backend: Core Generation Pipeline (Steps 1-5)

Implement the dual-model pipeline exactly as specified, as a single backend-orchestrated sequence:

- **Step 1 — Parallel Independent Drafting**: fire Gemini and Groq drafting calls concurrently (not sequentially), each given only the idea + fixed inputs, neither seeing the other's output. Total step time = the slower of the two calls, not their sum.
- **Step 2 — Diff & Merge**: compare both feature lists; any feature present in Groq's list but absent from Gemini's is added into the merged list.
- **Step 3 — First Validation (Groq)**: Groq checks the merged list for constraint violations (vs. fixed inputs), scope relevance, and completeness (every feature has constraints/exceptions defined).
- **Step 4 — Single Fix Pass (Gemini)**: if Groq flagged anything, Gemini fixes it based on Groq's stated reason — exactly once, never a loop. Groq never writes fixes itself.
- **Step 5 — Final Validation (Groq)**: Groq re-checks the fixed plan once more; whatever comes out moves forward regardless of remaining imperfection — no further looping.
- Persist the final merged/validated feature list into `generation_state`, tagging each feature as `ai_added` or `user_originated` (user-originated = anything traceable back to the user's original idea text; everything else is ai_added).

## Phase 3 — Exception Handling: Generation Pipeline Failures

Every failure mode below must fail closed, never silently degrade the "two independent drafts" guarantee or proceed on corrupted data:

- **Gemini or Groq draft call fails/times out in Step 1**: retry that specific call once. If it fails again, fail the entire generation run with a clear error shown to the user (e.g. "Generation failed, please try again") — never proceed with only one model's draft, since that breaks the core cross-checking guarantee the whole pipeline is built on.
- **Diff/merge (Step 2) or either validation step (3, 5) returns malformed/unparseable output** (e.g. broken JSON from a model): retry once with a stricter/repaired prompt. If it fails again, fail closed with a clear error — do not attempt to guess-parse partial output.
- **Gemini's Step 4 fix pass itself fails or times out**: do not retry this one (it's already the designated single-fix-pass step) — instead, skip the fix, proceed to Step 5 with the original flagged plan, and mark the resulting plan with the existing "Adjusted — Please Review" badge, consistent with how the doc already handles a flaw surviving both validation checks.
- All of the above must release the `generation_state` lock (Phase 6) on failure, so a failed run doesn't permanently block the user from retrying.

## Phase 4 — Frontend: Plan Review Screen (Step 6)

- Render the plan in the **fixed, non-configurable section order**: 1) Idea & Objective (synthesized restatement, generated — not copied verbatim from the raw idea text), 2) Fixed Inputs (labeled list of the selected tech stack/database/deployment/auth), 3) Features (individual cards).
- Each feature card: name + one-line description.
  - AI-added features: "AI-ADDED" tag + Reject button + comment icon.
  - User-originated features: comment icon only — no tag, no Reject button.
- Screen header: persistent "Review Comments" button (opens the accumulated-comments panel) and an "Accept Plan" action.
- This exact section order must also hold on every later re-display of the plan (after a comment/fix cycle, Phase 5) — not just the first render.

## Phase 5 — Comment System

- Reuse the UI interaction pattern already built and proven in the ported wizard shell (trigger → inline textbox → inline visibility → accumulate → counter badges → optional Review panel → batch submit) — this is a known-working pattern from the original prototype, wire it against real data instead of the simulation.
- **Batch submit** sends all accumulated comments together in a single call to the backend, which passes them to Gemini as one batch — not one round-trip per comment.
- Comment logic identical across feature types; Reject remains exclusive to AI-added features.
- **Persist comments to the new `comments` table** (Phase 1) with `status = 'pending'` while accumulating, `status = 'submitted'` the moment batch-submit fires, `status = 'resolved'` once the fix-and-validate cycle completes for that batch.

## Phase 6 — Exception Handling: Comment Batch Processing

- **Batch fix call fails partway through a multi-comment batch**: treat the whole batch as all-or-nothing — if the Gemini fix-batch call fails or errors, no comments in that batch are marked `resolved`, the plan is not changed, and the user sees a clear "failed to process your comments, please try again" state with the batch still intact for retry. Never let some comments silently apply while others drop.
- **Concurrent submission (two tabs/devices on the same project)**: while a generation run or comment-batch is actively processing, set the project's `status` to a locked state (Phase 1). Any second submission attempt while locked is rejected with a clear "a generation is already in progress" message, not processed as a second concurrent run. Lock is released on completion or failure (Phase 3's failure-cleanup rule applies here too).
- Groq validates every batch-processed plan using the same propose → validate → fix pattern already used in the core pipeline (Phase 2) — reused, not rebuilt as separate logic.

## Phase 7 — Feature Reject Handling

- Rejecting an AI-added feature is applied **immediately and optimistically** — it does not wait for or get bundled into the next comment batch. The feature is marked rejected in `generation_state` the moment the Reject button is clicked, independent of any in-progress comment accumulation.
- **Minimum feature guard**: "Accept Plan" is disabled if rejecting features would leave the plan with zero features remaining — require at least one feature (AI-added or user-originated) present before the plan can be accepted. Show a clear inline message if the user tries to reject their way to an empty plan.
- Downstream stages (Structure Generation, V4 drift-checker) must read the post-rejection feature list, not the original pre-rejection merged list.

## Phase 8 — Dependency-Order Generation

- Runs immediately after the user accepts the feature list, before Structure Generation begins (V4's job, out of scope here — V3 only generates and stores the order).
- Gemini proposes the order based on feature dependencies; Groq validates it.
- Backend-only — never rendered to the user as version labels.
- **Circular dependency handling**: if Groq flags an invalid order (e.g. A depends on B depends on A), allow **one fix pass** by Gemini specifically for this issue (mirroring the single-fix-pass pattern used elsewhere, applied here for consistency even though the original doc didn't explicitly specify a fix step for this one stage). If the second attempt still has an unresolved conflict, fall back to a simple default order (the order features currently appear in the accepted list) and mark the project with the "Adjusted — Please Review" flag rather than blocking progress entirely.

## Phase 9 — Rate Limiting & Abuse Control

- **Full generation pipeline (Steps 1-5)**: cap at a small number of full runs per user per day (e.g. 5/day) — this is a dual-model, multi-sequential-call operation, meaningfully more expensive than V2's single classification call, and needs its own explicit, tighter-scoped limit.
- **Comment-batch submissions**: cap separately (e.g. 15 batches/hour per user) — distinct from the generation-run cap since it's a different cost profile and usage pattern.
- Both limits use the same free-tier-friendly DB-counter pattern already established (`generation_rate_limits` table, Phase 1) — no Redis dependency.
- **Double-trigger prevention**: reuse Phase 6's project-lock mechanism — a double-click or repeated "Accept Plan"/generation-trigger while a run is already in progress for that project is rejected, not queued as a second run.
- Clear, specific error messaging for both limits, distinct from generic failures (matching V2's precedent for rate-limit messaging).

## Phase 10 — Repeatable Review Cycle (UX layer — no cap here, by design)

- The user-facing comment → fix → validate → re-display cycle has **no cap on number of rounds** — this is a deliberate doc decision, not an oversight. The only cap is on the *internal automated fix pass within each round* (Phase 2's Step 4, always exactly one attempt).
- The cost-control cap belongs entirely in Phase 9 (comment-batch submissions/hour) — do not conflate the UX-layer "unlimited rounds" decision with the backend-layer abuse-prevention cap; both are correct simultaneously and serve different purposes.

---

## V3 Exit Checklist

- [ ] Dual-model (Gemini + Groq) parallel drafting genuinely runs concurrently, not sequentially
- [ ] Diff & merge correctly adds Groq-only features into the merged list
- [ ] Validation → single fix pass → re-validation sequence matches the doc exactly, no extra loops
- [ ] Every failure mode in Phase 3 fails closed and correctly releases the project lock
- [ ] Plan Review screen renders the fixed Idea & Objective → Fixed Inputs → Features order, including on every re-display after a comment cycle
- [ ] Feature cards show correct AI-added vs. user-originated controls
- [ ] Comment system persists to the real `comments` table, batch-submits correctly, and Phase 6's all-or-nothing failure handling is verified by inducing an actual failure
- [ ] Concurrent-submission lock verified by actually attempting a second submission while one is in progress
- [ ] Feature reject applies immediately, independent of comment batching; minimum-one-feature guard verified
- [ ] Dependency-order generation's circular-dependency fix pass and fallback-order behavior both verified
- [ ] Generation-pipeline and comment-batch rate limits both enforced and independently tested
- [ ] Double-trigger prevention verified (rapid double-click on Accept Plan / generation trigger)
- [ ] No cap on user-facing review rounds (confirmed as intentional, not accidentally capped by Phase 9's backend limit)
- [ ] No screen past Plan Review (Structure, Diagram, Render, Final, MCP) modified in this version
- [ ] Branch merged into `main` only after the above is verified — see Antigravity prompt for the exact branch/merge workflow

Once all of the above is checked off and merged into `main`, V4 (Project Structure Generation) is next.
