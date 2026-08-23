# MimarAi — V2: Step 0 + Interview Shell Roadmap

**Goal:** Wire real Step 0 classification (OFF_TOPIC / TOO_VAGUE / READY) into the existing Interview screen, add fixed-input collection, add the explicit start-trigger gate, and close every edge case identified during review — all before any real feature-generation AI call (that's V3). No pipeline screen past Interview is touched in this version.

**Depends on:** V0 (deployed shell) and V1 (auth — every interview now belongs to a real, logged-in, RLS-isolated user) complete.

---

## Phase 1 — Database: Projects Table Extension

- Extend the existing `projects` table (created in V0, owned via `owner_id` since V1) with: `status` (text, enum-like: `draft` | `generating` | `reviewing` | `accepted`, default `draft`), `title` (text, nullable), `idea_text` (text, nullable), `step0_state` (jsonb, nullable — holds round counter, last label, off-topic streak), `fixed_inputs` (jsonb, nullable — tech stack/database/deployment/APIs once selected)
- A project row is created **immediately when the interview starts** — the moment the first idea message is submitted, before Step 0 classification even resolves — with `status = 'draft'`, `owner_id = auth.uid()`, `title = null`
- This gives every downstream stage a stable `project_id` from the start, and lets a user resume an abandoned draft later rather than losing it on tab close
- Confirm RLS already covers this table correctly (per V1) — no new policy needed, just confirm the new columns are covered by the existing `owner_id = auth.uid()` policy

## Phase 2 — Backend: Step 0 Classification Endpoint

- New backend endpoint (e.g. `POST /api/interview/classify`), authenticated (requires valid Supabase JWT per V1's `/me` pattern), accepting the current idea text and the project's `id`
- **Regex/keyword pre-filter first**, before any Groq call: only matches messages that are *purely* short greeting/chit-chat (e.g. the entire trimmed message is under ~4 words and matches a small whitelist like `hi`, `hello`, `hey`, `test`, `thanks`, `ok`, or similarly minimal content with no domain-suggesting nouns). Bias toward under-catching — a false negative just costs one extra Groq call, a false positive wrongly blocks a real idea. Anything with more substance always goes to Groq.
- If the pre-filter doesn't resolve it, call Groq with a classification prompt returning exactly one label: `OFF_TOPIC`, `TOO_VAGUE`, or `READY` — plus, for `TOO_VAGUE`, which of the two sub-cases (no domain at all vs. named-but-unexplained) and any extracted product name
- Hard timeout on the Groq call (8 seconds) — see Phase 6 (Exception Handling) for failure behavior
- Persist the result into the project's `step0_state` jsonb (round counter, last label, off-topic streak) after every call
- Enforce a **per-user rate limit of 10 Step 0 classification calls per hour**, implemented as a simple DB counter row (`user_id`, `count`, `window_start`) — same free-tier-friendly pattern as MCP's rate limiting, not Redis. Return `429` with a clear message if exceeded.

## Phase 3 — Frontend: Wire Classification Into the Interview Screen

- On idea submit, call the new classification endpoint instead of jumping straight into the (still-simulated) generation pipeline
- Reuse the **existing composer lock/abort pattern** exactly — the same `operationRunning`/`AbortController` mechanism already used by `runIdeaPipeline` must also wrap the Step 0 call, not a separate new lock. Step 0 is step zero of the same pipeline, not a parallel system.
- Reuse the **existing Stop Generation button** to abort an in-flight classification call the same way it already aborts generation
- Reuse the **existing `sessionStorage` persistence pattern** — add the Step 0 round counter / off-topic streak / last label to the same saved `STATE` blob already persisted for everything else, so a reload mid-flow doesn't silently reset the round cap
- Enforce a **2,000 character max** on the idea textarea, client-side: disable submit past the limit, show a live character counter, reject-and-explain rather than silently truncate (truncation could cut off the part that actually explained the idea)

## Phase 4 — Behavior by Classification Label

- **`OFF_TOPIC`** → show a conversational reply inline in the chat stream; generation is never triggered; increment an off-topic streak counter
  - Cap at **3 consecutive `OFF_TOPIC` results**: on the 3rd, switch to the same example-prompt fallback used for `TOO_VAGUE` exhaustion (Phase 5) rather than looping indefinitely
- **`TOO_VAGUE`** → ask the personalized follow-up question for the correct sub-case:
  - No domain at all → "Tell me about your idea and any features you have in mind."
  - Named but unexplained → "What does {extracted name} do?" (using the actual extracted product name, not a generic prompt)
  - The user's revised answer is re-classified (counts toward the round cap below)
- **`READY`** → proceed to Phase 7 (Fixed Inputs)

## Phase 5 — Loop Cap & Example-Prompt Fallback (shared by TOO_VAGUE and OFF_TOPIC exhaustion)

- `TOO_VAGUE` re-classification is capped at **exactly 2 rounds**: round 1 asks the personalized follow-up, round 2 asks it once more if still vague
- After round 2 (or after 3 consecutive `OFF_TOPIC` results), stop re-asking and show **2-3 tappable example project descriptions** (e.g. "a banking app with role-based access," "a food delivery platform with live tracking") that the user can tap to use as a starting point or edit directly
- This is a **single shared fallback UI component** with two different trigger conditions (TOO_VAGUE round exhaustion, OFF_TOPIC streak exhaustion) — build one component, not two separate ones
- Guarantees the user is never stuck in a silent, unbounded loop

## Phase 6 — Exception Handling (all Step 0 failure modes)

Every failure mode below must be handled explicitly — do not let any of them silently pass through as if classification succeeded, and do not let infrastructure failure become a security/cost bypass (i.e. never fail open into treating an unclassified message as `READY`):

- **Groq call times out or errors** (network failure, API down, malformed response): fail closed — show an inline retry state ("Having trouble understanding that — try again"), attempt one automatic retry, then surface a manual "Retry" button if it fails a second time. Composer unlocks so the user isn't stuck.
- **Classification endpoint returns an unexpected/malformed label** (not one of the three valid values): treat as a classification failure, same retry path as above — never guess or default to `READY`.
- **Rate limit exceeded** (Phase 2's 10/hr cap): show a clear, specific message distinct from a generic error — e.g. "You've hit the hourly limit for idea submissions, try again in X minutes" — not a raw `429` or generic failure text.
- **Network drops entirely mid-request** (user's connection, not the backend): same retry path as a timeout; on reload, restore from `sessionStorage` (Phase 3) rather than losing the in-progress state.
- **Backend/database write failure when persisting `step0_state` or creating the initial `draft` project row**: the classification result itself should still be shown to the user (don't block the UX on a persistence failure), but log the failure server-side and ensure a retry-on-next-action doesn't lose the round counter permanently — if persistence genuinely fails repeatedly, surface a non-blocking "your progress may not be saved" notice rather than failing silently.
- **User abandons mid-flow (closes tab during a pending Groq call)**: no special handling needed beyond the existing persistence — on return, the last successfully persisted `step0_state` is what's restored; an in-flight-but-never-completed call is simply lost and the user re-submits, which is acceptable.
- **Malicious/oversized input bypassing the client-side 2,000-char limit** (e.g. a direct API call): enforce the same limit server-side in the classification endpoint, independent of the frontend check — reject with a clear `400` and message, never pass an unbounded string into the Groq prompt.

## Phase 7 — Fixed-Input Collection

- New UI step, shown only after `READY` is confirmed: tech stack, database, deployment target, APIs — as **structured selects/chips, not free text** (this exemption from Step 0 classification is intentional, per the locked pipeline doc's scope rule — structured selections are never classified)
- Persist selections into the project's `fixed_inputs` jsonb as they're made
- The downstream start-trigger prompt (Phase 8) does not render until **all fixed-input fields have a selected value** — treat this as a disabled/hidden state, not a validation error, since "incomplete" is a normal intermediate condition here, not a user mistake

## Phase 8 — Explicit Start Trigger

- Once fixed inputs are complete and Step 0 has confirmed `READY`, do **not** auto-fire generation — show "Ready to generate your implementation plan — tap to start." Only that tap begins Step 1 of the Generation Pipeline (still a `setTimeout` simulation in V2 — real generation is V3's job)
- **Edit-invalidation, extended one step earlier than originally specified**: any edit to the idea text after `READY` is confirmed invalidates the `READY` state itself, not just the trigger prompt — re-editing the idea box silently re-runs Step 0 classification on the new text before the trigger can re-arm. Any edit to a fixed input after the trigger prompt appears simply hides the prompt again until fixed inputs are complete once more.
- Update project `status` to `generating` only once this tap actually fires (still simulated downstream in V2)

## Phase 9 — Resume Draft Projects (small addition, needed to make Phase 1's early project-creation meaningful)

- On the landing page (or a minimal dashboard view if none exists yet), a logged-in user with one or more `draft`-status projects should see a way to resume them — even a simple "Continue draft: {idea text preview}" list is sufficient for V2, no need for a full project-management UI yet
- Selecting a draft restores its `step0_state` and `fixed_inputs` and drops the user back into the Interview screen at the correct point (mid-classification-loop, at fixed-inputs, or at the start-trigger, depending on what was saved)
- A user can have multiple `draft` projects simultaneously — no artificial single-draft-per-user constraint; RLS already isolates them per-owner

---

## V2 Exit Checklist

- [ ] Regex pre-filter correctly catches only pure greetings, never a real idea with substance
- [ ] Groq classification call wired in, returning OFF_TOPIC / TOO_VAGUE / READY correctly
- [ ] TOO_VAGUE correctly distinguishes both sub-cases and asks the right personalized follow-up, including using an extracted product name where applicable
- [ ] TOO_VAGUE capped at 2 rounds; OFF_TOPIC capped at 3 consecutive; both fall through to the same shared example-prompt fallback component
- [ ] Composer lock, Stop Generation abort, and sessionStorage persistence all correctly cover Step 0, reusing existing mechanisms rather than new ones
- [ ] 2,000-character idea limit enforced both client-side and server-side
- [ ] Per-user rate limit (10/hr) enforced server-side with a clear over-limit message
- [ ] Every failure mode in Phase 6 handled explicitly — none fail open into treating unclassified input as READY
- [ ] Fixed-input collection built as structured selects, exempt from Step 0 classification, persisted to `fixed_inputs`
- [ ] Start-trigger prompt only appears when all fixed inputs are complete and READY is confirmed
- [ ] Editing the idea after READY correctly invalidates READY and re-triggers classification; editing a fixed input after the trigger appears correctly re-hides it
- [ ] A `draft` project row is created at interview start, not retroactively at acceptance
- [ ] A logged-in user can see and resume their draft project(s) from outside the Interview screen
- [ ] No changes made to any screen past Interview (Plan, Structure, Diagram, Render, Final, MCP untouched)
- [ ] No real Gemini/Groq feature-generation call added — Step 1 of the Generation Pipeline remains simulated; only Step 0 classification is real

Once all of the above is checked off, V3 (real Gemini + Groq dual-draft feature generation, replacing the Step 1-6 simulation) is next.
