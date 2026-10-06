# V6.0 — Final Plan Consolidation (Logic Spec)

**Status:** NEW — not yet implemented
**Depends on:** V4 (Structure Generation) accepted, V5.0 (Diagram Generation Core) accepted, V5.1 (Ask-AI Diagram Editing) merged
**Comment system:** reuses existing `comments` table, `stage = "final"` (already a valid value in `CommentStage` Literal — confirm it is, add it if it isn't)

---

## 1. Purpose

V0–V5 produced three *separate* accepted artifacts per project:

1. Features (V3 pipeline, `quality_flags`-validated)
2. Structure (V4)
3. Diagrams — ERD + Architecture (V5.0/V5.1)

V6 does **not** generate new creative content from scratch. It:

- **Consolidates** the three accepted artifacts into one `final_plan` record — a single coherent document view.
- Runs an **Exception Handling & Security Review** pass over that consolidated content — AI-generated, dual-drafted, validated like every other stage — producing a list of concrete exception-handling requirements and security considerations tied to specific features/structure nodes.
- Produces **Mandatory Directives** — a short, non-negotiable rule list that any downstream coding agent (Antigravity, or later the V7 MCP handoff) MUST follow. These are extracted/derived, not freely invented: every directive must trace back to a specific `provenance` (a feature's `business_rules`, a structure constraint, a security-review finding, or a user-stated clarifying/persona/NFR answer). No directive may be fabricated from nothing.
- Is the **last human checkpoint** before the plan is considered "locked" and ready for V7 (MCP handoff). Nothing here is editable after `final_plan.status = 'locked'` except via an explicit, logged re-open action.

This is consolidation + review, not generation. Keep the AI's job narrow: review what already exists, flag gaps, do not re-author features/structure/diagrams.

---

## 2. Prerequisite gate

A project MAY NOT start V6 generation unless ALL of the following are true (checked server-side, fail-closed — return 409 with a specific `missing` array, never 200 with partial data):

- `features_status = 'accepted'`
- `structure_status = 'accepted'`
- `diagram_status = 'accepted'` (covers both ERD and architecture diagram)

This mirrors the V4 "accept-features" prerequisite gate pattern exactly — same shape of check, same fail-closed 409 response style. Reuse that existing gate-check function if one exists; do not write a second copy of the same logic.

---

## 3. Data model

### New table: `final_plans`

| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `project_id` | uuid, fk → projects, unique | one final plan per project (not a history table — see §7 for re-open/versioning) |
| `status` | text | `draft` \| `under_review` \| `locked` — fail-closed default `draft` |
| `consolidated_summary` | jsonb | the merged view: feature IDs + structure node IDs + diagram artifact IDs, cross-referenced (see §4) |
| `mandatory_directives` | jsonb | array of directive objects (see §5.3) |
| `exception_handling` | jsonb | array of exception-handling objects (see §5.2) |
| `security_considerations` | jsonb | array of security finding objects (see §5.2) |
| `quality_flags` | jsonb | pass/fail per review characteristic (see §6), same shape convention as V3.9's feature-level `quality_flags` |
| `draft_gemini` | jsonb | raw independent draft, kept for audit — same pattern as V3/V4/V5 dual-draft storage |
| `draft_groq` | jsonb | raw independent draft |
| `source_model` | text | `gemini` \| `groq` \| `merged` \| `tracked_substitution` — reuse exact labeling convention from V4/V5, including the "EXPECTED (TRACKED SUBSTITUTION)" honesty rule when both slots are actually Groq |
| `locked_at` | timestamptz, nullable | set when `status` → `locked` |
| `locked_by` | uuid, nullable | user id |
| `created_at`, `updated_at` | timestamptz | |

RLS: enabled, with an actual policy from the start (service-role client for writes, same justification as the `contradiction_checks` Fix 1 precedent — app-layer `get_owned_project()` ownership check already gates access before any read/write). Do not repeat the Fix-1 mistake of RLS-enabled-zero-policies.

### `comments` table

No schema change needed if `stage` already accepts `"final"`. If the current `CommentStage` Literal is `["features","structure","diagram","final"]`, this is already correct — verify in code before assuming. If `"final"` is missing, add it in this same PR.

---

## 4. Step 1 — Consolidation (deterministic, no AI call)

Pure Python, no model call — same philosophy as V3.2's Density Check: cheap, deterministic, auditable.

Build `consolidated_summary`:

```json
{
  "features": [{"feature_id": "...", "title": "...", "priority": "...", "actor_role": "..."}],
  "structure_nodes": [{"node_id": "...", "type": "...", "maps_to_features": ["feature_id", ...]}],
  "diagram_refs": {"erd_id": "...", "architecture_id": "..."},
  "cross_reference_gaps": [
    {"type": "feature_not_in_structure", "feature_id": "..."},
    {"type": "structure_node_no_feature", "node_id": "..."}
  ]
}
```

`cross_reference_gaps` is the one piece of real logic here, and its blocking behavior is now explicitly defined (this was a gap in the first draft of this spec — resolved):

- `feature_not_in_structure` (a feature maps to zero structure nodes) — **hard blocker.** `status` may not move to `locked` while any such gap is open. Every feature must be built somewhere; if it isn't yet in the structure, the structure is incomplete, not the plan ready.
- `structure_node_no_feature` (a structure node maps to zero features) — blocker **unless** the node's `type` is in a fixed infra allowlist: `database`, `auth_middleware`, `api_gateway`, `cache`, `queue`, `logging`, `deployment_config`. A node of any other type with no feature backing it is an unexplained gap and blocks lock.

This allowlist lives in code as a constant (not configurable via UI in this version) — add a type to it only if a real infra category keeps getting falsely flagged.

These gaps get surfaced to the AI review step as known problem areas (pass them in the step-2 prompt input alongside the consolidated summary), and are also shown to the user directly regardless of what the AI concludes — this check must run and report even if the AI step fails downstream (fail-closed: a 500 in step 2 must not swallow step-1 findings).

---

## 5. Step 2 — AI Exception Handling & Security Review

### 5.1 Pattern (reuse, don't reinvent)

Same dual-independent-draft pattern as V3/V4/V5.0:

- Gemini and Groq each receive the **same** input (consolidated summary + `cross_reference_gaps` + full feature list with `business_rules`/`data_touched`/`acceptance_criteria` + structure + diagram definitions) and run **independently** — neither sees the other's output.
- Each produces its own `exception_handling`, `security_considerations`, and `mandatory_directives` list.
- **Diff/merge — concrete algorithm (resolved; this was vague in the first draft):** two findings (one from each draft) are treated as "the same finding" and merged if ALL of the following hold:
  1. Same `category` (`exception_handling` or `security`).
  2. Their `related_feature_ids`/`related_structure_node_ids` sets overlap by at least one id.
  3. Token-level Jaccard similarity between their `title` fields (lowercased, punctuation stripped, stopwords removed) is ≥ 0.5.

  This is pure Python — no AI call for matching. When matched: keep the entry with the longer non-null `reasoning`/`description`, union the `related_*_ids` from both, and if the two descriptions give meaningfully different or opposing guidance, set `conflict: true` on the merged entry so the fix-pass addresses it explicitly. When not matched: keep both as separate entries — over-reporting a possible security/exception gap is acceptable, silently dropping one because it "might be a duplicate" is not.

  `mandatory_directives` are merged the same way, using `source_ref_id` as the overlap key (not `related_*_ids`) plus the same title-similarity threshold.
- Fix-pass receives **only** the entries flagged by validation (§6) or marked `conflict: true` — not the full merged candidate. Include, as minimal supporting context, just the specific feature/structure/diagram data referenced by that entry's `related_*_ids`/`source_ref_id`. This mirrors the V3.9 fix-pass pattern and keeps the call small and fast (relevant given the V5.0 timeout lesson — smaller payload, faster round trip).
- Groq re-validates: the fixed entries individually, **plus** a fresh `non_duplicate` pass across the *entire* updated list (a fixed entry can newly collide with something that was already fine).
- Apply the exact same "EXPECTED (TRACKED SUBSTITUTION)" labeling rule if the Gemini slot is still routed to Groq llama-3.3-70b-versatile at test time — never silently report independence as PASS when both slots are the same provider.

### 5.2 `exception_handling` / `security_considerations` object shape

```json
{
  "id": "...",
  "category": "exception_handling" | "security",
  "title": "...",
  "description": "...",
  "related_feature_ids": ["..."],
  "related_structure_node_ids": ["..."],
  "severity": "critical" | "high" | "medium" | "low",
  "provenance": "ai_inferred" | "derived_from_business_rule" | "derived_from_nfr",
  "reasoning": "...",   // MANDATORY non-null when provenance = ai_inferred, same rule as V3.9 features
  "conflict": false     // set true by the merge step (§5.1) when two independently-drafted findings disagree
}
```

Nothing here is optional decoration — if `provenance = ai_inferred` and `reasoning` is null, that record fails quality validation (see §6) and must be dropped or sent to the fix-pass, not persisted as-is.

**Severity → lock-gating, now explicit (resolved; the first draft of this spec collected `severity` but never used it):**

- `critical` — **hard blocker.** `status` may not move to `locked` while any `exception_handling`/`security_considerations` entry with `severity = critical` remains unresolved. "Resolved" means a user comment thread on that entry (via the existing `comments` table, `stage = "final"`) has been marked resolved through the existing comment-resolve action — do not build a second dismiss mechanism.
- `high` — shown with a prominent visual flag in whatever UI renders this, but does not block lock.
- `medium` / `low` — informational, no gating.

### 5.3 `mandatory_directives` object shape

```json
{
  "id": "...",
  "directive": "...",          // short, imperative, single rule — e.g. "All payment amount fields must be stored as integer cents, never floats."
  "source": "feature_business_rule" | "security_review" | "exception_handling_finding" | "user_nfr" | "user_clarifying_answer",
  "source_ref_id": "...",       // the specific feature_id / exception_handling id / clarifying_question id this traces to
  "non_negotiable": true
}
```

A directive with no `source_ref_id` is invalid and must be rejected before persistence — this is the anti-fabrication control for this stage, equivalent to V3.9's `reasoning` requirement. The whole point of "mandatory directives" is that a coding agent downstream treats them as law; if Claude/Antigravity/V7's MCP handoff can't trace a directive back to something the project actually said, it doesn't get to be mandatory.

**Resolving a known integration gap:** for `source = "user_nfr"` or `source = "user_clarifying_answer"`, `source_ref_id` must be a real primary key from the existing NFR-capture / `clarifying_questions` tables (V3.4/V3.5, V3.3). Before building this, confirm those tables actually expose stable row ids readable at this stage of the pipeline. If they don't (e.g. an NFR answer is stored inline on another row with no independent id), that is a real blocker to report back — do not invent a synthetic id or silently fall back to `provenance = ai_inferred` to route around it.

---

## 6. Quality validation (`quality_flags`)

Before `status` can move from `draft` → `under_review`, validate every entry in `exception_handling`, `security_considerations`, and `mandatory_directives` against:

- `traceable` — has a non-empty `related_feature_ids`/`related_structure_node_ids` (for findings) or `source_ref_id` (for directives).
- `non_duplicate` — **concrete rule (resolved; was vague in the first draft):** normalize the entry's `title`/`directive` text (lowercase, strip punctuation, collapse whitespace) and compute token-level Jaccard similarity against every other entry in the *same list* (`exception_handling`, `security_considerations`, and `mandatory_directives` checked separately — never cross-list). Similarity ≥ 0.8 → the later entry is a duplicate; drop it, do not persist both.
- `reasoned` — `reasoning` present and non-null whenever `provenance = ai_inferred`.
- `actionable` — **concrete rule (resolved; was vague in the first draft):** fails if either (a) the normalized `directive`/`description` is under 6 words, or (b) it exact/near-matches (Jaccard ≥ 0.8) an entry in a fixed generic-phrase blocklist maintained in code, e.g. "be secure", "follow best practices", "handle errors properly", "ensure data is safe", "validate all inputs" (grow this list from real false-fails found during testing — do not treat it as exhaustive on day one).

Both `non_duplicate` and `actionable` must ship with real unit tests (not just live-test evidence) proving the Jaccard/word-count logic behaves correctly on at least: an exact duplicate, a near-duplicate paraphrase, two genuinely distinct entries, a blocklisted generic phrase, and a valid specific directive. "I ran it against real data and it looked right" is not sufficient for these two checks — they are pure functions and must be unit-tested like any other pure function.

Record `failed_checks` in the same `{check, reason, fields_involved, survived_fix_pass}` shape V3.9/Fix-2 already established. Do not invent a new failure-reporting shape for this stage.

Fail-closed rule: if the AI review step fails entirely (both providers error, or validation can't run), `status` stays `draft` and the endpoint returns an explicit error — never silently mark `under_review` with empty arrays.

---

## 7. Lock / re-open flow

- User reviews the consolidated plan + review findings + directives via comments (`stage = "final"`, same batch-fix flow as other stages).
- **Lock is blocked (409, fail-closed) while any of these are true** (consolidating the blocking rules defined above into one place):
  - Any `feature_not_in_structure` gap is open (§4).
  - Any `structure_node_no_feature` gap is open for a non-allowlisted node type (§4).
  - Any `exception_handling`/`security_considerations` entry has `severity = critical` and is not yet marked resolved via the comment system (§5.2).
- Lock/reopen is a **project-owner-only** action, using the same ownership check already enforced everywhere (`get_owned_project()`). This version has no collaborator/multi-user permission model — that is explicitly out of scope, not an oversight.
- Once satisfied, user explicitly locks: `status` → `locked`, `locked_at`/`locked_by` set.
- **Locking is a hard gate for V7.** The MCP handoff (future) may only read a `final_plans` row where `status = 'locked'`.
- Re-open: explicit action only, requires a reason string (stored, not optional), sets `status` back to `draft`, and is logged in whatever audit/event table this project already uses for admin actions (`generation_events` or equivalent) — do not add a parallel audit mechanism.
- No silent re-lock. Every lock/unlock is a deliberate, attributable action.

---

## 8. Endpoints (decoupled — apply the V5.0 timeout lesson up front, don't rediscover it)

Given this involves two-provider drafting + diff/merge + fix-pass + re-validation — the exact shape that caused V5.0's 504 — **design this as two endpoints from day one**, not one monolithic call:

- `POST /final-plan/generate` — runs step 1 (consolidation) + step 2 draft phase only (both provider calls via `asyncio.gather`, diff/merge). Returns `draft` state with both raw drafts and the merged candidate. No fix-pass yet.
- `POST /final-plan/validate` — runs quality validation (§6) against the merged candidate; if `failed_checks` non-empty, runs the Gemini fix-pass, then Groq re-validates; persists final `quality_flags`; sets `status = under_review` on success.
- `POST /final-plan/lock` / `POST /final-plan/reopen` — the §7 flow.
- `GET /final-plan/{project_id}` — read current state.

Do not build this as one endpoint and decouple it later after a timeout failure. The V5.0 postmortem already proved the platform's 30s ceiling; design around it now.

---

## 9. Rollback

If this needs rolling back after merge: `git revert` the merge commit (never `git branch -D` — Antigravity has produced this exact wrong rollback instruction before; call it out explicitly in the prompt file). Migration rollback: drop `final_plans` table only if zero rows exist in production; otherwise the migration is additive-only and stays.

---

## 10. Out of scope for V6.0

- MCP packaging/handoff itself — that's V7.
- Any new AI-drafted *content* (features/structure/diagrams) — V6 only reviews and consolidates what's already accepted.
- Versioned history of multiple final plans per project — single row per project for now; revisit only if the user asks for multi-version plan history later.
