import os
import sys
import json
import time
import httpx

# Reconfigure stdout for Windows console to handle any AI unicode characters cleanly
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BACKEND_URL = os.environ.get("MIMARAI_BACKEND_URL", "https://mimaraibackend-wp3pzqzb.b4a.run").rstrip("/")

TOKEN = os.environ.get("MIMARAI_TEST_TOKEN", "").strip()

if not TOKEN:
    print("[ERROR] MIMARAI_TEST_TOKEN environment variable is not set.")
    sys.exit(1)

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}"
}


def log_step(title):
    print("\n" + "=" * 70)
    print(f"=== {title}")
    print("=" * 70)


def test_health():
    log_step("1. HEALTH CHECK ON BACKEND PREVIEW URL")
    url = f"{BACKEND_URL}/health"
    print(f"GET {url}")
    with httpx.Client(timeout=15.0) as client:
        res = client.get(url)
        print(f"Status Code: {res.status_code}")
        print(f"Response Body: {res.text}")
        if res.status_code != 200:
            raise RuntimeError(f"Health check failed with status {res.status_code}")
    print("[PASS] Health check PASSED.")


def create_and_setup_project(client, idea_text):
    # Step 0: Create draft project in Supabase
    draft_url = f"{BACKEND_URL}/api/projects/draft"
    print(f"POST {draft_url}")
    draft_payload = {"idea_text": idea_text}
    res = client.post(draft_url, headers=HEADERS, json=draft_payload)
    print(f"Create Draft Status: {res.status_code}")
    if res.status_code != 200:
        raise RuntimeError(f"Create draft project failed: {res.text}")
    project_data = res.json()
    project_id = project_data.get("id")
    print(f"Created Project ID: {project_id}")

    # Set fixed inputs and ready status
    status_url = f"{BACKEND_URL}/api/projects/{project_id}/status"
    fixed_inputs = {
        "stack": "Next.js + FastAPI",
        "database": "PostgreSQL",
        "deployment": "Vercel + Back4App",
        "apis": "Stripe + SendGrid"
    }
    res_status = client.post(
        status_url,
        headers=HEADERS,
        json={"status": "ready", "fixed_inputs": fixed_inputs}
    )
    print(f"Status Update Status: {res_status.status_code}")
    return project_id, fixed_inputs



def scenario_1_confirm_path(client):
    log_step("2. LIVE SCENARIO 1: CONFIRM PATH (ATTEMPT 1 -> CONFIRM -> FULL GENERATION)")
    idea = "A real-time fleet dispatch management system for municipal ambulances with GPS tracking and route optimization."
    project_id, fixed_inputs = create_and_setup_project(client, idea)

    # 1. Request Lightweight Draft (Attempt 1)
    draft_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft"
    print(f"POST {draft_url} (Attempt 1)")
    draft_res = client.post(draft_url, headers=HEADERS, json={"attempt": 1})
    print(f"Draft Response Status: {draft_res.status_code}")
    print(f"Draft Body: {json.dumps(draft_res.json(), indent=2)}")
    if draft_res.status_code != 200:
        raise RuntimeError(f"Draft generation failed: {draft_res.text}")
    draft_data = draft_res.json()
    assert draft_data.get("status") == "ok"
    assert draft_data.get("attempt") == 1
    assert len(draft_data.get("draft_features", [])) > 0

    # 2. Respond with Confirm
    respond_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft/respond"
    print(f"\nPOST {respond_url} (Confirm)")
    resp_res = client.post(respond_url, headers=HEADERS, json={"response": "confirmed", "attempt": 1})
    print(f"Respond Status: {resp_res.status_code}")
    print(f"Respond Body: {json.dumps(resp_res.json(), indent=2)}")
    if resp_res.status_code != 200:
        raise RuntimeError(f"Draft respond failed: {resp_res.text}")
    resp_data = resp_res.json()
    assert resp_data.get("status") == "confirmed"
    assert resp_data.get("proceed_to_generation") is True
    assert resp_data.get("lightweight_draft_flagged") is False

    # 3. Verify Full Generation proceeds
    gen_url = f"{BACKEND_URL}/api/projects/{project_id}/generate"
    print(f"\nPOST {gen_url} (Full Dual-Model Generation)")
    gen_res = client.post(gen_url, headers=HEADERS, json={"idea_text": idea, "fixed_inputs": fixed_inputs})
    print(f"Generate Status: {gen_res.status_code}")
    if gen_res.status_code != 200:
        raise RuntimeError(f"Full generation failed: {gen_res.text}")
    gen_data = gen_res.json()
    print(f"Generated Features Count: {len(gen_data.get('features', []))}")
    print("[PASS] SCENARIO 1 PASSED: Draft confirmed and full pipeline executed successfully.")


