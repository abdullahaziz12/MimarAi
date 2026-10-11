# Draft Resume Integrity — Fix Logic

**Status:** Fix spec, written against Antigravity's own `Draft_Bugs.md` root-cause report (9 confirmed bugs across 2 symptom clusters). That report correctly found the *causes* — this document decides the *fix architecture* so Antigravity isn't left to invent 9 independent patches with 9 independent styles.

**Target behavior (unchanged from the original ask):** wherever a user left off, reopening a draft must resume at that exact point — same screen, same answered/unanswered state, same conversation history, same generated artifacts — with nothing silently reset.

---

## 0. Root architectural problem (common to both clusters)

Every one of the 9 bugs is a variant of the same mistake: **resume state is re-derived by inference from loosely-related signals** (raw row scans, a single top-level `project.status` enum, fetch calls that don't check `res.ok`) **instead of being read from one authoritative, explicitly-written source per stage.** Inference drifts; explicit state doesn't. The fix is not 9 unrelated patches — it's applying one rule consistently:

> **Every stage writes its own completion flag when it completes. `loadProjectState` only ever reads those flags. It never re-derives completion by scanning rows or chasing a single global enum.**

Everything below is this rule applied stage by stage.

---

## 1. Interview-stage fixes (Bugs 1.1–1.5)

### 1.1 — `clarifying_completed` becomes the single source of truth

- `loadProjectState` must stop computing `allCqAnswered` by scanning `clarifying_questions` rows for empty `answer` fields. That computation is deleted.
- `clarifyingStatus` is now:
  - `"skipped"` if `density_flags.clarifying_questions === "skip"`
  - `"completed"` if `step0_state.clarifying_completed === true` (server-authoritative, already written by the backend on submit — currently just ignored by the frontend)
  - `"ready"` if there is a current, unanswered batch (see below)
  - `"idle"` otherwise
- **Root-cause prevention, not just a symptom patch:** the backend's clarifying-question generation endpoint must stop doing a bare `insert` on every call. Before inserting a fresh batch for a project, it must delete (hard delete — there's no versioning/history requirement for this table) any existing unanswered rows for that project. This is what was producing the orphaned `answer = None` rows that broke the old naive scan in the first place; removing the orphan source is required even though the new logic no longer scans rows, because orphans would otherwise still corrupt any future feature that does.

### 1.2 — `InterviewScreen.jsx` render gate

- Replace the broad OR-fallback condition with a single, strict check: the active (editable) `ClarifyingQuestionsStage` renders **if and only if** `step0Status === "clarifying"`.
- Delete the fallback branch (`clarifyingQuestions.length > 0 && !["ready","persona_capture","nfr_capture"].includes(step0Status)`) entirely. It existed only to compensate for 1.1's unreliable status; once 1.1 is fixed, the fallback is not just redundant, it's actively dangerous (it's exactly what re-triggers the editable form whenever `step0Status` is anything the fallback didn't anticipate — e.g. the still-possible `"idle"`).
- If a read-only "completed questions" view is wanted for review, gate it separately and explicitly on `clarifyingStatus === "completed"` — never reuse the active-form component for both states.

### 1.3 — `ClarifyingQuestionsStage.jsx` must seed from existing answers

- Replace `useState({})` with a lazy initializer that seeds from `questions` prop: `useState(() => Object.fromEntries(questions.map(q => [q.id, q.answer || ""])))`.
- Since this component only mounts after `loadProjectState` has already populated `clarifyingQuestions` with each question's `answer` from the DB, a lazy initializer is sufficient — no extra `useEffect` round-trip needed, and it won't clobber mid-session user edits because it only runs once per mount.

### 1.4 — Matching an existing draft must not re-classify it

