import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from backend import main


class DiagnosticFailOpenPathTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.project_id = "33333333-3333-4333-8333-333333333333"
        self.user = {
            "user_id": "diagnostic-user",
            "email": "diagnostic@example.com",
            "token": "diagnostic-token",
        }
        self.headers = {"Authorization": "Bearer diagnostic-token"}

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_confirm_without_generated_attempt_fails_closed(
        self, mock_get_owned, mock_supabase, mock_user
    ):
        mock_user.return_value = self.user
        mock_supabase.return_value = MagicMock()
        mock_get_owned.return_value = {
            "id": self.project_id,
            "owner_id": self.user["user_id"],
            "idea_text": "A clinic scheduling application.",
            "lightweight_draft": {"attempts": []},
        }

        response = self.client.post(
            f"/api/projects/{self.project_id}/lightweight-draft/respond",
            headers=self.headers,
            json={"response": "confirmed", "attempt": 1},
        )

        self.assertEqual(response.status_code, 409)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json", new_callable=AsyncMock)
    async def test_clarifying_persistence_failure_does_not_report_success(
        self, mock_groq, mock_get_owned, mock_supabase, mock_user
    ):
        mock_user.return_value = self.user
        mock_get_owned.return_value = {
            "id": self.project_id,
            "owner_id": self.user["user_id"],
            "idea_text": "A clinic scheduling application.",
            "density_flags": {"clarifying_questions": "full"},
        }
        mock_groq.return_value = {"questions": ["How are appointment conflicts resolved?"]}
        client = MagicMock()
        client.table.return_value.insert.return_value.execute.side_effect = RuntimeError(
            "simulated persistence failure"
        )
        mock_supabase.return_value = client

        response = self.client.post(
            f"/api/projects/{self.project_id}/clarifying-questions",
            headers=self.headers,
            json={
                "idea_text": "A clinic scheduling application.",
                "density_flags": {"clarifying_questions": "full"},
            },
        )

        self.assertIn(response.status_code, (500, 502, 503))

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase", return_value=None)
    async def test_admin_users_storage_failure_does_not_report_success(
        self, mock_supabase, mock_user
    ):
        mock_user.return_value = {
            "user_id": "admin-user",
            "email": "abdullahazizgujjar009@gmail.com",
            "token": "diagnostic-token",
        }

        with self.assertRaises(main.HTTPException) as exc:
            await main.admin_users(mock_user.return_value)

        self.assertEqual(exc.exception.status_code, 503)

    async def test_step0_state_persistence_failure_is_reported(self):
        client = MagicMock()
        client.table.return_value.update.return_value.eq.return_value.execute.side_effect = RuntimeError(
            "simulated Step 0 persistence failure"
        )

        with self.assertRaises(main.HTTPException) as exc:
            main._update_project_step0_state(
                client,
                self.project_id,
                {"label": "READY"},
                {},
            )

        self.assertEqual(exc.exception.status_code, 502)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_groq_json", new_callable=AsyncMock)
    async def test_contradiction_persistence_failure_is_reported(
        self, mock_groq, mock_get_owned, mock_supabase, mock_user
    ):
        mock_user.return_value = self.user
        mock_get_owned.return_value = {"id": self.project_id, "step0_state": {}}
        mock_groq.return_value = {"contradiction": False}
        client = MagicMock()
        client.table.return_value.insert.return_value.execute.side_effect = RuntimeError(
            "simulated contradiction persistence failure"
        )
        mock_supabase.return_value = client

        response = self.client.post(
            f"/api/projects/{self.project_id}/contradiction-scan",
            headers=self.headers,
            json={"idea_text": "A clinic scheduling application."},
        )

        self.assertEqual(response.status_code, 502)

    @patch.object(main, "get_current_user")
    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    async def test_clarifying_answer_persistence_failure_is_reported(
        self, mock_get_owned, mock_supabase, mock_user
    ):
        mock_user.return_value = self.user
        mock_get_owned.return_value = {"id": self.project_id, "step0_state": {}}
        client = MagicMock()
        client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.side_effect = RuntimeError(
            "simulated answer persistence failure"
        )
        mock_supabase.return_value = client

        response = self.client.post(
            f"/api/projects/{self.project_id}/clarifying-questions/answer",
            headers=self.headers,
            json={"answers": [{"question_id": "11111111-1111-4111-8111-111111111111", "answer": "Only staff can book."}]},
        )

        self.assertEqual(response.status_code, 502)

    async def test_admin_success_rate_query_failure_is_reported(self):
        client = MagicMock()
        client.table.return_value.select.return_value.gte.return_value.order.return_value.execute.side_effect = RuntimeError(
            "simulated analytics query failure"
        )
        with patch.object(main, "get_supabase", return_value=client):
            with self.assertRaises(main.HTTPException) as exc:
                await main.admin_success_rate("7d", self.user)

        self.assertEqual(exc.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
