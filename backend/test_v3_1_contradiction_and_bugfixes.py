import os
import sys
import unittest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))
import main
from fastapi.testclient import TestClient
from fastapi import HTTPException

class TestBugFixesAndContradictionScan(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.auth_headers = {"Authorization": "Bearer fake-token"}
        self.mock_user = {
            "user_id": "11111111-1111-4111-8111-111111111111",
            "email": "user@example.com",
            "role": "authenticated",
            "user_metadata": {},
            "token": "fake-token"
        }
        main.app.dependency_overrides[main.get_current_user] = lambda: self.mock_user

        self.mock_project = {
            "id": "11111111-1111-4111-8111-111111111111",
            "owner_id": self.mock_user["user_id"],
            "status": "draft",
            "idea_text": "A loan management system with role-based access",
            "fixed_inputs": {
                "stack": "Next.js + FastAPI",
                "database": "PostgreSQL",
                "deployment": "Docker",
                "apis": "REST"
            },
            "step0_state": {"round_count": 0, "off_topic_streak": 0, "last_label": "READY"}
        }

    def tearDown(self):
        main.app.dependency_overrides.clear()

    # --- BUG A1 TESTS ---
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    async def test_bug_a1_missing_is_valid_triggers_retry_and_fails_closed(
        self, mock_groq, mock_gemini, mock_rate_limit, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        # Step 1 drafts
        mock_gemini.return_value = {
            "idea_objective": "A loan management app",
            "features": [{"id": "feat-1", "name": "Loan Desk", "description": "Desc", "source": "user_originated"}]
        }

        # Step 1 Groq draft, then Step 3 val1 missing is_valid, then Step 3 retry missing is_valid
        mock_groq.side_effect = [
            {"features": [{"name": "Auditing", "description": "Desc", "source": "ai_added"}]}, # Groq draft
            {"flags": ["Possible issue"]}, # val1 without is_valid key!
            {"flags": ["Still missing is_valid"]} # val1 retry still without is_valid key!
        ]

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/generate",
            headers=self.auth_headers,
            json={
                "idea_text": self.mock_project["idea_text"],
                "fixed_inputs": self.mock_project["fixed_inputs"]
            }
        )

        # Confirm 502 status code and error message confirming fail-closed behavior
        self.assertEqual(resp.status_code, 502)
        data = resp.json()
        self.assertEqual(data["status"], "error")
        self.assertEqual(data["error_type"], "provider_error")
        self.assertIn("could not be confirmed", data["message"])

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    async def test_bug_a1_missing_is_valid_recovers_on_retry(
        self, mock_groq, mock_gemini, mock_rate_limit, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        mock_gemini.return_value = {
            "idea_objective": "A loan management app",
            "features": [{
                "id": "feat-1",
                "name": "Loan Desk",
                "description": "Desk for loan officers to review applications.",
                "source": "user_originated",
                "business_rules": ["Review within 48 hours."],
                "data_touched": ["loan_applications"],
                "actor_role": ["loan_officer"],
                "acceptance_criteria": ["Loan officer can approve or reject application."],
                "exclusions": ["Does not handle wire disbursements."]
            }]
        }

        # Groq draft, val1 (missing is_valid), val1 retry (valid!), val2 (valid)
        mock_groq.side_effect = [
            {"features": []}, # Groq draft
            {"flags": []}, # val1 missing is_valid
            {"is_valid": True, "flags": []}, # val1 retry success
            {"is_valid": True, "flags": []}  # val2
        ]

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/generate",
            headers=self.auth_headers,
            json={
                "idea_text": self.mock_project["idea_text"],
                "fixed_inputs": self.mock_project["fixed_inputs"]
            }
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertFalse(data["generation_state"]["adjusted_flag"])
        self.assertFalse(data["generation_state"]["fix_pass_failed"])

    # --- BUG A2 TESTS ---
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    async def test_bug_a2_gemini_fix_pass_exception_sets_fix_pass_failed_flag(
        self, mock_groq, mock_gemini, mock_rate_limit, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        # Initial draft call succeeds
        draft_features = [{"id": "feat-1", "name": "Loan Desk", "description": "Desc", "source": "user_originated"}]
        
        # When Gemini is called 1st time (Step 1 draft), return draft.
        # When Gemini is called 2nd time (Step 4 fix pass), throw Exception!
        mock_gemini.side_effect = [
            {"idea_objective": "Loan desk", "features": draft_features},
            Exception("Gemini API connection timeout during fix pass")
        ]

        # Groq draft, then val1 (is_valid=False with flags to trigger fix pass), then val2 (is_valid=True)
        mock_groq.side_effect = [
            {"features": []},
            {"is_valid": False, "flags": ["Missing audit logs"]},
            {"is_valid": True, "flags": []}
        ]

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/generate",
            headers=self.auth_headers,
            json={
                "idea_text": self.mock_project["idea_text"],
                "fixed_inputs": self.mock_project["fixed_inputs"]
            }
        )

        # Pipeline still succeeds (resilient)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        gen_state = data["generation_state"]
        # fix_pass_failed is True
        self.assertTrue(gen_state["fix_pass_failed"])
        # adjusted_flag was set due to val1 flags
        self.assertTrue(gen_state["adjusted_flag"])
        # Features fell back to merged_features
        self.assertEqual(len(gen_state["features"]), 1)

    # --- V3.1 CONTRADICTION SCAN TESTS ---
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_contradiction_scan_clean_idea_returns_false(
        self, mock_groq, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        mock_groq.return_value = {"contradiction": False}

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/contradiction-scan",
            headers=self.auth_headers,
            json={
                "idea_text": "A personal expense tracker with receipt scanning and monthly summary charts",
                "round": 1
            }
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertFalse(data["contradiction"])
        self.assertIsNone(data["explanation"])
        self.assertEqual(data["round"], 1)
        self.assertFalse(data["contradiction_unresolved"])

        # Check DB insert was called on contradiction_checks
        mock_supabase_client.table.assert_any_call("contradiction_checks")

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_contradiction_scan_conflict_detected_round_1(
        self, mock_groq, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        mock_groq.return_value = {
            "contradiction": True,
            "explanation": "Requirement conflict between offline-only local storage and real-time live cloud collaboration.",
            "conflicting_parts": ["offline-only with no servers", "real-time multi-user live cloud collaboration"]
        }

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/contradiction-scan",
            headers=self.auth_headers,
            json={
                "idea_text": "An offline-only notes app with no servers, but with real-time multi-user live cloud collaboration across web clients",
                "round": 1
            }
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertTrue(data["contradiction"])
        self.assertIn("Requirement conflict", data["explanation"])
        self.assertEqual(len(data["conflicting_parts"]), 2)
        self.assertEqual(data["round"], 1)
        self.assertFalse(data["contradiction_unresolved"])

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_contradiction_scan_round_2_cap_sets_unresolved(
        self, mock_groq, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        mock_groq.return_value = {
            "contradiction": True,
            "explanation": "Unresolved conflict remaining after clarification.",
            "conflicting_parts": ["no accounts", "personalized cloud preferences"]
        }

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/contradiction-scan",
            headers=self.auth_headers,
            json={
                "idea_text": "An app with no user accounts, but personalized cloud sync preferences saved across all devices",
                "round": 2,
                "resolved_answer": "I still want zero login and zero accounts, but preferences must sync across everyone's devices."
            }
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertTrue(data["contradiction"])
        self.assertEqual(data["round"], 2)
        self.assertTrue(data["contradiction_unresolved"])

    @patch.object(main, "get_supabase")
    async def test_contradiction_scan_ownership_check(self, mock_supabase):
        mock_query = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [] # Project not owned by user
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value = mock_result
        mock_supabase_client = MagicMock()
        mock_supabase_client.table.return_value = mock_query
        mock_supabase.return_value = mock_supabase_client

        resp = self.client.post(
            "/api/projects/99999999-9999-4999-8999-999999999999/contradiction-scan",
            headers=self.auth_headers,
            json={"idea_text": "Valid idea description", "round": 1}
        )

        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertEqual(data["status"], "error")
        self.assertEqual(data["error_type"], "not_found")

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_contradiction_scan_fail_closed_on_persistent_error(
        self, mock_groq, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        # Return invalid shape twice (missing contradiction boolean)
        mock_groq.side_effect = [
            {"unexpected_key": 123},
            {"still_broken": True}
        ]

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/contradiction-scan",
            headers=self.auth_headers,
            json={"idea_text": "Valid idea description", "round": 1}
        )

        # Fails closed with 502, never defaults to contradiction: false
        self.assertEqual(resp.status_code, 502)
        data = resp.json()
        self.assertEqual(data["status"], "error")
        self.assertEqual(data["error_type"], "provider_error")

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_contradiction_scan_uses_service_role_for_contradiction_checks(
        self, mock_groq, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        user_client = MagicMock(name="user_client")
        service_client = MagicMock(name="service_client")

        def supabase_side_effect(token=None):
            if token:
                return user_client
            return service_client

        mock_supabase.side_effect = supabase_side_effect
        mock_groq.return_value = {"contradiction": False}

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/contradiction-scan",
            headers=self.auth_headers,
            json={
                "idea_text": "A personal finance tracking tool with visual budgeting",
                "round": 1
            }
        )

        self.assertEqual(resp.status_code, 200)
        # Service client must be used for contradiction_checks insert (bypasses RLS)
        service_client.table.assert_called_with("contradiction_checks")
        service_client.table("contradiction_checks").insert.assert_called_once()
        insert_payload = service_client.table("contradiction_checks").insert.call_args[0][0]
        self.assertEqual(insert_payload["project_id"], self.mock_project["id"])
        self.assertEqual(insert_payload["round"], 1)
        self.assertFalse(insert_payload["found"])

        # User client is used for project step0_state update (projects table has user RLS)
        user_client.table.assert_called_with("projects")
        user_client.table("projects").update.assert_called_once()

    @patch.object(main, "get_supabase")
    def test_fetch_contradiction_checks_records_uses_service_role(
        self, mock_supabase
    ):
        service_client = MagicMock(name="service_client")
        mock_supabase.return_value = service_client
        mock_res = MagicMock()
        mock_res.data = [{"id": "cc-1", "found": False}]
        service_client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_res

        records = main.fetch_contradiction_checks_records(project_id="test-proj-id")
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "cc-1")
        # Confirms get_supabase() called without token
        mock_supabase.assert_called_with()