- In `classifyIdeaStep0`, once a `matchingDraft` is found, branch on its progress **before** deciding to call `/api/interview/classify`:
  - If the matched draft is genuinely untouched (`step0_state.last_label` is null/unset **and** `clarifying_completed` is falsy **and** no persona/NFR/gen_state progress exists), classify is still correct — it's a first run.
  - If the matched draft has **any** recorded progress (`last_label` set, `clarifying_completed`, persona/NFR capture done, `gen_state.features` present, or any accepted structure/diagram/final state), skip classify entirely and call `loadProjectState(matchingDraft.id)` instead, routing the user straight to their real resume point.
- This is the only change needed on the frontend; `_update_project_step0_state` on the backend does not need to change, because it will simply stop being called for in-progress drafts.

### 1.5 — Conversation transcript persistence

- Add `conversation_transcript` as a new key inside the existing `step0_state` JSONB column (no new table, no migration — `step0_state` already holds `density_flags`, `clarifying_completed`, etc., so this follows the established pattern).
- Each entry: `{ id, role: "ai" | "user", text, kind, created_at }`. `kind` identifies the event type (`idea_submitted`, `contradiction_prompt`, `contradiction_resolved`, `clarifying_question`, `clarifying_answer`, `persona_prompt`, `persona_capture`, `nfr_prompt`, `nfr_capture`, `ready`) so the frontend can style/order them without guessing from text content.
- Every backend interview-event handler that currently mutates `step0_state` (contradiction resolve, clarifying question generation, clarifying answer submit, persona capture, NFR capture, ready) must **append** the relevant entry/entries to `conversation_transcript` as part of that same write — never a separate write, to avoid partial-update races.
- Cap the array at the last 200 entries (drop oldest) to bound row size — this project's interviews are short, 200 is generous headroom, not a real limit in practice.
- `loadProjectState` rebuilds `messages` directly from `step0_state.conversation_transcript` when it's non-empty. The existing 2-message synthetic template becomes the fallback **only** for a transcript that is genuinely empty (a brand-new project where no interview event has happened yet).

---

## 2. Post-structure stage-resume fixes (Bugs 2.1–2.5)

### 2.1 / 2.3 — Replace the `project.status` string ladder with a per-stage substate ladder

The single biggest fix in this document. The existing code decides `currentScreen` by pattern-matching one top-level `project.status` string. That string has already been shown (Bug 2.3) to drift out of sync with the sub-state objects that are the real record of what happened at each stage — and this project has a documented history (RLS, backend URL) of single top-level flags silently going stale. The fix removes the single point of truth instead of patching around its drift a second time.

**New rule:** each stage's completion is read from **that stage's own sub-state object**, never from `project.status` matching a specific string. `project.status` can still be written for other consumers (analytics, the drafts list, etc.) but `loadProjectState` stops reading it for screen resume.

```
stageComplete.plan      = Boolean(gen_state?.features_locked) || Array.isArray(gen_state?.features) && gen_state.features.length > 0
stageComplete.structure = struct_state?.status === "accepted" || Boolean(struct_state?.accepted_structure)
stageComplete.diagram   = diagram_state?.status === "accepted" || Boolean(diagram_state?.accepted_schema)
stageComplete.render    = render_state?.status === "accepted"        // only if a distinct backend-tracked render-accept stage actually exists — see note below
stageComplete.final     = final_plan_state?.status === "locked"
stageComplete.mcp       = mcp_state?.status === "exported"           // only once V7 ships — see note below

SCREEN_ORDER = ["interview", "plan", "structure", "diagram", "render", "final", "mcp"]

currentScreen = first screen in SCREEN_ORDER whose stage is NOT complete
                (i.e. the next thing the user hasn't finished yet)
```

