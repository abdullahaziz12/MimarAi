# V3.2 — Density Check: Full Implementation Logic

## Where This Fits
Runs immediately after Contradiction Scan (V3.1) resolves — whether resolved cleanly, or 
proceeding after the 2-round cap. Still part of V3, not a separate top-level version.

## Purpose
Decide, cheaply and instantly, whether the idea text the user already provided already 
contains enough information to skip or shorten future stages — Clarifying Questions 
(V3.3), Persona Capture (V3.4), and NFR Capture (V3.5). This prevents re-asking a detailed, 
power-user idea the same questions it already answered, while still asking a minimal idea 
everything it needs to.

**Important scope note:** V3.3 (deepened Clarifying Questions), V3.4 (Persona Capture), and 
V3.5 (NFR Capture) do not exist yet in code. This stage only produces and persists the 
`density_flags` data — it does not yet control any UI behavior for those future stages, 
since they aren't built. When those stages are eventually built, they must read and respect 
this flag; that wiring is out of scope for this session.

## Call Type
**No AI call at all.** This is pure backend heuristic logic — synchronous, deterministic, 
and effectively free/instant. This is a hard constraint, not a preference: introducing an 
AI call here would add cost and latency to every single interview for a check that only 
needs to be directionally right, not precise.

## Heuristic Signals
Run these checks against the idea text (and, if available, any resolved contradiction 
context from V3.1):

1. **Length threshold** — word count of the idea text. A short idea (e.g. under ~15-20 
   words) is very unlikely to contain persona or NFR information.
2. **Persona/role keyword presence** — look for role-indicating words/phrases: "admin," 
   "user," "doctor," "patient," "customer," "staff," "manager," "role," "permission," 
   "access level," or similar. Presence suggests personas may already be partially stated.
3. **Scale/numeric language presence** — look for numbers combined with scale words: 
   "users," "concurrent," "thousand," "daily," "requests," "per second," etc. Presence 
   suggests NFR scale information may already be partially stated.
4. **Sensitivity keyword presence** — look for words indicating data sensitivity: "medical," 
   "health," "financial," "payment," "banking," "children," "personal data," "HIPAA," "PCI," 
   etc. Presence suggests data-sensitivity NFR information may already be partially stated.
5. **Sentence/clause count** — a longer, multi-clause idea (e.g. multiple sentences, or 
   commas/semicolons separating distinct stated requirements) suggests general density, 
   raising the likelihood that clarifying questions have less to add.

## Output — `density_flags`
Produces a flag per future stage, one of three values: `"skip"`, `"partial"`, `"full"`.

```json
{
  "clarifying_questions": "skip" | "partial" | "full",
  "personas": "skip" | "ask",
  "nfrs": "skip" | "ask"
}
```

- `clarifying_questions` supports three levels because that stage (V3.3) generates 2-4 
  targeted questions — a dense idea might still have 1 real gap worth asking about 
  (`partial`), even if it's detailed everywhere else.
- `personas` and `nfrs` are binary (`skip`/`ask`) because those stages (V3.4, V3.5) are a 
  single fixed question and three fixed dropdowns respectively — there's no meaningful 
  "partial" version of a single question or three independent selects.

### Suggested mapping logic (deterministic, not AI-judged)
- If word count is very low (below the short-idea threshold) AND no role/scale/sensitivity 
  keywords are present → `clarifying_questions: "full"`, `personas: "ask"`, `nfrs: "ask"`.
- If role/persona keywords are present → `personas: "skip"`.
- If both scale AND sensitivity keywords are present → `nfrs: "skip"`. If only one of the 
  two is present → `nfrs: "ask"` (still need the missing piece).
- If the idea is long/dense (above a length threshold) AND has multiple distinct stated 
  clauses → `clarifying_questions: "partial"` or `"skip"` depending on how many of the 
  above signals were already found; otherwise `"full"`.
- These thresholds are starting points, not hard requirements — implementation may tune 
  exact numbers, but the categories and the "heuristic only, no AI" constraint are fixed.

## Persistence
New jsonb column on `projects`: `density_flags`, storing the shape above, computed once 
per idea submission (i.e., recomputed if the idea text changes materially, same trigger 
point as when Contradiction Scan re-runs on a revised idea).

No new table needed — this is a single small object per project, consistent with how 
`step0_state` and `fixed_inputs` are already stored directly on `projects`.

## Backend Endpoint
Rather than a new standalone endpoint requiring its own round-trip, this heuristic should 
run **synchronously as part of the same request that confirms Contradiction Scan is 
resolved** (or as a trivial, near-zero-latency addition to the existing Step 0 / 
contradiction-scan response) — per the original spec's architecture note: "runs 
synchronously as part of the same request that confirms READY, adding negligible latency."

If a fully separate endpoint is simpler given the current code structure, that's 
acceptable, but it must not introduce a new user-facing loading state or perceptible delay 
— this check must remain effectively free.

Ownership checks: same `owner_id` + `project_id` pattern as every other endpoint, if 
implemented as its own route.

## Failure Handling
There is no external call to fail. If the heuristic itself throws (e.g. unexpected input 
type), default to the safest fallback: `full`/`ask` for every flag — i.e., ask everything, 
never silently skip a stage due to an internal error. This is the opposite fail-safe 
direction from an AI call: here, "asking too much" is the safe failure mode, not "assuming 
nothing needs to be asked."

## Explicitly Not In Scope Here
- Clarifying Questions (V3.3), Persona Capture (V3.4), NFR Capture (V3.5) — not built yet, 
  not part of this file.
- Any frontend UI that reads `density_flags` to skip/show a stage — there is no such stage 
  to skip yet. This session only produces and persists the flag.
- Any change to the feature schema or Requirement Quality Standard.
- Any change to Structure, Diagram, Final, or MCP screens.

## Rollback Note
This stage only adds a new column and a small piece of synchronous logic — it does not 
modify Contradiction Scan, Step 0, or any existing endpoint's external behavior. If this 
causes errors after deployment, reverting this branch's merge commit removes the 
`density_flags` computation and column usage cleanly, with no dependency from any other 
existing stage (since nothing downstream reads this flag yet).
