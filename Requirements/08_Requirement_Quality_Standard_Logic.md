# V3.9 — Requirement Quality Standard Integration: Full Implementation Logic

## Where This Fits
Integrates into the existing full dual-model generation pipeline (Steps 1-6), which runs 
after the Lightweight Confirm Draft (V3.8) is confirmed or the 2-attempt cap is reached. 
This is the last planned V3 stage — once this is built, V3 (the deepened interview 
pipeline) is considered complete.

## Purpose
Every feature the pipeline produces — whether user-originated or AI-inferred — must 
satisfy a defined set of quality characteristics, checked structurally (via schema fields 
a script can verify) rather than only claimed by the model. This closes the fabrication 
risk identified during design review: a model can currently claim a feature is well-formed 
without it actually being true, and there is no code-level check today.

## Scope — Which Characteristics Apply Here (and Which Don't)
Of the 14 original candidate characteristics, only **10 apply at feature-generation time**. 
The remaining 4 are explicitly owned by other stages and must NOT be duplicated here:

| Characteristic | Deferred to |
|---|---|
| Consistent | Contradiction Scan (V3.1, already built) |
| Testable/Verifiable (numeric, e.g. "500 concurrent users") | NFR Capture (V3.5, already built) — numeric performance claims belong in NFRs, not features |
| Prioritized | Lightweight Confirm Draft (V3.8, already built) — needs user-facing context, not derivable from idea text alone |
| Coherent | Dependency-order / merge stage (already built) — cross-feature property, not single-feature |

**The 10 characteristics this session implements:**

1. **Unambiguous** — no vague terms ("fast," "efficient") without a concrete definition. 
   If no number was given by the user, the feature must state the gap explicitly rather 
   than inventing a number.
2. **Correct** — feature must map to something in the idea text, an actor (from Persona 
   Capture), or a fixed input — not a pure assumption.
3. **Atomic** — one feature = one behavior. Split anything joined by "and" into two 
   features.
