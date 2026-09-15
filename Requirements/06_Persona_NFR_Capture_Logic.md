# V3.4 + V3.5 — Persona Capture & NFR Capture: Full Implementation Logic

## Where This Fits
Both run after Clarifying Questions (V3.3) completes (or is skipped per density flags), 
before Fixed Inputs Collection. Still part of V3, not separate top-level versions. Built 
together in one session because both are project-requirements data sharing the same 
persistence/versioning decisions, per the original sequencing plan.

## Density Gating (from V3.2, already built)
- `density_flags.personas`: `"skip"` or `"ask"` — binary, no partial state.
- `density_flags.nfrs`: `"skip"` or `"ask"` — binary, no partial state.

If `"skip"`, that stage does not run at all for this project — proceed directly to the 
next stage (NFR if personas skipped, or Fixed Inputs if both skipped).

---

## V3.4 — Persona Capture

### Purpose
Capture who will actually use the system — the different user/actor types and what each 
one does — so this becomes structured data instead of something buried in free-form idea 
text, and so later generation can assign a concrete `actor_role` to every feature.

### Call Type
**No AI call for asking the question** — the question itself is always the same, fixed 
text, not AI-generated. This mirrors the original spec's design choice: "One direct, fixed 
question (not AI-generated, since the question itself is always the same)."

The fixed question: **"Who will use this — list the different types of people and what 
each one does."**

### Storage Approach
Store the user's answer as free text by default (the simpler default per the original 
spec). Do NOT build an AI-extraction step to parse it into structured persona objects in 
this session — that's an explicit future enhancement, not required now. The raw answer is 
what gets used downstream.

### Flow
1. If `density_flags.personas == "skip"`, this stage never fires — proceed directly to NFR 
   Capture (or Fixed Inputs if NFR is also skipped).
2. If `"ask"`, present the fixed question in the chat stream, consistent with the existing 
   message-bubble pattern.
3. User answers in free text.
4. Answer is persisted (see Data Model below) and folded into the same "effective idea 
   context" assembly mechanism already built for Contradiction Scan and Clarifying 
   Questions (the context-loss bug fix from the previous session) — so this answer 
   automatically flows into generation the same way those do, with no separate wiring 
   needed at generation time.
5. No round-cap loop needed — this is a single question, asked once, answered once.

### Failure Handling
There's no AI call to fail on the asking side. If persisting the answer fails (DB error), 
retry once; if it still fails, show a clear user-facing error and do not silently proceed 
as if the answer was saved when it wasn't.

---

## V3.5 — NFR Capture

### Purpose
Capture non-functional requirements — expected scale, data sensitivity, availability — as 
structured, low-ambiguity input, so generation can write realistic constraints and (later) 
Security/Exception Handling stages have real data to work from instead of guessing.

### Call Type
**No AI call at all.** Three structured dropdown selects, not free text — consistent with 
how Fixed Inputs already avoids free-text ambiguity for stack/database/deployment/apis.

### The Three Dropdowns
1. **Expected scale**: `"just_me"` | `"small_team"` | `"hundreds_of_users"` | 
   `"thousands_plus"`
2. **Data sensitivity**: `"none_public"` | `"personal"` (names, emails) | `"sensitive"` 
   (health, financial, location, children's data)
3. **Availability requirement**: `"best_effort"` | `"needs_to_be_reliable"` | 
   `"mission_critical"`

Use these exact value strings (or clearly documented equivalents) so downstream generation 
prompts can be written against a known, fixed vocabulary rather than freeform text.

### Flow
1. If `density_flags.nfrs == "skip"`, this stage never fires — proceed directly to Fixed 
   Inputs.
2. If `"ask"`, present all three dropdowns together as one simple form (not three separate 
   chat turns) — this is fast, low-effort input, not a conversation.
3. User selects one value per dropdown, submits.
4. All three values are persisted together (see Data Model) and folded into the effective 
   idea context the same way Persona Capture's answer is.

### Failure Handling
No AI call to fail. If persistence fails, retry once, then show a clear error — same 
pattern as Persona Capture.

---

## Data Model

New jsonb columns on `projects` (no new tables needed — consistent with how `fixed_inputs` 
and `step0_state` are already stored directly on the project row):

```json
"personas": {
  "answer": "free text describing user types and roles",
  "captured_at": "ISO timestamp"
}
```

```json
"nfrs": {
  "scale": "just_me" | "small_team" | "hundreds_of_users" | "thousands_plus",
  "data_sensitivity": "none_public" | "personal" | "sensitive",
  "availability": "best_effort" | "needs_to_be_reliable" | "mission_critical",
  "captured_at": "ISO timestamp"
}
```

## Backend Endpoints
`POST /api/projects/{project_id}/personas`
- Auth + ownership check (same pattern as every other endpoint).
- Request body: `{"answer": "string"}`
- Persists to `projects.personas`, returns confirmation.

`POST /api/projects/{project_id}/nfrs`
- Auth + ownership check.
- Request body: `{"scale": "...", "data_sensitivity": "...", "availability": "..."}`
- Validate all three values are from the fixed enum sets above — reject with a clear 400 
  error if an invalid value is sent, don't silently accept garbage.
- Persists to `projects.nfrs`, returns confirmation.

## Effective Idea Context Integration
**Critical: this must reuse the context-folding mechanism built in the previous session's 
bug fix, not duplicate it.** When `/generate` assembles its effective idea context, it must 
now also include, if present:
- Persona answer, phrased as: "User types: {persona answer text}"
- NFR selections, phrased as: "Non-functional requirements: expected scale is 
  {scale}, data sensitivity is {data_sensitivity}, availability requirement is 
  {availability}."

Locate the existing `assemble_effective_idea_context` (or equivalently named) helper from 
the context-loss fix and extend it — do not write a second, separate context-assembly 
function.

## Frontend Behavior
- Persona question renders as a chat message with a text input, consistent with existing 
  message-bubble pattern (same as Clarifying Questions).
- NFR renders as three dropdown selects in one form, consistent visually with 
  `FixedInputsCollection`'s existing select pattern (reuse the same component styling if 
  practical).
- Both stages respect density flags — invisible entirely when flagged `"skip"`.
- After both stages resolve (or are skipped), proceed to Fixed Inputs Collection exactly 
  as today.

## Explicitly Not In Scope Here
- Lightweight Confirm Draft (V3.8), Requirement Quality Standard (V3.9) — separate future 
  work.
- AI-based extraction/structuring of the persona free-text answer into a structured object 
  — explicitly deferred.
- Any change to the feature schema.
- Any change to Structure, Diagram, Final, or MCP screens.
- Admin Portal, interview-answer editing, or any reliability-batch item from the separate 
  roadmap additions — unrelated to this session.

## Rollback Note
Both stages are additive, gated entirely by density flags that, if reverted, simply stop 
being checked (no other stage depends on personas/nfrs firing). The one shared-code touch 
point is the `assemble_effective_idea_context` extension — reverting this branch's merge 
commit should cleanly restore that function to its pre-V3.4/V3.5 state, with Contradiction 
Scan and Clarifying Questions' context-folding continuing to work exactly as before.

## Manual Steps Required (flag explicitly in the final report)
This session requires a new Supabase migration (two new jsonb columns on `projects`). This 
must be run manually in the Supabase SQL Editor by the project owner after Antigravity 
provides the exact SQL — Antigravity must NOT assume it can run this migration itself 
against the live database, and must clearly output the exact SQL block needed.
