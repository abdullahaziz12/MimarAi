# Draft System Root Cause & Bug Investigation Report

**Document Name:** `Draft_Bugs.md`  
**Location:** `Requirements/Draft_Bugs.md`  
**Target Logic:** *Where the user left off, the draft must resume from that exact point with all previous conversation context, locked specifications, and pipeline artifacts intact.*

---

## Executive Summary

An end-to-end investigation was conducted across the frontend state machine ([`frontend/src/store/mimarStore.js`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js)), wizard screens ([`InterviewScreen.jsx`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/InterviewScreen.jsx), [`StructureScreen.jsx`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/StructureScreen.jsx), [`DiagramScreen.jsx`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/DiagramScreen.jsx)), and backend API handlers ([`backend/main.py`](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py)).

The investigation identified two primary symptom clusters:
1. **Interview Stage Regression:** Users who complete clarifying questions (and advance to personas, NFRs, or ready/fixed inputs) return to find the draft starting back at the clarifying questions with blank inputs and wiped chat context.
2. **Post-Structure / Diagram Stage Regression:** Users who accept the plan and structure, and enter the AI diagram stage (or later), return to find the draft reverting back to Step 03 (`structure`) instead of Step 04 (`diagram`), Step 05 (`render`), Step 06 (`final`), or Step 07 (`mcp`).

---

## Part 1: Why Drafts in the Interview Stage Restart From Clarifying Questions

### Bug 1.1: `loadProjectState()` ignores `step0_state.clarifying_completed` and checks question strings naively
* **Files:** 
  * [`frontend/src/store/mimarStore.js` (Lines 1345–1360, 1408–1420)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1345-L1360)
  * [`backend/main.py` (Line 2101, Line 2183)](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L2101)
* **Code Proof:**
  ```javascript
  // mimarStore.js (Lines 1346–1360)
  let allCqAnswered = clarifying_list.length > 0;
  for (const cq of clarifying_list) {
    if (cq.answer && cq.answer.trim()) {
      cqAnswers[cq.id] = cq.answer;
    } else {
      allCqAnswered = false; // <-- Evaluates to false if any question has empty answer
    }
  }

  let clarifyingStatus = "idle";
  if (density_flags.clarifying_questions === "skip") {
    clarifyingStatus = "skipped";
  } else if (clarifying_list.length > 0) {
    clarifyingStatus = allCqAnswered ? "completed" : "ready";
  }
  ```
  Then in Lines 1408–1411:
  ```javascript
  } else if (step0_state.last_label === "READY") {
    if (clarifyingStatus === "ready") {
      step0Status = "clarifying"; // <-- FORCES state back to clarifying questions!
    } else if (personaStatus === "idle" && density_flags.personas !== "skip") {
  ```
* **Root Cause & Mechanism:**
  1. When answers are submitted, the backend records [`step0_state["clarifying_completed"] = True`](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L2183) in the database. `loadProjectState` **completely ignores this field**.
  2. In [`backend/main.py` Line 2101](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L2101), generating clarifying questions performs raw `insert` calls into `clarifying_questions` without clearing previous records for that project.
  3. If any orphaned, retried, or duplicate questions exist with `answer = None`, `allCqAnswered` evaluates to `false`.
  4. This sets `clarifyingStatus = "ready"`. Because `clarifyingStatus === "ready"` is evaluated first under `step0_state.last_label === "READY"`, `step0Status` is overridden to `"clarifying"`, resetting downstream progress (Personas, NFRs, Fixed Inputs).

---

