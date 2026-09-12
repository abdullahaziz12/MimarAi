# Interview Flow Debug Summary

## Scope

This document focuses only on the interview flow and the related project-generation/auth issues visible in the logs. It intentionally excludes unrelated browser warnings like CSP/font policy violations and the Vercel feedback script.

## Observed errors

### 401 Unauthorized

Observed on requests such as:

- `/api/projects/drafts`
- `/api/projects/{project_id}/status`
- `/api/projects/{project_id}/generate`

These are not normal interview UI failures; they indicate the backend rejected the request because the caller did not provide a valid authenticated user context.

### 502 Bad Gateway

Observed on generation requests such as:

- `/api/projects/{project_id}/generate`

This points to the backend generation pipeline failing while contacting upstream AI providers or while returning an invalid output from the backend orchestration.

## Root causes in the interview logic

### 1. Auth is required but not always present

The backend enforces authentication in `get_current_user()` via a Bearer token in `Authorization` headers.

See:

- `backend/main.py` `get_current_user()`
- `frontend/src/store/mimarStore.js` requests that send `Authorization: Bearer ...`

If the session token is missing, expired, or not available at the exact request time, the app will receive 401s even though the interview UI appears active.

### 2. Project identity is not stable during Step 0

The interview tries to create a project draft when there is no `projectId`.

This happens in:

- `frontend/src/store/mimarStore.js` `classifyIdeaStep0()`

The issue is that the code proceeds even if the draft creation fails or if the project row is not truly created. Then the app continues with a request to the classification endpoint but without a reliable project identity.

### 3. Local fallback project IDs are unsafe

The code uses a placeholder like:

- `local-draft-101`

This appears in generation calls and revision calls in the store.

This is a logic flaw because the app is treating an unbound, fake ID as if it were a real project. This creates state drift and makes status and generation requests non-deterministic.

### 4. Generation can start before Step 0 is truly valid

The UI allows generation when only a basic text input exists, but does not strictly enforce the proper state machine:

- idea text present
- classification completed
- READY label confirmed
- valid project ownership
- fixed inputs captured

The start button logic in `InterviewScreen` checks for existence of text and project state but not a guaranteed valid Step 0 completion state.

### 5. Backend generation has a single failure point

The backend generation endpoint orchestrates Gemini + Groq calls. If any upstream provider fails or the response shape is unexpected, the endpoint raises a generic 502.

The interview flow therefore fails at the generation layer even when the user interaction is otherwise valid.

### 6. Auth/config problems are not handled as recoverable interview states

When auth is missing or API keys are not configured, the app does not gracefully recover into a clear interview message. Instead, it leaves the user looking at a broken state machine.

## Most important interview-only flaws

1. 401s caused by missing or stale auth
2. project creation fallback is not reliable
3. fake local-draft IDs are used in real request paths
4. generation can be triggered without strict Step 0 validation
5. 502s are backend/provider failures, not interview UI mistakes
6. the app keeps progressing even when project state is invalid

## Why the selected line matters

The line below is representative of the unsafe fallback pattern:

```javascript
`${backendUrl}/api/projects/${projectId || "local-draft-101"}/generate`;
```

This means:

- if there is no real project ID, the app still sends a request
- the backend receives a fake project identifier instead of a valid project row
- the request will fail or behave unpredictably depending on auth and backend state

## Conclusion

The interview flow is not failing because the UI is fundamentally broken. The main problems are:

- unreliable auth/session handling
- fake or missing project IDs
- weak Step 0 validation before generation
- provider/backend failure surfacing as 502s

These are the key interview-related issues to fix first.
