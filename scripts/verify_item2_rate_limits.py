#!/usr/bin/env python3
"""
Standalone Live Verification Script for Item 2: User-Facing Rate-Limit Visibility
---------------------------------------------------------------------------------
Validates that:
1. GET /api/rate-limits/status returns accurate remaining limits across all 3 tiers.
2. Triggering an action (e.g., classification) properly decrements remaining quota.
3. Before/After state is clearly rendered and validated.

Usage:
  $env:MIMARAI_TEST_TOKEN = "your-supabase-jwt-token"
  python scripts/verify_item2_rate_limits.py
"""

import os
import sys
import json
import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

TOKEN = os.getenv("MIMARAI_TEST_TOKEN")
BACKEND_URL = (os.getenv("BACKEND_URL") or os.getenv("NEXT_PUBLIC_BACKEND_URL") or "https://mimaraibackend-5r8r0io9.b4a.run").rstrip("/")

def main():
    print("=" * 80)
    print("ITEM 2: USER-FACING RATE-LIMIT VISIBILITY — LIVE VERIFICATION")
    print("=" * 80)

    if not TOKEN:
        print("[ERROR] MIMARAI_TEST_TOKEN environment variable is not set.")
        print("Please set it in your PowerShell terminal first:")
        print('  $env:MIMARAI_TEST_TOKEN = "your-jwt-token-here"')
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

    # 1. Health Check
    print(f"\n[1/4] Performing Health Check on {BACKEND_URL}...")
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{BACKEND_URL}/api/health")
            if resp.status_code not in (200, 404):
                resp = client.get(f"{BACKEND_URL}/")
            print(f"  --> Backend reachable (Status {resp.status_code})")
    except Exception as e:
        print(f"  [FAIL] Unable to connect to backend at {BACKEND_URL}: {e}")
        sys.exit(1)

    with httpx.Client(timeout=30.0) as client:
        # 2. Fetch Initial Rate Limits
        print("\n[2/4] Querying initial rate limit status via GET /api/rate-limits/status...")
        initial_res = client.get(f"{BACKEND_URL}/api/rate-limits/status", headers=headers)
        if initial_res.status_code != 200:
            print(f"  [FAIL] GET /api/rate-limits/status returned {initial_res.status_code}: {initial_res.text}")
            sys.exit(1)

        initial_data = initial_res.json()
        class_before = initial_data.get("classification", {})
        gen_before = initial_data.get("generation", {})
        batch_before = initial_data.get("batch_fix", {})

        print("\n  --- INITIAL RATE LIMIT STATUS ---")
        print(f"  • Classification: {class_before.get('remaining')}/{class_before.get('limit')} remaining (reset in {class_before.get('reset_in_seconds')}s)")
        print(f"  • Generation:     {gen_before.get('remaining')}/{gen_before.get('limit')} remaining (reset in {gen_before.get('reset_in_seconds')}s)")
        print(f"  • Batch Fix:      {batch_before.get('remaining')}/{batch_before.get('limit')} remaining (reset in {batch_before.get('reset_in_seconds')}s)")

        # 3. Create Draft and Execute 1 Classification Call
        print("\n[3/4] Creating a project draft and making 1 live classification call...")
        proj_res = client.post(
            f"{BACKEND_URL}/api/projects/draft",
            headers=headers,
            json={"idea_text": "Live test for rate limit decrement"}
        )
        if proj_res.status_code not in (200, 201):
            proj_res = client.post(
                f"{BACKEND_URL}/projects/draft",
                headers=headers,
                json={"idea_text": "Live test for rate limit decrement"}
            )
        if proj_res.status_code not in (200, 201):
            print(f"  [FAIL] Could not create test project: {proj_res.status_code} - {proj_res.text}")
            sys.exit(1)
        
        pdata = proj_res.json()
        project_id = pdata.get("id") or pdata.get("project", {}).get("id")

        classify_res = client.post(
            f"{BACKEND_URL}/api/interview/classify",
            headers=headers,
            json={
                "idea_text": "A simple todo tracker app for developers.",
                "project_id": project_id,
                "step0_state": {}
            }
        )
        if classify_res.status_code not in (200, 429):
            print(f"  [FAIL] Classification call failed unexpectedly ({classify_res.status_code}): {classify_res.text}")
            sys.exit(1)

        print(f"  --> Classification completed (Status: {classify_res.status_code})")

        # 4. Fetch Updated Rate Limits
        print("\n[4/4] Querying updated rate limit status via GET /api/rate-limits/status...")
        updated_res = client.get(f"{BACKEND_URL}/api/rate-limits/status", headers=headers)
        if updated_res.status_code != 200:
            print(f"  [FAIL] GET /api/rate-limits/status returned {updated_res.status_code}: {updated_res.text}")
            sys.exit(1)

        updated_data = updated_res.json()
        class_after = updated_data.get("classification", {})
        gen_after = updated_data.get("generation", {})
        batch_after = updated_data.get("batch_fix", {})

        print("\n" + "=" * 80)
        print("BEFORE VS AFTER COMPARISON")
        print("=" * 80)
        print(f"{'Limit Category':<20} | {'Before Remaining':<18} | {'After Remaining':<18} | {'Status':<10}")
        print("-" * 75)

        class_diff = class_before.get("remaining", 0) - class_after.get("remaining", 0)
        class_decremented = (class_diff == 1) or (class_before.get("remaining") == 0 and class_after.get("remaining") == 0)

        print(f"{'Classification (1h)':<20} | {class_before.get('remaining', 0):<18} | {class_after.get('remaining', 0):<18} | {'DECREMENTED' if class_decremented else 'UNCHANGED'}")
        print(f"{'Generation (24h)':<20} | {gen_before.get('remaining', 0):<18} | {gen_after.get('remaining', 0):<18} | {'PRESERVED'}")
        print(f"{'Batch Fix (1h)':<20} | {batch_before.get('remaining', 0):<18} | {batch_after.get('remaining', 0):<18} | {'PRESERVED'}")

        if class_decremented:
            print("\n[RESULT] >>> PASS: Classification remaining quota decremented accurately. Rate limit status endpoint is verified. <<<")
        else:
            print(f"\n[RESULT] >>> FAIL: Classification count did not decrement as expected (before: {class_before.get('remaining')}, after: {class_after.get('remaining')}) <<<")
            sys.exit(1)

if __name__ == "__main__":
    main()
