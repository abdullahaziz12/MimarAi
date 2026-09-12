# MimarAI Backend Full Build Blueprint

## 1. Objective

This is the backend implementation blueprint for MimarAI. It is written for the actual developer who will implement the backend from the current frontend and partial backend prototype.

This document is not a generic backend tutorial. It is a product-specific build guide based on the app’s real logic, current state, and the actual issues discovered during the interview and generation flow.

The goal is to make the backend match the product vision, the frontend contracts, and the architecture needed for the multi-step AI planning workflow.

---

## 2. Product summary

MimarAI is not a standard SaaS app. It is an AI architecture assistant that does the following:

1. Interviews the user about an app idea
2. Classifies whether the idea is a valid software project
3. Clarifies vague or weakly defined ideas
4. Collects fixed technical inputs
5. Generates a feature plan using dual-model AI drafting
6. Cross-checks, validates, and fixes outputs
7. Builds a project structure and architecture JSON
8. Renders diagrams / blueprint outputs
9. Produces a final implementation plan
10. Exposes MCP-ready server metadata for downstream AI tooling

This product is fundamentally an AI orchestration backend with a frontend shell and a project state machine.

---

## 3. Backend role in this product

The backend is responsible for:

- user auth and project ownership
- persistence of project state
- AI orchestration with multiple providers
- validation + repair loops for LLM outputs
- step transition handling
- rate limiting and guard rails
- comments / revisions / plan repair
- deployment-ready API contracts

The backend is not just a CRUD layer. It is the operational brain of the product.

---

## 4. Current implementation status

The project already has:

- a FastAPI API app
- Supabase-backed auth and storage hooks
- project draft APIs
- project status updates
- interview classifier route
- generation route
- contact form backend
- basic JWT auth guard

This is a partial but strong prototype.

However, it is still incomplete and not fully aligned with the frontend’s real state machine. The backend is functionally close, but it is still not strong enough to be treated as a stable production backend.

---

## 5. Frontend expectations that must be matched

The frontend is already built around a state-driven architecture. The backend must serve this exact contract.

### 5.1 Project lifecycle

The frontend expects a project record to exist for:

- idea capture
- status tracking
- generation
- plan review
- structure and diagram steps
- final acceptance

The backend must preserve these across all steps.

### 5.2 Interview state model

The frontend uses these values:

- projectId
- ideaText
- step0State
- step0Status
- fixedInputs
- messages

The backend must store and expose these consistently.

### 5.3 Generation output model

The frontend expects generation results in a shape similar to:

- idea_objective
- fixed_inputs
- features
- rejected_feature_ids
- dependency_order
- adjusted_flag
- generated_at

The backend must return JSON in this shape or a clearly defined equivalent.

### 5.4 Review and revision model

The frontend expects:

- comments on feature items
- batch-fix requests
- revised generation state
- accepted/rejected outputs per step

The backend must support revision orchestration in a reliable and deterministic way.

### 5.5 Auth contract

Every user-scoped endpoint must require:

- Authorization: Bearer <token>

The backend must validate this before any project or generation action is processed.

---

## 6. Core product flow to implement

### Phase 0: Initial interview

User enters idea text.

Expected backend behavior:

- validate input length
- classify the idea
- determine OFF_TOPIC / TOO_VAGUE / READY
- if insufficient, ask clarifying questions
- if valid, continue to fixed inputs collection

### Phase 1: Project creation and persistence

When user starts the interview:

- create a project row if it does not exist
- associate with the authenticated user
- store initial idea text
- maintain step0_state

### Phase 2: Fixed inputs collection

User selects:

- stack
- database
- deployment
- auth / APIs

This should be stored in the project record and reused across generation.

### Phase 3: Dual-model generation

Use parallel generation to produce:

- Gemini draft
- Groq draft

Then merge and normalize both into a single feature list.

### Phase 4: Validation and repair loop

Check generated plan against:

- scope rules
- technology compatibility
- missing features
- fixed inputs constraints

If invalid:

