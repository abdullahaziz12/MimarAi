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
            "features": [{"id": "feat-1", "name": "Loan Desk", "description": "Desc", "source": "user_originated"}]
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
