#!/usr/bin/env python3
"""
MimarAI — Direct Endpoint Verification Script
Focused verification for the 4 interview endpoints:
  1. POST /api/projects/{id}/contradiction-scan
  2. POST /api/projects/{id}/clarifying-questions
  3. POST /api/projects/{id}/clarifying-questions/answer
  4. POST /api/projects/{id}/lightweight-draft

Usage:
  powershell:
    $env:MIMARAI_TEST_TOKEN="<your-token>"
    $env:MIMARAI_BACKEND_URL="https://mimaraibackend-q92cgcrz.b4a.run"
    python scripts/verify_failed_endpoints.py
"""

import os
import sys
import time
import json
import httpx

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

BACKEND_URL = os.getenv("MIMARAI_BACKEND_URL", "https://mimaraibackend-q92cgcrz.b4a.run").rstrip("/")
TEST_TOKEN = os.getenv("MIMARAI_TEST_TOKEN", "").strip()

def sanitize(text: str) -> str:
    if TEST_TOKEN and len(TEST_TOKEN) > 5:
        return text.replace(TEST_TOKEN, "[REDACTED_TOKEN]")
    return text

def log(msg: str):
    print(f"[*] {sanitize(msg)}")

def print_result(step_num: int, name: str, method: str, url: str, status_code: int, duration_ms: float, response_data: dict or str):
    status_label = "[PASS]" if status_code == 200 else f"[FAIL ({status_code})]"
    print("\n" + "=" * 70)
    print(f" Step {step_num}: {name} -> {status_label} ({duration_ms:.1f}ms)")
    print(f" Target : {method} {url}")
    print(f" Status : {status_code}")
    
    resp_str = json.dumps(response_data, indent=2) if isinstance(response_data, dict) else str(response_data)
    print(f" Output : {sanitize(resp_str[:500])}")
    print("=" * 70)