**Note — confirm before implementing:** this spec assumes `render` and `mcp` are distinct backend-tracked stages with their own sub-state objects, based on the screen names in the bug report (Step 05 `render`, Step 07 `mcp`). Antigravity must confirm the actual field/table names in the current codebase before wiring this in:
- If `render` has no separate backend acceptance step yet (i.e. it's purely a transient UI view of the already-accepted diagram, with no distinct persisted state), collapse it: treat `diagram` complete as sufficient to advance past `render` too, and drop `render` from the ladder until/unless a real backend-tracked render-accept stage is added.
- `mcp` is V7 territory, which per this project's own roadmap has a written spec (`19_V7_MCP_Handoff_Logic.md`) but has **not been implemented yet**. There is no `mcp_state` to read yet. Include `mcp` in the ladder for forward-compatibility (so this code doesn't need touching again when V7 ships) but it will simply never be reached until that backend work lands — `final` will correctly be the last real resumable screen until then.
- Report back the exact field names actually used, since this document is written from the bug report's evidence, not a direct read of the current file.

### 2.2 — Every `*Accept*` call must check `res.ok` before advancing

- `acceptStructure` (and this must be audited across **all** similarly-shaped accept calls in `mimarStore.js` — diagram accept, final-plan lock, any other `fetch(...).then(advance screen)` pattern — since Bug 2.2 is a systemic pattern, not a one-off typo, and it would be dishonest to fix only the one instance the report happened to catch).
- Fix pattern for each: check `res.ok` (or status explicitly) before setting the local `*Accepted` flag or calling `showScreen(...)`. On failure: surface a real error (toast/inline message) to the user, leave local state and current screen untouched, and do not retry silently.
- This directly prevents the specific failure chain in Bug 2.2 (empty `structureData` → 400 → frontend lies to itself → DB and UI permanently disagree) from recurring for any other stage.

### 2.4 — Full rehydration of diagram and final-plan artifacts

- `loadProjectState` must hydrate, from the already-fetched `project` row, everything the diagram/final screens need to render real data instead of falling back to dummy placeholders:
  - `diagramData` ← `project.diagram_state?.accepted_schema || project.diagram_state?.candidate_draft`
  - `diagramJsonAccepted` ← `project.diagram_state?.status === "accepted"`
  - `diagramJsonGenerated` ← `Boolean(project.diagram_state?.candidate_draft)`
  - `diagramRendered` ← `Boolean(project.diagram_state?.mermaid_erd || project.diagram_state?.mermaid_architecture)`
  - `mermaidErd` / `mermaidArchitecture` ← `project.diagram_state?.mermaid_erd` / `project.diagram_state?.mermaid_architecture`
  - `finalPlanData` ← `project.final_plan_state` (the full consolidated object, per `18_V6_Final_Plan_Consolidation_Logic.md`)
  - `finalAccepted` ← `project.final_plan_state?.status === "locked"`
- This mirrors exactly how `structureData`/`structureAccepted` are already (correctly) hydrated — same pattern, just extended to the two objects the original code stopped at.

### 2.5 — `GET /projects/drafts` must not filter to `status = 'draft'` only

- Drop the `.eq("status", "draft")` filter. Keep `.eq("owner_id", user_id)` and the existing ordering.
- Rationale: there is currently no terminal "archived/complete" status in this project (V7 export/MCP handoff — the only thing that could plausibly define "done" — isn't built yet), so filtering by a single status string can only ever hide legitimate in-progress work, never correctly exclude finished work. If/when V7 introduces a genuine terminal state, that specific state can be excluded by name at that point — not before.
- The frontend's Saved Drafts drawer should show each project's current stage/screen (derivable from the same substate objects as §2.1) as a progress badge, so "draft" in the UI continues to mean "anything not finished," matching the user's actual mental model, without the backend query lying about which rows exist.

---

## 3. Out of scope for this fix

- Any change to the V3–V6 generation/validation logic itself — this document only touches resume/state-restoration plumbing, not what gets generated.
- V7 MCP `mcp_state` wiring — noted above as forward-compatible but not implemented here; that's V7's own prompt (`00_Antigravity_Prompt_V7_MCPHandoff.md`).
- Any new top-level DB columns/migrations — everything here fits inside existing JSONB state columns (`step0_state`, `diagram_state`, `final_plan_state`, etc.) per the established pattern on this project.

## 4. Rollback

Standard project rule: `git revert <merge-commit>`. Never `git branch -D`.
