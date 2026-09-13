import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from backend import main
from backend.main import app, assemble_effective_idea_context

class TestContextLossBugFix(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.auth_headers = {"Authorization": "Bearer mock-test-token"}
        self.mock_user = {"user_id": "test-user-123", "email": "test@mimarai.com", "token": "mock-test-token"}
        self.mock_project_id = "11111111-1111-4111-8111-111111111111"

    # --- UNIT TESTS FOR assemble_effective_idea_context ---
    def test_assemble_context_clean_idea(self):
        """Clean idea without contradiction or CQ returns base idea text"""
        base_idea = "A task management system for developers."
        res = assemble_effective_idea_context(base_idea)
        self.assertEqual(res, base_idea)

    def test_assemble_context_resolved_contradiction(self):
        """Contradiction resolution is cleanly appended with explanation and resolution"""
        base_idea = "A telemedicine consultation app."
        contradiction_data = {
            "explanation": "Stated offline clinic with online appointments",
            "resolved_answer": "In-person visits happen at physical clinics, but video calls are supported."
        }
        res = assemble_effective_idea_context(base_idea, contradiction_data=contradiction_data)
        self.assertIn("A telemedicine consultation app.", res)
        self.assertIn("Regarding an earlier ambiguity (Stated offline clinic with online appointments):", res)
        self.assertIn("the user clarified that In-person visits happen at physical clinics, but video calls are supported.", res)

    def test_assemble_context_unresolved_contradiction(self):
        """Unresolved contradiction note is appended when flagged"""
        base_idea = "A peer-to-peer cloud storage app."
        contradiction_data = {
            "explanation": "Requires centralized coordination while claiming pure P2P"
        }
        res = assemble_effective_idea_context(base_idea, contradiction_data=contradiction_data, contradiction_unresolved=True)
        self.assertIn("Note on unresolved ambiguity:", res)
        self.assertIn("Requires centralized coordination while claiming pure P2P", res)

    def test_assemble_context_clarifying_qa(self):
        """Clarifying questions and answers are appended as additional details"""
        base_idea = "An e-commerce marketplace for handmade rugs."
        clarifying_qa = [
            {"question": "How are international customs duties handled?", "answer": "Calculated at checkout via Stripe Tax."},
            {"question": "Do sellers get direct payouts?", "answer": "Yes, automated payouts via Stripe Connect."}
        ]
        res = assemble_effective_idea_context(base_idea, clarifying_qa=clarifying_qa)
        self.assertIn("An e-commerce marketplace for handmade rugs.", res)
        self.assertIn("Additional detail provided: Q: 'How are international customs duties handled?' A: 'Calculated at checkout via Stripe Tax.'", res)
        self.assertIn("Additional detail provided: Q: 'Do sellers get direct payouts?' A: 'Yes, automated payouts via Stripe Connect.'", res)

    def test_assemble_context_combined_full(self):
        """Both contradiction resolution and clarifying Q&A are combined in proper order"""
        base_idea = "A fleet vehicle dispatch system."
        contradiction_data = {
            "explanation": "Real-time dispatch claimed with offline-only GPS tracking",
            "resolved_answer": "Cellular dongle syncs GPS telemetry every 15 seconds when online."
        }
        clarifying_qa = [
            {"question": "Are drivers assigned automatically or manually?", "answer": "Automated dispatch based on nearest proximity."}
        ]
        res = assemble_effective_idea_context(base_idea, contradiction_data=contradiction_data, clarifying_qa=clarifying_qa)
        self.assertIn("A fleet vehicle dispatch system.", res)
        self.assertIn("Regarding an earlier ambiguity (Real-time dispatch claimed with offline-only GPS tracking): the user clarified that Cellular dongle syncs GPS telemetry every 15 seconds when online.", res)
        self.assertIn("Additional detail provided: Q: 'Are drivers assigned automatically or manually?' A: 'Automated dispatch based on nearest proximity.'", res)

    # --- INTEGRATION TESTS FOR /projects/{id}/generate ---
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    async def test_generate_uses_folded_context_in_prompt(
        self, mock_groq, mock_gemini, mock_get_owned, mock_supabase, mock_user
    ):
        """Generation pipeline sends folded context to Gemini and Groq, not just raw idea_text"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "idea_text": "Hospital bed allocation system.",
            "fixed_inputs": {
                "stack": "Next.js + FastAPI",
                "database": "PostgreSQL",
                "deployment": "Docker",
                "apis": "Twilio SMS"
            },
            "status": "draft",
            "step0_state": {
                "last_contradiction_result": {
                    "explanation": "Instant bed assignment with manual doctor triage approval",
                    "resolved_answer": "Emergency beds are auto-assigned, ICU beds require doctor approval."
                },
                "clarifying_qa": [
                    {"question": "Are HL7 integration feeds supported?", "answer": "Yes, HL7 FHIR v4 API feeds."}
                ]
            }
        }
        mock_get_owned.return_value = mock_project

        # CQ Table query returns the answered QA
        cq_table = MagicMock()
        cq_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {"id": "cq-1", "question": "Are HL7 integration feeds supported?", "answer": "Yes, HL7 FHIR v4 API feeds."}
        ]
        
        # CC Table query returns contradiction resolution
        cc_table = MagicMock()
        cc_table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
            {
                "round": 2,
                "found": True,
                "explanation": "Instant bed assignment with manual doctor triage approval",
                "resolved_answer": "Emergency beds are auto-assigned, ICU beds require doctor approval."
            }
        ]

        def table_side_effect(table_name):
            if table_name == "clarifying_questions":
                return cq_table
            elif table_name == "contradiction_checks":
                return cc_table
            mock_tbl = MagicMock()
            mock_tbl.update.return_value.eq.return_value.execute.return_value = None
            mock_tbl.insert.return_value.execute.return_value = None
            return mock_tbl

        mock_client.table.side_effect = table_side_effect

        mock_gemini.return_value = {
            "idea_objective": "Comprehensive hospital bed allocation platform.",
            "features": [{"id": "feat-1", "name": "Auto Bed Allocation", "description": "Emergency routing", "source": "user_originated"}]
        }
        mock_groq.side_effect = [
            {"idea_objective": "Comprehensive bed allocation.", "features": []},  # Step 1 drafting
            {"is_valid": True, "flags": []},  # Step 3 validation
            {"is_valid": True, "flags": []}   # Step 5 validation
        ]

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/generate",
            headers=self.auth_headers,
            json={"fixed_inputs": mock_project["fixed_inputs"]}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")

        # Inspect the actual user prompt / context passed to Gemini & Groq
        gemini_call_args = mock_gemini.call_args_list[0]
        context_arg = gemini_call_args[0][1]

        self.assertIn("Hospital bed allocation system.", context_arg)
        self.assertIn("Regarding an earlier ambiguity (Instant bed assignment with manual doctor triage approval): the user clarified that Emergency beds are auto-assigned, ICU beds require doctor approval.", context_arg)
        self.assertIn("Additional detail provided: Q: 'Are HL7 integration feeds supported?' A: 'Yes, HL7 FHIR v4 API feeds.'", context_arg)

        # Confirm DB update for project did NOT alter idea_text column
        update_calls = [call for call in mock_client.table("projects").update.call_args_list]
        for u_call in update_calls:
            payload = u_call[0][0]
            self.assertNotIn("idea_text", payload, "idea_text column must NEVER be overwritten by generation context folding")

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    async def test_retry_after_failure_retains_folded_context(
        self, mock_groq, mock_gemini, mock_get_owned, mock_supabase, mock_user
    ):
        """Retrying /generate after an initial failure continues to fold complete context"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "idea_text": "Warehouse robotics tracking.",
            "fixed_inputs": {"stack": "Python", "database": "PostgreSQL", "deployment": "K8s", "apis": "REST"},
            "status": "generation_failed",  # Previous attempt failed
            "step0_state": {
                "last_contradiction_result": {
                    "explanation": "Fully autonomous vs manual override",
                    "resolved_answer": "Manual override is available via physical emergency stops only."
                },
                "clarifying_qa": [
                    {"question": "How many bots per hub?", "answer": "Up to 50 active robots per warehouse floor."}
                ]
            }
        }
        mock_get_owned.return_value = mock_project

        cq_table = MagicMock()
        cq_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {"id": "cq-1", "question": "How many bots per hub?", "answer": "Up to 50 active robots per warehouse floor."}
        ]
        cc_table = MagicMock()
        cc_table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
            {
                "round": 2,
                "found": True,
                "explanation": "Fully autonomous vs manual override",
                "resolved_answer": "Manual override is available via physical emergency stops only."
            }
        ]

        def table_side_effect(table_name):
            if table_name == "clarifying_questions":
                return cq_table
            elif table_name == "contradiction_checks":
                return cc_table
            mock_tbl = MagicMock()
            mock_tbl.update.return_value.eq.return_value.execute.return_value = None
            mock_tbl.insert.return_value.execute.return_value = None
            return mock_tbl

        mock_client.table.side_effect = table_side_effect

        mock_gemini.return_value = {
            "idea_objective": "Warehouse robotics coordination.",
            "features": [{"id": "feat-1", "name": "Telemetry Engine", "description": "Tracks bots", "source": "user_originated"}]
        }
        mock_groq.side_effect = [
            {"idea_objective": "Warehouse robotics coordination.", "features": []},
            {"is_valid": True, "flags": []},
            {"is_valid": True, "flags": []}
        ]

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/generate",
            headers=self.auth_headers,
            json={"fixed_inputs": mock_project["fixed_inputs"]}
        )

        self.assertEqual(response.status_code, 200)
        gemini_context = mock_gemini.call_args_list[0][0][1]
        self.assertIn("Manual override is available via physical emergency stops only.", gemini_context)
        self.assertIn("Up to 50 active robots per warehouse floor.", gemini_context)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_fail_closed_on_persistent_cq_db_error(
        self, mock_get_owned, mock_supabase, mock_user
    ):
        """Fails closed with 502 if fetching clarifying_questions fails after retry"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "idea_text": "Sample App",
            "fixed_inputs": {"stack": "React", "database": "PostgreSQL", "deployment": "Vercel", "apis": "Stripe"},
            "status": "draft"
        }
        mock_get_owned.return_value = mock_project

        cq_table = MagicMock()
        cq_table.select.side_effect = Exception("DB connection timeout")

        def table_side_effect(table_name):
            if table_name == "clarifying_questions":
                return cq_table
            mock_tbl = MagicMock()
            mock_tbl.update.return_value.eq.return_value.execute.return_value = None
            mock_tbl.insert.return_value.execute.return_value = None
            return mock_tbl

        mock_client.table.side_effect = table_side_effect

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/generate",
            headers=self.auth_headers,
            json={"fixed_inputs": mock_project["fixed_inputs"]}
        )

        self.assertEqual(response.status_code, 502)
        err_msg = response.json().get("message") or response.json().get("detail", "")
        self.assertIn("Failed to retrieve clarifying questions context from database", err_msg)