def scenario_2_reject_once_then_confirm(client):
    log_step("3. LIVE SCENARIO 2: REJECT ONCE THEN CONFIRM (ATTEMPT 1 REJECT -> ATTEMPT 2 -> CONFIRM -> FULL GENERATION)")
    idea = "A dental clinic practice management platform."
    project_id, fixed_inputs = create_and_setup_project(client, idea)

    # 1. Request Attempt 1
    draft_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft"
    print(f"POST {draft_url} (Attempt 1)")
    draft_res1 = client.post(draft_url, headers=HEADERS, json={"attempt": 1})
    print(f"Attempt 1 Status: {draft_res1.status_code}")
    print(f"Attempt 1 Features: {draft_res1.json().get('draft_features')}")

    # 2. Reject Attempt 1 with Correction
    correction = "Must include automated SMS appointment reminders and tooth charting."
    respond_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft/respond"
    print(f"\nPOST {respond_url} (Reject Attempt 1)")
    reject_res = client.post(
        respond_url,
        headers=HEADERS,
        json={"response": "rejected", "attempt": 1, "correction_text": correction}
    )
    print(f"Reject Status: {reject_res.status_code}")
    print(f"Reject Body: {json.dumps(reject_res.json(), indent=2)}")
    assert reject_res.json().get("status") == "retry"
    assert reject_res.json().get("proceed_to_generation") is False

    # 3. Request Attempt 2 with folded correction
    print(f"\nPOST {draft_url} (Attempt 2 with correction)")
    draft_res2 = client.post(
        draft_url,
        headers=HEADERS,
        json={"attempt": 2, "correction_text": correction}
    )
    print(f"Attempt 2 Status: {draft_res2.status_code}")
    print(f"Attempt 2 Features: {draft_res2.json().get('draft_features')}")
    features_str = " ".join(draft_res2.json().get("draft_features", [])).lower()
    print(f"Attempt 2 Features text: {features_str}")

    # 4. Confirm Attempt 2
    print(f"\nPOST {respond_url} (Confirm Attempt 2)")
    confirm_res = client.post(
        respond_url,
        headers=HEADERS,
        json={"response": "confirmed", "attempt": 2}
    )
    print(f"Confirm Attempt 2 Status: {confirm_res.status_code}")
    assert confirm_res.json().get("status") == "confirmed"
    assert confirm_res.json().get("proceed_to_generation") is True

    # 5. Verify Full Generation proceeds
    gen_url = f"{BACKEND_URL}/api/projects/{project_id}/generate"
    print(f"\nPOST {gen_url} (Full Dual-Model Generation)")
    gen_res = client.post(gen_url, headers=HEADERS, json={"idea_text": idea, "fixed_inputs": fixed_inputs})
    print(f"Generate Status: {gen_res.status_code}")
    if gen_res.status_code != 200:
        raise RuntimeError(f"Full generation failed: {gen_res.text}")
    print("[PASS] SCENARIO 2 PASSED: Attempt 1 rejected, Attempt 2 generated with correction and confirmed.")


def scenario_3_cap_reached_flagged(client):
    log_step("4. LIVE SCENARIO 3: CAP REACHED (REJECT ATTEMPT 1 & 2 -> PROCEED WITH FLAGGED: TRUE)")
    idea = "A community food pantry inventory management tool."
    project_id, fixed_inputs = create_and_setup_project(client, idea)

    draft_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft"
    respond_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft/respond"

    # 1. Attempt 1
    print(f"POST {draft_url} (Attempt 1)")
    client.post(draft_url, headers=HEADERS, json={"attempt": 1})

    # 2. Reject Attempt 1
    print(f"POST {respond_url} (Reject Attempt 1)")
    client.post(
        respond_url,
        headers=HEADERS,
        json={"response": "rejected", "attempt": 1, "correction_text": "Need USDA reporting"}
    )

    # 3. Attempt 2
    print(f"POST {draft_url} (Attempt 2)")
    client.post(
        draft_url,
        headers=HEADERS,
        json={"attempt": 2, "correction_text": "Need USDA reporting"}
    )

    # 4. Reject Attempt 2 (Cap reached!)
    print(f"\nPOST {respond_url} (Reject Attempt 2 - Cap reached)")
    cap_res = client.post(
        respond_url,
        headers=HEADERS,
        json={"response": "rejected", "attempt": 2, "correction_text": "Still missing USDA compliance export"}
    )
    print(f"Cap Reject Status: {cap_res.status_code}")
    print(f"Cap Reject Body: {json.dumps(cap_res.json(), indent=2)}")
    cap_data = cap_res.json()
    assert cap_data.get("status") == "proceeded_after_cap"
    assert cap_data.get("proceed_to_generation") is True
    assert cap_data.get("lightweight_draft_flagged") is True

    # 5. Query persisted draft record
    get_draft_url = f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft"
    print(f"\nGET {get_draft_url}")
    get_res = client.get(get_draft_url, headers=HEADERS)
    print(f"Persisted Record Status: {get_res.status_code}")
    print(f"Persisted Draft Record: {json.dumps(get_res.json(), indent=2)}")
    persisted_draft = get_res.json().get("lightweight_draft") or {}
    assert persisted_draft.get("final_status") == "proceeded_after_cap"
    assert persisted_draft.get("lightweight_draft_flagged") is True
    assert len(persisted_draft.get("attempts", [])) == 2

    # 6. Verify Full Generation proceeds with the context
    gen_url = f"{BACKEND_URL}/api/projects/{project_id}/generate"
    print(f"\nPOST {gen_url} (Full Generation After Cap)")
    gen_res = client.post(gen_url, headers=HEADERS, json={"idea_text": idea, "fixed_inputs": fixed_inputs})
    print(f"Generate Status: {gen_res.status_code}")
    if gen_res.status_code != 200:
        raise RuntimeError(f"Full generation failed: {gen_res.text}")
    print("[PASS] SCENARIO 3 PASSED: Cap reached, final_status='proceeded_after_cap' and lightweight_draft_flagged=true persisted in DB.")



def main_test():
    print(f"Starting Live Verification against: {BACKEND_URL}")
    with httpx.Client(timeout=60.0) as client:
        test_health()
        scenario_1_confirm_path(client)
        scenario_2_reject_once_then_confirm(client)
        scenario_3_cap_reached_flagged(client)
    log_step("ALL 4 LIVE VERIFICATION SCENARIOS COMPLETED SUCCESSFULLY")


if __name__ == "__main__":
    main_test()
