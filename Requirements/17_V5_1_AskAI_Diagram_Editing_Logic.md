# V5.1 — "Ask AI" Conversational Diagram Editing: Full Implementation Logic
(Source: MimarAi Locked Interview & Generation Pipeline, Rev. 2, Section 6.6)

## Where This Fits
Builds on top of V5.0 (Diagram Generation core), which must already be merged. This session 
adds the post-lock "Talk to AI" chat interface, scoped specifically to the diagram screen 
(schema and architecture only).

## Prerequisite
V5.0 must be merged and working — specifically, a project must have reached 
`diagram_state.status` with a draft (or accepted) schema/architecture to test against. 
Confirm this before starting.

## Scope (Section 6.6)
The diagram screen includes a "Talk to AI" option where the user describes a change in 
plain language, scoped to what's shown on that screen: schema and architecture ONLY. 
Exception Handling and Security are explicitly OUT OF SCOPE for this chat — any change to 
those happens later, through the ordinary comment mechanism in Final Review (V6, not yet 
built).

## Request Classification — Two Paths

Every user request to this chat is classified as one of:

### (a) Cosmetic change
Examples: renaming a table/column, changing a data type, adding/removing an index.
- Applied directly: Model A makes the fix, Model B does a lightweight check (NOT the full 
  4-way dual-draft cycle — this is a targeted, cheap edit-and-check, consistent with the 
  spec's framing of this as a lightweight pass).
- No confirmation needed from the user beyond the request itself.

### (b) Structural conflict
Examples: a change that affects a locked feature or the locked structure (e.g. removing a 
table that a feature's `data_touched` depends on, which would contradict what's recorded in 
Features/Structure).
- **Refused by default**, with a clear explanation of why (reference the specific locked 
  feature/structure item that conflicts).
- **Forced override path**: if the user insists, the system asks for explicit confirmation 
  ("this will also update your locked specification"). Only on that explicit confirmation 
  does the system proceed.

## Classification Mechanism
This classification requires one AI call (reuse the existing lightweight-call pattern, 
consistent with Contradiction Scan's cost tier) given: the user's request text, the current 
schema/architecture JSON, and — critically — the locked Features and Structure data, so the 
model can actually detect whether the requested change contradicts something already locked 
elsewhere in the plan. This is NOT a check that can be done with only the diagram's own 
data; it must cross-reference Features and Structure.

## Forced Override — Propagation Logic (the most complex part of this spec)
When the user confirms a forced override of a structural conflict:

1. The change is propagated UPSTREAM into the actual Features JSON and/or Structure JSON — 
   not just the diagram's own working copy. This means:
   - If a schema change removes a table that a feature's `data_touched` referenced, that 
     feature's `data_touched` array must be updated to remove the stale reference.
   - If the change affects what a feature's `description` or `business_rules` implies, that 
     feature's text must ALSO be updated to reflect the new reality — not left showing 
     stale, now-inconsistent text. (Per the spec's explicit example: if a table tied to 
     "Loan Management" is removed, that feature's description/constraint text must be 
     updated too, not just the backend data.)
2. A lightweight, TARGETED re-check runs after the propagation — not a full re-validation 
   of everything, just confirming the specific propagated change is internally consistent 
   wherever it landed.
3. The affected item(s) get a `"Manually Amended"` label — and this label must be VISIBLE 
   wherever the user reviews the plan: on the diagram (where the edit was made), AND on the 
   affected Feature's card in the Features section, AND in the Structure view if a file 
   mapping changed. This is NOT a diagram-only label — it must propagate visibly to every 
   section that was touched, so there's no contradictory information shown across different 
   parts of the plan.

### Explicit implementation requirement
This means this session must add a `manually_amended: true` (or similar) field capability 
to the FEATURE schema (from V3.9) and the STRUCTURE schema (from V4) — not just the diagram 
schema — since the propagation must reach and mark those objects too. Confirm with the 
project owner before assuming the exact field name/shape if V3.9's feature schema doesn't 
already have an obvious place for this kind of post-hoc amendment marker.

## Re-rendering
Whether the change was cosmetic or a confirmed forced override, the visual diagrams 
(Mermaid output) are re-rendered immediately to reflect the change. "Ask AI" edits update 
the WORKING JSON at this stage (`diagram_state`'s current draft), not the implementation 
plan file itself — the plan isn't touched until "Accept the Diagram" (already built in 
V5.0) is clicked.

## Data Model
Extend `diagram_state` (from V5.0) with a chat/edit history:
```json
"ask_ai_history": [
  {
    "request_text": "string",
    "classification": "cosmetic" | "structural_conflict",
    "refused": true | false,
    "forced_override_confirmed": true | false | null,
    "propagated_changes": [
      {"target": "feature" | "structure", "id": "...", "field": "...", "old_value": "...", "new_value": "..."}
    ],
    "created_at": "ISO timestamp"
  }
]
```

Add `manually_amended` flag support to:
- Feature objects (within `generation_state.features`, V3.9's schema).
- Structure entries (within `structure_state`, V4's schema) — at the file-mapping level if 
  that's where a change would land.

## Backend Endpoint
`POST /api/projects/{project_id}/diagram/ask-ai`
- Auth + ownership check per the established pattern.
- Request: `{"message": "string"}`
- Response: classification result; if cosmetic, the updated diagram JSON + new Mermaid 
  strings; if structural conflict and not yet confirmed, a refusal with explanation and a 
  `requires_confirmation: true` flag; if structural conflict WITH confirmation 
  (`{"message": "...", "confirm_override": true}` on a follow-up call), the propagated 
  result across diagram + features + structure, with `manually_amended` flags set.

## Frontend Behavior
- A chat-style input on the diagram screen, separate from the diagram's `stage="diagram"` 
  comment system (comments are for structured review feedback; this is a conversational 
  edit tool — do not conflate the two mechanisms).
- Cosmetic changes apply and re-render immediately.
- Structural conflicts show the refusal + explanation, with an explicit "override anyway" 
  confirmation action.
- After a confirmed override, the UI must show the "Manually Amended" label on the diagram 
  AND surface it (even just a visual indicator) if the user later navigates to the Features 
  or Structure screens for the affected item.

## Explicitly Not In Scope Here
- Final Review (V6) — where Exception Handling/Security get their own review surface via 
  the ordinary comment mechanism.
- Any new comment-system changes — the ask-AI chat is a separate mechanism from comments, 
  as stated above.
- Re-opening V3.9 or V4's core generation logic beyond adding the `manually_amended` field 
  capability.

## Rollback Note
This is the most invasive V5-series change because it writes into Features (V3.9) and 
Structure (V4) data, not just diagram data. If reverted, confirm whether any 
`manually_amended` flags already set on feature/structure records should be considered 
orphaned metadata (harmless, since nothing else currently reads that flag) versus needing 
cleanup — flag this for a decision rather than silently deciding either way.

## Manual Steps Required
No new columns needed if `manually_amended` is added as a new key within the existing 
jsonb structures (`generation_state`, `structure_state`, `diagram_state`) rather than a new 
column. Confirm this is sufficient; if a new column is genuinely needed, provide exact SQL 
for manual execution — do not run it yourself.
