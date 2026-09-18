import unittest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
import json

from backend.main import (
    app,
    assemble_effective_idea_context
)


class TestV311InterviewAnswersEditFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_user_id = "user-v3-11-test"
        self.mock_project_id = "proj-v3-11-test"
        self.mock_headers = {"Authorization": "Bearer test-jwt-token"}

    def _get_mock_project(self, **kwargs):
        base = {
            "id": self.mock_project_id,
            "owner_id": self.mock_user_id,
            "name": "Hospital Logistics Engine",
            "status": "draft",
            "idea_text": "An automated ambulance dispatch and bed allocation engine.",
            "step0_state": {
                "last_contradiction_result": {
                    "found": True,
                    "explanation": "Conflict regarding manual vs auto triage",
                    "conflicting_parts": ["manual triage", "instant auto assignment"],
                    "round": 1,
                    "resolved_answer": "Emergency beds are auto-assigned, ICU beds require doctor approval."
                },
                "clarifying_qa": [
                    {
                        "id": "q-1",
                        "question": "What authentication provider will be used?",
                        "answer": "Supabase Auth with role-based access."
                    }
                ],
                "personas": {
                    "answer": "Paramedics dispatch ambulances, triage nurses assign beds, doctors review ICU entries.",
                    "captured_at": "2026-09-18T10:00:00Z"
                },
                "nfrs": {
                    "scale": "thousands_plus",
                    "data_sensitivity": "sensitive",
                    "availability": "mission_critical",
                    "captured_at": "2026-09-18T10:05:00Z"
                }
            },
            "personas": {
                "answer": "Paramedics dispatch ambulances, triage nurses assign beds, doctors review ICU entries.",
                "captured_at": "2026-09-18T10:00:00Z"
            },
            "nfrs": {
                "scale": "thousands_plus",
                "data_sensitivity": "sensitive",
                "availability": "mission_critical",
                "captured_at": "2026-09-18T10:05:00Z"
            },
            "lightweight_draft": {
                "attempts": [
                    {
                        "attempt": 1,
                        "draft_features": ["Automated Bed Allocation", "Ambulance GPS Dispatch"],
                        "user_response": "confirmed",
                        "correction_text": None,
                        "created_at": "2026-09-18T10:10:00Z"
                    }
                ],
                "final_status": "confirmed",
                "lightweight_draft_flagged": False
            }
        }
        base.update(kwargs)
        return base

    # -------------------------------------------------------------
    # 1. READ ENDPOINT: GET /interview-summary
    # -------------------------------------------------------------
    @patch("backend.main.get_current_user")
    @patch("backend.main.get_supabase")
    @patch("backend.main.get_owned_project")
    async def test_get_interview_summary_success(self, mock_get_owned, mock_supabase, mock_user):
        """GET /interview-summary returns complete aggregated interview answers"""
        mock_user.return_value = {"user_id": self.mock_user_id, "token": "test-token"}
        mock_proj = self._get_mock_project()
        mock_get_owned.return_value = mock_proj

        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        # Mock clarifying_questions query
        cq_table = MagicMock()
        cq_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {
                "id": "q-1",
                "question": "What authentication provider will be used?",
                "answer": "Supabase Auth with role-based access."
            }
        ]
        mock_client.table.return_value = cq_table

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                f"/api/projects/{self.mock_project_id}/interview-summary",
                headers=self.mock_headers
            )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["project_id"], self.mock_project_id)
        self.assertEqual(data["idea_text"], mock_proj["idea_text"])
        self.assertEqual(data["contradiction_resolution"]["resolved_answer"], "Emergency beds are auto-assigned, ICU beds require doctor approval.")
        self.assertEqual(len(data["clarifying_questions"]), 1)
        self.assertEqual(data["clarifying_questions"][0]["answer"], "Supabase Auth with role-based access.")
        self.assertEqual(data["personas"]["answer"], "Paramedics dispatch ambulances, triage nurses assign beds, doctors review ICU entries.")
        self.assertEqual(data["nfrs"]["scale"], "thousands_plus")
        self.assertEqual(data["nfrs"]["data_sensitivity"], "sensitive")
        self.assertEqual(data["nfrs"]["availability"], "mission_critical")
        self.assertEqual(data["lightweight_draft"]["final_status"], "confirmed")

    # -------------------------------------------------------------
    # 2. CONTRADICTION RESOLUTION EDIT: POST /contradiction-resolution
    # -------------------------------------------------------------
    @patch("backend.main.get_current_user")
    @patch("backend.main.get_supabase")
    @patch("backend.main.get_owned_project")
    async def test_edit_contradiction_resolution_success(self, mock_get_owned, mock_supabase, mock_user):
        """Editing contradiction resolution updates step0_state and invalidates confirmed draft"""
        mock_user.return_value = {"user_id": self.mock_user_id, "token": "test-token"}
        mock_proj = self._get_mock_project()
        mock_get_owned.return_value = mock_proj

        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                f"/api/projects/{self.mock_project_id}/contradiction-resolution",
                headers=self.mock_headers,
                json={"resolved_answer": "All bed allocations are 100% automated with zero manual approval."}
            )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["last_contradiction_result"]["resolved_answer"], "All bed allocations are 100% automated with zero manual approval.")

        # Verify DB update was executed on projects table resetting final_status to None
        update_calls = mock_client.table("projects").update.call_args_list
        self.assertTrue(len(update_calls) > 0)
        updated_payload = update_calls[0][0][0]
        self.assertEqual(updated_payload["step0_state"]["last_contradiction_result"]["resolved_answer"], "All bed allocations are 100% automated with zero manual approval.")
        self.assertIsNone(updated_payload["lightweight_draft"]["final_status"])

    @patch("backend.main.get_current_user")
    @patch("backend.main.get_supabase")
    @patch("backend.main.get_owned_project")
    async def test_edit_contradiction_resolution_empty_rejected(self, mock_get_owned, mock_supabase, mock_user):
        """Empty resolved_answer is rejected with 422/400"""
        mock_user.return_value = {"user_id": self.mock_user_id, "token": "test-token"}
        mock_get_owned.return_value = self._get_mock_project()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                f"/api/projects/{self.mock_project_id}/contradiction-resolution",
                headers=self.mock_headers,
                json={"resolved_answer": "   "}
            )
        self.assertIn(res.status_code, [400, 422])

    # -------------------------------------------------------------
    # 3. CLARIFYING QUESTIONS EDIT (UPSERT) & DRAFT INVALIDATION
    # -------------------------------------------------------------
    @patch("backend.main.get_current_user")
    @patch("backend.main.get_supabase")
    @patch("backend.main.get_owned_project")
    async def test_edit_clarifying_answer_upsert_and_invalidation(self, mock_get_owned, mock_supabase, mock_user):
        """Calling clarifying-questions/answer again updates in place and resets confirmed lightweight draft"""
        mock_user.return_value = {"user_id": self.mock_user_id, "token": "test-token"}
        mock_proj = self._get_mock_project()
        mock_get_owned.return_value = mock_proj

        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        cq_mock = MagicMock()
        proj_mock = MagicMock()
        def table_router(name):
            if name == "clarifying_questions":
                return cq_mock
            return proj_mock
        mock_client.table.side_effect = table_router

        # Mock select after update
        cq_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {
                "id": "11111111-1111-4111-8111-111111111111",
                "question": "What authentication provider will be used?",
                "answer": "Auth0 Enterprise with SAML SSO."
            }
        ]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                f"/api/projects/{self.mock_project_id}/clarifying-questions/answer",
                headers=self.mock_headers,
                json={
                    "answers": [
                        {
                            "question_id": "11111111-1111-4111-8111-111111111111",
                            "answer": "Auth0 Enterprise with SAML SSO."
                        }
                    ]
                }
            )

        self.assertEqual(res.status_code, 200)
        # Verify in-place update on clarifying_questions table was called
        cq_mock.update.assert_called_with({"answer": "Auth0 Enterprise with SAML SSO."})

        # Verify projects table updated step0_state and reset lightweight_draft.final_status
        update_calls = proj_mock.update.call_args_list
        self.assertTrue(len(update_calls) > 0)
        updated_payload = update_calls[0][0][0]
        self.assertIsNone(updated_payload["lightweight_draft"]["final_status"])

    # -------------------------------------------------------------
    # 4. PERSONA EDIT (OVERWRITE) & DRAFT INVALIDATION
    # -------------------------------------------------------------
    @patch("backend.main.get_current_user")
    @patch("backend.main.get_supabase")
    @patch("backend.main.get_owned_project")
    async def test_edit_persona_overwrite_and_invalidation(self, mock_get_owned, mock_supabase, mock_user):
        """Calling /personas again overwrites the previous persona and resets confirmed lightweight draft"""
        mock_user.return_value = {"user_id": self.mock_user_id, "token": "test-token"}
        mock_proj = self._get_mock_project()
        mock_get_owned.return_value = mock_proj

        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        new_persona_text = "Only emergency dispatchers use the app; doctors access through external EHR."

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                f"/api/projects/{self.mock_project_id}/personas",
                headers=self.mock_headers,
                json={"answer": new_persona_text}
            )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["personas"]["answer"], new_persona_text)

        # Verify projects table was updated with new persona and invalidated draft
        update_calls = mock_client.table("projects").update.call_args_list
        self.assertTrue(len(update_calls) > 0)
        updated_payload = update_calls[0][0][0]
        self.assertEqual(updated_payload["personas"]["answer"], new_persona_text)
        self.assertIsNone(updated_payload["lightweight_draft"]["final_status"])

    # -------------------------------------------------------------
    # 5. NFR EDIT (OVERWRITE) & DRAFT INVALIDATION
    # -------------------------------------------------------------
    @patch("backend.main.get_current_user")
    @patch("backend.main.get_supabase")
    @patch("backend.main.get_owned_project")
    async def test_edit_nfr_overwrite_and_invalidation(self, mock_get_owned, mock_supabase, mock_user):
        """Calling /nfrs again overwrites previous constraints and resets confirmed lightweight draft"""
        mock_user.return_value = {"user_id": self.mock_user_id, "token": "test-token"}
        mock_proj = self._get_mock_project()
        mock_get_owned.return_value = mock_proj

        mock_client = MagicMock()
        mock_supabase.return_value = mock_client

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                f"/api/projects/{self.mock_project_id}/nfrs",
                headers=self.mock_headers,
                json={
                    "scale": "just_me",
                    "data_sensitivity": "none_public",
                    "availability": "best_effort"
                }
            )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["nfrs"]["scale"], "just_me")
        self.assertEqual(data["nfrs"]["data_sensitivity"], "none_public")
        self.assertEqual(data["nfrs"]["availability"], "best_effort")

        # Verify projects table was updated with new NFRs and invalidated draft
        update_calls = mock_client.table("projects").update.call_args_list
        self.assertTrue(len(update_calls) > 0)
        updated_payload = update_calls[0][0][0]
        self.assertEqual(updated_payload["nfrs"]["scale"], "just_me")
        self.assertIsNone(updated_payload["lightweight_draft"]["final_status"])

    # -------------------------------------------------------------
    # 6. VERIFY assemble_effective_idea_context PICKS UP EDITED VALUES
    # -------------------------------------------------------------
    def test_assemble_effective_idea_context_incorporates_edited_values(self):
        """assemble_effective_idea_context dynamically reflects all edited answers with no changes to the function"""
        base_idea = "A dispatch platform for hospital fleets."

        # Original values
        orig_context = assemble_effective_idea_context(
            base_idea_text=base_idea,
            contradiction_data={"resolved_answer": "Emergency beds auto-assigned, ICU doctor approval.", "explanation": "Triage conflict"},
            clarifying_qa=[{"question": "Auth method?", "answer": "Supabase Auth"}],
            personas_data={"answer": "Paramedics and Nurses."},
            nfrs_data={"scale": "thousands_plus", "data_sensitivity": "sensitive", "availability": "mission_critical"}
        )

        self.assertIn("Emergency beds auto-assigned", orig_context)
        self.assertIn("Supabase Auth", orig_context)
        self.assertIn("Paramedics and Nurses", orig_context)
        self.assertIn("thousands_plus", orig_context)

        # Edited values
        edited_context = assemble_effective_idea_context(
            base_idea_text=base_idea,
            contradiction_data={"resolved_answer": "All allocations 100% automated with zero doctor triage.", "explanation": "Triage conflict"},
            clarifying_qa=[{"question": "Auth method?", "answer": "Auth0 Enterprise SAML"}],
            personas_data={"answer": "Only Dispatchers; no nurse access."},
            nfrs_data={"scale": "just_me", "data_sensitivity": "none_public", "availability": "best_effort"}
        )

        # Confirm old values are gone and new edited values are in place
        self.assertNotIn("Emergency beds auto-assigned", edited_context)
        self.assertNotIn("Supabase Auth", edited_context)
        self.assertNotIn("Paramedics and Nurses", edited_context)
        self.assertNotIn("thousands_plus", edited_context)

        self.assertIn("All allocations 100% automated with zero doctor triage.", edited_context)
        self.assertIn("Auth0 Enterprise SAML", edited_context)
        self.assertIn("Only Dispatchers; no nurse access.", edited_context)
        self.assertIn("expected scale is just_me", edited_context)
        self.assertIn("data sensitivity is none_public", edited_context)
        self.assertIn("availability requirement is best_effort", edited_context)


if __name__ == "__main__":
    unittest.main()