4. **Complete** (well-formed sense only, NOT the "enough info exists" sense which is 
   Density Check's job) — trigger, action, and result must all be present.
5. **Understandable** — plain language, no unexplained jargon.
6. **Clear and Concise** — no filler adjectives ("robust," "seamless") without concrete 
   meaning.
7. **Independent** — meaningful without needing to read another feature's description.
8. **Necessary** (redefined) — reject only features irrelevant to the stated domain, NOT 
   features the user didn't explicitly type. This preserves the existing AI-inference 
   design — do not let this characteristic bias the model toward rejecting legitimate 
   inferred features.
9. **Traceable** (redefined) — every feature must have either a direct textual basis, or a 
   non-null `reasoning` field when `provenance: ai_inferred`.
10. **Feasible/Realistic** — checked against `fixed_inputs` (stack, database, deployment, 
    apis). No impossible absolutes ("100% accuracy," "zero downtime").

## Feature Schema Extension
Current feature schema (what exists in code today): `id`, `name`, `description`, `source`.

**New required schema** — this is the single biggest change in this session:

```json
{
  "id": "feat_001",
  "name": "Location Sharing",
  "description": "One-line summary for the feature card UI.",
  "source": "user_originated",
  "business_rules": [
    "User can share live location with 1+ designated trusted contacts.",
    "Sharing session has an explicit start/stop toggle."
  ],
  "data_touched": ["user_location", "trusted_contacts"],
  "actor_role": ["app_user (sharer)", "trusted_contact (viewer, read-only)"],
  "acceptance_criteria": [
    "A trusted contact can view the sharer's live position within N seconds of an update.",
    "Sharing stops immediately and visibly when toggled off."
  ],
  "exclusions": [
    "v1 does not support location history/replay after a session ends."
  ],
  "priority": "must_have",
  "provenance": "user_originated",
  "reasoning": null,
  "source_model": "merged",
  "quality_flags": {
    "atomic": true,
    "complete": true,
    "traceable": true,
    "independent": true,
    "feasible": true,
    "failed_checks": []
  }
}
```

Notes:
- `reasoning` is **mandatory and non-null whenever `provenance` is `ai_inferred`**.
- `exclusions` are business-logic boundaries ("v1 doesn't support X"), explicitly distinct 
  from the later Exception Handling JSON (technical failure modes). Do not conflate these.
- `actor_role` should draw from Persona Capture's (V3.4) captured data when available.
- `quality_flags.failed_checks` lists which of the 10 characteristics, if any, a feature 
  failed — this is what makes the standard auditable rather than a black-box claim.

## Enforcement Mechanism — Split by What's Actually Checkable in Code vs. What Needs the Model

### Code-level checks (no extra AI call — implement as Python validation)
These are mechanically checkable against the new schema fields without needing model 
judgment:
- **Atomic**: flag descriptions containing multiple distinct verbs/behaviors joined by 
  "and" (a simple heuristic check, similar in spirit to Density Check's keyword approach — 
  does not need to be perfect, just directionally useful).
- **Complete**: require `acceptance_criteria` to be non-empty.
- **Traceable**: require `reasoning` to be non-null when `provenance == "ai_inferred"`.
- **Independent**: a lighter heuristic check — flag descriptions that reference another 
  feature by name/ID without standalone context (best-effort, not required to be perfect).
- **Feasible**: check `business_rules`/`description` text for known-impossible absolute 
  claims ("100%", "zero downtime", "always") that aren't qualified.

### Model-checked (route to the existing Groq validation pass — already built)
These are genuinely subjective and belong in Step 3's existing validation call, extended 
with these criteria rather than a new separate AI call:
- **Correct** — does this feature genuinely serve the stated idea/actors?
- **Necessary** — is this feature domain-relevant (not: did the user type it verbatim)?
- **Unambiguous, Understandable, Clear and Concise** — these are best judged by the model 
  reading the feature holistically; add them as explicit criteria in the existing Step 3 
  validation prompt rather than building separate code heuristics for subjective wording 
  quality.

**Important: do not add a third AI call for this.** Extend the existing Step 3 (Groq 
validation) prompt to also check the model-judged characteristics above, and record 
results into `quality_flags`. The code-level checks run as plain Python before/alongside 
that call, not as their own provider request.

## Fix Pass Integration
When Step 3 validation (now extended) or the code-level checks flag a feature as failing 
one or more characteristics, this feeds into the existing Step 4 Gemini fix pass exactly 
as constraint/scope violations do today — no new fix mechanism needed. The fix pass prompt 
should be told specifically which characteristic(s) failed (from `quality_flags.failed_ 
checks`) so Gemini's rewrite targets the actual problem instead of a vague "fix this."

## Diff/Merge Update
The existing diff/merge step (Step 2) currently matches features by name-string similarity. 
Per the original spec's intent, update this to match by `data_touched` + `actor_role` 
overlap instead, now that the schema provides this structured data — this produces fewer 
false-duplicate or false-distinct merges than name matching.

## Failure Handling
If a feature cannot be assembled with the full schema (e.g. the model's response is 
missing required fields even after the existing repair-prompt retry), do not silently 
accept a partial/malformed feature into `generation_state`. Treat a schema-incomplete 
feature the same way the existing pipeline treats other validation failures — flag it for 
the fix pass, or if it survives to final validation still incomplete, mark the whole 
generation `adjusted_flag: true` (reusing the existing mechanism, consistent with how 
Contradiction Scan's `contradiction_unresolved` was wired to this same flag).

## Explicitly Not In Scope Here
- Admin Portal, interview-answer editing, reliability-batch items — unrelated to this 
  session.
- Any change to Structure, Diagram, Final, or MCP screens.
- Building a third AI call for quality checking — explicitly forbidden per the Enforcement 
  Mechanism section above.
- Re-implementing Consistent, numeric Testable, Prioritized, or Coherent checks — these 
  stay owned by their respective existing stages.

## Rollback Note
This is the largest schema change in the V3 sequence, since it touches the core feature 
object every downstream piece (Plan Review, comments, dependency-order) already depends on. 
Before merging, confirm Plan Review's feature cards and the comment system still function 
correctly against the extended schema (they should, since all new fields are additive, not 
replacing existing ones like `id`/`name`/`description`/`source`). If reverted after merge, 
`git revert <merge-commit-hash>` restores the simpler schema — but note this is a heavier 
revert than prior V3 stages, since generation_state rows created with the new schema would 
remain in the database with fields the reverted code no longer expects. Flag this 
asymmetry explicitly in the final report rather than treating rollback as costless here.

## Manual Steps Required
This session does NOT require a new Supabase migration — `generation_state` is already a 
jsonb column and the feature schema lives inside it, not as separate columns. No SQL step 
should be needed. If Antigravity determines a migration is actually needed, it must stop 
and explain why before proceeding, since this contradicts the current data-model 
assumption.
