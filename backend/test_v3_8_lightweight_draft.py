import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from backend import main
from backend.main import (
    app,
    assemble_effective_idea_context,
)


class TestLightweightConfirmDraft(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.auth_headers = {"Authorization": "Bearer mock-test-token"}
        self.mock_user = {"user_id": "test-user-123", "email": "test@mimarai.com", "token": "mock-test-token"}
        self.mock_project_id = "22222222-2222-4222-8222-222222222222"

    # =========================================================================
    # 1. UNIT TESTS FOR assemble_effective_idea_context EXTENSION
    # =========================================================================
    def test_assemble_context_with_draft_dict_attempts(self):
        """Lightweight draft corrections from attempts array are folded into context"""
        base_idea = "A telemedicine consultation app."
        draft_data = {
            "attempts": [
                {
                    "attempt": 1,
                    "draft_features": ["Video calling", "Chat"],
                    "user_response": "rejected",
                    "correction_text": "Must include e-prescriptions and doctor scheduling."
                }
            ]
        }
        res = assemble_effective_idea_context(base_idea, lightweight_draft_data=draft_data)
        self.assertIn("A telemedicine consultation app.", res)
        self.assertIn("Clarifications on draft features: Must include e-prescriptions and doctor scheduling.", res)

    def test_assemble_context_with_draft_dict_direct_correction(self):
        """Lightweight draft correction provided as direct correction_text key"""
        base_idea = "A warehouse stock manager."
        draft_data = {"correction_text": "Need barcode scanning for inventory check-in."}
        res = assemble_effective_idea_context(base_idea, lightweight_draft_data=draft_data)
        self.assertIn("Clarifications on draft features: Need barcode scanning for inventory check-in.", res)

    def test_assemble_context_with_draft_list_or_str(self):
        """Lightweight draft corrections provided as list of strings or single string"""
        base_idea = "A music collaboration platform."
        res1 = assemble_effective_idea_context(base_idea, lightweight_draft_data=["Real-time MIDI sync", "Stem exporter"])
        self.assertIn("Clarifications on draft features: Real-time MIDI sync; Stem exporter.", res1)

        res2 = assemble_effective_idea_context(base_idea, lightweight_draft_data="Cloud backup for project files")
        self.assertIn("Clarifications on draft features: Cloud backup for project files.", res2)

    def test_assemble_context_full_canonical_pipeline(self):
        """All context sections assemble in canonical order including lightweight draft corrections"""
        base_idea = "An emergency dispatch dispatcher."
        contradiction_data = {
            "explanation": "Conflict between local-only and cloud dispatch",
            "resolved_answer": "Local offline buffer syncing to cloud on reconnect"
        }
        clarifying_qa = [{"question": "Who assigns units?", "answer": "Lead dispatcher only."}]
        personas_data = {"answer": "Dispatchers assign units, drivers navigate, supervisors monitor."}
        nfrs_data = {"scale": "thousands_plus", "data_sensitivity": "sensitive", "availability": "mission_critical"}
        draft_data = {
            "attempts": [
                {"attempt": 1, "correction_text": "Include GPS live tracking and automatic route recalculation."}
            ]
        }
        res = assemble_effective_idea_context(
            base_idea_text=base_idea,
            contradiction_data=contradiction_data,
            clarifying_qa=clarifying_qa,
            personas_data=personas_data,
            nfrs_data=nfrs_data,
            lightweight_draft_data=draft_data
        )

        expected_order = [
            "An emergency dispatch dispatcher.",
            "Regarding an earlier ambiguity (Conflict between local-only and cloud dispatch): the user clarified that Local offline buffer syncing to cloud on reconnect.",
            "Additional detail provided: Q: 'Who assigns units?' A: 'Lead dispatcher only.'",
            "User types: Dispatchers assign units, drivers navigate, supervisors monitor.",
            "Non-functional requirements: expected scale is thousands_plus, data sensitivity is sensitive, availability requirement is mission_critical.",
            "Clarifications on draft features: Include GPS live tracking and automatic route recalculation."
        ]
        for section in expected_order:
            self.assertIn(section, res)

    # =========================================================================
    # 2. UNIT TESTS FOR /lightweight-draft GENERATION ENDPOINT
    # =========================================================================
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    @patch.object(main, "call_gemini_api")
    async def test_generate_draft_single_model_only(
        self, mock_gemini, mock_groq, mock_get_owned, mock_supabase, mock_user
    ):
        """Verifies strictly single-model call: Groq called once, Gemini NOT called at all"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "idea_text": "An appointment booking system for barbers.",
            "step0_state": {},
            "lightweight_draft": None
        }
        mock_get_owned.return_value = mock_project
        mock_groq.return_value = {
            "draft_features": [
                "Customer online booking calendar",
                "Barber schedule and availability management",
                "SMS appointment reminders"
            ]
        }

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft",
            headers=self.auth_headers,
            json={"attempt": 1}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["attempt"], 1)
        self.assertEqual(len(data["draft_features"]), 3)
        self.assertIn("Customer online booking calendar", data["draft_features"])

        # Hard constraint verification: Groq called, Gemini NEVER called
        self.assertEqual(mock_groq.call_count, 1)
        mock_gemini.assert_not_called()

        # Check DB update was called to persist attempt
        mock_client.table("projects").update.assert_called_once()

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_generate_draft_attempt_2_with_correction(
        self, mock_groq, mock_get_owned, mock_supabase, mock_user
    ):
        """Attempt 2 folds in correction_text into effective idea context"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "idea_text": "A vehicle maintenance log.",
            "step0_state": {},
            "lightweight_draft": {
                "attempts": [
                    {
                        "attempt": 1,
                        "draft_features": ["Log oil changes", "Log tire rotation"],
                        "user_response": "rejected",
                        "correction_text": "Include fleet mileage tracking",
                        "created_at": "2026-09-17T00:00:00Z"
                    }
                ]
            }
        }
        mock_get_owned.return_value = mock_project
        mock_groq.return_value = {
            "draft_features": [
                "Log oil changes and maintenance schedules",
                "Fleet mileage and fuel consumption tracker",
                "Automated service alerts"
            ]
        }

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft",
            headers=self.auth_headers,
            json={"attempt": 2, "correction_text": "Include fleet mileage tracking"}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["attempt"], 2)
        self.assertEqual(len(data["draft_features"]), 3)

        # Verify Groq prompt received the correction context
        call_args = mock_groq.call_args[0]
        user_prompt_passed = call_args[1]
        self.assertIn("Include fleet mileage tracking", user_prompt_passed)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json")
    async def test_generate_draft_fail_closed_on_error(
        self, mock_groq, mock_get_owned, mock_supabase, mock_user
    ):
        """Fail-closed: provider failure raises 502 with clear user-facing error message"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "idea_text": "A recipe sharing app."}
        mock_get_owned.return_value = mock_project
        mock_groq.side_effect = Exception("Groq provider timeout")

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft",
            headers=self.auth_headers,
            json={"attempt": 1}
        )
        self.assertEqual(response.status_code, 502)
        err_msg = response.json().get("detail") or response.json().get("message", "")
        self.assertIn("Lightweight draft generation service unavailable", err_msg)


    # =========================================================================
    # 3. UNIT TESTS FOR /lightweight-draft/respond ENDPOINT
    # =========================================================================
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_respond_confirmed_path(self, mock_get_owned, mock_supabase, mock_user):
        """User confirms draft attempt 1 -> marks final_status confirmed and proceed_to_generation true"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "lightweight_draft": {
                "attempts": [
                    {
                        "attempt": 1,
                        "draft_features": ["Feature A", "Feature B"],
                        "user_response": None,
                        "correction_text": None,
                        "created_at": "2026-09-17T00:00:00Z"
                    }
                ],
                "final_status": None,
                "lightweight_draft_flagged": False
            }
        }
        mock_get_owned.return_value = mock_project

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft/respond",
            headers=self.auth_headers,
            json={"response": "confirmed", "attempt": 1}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "confirmed")
        self.assertTrue(data["proceed_to_generation"])
        self.assertFalse(data["lightweight_draft_flagged"])

        # Check DB update payload
        update_call = mock_client.table("projects").update.call_args[0][0]
        saved_draft = update_call["lightweight_draft"]
        self.assertEqual(saved_draft["final_status"], "confirmed")
        self.assertFalse(saved_draft["lightweight_draft_flagged"])
        self.assertEqual(saved_draft["attempts"][0]["user_response"], "confirmed")

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_respond_rejected_attempt_1_retries(self, mock_get_owned, mock_supabase, mock_user):
        """User rejects attempt 1 with correction -> returns status retry and signals attempt 2"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "lightweight_draft": {
                "attempts": [
                    {
                        "attempt": 1,
                        "draft_features": ["Feature A", "Feature B"],
                        "user_response": None,
                        "correction_text": None,
                        "created_at": "2026-09-17T00:00:00Z"
                    }
                ],
                "final_status": None,
                "lightweight_draft_flagged": False
            }
        }
        mock_get_owned.return_value = mock_project

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft/respond",
            headers=self.auth_headers,
            json={"response": "rejected", "attempt": 1, "correction_text": "Add multi-tenant support"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "retry")
        self.assertEqual(data["attempt"], 1)
        self.assertFalse(data["proceed_to_generation"])

        # Check DB update payload
        update_call = mock_client.table("projects").update.call_args[0][0]
        saved_draft = update_call["lightweight_draft"]
        self.assertEqual(saved_draft["attempts"][0]["user_response"], "rejected")
        self.assertEqual(saved_draft["attempts"][0]["correction_text"], "Add multi-tenant support")

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_respond_rejected_attempt_2_cap_reached_and_flagged(
        self, mock_get_owned, mock_supabase, mock_user
    ):
        """User rejects attempt 2 (cap reached) -> sets final_status proceeded_after_cap and lightweight_draft_flagged: true"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "lightweight_draft": {
                "attempts": [
                    {
                        "attempt": 1,
                        "draft_features": ["Feature A"],
                        "user_response": "rejected",
                        "correction_text": "Correction 1",
                        "created_at": "2026-09-17T00:00:00Z"
                    },
                    {
                        "attempt": 2,
                        "draft_features": ["Feature A", "Feature B"],
                        "user_response": None,
                        "correction_text": None,
                        "created_at": "2026-09-17T00:01:00Z"
                    }
                ],
                "final_status": None,
                "lightweight_draft_flagged": False
            }
        }
        mock_get_owned.return_value = mock_project

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft/respond",
            headers=self.auth_headers,
            json={"response": "rejected", "attempt": 2, "correction_text": "Still missing analytics"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "proceeded_after_cap")
        self.assertEqual(data["attempt"], 2)
        self.assertTrue(data["proceed_to_generation"])
        self.assertTrue(data["lightweight_draft_flagged"])

        # Check DB update payload has flagged: true and proceeded_after_cap
        update_call = mock_client.table("projects").update.call_args[0][0]
        saved_draft = update_call["lightweight_draft"]
        self.assertEqual(saved_draft["final_status"], "proceeded_after_cap")
        self.assertTrue(saved_draft["lightweight_draft_flagged"])
        self.assertEqual(saved_draft["attempts"][1]["user_response"], "rejected")
        self.assertEqual(saved_draft["attempts"][1]["correction_text"], "Still missing analytics")

    # =========================================================================
    # 4. UNIT TEST FOR EXPLICIT ATTEMPT MATCHING
    # =========================================================================
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_respond_explicit_attempt_id_matching(self, mock_get_owned, mock_supabase, mock_user):
        """Matches target attempt by explicit attempt number, not just array order"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "lightweight_draft": {
                "attempts": [
                    {"attempt": 1, "user_response": None, "correction_text": None},
                    {"attempt": 2, "user_response": None, "correction_text": None}
                ]
            }
        }
        mock_get_owned.return_value = mock_project

        # Explicitly update attempt 1
        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/lightweight-draft/respond",
            headers=self.auth_headers,
            json={"response": "confirmed", "attempt": 1}
        )
        self.assertEqual(response.status_code, 200)
        update_call = mock_client.table("projects").update.call_args[0][0]
        saved_draft = update_call["lightweight_draft"]
        self.assertEqual(saved_draft["attempts"][0]["user_response"], "confirmed")
        self.assertIsNone(saved_draft["attempts"][1]["user_response"])


if __name__ == "__main__":
    unittest.main()
