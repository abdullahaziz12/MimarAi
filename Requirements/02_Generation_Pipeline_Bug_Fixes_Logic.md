# Two Verified Bugs in the Existing Generation Pipeline — Fix Logic

These are two flaws found by directly reading `backend/main.py`, inside 
`generate_feature_pipeline()`. Neither has been fixed yet. Both are separate from the 
five-fix set from the earlier `fix-known-pipeline-flaws` session — do not confuse or merge 
evidence between the two efforts.

---

## Bug A1 — Fail-Open Validation Default

### Where
`backend/main.py`, inside `generate_feature_pipeline()`, in the block that computes 
`adjusted_flag` from Groq's first validation response (`val1`):

```python
adjusted_flag = bool(
    not val1.get("is_valid", True)
    and val1.get("flags")
)
```

### What's wrong
`val1.get("is_valid", True)` — if Groq's validation response is missing the `is_valid` 
key entirely (malformed JSON, unexpected shape, truncated response), Python's `.get()` 
falls back to `True`. This means an incomplete or broken validation response is silently 
treated as "validation passed," when it should be treated as "validation could not be 
confirmed."

### Why it matters
This is a fail-open pattern in a place that should fail closed. If Groq's provider call 
returns something malformed, the pipeline currently proceeds as if everything was checked 
and found valid — when in reality, nothing was actually validated.

### Correct behavior
- If `is_valid` is missing from the response entirely, this must be treated as a 
  **validation failure**, not a pass.
- On this failure, retry once using the existing repair-prompt pattern already built for 
  malformed JSON elsewhere in this same function (the same mechanism used when a 
  validation response is unparseable).
- If the retry also comes back without `is_valid`, raise a clear error 
  (do not silently proceed) — the same way other unrecoverable provider failures in this 
  pipeline already surface a 502-style error to the caller.
- Do not change behavior for the case where `is_valid` IS present and is `true` or 
  `false` — this fix only changes what happens when the key is absent.

### Verification requirement
Actually construct a test (unit test or live-simulated call) where the mocked/forced Groq 
validation response omits `is_valid` entirely, and confirm the pipeline now treats this as 
a failure requiring retry/error — not a silent pass. Paste the real test output.

---

## Bug A2 — Silent Gemini Fix-Pass Fallback

### Where
`backend/main.py`, inside `generate_feature_pipeline()`, in the exception handler around 
the Gemini fix-pass call (Step 4 of the generation sequence):

```python
except Exception as e:
    print(f"[Step 4 Gemini Fix Error] {e}")
    final_features = merged_features
```

### What's wrong
If the Gemini fix-pass call throws any exception (timeout, malformed response, API 
error), the code silently falls back to `merged_features` — the original, unfixed feature 
list — and only logs the error to the server console via `print()`. Nothing about this 
failure is returned to the frontend or shown to the user.

### Why it matters
The user has no way of knowing the fix pass never actually happened. Per the Locked Plan 
(Section 8), unresolved issues are supposed to be shown with an honest 
"Adjusted — Please Review" badge — but that badge reflects Groq's final validation 
outcome, not whether the fix pass itself silently failed to run at all. Right now, a 
complete fix-pass failure is indistinguishable from a successful fix pass that simply had 
nothing to fix.

### Correct behavior
- Keep the pipeline resilient — do NOT let a fix-pass exception break the entire 
  generation request. Continuing with `merged_features` as a fallback is acceptable at 
  the code level.
- BUT: persist a visible flag on the project's `generation_state`, e.g. 
  `"fix_pass_failed": true`, whenever this exception path is hit.
- The frontend must check this flag and show an honest, user-facing notice — something 
  like "We couldn't apply an automatic adjustment to this plan — please review the 
  features closely" — distinct from the normal "Adjusted — Please Review" badge, since 
  this represents a different situation (the fix never ran, vs. a fix ran and something 
  still needs review).
- Do not change what happens when the Gemini fix-pass call succeeds normally — this fix 
  only changes what's recorded/surfaced when it fails.

### Verification requirement
Actually force the Gemini fix-pass call to throw (e.g. via a temporarily invalid API key 
or a mocked exception in a test), and confirm: (1) the pipeline still completes without 
crashing, (2) `generation_state.fix_pass_failed` is `true` in the real persisted result, 
and (3) the frontend actually renders the distinct failure notice. Paste real test output 
or a real request/response showing this, not a description of expected behavior.

---

## Explicitly Out of Scope
- Do not touch the five fixes from the previous `fix-known-pipeline-flaws` session.
- Do not touch Contradiction Scan (V3.1) or any other new stage.
- Do not modify the feature schema or Requirement Quality Standard.

## Rollback Note
Both fixes are narrow, localized changes inside a single function's error-handling paths. 
If either causes unexpected behavior after deployment, reverting this branch's merge 
commit restores the exact prior (flawed but known) behavior with no side effects on other 
parts of the pipeline.
