import os
import sys
import json
import httpx
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BACKEND_URL = os.environ.get("MIMARAI_BACKEND_URL", "https://mimaraibackend-wp3pzqzb.b4a.run").rstrip("/")
TOKEN = os.environ.get("MIMARAI_TEST_TOKEN", "").strip()

if not TOKEN:
    print("[ERROR] MIMARAI_TEST_TOKEN is required.")
    sys.exit(1)

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}"
}


def create_draft(client, idea_text):
    res = client.post(f"{BACKEND_URL}/api/projects/draft", headers=HEADERS, json={"idea_text": idea_text})
    if res.status_code != 200:
        raise RuntimeError(f"Create draft failed: {res.text}")
    data = res.json()
    project_id = data.get("id")

    fixed_inputs = {
        "stack": "Next.js + FastAPI",
        "database": "PostgreSQL",
        "deployment": "Vercel + Back4App",
        "apis": "Stripe + SendGrid"
    }
    client.post(
        f"{BACKEND_URL}/api/projects/{project_id}/status",
        headers=HEADERS,
        json={"status": "ready", "fixed_inputs": fixed_inputs}
    )
    return project_id, fixed_inputs


def run_all_live_tests():
    report_lines = []
    
    def log(msg=""):
        print(msg)
        report_lines.append(msg)

    timestamp = datetime.now(timezone.utc).isoformat()
    log(f"# Multi-Version Live Server Test Report")
    log(f"**Target Server URL:** `{BACKEND_URL}`")
    log(f"**Execution Timestamp:** `{timestamp}`")
    log(f"**Test Mode:** Real Live HTTP Requests (Zero Mocks)")
    log("")
    log("---")

    with httpx.Client(timeout=60.0) as client:
        # 0. Health check
        log("## 1. Backend Preview Liveness Check")
        res = client.get(f"{BACKEND_URL}/health")
        log(f"- **Endpoint:** `GET {BACKEND_URL}/health`")
        log(f"- **HTTP Status:** `{res.status_code}`")
        log(f"- **Response:** `{res.text}`")
        assert res.status_code == 200
        log("- **Result:** [PASS] Backend is live and responsive.\n")

        # -------------------------------------------------------------
        # V3.3 Clarifying Questions Live Tests
        # -------------------------------------------------------------
        log("## 2. Version 3.3 — Clarifying Questions Live Verification")
        p_cq, _ = create_draft(client, "A real estate property inspection management system with photo uploads.")
        
        # CQ Gen
        res_cq = client.post(
            f"{BACKEND_URL}/api/projects/{p_cq}/clarifying-questions",
            headers=HEADERS,
            json={"idea_text": "A real estate property inspection management system with photo uploads."}
        )
        log(f"### Test 2.1: Generate Clarifying Questions")
        log(f"- **Endpoint:** `POST /api/projects/{p_cq}/clarifying-questions`")
        log(f"- **HTTP Status:** `{res_cq.status_code}`")
        log("```json\n" + json.dumps(res_cq.json(), indent=2) + "\n```")
        assert res_cq.status_code == 200
        cq_data = res_cq.json()
        questions = cq_data.get("questions", [])

        # CQ Answer
        if questions:
            q_id = questions[0]["id"]
            res_ans = client.post(
                f"{BACKEND_URL}/api/projects/{p_cq}/clarifying-questions/answer",
                headers=HEADERS,
                json={"answers": [{"question_id": q_id, "answer": "Inspectors create checklist items, clients view completed PDF reports."}]}
            )
            log(f"### Test 2.2: Submit Clarifying Answers")
            log(f"- **Endpoint:** `POST /api/projects/{p_cq}/clarifying-questions/answer`")
            log(f"- **HTTP Status:** `{res_ans.status_code}`")
            log("```json\n" + json.dumps(res_ans.json(), indent=2) + "\n```")
            assert res_ans.status_code == 200

        # CQ Fetch
        res_get_cq = client.get(f"{BACKEND_URL}/api/projects/{p_cq}/clarifying-questions", headers=HEADERS)
        log(f"### Test 2.3: Retrieve Persisted Clarifying Questions")
        log(f"- **Endpoint:** `GET /api/projects/{p_cq}/clarifying-questions`")
        log(f"- **HTTP Status:** `{res_get_cq.status_code}`")
        log("```json\n" + json.dumps(res_get_cq.json(), indent=2) + "\n```")
        assert res_get_cq.status_code == 200
        log("- **Result:** [PASS] V3.3 Clarifying Questions fully operational on live server.\n")

        # -------------------------------------------------------------
        # V3.4 / V3.5 Persona & NFR Capture Live Tests
        # -------------------------------------------------------------
        log("## 3. Version 3.4 & 3.5 — Persona & NFR Capture Live Verification")
        p_pn, _ = create_draft(client, "A clinical trial patient adherence tracking system.")

        # Persona Submit
        res_persona = client.post(
            f"{BACKEND_URL}/api/projects/{p_pn}/personas",
            headers=HEADERS,
            json={"answer": "Principal investigators monitor trial protocols, patients log daily dosage, clinical coordinators track adherence."}
        )
        log(f"### Test 3.1: Submit User Personas (V3.4)")
        log(f"- **Endpoint:** `POST /api/projects/{p_pn}/personas`")
        log(f"- **HTTP Status:** `{res_persona.status_code}`")
        log("```json\n" + json.dumps(res_persona.json(), indent=2) + "\n```")
        assert res_persona.status_code == 200

        # NFR Submit
        res_nfr = client.post(
            f"{BACKEND_URL}/api/projects/{p_pn}/nfrs",
            headers=HEADERS,
            json={"scale": "thousands_plus", "data_sensitivity": "sensitive", "availability": "mission_critical"}
        )
        log(f"### Test 3.2: Submit Non-Functional Requirements (V3.5)")
        log(f"- **Endpoint:** `POST /api/projects/{p_pn}/nfrs`")
        log(f"- **HTTP Status:** `{res_nfr.status_code}`")
        log("```json\n" + json.dumps(res_nfr.json(), indent=2) + "\n```")
        assert res_nfr.status_code == 200

        # Persona & NFR Fetch
        res_get_p = client.get(f"{BACKEND_URL}/api/projects/{p_pn}/personas", headers=HEADERS)
        res_get_n = client.get(f"{BACKEND_URL}/api/projects/{p_pn}/nfrs", headers=HEADERS)
        log(f"### Test 3.3: Fetch Persisted Persona & NFR Records")
        log(f"- Persona Status: `{res_get_p.status_code}`, Data: `{json.dumps(res_get_p.json())}`")
        log(f"- NFR Status: `{res_get_n.status_code}`, Data: `{json.dumps(res_get_n.json())}`")
        assert res_get_p.status_code == 200
        assert res_get_n.status_code == 200
        log("- **Result:** [PASS] V3.4 Persona & V3.5 NFR endpoints fully operational on live server.\n")

        # -------------------------------------------------------------
        # V3.8 Lightweight Confirm Draft Live Tests
        # -------------------------------------------------------------
        log("## 4. Version 3.8 — Lightweight Confirm Draft Live Verification")
        p_draft, fix_inputs = create_draft(client, "A cloud gym management SaaS with member subscriptions and trainer booking.")

        # Attempt 1
        res_d1 = client.post(f"{BACKEND_URL}/api/projects/{p_draft}/lightweight-draft", headers=HEADERS, json={"attempt": 1})
        log(f"### Test 4.1: Generate Lightweight Draft Attempt 1")
        log(f"- **Endpoint:** `POST /api/projects/{p_draft}/lightweight-draft`")
        log(f"- **HTTP Status:** `{res_d1.status_code}`")
        log("```json\n" + json.dumps(res_d1.json(), indent=2) + "\n```")
        assert res_d1.status_code == 200

        # Reject Attempt 1 with correction
        res_r1 = client.post(
            f"{BACKEND_URL}/api/projects/{p_draft}/lightweight-draft/respond",
            headers=HEADERS,
            json={"response": "rejected", "attempt": 1, "correction_text": "Must include QR code door access control"}
        )
        log(f"### Test 4.2: Reject Attempt 1 with Correction")
        log(f"- **Endpoint:** `POST /api/projects/{p_draft}/lightweight-draft/respond`")
        log(f"- **HTTP Status:** `{res_r1.status_code}`")
        log("```json\n" + json.dumps(res_r1.json(), indent=2) + "\n```")
        assert res_r1.status_code == 200
        assert res_r1.json().get("status") == "retry"

        # Attempt 2 with folded correction
        res_d2 = client.post(
            f"{BACKEND_URL}/api/projects/{p_draft}/lightweight-draft",
            headers=HEADERS,
            json={"attempt": 2, "correction_text": "Must include QR code door access control"}
        )
        log(f"### Test 4.3: Generate Lightweight Draft Attempt 2 (Folded Correction)")
        log(f"- **Endpoint:** `POST /api/projects/{p_draft}/lightweight-draft`")
        log(f"- **HTTP Status:** `{res_d2.status_code}`")
        log("```json\n" + json.dumps(res_d2.json(), indent=2) + "\n```")
        assert res_d2.status_code == 200

        # Confirm Attempt 2
        res_c2 = client.post(
            f"{BACKEND_URL}/api/projects/{p_draft}/lightweight-draft/respond",
            headers=HEADERS,
            json={"response": "confirmed", "attempt": 2}
        )
        log(f"### Test 4.4: Confirm Attempt 2")
        log(f"- **Endpoint:** `POST /api/projects/{p_draft}/lightweight-draft/respond`")
        log(f"- **HTTP Status:** `{res_c2.status_code}`")
        log("```json\n" + json.dumps(res_c2.json(), indent=2) + "\n```")
        assert res_c2.status_code == 200
        assert res_c2.json().get("proceed_to_generation") is True

        # Cap Reached Test on second project
        p_cap, fix_cap = create_draft(client, "A warehouse logistics portal.")
        client.post(f"{BACKEND_URL}/api/projects/{p_cap}/lightweight-draft", headers=HEADERS, json={"attempt": 1})
        client.post(f"{BACKEND_URL}/api/projects/{p_cap}/lightweight-draft/respond", headers=HEADERS, json={"response": "rejected", "attempt": 1, "correction_text": "Fix A"})
        client.post(f"{BACKEND_URL}/api/projects/{p_cap}/lightweight-draft", headers=HEADERS, json={"attempt": 2, "correction_text": "Fix A"})
        res_cap = client.post(
            f"{BACKEND_URL}/api/projects/{p_cap}/lightweight-draft/respond",
            headers=HEADERS,
            json={"response": "rejected", "attempt": 2, "correction_text": "Fix B"}
        )
        log(f"### Test 4.5: 2-Attempt Cap Reached (Proceeds with Flagged: True)")
        log(f"- **Endpoint:** `POST /api/projects/{p_cap}/lightweight-draft/respond`")
        log(f"- **HTTP Status:** `{res_cap.status_code}`")
        log("```json\n" + json.dumps(res_cap.json(), indent=2) + "\n```")
        assert res_cap.status_code == 200
        assert res_cap.json().get("status") == "proceeded_after_cap"
        assert res_cap.json().get("lightweight_draft_flagged") is True

        # Query persisted record
        res_persisted = client.get(f"{BACKEND_URL}/api/projects/{p_cap}/lightweight-draft", headers=HEADERS)
        log(f"### Test 4.6: Authoritative DB Record Query for Cap Exhaustion")
        log(f"- **Endpoint:** `GET /api/projects/{p_cap}/lightweight-draft`")
        log(f"- **HTTP Status:** `{res_persisted.status_code}`")
        log("```json\n" + json.dumps(res_persisted.json(), indent=2) + "\n```")
        assert res_persisted.status_code == 200
        log("- **Result:** [PASS] V3.8 Lightweight Confirm Draft fully verified on live server.\n")

    log("---")
    log("## Summary Table of Live Server Verification")
    log("| Version | Component | Live Endpoints Tested | Result |")
    log("|---|---|---|---|")
    log("| **V3.3** | Clarifying Questions | `POST /clarifying-questions`, `POST /answer`, `GET /clarifying-questions` | **PASS** |")
    log("| **V3.4 & V3.5** | Personas & NFRs | `POST /personas`, `POST /nfrs`, `GET /personas`, `GET /nfrs` | **PASS** |")
    log("| **V3.8** | Lightweight Draft | `POST /lightweight-draft`, `POST /respond`, `GET /lightweight-draft` | **PASS** |")
    log("")

    # Save to report file
    report_content = "\n".join(report_lines)
    with open("LIVE_TEST_REPORT_V3_3_V3_5_V3_8.md", "w", encoding="utf-8") as f:
        f.write(report_content)
    print("\n[SUCCESS] Report written to LIVE_TEST_REPORT_V3_3_V3_5_V3_8.md")


if __name__ == "__main__":
    run_all_live_tests()
