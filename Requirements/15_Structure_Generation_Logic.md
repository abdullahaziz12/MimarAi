# Project Structure Generation — Full Implementation Logic
(Source: MimarAi Locked Interview & Generation Pipeline, Rev. 2, Section 5)

## Where This Fits
This is the next TOP-LEVEL version after V3 (the deepened interview pipeline) is complete. 
Per the roadmap, this is V4 — Structure Generation. It begins only after the feature list 
produced by V3's full generation is finalized and explicitly accepted by the user.

## CRITICAL PREREQUISITE — Must Be Confirmed Before Building
Per the Locked Plan (Section 5.1): "Feature list is generated and finalized first (through 
the full comment/reject cycle)... Only once the user has accepted the feature list does 
structure generation begin."

**This project does not yet have a confirmed, explicit "Accept Feature List" action.** 
Comments, feature-rejection, and dependency-ordering are built, but no endpoint/flag has 
been confirmed that marks a project's feature list as user-accepted and locked.

Before any Structure Generation code is written, Antigravity must:
1. Search the actual codebase for anything resembling an accept/lock action on the feature 
   list (e.g. a status transition, an "accept_plan" endpoint, a frontend "Accept Plan" 
   button already wired to something).
2. Report honestly whether this exists. If it does, describe it exactly (endpoint, status 
   values, what "accepted" looks like in the data).
3. If it does NOT exist, this session must first add a minimal accept-feature-list action: 
   a `POST /api/projects/{project_id}/accept-features` endpoint that transitions 
   `projects.status` to a new value (e.g. `"features_accepted"`), locks `generation_state. 
   features` from further AI-driven changes (comments can still be made, but a new full 
   regeneration should not silently overwrite an accepted feature list), and is the 
   explicit gate that Structure Generation checks before running. This is a prerequisite 
   for everything else in this spec — do not skip it or assume a workaround.

## Sequencing (Section 5.1)
- Feature list must already be through the full comment/reject cycle and explicitly 
  accepted (per the prerequisite above) before this stage begins.
- Structure Generation is never triggered automatically alongside feature generation — it 
  is its own, later, user-initiated or accept-triggered stage.
- Because structure is always built against an already-finalized feature set, there is no 
  risk of structure and features going out of sync from later comments/rejections on 
  features (since features are locked by this point).

## Generation Method — Dual-Independent-Draft Pattern (Section 5.2)
Same pattern as feature generation:
- Model A ("Gemini" slot — currently substituted with the temporary Groq llama-versatile 
  stand-in per the existing open item; use whichever model is currently configured in that 
  role, consistent with the rest of the pipeline) drafts a proposed project file/folder 
  structure and maps each feature to the file(s) that implement it.
- Model B (Groq) independently drafts its own structure proposal from the same finalized 
  feature list, without seeing the other draft.
- The two structures are diffed — conflicting file/feature assignments are surfaced for 
  review, but the final call stays with Model A's draft (Model B remains checker/ 
  second-opinion, not decision-maker) — same asymmetric role as feature generation's Step 
  1-2.

**Important note on the current Gemini substitution:** since Gemini is currently 
temporarily replaced by Groq's llama-versatile model in the feature-generation pipeline, 
Structure Generation's "two independent drafts" will currently also both effectively be 
Groq — this inherits the same known limitation already tracked as an open item. Do not 
treat this as a new bug specific to Structure Generation; it's the same pre-existing, 
tracked substitution.

## Groq's Validation Checks — Structure-Specific (Section 5.3)
- **Convention-adherence**: does the structure follow the standard pattern for the chosen 
  tech stack (e.g. FastAPI's typical `routes/`, `models/`, `schemas/` layout) rather than 
  an arbitrary layout? This check needs the project's `fixed_inputs.stack` value as context.
- **Completeness**: is every accepted feature mapped to at least one file? No orphan 
  features left unassigned.
- **No conflicting assignments**: no two features forced into contradictory or 
  incompatible file responsibilities.

This validation reuses the same propose→validate→fix pattern already built for features — 
one fix pass by Model A if Groq flags an issue, then one final Groq re-validation, capped 
exactly like the existing feature-generation cycle. Do not build a new, different-shaped 
validation loop.

## User Review (Section 5.4)
- The generated structure is shown as its own, separate review step — distinct from the 
  feature review screen.
- Reuses the EXISTING comment mechanism already built for features (the `comments` table 
  already supports an arbitrary `stage` field — use `stage: "structure"` for these 
  comments; no new comment infrastructure needed).
- No "Reject" option for structure (consistent with the pattern established later for 
  AI-generated schema content) — only Comment/Adjust. State this explicitly if 
  implementing structure's comment UI, since features allow Reject but structure does not.

## Merge & Output Format (Section 5.5)
Once accepted, the structure merges into the implementation plan as a distinct section, 
stored as a machine-readable JSON tree mapping file paths to the feature(s) they implement:

```json
{
  "structure": {
    "src/routes/loan.py": ["Loan & Interest Management"],
    "src/models/loan.py": ["Loan & Interest Management"],
    "src/routes/auth.py": ["Role-Based Access Control"],
    "src/models/audit_log.py": ["Audit Logging"]
  }
}
```

This JSON format exists specifically so a future drift-check/verification system (a later 
version, not part of this session) can parse it to know which files to expect for which 
features. The user-facing view can render this as a readable folder/file tree, but the JSON 
is the underlying stored data.

## After Structure Acceptance (Section 5.6)
Once accepted, the plan moves on to Diagram Generation (a later version, not part of this 
session) — this session's scope ends at structure acceptance and merge into the plan.

## Data Model
New jsonb column on `projects`: `structure_state`

```json
{
  "attempts": [
    {
      "model_a_draft": { "structure": {...} },
      "model_b_draft": { "structure": {...} },
      "diff_conflicts": [...],
      "validation_result": {...},
      "created_at": "ISO timestamp"
    }
  ],
  "accepted_structure": { "structure": {...} } | null,
  "status": "draft" | "accepted"
}
```

## Backend Endpoints
- `POST /api/projects/{project_id}/structure/generate` — runs the dual-draft + diff + 
  validate + fix cycle, requires `projects.status == "features_accepted"` (or whatever the 
  prerequisite gate's actual value turns out to be), auth + ownership check per the 
  established pattern.
- `POST /api/projects/{project_id}/structure/accept` — locks in the current draft as 
  `accepted_structure`, merges into the plan.
- `GET /api/projects/{project_id}/structure` — fetch current draft/accepted state.
- Comments on structure reuse the EXISTING `POST/GET /api/projects/{project_id}/comments` 
  endpoints with `stage: "structure"` — no new comment endpoints.

## Explicitly Not In Scope Here
- Diagram Generation (Section 6 of the Locked Plan) — separate, later session.
- Any change to the feature-generation pipeline itself.
- The drift-check/verification system that will eventually parse this JSON — that's a 
  future version.

## Rollback Note
This is fully additive — a new column, new endpoints, and reuse of the existing comment 
system. If reverted, no existing feature-generation or interview-pipeline behavior is 
affected.

## Manual Steps Required
New Supabase migration needed for the `structure_state` jsonb column (and, if the 
prerequisite accept-feature-list action requires a new status value or column, that too). 
Antigravity must provide exact SQL for manual execution — do not run it yourself.