def main():
    print("=" * 70)
    print(" MimarAI — Direct Endpoint Verification")
    print("=" * 70)
    print(f" Target Backend: {BACKEND_URL}")
    print(f" Test Token    : {'Configured (Redacted)' if TEST_TOKEN else 'NOT SET'}")
    print("=" * 70)

    if not TEST_TOKEN:
        print("[!] ERROR: $env:MIMARAI_TEST_TOKEN is required. Please set it before running.")
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    client = httpx.Client(timeout=45.0, follow_redirects=True)

    # 0. Create fresh draft project
    idea = "A comprehensive veterinary clinic management platform allowing veterinarians, receptionists, and pet owners to manage medical records, book appointments, and process payments."
    log("Creating a dedicated test draft project...")
    t0 = time.time()
    resp = client.post(
        f"{BACKEND_URL}/api/projects/draft",
        headers=headers,
        json={"idea_text": idea, "step": 0}
    )
    dur = (time.time() - t0) * 1000

    if resp.status_code != 200:
        print_result(0, "Create Draft Project", "POST", f"{BACKEND_URL}/api/projects/draft", resp.status_code, dur, resp.text)
        print("[!] Cannot proceed without a valid project ID.")
        sys.exit(1)

    project_id = resp.json().get("id")
    print_result(0, "Create Draft Project", "POST", f"{BACKEND_URL}/api/projects/draft", resp.status_code, dur, {"project_id": project_id})

    # --- Test 1: Contradiction Scan ---
    # Expected: 200 OK (Clean scan or contradictions detected).
    # Note: On unmerged remote, this will show 502 RLS error; on merged backend it returns 200 OK.
    log(f"1. Testing Contradiction Scan for project {project_id}...")
    t0 = time.time()
    resp1 = client.post(
        f"{BACKEND_URL}/api/projects/{project_id}/contradiction-scan",
        headers=headers,
        json={
            "idea_text": idea,
            "round": 1,
            "resolved_answer": None
        }
    )
    dur1 = (time.time() - t0) * 1000
    try:
        data1 = resp1.json()
    except Exception:
        data1 = resp1.text
    print_result(1, "Contradiction Scan", "POST", f"/api/projects/{project_id}/contradiction-scan", resp1.status_code, dur1, data1)

    # --- Test 2: Clarifying Questions Generation ---
    # Expected: 200 OK with 'questions' list
    log(f"2. Testing Clarifying Questions Generation for project {project_id}...")
    t0 = time.time()
    resp2 = client.post(
        f"{BACKEND_URL}/api/projects/{project_id}/clarifying-questions",
        headers=headers,
        json={
            "idea_text": idea,
            "density_flags": {"clarifying_questions": "full", "personas": "ask", "nfrs": "ask"}
        }
    )
    dur2 = (time.time() - t0) * 1000
    try:
        data2 = resp2.json()
    except Exception:
        data2 = resp2.text
    print_result(2, "Clarifying Questions Generation", "POST", f"/api/projects/{project_id}/clarifying-questions", resp2.status_code, dur2, data2)

    # Extract first question ID if available
    first_q_id = None
    if isinstance(data2, dict) and data2.get("questions") and len(data2["questions"]) > 0:
        first_q_id = data2["questions"][0].get("id")

    # --- Test 3: Submit Clarifying Answer ---
    # Expected: 200 OK with updated_count
    log(f"3. Testing Submit Clarifying Answer for project {project_id}...")
    q_id_to_use = first_q_id or "00000000-0000-0000-0000-000000000001"
    t0 = time.time()
    resp3 = client.post(
        f"{BACKEND_URL}/api/projects/{project_id}/clarifying-questions/answer",
        headers=headers,
        json={
            "answers": [
                {
                    "question_id": q_id_to_use,
                    "answer": "The platform requires role-based access control with multi-factor authentication for veterinarian staff."
                }
            ]
        }
    )
    dur3 = (time.time() - t0) * 1000
    try:
        data3 = resp3.json()
    except Exception:
        data3 = resp3.text
    print_result(3, "Submit Clarifying Answers", "POST", f"/api/projects/{project_id}/clarifying-questions/answer", resp3.status_code, dur3, data3)

    # --- Test 4: Lightweight Draft Preview ---
    # Expected: 200 OK with 'draft_features' list
    log(f"4. Testing Lightweight Draft Generation for project {project_id}...")
    t0 = time.time()
    resp4 = client.post(
        f"{BACKEND_URL}/api/projects/{project_id}/lightweight-draft",
        headers=headers,
        json={
            "attempt": 1,
            "correction_text": None
        }
    )
    dur4 = (time.time() - t0) * 1000
    try:
        data4 = resp4.json()
    except Exception:
        data4 = resp4.text
    print_result(4, "Lightweight Draft Generation", "POST", f"/api/projects/{project_id}/lightweight-draft", resp4.status_code, dur4, data4)

    # Summary
    print("\n" + "=" * 70)
    print(" VERIFICATION SUMMARY")
    print("=" * 70)
    tests = [
        ("1. Contradiction Scan", resp1.status_code, dur1, "/api/projects/{id}/contradiction-scan", data1),
        ("2. Clarifying Questions", resp2.status_code, dur2, "/api/projects/{id}/clarifying-questions", data2),
        ("3. Submit Clarifying Answer", resp3.status_code, dur3, "/api/projects/{id}/clarifying-questions/answer", data3),
        ("4. Lightweight Draft", resp4.status_code, dur4, "/api/projects/{id}/lightweight-draft", data4),
    ]
    for name, st, dur, ep, out in tests:
        mark = "[PASS]" if st == 200 else f"[FAIL ({st})]"
        print(f" {name:<32} : {mark}")
    print("=" * 70)

    # Save to Markdown Report File
    report_file = os.path.join(PROJECT_ROOT, "Requirements", "DIRECT_VERIFICATION_RESULTS.md")
    md_lines = [
        "# MimarAI — Direct Endpoint Verification Report",
        "",
        f"- **Execution Timestamp:** `{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}`",
        f"- **Target Backend:** `{BACKEND_URL}`",
        f"- **Project ID Used:** `{project_id}`",
        "",
        "## Results Table",
        "",
        "| Step | Endpoint | Expected | Status Code | Duration | Status | Response Preview |",
        "|---|---|---|---|---|---|---|"
    ]

    for name, st, dur, ep, out in tests:
        mark = "**PASS**" if st == 200 else f"**FAIL ({st})**"
        out_str = json.dumps(out) if isinstance(out, (dict, list)) else str(out)
        clean_out = sanitize(out_str[:120]).replace("|", "\\|").replace("\n", " ")
        md_lines.append(f"| {name} | `{ep}` | 200 OK | `{st}` | {dur:.1f}ms | {mark} | `{clean_out}` |")

    md_lines.extend([
        "",
        "## Endpoint Detailed Responses",
        "",
        "### 1. Contradiction Scan",
        "```json",
        sanitize(json.dumps(data1, indent=2) if isinstance(data1, (dict, list)) else str(data1)),
        "```",
        "",
        "### 2. Clarifying Questions Generation",
        "```json",
        sanitize(json.dumps(data2, indent=2) if isinstance(data2, (dict, list)) else str(data2)),
        "```",
        "",
        "### 3. Submit Clarifying Answers",
        "```json",
        sanitize(json.dumps(data3, indent=2) if isinstance(data3, (dict, list)) else str(data3)),
        "```",
        "",
        "### 4. Lightweight Draft Preview",
        "```json",
        sanitize(json.dumps(data4, indent=2) if isinstance(data4, (dict, list)) else str(data4)),
        "```",
        ""
    ])

    with open(report_file, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(f"\n[SUCCESS] Verification report saved to: {report_file}\n")

if __name__ == "__main__":
    main()