### Bug 1.2: Overly broad render condition in `InterviewScreen.jsx`
* **File:** [`frontend/src/components/screens/InterviewScreen.jsx` (Lines 862–871)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/InterviewScreen.jsx#L862-L871)
* **Code Proof:**
  ```jsx
  {/* V3.3: Clarifying Questions Stage */}
  {(step0Status === "clarifying" ||
    (clarifyingQuestions &&
      clarifyingQuestions.length > 0 &&
      !["ready", "persona_capture", "nfr_capture"].includes(step0Status))) && (
    <ClarifyingQuestionsStage
      questions={clarifyingQuestions}
      onSubmit={handleClarifyingSubmit}
      isSubmitting={isSubmittingClarifications || operationRunning}
      isCompleted={["ready", "persona_capture", "nfr_capture"].includes(step0Status)}
    />
  )}
  ```
* **Root Cause & Mechanism:**
  * If `step0_state.last_label` is `null` (default when a draft is created via `POST /api/projects/draft`), `step0Status` remains `"idle"`.
  * Because `"idle"` is not in `["ready", "persona_capture", "nfr_capture"]`, this condition triggers whenever `clarifyingQuestions.length > 0`.
  * At the same time, `isCompleted` evaluates to `false`, displaying the questions as an active, uncompleted form even when previously finished.

---

### Bug 1.3: `ClarifyingQuestionsStage.jsx` does not prefill existing answers
* **File:** [`frontend/src/components/ClarifyingQuestionsStage.jsx` (Line 11)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/ClarifyingQuestionsStage.jsx#L11)
* **Code Proof:**
  ```javascript
  export default function ClarifyingQuestionsStage({ questions = [], ... }) {
    const [answers, setAnswers] = useState({}); // <-- Initialized with empty object
  ```
* **Root Cause & Mechanism:**
  * Even when `loadProjectState` successfully retrieves answered questions from the DB (`cq.answer`), `ClarifyingQuestionsStage` starts with `{}`.
  * The textareas read `value={answers[q.id] || ""}` and render blank textareas.

---

### Bug 1.4: Matching drafts re-triggers classification and overwrites `step0_state`
* **Files:**
  * [`frontend/src/store/mimarStore.js` (Lines 501–513, Line 568)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L501-L513)
  * [`backend/main.py` (Line 798)](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L798)
* **Code Proof:**
  ```javascript
  // mimarStore.js (classifyIdeaStep0)
  const matchingDraft = userDrafts.find((d) => ...);
  if (matchingDraft?.id) {
    currentProjectId = matchingDraft.id;
    set({ projectId: currentProjectId });
  }
  // Then immediately posts to /api/interview/classify
  ```
* **Root Cause & Mechanism:**
  * When a user returns and re-enters idea text matching an existing draft, `classifyIdeaStep0` locates the draft ID but immediately posts to `/api/interview/classify`.
  * [`_update_project_step0_state`](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L798) overwrites `step0_state` in the database with a fresh state, wiping out previously resolved contradictions, clarifying QA, personas, and NFRs.
  * In [`InterviewScreen.jsx` (Line 430)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/InterviewScreen.jsx#L430), the `READY` label re-executes `runContradictionScan()` -> `proceedAfterContradiction()` -> `fetchClarifyingQuestions()`, starting the interview from scratch.

---

### Bug 1.5: Complete loss of conversation context / transcript on draft resume
* **File:** [`frontend/src/store/mimarStore.js` (Lines 1426–1447)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1426-L1447)
* **Code Proof:**
  ```javascript
  // Build intelligent transcript messages
  const msgs = [
    {
      id: "init-ai-1",
      role: "ai",
      text: "Tell me about the software you want to build...",
    },
  ];
  if (project.idea_text && project.idea_text.trim()) {
    msgs.push({
      id: "user-idea-" + Date.now(),
      role: "user",
      text: project.idea_text.trim(),
    });
    if (step0Status === "ready") {
      msgs.push({
        id: "ai-ready-" + Date.now(),
        role: "ai",
        text: "Great! Your project idea looks clear and ready...",
      });
    }
  }
  ```
* **Root Cause & Mechanism:**
  * `loadProjectState` resets `messages` to a static 2-message template.
  * Prior messages (contradiction alerts, user resolutions, clarifying questions, persona prompts, NFR choices) are neither saved to `projects` nor reconstructed upon resume.

---

## Part 2: Why Drafts in the AI Diagram (or Later) Stage Restart From Project Structure

### Bug 2.1: `loadProjectState()` has a hardcoded screen ceiling of `"diagram"` and falls back to `"structure"`
* **File:** [`frontend/src/store/mimarStore.js` (Lines 1381–1407)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1381-L1407)
* **Code Proof:**
  ```javascript
  // Extract structure state
  const struct_state = project.structure_state || {};
  const structData = struct_state.accepted_structure?.structure || struct_state.candidate_structure?.structure || null;
  const isStructureAccepted = project.status === "structure_accepted" || struct_state.status === "accepted";
  const isPlanAccepted = project.status === "features_accepted" || isStructureAccepted || Boolean(gen_state?.features_locked);

  // Determine step0Status & active screen
  let step0Status = "idle";
  let currentScreen = "interview";
  let interviewDone = false;
  let planGenerated = false;

  if (isStructureAccepted) {
    step0Status = "ready";
    interviewDone = true;
    planGenerated = true;
    currentScreen = "diagram";  // <-- Highest screen this can EVER resume to
  } else if (isPlanAccepted) {
    step0Status = "ready";
    interviewDone = true;
    planGenerated = true;
    currentScreen = "structure"; // <-- Falls back here whenever isStructureAccepted is false
  } else if (gen_state && Array.isArray(gen_state.features) && gen_state.features.length > 0) {
    step0Status = "ready";
    interviewDone = true;
    planGenerated = true;
    currentScreen = "plan";
  }
  ```
* **Root Cause & Mechanism:**
  * The logic completely lacks branches for `currentScreen = "render"`, `"final"`, or `"mcp"`.
  * Even if a user reaches Step 05 (`render`), Step 06 (`final`), or Step 07 (`mcp`), `loadProjectState` can never resume them to those screens.
  * If `isStructureAccepted` evaluates to `false`, it falls directly into `else if (isPlanAccepted)`. Because `gen_state.features_locked` was set to `true` during `acceptPlan`, `isPlanAccepted` is always `true`. Consequently, `currentScreen` defaults to `"structure"`.

---

### Bug 2.2: `acceptStructure()` in the frontend silently ignores HTTP failure
* **Files:**
  * [`frontend/src/store/mimarStore.js` (Lines 1987–2010)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1987-L2010)
  * [`frontend/src/components/screens/StructureScreen.jsx` (Lines 68–79)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/StructureScreen.jsx#L68-L79)
  * [`backend/main.py` (Lines 4135–4148)](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L4135-L4148)
* **Code Proof:**
  ```javascript
  // mimarStore.js (acceptStructure)
  if (backendUrl && s.projectId) {
    try {
      const authHeaders = { ... };
      await fetch(`${backendUrl}/api/projects/${s.projectId}/structure/accept`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          structure: s.structureData || {},
        }),
      }); // <-- Does NOT verify res.ok! HTTP 400 or 401 is silently ignored!
    } catch (err) {
      console.warn("Structure accept backend sync warning:", err);
    }
  }

  await sleep(400);
  set({ structureAccepted: true, operationRunning: false });
  s.showScreen("diagram"); // <-- Advances UI to diagram regardless of backend failure!
  ```
  Backend handler requirement ([`backend/main.py` Lines 4135–4139](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L4135-L4139)):
  ```python
  if not chosen_structure:
      raise HTTPException(
          status_code=400,
          detail="Cannot accept structure: no generated structure candidate found."
      )
  ```
* **Root Cause & Mechanism:**
  1. [`StructureScreen.jsx`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/StructureScreen.jsx#L68-L79) displays a hardcoded fallback file tree when `structureData` is `null`. The user sees a structure tree and clicks "Accept Structure →".
  2. If `structureData` in Zustand is `null` (or generation had not completed), `acceptStructure` posts `{ structure: {} }`.
  3. The backend returns `HTTP 400 Bad Request`.
  4. `fetch` does not throw on 400, so the frontend ignores the error, updates local state `structureAccepted: true`, and transitions the screen to `"diagram"`.
  5. In PostgreSQL, the project's status remains `"features_accepted"` and `structure_state.status` remains `"draft"`.
  6. When the user reloads the draft, `isStructureAccepted` evaluates to `false` in `loadProjectState`, and the application falls back to `"structure"`.

---

### Bug 2.3: Status divergence after diagram acceptance
* **Files:**
  * [`backend/main.py` (Line 5080, Line 5419)](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L5080)
  * [`frontend/src/store/mimarStore.js` (Line 1384)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1384)
* **Code Proof:**
  * When the diagram is accepted on the backend:
    ```python
    # main.py line 5419
    client.table("projects").update({
        "diagram_state": diag_state,
        "status": "diagram_accepted"
    }).eq("id", project_id).execute()
    ```
  * But `loadProjectState` checks:
    ```javascript
    // mimarStore.js line 1384
    const isStructureAccepted = project.status === "structure_accepted" || struct_state.status === "accepted";
    ```
* **Root Cause & Mechanism:**
  * Once `status` becomes `"diagram_accepted"`, `project.status === "structure_accepted"` evaluates to `false`.
  * The backend's own prerequisite gate ([`main.py` Line 5080](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L5080)) checks:
    `project.get("status") in ("structure_accepted", "diagram_accepted") or struct_state.get("status") == "accepted" or bool(struct_state.get("accepted_structure"))`.
  * Frontend `loadProjectState` does not check `"diagram_accepted"` or `bool(struct_state.accepted_structure)`. If `struct_state.status` is not explicitly `"accepted"`, `isStructureAccepted` evaluates to `false`, reverting to `"structure"`.

---

### Bug 2.4: Diagram and Final Plan artifacts are completely wiped upon load
* **File:** [`frontend/src/store/mimarStore.js` (Lines 1450–1490)](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1450-L1490)
* **Code Proof:**
  In `loadProjectState`, the store is rehydrated with `...initialMimarState`, but the following fields are omitted from hydration:
  * `diagramData` (from `project.diagram_state?.candidate_draft` or `accepted_schema`)
  * `diagramJsonAccepted` (from `project.diagram_state?.status === "accepted"`)
  * `diagramJsonGenerated`
  * `diagramRendered`
  * `mermaidErd` & `mermaidArchitecture` (from `project.diagram_state`)
  * `finalPlanData` & `finalAccepted` (from `project.final_plan_state`)
* **Root Cause & Mechanism:**
  All diagram and final plan fields revert to initial defaults (`null` and `false`). When [`DiagramScreen.jsx`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/DiagramScreen.jsx) mounts, `diagramData` is `null`, forcing it to render fallback dummy tables (`users`, `loans`, `audit_logs`).

---

### Bug 2.5: Backend `GET /projects/drafts` filters exclusively by `status = 'draft'`
* **File:** [`backend/main.py` (Line 848)](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L848)
* **Code Proof:**
  ```python
  res = client.table("projects").select("*").eq("owner_id", user_id).eq("status", "draft").order("created_at", desc=True).execute()
  ```
* **Root Cause & Mechanism:**
  * As soon as a project advances to `features_accepted`, `structure_accepted`, or `diagram_accepted`, this query excludes it from the saved drafts list.
  * In the user's mental model, any uncompleted project is a "draft". Because this endpoint filters strictly for `status = 'draft'`, advanced projects either disappear from the Saved Drafts drawer or only appear if their backend status transition failed.

---

## Root Causes Summary Table

| Issue | File & Location | Root Cause |
| :--- | :--- | :--- |
| **Interview resets to clarifying questions** | [`mimarStore.js#L1345-L1360`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1345-L1360) | Calculates `allCqAnswered` by checking empty `answer` strings on raw rows; ignores `step0_state.clarifying_completed` and downstream persona/NFR progress. |
| **Clarifying form rendered prematurely** | [`InterviewScreen.jsx#L862-L871`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/screens/InterviewScreen.jsx#L862-L871) | Renders active `ClarifyingQuestionsStage` whenever `step0Status` is not `"ready"`, `"persona_capture"`, or `"nfr_capture"` (including `"idle"`). |
| **Clarifying answers appear empty** | [`ClarifyingQuestionsStage.jsx#L11`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/components/ClarifyingQuestionsStage.jsx#L11) | Initializes `useState({})` with an empty object instead of seeding from `q.answer` or store `clarifyingAnswers`. |
| **Matching idea wipes interview state** | [`mimarStore.js#L501-L513`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L501-L513), [`main.py#L798`](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L798) | Matched draft ID is sent through `/api/interview/classify`, overwriting `step0_state` in the database with a clean reset. |
| **Conversation context wiped** | [`mimarStore.js#L1426-L1447`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1426-L1447) | `loadProjectState` discards the conversation transcript and rebuilds only 2 static placeholder messages. |
| **Diagram/later stages revert to structure** | [`mimarStore.js#L1384-L1407`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1384-L1407) | Screen restoration logic has no checks for `render`, `final`, or `mcp`. If `isStructureAccepted` fails, it falls back to `structure` because `isPlanAccepted` is true. |
| **Structure accept silent sync failure** | [`mimarStore.js#L1987-L2003`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1987-L2003) | `acceptStructure` does not check `res.ok`. If backend returns 400 (e.g. empty candidate), the frontend advances to diagram while DB stays at `features_accepted`. |
| **Diagram state not restored from DB** | [`mimarStore.js#L1450-L1490`](file:///e:/Hospital%20Management%20System/MimarAi/frontend/src/store/mimarStore.js#L1450-L1490) | `loadProjectState` does not hydrate `diagramData`, `mermaidErd`, `mermaidArchitecture`, or diagram lock flags from `project.diagram_state`. |
| **Drafts list excludes advanced stages** | [`main.py#L848`](file:///e:/Hospital%20Management%20System/MimarAi/backend/main.py#L848) | `GET /projects/drafts` filters strictly by `.eq("status", "draft")`, hiding projects in `features_accepted`, `structure_accepted`, or `diagram_accepted`. |
