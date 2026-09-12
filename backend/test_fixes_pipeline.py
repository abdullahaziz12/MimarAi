import os
import unittest
from unittest.mock import AsyncMock, patch, MagicMock

import main
from fastapi import HTTPException
from fastapi.testclient import TestClient


class TestPipelineFlawsFixes(unittest.TestCase):
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

    def tearDown(self):
        main.app.dependency_overrides.clear()

    # FIX 3 TESTS: Distinguishable responses for draft listing
    def test_get_drafts_storage_unavailable(self):
        with patch.object(main, "get_supabase", return_value=None):
            resp = self.client.get("/api/projects/drafts", headers=self.auth_headers)
            self.assertEqual(resp.status_code, 503)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "storage_unavailable")
            self.assertIn("unavailable", data["message"].lower())

    def test_get_drafts_db_exception(self):
        failing_client = MagicMock()
        failing_client.table.side_effect = Exception("Supabase DB connection dropped")

        with patch.object(main, "get_supabase", return_value=failing_client):
            resp = self.client.get("/api/projects/drafts", headers=self.auth_headers)
            self.assertEqual(resp.status_code, 500)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "internal_error")
            self.assertEqual(data["message"], "Failed to fetch draft projects.")

    def test_get_drafts_healthy_empty_list(self):
        mock_result = MagicMock()
        mock_result.data = []
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.execute.return_value = mock_result

        mock_supabase = MagicMock()
        mock_supabase.table.return_value = mock_query

        with patch.object(main, "get_supabase", return_value=mock_supabase):
            resp = self.client.get("/api/projects/drafts", headers=self.auth_headers)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json(), {"drafts": []})

    # FIX 4 & STATUS UPDATE ERROR TESTS
    def test_update_project_status_failure(self):
        mock_supabase = MagicMock()
        mock_project_result = MagicMock()
        mock_project_result.data = [{"id": "11111111-1111-4111-8111-111111111111", "owner_id": self.mock_user["user_id"]}]
        
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value = mock_project_result
        mock_query.update.side_effect = Exception("DB update lock timeout")
        mock_supabase.table.return_value = mock_query

        with patch.object(main, "get_supabase", return_value=mock_supabase):
            resp = self.client.post(
                "/api/projects/11111111-1111-4111-8111-111111111111/status",
                headers=self.auth_headers,
                json={"status": "generating", "fixed_inputs": {"stack": "nextjs"}}
            )
            self.assertEqual(resp.status_code, 500)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "internal_error")
            self.assertIn("Failed to update project status", data["message"])

    # FIX 5 TESTS: Uniform Error Response Shapes
    def test_error_shape_401_auth_failure(self):
        main.app.dependency_overrides.clear()
        resp = self.client.get("/api/projects/drafts")
        self.assertEqual(resp.status_code, 401)
        data = resp.json()
        self.assertEqual(data["status"], "error")
        self.assertEqual(data["error_type"], "unauthorized")
        self.assertTrue(len(data["message"]) > 0)

    def test_error_shape_400_bad_request(self):
        mock_supabase = MagicMock()
        with patch.object(main, "get_supabase", return_value=mock_supabase):
            resp = self.client.post(
                "/api/interview/classify",
                headers=self.auth_headers,
                json={"project_id": "invalid-uuid", "idea_text": "An idea"}
            )
            self.assertEqual(resp.status_code, 400)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "bad_request")
            self.assertIn("Invalid project ID", data["message"])

    def test_error_shape_404_not_found(self):
        mock_result = MagicMock()
        mock_result.data = []
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value = mock_result
        mock_supabase = MagicMock()
        mock_supabase.table.return_value = mock_query

        with patch.object(main, "get_supabase", return_value=mock_supabase):
            resp = self.client.get(
                "/api/projects/22222222-2222-4222-8222-222222222222/comments",
                headers=self.auth_headers
            )
            self.assertEqual(resp.status_code, 404)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "not_found")
            self.assertEqual(data["message"], "Project not found")

    def test_error_shape_422_validation_error(self):
        resp = self.client.post(
            "/api/projects/11111111-1111-4111-8111-111111111111/comments",
            headers=self.auth_headers,
            json={"invalid_field_without_text": 123}
        )
        self.assertEqual(resp.status_code, 422)
        data = resp.json()
        self.assertEqual(data["status"], "error")
        self.assertEqual(data["error_type"], "validation_error")

    def test_error_shape_429_rate_limit(self):
        mock_project = {"id": "11111111-1111-4111-8111-111111111111", "owner_id": self.mock_user["user_id"], "status": "locked_generating"}
        mock_supabase = MagicMock()
        with patch.object(main, "get_supabase", return_value=mock_supabase), \
             patch.object(main, "get_owned_project", return_value=mock_project):
            resp = self.client.post(
                f"/api/projects/{mock_project['id']}/generate",
                headers=self.auth_headers,
                json={"idea_text": "Building a platform", "fixed_inputs": {"stack": "React", "database": "Postgres", "deployment": "Vercel", "apis": "Stripe"}}
            )
            self.assertEqual(resp.status_code, 429)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "rate_limit_exceeded")
            self.assertIn("already in progress", data["message"])

    def test_error_shape_500_missing_config(self):
        mock_project = {"id": "11111111-1111-4111-8111-111111111111", "owner_id": self.mock_user["user_id"], "status": "draft"}
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        with patch.object(main, "get_supabase", return_value=mock_supabase), \
             patch.object(main, "get_owned_project", return_value=mock_project), \
             patch.dict(os.environ, {"GROQ_API_KEY": ""}):
            resp = self.client.post(
                "/api/interview/classify",
                headers=self.auth_headers,
                json={"project_id": mock_project["id"], "idea_text": "I want something cool for my friends"}
            )
            self.assertEqual(resp.status_code, 500)
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["error_type"], "config_error")
            self.assertIn("unconfigured", data["message"])

    def test_error_shape_502_provider_failure(self):
        mock_project = {"id": "11111111-1111-4111-8111-111111111111", "owner_id": self.mock_user["user_id"], "status": "draft"}
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        
        class FailingAsyncClient:
            def __init__(self, *args, **kwargs):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def post(self, *args, **kwargs):
                raise Exception("Provider network down")

        with patch.object(main, "get_supabase", return_value=mock_supabase), \
             patch.object(main, "get_owned_project", return_value=mock_project), \
             patch.dict(os.environ, {"GROQ_API_KEY": "dummy_key"}), \
             patch.object(main.httpx, "AsyncClient", FailingAsyncClient):
            resp = self.client.post(
                "/api/interview/classify",
                headers=self.auth_headers,
                json={"project_id": mock_project["id"], "idea_text": "I want something cool for my friends"}
            )
            self.assertIn(resp.status_code, [500, 502])
            data = resp.json()
            self.assertEqual(data["status"], "error")
            self.assertIn(data["error_type"], ["provider_error", "internal_error"])


if __name__ == "__main__":
    unittest.main()
