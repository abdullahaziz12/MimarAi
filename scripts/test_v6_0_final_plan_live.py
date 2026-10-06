#!/usr/bin/env python3
"""
==============================================================================
MimarAI V6.0 — Final Plan Consolidation Live Verification Script
==============================================================================

This script executes the complete live testing workflow for V6.0 Final Plan
Consolidation against the backend, testing all 5 decoupled endpoints,
prerequisite gate, lock-blocking rules, quality validation, and re-open.

USAGE (run by project owner):
    $env:MIMARAI_TEST_TOKEN="<your-supabase-jwt>"
    $env:MIMARAI_BACKEND_URL="https://mimaraibackend-6n4ojd1m.b4a.run"
    # Optional: $env:MIMARAI_TEST_PROJECT_ID="<existing-project-id>"
    python scripts/test_v6_0_final_plan_live.py

SECURITY NOTE:
    Token is read ONLY from $env:MIMARAI_TEST_TOKEN.
    Token is NEVER printed, logged, or saved to report artifacts.
==============================================================================
"""

import os
import sys
import json
import time
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional, List

REPORT_PATH = os.path.join(os.path.dirname(__file__), "..", "Requirements", "V6.0_Testing_Result.md")
DEFAULT_BACKEND_URL = "https://mimaraibackend-6n4ojd1m.b4a.run"


class V6LiveTestRunner:
    def __init__(self):
        self.backend_url = os.getenv("MIMARAI_BACKEND_URL", DEFAULT_BACKEND_URL).rstrip("/")
        self.token = os.getenv("MIMARAI_TEST_TOKEN", "").strip()
        self.preconfigured_project_id = os.getenv("MIMARAI_TEST_PROJECT_ID", "").strip()
        self.results: List[Dict[str, Any]] = []
        self.project_id: Optional[str] = None
        self.start_time = datetime.now(timezone.utc)

    def validate_environment(self):
        if not self.token:
            print("\n[ERROR] Missing required environment variable: MIMARAI_TEST_TOKEN")
            print("Please set your Supabase JWT in PowerShell before running:")
            print('    $env:MIMARAI_TEST_TOKEN = "<your_token>"\n')
            sys.exit(1)
        print(f"[*] Target Backend: {self.backend_url}")
        print("[*] Authentication token detected (redacted for security).")
        if self.preconfigured_project_id:
            print(f"[*] Using preconfigured project ID: {self.preconfigured_project_id}")
        print("[*] Starting V6.0 Final Plan Consolidation live test suite...\n")

    def _http_request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        timeout: float = 45.0
    ) -> Tuple[int, Dict[str, Any], float]:
        url = f"{self.backend_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        data_bytes = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)

        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                latency = time.time() - t0
                body = response.read().decode("utf-8")
                try:
                    return response.status, json.loads(body), latency
                except json.JSONDecodeError:
                    return response.status, {"raw_text": body}, latency
        except urllib.error.HTTPError as e:
            latency = time.time() - t0
            body = e.read().decode("utf-8")
            try:
                return e.code, json.loads(body), latency
            except json.JSONDecodeError:
                return e.code, {"raw_text": body, "error": str(e)}, latency
        except Exception as e:
            latency = time.time() - t0
            return 500, {"error": str(e)}, latency

    def run_suite(self):
        self.validate_environment()

        # Step 1: Health Check
        print("--> [1/8] Verifying backend health & AI provider status...")
        status, health, lat = self._http_request("GET", "/health")
        print(f"    Health Status: {status} ({lat:.2f}s)")
        self.results.append({"step": "Health Check", "status": status, "data": health, "latency": lat})

        # Step 2: Ensure or Create Project
        if self.preconfigured_project_id:
            self.project_id = self.preconfigured_project_id
            print(f"--> [2/8] Using preconfigured project ID: {self.project_id}")
        else:
            print("--> [2/8] Creating test project...")
            proj_name = f"V6 Live Plan Test {int(time.time())}"
            status, proj_data, lat = self._http_request("POST", "/projects", {
                "name": proj_name,
                "idea_text": "An enterprise telemedicine platform with end-to-end encrypted video appointments, e-prescriptions, Stripe billing, and HIPAA audit logging."
            })
            if status not in (200, 201) or not proj_data.get("id"):
                print(f"    [!] Failed to create project: {status} {proj_data}")
                sys.exit(1)
            self.project_id = proj_data["id"]
            print(f"    Project Created: {self.project_id}")

        # Step 3: Test Prerequisite Gate (Expect 409 before acceptance)
        print("--> [3/8] Testing Prerequisite Gate (Expect 409 Fail-Closed)...")
        status, gate_res, lat = self._http_request("POST", f"/projects/{self.project_id}/final-plan/generate")
        print(f"    Gate Status: {status} (Expected 409 if unaccepted)")
        self.results.append({"step": "Prerequisite Gate (409)", "status": status, "data": gate_res, "latency": lat})

        # Step 4: POST /final-plan/generate
        print("--> [4/8] Generating Final Plan Draft (Step 1 Consolidation + Step 2 Dual AI Draft)...")
        status, gen_res, lat = self._http_request("POST", f"/projects/{self.project_id}/final-plan/generate", timeout=45.0)
        print(f"    Generate Status: {status} ({lat:.2f}s)")
        self.results.append({"step": "POST /final-plan/generate", "status": status, "data": gen_res, "latency": lat})

        # Step 5: POST /final-plan/validate
        print("--> [5/8] Validating Final Plan Quality & Running Fix-Pass...")
        status, val_res, lat = self._http_request("POST", f"/projects/{self.project_id}/final-plan/validate", timeout=45.0)
        print(f"    Validate Status: {status} ({lat:.2f}s)")
        self.results.append({"step": "POST /final-plan/validate", "status": status, "data": val_res, "latency": lat})

        # Step 6: Lock Blocking Rules Evaluation (Expect 409s when blockers exist)
        print("--> [6/8] Testing Lock Blocking Rules...")
        status, lock_res, lat = self._http_request("POST", f"/projects/{self.project_id}/final-plan/lock")
        print(f"    Lock Status: {status} ({lat:.2f}s)")
        self.results.append({"step": "POST /final-plan/lock", "status": status, "data": lock_res, "latency": lat})

        # Step 7: POST /final-plan/reopen
        print("--> [7/8] Testing Plan Re-Open Endpoint...")
        status, reopen_res, lat = self._http_request("POST", f"/projects/{self.project_id}/final-plan/reopen", {
            "reason": "Live test verification of V6.0 plan re-open flow."
        })
        print(f"    Reopen Status: {status} ({lat:.2f}s)")
        self.results.append({"step": "POST /final-plan/reopen", "status": status, "data": reopen_res, "latency": lat})

        # Step 8: GET /final-plan/{project_id}
        print("--> [8/8] Testing GET Final Plan...")
        status, get_res, lat = self._http_request("GET", f"/projects/{self.project_id}/final-plan")
        print(f"    GET Status: {status} ({lat:.2f}s)")
        self.results.append({"step": "GET /final-plan", "status": status, "data": get_res, "latency": lat})

        print("\n[*] V6.0 Live Test Run Completed.")


if __name__ == "__main__":
    runner = V6LiveTestRunner()
    runner.run_suite()
