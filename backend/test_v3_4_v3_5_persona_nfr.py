import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from backend import main
from backend.main import (
    app,
    assemble_effective_idea_context,
    compute_density_flags,
    NFR_SCALE_ALLOWED,
    NFR_DATA_SENSITIVITY_ALLOWED,
    NFR_AVAILABILITY_ALLOWED,
)


class TestPersonaAndNFRCapture(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.auth_headers = {"Authorization": "Bearer mock-test-token"}
        self.mock_user = {"user_id": "test-user-123", "email": "test@mimarai.com", "token": "mock-test-token"}
        self.mock_project_id = "11111111-1111-4111-8111-111111111111"

    # =========================================================================
    # 1. UNIT TESTS FOR assemble_effective_idea_context EXTENSION
    # =========================================================================
    def test_assemble_context_with_persona_only(self):
        """Persona text is formatted as 'User types: {answer}'"""
        base_idea = "A dental practice management platform."
        personas_data = {
            "answer": "Dentists manage treatments, hygienists log cleanings, patients book appointments.",
            "captured_at": "2026-09-15T20:00:00Z"
        }
        res = assemble_effective_idea_context(base_idea, personas_data=personas_data)
        self.assertIn("A dental practice management platform.", res)
        self.assertIn("User types: Dentists manage treatments, hygienists log cleanings, patients book appointments.", res)

    def test_assemble_context_with_persona_string(self):
        """Persona passed as direct string is also accepted and formatted"""
        base_idea = "A simple bug tracker."
        personas_str = "Developers fix bugs, QA engineers file bugs."
        res = assemble_effective_idea_context(base_idea, personas_data=personas_str)
        self.assertIn("User types: Developers fix bugs, QA engineers file bugs.", res)

    def test_assemble_context_with_nfr_only(self):
        """NFR selections are formatted with exact spec phrasing"""
        base_idea = "A high-frequency trading analytics tool."
        nfrs_data = {
            "scale": "thousands_plus",
            "data_sensitivity": "sensitive",
            "availability": "mission_critical",
            "captured_at": "2026-09-15T20:00:00Z"
        }
        res = assemble_effective_idea_context(base_idea, nfrs_data=nfrs_data)
        self.assertIn("A high-frequency trading analytics tool.", res)
        self.assertIn(
            "Non-functional requirements: expected scale is thousands_plus, data sensitivity is sensitive, availability requirement is mission_critical.",
            res
        )

    def test_assemble_context_with_partial_nfr(self):
        """Partial NFR dictionary formats present keys cleanly"""
        base_idea = "A personal hobby logger."
        nfrs_data = {
            "scale": "just_me",
            "data_sensitivity": "none_public"
        }
        res = assemble_effective_idea_context(base_idea, nfrs_data=nfrs_data)
        self.assertIn("Non-functional requirements: expected scale is just_me, data sensitivity is none_public.", res)

    def test_assemble_context_all_sections_combined(self):
        """Contradictions, clarifying Q&A, Persona, and NFR all assemble in canonical order"""
        base_idea = "A hospital logistics platform."
        contradiction_data = {
            "explanation": "Offline ambulances with instant cloud dispatch",
            "resolved_answer": "Ambulances sync via cellular when online, store locally offline."
        }
        clarifying_qa = [
            {"question": "Do doctors approve medicine transfers?", "answer": "Yes, two-signature approval required."}
        ]
        personas_data = {
            "answer": "Paramedics log en route vitals, ER nurses assign beds, pharmacy staff dispatch meds."
        }
        nfrs_data = {
            "scale": "hundreds_of_users",
            "data_sensitivity": "sensitive",
            "availability": "needs_to_be_reliable"
        }
        res = assemble_effective_idea_context(
            base_idea_text=base_idea,
            contradiction_data=contradiction_data,
            clarifying_qa=clarifying_qa,
            personas_data=personas_data,
            nfrs_data=nfrs_data
        )

        expected_sections = [
            "A hospital logistics platform.",
            "Regarding an earlier ambiguity (Offline ambulances with instant cloud dispatch): the user clarified that Ambulances sync via cellular when online, store locally offline.",
            "Additional detail provided: Q: 'Do doctors approve medicine transfers?' A: 'Yes, two-signature approval required.'",
            "User types: Paramedics log en route vitals, ER nurses assign beds, pharmacy staff dispatch meds.",
            "Non-functional requirements: expected scale is hundreds_of_users, data sensitivity is sensitive, availability requirement is needs_to_be_reliable."
        ]
        for section in expected_sections:
            self.assertIn(section, res)

    # =========================================================================
    # 2. UNIT TESTS FOR V3.4 PERSONA CAPTURE ENDPOINTS
    # =========================================================================
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_personas_success(self, mock_get_owned, mock_supabase, mock_user):
        """Submitting a valid persona answer persists to database and step0_state"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "step0_state": {}
        }
        mock_get_owned.return_value = mock_project

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/personas",
            headers=self.auth_headers,
            json={"answer": "Teachers assign homework, students submit tasks, parents review grades."}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["personas"]["answer"], "Teachers assign homework, students submit tasks, parents review grades.")
        self.assertIn("captured_at", data["personas"])

        # Verify DB update call
        mock_client.table("projects").update.assert_called_once()

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_personas_empty_rejected(self, mock_get_owned, mock_supabase, mock_user):
        """Submitting an empty persona answer returns 400 Bad Request"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "owner_id": "test-user-123"}
        mock_get_owned.return_value = mock_project

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/personas",
            headers=self.auth_headers,
            json={"answer": "   "}
        )
        self.assertEqual(response.status_code, 400)
        err_msg = response.json().get("message") or response.json().get("detail")
        self.assertIn("Persona answer cannot be empty", err_msg)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_personas_db_retry_failure(self, mock_get_owned, mock_supabase, mock_user):
        """DB failure during persona save retries once then returns 502"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "owner_id": "test-user-123", "step0_state": {}}
        mock_get_owned.return_value = mock_project

        # Make DB update fail on both attempts
        mock_client.table("projects").update.side_effect = Exception("DB update lock timeout")

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/personas",
            headers=self.auth_headers,
            json={"answer": "Admins and standard users."}
        )
        self.assertEqual(response.status_code, 502)
        err_msg = response.json().get("message") or response.json().get("detail")
        self.assertIn("Failed to persist persona data", err_msg)
        self.assertEqual(mock_client.table("projects").update.call_count, 2)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_get_personas_endpoint(self, mock_get_owned, mock_supabase, mock_user):
        """GET /personas returns the stored persona details"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "personas": {
                "answer": "Drivers and Dispatchers",
                "captured_at": "2026-09-15T20:00:00Z"
            }
        }
        mock_get_owned.return_value = mock_project

        response = self.client.get(
            f"/api/projects/{self.mock_project_id}/personas",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["personas"]["answer"], "Drivers and Dispatchers")

    # =========================================================================
    # 3. UNIT TESTS FOR V3.5 NFR CAPTURE ENDPOINTS
    # =========================================================================
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_nfrs_success(self, mock_get_owned, mock_supabase, mock_user):
        """Submitting valid NFR values persists to database and step0_state"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "step0_state": {}
        }
        mock_get_owned.return_value = mock_project

        payload = {
            "scale": "hundreds_of_users",
            "data_sensitivity": "personal",
            "availability": "needs_to_be_reliable"
        }
        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/nfrs",
            headers=self.auth_headers,
            json=payload
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["nfrs"]["scale"], "hundreds_of_users")
        self.assertEqual(data["nfrs"]["data_sensitivity"], "personal")
        self.assertEqual(data["nfrs"]["availability"], "needs_to_be_reliable")
        self.assertIn("captured_at", data["nfrs"])

        # Verify DB update call
        mock_client.table("projects").update.assert_called_once()

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_nfrs_invalid_scale_rejected(self, mock_get_owned, mock_supabase, mock_user):
        """Invalid scale value is rejected with 400 error"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "owner_id": "test-user-123"}
        mock_get_owned.return_value = mock_project

        payload = {
            "scale": "massive_global_scale",  # invalid
            "data_sensitivity": "personal",
            "availability": "needs_to_be_reliable"
        }
        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/nfrs",
            headers=self.auth_headers,
            json=payload
        )
        self.assertEqual(response.status_code, 400)
        err_msg = response.json().get("message") or response.json().get("detail")
        self.assertIn("Invalid scale value", err_msg)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_nfrs_invalid_sensitivity_rejected(self, mock_get_owned, mock_supabase, mock_user):
        """Invalid data_sensitivity value is rejected with 400 error"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "owner_id": "test-user-123"}
        mock_get_owned.return_value = mock_project

        payload = {
            "scale": "just_me",
            "data_sensitivity": "top_secret_classified",  # invalid
            "availability": "best_effort"
        }
        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/nfrs",
            headers=self.auth_headers,
            json=payload
        )
        self.assertEqual(response.status_code, 400)
        err_msg = response.json().get("message") or response.json().get("detail")
        self.assertIn("Invalid data_sensitivity value", err_msg)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_nfrs_invalid_availability_rejected(self, mock_get_owned, mock_supabase, mock_user):
        """Invalid availability value is rejected with 400 error"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "owner_id": "test-user-123"}
        mock_get_owned.return_value = mock_project

        payload = {
            "scale": "small_team",
            "data_sensitivity": "sensitive",
            "availability": "always_on_99999"  # invalid
        }
        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/nfrs",
            headers=self.auth_headers,
            json=payload
        )
        self.assertEqual(response.status_code, 400)
        err_msg = response.json().get("message") or response.json().get("detail")
        self.assertIn("Invalid availability value", err_msg)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_submit_nfrs_missing_field_rejected(self, mock_get_owned, mock_supabase, mock_user):
        """Missing required NFR field returns 400 error"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {"id": self.mock_project_id, "owner_id": "test-user-123"}
        mock_get_owned.return_value = mock_project

        payload = {
            "scale": "small_team",
            # data_sensitivity is missing
            "availability": "best_effort"
        }
        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/nfrs",
            headers=self.auth_headers,
            json=payload
        )
        self.assertEqual(response.status_code, 400)
        err_msg = response.json().get("message") or response.json().get("detail")
        self.assertIn("Invalid data_sensitivity value", err_msg)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_get_nfrs_endpoint(self, mock_get_owned, mock_supabase, mock_user):
        """GET /nfrs returns the stored NFR details"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "nfrs": {
                "scale": "thousands_plus",
                "data_sensitivity": "sensitive",
                "availability": "mission_critical",
                "captured_at": "2026-09-15T20:00:00Z"
            }
        }
        mock_get_owned.return_value = mock_project

        response = self.client.get(
            f"/api/projects/{self.mock_project_id}/nfrs",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["nfrs"]["scale"], "thousands_plus")
        self.assertEqual(response.json()["nfrs"]["data_sensitivity"], "sensitive")
        self.assertEqual(response.json()["nfrs"]["availability"], "mission_critical")

    # =========================================================================
    # 4. UNIT TESTS FOR /generate PIPELINE INTEGRATION
    # =========================================================================
    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    async def test_generate_pipeline_includes_personas_and_nfrs_in_context(
        self, mock_groq, mock_gemini, mock_get_owned, mock_supabase, mock_user
    ):
        """Full /generate call folds both personas and nfrs from project row into generation prompt"""
        mock_user.return_value = self.mock_user
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        mock_project = {
            "id": self.mock_project_id,
            "owner_id": "test-user-123",
            "idea_text": "An inventory tracking system for retail stores.",
            "fixed_inputs": {
                "stack": "React + Node.js (Express)",
                "database": "PostgreSQL + Prisma",
                "deployment": "AWS ECS + RDS",
                "apis": "Custom JWT + SendGrid"
            },
            "status": "draft",
            "personas": {
                "answer": "Store cashiers scan items, warehouse managers reorder stock, admins review profit margins."
            },
            "nfrs": {
                "scale": "thousands_plus",
                "data_sensitivity": "sensitive",
                "availability": "mission_critical"
            },
            "step0_state": {}
        }
        mock_get_owned.return_value = mock_project

        # CQ Table query mock
        cq_table = MagicMock()
        cq_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        # CC Table query mock
        cc_table = MagicMock()
        cc_table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

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

        # Mock LLM generation outputs
        mock_gemini.return_value = {
            "idea_objective": "Comprehensive inventory tracking platform.",
            "features": [
                {
                    "id": "feat-1",
                    "name": "Barcode Scanning",
                    "description": "Scans item barcodes for cashiers and inventory stock.",
                    "source": "user_originated"
                }
            ]
        }
        mock_groq.side_effect = [
            {"idea_objective": "Scalable retail inventory platform.", "features": []},  # Step 1 drafting
            {"is_valid": True, "flags": []},  # Step 3 validation
            {"is_valid": True, "flags": []}   # Step 5 validation
        ]

        response = self.client.post(
            f"/api/projects/{self.mock_project_id}/generate",
            headers=self.auth_headers,
            json={"fixed_inputs": mock_project["fixed_inputs"]}
        )
        self.assertEqual(response.status_code, 200)

        # Inspect prompt passed to call_gemini_api
        call_args = mock_gemini.call_args[0]
        user_prompt = call_args[1]

        self.assertIn("User types: Store cashiers scan items, warehouse managers reorder stock, admins review profit margins.", user_prompt)
        self.assertIn("Non-functional requirements: expected scale is thousands_plus, data sensitivity is sensitive, availability requirement is mission_critical.", user_prompt)

    # =========================================================================
    # 5. DENSITY CHECK GATING TESTS FOR PERSONAS & NFRS
    # =========================================================================
    def test_density_check_sparse_prompts_both(self):
        """Sparse idea prompts for both personas ('ask') and nfrs ('ask')"""
        sparse_idea = "A simple budgeting web application."
        flags = compute_density_flags(sparse_idea)
        self.assertEqual(flags["personas"], "ask")
        self.assertEqual(flags["nfrs"], "ask")

    def test_density_check_with_personas_skips_persona_capture(self):
        """Idea already detailing user roles skips personas ('skip') but asks nfrs ('ask')"""
        idea_with_roles = "A portal where doctors write prescriptions, patients view appointments, and administrators manage staff permissions."
        flags = compute_density_flags(idea_with_roles)
        self.assertEqual(flags["personas"], "skip")
        self.assertEqual(flags["nfrs"], "ask")

    def test_density_check_with_scale_and_sensitivity_skips_nfrs(self):
        """Idea with scale and financial sensitivity skips nfrs ('skip')"""
        idea_with_nfrs = "A microservice handling 50k concurrent requests with encrypted banking transaction financial data under PCI-DSS compliance."
        flags = compute_density_flags(idea_with_nfrs)
        self.assertEqual(flags["nfrs"], "skip")
        self.assertEqual(flags["personas"], "ask")

    def test_density_check_dense_skips_both_stages(self):
        """Extremely detailed idea with roles, scale, and compliance skips both ('skip')"""
        dense_idea = (
            "A hospital EHR platform where doctors, nurses, and administrators manage patient care. "
            "Engineered for 100k daily active users with low latency and high availability. "
            "Strictly compliant with HIPAA and GDPR for patient health records and confidential medical data."
        )
        flags = compute_density_flags(dense_idea)
        self.assertEqual(flags["personas"], "skip")
        self.assertEqual(flags["nfrs"], "skip")
        self.assertEqual(flags["clarifying_questions"], "skip")


if __name__ == "__main__":
    unittest.main()
