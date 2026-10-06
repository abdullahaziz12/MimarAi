"""
Integration and API Tests for V6.0 Final Plan Consolidation Endpoints.
Tests cover:
1. 409 Prerequisite gate rejection when features/structure/diagrams not accepted
2. Step 1 consolidation + Step 2 dual-draft generate endpoint
3. Validate endpoint with quality validation and fix-pass
4. Three independent 409 lock-blocking conditions (§7)
5. Successful lock after resolution
6. Reopen with required reason string and audit logging
7. GET /final-plan/{project_id} endpoint
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import uuid
from datetime import datetime, timezone

from backend.main import app, get_current_user


class TestV6FinalPlanApi(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.auth_headers = {"Authorization": "Bearer mock-token-123"}
        self.mock_user = {"user_id": "user-123", "email": "test@mimarai.com", "token": "mock-token-123"}
        self.project_id = "00000000-0000-0000-0000-000000000001"
        app.dependency_overrides[get_current_user] = lambda: self.mock_user

    def tearDown(self):
        app.dependency_overrides.clear()

    # =========================================================================
    # 1. PREREQUISITE GATE TESTS (§2)
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_generate_prerequisite_gate_409(self, mock_get_supabase, mock_get_owned_project):
        """Fails closed with 409 when structure and diagram are not accepted."""
        mock_get_owned_project.return_value = {
            "id": self.project_id,
            "status": "draft",
            "generation_state": {"features": [{"id": "feat-1", "name": "Auth"}]},
            "structure_state": {"status": "draft"},
            "diagram_state": {"status": "draft"}
        }

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/generate",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertIn("missing", data)
        self.assertIn("structure_accepted", data["missing"])
        self.assertIn("diagram_accepted", data["missing"])

    # =========================================================================
    # 2. GENERATE ENDPOINT TESTS (CONSOLIDATION + DUAL DRAFT)
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    @patch("backend.main.call_gemini_api", new_callable=AsyncMock)
    @patch("backend.main.call_groq_json", new_callable=AsyncMock)
    def test_generate_endpoint_success(
        self,
        mock_call_groq,
        mock_call_gemini,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Generates draft final plan via Step 1 consolidation + Step 2 dual drafting."""
        mock_get_owned_project.return_value = {
            "id": self.project_id,
            "status": "diagram_accepted",
            "generation_state": {
                "features": [
                    {"id": "feat-1", "name": "Payment Gateway", "priority": "must_have"}
                ],
                "rejected_feature_ids": []
            },
            "structure_state": {
                "status": "accepted",
                "accepted_structure": {
                    "structure": {
                        "src/services/pay.py": ["feat-1"]
                    }
                }
            },
            "diagram_state": {
                "status": "accepted",
                "accepted_schema": {"tables": []},
                "accepted_architecture": {"services": []}
            }
        }

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_exec = MagicMock()
        mock_exec.execute.return_value = MagicMock(data=[])
        mock_eq.execute = mock_exec.execute
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_table.update.return_value = mock_eq
        mock_table.insert.return_value = mock_eq
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        mock_call_gemini.return_value = {
            "exception_handling": [
                {
                    "id": "exc-1",
                    "category": "exception_handling",
                    "title": "Payment Timeout Handling Policy",
                    "description": "Retry payment processing up to three times with exponential backoff before failing.",
                    "related_feature_ids": ["feat-1"],
                    "related_structure_node_ids": ["node-pay"],
                    "severity": "high",
                    "provenance": "derived_from_business_rule",
                    "reasoning": None
                }
            ],
            "security_considerations": [
                {
                    "id": "sec-1",
                    "category": "security",
                    "title": "Bcrypt Password Hashing Standard",
                    "description": "Store all user passwords hashed with bcrypt using at least twelve work factor rounds.",
                    "related_feature_ids": ["feat-1"],
                    "related_structure_node_ids": ["node-pay"],
                    "severity": "high",
                    "provenance": "derived_from_business_rule",
                    "reasoning": None
                }
            ],
            "mandatory_directives": [
                {
                    "id": "dir-1",
                    "directive": "All payment amount fields must be stored as integer cents, never floating point values.",
                    "source": "feature_business_rule",
                    "source_ref_id": "feat-1",
                    "non_negotiable": True
                }
            ]
        }
        mock_call_groq.return_value = dict(mock_call_gemini.return_value)

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/generate",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["plan_status"], "draft")
        self.assertIn("consolidated_summary", data)
        self.assertEqual(len(data["exception_handling"]), 1)
        self.assertEqual(len(data["security_considerations"]), 1)
        self.assertEqual(len(data["mandatory_directives"]), 1)

    # =========================================================================
    # 3. VALIDATE ENDPOINT TESTS (§6)
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_validate_endpoint_success_to_under_review(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Validates clean entries and transitions status to under_review."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        plan_record = {
            "id": str(uuid.uuid4()),
            "project_id": self.project_id,
            "status": "draft",
            "exception_handling": [
                {
                    "id": "exc-1",
                    "category": "exception_handling",
                    "title": "Payment Timeout Handling Policy",
                    "description": "Retry payment processing up to three times with exponential backoff before failing.",
                    "related_feature_ids": ["feat-1"],
                    "related_structure_node_ids": ["node-pay"],
                    "severity": "high",
                    "provenance": "derived_from_business_rule",
                    "reasoning": None
                }
            ],
            "security_considerations": [
                {
                    "id": "sec-1",
                    "category": "security",
                    "title": "Bcrypt Password Hashing Standard",
                    "description": "Store all user passwords hashed with bcrypt using at least twelve work factor rounds.",
                    "related_feature_ids": ["feat-1"],
                    "related_structure_node_ids": ["node-pay"],
                    "severity": "high",
                    "provenance": "derived_from_business_rule",
                    "reasoning": None
                }
            ],
            "mandatory_directives": [
                {
                    "id": "dir-1",
                    "directive": "All payment amount fields must be stored as integer cents, never floating point values.",
                    "source": "feature_business_rule",
                    "source_ref_id": "feat-1",
                    "non_negotiable": True
                }
            ]
        }

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[plan_record])
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_table.update.return_value = mock_eq
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/validate",
            headers=self.auth_headers,
            json={}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["plan_status"], "under_review")
        self.assertTrue(data["quality_flags"]["overall_pass"])

    # =========================================================================
    # 4. THREE INDEPENDENT LOCK BLOCKING RULES (§7)
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_lock_blocked_by_feature_not_in_structure_409(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Rule 1: Open feature_not_in_structure gap blocks lock with 409."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        plan_record = {
            "id": str(uuid.uuid4()),
            "project_id": self.project_id,
            "status": "under_review",
            "consolidated_summary": {
                "cross_reference_gaps": [
                    {"type": "feature_not_in_structure", "feature_id": "feat-unmapped", "title": "Unmapped Feature"}
                ]
            },
            "exception_handling": [],
            "security_considerations": []
        }

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[plan_record])
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/lock",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertIn("blockers", data)
        self.assertTrue(any("feature_not_in_structure" in b for b in data["blockers"]))

    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_lock_not_blocked_by_structure_node_no_feature_200(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """structure_node_no_feature is informational-only (§4, §7) and does NOT block lock (200 OK)."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        plan_record = {
            "id": str(uuid.uuid4()),
            "project_id": self.project_id,
            "status": "under_review",
            "consolidated_summary": {
                "cross_reference_gaps": [
                    {"type": "structure_node_no_feature", "node_id": "src/utils/config.py"}
                ]
            },
            "exception_handling": [],
            "security_considerations": []
        }

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[plan_record])
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_table.update.return_value = mock_eq
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/lock",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["plan_status"], "locked")
        self.assertIsNotNone(data["locked_at"])

    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_lock_blocked_by_unresolved_critical_finding_409(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Rule 3: Unresolved critical finding blocks lock with 409."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        crit_id = "crit-sec-001"
        plan_record = {
            "id": str(uuid.uuid4()),
            "project_id": self.project_id,
            "status": "under_review",
            "consolidated_summary": {"cross_reference_gaps": []},
            "exception_handling": [],
            "security_considerations": [
                {
                    "id": crit_id,
                    "category": "security",
                    "title": "Critical Unauthenticated Admin Route Vulnerability",
                    "severity": "critical"
                }
            ]
        }

        mock_client = MagicMock()
        def side_effect_table(table_name):
            t = MagicMock()
            if table_name == "final_plans":
                eq_mock = MagicMock()
                eq_mock.execute.return_value = MagicMock(data=[plan_record])
                sel_mock = MagicMock()
                sel_mock.eq.return_value = eq_mock
                t.select.return_value = sel_mock
                t.update.return_value = eq_mock
            elif table_name == "comments":
                eq3 = MagicMock()
                eq3.execute.return_value = MagicMock(data=[])
                eq2 = MagicMock()
                eq2.eq.return_value = eq3
                eq1 = MagicMock()
                eq1.eq.return_value = eq2
                sel_mock = MagicMock()
                sel_mock.eq.return_value = eq1
                t.select.return_value = sel_mock
            return t

        mock_client.table.side_effect = side_effect_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/lock",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertIn("blockers", data)
        self.assertTrue(any("Unresolved critical security" in b for b in data["blockers"]))

    # =========================================================================
    # 5. SUCCESSFUL LOCK AFTER RESOLUTION
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_lock_success_when_all_blockers_resolved(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Lock succeeds with 200 when gaps are empty and critical finding is resolved via comments."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        crit_id = "crit-sec-001"
        plan_record = {
            "id": str(uuid.uuid4()),
            "project_id": self.project_id,
            "status": "under_review",
            "consolidated_summary": {
                "cross_reference_gaps": [
                    # Database is in INFRA_ALLOWLIST so it does NOT block
                    {"type": "structure_node_no_feature", "node_id": "node-db", "node_type": "database"}
                ]
            },
            "exception_handling": [],
            "security_considerations": [
                {
                    "id": crit_id,
                    "category": "security",
                    "title": "Critical Unauthenticated Admin Route Vulnerability",
                    "severity": "critical"
                }
            ]
        }

        mock_client = MagicMock()
        def side_effect_table(table_name):
            t = MagicMock()
            if table_name == "final_plans":
                eq_mock = MagicMock()
                eq_mock.execute.return_value = MagicMock(data=[plan_record])
                sel_mock = MagicMock()
                sel_mock.eq.return_value = eq_mock
                t.select.return_value = sel_mock
                t.update.return_value = eq_mock
            elif table_name == "comments":
                eq3 = MagicMock()
                eq3.execute.return_value = MagicMock(data=[{"target_feature_id": crit_id, "status": "resolved"}])
                eq2 = MagicMock()
                eq2.eq.return_value = eq3
                eq1 = MagicMock()
                eq1.eq.return_value = eq2
                sel_mock = MagicMock()
                sel_mock.eq.return_value = eq1
                t.select.return_value = sel_mock
            return t

        mock_client.table.side_effect = side_effect_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/lock",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["plan_status"], "locked")
        self.assertEqual(data["locked_by"], self.mock_user["user_id"])

    # =========================================================================
    # 6. RE-OPEN ENDPOINT TESTS (§7)
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_reopen_without_reason_returns_400(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Re-open without a non-empty reason string returns 400."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/reopen",
            headers=self.auth_headers,
            json={"reason": "   "}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("reason", response.json()["message"].lower())

    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_reopen_success_and_logs_audit(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Re-open with valid reason resets status to draft and inserts audit log."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        plan_record = {"id": str(uuid.uuid4()), "project_id": self.project_id, "status": "locked"}

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[plan_record])
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_table.update.return_value = mock_eq
        mock_table.insert.return_value = mock_eq
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/reopen",
            headers=self.auth_headers,
            json={"reason": "Client requested additional HIPAA compliance safeguards."}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["plan_status"], "draft")
        self.assertEqual(data["reopen_reason"], "Client requested additional HIPAA compliance safeguards.")

    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_reopen_fails_with_409_when_not_locked(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """Re-open on a plan with status != 'locked' (e.g. 'draft' or 'under_review') returns 409."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}

        plan_record = {"id": str(uuid.uuid4()), "project_id": self.project_id, "status": "under_review"}

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[plan_record])
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        response = self.client.post(
            f"/api/projects/{self.project_id}/final-plan/reopen",
            headers=self.auth_headers,
            json={"reason": "Attempting to reopen a draft plan."}
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("locked", response.json()["message"].lower())

    # =========================================================================
    # 7. GET FINAL PLAN ENDPOINT
    # =========================================================================
    @patch("backend.main.get_owned_project")
    @patch("backend.main.get_supabase")
    def test_get_final_plan_endpoint(
        self,
        mock_get_supabase,
        mock_get_owned_project
    ):
        """GET /projects/{project_id}/final-plan returns stored final plan."""
        mock_get_owned_project.return_value = {"id": self.project_id, "status": "diagram_accepted"}
        plan_record = {"id": str(uuid.uuid4()), "project_id": self.project_id, "status": "locked"}

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[plan_record])
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_client.table.return_value = mock_table
        mock_get_supabase.return_value = mock_client

        response = self.client.get(
            f"/api/projects/{self.project_id}/final-plan",
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["final_plan"]["status"], "locked")


if __name__ == "__main__":
    unittest.main()