- fix the output
- re-check
- accept the corrected output if valid

### Phase 5: Review and revision

User comments on feature plan or generated structure.

The backend should:

- accept comment list
- revise target output
- re-run validation
- return updated plan

### Phase 6: Structure / diagram / final plan

The backend eventually supports:

- structure generation
- schema generation
- architecture diagram JSON
- final consolidated plan

This is a later-phase project, but the backend must already be designed with those states in mind.

---

## 7. Current backend logic: what is already built

### 7.1 Auth

The backend already has a global auth dependency:

- get_current_user()

This checks the Bearer token and validates the user.

This is required and should remain as the central gate.

### 7.2 Project drafting

The backend has:

- create project draft
- list drafts

This is correct in principle and is required for continuity.

### 7.3 Classification

The backend has:

- POST /api/interview/classify

This already does:

- validation
- rate limiting
- Groq classification
- step0 state tracking

This is a strong foundation for the interview step.

### 7.4 Generation flow

The backend already has:

- generate feature pipeline

It already includes:

- parallel Gemini + Groq drafting
- merge logic
- validation pass
- fix pass
- final generation state output

This is the most important existing product logic and should be preserved while refactoring.

### 7.5 Contact flow

The backend has a working contact form with email support and Supabase persistence.

This is useful but not central to the architecture assistant.

---

## 8. What the backend is still missing or weak

### 8.1 Real project state integrity

The frontend includes a strong state machine, but the backend does not yet enforce it cleanly.

Problems include:

- fake local-draft IDs in frontend requests
- project lifecycle not strictly validated
- generation triggered before valid project identity exists

This is the most important product-level bug.

### 8.2 Strict modular architecture

The backend is still mostly in one file. It does not yet separate concerns cleanly.

This makes future expansion harder and more fragile.

### 8.3 Lack of a formal data schema

The backend stores some data in loosely structured objects, but the system should have a clear schema for:

- projects
- generation states
- fixed inputs
- feature records
- comments
- dependency order
- revision history

### 8.4 Incomplete backend contracts for later phases

The frontend expects advanced structure, diagram, and final phases. The backend has some groundwork, but it does not yet model them as a real end-to-end pipeline.

### 8.5 API error consistency

There is inconsistency in how failures are exposed to the frontend:

- some are 401
- some are 429
- some are 502
- some are generic error strings

This should be standardized.

---

## 9. Core technical issues discovered

### Issue 1: Auth is critical but not always guaranteed to be present at the exact moment of request

This was observed in the live app behavior and is a real problem for the interview flow.

Symptoms:

- 401 on drafts fetch
- 401 on project status requests
- 401 on generation start

Required fix:

- user session must be checked before any project-scoped request
- if the user lacks a valid session, terminate politely and do not continue the pipeline

### Issue 2: The generation endpoint uses a fallback project ID value

The frontend has patterns like:

```javascript
`${backendUrl}/api/projects/${projectId || "local-draft-101"}/generate`;
```

This is a dangerous shortcut.

Why it is wrong:

- it creates background requests against a fake project identity
- it breaks ownership validation
- it causes inconsistent generation state
- it makes debugging nearly impossible

Required fix:

- never call real backend endpoints with a fake project ID
- create a valid project record first
- if unable to create it, block the flow and inform the user

### Issue 3: The backend generation pipeline is too tightly coupled to provider infrastructure

If Gemini or Groq fails, the whole generation endpoint fails.

This is operationally fragile.

Required fix:

- isolate AI provider calls behind a service layer
- standardize provider error handling
- implement a graceful degraded error state

### Issue 4: The backend is still organized as a proof-of-concept, not a product architecture

This is the biggest structural issue.

Required fix:

- refactor to modular application structure
- move logic out of the single main file
- define service boundaries by domain

---

## 10. Recommended backend architecture

### 10.1 Folder structure

The backend should ultimately look like this:

```text
backend/
  app/
    api/
      routes/
        auth.py
        contact.py
        projects.py
        interview.py
        generation.py
        comments.py
    core/
      config.py
      security.py
      errors.py
    db/
      supabase_client.py
      models.py
    schemas/
      project.py
      interview.py
      generation.py
      comments.py
    services/
      auth_service.py
      project_service.py
      interview_service.py
      generation_service.py
      validation_service.py
      revision_service.py
      ai/
        gemini_client.py
        groq_client.py
  main.py
  requirements.txt
```

This makes the backend maintainable and easier for a second developer to extend.

### 10.2 Service boundaries

The actual backend should be split into service responsibilities:

- Auth Service
  - verify token
  - fetch user identity
  - enforce project ownership

- Project Service
  - create draft project
  - fetch drafts
  - update project status
  - store fixed inputs

- Interview Service
  - classify idea
  - validate project readiness
  - persist step0 state

- Generation Service
  - call AI providers
  - merge feature sets
  - validate outputs
  - fix invalid outputs
  - persist generation_state

- Revision Service
  - handle comments
  - run targeted fixes
  - return updated outputs

---

## 11. Recommended backend implementation strategy

### Stage 1: Foundation

Build the base layer first:

- environment config
- Supabase client
- auth dependency
- structured logging
- consistent response formatting
- project ownership enforcement

### Stage 2: Project and interview state

Implement:

- project creation
- project status updates
- fixed_inputs persistence
- classification endpoints
- rate limiting
- step0 state persistence

### Stage 3: AI orchestration layer

Implement:

- Gemini client
- Groq client
- JSON parsing utilities
- prompt templates
- retry logic
- provider error mapping

### Stage 4: Generation pipeline

Implement:

- draft generation
- merge results
- validation pass
- fix pass
- save generation_state

### Stage 5: Revision and review system

Implement:

- comments on features
- batch-fix processing
- targeted re-generation
- validation after revisions

### Stage 6: Final product state machine

Add lifecycle states for:

- structure
- diagram
- final plan
- MCP handoff

---

## 12. Suggested rules for the backend

### Rule 1: no fake project IDs in live requests

If there is no valid project, stop the flow and create one.

### Rule 2: every protected endpoint must verify auth

No exceptions.

### Rule 3: every user-scoped request must verify ownership

Project requests must be user-specific.

### Rule 4: AI provider failures must be treated as backend errors, not user errors

The user should not be punished for provider instability.

### Rule 5: generation must be state-driven

A generation request should only happen when the project state allows it.

### Rule 6: response payloads must be consistent and machine-readable

The frontend is structured and expects predictable responses.

---

## 13. What is correct in the current approach

Even though there are gaps, some parts of the current backend should definitely be retained:

- JWT auth foundation
- Supabase persistence approach
- dual-model generation idea
- validation + repair loop
- classification flow
- rate limit approach
- comments / revision intent

These are all aligned with the product vision and should be preserved.

---

## 14. What should be considered wrong or risky

The following should be considered risky and should not be copied blindly into the final backend:

- fake local-draft fallback IDs
- single-file backend structure
- uncontrolled provider-side failures
- missing project ownership enforcement in some flows
- weakly typed or loosely structured generation outputs
- business logic embedded directly in route handlers

---

## 15. Final developer guidance

The product is not a classic CRUD application. It is an agent-like planning system with a strict state machine and an LLM orchestration layer.

The backend must therefore be built as:

- secure
- stateful
- structured
- provider-aware
- validation-driven
- modular

If built correctly, it will support the actual MimarAI workflow that the frontend is already designed for.

The next implementation should be done in clear phases, with each phase mapped to the frontend state experience. Do not cross-step into final generation or MCP work before the project lifecycle, auth, and generation foundations are stable.

---

## 16. Recommended first implementation milestone

The first milestone should be:

1. secure auth
2. project draft lifecycle
3. project status persistence
4. classification endpoint
5. stable project ownership checks
6. generation endpoint with provider wrappers
7. consistent JSON response contract

Once those are stable, the rest of the architecture assistant logic can be layered on top safely.

This is the correct first backend build path for MimarAI.
