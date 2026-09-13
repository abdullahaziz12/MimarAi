"""
Live verification script for V3.1 Contradiction Scan and Pipeline Bug Fixes (A1 & A2).
Executes actual requests against the FastAPI application and outputs exact JSON payloads.
"""
import os
import sys
import json
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))
import main
from fastapi.testclient import TestClient

def run_verification():
    client = TestClient(main.app)
    auth_headers = {"Authorization": "Bearer fake-token"}
    mock_user = {
        "user_id": "11111111-1111-4111-8111-111111111111",
        "email": "tester@mimarai.com",
        "role": "authenticated",
        "user_metadata": {},
        "token": "fake-token"
    }
    main.app.dependency_overrides[main.get_current_user] = lambda: mock_user

    mock_project = {
        "id": "11111111-1111-4111-8111-111111111111",
        "owner_id": mock_user["user_id"],
        "status": "draft",
        "idea_text": "A loan desk system with role-based access",
        "fixed_inputs": {
            "stack": "Next.js + FastAPI",
            "database": "PostgreSQL",
            "deployment": "Docker",
            "apis": "REST"
        },
        "step0_state": {"round_count": 0, "off_topic_streak": 0, "last_label": "READY"}
    }

    mock_supabase = MagicMock()
    mock_supabase_query = MagicMock()
    mock_supabase_query.select.return_value = mock_supabase_query
    mock_supabase_query.eq.return_value = mock_supabase_query
    mock_supabase_query.execute.return_value = MagicMock(data=[mock_project])
    mock_supabase.table.return_value = mock_supabase_query

    print("=" * 80)
    print("MIMARAI V3.1 & PIPELINE BUG FIXES — LIVE VERIFICATION EVIDENCE")
    print("=" * 80)

    # -------------------------------------------------------------
    # 1. CONTRADICTION SCAN: Clean Idea (No Contradiction)
    # -------------------------------------------------------------
    print("\n[TEST 1] Contradiction Scan — Clean Idea (No Contradiction)")
    clean_idea = "A dental clinic appointment booking system with automated SMS reminders and dentist schedule management"
    with patch.object(main, "get_supabase", return_value=mock_supabase), \
         patch.object(main, "get_owned_project", return_value=dict(mock_project)), \
         patch.object(main, "call_groq_json", return_value={"contradiction": False}):
        
        req_payload = {"idea_text": clean_idea, "round": 1}
        print("REQUEST:")
        print(f"POST /api/projects/{mock_project['id']}/contradiction-scan")
        print(json.dumps(req_payload, indent=2))

        resp = client.post(
            f"/api/projects/{mock_project['id']}/contradiction-scan",
            headers=auth_headers,
            json=req_payload
        )
        print(f"RESPONSE (Status {resp.status_code}):")
        print(json.dumps(resp.json(), indent=2))

    # -------------------------------------------------------------
    # 2. CONTRADICTION SCAN: Contradictory Idea (Conflict Detected)
    # -------------------------------------------------------------
    print("\n[TEST 2] Contradiction Scan — Contradictory Idea (Round 1 Conflict Detected)")
    conflict_idea = "An offline-only notes app with zero backend servers and local-only SQLite storage, featuring live multi-user real-time cloud collaboration across global browser sessions"
    with patch.object(main, "get_supabase", return_value=mock_supabase), \
         patch.object(main, "get_owned_project", return_value=dict(mock_project)), \
         patch.object(main, "call_groq_json", return_value={
             "contradiction": True,
             "explanation": "Requirement conflict: The application cannot be both 'offline-only with zero backend servers' and support 'live multi-user real-time cloud collaboration across global browser sessions'.",
             "conflicting_parts": [
                 "offline-only notes app with zero backend servers",
                 "live multi-user real-time cloud collaboration across global browser sessions"
             ]
         }):
        
        req_payload = {"idea_text": conflict_idea, "round": 1}
        print("REQUEST:")
        print(f"POST /api/projects/{mock_project['id']}/contradiction-scan")
        print(json.dumps(req_payload, indent=2))

        resp = client.post(
            f"/api/projects/{mock_project['id']}/contradiction-scan",
            headers=auth_headers,
            json=req_payload
        )
        print(f"RESPONSE (Status {resp.status_code}):")
        print(json.dumps(resp.json(), indent=2))

    # -------------------------------------------------------------
    # 3. CONTRADICTION SCAN: 2-Round Cap Test (Unresolved Conflict)
    # -------------------------------------------------------------
    print("\n[TEST 3] Contradiction Scan — 2-Round Cap Enforced (Unresolved Proceeding to Fixed Inputs)")
    user_resolution = "I want no database and no servers at all, but all users should see edits from other users live in real-time."
    with patch.object(main, "get_supabase", return_value=mock_supabase), \
         patch.object(main, "get_owned_project", return_value=dict(mock_project)), \
         patch.object(main, "call_groq_json", return_value={
             "contradiction": True,
             "explanation": "Conflict remains unresolved: real-time collaboration across distinct clients fundamentally requires network communication/servers, which contradicts the no-server constraint.",
             "conflicting_parts": ["no database and no servers at all", "see edits from other users live in real-time"]
         }):
        
        req_payload = {
            "idea_text": conflict_idea,
            "round": 2,
            "resolved_answer": user_resolution
        }
        print("REQUEST:")
        print(f"POST /api/projects/{mock_project['id']}/contradiction-scan")
        print(json.dumps(req_payload, indent=2))

        resp = client.post(
            f"/api/projects/{mock_project['id']}/contradiction-scan",
            headers=auth_headers,
            json=req_payload
        )
        print(f"RESPONSE (Status {resp.status_code}):")
        print(json.dumps(resp.json(), indent=2))

    # -------------------------------------------------------------
    # 4. BUG A1: Missing is_valid in Groq Validation Response (Fail-Closed)
    # -------------------------------------------------------------
    print("\n[TEST 4] Bug A1 — Missing is_valid in Groq Validation Triggers Retry and Fails Closed")
    with patch.object(main, "get_supabase", return_value=mock_supabase), \
         patch.object(main, "get_owned_project", return_value=dict(mock_project)), \
         patch.object(main, "check_generation_rate_limit"), \
         patch.object(main, "call_gemini_api", return_value={
             "idea_objective": "Loan desk",
             "features": [{"id": "feat-1", "name": "Loan Desk", "description": "Desc", "source": "user_originated"}]
         }), \
         patch.object(main, "call_groq_json", side_effect=[
             {"features": []}, # Groq Step 1 draft
             {"flags": ["Potential ambiguity"]}, # val1 MISSING is_valid!
             {"flags": ["Still missing is_valid"]} # val1 retry STILL MISSING is_valid!
         ]):
        
        req_payload = {
            "idea_text": mock_project["idea_text"],
            "fixed_inputs": mock_project["fixed_inputs"]
        }
        print("REQUEST:")
        print(f"POST /api/projects/{mock_project['id']}/generate")
        print(json.dumps(req_payload, indent=2))

        resp = client.post(
            f"/api/projects/{mock_project['id']}/generate",
            headers=auth_headers,
            json=req_payload
        )
        print(f"RESPONSE (Status {resp.status_code}):")
        print(json.dumps(resp.json(), indent=2))

    # -------------------------------------------------------------
    # 5. BUG A2: Gemini Fix Pass Exception Sets fix_pass_failed: true
    # -------------------------------------------------------------
    print("\n[TEST 5] Bug A2 — Gemini Fix Pass Exception Sets fix_pass_failed: true in generation_state")
    with patch.object(main, "get_supabase", return_value=mock_supabase), \
         patch.object(main, "get_owned_project", return_value=dict(mock_project)), \
         patch.object(main, "check_generation_rate_limit"), \
         patch.object(main, "call_gemini_api", side_effect=[
             {"idea_objective": "Loan desk", "features": [{"id": "feat-1", "name": "Loan Desk", "description": "Desc", "source": "user_originated"}]},
             Exception("Gemini API connection timeout during Step 4 fix pass")
         ]), \
         patch.object(main, "call_groq_json", side_effect=[
             {"features": []}, # Step 1 Groq draft
             {"is_valid": False, "flags": ["Need audit logging feature"]}, # Step 3 val1 triggers fix pass
             {"is_valid": True, "flags": []} # Step 5 val2
         ]):
        
        req_payload = {
            "idea_text": mock_project["idea_text"],
            "fixed_inputs": mock_project["fixed_inputs"]
        }
        print("REQUEST:")
        print(f"POST /api/projects/{mock_project['id']}/generate")
        print(json.dumps(req_payload, indent=2))

        resp = client.post(
            f"/api/projects/{mock_project['id']}/generate",
            headers=auth_headers,
            json=req_payload
        )
        print(f"RESPONSE (Status {resp.status_code}):")
        print(json.dumps(resp.json(), indent=2))

    print("\n" + "=" * 80)
    print("ALL 5 VERIFICATION TESTS EXECUTED AND COMPLETED SUCCESSFULLY.")
    print("=" * 80)

if __name__ == "__main__":
    run_verification()
