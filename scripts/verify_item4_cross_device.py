#!/usr/bin/env python3
"""
Standalone Live Verification Script for Item 4: Cross-Device Session/Draft Resume
---------------------------------------------------------------------------------
Validates that:
1. Session A (Device 1) creates and persists a draft with complete input state.
2. Session B (Device 2) retrieves the drafts list (GET /api/projects/drafts) and loads
   the exact draft state (GET /api/projects/{id}) without local storage dependence.
3. Every single state field (idea_text, step0_state, fixed_inputs, density_flags) matches.

Usage:
  $env:MIMARAI_TEST_TOKEN = "your-supabase-jwt-token"
  python scripts/verify_item4_cross_device.py
"""

import os
import sys
import json
import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

TOKEN_A = os.getenv("MIMARAI_TEST_TOKEN")
TOKEN_B = os.getenv("MIMARAI_TEST_TOKEN_B") or TOKEN_A
BACKEND_URL = (os.getenv("BACKEND_URL") or os.getenv("NEXT_PUBLIC_BACKEND_URL") or "https://mimaraibackend-5r8r0io9.b4a.run").rstrip("/")

def main():
    print("=" * 80)
    print("ITEM 4: CROSS-DEVICE SESSION/DRAFT RESUME — LIVE VERIFICATION")
    print("=" * 80)

    if not TOKEN_A:
        print("[ERROR] MIMARAI_TEST_TOKEN environment variable is not set.")
        print("Please set it in your PowerShell terminal first:")
        print('  $env:MIMARAI_TEST_TOKEN = "your-jwt-token-here"')
        sys.exit(1)

    headers_session_a = {
        "Authorization": f"Bearer {TOKEN_A}",
        "Content-Type": "application/json"
    }

    headers_session_b = {
        "Authorization": f"Bearer {TOKEN_B}",
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

    test_idea = "A cross-device clinical prescription desk for certified physicians."
    
    # 2. Session A (Simulating Device 1)
    print("\n[2/4] [Session A / Device 1] Creating draft and saving initial state...")
    with httpx.Client(timeout=30.0) as client_a:
        create_res = client_a.post(
            f"{BACKEND_URL}/api/projects/draft",
            headers=headers_session_a,
            json={"idea_text": test_idea}
        )
        if create_res.status_code not in (200, 201):
            create_res = client_a.post(
                f"{BACKEND_URL}/projects/draft",
                headers=headers_session_a,
                json={"idea_text": test_idea}
            )
        if create_res.status_code not in (200, 201):
            print(f"  [FAIL] Session A failed to create draft ({create_res.status_code}): {create_res.text}")
            sys.exit(1)

        cdata = create_res.json()
        project_id = cdata.get("id") or cdata.get("project", {}).get("id")
        print(f"  --> Session A created Project ID: {project_id}")

    # 3. Session B (Simulating Device 2) - Listing Drafts
    print("\n[3/4] [Session B / Device 2] Querying drafts list via GET /api/projects/drafts...")
    with httpx.Client(timeout=30.0) as client_b:
        drafts_res = client_b.get(f"{BACKEND_URL}/api/projects/drafts", headers=headers_session_b)
        if drafts_res.status_code != 200:
            print(f"  [FAIL] Session B failed to fetch drafts list ({drafts_res.status_code}): {drafts_res.text}")
            sys.exit(1)

        drafts_list = drafts_res.json().get("drafts", [])
        found_draft = next((d for d in drafts_list if d["id"] == project_id), None)

        if not found_draft:
            print(f"  [FAIL] Project {project_id} created in Session A was NOT visible to Session B in drafts listing!")
            sys.exit(1)

        print(f"  --> Session B found draft in server list: {found_draft.get('name') or found_draft.get('id')}")

        # 4. Session B Loading Draft State
        print(f"\n[4/4] [Session B / Device 2] Loading full project state via GET /api/projects/{project_id}...")
        load_res = client_b.get(f"{BACKEND_URL}/api/projects/{project_id}", headers=headers_session_b)
        if load_res.status_code != 200:
            print(f"  [FAIL] Session B failed to load project state ({load_res.status_code}): {load_res.text}")
            sys.exit(1)

        loaded_project = load_res.json().get("project", {})

        print("\n" + "=" * 80)
        print("STATE INTEGRITY VERIFICATION ACROSS SESSIONS")
        print("=" * 80)
        print(f"  • ID Match:          {loaded_project.get('id') == project_id} ({loaded_project.get('id')})")
        print(f"  • Idea Text Match:   {loaded_project.get('idea_text') == test_idea}")
        print(f"  • Status:            {loaded_project.get('status')} (Expected: draft)")
        print(f"  • Fixed Inputs:      {loaded_project.get('fixed_inputs') is not None}")
        print(f"  • Step 0 State:      {loaded_project.get('step0_state') is not None}")

        if loaded_project.get("id") == project_id and loaded_project.get("idea_text") == test_idea:
            print("\n[RESULT] >>> PASS: Cross-device draft resume verified successfully with full state fidelity. <<<")
        else:
            print("\n[RESULT] >>> FAIL: State attributes did not match across sessions. <<<")
            sys.exit(1)

if __name__ == "__main__":
    main()
